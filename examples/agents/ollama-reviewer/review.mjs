/**
 * ollama-reviewer — a PlumbBob after-slot agent: a LOCAL model (via Ollama,
 * composed with fascicle) gives an advisory review of the step's diff.
 *
 * The contract (docs/agents.md): StepContext JSON on stdin, exactly one
 * envelope JSON on stdout, narration on stderr, exit 0 when the envelope is
 * authoritative. See § "The fascicle trap" for the three idioms this file
 * demonstrates: trajectory → stderr, install_signal_handlers: false, and
 * engine.dispose() in finally.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const CONTRACT = 1

// Ollama's own convention is OLLAMA_HOST; fascicle's adapter speaks base_url.
const BASE_URL = process.env.OLLAMA_BASE_URL ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:8b'

// Small local models have small contexts — cap the diff rather than overflow.
const DIFF_BYTE_CAP = 40_000

const execFileAsync = promisify(execFile)

// The only two write sites. Nothing else may touch stdout — a stray
// console.log would put this agent out of contract.
function log(message) {
  process.stderr.write(`ollama-reviewer: ${message}\n`)
}

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`)
}

function blocked(summary, notes) {
  emit({ contract: CONTRACT, status: 'blocked', summary, notes })
}

async function readStdin() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  return input
}

// Preflight before burning a model call: unreachable server and unpulled
// model each get an actionable `blocked` envelope (the D52 loop — the human
// reads notes, fixes, re-runs). Returns null when good to go.
async function preflight() {
  let tags
  try {
    const res = await fetch(new URL('/api/tags', BASE_URL))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    tags = await res.json()
  } catch {
    return `Ollama is not reachable at ${BASE_URL} — start it (ollama serve) or point OLLAMA_BASE_URL at your server.`
  }
  const models = Array.isArray(tags.models) ? tags.models.map((m) => m.name) : []
  if (!models.includes(MODEL)) {
    return `model ${MODEL} is not pulled — run: ollama pull ${MODEL} (or set OLLAMA_MODEL to one of: ${models.join(', ') || 'none pulled yet'})`
  }
  return null
}

// The step's work at the verify pause is staged-or-unstaged but not yet
// checkpointed (D56: after runs before checkpoint), so HEAD is the base.
// seam entries are exact paths or dir/ grants — safe to hand to git as
// pathspecs; an empty seam falls back to the whole tree.
async function collectDiff(seam) {
  const paths = Array.isArray(seam) ? seam.filter((s) => typeof s === 'string' && s.length > 0) : []
  const args = ['diff', 'HEAD', ...(paths.length > 0 ? ['--', ...paths] : [])]
  const { stdout } = await execFileAsync('git', args, { maxBuffer: 10 * 1024 * 1024 })
  if (stdout.length <= DIFF_BYTE_CAP) return { diff: stdout, truncated: false }
  return { diff: stdout.slice(0, DIFF_BYTE_CAP), truncated: true }
}

function buildPrompt(ctx, diff) {
  const lines = []
  const step = ctx.step ?? {}
  lines.push(`Step ${step.n ?? '?'}: ${step.title ?? '(untitled)'}`)
  if (step.doneWhen) lines.push(`Done when: ${step.doneWhen}`)
  const list = (label, items) => {
    if (Array.isArray(items) && items.length > 0) {
      lines.push('', `${label}:`, ...items.map((s) => `- ${s}`))
    }
  }
  list('Decisions already made (do not relitigate)', ctx.decisions)
  list('Constraints', ctx.constraints)
  list('Context from earlier agents', ctx.context)
  lines.push('', 'The diff to review:', '', '```diff', diff, '```')
  return lines.join('\n')
}

// Imported lazily so every blocked path above — and the missing-install path
// itself — still ends in one valid envelope instead of a module crash.
async function loadDeps() {
  try {
    const [fascicle, zod] = await Promise.all([import('fascicle'), import('zod')])
    return { fascicle, z: zod.z }
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') return null
    throw err
  }
}

const SYSTEM = [
  'You are a code reviewer giving an advisory second opinion at a checkpoint.',
  'Judge the diff against the step\'s done-when, decisions, and constraints.',
  'Be concrete and terse; cite file paths as they appear in the diff; only raise',
  'concerns you can point to in the diff. Severity "now" means worth a human',
  'look before continuing; "later" means a follow-up worth parking.',
].join(' ')

// Trajectory → stderr (never stdout): span names as narration lines, model
// text streamed raw as it generates, so the human watches the review happen.
function stderrTrajectory() {
  let streamed = false
  return {
    record: (event) => {
      const text = event.kind === 'model_chunk' ? event.chunk?.text : undefined
      if (typeof text === 'string') {
        process.stderr.write(text)
        streamed = true
      }
    },
    start_span: (name) => {
      if (streamed) {
        process.stderr.write('\n')
        streamed = false
      }
      log(`… ${name}`)
      return name
    },
    end_span: () => {
      if (streamed) {
        process.stderr.write('\n')
        streamed = false
      }
    },
  }
}

async function reviewDiff(prompt, deps) {
  const { create_engine, model_call, retry, run } = deps.fascicle
  const { z } = deps

  const reviewSchema = z.object({
    assessment: z.enum(['pass', 'concerns']),
    summary: z.string(),
    concerns: z.array(
      z.object({
        file: z.string(),
        issue: z.string(),
        severity: z.enum(['now', 'later']),
      })
    ),
  })

  // The fascicle-trap checklist (docs/agents.md): trajectory to stderr,
  // no signal handlers (PlumbBob forwards Ctrl-C itself), dispose in finally.
  const engine = create_engine({ providers: { ollama: { base_url: BASE_URL } } })
  try {
    const flow = retry(
      model_call({
        engine,
        provider: 'ollama',
        model: MODEL,
        system: SYSTEM,
        schema: reviewSchema,
        schema_repair_attempts: 2,
      }),
      { max_attempts: 2 }
    )
    const result = await run(flow, prompt, {
      install_signal_handlers: false,
      trajectory: stderrTrajectory(),
    })
    return result.content
  } finally {
    await engine.dispose()
  }
}

async function main() {
  const raw = await readStdin()
  let ctx
  try {
    ctx = JSON.parse(raw)
  } catch {
    blocked(
      'ollama-reviewer got unparseable input — no review was run.',
      'stdin was not a JSON StepContext; run this agent through `plumbbob agent run` or pipe a valid fixture'
    )
    return
  }

  log(`reviewing step ${ctx.step?.n ?? '?'} of "${ctx.build?.title ?? ctx.build?.slug ?? 'unknown build'}" with ${MODEL} at ${BASE_URL}`)

  const deps = await loadDeps()
  if (deps === null) {
    blocked(
      'ollama-reviewer is missing its dependencies — no review was run.',
      "run: npm install (in the agent's own directory, the one holding review.mjs)"
    )
    return
  }

  const obstacle = await preflight()
  if (obstacle !== null) {
    log(obstacle)
    blocked('ollama-reviewer could not reach a usable model — no review was run.', obstacle)
    return
  }

  const { diff, truncated } = await collectDiff(ctx.step?.seam)
  if (diff.trim().length === 0) {
    emit({
      contract: CONTRACT,
      status: 'done',
      summary: 'No diff to review on this step — the working tree matches HEAD.',
    })
    return
  }
  log(`diff is ${diff.length} bytes${truncated ? ` (truncated to the first ${DIFF_BYTE_CAP})` : ''}`)

  const review = await reviewDiff(buildPrompt(ctx, diff), deps)

  const now = review.concerns.filter((c) => c.severity === 'now')
  const later = review.concerns.filter((c) => c.severity === 'later')
  const envelope = {
    contract: CONTRACT,
    status: 'done', // advisory even when there are concerns — review informs, never gates
    summary: `${review.assessment}: ${review.summary}`,
    body: [
      ...(now.length > 0 ? ['Concerns worth a look before continuing:', ...now.map((c) => `- ${c.file}: ${c.issue}`)] : []),
      ...(truncated ? [`(The diff was truncated to its first ${DIFF_BYTE_CAP} bytes — the review may be partial.)`] : []),
    ].join('\n'),
  }
  if (later.length > 0) envelope.parked = later.map((c) => `${c.file}: ${c.issue}`)
  emit(envelope)
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  log(`failed: ${message}`)
  blocked('ollama-reviewer failed before finishing the review.', message)
})
