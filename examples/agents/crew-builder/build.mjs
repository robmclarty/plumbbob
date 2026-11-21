/**
 * crew-builder — a PlumbBob build-slot agent: a crew of models authors a
 * step's diff, inside the step's seam, and one candidate is kept.
 *
 * Everything that shapes a run is read from this agent's own block of the
 * settings ladder, `agentConfig.crew-builder`, with an env override under it
 * and a default as the floor:
 *
 *   provider     ollama (default) | claude_cli
 *   model        the model that writes          (qwen2.5-coder:7b | sonnet)
 *   judgeModel   the model that judges/critiques (defaults to `model`)
 *   baseUrl      the Ollama server              (http://localhost:11434)
 *   flow         auto (default) | single | proof | tournament | adversarial
 *   candidates   how many candidates a crew writes, 1 to 5   (3)
 *   rounds       the round limit for a critic's loop or a repair, 1 to 5 (2)
 *   proofTimeout seconds one run of the proof command may take (120)
 *   callTimeout  seconds one model call may take               (240)
 *
 * The flows, each one fascicle composite:
 *
 *   single       one candidate, written to the tree.
 *   proof        N candidates; each is written in turn, the step's proof
 *                command is run against it, and the first to pass is kept
 *                (`ensemble`, scored by the command's exit code). When none
 *                passes, the best goes back to the builder with the
 *                command's output, to the round limit (`adversarial`, with
 *                the command as the critic).
 *   tournament   N candidates; a judge model picks pairwise (`tournament`).
 *   adversarial  a builder and a critic, to a round limit (`adversarial`).
 *   auto         proof when the step's proof opens on a command, else
 *                tournament: a measured pick beats a judged one.
 *
 * The contract (docs/agents.md): StepContext JSON on stdin, exactly one
 * envelope JSON on stdout, narration on stderr. fascicle's `run_stdio` owns
 * that, so this file never touches stdout. The agent's working directory is
 * the repo root, and it writes only paths the step's seam covers: a path a
 * model names outside the seam is dropped and named in the envelope. It runs
 * no git command that changes anything and no plumbbob verb; the host model
 * still runs the verify tick, and the checkpoint is still the human's.
 *
 * Anticipated obstacles (provider unreachable, model not pulled, deps not
 * installed, a step with no seam) are `blocked` envelopes on exit 0. A proof
 * that still fails is NOT one: the best candidate stays written and the
 * envelope says the proof is red, since the verify tick is where red is read.
 */

import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, normalize } from 'node:path'
import { promisify } from 'node:util'

const CONTRACT = 1
const NAME = 'crew-builder'

// What the models are shown of the seam. A local model's window is small, so
// the files are capped in count and in bytes, and the envelope says so.
const FILE_BYTE_CAP = 24_000
const CONTEXT_BYTE_CAP = 60_000
const DIR_FILE_CAP = 12

// How much of a failed proof's output a model is shown on a repair round.
const PROOF_TAIL_LINES = 60
const PROOF_TAIL_BYTES = 4000

const FLOWS = ['auto', 'single', 'proof', 'tournament', 'adversarial']

const execFileAsync = promisify(execFile)

function log(message) {
  process.stderr.write(`${NAME}: ${message}\n`)
}

// --- read precedence: settings.agent.<key> → env → default -------------------

