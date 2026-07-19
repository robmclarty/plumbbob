// The heavy check (D16/D24/D32): the full gate that `verify` and `checkpoint`
// refuse to advance past while red. Two paths through one seam:
//   - a `check` setting resolved through the ladder (flag → settings.local.json
//     → settings.json, D27) is a shell command → spawn it exactly as before, so
//     any repo can gate through anything (tests point it at `true`/`false`, D14);
//   - no setting at all → checkride, our sibling package, imported
//     programmatically (D32): the typed summary comes back in-process, failing
//     slots are reported with their `.check/` raw-output pointers, and an
//     all-slots-skipped run REFUSES rather than green-lighting a repo checkride
//     can't see (a vacuous pass is not a pass).
// Checkride's stream discipline holds: human progress goes to stderr. Exit 0 is
// green, 1 is red, 2 means the harness itself broke — reported distinctly,
// because a misconfigured gate must not read as broken code (both still block).

import { spawnSync } from 'node:child_process'
import { runChecks, runDoctor } from 'checkride'
import type { DoctorCheck, Summary } from 'checkride'
import { resolveString } from './settings.ts'

// The plan-time gate probe (research/07 Build 2): would the gate have anything
// to run in this repo? `configured` is the settings-ladder `check` override
// (its presence answers the question by itself); otherwise checkride's doctor
// detection runs in-process — the same pass `plumbbob doctor` reports as a
// table. `start` reads this to surface "nothing to check" at PLAN time, while
// the human is still deciding, instead of at the first refused checkpoint.
export type GateDetection = {
  readonly configured: string | null
  readonly detected: boolean
}

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

// Checkride's always-on repo checks: the adapters its doctor reports even for
// an EMPTY directory — the built-in `links` slot, the pnpm-audit security
// scan, the publint/attw package-shape probes, and (checkride 0.5.0's
// publish bundle) the built-in pack/smoke/snippets slots, which resolve on any
// package with no tool config of their own. They exercise the repo's plumbing
// or its shipped artifact, not its code — a gate made only of these green-lights
// every checkpoint while the human believes their work is being checked. Coupled
// to checkride's built-in set by construction; the check.test.ts and
// doctor.test.ts probes pin the coupling.
const ALWAYS_ON_ADAPTERS: ReadonlyArray<string> = ['links', 'pnpm-audit', 'publint', 'attw', 'pack', 'smoke', 'snippets']

// The detection rule, shared by `start`'s probe and doctor's callout: some tool
// slot beyond the always-on family has an adapter — i.e. checkride can see the
// CODE (a tsconfig, a test runner, a linter…), not just the repo.
export function gateDetectsTools(checks: ReadonlyArray<DoctorCheck>): boolean {
  return checks.some(
    (c) =>
      c.category === 'tool' &&
      c.adapter !== null &&
      c.adapter !== undefined &&
      !ALWAYS_ON_ADAPTERS.includes(c.adapter),
  )
}

// Narrowing flags for iteration loops (`plumbbob check --bail --only types,lint`),
// mapped 1:1 onto checkride's RunFlags. Only the checkride path honors them; the
// spawn override warns and ignores — an opaque command has no slots to narrow.
export type CheckFlags = {
  readonly bail?: boolean
  readonly changed?: boolean
  readonly all?: boolean
  readonly only?: ReadonlyArray<string>
  readonly skip?: ReadonlyArray<string>
  readonly include?: ReadonlyArray<string>
}

// Runs the gate in `root` and returns the exit code (0 green, 1 red, 2 harness
// error). `commandFlag` is the optional CLI override at the top of the settings
// ladder; a resolved command means the spawn path, no setting means checkride.
export async function runCheck(root: string, flags: CheckFlags = {}, commandFlag?: string): Promise<number> {
  const command = resolveString(root, 'check', '', commandFlag)
  if (command.length > 0) {
    return runCommand(root, command, flags)
  }
  return runCheckride(root, flags)
}

// The spawn override, byte-for-byte the pre-D32 behavior: stream the command's
// own output to the terminal and return its exit code.
function runCommand(root: string, command: string, flags: CheckFlags): number {
  if (hasFlags(flags)) {
    process.stderr.write(
      `plumbbob: check flags only narrow the checkride gate — ignored for the configured command '${command}'.\n`,
    )
  }
  const result = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit' })
  return result.status ?? 1
}

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
    })
    summary = result.summary
    exitCode = result.exitCode
  } catch (err) {
    // The harness broke, not the code (D32): a malformed checkride.config.json
    // or the like. Checkride's own CLI maps this to exit 2; so do we.
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(
      `plumbbob: the check gate itself failed — ${message}\n` +
        `  Fix checkride.config.json, or set the "check" key in .plumbbob/settings.json to gate through another command.\n`,
    )
    return 2
  }
  if (summary.checks.every((c) => c.skipped === true || c.name === 'links')) {
    // Zero-config checkride skips slots with no detected tool; a repo it can't
    // see must refuse, not vacuously green-light the checkpoint (D32). The
    // built-in `links` slot is always-on (empty detect list), so it alone
    // proves nothing about the code — a links-only run is still vacuous.
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

// Name the failing slots and where their raw diagnostics landed, so the agent
// (pb-verify) reads the tool's own JSON instead of scraping scrollback. The
// summary is the canonical pointer — `output_file` is the adapter's preferred
// name, but non-JSON output falls back to `.check/<slot>.stdout.txt`.
function reportFailingSlots(summary: Summary): void {
  const failing = summary.checks.filter((c) => !c.ok)
  const lines = failing.map((c) => {
    const adapter = c.adapter === null ? '' : ` (${c.adapter})`
    const output = c.output_file === null ? `.check/${c.name}.stdout.txt` : `.check/${c.output_file}`
    return `  ✘ ${c.name}${adapter} — raw output: ${output}`
  })
  process.stderr.write(`plumbbob: failing slots:\n${lines.join('\n')}\n  Full report: .check/summary.json\n`)
}

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
