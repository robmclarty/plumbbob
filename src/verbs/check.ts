// `plumbbob check` — run the heavy gate (D16/D24) and report, with NO state
// change. The read-only half of the verify tick: `/plumbbob:verify` runs this before the
// pause so the human approves on a known-green check. Exits with the check's own
// code (0 = green).

import { findRepoRoot } from '../lib/git.ts'
import { hasSession } from '../lib/sidecar.ts'
import { runCheck } from '../lib/check.ts'

export function check(cwd: string): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }
  const code = runCheck(root)
  process.stdout.write(code === 0 ? '\nplumbbob: check green.\n' : '\nplumbbob: check RED — fix it before checkpointing.\n')
  return code
}
