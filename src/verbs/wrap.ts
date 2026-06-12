// `plumbbob wrap` (D19/D28) — the FINISH-entry verb. Sets STATE=FINISH so
// /plumbbob-report can write report.md and /plumbbob-docs can touch docs/.
// `finish` stays the closing gate; wrap just opens the one state where
// documentation may be projected. A transition verb, so dispatch refuses it under
// CLAUDECODE (D21).

import { findRepoRoot } from '../lib/git.ts'
import { hasSession, readState, writeState } from '../lib/sidecar.ts'

export function wrap(cwd: string): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }
  const state = readState(root)
  if (state === 'FINISH') {
    process.stdout.write('plumbbob: already in FINISH. Run `/plumbbob-report`, then `plumbbob finish` to close.\n')
    return 0
  }
  if (state !== 'DESIGN') {
    process.stderr.write(
      `plumbbob: wrap enters FINISH from DESIGN (current state is ${state ?? 'UNKNOWN'}). ` +
        'Close the current step first — `done` from BUILD/REVIEW, or `spike done` from SPIKE.\n',
    )
    return 1
  }
  writeState(root, 'FINISH')
  process.stdout.write(
    'plumbbob: STATE=FINISH. Now `/plumbbob-report` writes the report (and `/plumbbob-docs` may touch docs/); ' +
      'then `plumbbob finish` archives and closes.\n',
  )
  return 0
}
