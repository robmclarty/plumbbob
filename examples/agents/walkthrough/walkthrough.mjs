/**
 * walkthrough: a PlumbBob after-slot agent that looks at the running app.
 *
 * Given the address of a running app (or a command that starts one), it
 * drives that app through the Playwright MCP server, walks what the step's
 * title and proof say should be true, and reports whether what it saw matches.
 * The model reads each page as Playwright's text snapshot; the screenshots are
 * for the person, returned as `evidence[]`.
 *
 * Config rides the settings ladder as `agentConfig.walkthrough`, which the CLI
 * forwards as `ctx.settings.agent`:
 *
 *   url             the running app (required)
 *   provider        ollama | openai | anthropic | openrouter (required)
 *   model           the model id, sent to the provider as written (required)
 *   baseUrl         the provider's address, for Ollama or an OpenAI-compatible server
 *   browser         a Playwright MCP browser name, when its default is not wanted
 *   start           a shell command that starts the app, run when the url does not answer
 *   readySeconds    how long a started app has to answer, 30 unless set
 *   maxTurns        the turn cap, 30 unless set
 *   timeoutSeconds  the wall-clock cap, 240 unless set
 *
 * Keys never ride settings. They are read from the environment:
 * OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY.
 *
 * `start` is a shell string from settings, run through `sh` at the repo root:
 * the same trust as the `check` command. The app it starts lives in a process
 * group of its own, and that group is taken down however the run ends: on a
 * clean end, on SIGTERM, SIGINT, SIGHUP or SIGQUIT, and, through the
 * supervisor in supervise.mjs, on a SIGKILL of this process.
 *
 * The contract (docs/agents.md): StepContext JSON on stdin, one envelope on
 * stdout, narration on stderr, exit 0 when the envelope is authoritative.
 * fascicle's `run_stdio` owns that, so this file never writes to stdout.
 * The walk is in walk.mjs, the app's process is in app.mjs and supervise.mjs,
 * and the pure parts are in lib.mjs.
 */

import { answers, startApp } from './app.mjs'
import {
  CONTRACT,
  blockedEnvelope,
  hasCredentials,
  parseStartUrl,
  readConfig,
  scrub,
  startBlocked,
  withAppLine,
  withoutCredentials,
} from './lib.mjs'

const AGENT_DIR = import.meta.dirname

// Each provider's key comes from one of these, and from nowhere else.
const KEY_ENV = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openrouter: 'OPENROUTER_API_KEY' }

/**
 * The key values this run can see in the environment. They are cut out of
 * every line the agent prints and every error it reports.
 */
function secrets() {
  return Object.values(KEY_ENV)
    .map((name) => fromEnv(name))
    .filter((value) => value !== undefined)
}

/**
 * Narrates one line on stderr, with no key in it.
 */
function log(message) {
  process.stderr.write(`walkthrough: ${scrub(message, secrets())}\n`)
}

/**
 * Reads the first non-blank value among the named environment variables.
 */
function fromEnv(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return undefined
}

/**
 * The Ollama provider: a local daemon on fascicle's native transport. The
 * preflight says when the daemon is down or the model is not pulled.
 */
