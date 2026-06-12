// `plumbbob status` — print the session state, or NO ACTIVE SESSION. Read-only,
// always exits 0. Skills pre-inject this output to gate their own behavior.

import { findRepoRoot } from '../lib/git.ts'
import { hasSession, readState } from '../lib/sidecar.ts'

export function status(cwd: string): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stdout.write('NO ACTIVE SESSION\n')
    return 0
  }
  process.stdout.write(`STATE: ${readState(root) ?? 'UNKNOWN'}\n`)
  return 0
}
