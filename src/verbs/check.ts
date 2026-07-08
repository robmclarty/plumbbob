// `plumbbob check` — run the heavy gate (D16/D24/D32) and report, with NO state
// change. The read-only half of the verify tick: `/pb-verify` runs this before the
// pause so the human approves on a known-green check. Exits with the check's own
// code (0 = green, 1 = red, 2 = the gate itself broke).
//
// Narrowing flags for the iteration loop (`check --bail --only types,lint`) map
// straight onto checkride's RunFlags (D32). Only this verb takes them — the
// checkpoint gate is always full-fat.

import { findRepoRoot } from '../lib/git.ts'
import { hasSession } from '../lib/sidecar.ts'
import { runCheck } from '../lib/check.ts'
import type { CheckFlags } from '../lib/check.ts'

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

// argv → CheckFlags: bare booleans plus comma-separated slot lists. Unknown
// args are ignored rather than refused — the gate itself is the point.
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

function verdictLine(code: number): string {
  if (code === 0) return '\nplumbbob: check green.\n'
  if (code === 2) return '\nplumbbob: check ERROR — the gate itself broke; fix the harness before trusting green or red.\n'
  return '\nplumbbob: check RED — fix it before checkpointing.\n'
}
