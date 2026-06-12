// `plumbline review` — run the heavy check from BUILD. Green flips to REVIEW (the
// muzzle goes back on so reading the diff can't slide into editing). Red stays in
// BUILD. The state only advances on a green check.

import { findRepoRoot } from '../lib/git.ts'
import { hasSession, readState, writeState } from '../lib/sidecar.ts'
import { runCheck } from '../lib/check.ts'

export function review(cwd: string): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbline: no active session. Run `plumbline start "<title>"` first.\n')
    return 1
  }
  if (readState(root) !== 'BUILD') {
    process.stderr.write(`plumbline: review runs from BUILD (current state is ${readState(root) ?? 'UNKNOWN'}). Run \`plumbline build <n>\` first.\n`)
    return 1
  }

  if (runCheck(root) !== 0) {
    process.stderr.write('plumbline: check failed (red) — staying in BUILD. Fix it and re-run `review` (or `done` once green).\n')
    return 1
  }

  writeState(root, 'REVIEW')
  process.stdout.write(
    'plumbline: check green — STATE=REVIEW. Read the diff against intent.md (edits muzzled). `build <n>` to re-enter and fix, or `done` to checkpoint.\n',
  )
  return 0
}
