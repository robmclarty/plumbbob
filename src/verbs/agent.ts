// `plumbbob agent <subcommand>`: the doorway to user-authored agents: anything
// executable that speaks the JSON envelope contract (JSON in on stdin, JSON out
// on stdout, prose streamed on stderr). `agent list` walks the three agent tiers
// (the repo's tracked `.plumbbob/agents/<name>/`, then the personal
// `~/.plumbbob/agents/<name>/`, then the agents plumbbob ships) and prints each
// resolvable agent. `agent run
// <name> [--step N] [--mode before|build|after]` composes the StepContext,
// spawns the manifest command, streams its stderr live, captures and validates
// the child's envelope, re-emits it on this verb's own stdout (machine) with the
// human summary on stderr, lands `parked[]` through the build-log, keeps the
// `evidence[]` that sits under the step's evidence folder (one Log line each,
// the rest dropped with a warning), and appends
// the envelope to the handoff ledger (`builds/<slug>/handoff.json`: untracked,
// step-scoped, cleared at checkpoint) so later runs can thread it back in.
// No code path here can checkpoint, flip a step, or chain agents, and that
// absence is deliberate; the subprocess boundary keeps the human as the clock
// by construction, not by policy. A thin read-write shell: resolution,
// composition, and spawn mechanics live in lib/agents.ts.

import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { findRepoRoot } from '../lib/git.ts'
import {
  SLOTS,
  type AgentEnvelope,
  type AgentEvidence,
  type AgentManifest,
  type AgentRunResult,
  type AgentTiers,
  type Slot,
  acceptEvidence,
  composeStepContext,
  formatAgentList,
  isSlot,
  listAgents,
  parseSlotBindings,
  readHarnessFile,
  resolveAgent,
  resolveBinding,
  resolveSlotAgents,
  runAgent,
} from '../lib/agents.ts'
import { appendToSection, evidenceLogLine } from '../lib/buildlog.ts'
import { resolveBoolean, resolveNumber, resolveRecord } from '../lib/settings.ts'
import {
  appendHandoff,
  buildFolder,
  buildLogPath,
  evidenceDir,
  hasSession,
  intentPath,
  refreshExcludes,
  resolveBuild,
  stepPath,
} from '../lib/sidecar.ts'
import { notice } from '../lib/notice.ts'

/** The remedy on an ambient binding's advisory: a binding is configuration the loop must survive without. */
const SKIPPING = 'skipping this binding, since the loop works without it'

/**
 * Dispatch `plumbbob agent list|run`, refusing an unknown subcommand with a hint.
 *
 * `tiers` moves the tiers outside the repo for a test; the CLI passes nothing.
 */
export async function agent(cwd: string, args: ReadonlyArray<string> = [], tiers: AgentTiers = {}): Promise<number> {
  const [sub, ...rest] = args
  if (sub === 'list') return list(cwd, tiers)
  if (sub === 'run') return run(cwd, rest, tiers)
  const known = 'Available subcommands: list, run.'
  const message =
    sub === undefined
      ? `plumbbob agent <subcommand>. ${known}`
      : notice({ fact: `unknown 'agent' subcommand '${sub}'`, remedy: 'plumbbob agent list, or plumbbob agent run' }).trimEnd()
  process.stderr.write(`${message}\n`)
  return 1
}

/**
 * Print every resolvable agent across the project, personal and built-in tiers.
 */
function list(cwd: string, tiers: AgentTiers): number {
  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write(notice({ fact: 'not inside a git repository' }))
    return 1
  }
  process.stdout.write(`${formatAgentList(listAgents(root, tiers))}\n`)
  return 0
}

/**
 * Run one named agent, or a slot's harness-bound agents, against the step in flight.
 *
 * With a name (or `--agent` flag) it runs exactly that agent, failing loud on a
 * miss; the user who typed the name asked for it specifically. With no name it
 * runs whatever the build's harness.json binds to the requested slot. Either
 * way it composes the StepContext, spawns, and applies side effects (never
 * advancing the loop).
 */