function fromSettings(ctx, key) {
  const value = ctx?.settings?.agent?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function fromEnv(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return undefined
}

function setting(ctx, key, env, fallback) {
  return fromSettings(ctx, key) ?? fromEnv(env) ?? fallback
}

/** A whole number setting, held inside [min, max]; anything else is the fallback. */
function count(ctx, key, env, fallback, min, max) {
  const n = Number(setting(ctx, key, env, String(fallback)))
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback
}

// --- providers ---------------------------------------------------------------
//
// A provider is a descriptor, as in ../reviewer: how to configure the engine,
// what to call, how to hold a model to a schema, and how to preflight. Adding
// one is one more entry in PROVIDERS.

function ollamaProvider(ctx) {
  const model = setting(ctx, 'model', 'PB_CREW_MODEL', 'qwen2.5-coder:7b')
  const judgeModel = setting(ctx, 'judgeModel', 'PB_CREW_JUDGE_MODEL', model)
  const baseUrl = fromSettings(ctx, 'baseUrl') ?? fromEnv('OLLAMA_HOST', 'OLLAMA_BASE_URL') ?? 'http://localhost:11434'
  return {
    label: `ollama · ${model} @ ${baseUrl}`,
    // 'native' keeps the AI-SDK peers out of this package's deps.
    engineProviders: { ollama: { base_url: baseUrl, transport: 'native' } },
    provider: 'ollama',
    model,
    judgeModel,
    // The native transport sends no schema of its own; Ollama's `format` takes
    // a JSON Schema and constrains the decode to it. The temperature rides in
    // Ollama's own `options`, beside a window wide enough for the seam.
    callOptions: (jsonSchema, temperature) => ({
      provider_options: { ollama: { format: jsonSchema, options: { temperature, num_ctx: 16_384 } } },
    }),
    preflight: async () => {
      let tags
      try {
        const res = await fetch(new URL('/api/tags', baseUrl))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        tags = await res.json()
      } catch {
        return `Ollama is not reachable at ${baseUrl}. Start it (ollama serve), or point OLLAMA_HOST or agentConfig.${NAME}.baseUrl at your server.`
      }
      const pulled = Array.isArray(tags.models) ? tags.models.map((m) => m.name) : []
      const missing = [...new Set([model, judgeModel])].filter((m) => !pulled.includes(m))
      if (missing.length > 0) {
        return `model ${missing.join(', ')} is not pulled. Run: ollama pull ${missing[0]} (or set agentConfig.${NAME}.model to one of: ${pulled.join(', ') || 'none pulled yet'})`
      }
      return null
    },
  }
}

function claudeCliProvider(ctx) {
  const model = setting(ctx, 'model', 'PB_CREW_MODEL', 'sonnet')
  const judgeModel = setting(ctx, 'judgeModel', 'PB_CREW_JUDGE_MODEL', model)
  const binary = setting(ctx, 'binary', 'PB_CREW_CLAUDE_BINARY', 'claude')
  return {
    label: `claude_cli · ${model} (logged-in session)`,
    engineProviders: { claude_cli: { auth_mode: 'oauth', binary } },
    provider: 'claude_cli',
    model,
    judgeModel,
    // The CLI takes the schema itself, and has no temperature to set.
    callOptions: () => ({}),
    preflight: async () => {
      try {
        await execFileAsync(binary, ['--version'], { timeout: 10_000 })
        return null
      } catch (err) {
        if (err?.code === 'ENOENT') {
          return `the \`${binary}\` CLI is not on PATH. Install Claude Code, or set agentConfig.${NAME}.provider to "ollama" for a local model.`
        }
        return `\`${binary} --version\` failed (${err instanceof Error ? err.message : String(err)}).`
      }
    },
  }
}

const PROVIDERS = { ollama: ollamaProvider, claude_cli: claudeCliProvider }
const DEFAULT_PROVIDER = 'ollama'

// --- the seam ----------------------------------------------------------------
//
// A seam entry is an exact repo-relative path or a `dir/` grant, never a glob
// (docs/agents.md). The same two shapes decide what a model is shown and what
// it may write.

function seamEntries(ctx) {
  const seam = ctx?.step?.seam
  return Array.isArray(seam) ? seam.filter((s) => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim().replace(/^\.\//, '')) : []
}

/** The path as the seam would name it, or null for one that leaves the repo. */
function repoRelative(path) {
  if (typeof path !== 'string' || path.trim().length === 0) return null
  // A model given a working directory often answers with the absolute path.
  const root = `${process.cwd()}/`
  const given = path.trim()
  const clean = normalize(given.startsWith(root) ? given.slice(root.length) : given).replace(/^\.\//, '')
  if (clean.startsWith('/') || clean === '..' || clean.startsWith('../') || clean.endsWith('/')) return null
  return clean
}

function inSeam(path, seam) {
  return seam.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry))
}

/** The files a seam names today: each exact path, and what git knows under each grant. */
async function seamFiles(seam) {
  const paths = []
  let capped = false
  for (const entry of seam) {
    if (!entry.endsWith('/')) {
      paths.push(entry)
      continue
    }
    const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', entry], { maxBuffer: 4 * 1024 * 1024 }).catch(() => ({ stdout: '' }))
    const under = stdout.split('\n').filter(Boolean)
    if (under.length > DIR_FILE_CAP) capped = true
    paths.push(...under.slice(0, DIR_FILE_CAP))
  }
  return { paths: [...new Set(paths)], capped }
}

async function readOrNull(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/** One fenced block per file, inside the byte caps; `truncated` says a cap was hit. */
async function showFiles(paths) {
  const blocks = []
  let used = 0
  let truncated = false
  for (const path of paths) {
    const content = await readOrNull(path)
    if (content === null) {
      blocks.push(`### ${path}\n\n(does not exist yet)`)
      continue
    }
    const room = Math.min(FILE_BYTE_CAP, CONTEXT_BYTE_CAP - used)
    if (room <= 0) {
      truncated = true
      break
    }
    if (content.length > room) truncated = true
    const shown = content.slice(0, room)
    used += shown.length
    blocks.push(`### ${path}\n\n\`\`\`\n${shown}\n\`\`\``)
  }
  return { text: blocks.join('\n\n'), truncated }
}

// --- prompts -----------------------------------------------------------------

const BUILD_SYSTEM = [
  'You are a careful programmer implementing ONE step of a plan that is already decided.',
  'Return every file you create or change as its COMPLETE new content, never a diff or a fragment.',
  'Change only what the step needs. Follow the decisions and constraints as written; do not relitigate them.',
  'You may write only the paths listed under "The seam". Any other path is refused.',
  'Do not use tools and do not write files yourself: your answer is the files, and the caller writes them.',
  'Name each path relative to the repo root, as the seam does.',
].join(' ')

function list(lines, label, items) {
  if (Array.isArray(items) && items.length > 0) lines.push('', `${label}:`, ...items.map((s) => `- ${s}`))
}

function buildPrompt(ctx, seam, files, like) {
  const step = ctx.step ?? {}
  const lines = [`Step ${step.n ?? '?'}: ${step.title ?? '(untitled)'}`]
  const proof = step.proof?.text ?? step.doneWhen
  if (proof) lines.push(`Proof (what shows the step is done): ${proof}`)
  list(lines, 'The seam (the only paths you may write; a path ending in / is a folder you may write under)', seam)
  list(lines, 'Decisions already made', ctx.decisions)
  list(lines, 'Constraints', ctx.constraints)
  list(lines, 'Context from earlier agents', ctx.context)
  if (like.text.length > 0) lines.push('', 'Files to copy the pattern from (read them; do not write them):', '', like.text)
  lines.push('', 'The files under the seam as they are now:', '', files.text.length > 0 ? files.text : '(none exist yet)')
  return lines.join('\n')
}

/** The same candidate, as a judge or a critic reads it. */
function showCandidate(candidate) {
  return candidate.files.map((f) => `### ${f.path}\n\n\`\`\`\n${f.content.slice(0, FILE_BYTE_CAP)}\n\`\`\``).join('\n\n') || '(no files)'
}

/**
 * A later attempt laid over an earlier one: a model asked to fix one file
 * often returns that file alone, and the rest of the attempt still stands.
 */
function over(prior, next) {
  if (prior === undefined) return next
  const named = new Set(next.files.map((f) => f.path))
  return { ...next, files: [...prior.files.filter((f) => !named.has(f.path)), ...next.files] }
}

// --- the working tree --------------------------------------------------------

/** Write a candidate's files; return what was there before, for `restore`. */
async function apply(candidate) {
  const before = []
  for (const file of candidate.files) {
    before.push({ path: file.path, content: await readOrNull(file.path) })
    await mkdir(dirname(file.path), { recursive: true })
    await writeFile(file.path, file.content)
  }
  return before
}

async function restore(before) {
  for (const file of before) {
    if (file.content === null) await rm(file.path, { force: true })
    else await writeFile(file.path, file.content)
  }
}

/** Run the step's proof command at the repo root; its exit code is the answer. */
async function runProof(command, timeoutSeconds) {
  try {
    await execFileAsync('sh', ['-c', command], { timeout: timeoutSeconds * 1000, maxBuffer: 16 * 1024 * 1024 })
    return { passed: true, tail: '' }
  } catch (err) {
    const out = `${typeof err?.stdout === 'string' ? err.stdout : ''}${typeof err?.stderr === 'string' ? err.stderr : ''}`
    return { passed: false, tail: out.trim().split('\n').slice(-PROOF_TAIL_LINES).join('\n').slice(-PROOF_TAIL_BYTES) }
  }
}

// --- narration ---------------------------------------------------------------

function stderrTrajectory() {
  return {
    record: () => {},
    start_span: (name) => {
      log(`… ${name}`)
      return name
    },
    end_span: () => {},
  }
}

async function loadDeps() {
  try {
    const [fascicle, stdio, zod] = await Promise.all([import('fascicle'), import('fascicle/stdio'), import('zod')])
    return { fascicle, stdio, z: zod.z }
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') return null
    throw err
  }
}

function blocked(summary, notes) {
  log(notes)
  return { contract: CONTRACT, status: 'blocked', summary, notes }
}

// --- main --------------------------------------------------------------------

async function main() {
  const deps = await loadDeps()
  if (deps === null) {
    process.stdout.write(
      `${JSON.stringify({
        contract: CONTRACT,
        status: 'blocked',
        summary: `${NAME} is missing its dependencies, so nothing was built.`,
        notes: "run: npm install (in the agent's own directory, the one holding build.mjs)",
      })}\n`
    )
    return
  }

  const { create_engine, step, run, ensemble, tournament, adversarial } = deps.fascicle
  const { run_stdio } = deps.stdio
  const { z } = deps

  const stepContextSchema = z.looseObject({ contract: z.literal(CONTRACT) })
  const envelopeSchema = z.object({
    contract: z.literal(CONTRACT),
    status: z.enum(['done', 'blocked', 'drift']),
    summary: z.string().min(1),
    body: z.string().optional(),
    parked: z.array(z.string().min(1)).optional(),
    notes: z.string().optional(),
  })

  const candidateSchema = z.object({
    summary: z.string(),
    files: z.array(z.object({ path: z.string(), content: z.string() })),
  })
  const verdictSchema = z.object({ winner: z.enum(['a', 'b']), reason: z.string() })
  const critiqueSchema = z.object({ accept: z.boolean(), notes: z.string() })
  const jsonSchemaOf = (schema) => {
    const { $schema: _schema, $id: _id, ...rest } = z.toJSONSchema(schema)
    return rest
  }

  const trajectory = stderrTrajectory()

  const flow = step('build', async (ctx) => {
    // -- what was asked for
    const providerName = setting(ctx, 'provider', 'PB_CREW_PROVIDER', DEFAULT_PROVIDER)
    const factory = PROVIDERS[providerName]
    if (factory === undefined) {
      const wired = Object.keys(PROVIDERS).join(', ')
      return blocked(`${NAME} has no '${providerName}' provider wired, so nothing was built.`, `Set agentConfig.${NAME}.provider to one of: ${wired}.`)
    }
    const provider = factory(ctx)
    const asked = setting(ctx, 'flow', 'PB_CREW_FLOW', 'auto')
    if (!FLOWS.includes(asked)) {
      return blocked(`${NAME} knows no '${asked}' flow, so nothing was built.`, `Set agentConfig.${NAME}.flow to one of: ${FLOWS.join(', ')}.`)
    }
    const command = typeof ctx.step?.proof?.command === 'string' && ctx.step.proof.command.trim().length > 0 ? ctx.step.proof.command : null
    // `proof` with no command to run has nothing to score by, so it is judged.
    const flowName = asked === 'auto' || (asked === 'proof' && command === null) ? (command === null ? 'tournament' : 'proof') : asked
    const candidates = count(ctx, 'candidates', 'PB_CREW_CANDIDATES', 3, 1, 5)
    const rounds = count(ctx, 'rounds', 'PB_CREW_ROUNDS', 2, 1, 5)
    const proofTimeout = count(ctx, 'proofTimeout', 'PB_CREW_PROOF_TIMEOUT', 120, 5, 1800)
    const callTimeout = count(ctx, 'callTimeout', 'PB_CREW_CALL_TIMEOUT', 240, 10, 3600)

    const seam = seamEntries(ctx)
    if (seam.length === 0) {
      return blocked(`${NAME} was given a step with no seam, so nothing was built.`, 'A build agent writes only inside the seam. Give the step a `- seam:` line and run it again.')
    }

    log(`building step ${ctx.step?.n ?? '?'} of "${ctx.build?.title ?? ctx.build?.slug ?? 'unknown build'}" with ${provider.label}, flow ${flowName}`)
    const obstacle = await provider.preflight()
    if (obstacle !== null) return blocked(`${NAME} could not reach a usable model, so nothing was built.`, obstacle)

    // -- what the models read
    const listed = await seamFiles(seam)
    const files = await showFiles(listed.paths)
    const like = await showFiles((Array.isArray(ctx.step?.like) ? ctx.step.like : []).map(repoRelative).filter((p) => p !== null))
    const prompt = buildPrompt(ctx, seam, files, like)
    const refused = new Set()
    const failures = []

    const engine = create_engine({ providers: provider.engineProviders })
    const ask = async (model, system, text, schema, temperature) => {
      const { content } = await engine.generate({
        provider: provider.provider,
        model,
        system,
        prompt: text,
        schema,
        schema_repair_attempts: 2,
        ...provider.callOptions(jsonSchemaOf(schema), temperature),
        retry: { max_attempts: 2, initial_delay_ms: 500, max_delay_ms: 4000 },
        // A local model that stalls would hold the step for as long as it
        // liked; the limit covers the call and its retries together.
        abort: AbortSignal.timeout(callTimeout * 1000),
        trajectory,
      })
      return content
    }

    // One candidate: the model's files, with every path outside the seam
    // dropped. `extra` carries a critic's notes on an adversarial round.
    const write = async (label, temperature, extra = '') => {
      let content
      try {
        content = await ask(provider.model, BUILD_SYSTEM, `${prompt}${extra}`, candidateSchema, temperature)
      } catch (err) {
        // One member's failed call (a timeout, an answer past repair) costs
        // that candidate and not the crew: it stands as an empty one, which
        // no pick prefers.
        const why = err instanceof Error ? err.message : String(err)
        failures.push(`candidate ${label}: ${why}`)
        log(`candidate ${label}: the model call failed (${why})`)
        return { label, summary: '', files: [] }
      }
      const kept = []
      for (const file of content.files) {
        const path = repoRelative(file.path)
        if (path !== null && inSeam(path, seam)) kept.push({ path, content: file.content })
        else refused.add(String(file.path))
      }
      log(`candidate ${label}: ${kept.length} file${kept.length === 1 ? '' : 's'} (${kept.map((f) => f.path).join(', ') || 'none inside the seam'})`)
      return { label, summary: content.summary, files: kept }
    }

    // Members of a crew differ by temperature, so the same prompt gives the
    // pick something to pick between; the first is the coolest.
    const crew = Object.fromEntries(
      Array.from({ length: candidates }, (_, i) => {
        const label = String.fromCharCode(97 + i)
        return [label, step(`candidate-${label}`, () => write(label, Math.min(1, 0.2 + i * 0.3)))]
      })
    )

    let chosen
    let how
    let proven = null // the proof's result for `chosen`, when a flow already ran it
    try {
      if (flowName === 'single') {
        chosen = await write('a', 0.2)
        how = 'one candidate'
      } else if (flowName === 'proof') {
        // Candidates are scored one at a time, since they share one working
        // tree: written, proved, put back. The first to pass ends the scoring.
        let turn = Promise.resolve()
        let won = false
        const results = {}
        const score = (candidate) => {
          const mine = turn.then(async () => {
            if (won || candidate.files.length === 0) return 0
            const before = await apply(candidate)
            const result = await runProof(command, proofTimeout)
            await restore(before)
            results[candidate.label] = result
            log(`candidate ${candidate.label}: proof ${result.passed ? 'passes' : 'fails'}`)
            if (result.passed) won = true
            return result.passed ? 1 : 0
          })
          turn = mine.catch(() => {})
          return mine
        }
        const picked = await run(ensemble({ name: 'proof-scored', members: crew, score }), ctx, { trajectory, install_signal_handlers: false })
        chosen = picked.winner
        proven = results[chosen.label] ?? null
        const passed = Object.values(picked.scores).filter((s) => s === 1).length
        how = `candidate ${chosen.label} of ${candidates}, the first to pass the proof`
        if (passed === 0 && chosen.files.length > 0) {
          // No candidate passed, so the proof turns critic: the best attempt
          // goes back to the builder with the command's own output, to a
          // round limit. The command is the judge here too, never a model.
          let last = proven
          const repair = step('repair', async ({ prior }) =>
            over(prior ?? chosen, await write(chosen.label, 0.2, `\n\nYour last attempt:\n\n${showCandidate(prior ?? chosen)}\n\nThe proof command \`${command}\` failed against it. Fix the cause and return every file whole again. Its output ended:\n\n\`\`\`\n${last?.tail ?? ''}\n\`\`\``))
          )
          const prove = step('prove', async (candidate) => {
            if (candidate.files.length === 0) return { notes: 'no file inside the seam', accept: false }
            const before = await apply(candidate)
            last = await runProof(command, proofTimeout)
            await restore(before)
            log(`repair: proof ${last.passed ? 'passes' : 'fails'}`)
            return { notes: last.tail, accept: last.passed }
          })
          const fixed = await run(adversarial({ name: 'repair-by-proof', build: repair, critique: prove, accept: (c) => c.accept === true, max_rounds: rounds }), ctx, { trajectory, install_signal_handlers: false })
          if (fixed.candidate.files.length > 0) {
            chosen = fixed.candidate
            proven = last
          }
          how = fixed.converged
            ? `candidate ${chosen.label} of ${candidates}, repaired against the proof's output in ${fixed.rounds} round${fixed.rounds === 1 ? '' : 's'}`
            : `candidate ${chosen.label} of ${candidates}; none passed the proof, nor did ${fixed.rounds} repair round${fixed.rounds === 1 ? '' : 's'}`
        }
      } else if (flowName === 'tournament') {
        const compare = async (a, b) => {
          if (a.files.length === 0 || b.files.length === 0) return a.files.length === 0 ? 'b' : 'a'
          const text = `${prompt}\n\nTwo candidates implement this step. Pick the one that better meets the proof, the decisions and the constraints, with the smaller and clearer change.\n\n## Candidate a\n\n${showCandidate(a)}\n\n## Candidate b\n\n${showCandidate(b)}`
          const verdict = await ask(provider.judgeModel, 'You are a strict code reviewer choosing between two implementations. Answer with the winner and one sentence of reason.', text, verdictSchema, 0)
          log(`judge: ${a.label} vs ${b.label} → ${verdict.winner === 'a' ? a.label : b.label} (${verdict.reason})`)
          return verdict.winner
        }
        const picked = await run(tournament({ name: 'judged', members: crew, compare }), ctx, { trajectory, install_signal_handlers: false })
        chosen = picked.winner
        how = `candidate ${chosen.label} of ${candidates}, picked by a judge over ${picked.bracket.length} round${picked.bracket.length === 1 ? '' : 's'}`
      } else {
        const build = step('builder', async ({ prior, critique }) =>
          over(prior, await write('a', 0.2, prior === undefined ? '' : `\n\nYour last attempt:\n\n${showCandidate(prior)}\n\nA reviewer refused it for these reasons. Fix them and return every file whole again:\n\n${critique ?? ''}`))
        )
        const critic = step('critic', async (candidate) => {
          const text = `${prompt}\n\nThe candidate implementation:\n\n${showCandidate(candidate)}`
          const verdict = await ask(provider.judgeModel, 'You are a strict code reviewer. Accept the candidate only if it meets the proof, the decisions and the constraints. When you refuse, say exactly what to fix.', text, critiqueSchema, 0)
          log(`critic: ${verdict.accept ? 'accepts' : `refuses (${verdict.notes})`}`)
          return { notes: verdict.notes, accept: verdict.accept }
        })
        const result = await run(adversarial({ name: 'builder-and-critic', build, critique: critic, accept: (c) => c.accept === true, max_rounds: rounds }), ctx, { trajectory, install_signal_handlers: false })
        chosen = result.candidate
        how = result.converged ? `a builder and a critic, accepted in round ${result.rounds}` : `a builder and a critic; not accepted after ${result.rounds} round${result.rounds === 1 ? '' : 's'}`
      }
    } finally {
      await engine.dispose()
    }

    if (chosen.files.length === 0) {
      const why = failures.length > 0 ? `Model calls failed: ${failures.join('; ')}.` : `The model named: ${[...refused].join(', ') || 'no paths at all'}. The seam is: ${seam.join(', ')}.`
      return blocked(`${NAME} got no file inside the seam from the model, so nothing was written.`, `${why} Try another model, or build this step by hand.`)
    }

    // -- the one write that stays, and the proof read once against it
    await apply(chosen)
    if (command !== null && proven === null) proven = await runProof(command, proofTimeout)
    const proofWords = command === null ? 'the step has no proof command, so nothing was run' : proven.passed ? `\`${command}\` passes` : `\`${command}\` FAILS`

    const body = [
      `Chosen by: ${how}.`,
      `Proof: ${proofWords}.`,
      'Wrote:',
      ...chosen.files.map((f) => `- ${f.path}`),
      ...(failures.length > 0 ? ['Model calls that failed:', ...failures.map((f) => `- ${f}`)] : []),
      ...(refused.size > 0 ? ['Refused, outside the seam:', ...[...refused].map((p) => `- ${p}`)] : []),
      ...(listed.capped || files.truncated ? ['(The seam was larger than the model was shown; what it read was capped.)'] : []),
      ...(command !== null && !proven.passed && proven.tail.length > 0 ? ['The proof\'s last lines:', '```', proven.tail.split('\n').slice(-12).join('\n'), '```'] : []),
    ]
    return {
      contract: CONTRACT,
      status: 'done',
      summary: `${command !== null && !proven.passed ? 'proof still red: ' : ''}${chosen.summary || `wrote ${chosen.files.length} file${chosen.files.length === 1 ? '' : 's'}`}`,
      body: body.join('\n'),
    }
  })

  await run_stdio(flow, { input_schema: stepContextSchema, output_schema: envelopeSchema, trajectory })
}

main().catch((err) => {
  log(`failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
