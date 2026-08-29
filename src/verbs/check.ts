// `plumbbob check`: run the heavy gate and report, with NO state change. This
// is the read-only half of the verify tick: `/plumbbob:verify` runs it before the
// pause so the human approves on a known-green check. The gate itself lives in
// lib/check.ts: checkride (our sibling check-runner package) by default, or a
// spawn command named by the `check` setting (resolved through the settings
// ladder (flag → local overlay → tracked settings.json → default)) for repos
// that gate through something else. Exits with the check's own code (0 = green,
// 1 = red, 2 = the gate itself broke).
//
// Narrowing flags for the iteration loop (`check --bail --only types,lint`) map
// straight onto checkride's run flags. Only this verb takes them: the
// checkpoint gate is always full-fat.

import { findRepoRoot } from '../lib/git.ts'
import { hasSession } from '../lib/sidecar.ts'
import { runCheck } from '../lib/check.ts'
import type { CheckFlags } from '../lib/check.ts'

/**
 * Run the heavy check gate for the active session and print the verdict line.
 *
 * Refuses without a session; otherwise returns the gate's own exit code so a
 * caller can branch on green (0), red (1), or a broken gate (2) directly.
 */
export async function check(cwd: string, args: ReadonlyArray<string> = []): Promise<number> {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }
  const code = await runCheck(root, parseFlags(args))
  process.stdout.write(verdictLine(code))
  return code
}

/**
 * Map argv onto checkride's flags: bare booleans plus comma-separated slot lists.
 *
 * Only the declared flags are read here; an undeclared one never reaches this
 * function, because `run` screens argv against the verb spec in cli-core.ts and
 * refuses before dispatch. This used to tolerate unknown args on the grounds
 * that running the gate mattered more than flag hygiene, but the same tolerance
 * on the mutating verbs let `checkpoint --help` commit, so the screen is now
 * central and uniform.
 */
function parseFlags(args: ReadonlyArray<string>): CheckFlags {
  return {
    ...(args.includes('--bail') ? { bail: true } : {}),
    ...(args.includes('--changed') ? { changed: true } : {}),
    ...(args.includes('--all') ? { all: true } : {}),
    ...slotList(args, '--only'),
    ...slotList(args, '--skip'),
    ...slotList(args, '--include'),
  }
}

/**
 * Read one `--only a,b`-style flag into its slot-list entry.
 *
 * Returns {} when the flag is absent, valueless, or followed by another flag,
 * so the spread in parseFlags simply contributes nothing.
 */
function slotList(args: ReadonlyArray<string>, flag: string): Partial<CheckFlags> {
  const i = args.indexOf(flag)
  const value = i >= 0 ? args[i + 1] : undefined
  if (value === undefined || value.startsWith('--')) return {}
  const names = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return names.length > 0 ? { [flag.slice(2)]: names } : {}
}

/**
 * The one-line human verdict for a check exit code, printed on its own line.
 *
 * These three strings are the verbatim verdict-line forms the turn anatomy
 * relays (docs/presentation.md): the model prints them unchanged between the
 * recap and the card, so rewording one here means moving the spec first. A
 * broken gate (exit 2) reports distinctly from red: a misconfigured harness
 * must never read as broken code, though both block a checkpoint.
 */
function verdictLine(code: number): string {
  if (code === 0) return '\nplumbbob: check green.\n'
  if (code === 2) return '\nplumbbob: check ERROR — the gate itself broke; fix the harness before trusting green or red.\n'
  return '\nplumbbob: check RED — fix it before checkpointing.\n'
}