async function run(cwd: string, args: ReadonlyArray<string>, tiers: AgentTiers): Promise<number> {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' }))
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
    process.stderr.write(
      notice({ fact: 'no step to run against', remedy: 'pass --step N, or plumbbob build N first' }),
    )
    return 1
  }

  // A `--agent <path>` flag still needs a name; it labels an explicit run (the
  // handoff ledger and the human summary key on the name), it does not name one.
  if (parsed.name === undefined && parsed.flagPath !== undefined) {
    process.stderr.write(
      notice({
        fact: '--agent needs an agent name too',
        detail: ['the name is the run label'],
        remedy: 'plumbbob agent run reviewer --agent ./path --step 3',
      }),
    )
    return 1
  }

  // The run invites the agent to save under the step's evidence folder, so the
  // exclude patterns are brought up to date before anything is saved there: a
  // build started on an older plumbbob has none for that folder yet.
  refreshExcludes(root)

  // An explicit name outranks every binding: run exactly it, fail loud on a
  // miss. No name: resolve the harness bindings for the slot and run them.
  if (parsed.name !== undefined) {
    const ran = await runOne(
      root,
      slug,
      step,
      { name: parsed.name, flagPath: parsed.flagPath, mode: parsed.mode, ambient: false },
      tiers,
    )
    return ran.code
  }
  return runBound(root, slug, step, parsed.mode, tiers)
}

/**
 * One run's inputs: the agent name, an optional `--agent` directory override,
 * the requested slot, and whether the run is ambient (harness-bound) or an
 * explicit ask. An ambient run's `name` is the binding as written, which may
 * be a path.
 */
type RunSpec = {
  readonly name: string
  readonly flagPath: string | undefined
  readonly mode: string | undefined
  readonly ambient: boolean
}

/**
 * How one agent's run ended: the exit code it earns, and whether plumbbob was
 * told to stop while it ran. An interrupt is the person or the host ending the
 * whole verb, so a batch reads `interrupted` and runs nothing after it.
 */
type RunEnd = { readonly code: number; readonly interrupted: boolean }

/** A run that ended on its own, with `code`. */
function ended(code: number): RunEnd {
  return { code, interrupted: false }
}

/**
 * One agent's full run: resolve it, pick its slot, compose the StepContext, spawn, report.
 *
 * `ambient` marks a harness-bound run whose resolution or slot mismatch
 * degrades to a warning so a batch keeps going; a binding is ambient
 * configuration the loop must survive without; an explicit ask
 * (`ambient: false`) fails loud on the same miss. A run that actually starts
 * and fails (non-zero exit, timeout, …) is a hard failure either way: the
 * softening covers a *missing* agent, never a broken one. One ambient miss
 * stays loud: a binding written as a path inside the repo, which is a mistake
 * in a tracked file and not a teammate's missing library.
 *
 * The run is labelled with the name it was asked for by, and a binding written
 * as a path has none, so it takes the manifest's `name`: that is what the
 * summary, the handoff ledger and the `agentConfig` lookup key on.
 */
