// `plumbbob agent <subcommand>` — the doorway to user-authored agents: anything
// executable that speaks the JSON envelope contract (JSON in on stdin, JSON out
// on stdout, prose streamed on stderr). `agent list` walks the two agent tiers —
// the repo's tracked `.plumbbob/agents/<name>/`, then the personal
// `~/.plumbbob/agents/<name>/` — and prints each resolvable agent. `agent run
// <name> [--step N] [--mode before|build|after]` composes the StepContext,
// spawns the manifest command, streams its stderr live, captures and validates
// the child's envelope, re-emits it on this verb's own stdout (machine) with the
// human summary on stderr, lands `parked[]` through the build-log, and appends
// the envelope to the handoff ledger (`builds/<slug>/handoff.json` — untracked,
// step-scoped, cleared at checkpoint) so later runs can thread it back in.
// There is deliberately no code path here to checkpoint, flip a step, or chain
// agents — the subprocess boundary keeps the human as the clock by
// construction, not by policy. A thin read-write shell: resolution,
// composition, and spawn mechanics live in lib/agents.ts.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
  parseSlotBindings,
  readHarnessFile,
  resolveAgent,
  resolveSlotAgents,
  runAgent,
} from '../lib/agents.ts'
import { appendToSection } from '../lib/buildlog.ts'
import { resolveBoolean, resolveNumber, resolveRecord } from '../lib/settings.ts'
import { appendHandoff, buildFolder, buildLogPath, hasSession, intentPath, resolveBuild, stepPath } from '../lib/sidecar.ts'

/**
 * Dispatch `plumbbob agent list|run`, refusing an unknown subcommand with a hint.
 */
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

/**
 * Print every resolvable agent across the project and personal tiers.
 */
function list(cwd: string, _args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write('plumbbob: not inside a git repository.\n')
    return 1
  }
  process.stdout.write(`${formatAgentList(listAgents(root))}\n`)
  return 0
}

/**
 * Run one named agent, or a slot's harness-bound agents, against the step in flight.
 *
 * With a name (or `--agent` flag) it runs exactly that agent, failing loud on a
 * miss — the user who typed the name asked for it specifically. With no name it
 * runs whatever the build's harness.json binds to the requested slot. Either
 * way it composes the StepContext, spawns, and applies side effects — never
 * advancing the loop.
 */
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

  const step = parsed.step ?? readStep(root, slug)
  if (step === null) {
    process.stderr.write('plumbbob: no step to run against — pass --step N, or `plumbbob build N` first.\n')
    return 1
  }

  // A `--agent <path>` flag still needs a name — it labels an explicit run (the
  // handoff ledger and the human summary key on the name), it does not name one.
  if (parsed.name === undefined && parsed.flagPath !== undefined) {
    process.stderr.write('plumbbob: --agent needs an agent name too, for the run label. Try: plumbbob agent run reviewer --agent ./path --step 3.\n')
    return 1
  }

  // An explicit name outranks every binding: run exactly it, fail loud on a
  // miss. No name: resolve the harness bindings for the slot and run them.
  if (parsed.name !== undefined) {
    return runOne(root, slug, step, {
      name: parsed.name,
      flagPath: parsed.flagPath,
      mode: parsed.mode,
      ambient: false,
    })
  }
  return runBound(root, slug, step, parsed.mode)
}

/**
 * One run's inputs: the agent name, an optional `--agent` directory override,
 * the requested slot, and whether the run is ambient (harness-bound) or an
 * explicit ask.
 */
type RunSpec = {
  readonly name: string
  readonly flagPath: string | undefined
  readonly mode: string | undefined
  readonly ambient: boolean
}

/**
 * One agent's full run: resolve it, pick its slot, compose the StepContext, spawn, report.
 *
 * `ambient` marks a harness-bound run whose resolution or slot mismatch
 * degrades to a warning so a batch keeps going — a binding is ambient
 * configuration the loop must survive without; an explicit ask
 * (`ambient: false`) fails loud on the same miss. A run that actually starts
 * and fails (non-zero exit, timeout, …) is a hard failure either way — the
 * softening covers a *missing* agent, never a broken one.
 */
