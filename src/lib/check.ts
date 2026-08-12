// The heavy check: the full quality gate that `verify` and `checkpoint` refuse
// to advance past while red. Two paths through one seam:
//   - a `check` setting resolved through the settings ladder (CLI flag →
//     settings.local.json, the untracked personal overlay → settings.json, the
//     tracked project defaults) is a shell command → spawn it verbatim, so any
//     repo can gate through anything (test fixtures point it at `true`/`false`
//     to keep throwaway repos deterministic);
//   - no setting at all → checkride, our sibling package, imported
//     programmatically rather than spawned: the typed summary comes back
//     in-process, failing slots are reported with their `.check/` raw-output
//     pointers, and an all-slots-skipped run REFUSES rather than green-lighting
//     a repo checkride can't see (a vacuous pass is not a pass).
// Checkride's stream discipline holds: human progress goes to stderr. Exit 0 is
// green, 1 is red, 2 means the harness itself broke — reported distinctly,
// because a misconfigured gate must not read as broken code (both still block).

import { spawnSync } from 'node:child_process'
import { runChecks, runDoctor } from 'checkride'
import type { DoctorCheck, Summary } from 'checkride'
import { gateIsRunningFor, withGateMarker } from './reentry.ts'
import { resolveString } from './settings.ts'

/**
 * The plan-time gate probe's answer: would the gate have anything to run in
 * this repo? `configured` is the settings-ladder `check` override (its
 * presence answers the question by itself); `detected` says whether checkride
 * can see any code-facing tool here.
 */
export type GateDetection = {
  readonly configured: string | null
  readonly detected: boolean
}

/**
 * Probe whether the check gate would have anything to run in `root`.
 *
 * A configured `check` command answers yes on its own; otherwise checkride's
 * doctor detection runs in-process — the same pass `plumbbob doctor` reports
 * as a table. `start` reads this to surface "nothing to check" at plan time,
 * while the human is still deciding, instead of at the first refused
 * checkpoint.
 */
export async function detectGate(root: string): Promise<GateDetection> {
  const command = resolveString(root, 'check', '')
  if (command.length > 0) return { configured: command, detected: true }
  try {
    const silent = { write: () => true }
    const { report } = await runDoctor({ cwd: root, stdout: silent })
    return { configured: null, detected: gateDetectsTools(report.checks) }
  } catch {
    // A broken checkride harness is a different problem with its own reporters
    // (doctor's ✗ row, runCheck's exit 2) — the plan-time probe stays quiet
    // rather than mislabeling it "nothing to check".
    return { configured: null, detected: true }
  }
}

/**
 * Checkride's always-on repo checks: the adapters that resolve with no tool
 * config of their own — the built-in `links` slot, the pnpm-audit security
 * scan, the publint/attw package-shape probes, and the pack/smoke/snippets
 * publish-bundle slots. Several are named for their shape rather than because
 * a bare directory reports them: `publint`/`attw` resolve off a devDependency,
 * `build` off a `scripts.build` entry — which says the package can be built,
 * not that checkride can see the code that goes into it — and `snippets`
 * carries two adapters since checkride 0.10.2, so the dist-facing
 * `snippets-dist` is named beside it (this list matches ADAPTER names, not
 * slot names). Every one of them but `links` is an opt-in slot, so a default
 * run selects none of them: they exercise the repo's plumbing or its shipped
 * artifact, never its code. A gate made only of these green-lights every
 * checkpoint while the human believes their work is being checked. Coupled to
 * checkride's built-in set by construction; the check.test.ts and
 * doctor.test.ts probes pin the coupling.
 */
const ALWAYS_ON_ADAPTERS: ReadonlyArray<string> = [
  'links',
  'pnpm-audit',
  'publint',
  'attw',
  'build',
  'pack',
  'smoke',
  'snippets',
  'snippets-dist',
]

/**
 * The detection rule, shared by `start`'s probe and doctor's callout: some
 * tool slot beyond the always-on family has an adapter — that is, checkride can
 * see the CODE (a tsconfig, a test runner, a linter…), not just the repo.
 */
export function gateDetectsTools(checks: ReadonlyArray<DoctorCheck>): boolean {
  return checks.some(
    (c) =>
      c.category === 'tool' &&
      c.adapter !== null &&
      c.adapter !== undefined &&
      !ALWAYS_ON_ADAPTERS.includes(c.adapter),
  )
}

/**
 * Narrowing flags for iteration loops (`plumbbob check --bail --only
 * types,lint`), mapped 1:1 onto checkride's RunFlags. Only the checkride path
 * honors them; the spawn override warns and ignores — an opaque command has no
 * slots to narrow.
 */
export type CheckFlags = {
  readonly bail?: boolean
  readonly changed?: boolean
  readonly all?: boolean
  readonly only?: ReadonlyArray<string>
  readonly skip?: ReadonlyArray<string>
  readonly include?: ReadonlyArray<string>
}

/**
 * Run the gate in `root` and return the exit code (0 green, 1 red, 2 harness
 * error).
 *
 * `commandFlag` is the optional CLI override at the top of the settings
 * ladder; a resolved command means the spawn path, no setting means checkride.
 */
