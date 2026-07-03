// `plumbbob agent <subcommand>` — the doorway to user-authored agents (D1/D3).
// `agent list` walks the two tiers and prints each resolvable agent. `agent run
// <name> [--step N] [--mode before|build|after]` (D22) composes the StepContext,
// spawns the manifest command, streams its stderr live, captures and validates
// the child's envelope, re-emits it on this verb's own stdout (machine) with the
// human summary on stderr (D8/D20), lands `parked[]` through the build-log (D6),
// and appends the envelope to the step-scoped handoff ledger (D20). There is no
// code path here to checkpoint, flip a step, or chain agents — the identity
// invariant (C2) holds by construction. A thin read-write shell: resolution,
// composition, and spawn mechanics live in lib/agents.ts.

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import {
  SLOTS,
  type AgentEnvelope,
  type AgentManifest,
  type AgentRunResult,
  type Slot,
  composeStepContext,
  formatAgentList,
  isSlot,
  listAgents,
  resolveAgent,
  runAgent,
} from '../lib/agents.ts'
import { appendToSection } from '../lib/buildlog.ts'
import { resolveBoolean, resolveNumber } from '../lib/settings.ts'
import { appendHandoff, buildLogPath, hasSession, intentPath, resolveBuild, stepPath } from '../lib/sidecar.ts'

export async function agent(cwd: string, args: ReadonlyArray<string> = []): Promise<number> {
  const [sub, ...rest] = args
  if (sub === 'list') return list(cwd, rest)
  if (sub === 'run') return run(cwd, rest)
  const known = 'Available subcommands: list, run.'
  const message =
    sub === undefined ? `plumbbob agent <subcommand>. ${known}` : `plumbbob: unknown 'agent' subcommand '${sub}'. ${known}`
  process.stderr.write(`${message}\n`)
  return 1
}

function list(cwd: string, _args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write('plumbbob: not inside a git repository.\n')
    return 1
  }
  process.stdout.write(`${formatAgentList(listAgents(root))}\n`)
  return 0
}

// `agent run <name>`: resolve the named agent (explicit miss = error, D21),
// compose the StepContext for the step and mode, spawn, then apply side effects.
async function run(cwd: string, args: ReadonlyArray<string>): Promise<number> {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug, rest } = resolveBuild(root, args)
  const parsed = parseRunArgs(rest)
  if (typeof parsed === 'string') {
    process.stderr.write(`${parsed}\n`)
    return 1
  }
  if (parsed.name === undefined) {
    process.stderr.write('plumbbob: agent run needs an agent name. Try: plumbbob agent run reviewer --step 3.\n')
    return 1
  }

  const step = parsed.step ?? readStep(root, slug)
  if (step === null) {
    process.stderr.write('plumbbob: no step to run against — pass --step N, or `plumbbob build N` first.\n')
    return 1
  }

  const resolution = resolveAgent(root, parsed.name, parsed.flagPath !== undefined ? { flagPath: parsed.flagPath } : {})
  if (!resolution.ok) {
    process.stderr.write(`plumbbob: ${resolution.error}\n`)
    return 1
  }
  const { manifest, dir } = resolution.agent

  const resolved = resolveMode(parsed.mode, manifest)
  if (!resolved.ok) {
    process.stderr.write(`${resolved.error}\n`)
    return 1
  }
  const mode = resolved.mode

  let intent: string
  try {
    intent = readFileSync(intentPath(root, slug), 'utf8')
  } catch {
    process.stderr.write('plumbbob: no intent.md for the active build — cannot compose the agent input.\n')
    return 1
  }

  const composed = composeStepContext({
    intent,
    slug: slug ?? '',
    step,
    mode,
    settings: {
      auto: resolveBoolean(root, 'auto', false),
      agentTimeout: resolveNumber(root, 'agentTimeout', 0),
    },
  })
  if (!composed.ok) {
    process.stderr.write(`plumbbob: ${composed.error}\n`)
    return 1
  }
  for (const warning of composed.warnings) {
    process.stderr.write(`${warning}\n`)
  }

  const result = await runAgent({
    root,
    command: manifest.command,
    agentDir: dir,
    input: composed.input,
    timeoutSeconds: resolveNumber(root, 'agentTimeout', 0),
  })

  return report(root, slug, parsed.name, mode, step, result)
}

type RunArgs = {
  readonly name: string | undefined
  readonly step: number | undefined
  readonly mode: string | undefined
  readonly flagPath: string | undefined
}

// Split `run`'s argv (with `--build` already stripped by resolveBuild) into the
// agent name and the value flags. A value flag missing its value, or `--step`
// given a non-number, is a loud error (returned as a string) rather than a silent
// default. Unknown `--flags` are ignored — the point is the named agent.
function parseRunArgs(args: ReadonlyArray<string>): RunArgs | string {
  const positionals: string[] = []
  let step: number | undefined
  let mode: string | undefined
  let flagPath: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string
    if (arg === '--step') {
      const value = args[++i]
      if (value === undefined || !/^\d+$/.test(value) || Number(value) < 1) {
        return 'plumbbob: --step needs a positive step number.'
      }
      step = Number(value)
    } else if (arg === '--mode') {
      const value = args[++i]
      if (value === undefined) return `plumbbob: --mode needs a slot (${SLOTS.join(', ')}).`
      mode = value
    } else if (arg === '--agent') {
      const value = args[++i]
      if (value === undefined) return 'plumbbob: --agent needs a path to an agent directory.'
      flagPath = value
    } else if (!arg.startsWith('--')) {
      positionals.push(arg)
    }
  }
  return { name: positionals[0], step, mode, flagPath }
}

