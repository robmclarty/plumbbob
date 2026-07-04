/**
 * ollama-reviewer — a PlumbBob after-slot agent: a LOCAL model (via Ollama,
 * composed with fascicle) gives an advisory review of the step's diff.
 *
 * The contract (docs/agents.md): StepContext JSON on stdin, exactly one
 * envelope JSON on stdout, narration on stderr, exit 0 when the envelope is
 * authoritative. fascicle's `run_stdio` (fascicle/stdio, >= 0.8.11) enforces
 * that contract natively — it reads and validates stdin, routes trajectory to
 * stderr, disposes the engine, writes one schema-validated JSON document to
 * stdout, and makes the exit code the verdict — so the fascicle-trap
 * discipline of docs/agents.md is the library's job here, not this file's.
 *
 * Anticipated obstacles (Ollama down, model not pulled, deps not installed)
 * are `blocked` envelopes on exit 0 — the fix-and-re-run loop (D52).
 * Unexpected failures are run_stdio's non-zero exits: 1 = the flow failed,
 * 2 = the contract was violated (e.g. unparseable stdin), each with a
 * machine-readable failure as the last stderr line and nothing on stdout.
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

function log(message) {
  process.stderr.write(`ollama-reviewer: ${message}\n`)
}

// Imported lazily so the one obstacle run_stdio cannot report for us — the
// install itself missing — still ends in a valid blocked envelope instead of
// a module crash.
async function loadDeps() {
  try {
    const [fascicle, stdio, zod] = await Promise.all([
      import('fascicle'),
      import('fascicle/stdio'),
      import('zod'),
    ])
    return { fascicle, stdio, z: zod.z }
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') return null
    throw err
  }
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
// checkpointed (D56: after runs before checkpoint), so HEAD is the base —
// plus a pseudo-diff per untracked file, since a step that creates files
// (most step 1s) is invisible to `git diff HEAD` alone. seam entries are
// exact paths or dir/ grants — safe to hand to git as pathspecs; an empty
// seam falls back to the whole tree.
async function collectDiff(seam) {
  const paths = Array.isArray(seam) ? seam.filter((s) => typeof s === 'string' && s.length > 0) : []
  const pathspec = paths.length > 0 ? ['--', ...paths] : []
  const opts = { maxBuffer: 10 * 1024 * 1024 }

  const { stdout: tracked } = await execFileAsync('git', ['diff', 'HEAD', ...pathspec], opts)

  const { stdout: untrackedList } = await execFileAsync(
    'git',
    ['ls-files', '--others', '--exclude-standard', ...pathspec],
    opts
  )
  const pieces = [tracked]
  for (const file of untrackedList.split('\n').filter(Boolean)) {
    // exits 1 when the files differ, which here is always — not a failure
    const pseudo = await execFileAsync('git', ['diff', '--no-index', '--', '/dev/null', file], opts)
      .then((r) => r.stdout)
      .catch((err) => (typeof err?.stdout === 'string' ? err.stdout : ''))
    pieces.push(pseudo)
  }

  const diff = pieces.join('')
  if (diff.length <= DIFF_BYTE_CAP) return { diff, truncated: false }
  return { diff: diff.slice(0, DIFF_BYTE_CAP), truncated: true }
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

const SYSTEM = [
  'You are a code reviewer giving an advisory second opinion at a checkpoint.',
  'Judge the diff against the step\'s done-when, decisions, and constraints.',
  'Be concrete and terse; cite file paths as they appear in the diff; only raise',
  'concerns you can point to in the diff. Severity "now" means worth a human',
  'look before continuing; "later" means a follow-up worth parking.',
].join(' ')

// run_stdio's default trajectory is stderr_logger (JSONL on stderr) — already
// in contract, but aimed at machines. Swap in a human one: span names as
// narration lines, model text streamed raw as it generates, so the person at
// the pause watches the review happen.
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

async function main() {
  const deps = await loadDeps()
  if (deps === null) {
    process.stdout.write(
      `${JSON.stringify({
        contract: CONTRACT,
        status: 'blocked',
        summary: 'ollama-reviewer is missing its dependencies — no review was run.',
        notes: "run: npm install (in the agent's own directory, the one holding review.mjs)",
      })}\n`
    )
    return
  }

  const { create_engine, model_call, retry, pipe, sequence, step, branch } = deps.fascicle
  const { run_stdio } = deps.stdio
  const { z } = deps

  // Loose on purpose: everything except the contract gate is best-effort
  // prose (D61) — a strict shape here would wedge on what the CLI won't.
  const stepContextSchema = z.looseObject({ contract: z.literal(CONTRACT) })

  const envelopeSchema = z.object({
    contract: z.literal(CONTRACT),
    status: z.enum(['done', 'blocked', 'drift']),
    summary: z.string().min(1),
    body: z.string().optional(),
    parked: z.array(z.string().min(1)).optional(),
    notes: z.string().optional(),
  })

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

  const engine = create_engine({ providers: { ollama: { base_url: BASE_URL } } })
  let truncated = false

  // StepContext → { envelope } (an anticipated obstacle or an empty diff,
  // short-circuited) or { prompt } (a diff worth a model's opinion).
  const gather = step('gather', async (ctx) => {
    log(`reviewing step ${ctx.step?.n ?? '?'} of "${ctx.build?.title ?? ctx.build?.slug ?? 'unknown build'}" with ${MODEL} at ${BASE_URL}`)

    const obstacle = await preflight()
    if (obstacle !== null) {
      log(obstacle)
      return {
        envelope: {
          contract: CONTRACT,
          status: 'blocked',
          summary: 'ollama-reviewer could not reach a usable model — no review was run.',
          notes: obstacle,
        },
      }
    }

    const collected = await collectDiff(ctx.step?.seam)
    if (collected.diff.trim().length === 0) {
      return {
        envelope: {
          contract: CONTRACT,
          status: 'done',
          summary: 'No diff to review on this step — the working tree matches HEAD.',
        },
      }
    }
    truncated = collected.truncated
    log(`diff is ${collected.diff.length} bytes${truncated ? ` (truncated to the first ${DIFF_BYTE_CAP})` : ''}`)
    return { prompt: buildPrompt(ctx, collected.diff) }
  })

  const review = sequence([
    step('prompt', (g) => g.prompt),
    pipe(
      retry(
        model_call({
          engine,
          provider: 'ollama',
          model: MODEL,
          system: SYSTEM,
          schema: reviewSchema,
          schema_repair_attempts: 2,
        }),
        { max_attempts: 2 }
      ),
      (r) => {
        const now = r.content.concerns.filter((c) => c.severity === 'now')
        const later = r.content.concerns.filter((c) => c.severity === 'later')
        const envelope = {
          contract: CONTRACT,
          status: 'done', // advisory even when there are concerns — review informs, never gates
          summary: `${r.content.assessment}: ${r.content.summary}`,
          body: [
            ...(now.length > 0 ? ['Concerns worth a look before continuing:', ...now.map((c) => `- ${c.file}: ${c.issue}`)] : []),
            ...(truncated ? [`(The diff was truncated to its first ${DIFF_BYTE_CAP} bytes — the review may be partial.)`] : []),
          ].join('\n'),
        }
        if (later.length > 0) envelope.parked = later.map((c) => `${c.file}: ${c.issue}`)
        return envelope
      }
    ),
  ])

  const flow = sequence([
    gather,
    branch({
      name: 'obstacle-or-review',
      when: (g) => g.envelope !== undefined,
      then: step('short-circuit', (g) => g.envelope),
      otherwise: review,
    }),
  ])

  // Owns the rest of the contract: validates stdin against stepContextSchema
  // (exit 2 on garbage), validates the result against envelopeSchema, disposes
  // the engine before writing, emits exactly one JSON document on stdout, and
  // exits with the verdict.
  await run_stdio(flow, {
    input_schema: stepContextSchema,
    output_schema: envelopeSchema,
    engine,
    trajectory: stderrTrajectory(),
  })
}

main().catch((err) => {
  // Setup failed before run_stdio could own the verdict: a failed run (exit 1),
  // stdout untouched.
  log(`failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