function ollamaProvider(config) {
  const host = config.baseUrl ?? fromEnv('OLLAMA_HOST', 'OLLAMA_BASE_URL') ?? 'http://localhost:11434'
  const baseUrl = /^https?:\/\//.test(host) ? host : `http://${host}`
  return {
    engineProviders: { ollama: { base_url: baseUrl, transport: 'native' } },
    preflight: async () => {
      let tags
      try {
        const res = await fetch(new URL('/api/tags', baseUrl), { signal: AbortSignal.timeout(10_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        tags = await res.json()
      } catch {
        return `Ollama is not reachable at ${withoutCredentials(baseUrl)}. Start it (ollama serve), or point agentConfig.walkthrough.baseUrl at your server.`
      }
      const models = Array.isArray(tags.models) ? tags.models.map((m) => m.name) : []
      if (models.includes(config.model) || models.includes(`${config.model}:latest`)) return null
      return `The model ${config.model} is not pulled. Run: ollama pull ${config.model} (pulled now: ${models.join(', ') || 'none'}).`
    },
  }
}

/**
 * The OpenAI provider, which also reaches any server that speaks the Chat
 * Completions wire when `baseUrl` names one (LM Studio, vLLM, LiteLLM,
 * Ollama's /v1). A local server needs no key, so a placeholder is sent.
 */
function openaiProvider(config) {
  const key = fromEnv(KEY_ENV.openai) ?? (config.baseUrl ? 'none' : undefined)
  return {
    engineProviders: {
      openai: { api_key: key ?? '', transport: 'native', ...(config.baseUrl ? { base_url: config.baseUrl } : {}) },
    },
    preflight: async () => {
      if (key === undefined) return 'OPENAI_API_KEY is not set. Export it, or set agentConfig.walkthrough.baseUrl to an OpenAI-compatible server of your own.'
      if (config.baseUrl && !(await answers(config.baseUrl))) {
        return `Nothing answered at ${withoutCredentials(config.baseUrl)}. Start that server, or fix agentConfig.walkthrough.baseUrl.`
      }
      return null
    },
  }
}

/**
 * A hosted provider that needs a key from the environment and nothing else.
 */
function keyedProvider(name, envName) {
  return (config) => {
    const key = fromEnv(envName)
    return {
      engineProviders: {
        [name]: { api_key: key ?? '', transport: 'native', ...(config.baseUrl ? { base_url: config.baseUrl } : {}) },
      },
      preflight: async () => (key === undefined ? `${envName} is not set. Export it and run the agent again.` : null),
    }
  }
}

// One entry a provider, each on fascicle's native transport: the one tool loop
// every provider shares. Adding a provider is one more entry.
const PROVIDERS = {
  ollama: ollamaProvider,
  openai: openaiProvider,
  anthropic: keyedProvider('anthropic', KEY_ENV.anthropic),
  openrouter: keyedProvider('openrouter', KEY_ENV.openrouter),
}

/** How long a signalled run gets to unwind before the process exits anyway. */
const SIGNAL_GRACE_MS = 2000

// The signals that stop a run. fascicle's `run_stdio` aborts the run on the
// first two and knows nothing of the last two: a closed terminal sends
// SIGHUP, and Ctrl-\ sends SIGQUIT.
const ABORTING_SIGNALS = ['SIGTERM', 'SIGINT']
const ENDING_SIGNALS = ['SIGHUP', 'SIGQUIT']

const EXAMPLE_CONFIG =
  '{ "agentConfig": { "walkthrough": { "url": "http://localhost:3000", "provider": "ollama", "model": "qwen3:8b" } } }'

/**
 * Imports the dependencies lazily, so a missing install ends in a `blocked`
 * envelope with the line that fixes it, never a module crash.
 */
async function loadDeps() {
  try {
    const [fascicle, stdio, mcp, zod, walkModule] = await Promise.all([
      import('fascicle'),
      import('fascicle/stdio'),
      import('fascicle/mcp'),
      import('zod'),
      import('./walk.mjs'),
    ])
    return { fascicle, stdio, mcp, z: zod.z, walk: walkModule.walk }
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') return null
    throw err
  }
}

/**
 * Checks everything that can be checked before a browser starts, cheapest
 * first. Returns a `blocked` envelope, or the pieces the walk needs, with
 * `running` saying whether the app already answers. The app is not started
 * here: that waits until the model is known to be reachable.
 */
async function prepare(ctx) {
  const config = readConfig(ctx)
  if (config.url === undefined) {
    return {
      blocked: blockedEnvelope(
        'walkthrough has no url to open, so no walk was run.',
        `Start the app, then set agentConfig.walkthrough.url in .plumbbob/settings.json, for example: ${EXAMPLE_CONFIG}`
      ),
    }
  }
  const start = parseStartUrl(config.url)
  if (start === null && hasCredentials(config.url)) {
    return {
      blocked: blockedEnvelope(
        'walkthrough was given a url with a username or password in it, so no walk was run.',
        `This agent sends no credentials, and a url is printed wherever the walk is reported. Take the username and password out of agentConfig.walkthrough.url (without them it is "${withoutCredentials(config.url)}") and run the agent again.`
      ),
    }
  }
  if (start === null) {
    return {
      blocked: blockedEnvelope(
        'walkthrough was given a url it cannot open, so no walk was run.',
        `agentConfig.walkthrough.url must be an http or https address; it is "${withoutCredentials(config.url)}".`
      ),
    }
  }
  const wired = Object.keys(PROVIDERS).join(', ')
  if (config.provider === undefined || config.model === undefined) {
    return {
      blocked: blockedEnvelope(
        'walkthrough has no model to walk with, so no walk was run.',
        `Set agentConfig.walkthrough.provider (one of: ${wired}) and agentConfig.walkthrough.model, for example: ${EXAMPLE_CONFIG}`
      ),
    }
  }
  const factory = PROVIDERS[config.provider]
  if (factory === undefined) {
    return {
      blocked: blockedEnvelope(
        `walkthrough has no "${config.provider}" provider, so no walk was run.`,
        `Set agentConfig.walkthrough.provider to one of: ${wired}.`
      ),
    }
  }
  const running = await answers(start.url)
  if (!running && config.start === undefined) {
    return {
      blocked: blockedEnvelope(
        `walkthrough found nothing answering at ${start.url}, so no walk was run.`,
        'Start the app, or set agentConfig.walkthrough.start to the command that starts it; check agentConfig.walkthrough.url, and run the agent again.'
      ),
    }
  }
  const provider = factory(config)
  const obstacle = await provider.preflight()
  if (obstacle !== null) {
    return {
      blocked: blockedEnvelope(
        `walkthrough could not reach its model (${config.provider}, ${config.model}), so no walk was run.`,
        obstacle
      ),
    }
  }
  return { config, start, provider, running }
}

/**
 * Reads the StepContext, runs the walk and hands the envelope to `run_stdio`.
 */
async function main() {
  const deps = await loadDeps()
  if (deps === null) {
    process.stdout.write(
      `${JSON.stringify(
        blockedEnvelope(
          'walkthrough is missing its dependencies, so no walk was run.',
          `Run: cd "${AGENT_DIR}" && npm install`
        )
      )}\n`
    )
    return
  }

  const { create_engine, define_tool, step } = deps.fascicle
  const { z } = deps

  // Loose on purpose: only the contract number gates the run. The rest is
  // best-effort prose the CLI scraped, and a strict shape would wedge on it.
  const stepContextSchema = z.looseObject({ contract: z.literal(CONTRACT) })

  // `drift` is the one status the model can ask for, and lib.mjs grants it
  // only when both of the model's quotes are real.
  const envelopeSchema = z.object({
    contract: z.literal(CONTRACT),
    status: z.enum(['done', 'blocked', 'drift']),
    summary: z.string().min(1),
    body: z.string().optional(),
    notes: z.string().optional(),
    evidence: z.array(z.object({ path: z.string().min(1), caption: z.string().min(1) })).optional(),
  })

  // run_stdio's default trajectory is JSONL on stderr, aimed at machines. The
  // walk narrates its own actions in plain lines, so this one stays quiet.
  const trajectory = { record: () => {}, start_span: (name) => name, end_span: () => {} }

  const flow = step('walkthrough', async (ctx, run) => {
    const began = Date.now()
    const ready = await prepare(ctx)
    if (ready.blocked) {
      log(`${ready.blocked.summary} ${ready.blocked.notes}`)
      return ready.blocked
    }
    const { config, start, provider, running } = ready

    // The app, when this run starts it. A signal begins the teardown at once.
    // On SIGTERM and SIGINT that is beside fascicle's own handler, which
    // aborts the run; if the run has not unwound two seconds later the group
    // is killed and the process exits. Nothing aborts the run on SIGHUP or
    // SIGQUIT, so there the process exits as soon as the app is stopped, and
    // an app still coming up goes with it through `startApp`'s exit hook.
    const owned = { app: null }
    const exitNow = () => {
      owned.app?.killNow()
      process.exit(1)
    }
    const onAbortingSignal = () => {
      owned.app?.stop()
      setTimeout(exitNow, SIGNAL_GRACE_MS).unref()
    }
    const onEndingSignal = () => {
      setTimeout(exitNow, SIGNAL_GRACE_MS).unref()
      Promise.resolve(owned.app?.stop()).then(exitNow, exitNow)
    }
    for (const signal of ABORTING_SIGNALS) process.on(signal, onAbortingSignal)
    for (const signal of ENDING_SIGNALS) process.on(signal, onEndingSignal)

    let appLine = null
    try {
      if (config.start !== undefined && running) {
        appLine = `The app was already answering at ${start.url}, so the walk used it and the start command was not run.`
        log(`${start.url} already answers; not running the start command`)
      } else if (config.start !== undefined) {
        const readySeconds = Math.min(config.readySeconds, config.timeoutSeconds)
        log(`starting the app (${config.start}); waiting up to ${readySeconds} seconds for ${start.url}`)
        const app = await startApp({
          command: config.start,
          cwd: process.cwd(),
          url: start.url,
          readySeconds,
          abort: run.abort,
          secrets: secrets(),
        })
        if (!app.ok && app.why === 'aborted') throw new Error('the run was stopped while the app was starting')
        if (!app.ok) {
          const blocked = startBlocked(app, { command: config.start, url: start.url, readySeconds, secrets: secrets() })
          log(`${blocked.summary} ${blocked.notes}`)
          return blocked
        }
        owned.app = app
        log(`the app answers at ${start.url} (process group ${app.pid})`)
      }

      log(
        `walking step ${ctx.step?.n ?? '?'} at ${start.url} with ${config.provider}, ${config.model} (at most ${config.maxTurns} turns, ${config.timeoutSeconds} seconds)`
      )
      const engine = create_engine({ providers: provider.engineProviders })
      let envelope
      try {
        envelope = await deps.walk(
          {
            engine,
            call: { provider: config.provider, model: config.model },
            mcp_client: deps.mcp.mcp_client,
            define_tool,
            z,
          },
          {
            ctx,
            config,
            start,
            cwd: process.cwd(),
            agentDir: AGENT_DIR,
            abort: run.abort,
            log,
            secrets: secrets(),
            keyEnv: KEY_ENV[config.provider],
            // The wall clock covers the whole run, so what starting the app
            // cost comes out of it.
            budgetMs: Math.max(1000, config.timeoutSeconds * 1000 - (Date.now() - began)),
          }
        )
      } finally {
        await engine.dispose()
      }
      if (owned.app !== null) {
        const gone = await owned.app.stop()
        log(gone ? 'the app was stopped' : `the app could not be stopped; process group ${owned.app.pid} is still running`)
        appLine = gone
          ? 'The app was started by the start command and stopped when the walk ended.'
          : `The app was started by the start command and could not be stopped: process group ${owned.app.pid} is still running.`
      }
      return appLine === null ? envelope : withAppLine(envelope, appLine)
    } finally {
      // Every other way out: an error, a signal, an abort. `stop` runs once,
      // so on the clean path this is the same promise, already settled.
      await owned.app?.stop()
      for (const signal of ABORTING_SIGNALS) process.off(signal, onAbortingSignal)
      for (const signal of ENDING_SIGNALS) process.off(signal, onEndingSignal)
    }
  })

  await deps.stdio.run_stdio(flow, {
    input_schema: stepContextSchema,
    output_schema: envelopeSchema,
    trajectory,
  })
}

main().catch((err) => {
  // Setup failed before run_stdio could own the verdict: a failed run, with
  // stdout untouched.
  log(`failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