// Resolve the slot the agent runs in. An explicit `--mode` must name a real slot
// AND one the manifest declares — an undeclared slot is refused loud (D21). With
// no `--mode`, a single-slot agent uses its only slot; a multi-slot agent must be
// told which one (step 5's harness bindings pick the slot from the lifecycle
// point; a bare `run` cannot guess).
function resolveMode(flag: string | undefined, manifest: AgentManifest): { ok: true; mode: Slot } | { ok: false; error: string } {
  if (flag !== undefined) {
    if (!isSlot(flag)) return { ok: false, error: `plumbbob: unknown --mode '${flag}' — slots are ${SLOTS.join(', ')}.` }
    if (!manifest.slots.includes(flag)) {
      return {
        ok: false,
        error: `plumbbob: agent "${manifest.name}" does not declare the '${flag}' slot (it declares ${manifest.slots.join(', ')}).`,
      }
    }
    return { ok: true, mode: flag }
  }
  if (manifest.slots.length === 1) return { ok: true, mode: manifest.slots[0] as Slot }
  return {
    ok: false,
    error: `plumbbob: agent "${manifest.name}" declares multiple slots (${manifest.slots.join(', ')}) — pass --mode <slot>.`,
  }
}

// Map the run outcome to reporting and side effects (D8). A failed run — non-zero
// exit, out-of-contract stdout, timeout, interrupt, or a shell that never
// started — reports on stderr and stops with NO side effects (the envelope of a
// failed child is not authoritative). A clean run lands `parked[]` (D6), records
// the envelope in the handoff ledger (D20), prints the human summary on stderr,
// and re-emits the machine envelope on stdout — nothing else, ever (the stream
// discipline: stdout carries the envelope alone).
function report(
  root: string,
  slug: string | null,
  name: string,
  mode: Slot,
  step: number,
  result: AgentRunResult,
): number {
  if (!result.ok) {
    process.stderr.write(`${failureLine(name, result)}\n`)
    return 1
  }
  const { envelope } = result
  applyParked(root, slug, envelope.parked)
  appendHandoff(root, slug, { agent: name, mode, step, envelope })
  process.stderr.write(humanSummary(name, mode, envelope))
  process.stdout.write(`${JSON.stringify(envelope)}\n`)
  return 0
}

function failureLine(name: string, result: Exclude<AgentRunResult, { ok: true }>): string {
  switch (result.reason) {
    case 'exit':
      return `plumbbob: agent "${name}" exited ${result.code} — failed run, stopping. No side effects applied.`
    case 'contract':
      return `plumbbob: agent "${name}" is out of contract — ${result.error}`
    case 'timeout':
      return `plumbbob: agent "${name}" timed out after ${result.seconds}s — killed.`
    case 'interrupted':
      return `plumbbob: interrupted — killed agent "${name}".`
    case 'spawn':
      return `plumbbob: could not spawn agent "${name}" — ${result.error}`
  }
}

// Land each parked concern through the build-log's Park list (D6 — the agent
// never writes .plumbbob/ itself). A build-log with no "## Park list" section, or
// no build-log at all, warns once rather than losing the lines silently.
function applyParked(root: string, slug: string | null, parked: ReadonlyArray<string>): void {
  if (parked.length === 0) return
  const path = buildLogPath(root, slug)
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    process.stderr.write(`plumbbob: no build-log.md — could not park ${parked.length} line(s) the agent returned.\n`)
    return
  }
  for (const line of parked) {
    const updated = appendToSection(content, 'Park list', `- [ ] ${line}`)
    if (updated === null) {
      process.stderr.write(`plumbbob: no "## Park list" in build-log.md — could not park: ${line}\n`)
      return
    }
    content = updated
    process.stderr.write(`plumbbob: parked — ${line}\n`)
  }
  writeFileSync(path, content)
}

// The human-facing summary on stderr (D20): a headline plus, for a halt, the
// route the skills name (D24) — `blocked` unblocks and re-runs, `drift` sends the
// plan to /pb-refine. The machine envelope on stdout carries the same status for
// the calling skill; this is the terminal read.
function humanSummary(name: string, mode: Slot, envelope: AgentEnvelope): string {
  const head = `plumbbob: agent "${name}" (${mode}) — ${envelope.status}: ${envelope.summary}\n`
  const notes = envelope.notes.length > 0 ? `  notes: ${envelope.notes}\n` : ''
  if (envelope.status === 'blocked') {
    return `${head}  blocked — the agent couldn't finish; unblock and re-run.\n${notes}`
  }
  if (envelope.status === 'drift') {
    return `${head}  drift — the plan no longer matches reality; /pb-refine before continuing.\n${notes}`
  }
  return head
}

// The in-flight step for this build (the STEP marker `build` wrote), or null when
// none is set — the caller then requires an explicit `--step`.
function readStep(root: string, slug: string | null): number | null {
  try {
    const raw = readFileSync(stepPath(root, slug), 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}
