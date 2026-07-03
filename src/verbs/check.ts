// `plumbbob check` — run the heavy gate (D16/D24/D32) and report, with NO state
// change. The read-only half of the verify tick: `/plumbbob:pb-verify` runs this before the
// pause so the human approves on a known-green check. Exits with the check's own
// code (0 = green, 1 = red, 2 = the gate itself broke).

import { findRepoRoot } from '../lib/git.ts'
import { hasSession } from '../lib/sidecar.ts'
import { runCheck } from '../lib/check.ts'

export async function check(cwd: string): Promise<number> {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }
  const code = await runCheck(root)
  process.stdout.write(verdictLine(code))
  return code
}

function verdictLine(code: number): string {
  if (code === 0) return '\nplumbbob: check green.\n'
  if (code === 2) return '\nplumbbob: check ERROR — the gate itself broke; fix the harness before trusting green or red.\n'
  return '\nplumbbob: check RED — fix it before checkpointing.\n'
}