async function runOne(
  root: string,
  slug: string | null,
  step: number,
  spec: RunSpec,
  tiers: AgentTiers,
): Promise<RunEnd> {
  const resolution = spec.ambient
    ? resolveBinding(root, spec.name, tiers)
    : resolveAgent(root, spec.name, spec.flagPath !== undefined ? { ...tiers, flagPath: spec.flagPath } : tiers)
  if (!resolution.ok) {
    return ended(
      degrade(
        spec.ambient && !('loud' in resolution && resolution.loud),
        notice({ fact: resolution.error }).trimEnd(),
        notice({ fact: resolution.error, advisory: true, remedy: SKIPPING }).trimEnd(),
      ),
    )
  }
  const { manifest, dir } = resolution.agent
  const label = resolution.agent.origin === 'path' ? manifest.name : spec.name

  const resolved = resolveMode(spec.mode, manifest)
  if (!resolved.ok) {
    const parts = { fact: resolved.fact, detail: resolved.detail }
    return ended(
      degrade(
        spec.ambient,
        notice(resolved.remedy === undefined ? parts : { ...parts, remedy: resolved.remedy }).trimEnd(),
        notice({ ...parts, advisory: true, remedy: SKIPPING }).trimEnd(),
      ),
    )
  }
  const mode = resolved.mode

  let intent: string
  try {
    intent = readFileSync(intentPath(root, slug), 'utf8')
  } catch {
    process.stderr.write(
      notice({ fact: 'no intent.md for the active build', detail: ['cannot compose the agent input'] }),
    )
    return ended(1)
  }

  const composed = composeStepContext({
    intent,
    slug: slug ?? '',
    step,
    mode,
    // Where this step's evidence goes, as the agent would write it in its
    // envelope: from the repo root, which is also its working directory.
    evidenceDir: relative(root, evidenceDir(root, slug, step)),
    settings: {
      // The envelope reports the `auto` setting to agents as information only.
      // The checkpoint latch never reads it; a model can write a settings
      // file, so a standing `auto` cannot be a self-approval grant; approval
      // comes only from what the human literally typed. A `true` here informs
      // an agent, it does not self-approve.
      auto: resolveBoolean(root, 'auto', false),
      agentTimeout: resolveNumber(root, 'agentTimeout', 0),
      // Hand this agent its own config block over the envelope's existing
      // `settings` field: no new envelope field, no new verb; the config just
      // rides here. Resolution: settings.json's agentConfig[name], with the
      // untracked personal overlay (settings.local.json) replacing the project
      // entry whole (no deep merge) and {} when neither defines it.
      agent: resolveRecord(root, 'agentConfig')[label] ?? {},
    },
  })
  if (!composed.ok) {
    process.stderr.write(`plumbbob: ${composed.error}\n`)
    return ended(1)
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

  return {
    code: report(root, slug, label, mode, step, result),
    interrupted: !result.ok && result.reason === 'interrupted',
  }
}

/**
 * No name given: run the agents the build's harness.json binds to the requested slot.
 *
 * Bindings merge as a ladder: the per-step harness entry beats the harness
 * `defaults`, which beat the settings-level `agents` key; the first level that
 * names the slot wins, replace not append. A missing bound agent degrades to a
 * warning, except a binding written as a path inside the repo, whose miss is
 * an error; an absent harness, or one that binds nothing to this slot, is a
 * clean no-op. Each bound agent runs in turn; the batch exits 1 if any agent
 * that actually ran failed or any binding was refused. An interrupt ends the
 * batch where it stands: the signal was meant for plumbbob, so the agents bound
 * after the one it stopped are named and not started.
 */
async function runBound(
  root: string,
  slug: string | null,
  step: number,
  modeFlag: string | undefined,
  tiers: AgentTiers,
): Promise<number> {
  if (modeFlag === undefined) {
    process.stderr.write(
      notice({
        fact: 'agent run needs an agent name',
        remedy: "name one, or pass --mode <slot> to run the step's bound agents",
      }),
    )
    return 1
  }
  if (!isSlot(modeFlag)) {
    process.stderr.write(notice({ fact: `unknown --mode '${modeFlag}'`, detail: [...SLOTS] }))
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
    process.stderr.write(
      notice({ fact: `no agents bound to the '${modeFlag}' slot for step ${step}`, detail: ['nothing to run'] }),
    )
    return 0
  }

  let worst = 0
  for (const [at, name] of names.entries()) {
    const ran = await runOne(root, slug, step, { name, flagPath: undefined, mode: modeFlag, ambient: true }, tiers)
    if (ran.code !== 0) worst = ran.code
    if (ran.interrupted) {
      const left = names.slice(at + 1)
      if (left.length > 0) {
        process.stderr.write(notice({ fact: `interrupted, so not running ${left.join(', ')}` }))
      }
      return 1
    }
  }
  return worst
}

/**
 * Emit the loud error or the soft warning, and return the matching code.
 *
 * `quiet` is true for an ambient harness binding whose miss may be a
 * teammate's missing library; an explicit ask (name/flag) and a path binding
 * inside the repo are not. A hard miss stops with 1; a degraded one warns and
 * returns 0 so a batch of bound agents carries on.
 */
function degrade(quiet: boolean, hard: string, soft: string): number {
  process.stderr.write(`${quiet ? soft : hard}\n`)
  return quiet ? 0 : 1
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
 * error (returned as a string) rather than a silent default. An undeclared
 * `--flag` never arrives here; `run` screens argv against the verb spec in
 * cli-core.ts and refuses before dispatch.
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
        return notice({ fact: '--step needs a positive step number' }).trimEnd()
      }
      step = Number(value)
    } else if (arg === '--mode') {
      const value = args[++i]
      if (value === undefined) return notice({ fact: '--mode needs a slot', detail: [...SLOTS] }).trimEnd()
      mode = value
    } else if (arg === '--agent') {
      const value = args[++i]
      if (value === undefined) return notice({ fact: '--agent needs a path to an agent directory' }).trimEnd()
      flagPath = value
    } else if (!arg.startsWith('--')) {
      positionals.push(arg)
    }
  }
  return { name: positionals[0], step, mode, flagPath }
}

