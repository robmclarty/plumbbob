/**
 * The walk itself: start the Playwright MCP server, open the app, hand a model
 * five tools, and map what happened to an envelope.
 *
 * The model never talks to the MCP server. It calls the five tools defined
 * here, and each one checks its input, calls the server, reads the page back,
 * holds the browser to the configured origin and saves a screenshot under a
 * name this file chooses. The origin is read again before a picture is taken
 * and once more when the model stops, since a page can leave on a timer. That is where the security notes in the README are
 * kept: in code, with the system prompt saying the same thing a second time.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  SYSTEM_PROMPT,
  blockedEnvelope,
  browserInstallLine,
  buildEvidence,
  buildPrompt,
  existingShots,
  guardNavigate,
  isAuthFailure,
  isBrowserMissing,
  nextShotIndex,
  onOrigin,
  oneLine,
  pageUrlOf,
  safeEvidenceDir,
  scrub,
  shotName,
  splitTabs,
  walkEnvelope,
  wrapPage,
} from './lib.mjs'

/**
 * The only Playwright MCP tools this agent connects. `browser_evaluate`,
 * `browser_run_code_unsafe`, `browser_file_upload` and the rest are never
 * surfaced, so no code path here can reach them.
 */
export const MCP_TOOLS = [
  'browser_navigate',
  'browser_snapshot',
  'browser_click',
  'browser_type',
  'browser_take_screenshot',
]

/**
 * The flags Playwright MCP runs with. `--isolated` keeps the profile in
 * memory, `--image-responses omit` keeps pictures out of the model's context,
 * and `--snapshot-mode none` stops the server writing a snapshot file after
 * every action: the model's view is the text `browser_snapshot` returns
 * inline, which this agent asks for itself.
 *
 * `--output-dir` points at a scratch folder outside the repo. The server
 * keeps a console log for any page that writes one, and without the flag that
 * log lands in `.playwright-mcp/` under the repo root. The flag moves only
 * the files the server names itself: a snapshot still comes back inline, and
 * a screenshot still goes where this agent says.
 */
export function mcpArgs(config, scratchDir) {
  return [
    '--headless',
    '--isolated',
    '--image-responses',
    'omit',
    '--snapshot-mode',
    'none',
    '--output-dir',
    scratchDir,
    ...(config.browser ? ['--browser', config.browser] : []),
  ]
}

/**
 * Describes an error in one line, with every secret the run holds cut out of
 * it first.
 */