export async function runCheck(root: string, flags: CheckFlags = {}, commandFlag?: string): Promise<number> {
  if (gateIsRunningFor(root)) {
    // This repo re-entering its OWN gate is never a slow gate — it is a
    // recursion whose next generation forks wider than this one. Exit 2 (the
    // harness broke), not 1: nothing has been learned about the code. A gate on
    // a DIFFERENT root is ordinary nested work (the test suite gating its
    // fixtures) and never reaches here.
    process.stderr.write(
      `plumbbob: refusing to run the check gate for ${root} inside its own gate — this would recurse.\n` +
        '  If a test reached here, it is driving a mutating verb against a real repo;\n' +
        '  point it at a fixture instead.\n',
    )
    return 2
  }
  const command = resolveString(root, 'check', '', commandFlag)
  return withGateMarker(root, () => (command.length > 0 ? runCommand(root, command, flags) : runCheckride(root, flags)))
}

/**
 * The spawn override: stream the configured command's own output to the
 * terminal and return its exit code — the command is trusted verbatim, no
 * interpretation.
 */
function runCommand(root: string, command: string, flags: CheckFlags): number {
  if (hasFlags(flags)) {
    process.stderr.write(
      `plumbbob: check flags only narrow the checkride gate — ignored for the configured command '${command}'.\n`,
    )
  }
  const result = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit' })
  return result.status ?? 1
}

/**
 * The checkride path: run the gate in-process, refuse an all-skipped run, and
 * name the failing slots on red.
 */
async function runCheckride(root: string, flags: CheckFlags): Promise<number> {
  let summary: Summary
  let exitCode: number
  try {
    const result = await runChecks({
      cwd: root,
      bail: flags.bail ?? false,
      changed: flags.changed ?? false,
      all: flags.all ?? false,
      only: flags.only !== undefined ? [...flags.only] : null,
      skip: flags.skip !== undefined ? [...flags.skip] : null,
      include: flags.include !== undefined ? [...flags.include] : null,
      // Checkride's own vacuous-green refusal (0.10.2): zero checks executed is
      // an error, not a pass. It overlaps the refusal below and never reaches
      // the human — our predicate is the broader one (it also catches a
      // links-only run, where a check DID execute) and fires first, so
      // plumbbob's message and its exit 1 are what a reader sees. Kept anyway:
      // it is the contract checkride asks a gate to run under, so a future
      // summary shape our predicate misreads still refuses.
      strict: true,
    })
    summary = result.summary
    exitCode = result.exitCode
  } catch (err) {
    // The harness broke, not the code: a malformed checkride.config.json or
    // the like. Checkride's own CLI maps this to exit 2; so do we — a
    // misconfigured gate must report distinctly from red.
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(
      `plumbbob: the check gate itself failed — ${message}\n` +
        `  Fix checkride.config.json, or set the "check" key in .plumbbob/settings.json to gate through another command.\n`,
    )
    return 2
  }
  if (summary.checks.every((c) => c.skipped === true || c.name === 'links')) {
    // Zero-config checkride skips slots with no detected tool; a repo it can't
    // see must refuse, not vacuously green-light the checkpoint. The built-in
    // `links` slot is always-on (empty detect list), so it alone proves
    // nothing about the code — a links-only run is still vacuous.
    process.stderr.write(
      'plumbbob: checkride found nothing to check in this repo — refusing to call that green.\n' +
        '  Add tool configs (tsconfig, vitest, …) or a checkride.config.json custom check,\n' +
        '  or set the "check" key in .plumbbob/settings.json to gate through another command.\n',
    )
    return 1
  }
  if (exitCode !== 0) {
    reportFailingSlots(summary)
  }
  return exitCode
}

/**
 * Name the failing slots and where their raw diagnostics landed, so the agent
 * (verify) reads the tool's own JSON instead of scraping scrollback.
 *
 * The summary is the canonical pointer — `output_file` is the adapter's
 * preferred name, but non-JSON output falls back to `.check/<slot>.stdout.txt`.
 */
function reportFailingSlots(summary: Summary): void {
  const failing = summary.checks.filter((c) => !c.ok)
  const lines = failing.map((c) => {
    const adapter = c.adapter === null ? '' : ` (${c.adapter})`
    const output = c.output_file === null ? `.check/${c.name}.stdout.txt` : `.check/${c.output_file}`
    return `  ✘ ${c.name}${adapter} — raw output: ${output}`
  })
  process.stderr.write(`plumbbob: failing slots:\n${lines.join('\n')}\n  Full report: .check/summary.json\n`)
}

/**
 * True when any narrowing flag was passed — the trigger for the spawn path's
 * flags-are-ignored warning.
 */
function hasFlags(flags: CheckFlags): boolean {
  return (
    flags.bail === true ||
    flags.changed === true ||
    flags.all === true ||
    flags.only !== undefined ||
    flags.skip !== undefined ||
    flags.include !== undefined
  )
}