/**
 * A resolved slot, or the parts of the notice explaining why it did not
 * resolve. The parts stay unrendered so the caller can print the same fact
 * twice over: loud for an explicit ask, advisory with a skipping remedy for an
 * ambient binding.
 */
type ModeResolution =
  | { readonly ok: true; readonly mode: Slot }
  | { readonly ok: false; readonly fact: string; readonly detail: ReadonlyArray<string>; readonly remedy?: string }

/**
 * Resolve the slot the agent runs in.
 *
 * An explicit `--mode` must name a real slot AND one the manifest declares;
 * an undeclared slot is refused loud, because the user asked for that exact
 * run. With no `--mode`, a single-slot agent uses its only slot; a multi-slot
 * agent must be told which one (harness bindings pick the slot from the
 * lifecycle point; a bare `run` cannot guess).
 */
function resolveMode(flag: string | undefined, manifest: AgentManifest): ModeResolution {
  if (flag !== undefined) {
    if (!isSlot(flag)) {
      return { ok: false, fact: `unknown --mode '${flag}'`, detail: [...SLOTS] }
    }
    if (!manifest.slots.includes(flag)) {
      return {
        ok: false,
        fact: `agent "${manifest.name}" does not declare the '${flag}' slot`,
        detail: [`it declares ${manifest.slots.join(', ')}`],
      }
    }
    return { ok: true, mode: flag }
  }
  if (manifest.slots.length === 1) return { ok: true, mode: manifest.slots[0] as Slot }
  return {
    ok: false,
    fact: `agent "${manifest.name}" declares multiple slots`,
    detail: manifest.slots,
    remedy: 'pass --mode <slot>',
  }
}

/**
 * Map the run outcome to reporting and side effects.
 *
 * A failed run (non-zero exit, out-of-contract stdout, timeout, interrupt, or a
 * shell that never started) reports on stderr and stops with NO side effects:
 * the envelope of a failed child is not authoritative. A clean run lands
 * `parked[]`, keeps the evidence that sits under the step's folder, records the
 * envelope in the handoff ledger, prints the human summary on stderr, and
 * re-emits the machine envelope on stdout, nothing else, ever (the stream
 * discipline: stdout carries the envelope alone). The envelope it records and
 * re-emits carries the kept evidence only, so the pause and a calling skill
 * read the same list, and no `evidence` key at all when nothing was kept.
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
  const shown = acceptEvidence(root, relative(root, evidenceDir(root, slug, step)), result.envelope.evidence)
  for (const warning of [...result.warnings, ...shown.warnings]) {
    process.stderr.write(`${warning}\n`)
  }
  const envelope: AgentEnvelope = { ...result.envelope, evidence: shown.entries }
  const emitted = shownOnly(envelope)
  applyParked(root, slug, envelope.parked)
  logEvidence(root, slug, name, step, envelope.evidence)
  appendHandoff(root, slug, { agent: name, mode, step, envelope: emitted })
  process.stderr.write(humanSummary(name, mode, envelope))
  if (envelope.evidence.length > 0) {
    const count = `${envelope.evidence.length} piece${envelope.evidence.length === 1 ? '' : 's'} of evidence`
    process.stderr.write(notice({ fact: `agent "${name}" showed ${count}`, detail: ['listed at the pause'] }))
  }
  process.stdout.write(`${JSON.stringify(emitted)}\n`)
  return 0
}

/**
 * The envelope as it is recorded and re-emitted: with its `evidence` when
 * some was kept, and without the key when none was, so an agent that shows
 * nothing prints what it printed before there was evidence to show.
 */
function shownOnly(envelope: AgentEnvelope): Omit<AgentEnvelope, 'evidence'> & { readonly evidence?: AgentEnvelope['evidence'] } {
  if (envelope.evidence.length > 0) return envelope
  const { evidence: _none, ...rest } = envelope
  return rest
}

