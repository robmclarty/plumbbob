/**
 * reviewer — a PlumbBob after-slot agent: an advisory review of a step's diff
 * by a model whose *provider* is switchable.
 *
 * The provider is resolved by precedence — settings first, an env override
 * under it, a code default as the floor (D4):
 *
 *   ctx.settings.agent.provider  →  PB_REVIEWER_PROVIDER  →  'claude_cli'
 *
 *   • claude_cli (default) — piggybacks the logged-in Claude session; no API
 *     key, no local model to pull. (external transport, needs fascicle >= 0.9.5)
 *   • ollama — a LOCAL model; the diff never leaves the machine. (native
 *     transport, no AI-SDK peer deps — fascicle's prompt+parse+repair loop)
 *
 * The switch itself is the whole shape: a provider is a descriptor (how to
 * configure the engine, what to call, how to preflight), and adding one is a
 * single entry in PROVIDERS.
 *
 * The contract (docs/agents.md): StepContext JSON on stdin, exactly one
 * envelope JSON on stdout, narration on stderr, exit 0 when the envelope is
 * authoritative. fascicle's `run_stdio` (fascicle/stdio) owns that contract —
 * it reads and validates stdin, routes trajectory to stderr, validates the
 * envelope against a schema, writes exactly one JSON document to stdout, and
 * makes the exit code the verdict — so this file never touches stdout.
 *
 * Anticipated obstacles (provider unreachable, model not pulled, deps not
 * installed) are `blocked` envelopes on exit 0 — the fix-and-re-run loop (D52).
 * Unexpected failures are run_stdio's non-zero exits: 1 = the flow failed,
 * 2 = the contract was violated (e.g. unparseable stdin), each with a
 * machine-readable failure as the last stderr line and nothing on stdout.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const CONTRACT = 1

// Small local models have small contexts — cap the diff rather than overflow.
const DIFF_BYTE_CAP = 40_000

const execFileAsync = promisify(execFile)

function log(message) {
  process.stderr.write(`reviewer: ${message}\n`)
}

// --- read precedence: settings.agent.<key> → env → default (D4) --------------
//
// The CLI forwards this agent's own config block as ctx.settings.agent (the
// existing, frozen envelope `settings` field). Settings is the durable home;
// env is an ephemeral override under it; the descriptor's default is the floor.

function fromSettings(ctx, key) {
  const value = ctx?.settings?.agent?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function fromEnv(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return undefined
}

// --- providers ---------------------------------------------------------------
//
// A provider descriptor is a plain object:
//   label            the human string for the narration line
//   engineProviders  the `providers` map handed to create_engine (per-provider)
//   call             { provider, model } handed to engine.generate
//   preflight()      → null when good to go, else an actionable blocked message
// A factory (ctx) => descriptor resolves each provider's own config through the
// precedence above, so the switch is uniform across providers.

const DEFAULT_PROVIDER = 'claude_cli'

function ollamaProvider(ctx) {
  const model = fromSettings(ctx, 'model') ?? fromEnv('PB_REVIEWER_MODEL') ?? 'qwen3:8b'
  const baseUrl =
    fromSettings(ctx, 'baseUrl') ??
    fromEnv('OLLAMA_HOST', 'OLLAMA_BASE_URL') ??
    'http://localhost:11434'
  return {
    label: `ollama · ${model} @ ${baseUrl}`,
    // transport 'native' is fascicle's depth-1 raw-HTTP adapter — it keeps the
    // AI-SDK peers (ai, ai-sdk-ollama) out of this package's deps (D8); the
    // default 'ai_sdk' transport would demand ai-sdk-ollama as a peer.
    engineProviders: { ollama: { base_url: baseUrl, transport: 'native' } },
    call: { provider: 'ollama', model },
    // Preflight before burning a model call: an unreachable server and an
    // unpulled model each get an actionable `blocked` (the D52 loop — the human
    // reads notes, fixes, re-runs). null = good to go.
    preflight: async () => {
      let tags
      try {
        const res = await fetch(new URL('/api/tags', baseUrl))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        tags = await res.json()
      } catch {
        return `Ollama is not reachable at ${baseUrl} — start it (ollama serve) or point OLLAMA_HOST (or agentConfig.reviewer.baseUrl) at your server.`
      }
      const models = Array.isArray(tags.models) ? tags.models.map((m) => m.name) : []
      if (!models.includes(model)) {
        return `model ${model} is not pulled — run: ollama pull ${model} (or set the reviewer model to one of: ${models.join(', ') || 'none pulled yet'})`
      }
      return null
    },
  }
}

// The default, `claude_cli` (external transport), is wired alongside its own
// provider descriptor. Until then a request for it lands a clean `blocked` that
// names the providers that are wired.
const PROVIDERS = {
  ollama: ollamaProvider,
}

// --- diff collection ---------------------------------------------------------
//
// The step's work at the verify pause is staged-or-unstaged but not yet
// checkpointed (D56: after runs before checkpoint), so HEAD is the base — plus
// a pseudo-diff per untracked file, since a step that creates files (most step
// 1s) is invisible to `git diff HEAD` alone. seam entries are exact paths or
// dir/ grants — safe to hand to git as pathspecs; an empty seam falls back to
// the whole tree.
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

async function main() {
  const deps = await loadDeps()
  if (deps === null) {
    process.stdout.write(
      `${JSON.stringify({
        contract: CONTRACT,
        status: 'blocked',
        summary: 'reviewer is missing its dependencies — no review was run.',
        notes: "run: npm install (in the agent's own directory, the one holding review.mjs)",
      })}\n`
    )
    return
  }

  const { create_engine, step } = deps.fascicle
  const { run_stdio } = deps.stdio
  const { z } = deps

  // Loose on purpose: everything except the contract gate is best-effort prose
  // (D61) — a strict shape here would wedge on what the CLI won't send.
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

  // One logger, shared by run_stdio (span narration) and generate (model text).
  const trajectory = stderrTrajectory()

  // The whole review as one step: the engine's per-provider config depends on
  // the StepContext (which arrives on stdin), so the engine is created here,
  // after the provider is resolved, and disposed before this step returns —
  // i.e. before run_stdio serializes the envelope to stdout.
  const flow = step('review', async (ctx) => {
    const providerName =
      fromSettings(ctx, 'provider') ?? fromEnv('PB_REVIEWER_PROVIDER') ?? DEFAULT_PROVIDER
    const factory = PROVIDERS[providerName]
    if (factory === undefined) {
      const wired = Object.keys(PROVIDERS).join(', ')
      log(`no '${providerName}' provider wired (have: ${wired})`)
      return {
        contract: CONTRACT,
        status: 'blocked',
        summary: `reviewer has no '${providerName}' provider wired — no review was run.`,
        notes: `Set the provider to one of: ${wired} — via agentConfig.reviewer.provider in .plumbbob/settings.json, or the PB_REVIEWER_PROVIDER env var.`,
      }
    }
    const provider = factory(ctx)
    log(
      `reviewing step ${ctx.step?.n ?? '?'} of "${ctx.build?.title ?? ctx.build?.slug ?? 'unknown build'}" with ${provider.label}`
    )

    const obstacle = await provider.preflight()
    if (obstacle !== null) {
      log(obstacle)
      return {
        contract: CONTRACT,
        status: 'blocked',
        summary: 'reviewer could not reach a usable model — no review was run.',
        notes: obstacle,
      }
    }

    const collected = await collectDiff(ctx.step?.seam)
    if (collected.diff.trim().length === 0) {
      return {
        contract: CONTRACT,
        status: 'done',
        summary: 'No diff to review on this step — the working tree matches HEAD.',
      }
    }
    log(
      `diff is ${collected.diff.length} bytes${collected.truncated ? ` (truncated to the first ${DIFF_BYTE_CAP})` : ''}`
    )

    const engine = create_engine({ providers: provider.engineProviders })
    try {
      const { content } = await engine.generate({
        provider: provider.call.provider,
        model: provider.call.model,
        prompt: buildPrompt(ctx, collected.diff),
        system: SYSTEM,
        schema: reviewSchema,
        schema_repair_attempts: 2,
        retry: { max_attempts: 2, initial_delay_ms: 500, max_delay_ms: 4000 },
        trajectory,
      })

      const now = content.concerns.filter((c) => c.severity === 'now')
      const later = content.concerns.filter((c) => c.severity === 'later')
      const bodyLines = [
        ...(now.length > 0
          ? ['Concerns worth a look before continuing:', ...now.map((c) => `- ${c.file}: ${c.issue}`)]
          : []),
        ...(collected.truncated
          ? [`(The diff was truncated to its first ${DIFF_BYTE_CAP} bytes — the review may be partial.)`]
          : []),
      ]
      const envelope = {
        contract: CONTRACT,
        status: 'done', // advisory even with concerns — review informs, never gates
        summary: `${content.assessment}: ${content.summary}`,
      }
      if (bodyLines.length > 0) envelope.body = bodyLines.join('\n')
      if (later.length > 0) envelope.parked = later.map((c) => `${c.file}: ${c.issue}`)
      return envelope
    } finally {
      await engine.dispose()
    }
  })

  // Owns the rest of the contract: validates stdin against stepContextSchema
  // (exit 2 on garbage), validates the result against envelopeSchema, emits
  // exactly one JSON document on stdout, and exits with the verdict. No engine
  // is handed over — this flow owns its engine's lifecycle itself.
  await run_stdio(flow, {
    input_schema: stepContextSchema,
    output_schema: envelopeSchema,
    trajectory,
  })
}

main().catch((err) => {
  // Setup failed before run_stdio could own the verdict: a failed run (exit 1),
  // stdout untouched.
  log(`failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