function detailOf(err, secrets = []) {
  const message = scrub(err instanceof Error ? err.message : String(err), secrets)
  return oneLine(message.replace(/^#+ Error\s*/, '').replace(/^Error: /, ''), 400)
}

/**
 * Walks the app and returns the output envelope.
 *
 * `deps` carries what the walk is built on, so a test can swap the model for
 * a scripted one: `{ engine, call, mcp_client, define_tool, z }`, where `call`
 * is the `{ provider, model }` handed to `engine.generate`. `options` is
 * `{ ctx, config, start, cwd, agentDir, abort, log, secrets, keyEnv }`: the
 * StepContext, the resolved config, the parsed start url, the directory
 * `step.evidenceDir` is relative to, this agent's own directory, the run's
 * abort signal, a function that narrates on stderr, the key values the run
 * read from the environment, and the name of the variable the provider's key
 * comes from.
 *
 * No error text reaches the envelope or the log with one of `secrets` in it,
 * and a refused credential is reported by the variable's name alone, since a
 * provider's own words for it may quote the key back.
 *
 * The browser and the MCP server are closed before this returns, whatever
 * happened in between.
 */
export async function walk(deps, options) {
  const { ctx, config, start, cwd, agentDir, log, keyEnv } = options
  const secrets = options.secrets ?? []
  const detail = (err) => detailOf(err, secrets)
  const evidenceDir = safeEvidenceDir(ctx?.step?.evidenceDir)
  const timer = new AbortController()
  const timeout = setTimeout(() => timer.abort(), config.timeoutSeconds * 1000)
  const abort = options.abort ? AbortSignal.any([options.abort, timer.signal]) : timer.signal
  const outerAborted = () => options.abort?.aborted === true

  const scratchDir = await mkdtemp(join(tmpdir(), 'plumbbob-walkthrough-'))
  let server
  try {
    server = await deps.mcp_client(
      {
        transport: 'stdio',
        command: process.execPath,
        args: [join(agentDir, 'node_modules', '@playwright', 'mcp', 'cli.js'), ...mcpArgs(config, scratchDir)],
        cwd,
      },
      { include: MCP_TOOLS, client_info: { name: 'plumbbob-walkthrough', version: '0.1.0' } }
    )
  } catch (err) {
    clearTimeout(timeout)
    await rm(scratchDir, { recursive: true, force: true }).catch(() => {})
    return blockedEnvelope(
      'walkthrough could not start the Playwright MCP server, so no walk was run.',
      `${detail(err)}. Run: cd "${agentDir}" && npm install`
    )
  }

  const byName = new Map(server.tools.map((tool) => [tool.name, tool]))
  const mcp = async (name, input) => {
    const out = await byName.get(name).execute(input, { abort, tool_call_id: 'walkthrough', step_index: 0 })
    return typeof out === 'string' ? out : JSON.stringify(out)
  }

  const shots = []
  const refusals = []
  let actions = 0
  let shotIndex = evidenceDir === null ? 1 : nextShotIndex(existingShots(cwd, evidenceDir))

  // Saves a screenshot under a name chosen here. A failure costs the picture
  // and nothing else.
  const shoot = async (label, caption) => {
    if (evidenceDir === null) return false
    const name = shotName(shotIndex, label)
    shotIndex += 1
    try {
      await mkdir(join(cwd, evidenceDir), { recursive: true })
      await mcp('browser_take_screenshot', { filename: `${evidenceDir}/${name}`, type: 'png', scale: 'css' })
      shots.push({ name, caption })
      return true
    } catch (err) {
      log(`could not save ${name} (${detail(err)})`)
      return false
    }
  }

  // Takes the tab list out of what the browser returned, and records each tab
  // outside the origin once. A tab's title is another page's text, so the
  // model is shown the page it is on and nothing about the tabs beside it.
  const tabsSeen = new Set()
  const pageOnly = (result) => {
    const { page, offOrigin } = splitTabs(result, start)
    for (const address of offOrigin) {
      if (tabsSeen.has(address)) continue
      tabsSeen.add(address)
      const tab = oneLine(address, 200)
      refusals.push(`a page opened ${tab} in another tab, outside ${start.origin}, and the model was not shown it`)
      log(`a tab opened on ${tab}, outside ${start.origin}; it is not shown to the model`)
    }
    return page
  }

  // Reads where the browser is. On the configured origin it returns the page;
  // anywhere else it records a refusal, takes the browser back to the start
  // url and returns that page with the words that say so.
  const settle = async () => {
    const page = pageOnly(await mcp('browser_snapshot', {}))
    if (onOrigin(pageUrlOf(page), start)) return { held: true, page }
    const left = oneLine(pageUrlOf(page) ?? 'an address the browser did not report', 200)
    refusals.push(`the page went to ${left}, outside ${start.origin}, so the walk went back to ${start.url}`)
    log(`left ${start.origin} for ${left}; going back`)
    await mcp('browser_navigate', { url: start.url })
    const back = pageOnly(await mcp('browser_snapshot', {}))
    if (!onOrigin(pageUrlOf(back), start)) throw new Error(`the browser could not get back to ${start.url}`)
    return {
      held: false,
      refused: [`Refused: that took the browser outside ${start.origin}. It is back on ${start.url}.`, wrapPage(back)].join('\n'),
    }
  }

  // Reads the page back after an action. A page outside the configured origin
  // is never shown to the model: the browser goes back to the start url and
  // the model is told its action was refused.
  const observe = async (label, caption) => {
    const at = await settle()
    if (!at.held) return at.refused
    if (label !== null) await shoot(label, caption)
    return wrapPage(at.page)
  }

  const { define_tool, z } = deps
  const tools = [
    define_tool({
      name: 'navigate',
      description: `Go to an address inside ${start.origin}; a path like /settings works. Returns the page as text.`,
      input_schema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        const guard = guardNavigate(url, start)
        if (!guard.ok) {
          refusals.push(guard.reason)
          log(`refused navigate: ${guard.reason}`)
          return `Refused: ${guard.reason}.`
        }
        log(`navigate ${guard.url}`)
        await mcp('browser_navigate', { url: guard.url })
        actions += 1
        const path = new URL(guard.url).pathname
        return observe(`navigate ${path}`, `after going to ${path}`)
      },
    }),
    define_tool({
      name: 'snapshot',
      description: 'Read the current page as text, with a ref for each element.',
      input_schema: z.object({}),
      read_only: true,
      execute: () => observe(null, ''),
    }),
    define_tool({
      name: 'click',
      description: 'Click an element. Returns the page as text afterwards.',
      input_schema: z.object({
        element: z.string().describe('what the element is, in a few words'),
        ref: z.string().describe('its ref from the latest snapshot, like e12'),
      }),
      execute: async ({ element, ref }) => {
        log(`click ${oneLine(element)}`)
        await mcp('browser_click', { element, target: ref })
        actions += 1
        return observe(`click ${element}`, `after clicking ${element}`)
      },
    }),
    define_tool({
      name: 'type',
      description: 'Type text into a field. Returns the page as text afterwards.',
      input_schema: z.object({
        element: z.string().describe('what the field is, in a few words'),
        ref: z.string().describe('its ref from the latest snapshot, like e12'),
        text: z.string(),
        submit: z.boolean().optional().describe('press Enter after typing'),
      }),
      execute: async ({ element, ref, text, submit }) => {
        log(`type into ${oneLine(element)}`)
        await mcp('browser_type', { element, target: ref, text, ...(submit ? { submit: true } : {}) })
        actions += 1
        return observe(`type ${element}`, `after typing into ${element}`)
      },
    }),
    define_tool({
      name: 'take_screenshot',
      description: 'Save a picture of the current page for the person reading your report.',
      input_schema: z.object({ caption: z.string().describe('what the picture shows, in a few words') }),
      read_only: true,
      execute: async ({ caption }) => {
        if (evidenceDir === null) return 'This step has no evidence folder, so nothing was saved.'
        // A page can leave the origin on a timer, after the last action was
        // read back, so where the browser is gets read again before a picture.
        const at = await settle()
        if (!at.held) return at.refused
        const saved = await shoot(`shot ${caption}`, caption)
        return saved ? 'Saved.' : 'The screenshot could not be saved.'
      },
    }),
  ]

  try {
    let first
    try {
      log(`opening ${start.url}`)
      await mcp('browser_navigate', { url: start.url })
      first = pageOnly(await mcp('browser_snapshot', {}))
    } catch (err) {
      if (outerAborted()) throw err
      const said = detail(err)
      if (isBrowserMissing(said)) {
        return blockedEnvelope(
          'walkthrough has no browser to drive, so no walk was run.',
          `Run: ${browserInstallLine(said, agentDir)} (Playwright MCP said: ${said})`
        )
      }
      return blockedEnvelope(
        `walkthrough could not open ${start.url}, so no walk was run.`,
        timer.signal.aborted
          ? `The browser did not open the page within ${config.timeoutSeconds} seconds. Check the app, or raise agentConfig.walkthrough.timeoutSeconds.`
          : `${said}. Start the app, check agentConfig.walkthrough.url, and run the agent again.`
      )
    }
    if (!onOrigin(pageUrlOf(first), start)) {
      return blockedEnvelope(
        `walkthrough opened ${start.url} and landed somewhere else, so no walk was run.`,
        `The browser ended on ${oneLine(pageUrlOf(first) ?? 'an address it did not report', 200)}, outside ${start.origin}. Point agentConfig.walkthrough.url at a page that stays on its own origin.`
      )
    }
    await shoot('start', 'the page the walk opened on')

    let finalText = ''
    let ending = 'stop'
    try {
      const result = await deps.engine.generate({
        provider: deps.call.provider,
        model: deps.call.model,
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(ctx, start, first),
        tools,
        max_steps: config.maxTurns,
        max_tool_calls_per_step: 1,
        tool_call_repair_attempts: 2,
        abort,
      })
      finalText = typeof result.content === 'string' ? result.content : ''
      if (result.finish_reason === 'max_steps') ending = 'turns'
    } catch (err) {
      if (outerAborted()) throw err
      if (!timer.signal.aborted) {
        return blockedEnvelope(
          `walkthrough lost its model (${deps.call.provider}, ${deps.call.model}) before the walk finished.`,
          isAuthFailure(err)
            ? `The provider refused the key. Check ${keyEnv ?? 'the key this provider reads from the environment'}, then run the agent again.`
            : `${detail(err)}. Check the provider, the model name and its key, then run the agent again.`
        )
      }
      ending = 'time'
    }
    // The model has stopped, and the page may have moved since its last
    // action was read back. A walk that ended off the origin carries a
    // refusal, so it cannot read as a clean match.
    if (ending !== 'time') {
      try {
        await settle()
      } catch (err) {
        if (outerAborted()) throw err
        refusals.push(`the walk could not read where the browser ended (${detail(err)})`)
      }
    }
    log(`the walk ended (${ending}) after ${actions} ${actions === 1 ? 'action' : 'actions'}`)
    return walkEnvelope({ finalText, ending, actions, refusals }, buildEvidence(cwd, evidenceDir, shots), config)
  } finally {
    clearTimeout(timeout)
    await server.close().catch((err) => log(`closing the browser failed (${detail(err)})`))
    // The scratch folder is this run's own, made above under the system's
    // temporary directory; nothing of the person's is in it.
    await rm(scratchDir, { recursive: true, force: true }).catch(() => {})
  }
}