/**
 * One stderr line naming exactly how a failed run failed.
 *
 * A timed-out agent that went when it was asked reads `stopped`; the `killed`
 * wording, with the grace it was given, is kept for one the SIGKILL had to end.
 */
function failureLine(name: string, result: Exclude<AgentRunResult, { ok: true }>): string {
  switch (result.reason) {
    case 'exit':
      return notice({
        fact: `agent "${name}" exited ${result.code}`,
        detail: ['a failed run, stopping', 'no side effects applied'],
      }).trimEnd()
    case 'contract':
      return notice({ fact: `agent "${name}" is out of contract`, detail: [result.error] }).trimEnd()
    case 'timeout':
      return notice({
        fact: `agent "${name}" timed out after ${result.seconds}s`,
        detail: result.killed ? [`given ${result.graceSeconds}s to stop`, 'killed'] : ['stopped'],
      }).trimEnd()
    case 'interrupted':
      return notice({ fact: `agent "${name}" killed`, detail: ['interrupted'] }).trimEnd()
    case 'spawn':
      return notice({ fact: `could not spawn agent "${name}"`, detail: [result.error] }).trimEnd()
  }
}

/**
 * Land each parked concern through the build-log's Park list.
 *
 * The agent never writes .plumbbob/ itself; parked lines only reach the
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
    process.stderr.write(
      notice({
        fact: 'no build-log.md',
        detail: [`could not park ${parked.length} line${parked.length === 1 ? '' : 's'} the agent returned`],
      }),
    )
    return
  }
  for (const line of parked) {
    const updated = appendToSection(content, 'Park list', `- [ ] ${line}`)
    if (updated === null) {
      process.stderr.write(notice({ fact: 'no "## Park list" in build-log.md', detail: [`could not park ${line}`] }))
      return
    }
    content = updated
    process.stderr.write(notice({ prefix: 'parked', fact: line }))
  }
  writeFileSync(path, content)
}

/**
 * Record each kept piece of evidence in the build-log's Log, one line apiece.
 *
 * The files themselves never reach git, so this line is what the record keeps
 * of them: the step, the agent, the path, and the caption. A line already in
 * the Log is not written twice, so re-running an agent that shows the same
 * thing leaves one line. Best-effort like every build-log write: a missing log
 * or one with no `## Log` warns once, and the evidence still reaches the pause.
 */
function logEvidence(
  root: string,
  slug: string | null,
  name: string,
  step: number,
  evidence: ReadonlyArray<AgentEvidence>,
): void {
  if (evidence.length === 0) return
  const path = buildLogPath(root, slug)
  const count = `${evidence.length} piece${evidence.length === 1 ? '' : 's'} of evidence`
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    process.stderr.write(notice({ fact: 'no build-log.md', detail: [`could not record ${count}`] }))
    return
  }
  const date = new Date().toISOString().slice(0, 10)
  for (const entry of evidence) {
    const line = evidenceLogLine(date, step, name, entry.path, entry.caption)
    if (content.split('\n').includes(line)) continue
    const updated = appendToSection(content, 'Log', line)
    if (updated === null) {
      process.stderr.write(notice({ fact: 'no "## Log" in build-log.md', detail: [`could not record ${count}`] }))
      return
    }
    content = updated
  }
  writeFileSync(path, content)
}

/**
 * The human-facing summary printed on stderr.
 *
 * A headline plus, for a halt, the route out: `blocked` unblocks and re-runs,
 * `drift` sends the plan to /plumbbob:refine. The machine envelope on stdout carries
 * the same status for the calling skill; this stderr copy is the terminal read.
 */
function humanSummary(name: string, mode: Slot, envelope: AgentEnvelope): string {
  const detail = [`${mode} slot`, envelope.summary]
  if (envelope.notes.length > 0) detail.push(envelope.notes)
  if (envelope.status === 'blocked') {
    return notice({
      fact: `agent "${name}" reports blocked`,
      detail,
      remedy: "the agent couldn't finish, so unblock it and re-run",
    })
  }
  if (envelope.status === 'drift') {
    return notice({
      fact: `agent "${name}" reports drift`,
      detail,
      remedy: 'the plan no longer matches reality, so /plumbbob:refine before continuing',
    })
  }
  return notice({ fact: `agent "${name}" reports ${envelope.status}`, detail })
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