async function runOne(root: string, slug: string | null, step: number, spec: RunSpec): Promise<number> {
  const resolution = resolveAgent(root, spec.name, spec.flagPath !== undefined ? { flagPath: spec.flagPath } : {})
  if (!resolution.ok) {
    return degrade(
      spec.ambient,
      `plumbbob: ${resolution.error}`,
      `plumbbob: bound agent "${spec.name}" did not resolve — ${resolution.error} Skipping (D54 — the loop works without it).`,
    )
  }
  const { manifest, dir } = resolution.agent

  const resolved = resolveMode(spec.mode, manifest)
  if (!resolved.ok) {
    return degrade(
      spec.ambient,
      resolved.error,
      `plumbbob: bound agent "${spec.name}" — ${resolved.error.replace(/^plumbbob:\s*/, '')} Skipping (D54).`,
    )
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
      // The envelope reports the `auto` setting to agents as information only.
      // The checkpoint latch never reads it — a model can write a settings
      // file, so a standing `auto` cannot be a self-approval grant; approval
      // comes only from what the human literally typed. A `true` here informs
      // an agent, it does not self-approve.
      auto: resolveBoolean(root, 'auto', false),
      agentTimeout: resolveNumber(root, 'agentTimeout', 0),
      // Hand this agent its own config block over the envelope's existing
      // `settings` field — no new envelope field, no new verb; the config just
      // rides here. Resolution: settings.json's agentConfig[name], with the
      // untracked personal overlay (settings.local.json) replacing the project
      // entry whole — no deep merge — and {} when neither defines it.
      agent: resolveRecord(root, 'agentConfig')[spec.name] ?? {},
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

  return report(root, slug, spec.name, mode, step, result)
}

/**
 * No name given: run the agents the build's harness.json binds to the requested slot.
 *
 * Bindings merge as a ladder — the per-step harness entry beats the harness
 * `defaults`, which beat the settings-level `agents` key; the first level that
 * names the slot wins, replace not append. A missing bound agent degrades to a
 * warning; an absent harness, or one that binds nothing to this slot, is a
 * clean no-op. Each bound agent runs in turn; the batch exits 1 if any agent
 * that actually ran failed.
 */
async function runBound(root: string, slug: string | null, step: number, modeFlag: string | undefined): Promise<number> {
  if (modeFlag === undefined) {
    process.stderr.write('plumbbob: agent run needs an agent name, or --mode <slot> to run the step\'s bound agents.\n')
    return 1
  }
  if (!isSlot(modeFlag)) {
    process.stderr.write(`plumbbob: unknown --mode '${modeFlag}' — slots are ${SLOTS.join(', ')}.\n`)
    return 1
  }

  const harness = readHarnessFile(join(buildFolder(root, slug), 'harness.json'))
  if (harness !== null && !harness.ok) {
    process.stderr.write(`plumbbob: ${harness.error}\n`)
    return 1
  }
  const settingsDefaults = parseSlotBindings(resolveRecord(root, 'agents'))
  const names = resolveSlotAgents({
    harness: harness?.harness ?? null,
    settingsDefaults,
    step,
    slot: modeFlag,
  })
  if (names.length === 0) {
    process.stderr.write(`plumbbob: no agents bound to the '${modeFlag}' slot for step ${step} — nothing to run.\n`)
    return 0
  }

  let worst = 0
  for (const name of names) {
    const code = await runOne(root, slug, step, { name, flagPath: undefined, mode: modeFlag, ambient: true })
    if (code !== 0) worst = code
  }
  return worst
}

/**
 * Emit the loud error or the soft warning by whether this run was an explicit
 * ask (name/flag) or an ambient harness binding, and return the matching code.
 *
 * A hard miss stops with 1; a degraded one warns and returns 0 so a batch of
 * bound agents carries on.
 */
function degrade(ambient: boolean, hard: string, soft: string): number {
  process.stderr.write(`${ambient ? soft : hard}\n`)
  return ambient ? 0 : 1
}

/** The parsed shape of `agent run`'s argv: the agent name plus its value flags. */
type RunArgs = {
  readonly name: string | undefined
  readonly step: number | undefined
  readonly mode: string | undefined
  readonly flagPath: string | undefined
}

/**
 * Split `run`'s argv (with `--build` already stripped by resolveBuild) into the
 * agent name and the value flags.
 *
 * A value flag missing its value, or `--step` given a non-number, is a loud
 * error (returned as a string) rather than a silent default. Unknown `--flags`
 * are ignored — the point is the named agent.
 */
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

/**
 * Resolve the slot the agent runs in.
 *
 * An explicit `--mode` must name a real slot AND one the manifest declares —
 * an undeclared slot is refused loud, because the user asked for that exact
 * run. With no `--mode`, a single-slot agent uses its only slot; a multi-slot
 * agent must be told which one (harness bindings pick the slot from the
 * lifecycle point; a bare `run` cannot guess).
 */
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

/**
 * Map the run outcome to reporting and side effects.
 *
 * A failed run — non-zero exit, out-of-contract stdout, timeout, interrupt, or a
 * shell that never started — reports on stderr and stops with NO side effects:
 * the envelope of a failed child is not authoritative. A clean run lands
 * `parked[]`, records the envelope in the handoff ledger, prints the human
 * summary on stderr, and re-emits the machine envelope on stdout — nothing else,
 * ever (the stream discipline: stdout carries the envelope alone).
 */
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

/**
 * One stderr line naming exactly how a failed run failed.
 */
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

/**
 * Land each parked concern through the build-log's Park list.
 *
 * The agent never writes .plumbbob/ itself — parked lines only reach the
 * build-log through this verb. A build-log with no "## Park list" section, or no
 * build-log at all, warns once rather than losing the lines silently.
 */
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

/**
 * The human-facing summary printed on stderr.
 *
 * A headline plus, for a halt, the route out — `blocked` unblocks and re-runs,
 * `drift` sends the plan to /plumbbob:refine. The machine envelope on stdout carries
 * the same status for the calling skill; this stderr copy is the terminal read.
 */
function humanSummary(name: string, mode: Slot, envelope: AgentEnvelope): string {
  const head = `plumbbob: agent "${name}" (${mode}) — ${envelope.status}: ${envelope.summary}\n`
  const notes = envelope.notes.length > 0 ? `  notes: ${envelope.notes}\n` : ''
  if (envelope.status === 'blocked') {
    return `${head}  blocked — the agent couldn't finish; unblock and re-run.\n${notes}`
  }
  if (envelope.status === 'drift') {
    return `${head}  drift — the plan no longer matches reality; /plumbbob:refine before continuing.\n${notes}`
  }
  return head
}

/**
 * The in-flight step for this build (the STEP marker `build` wrote), or null.
 *
 * With no marker set, the caller requires an explicit `--step`.
 */
function readStep(root: string, slug: string | null): number | null {
  try {
    const raw = readFileSync(stepPath(root, slug), 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}
