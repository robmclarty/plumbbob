// `plumbbob park "<text>"` — the dumb capture path: append one raw line under
// the build-log's Park list. No model turn, no composition (that is /plumbbob:pb-park's job).
// Capture is not a transition, so it runs in any context (terminal or in-session).

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { hasSession, buildLogPath } from '../lib/sidecar.ts'
import { appendToSection } from '../lib/buildlog.ts'

export function park(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(
      'plumbbob: no active session — nothing to park to. Run `plumbbob start "<title>"` first.\n',
    )
    return 1
  }
  const text = args
    .filter((a) => !a.startsWith('--'))
    .join(' ')
    .trim()
  if (text.length === 0) {
    process.stderr.write('plumbbob: park needs text. Try: plumbbob park "the idea you do not want to chase right now".\n')
    return 1
  }
  const path = buildLogPath(root)
  const updated = appendToSection(readFileSync(path, 'utf8'), 'Park list', `- [ ] ${text}`)
  if (updated === null) {
    process.stderr.write('plumbbob: could not find a "## Park list" section in build-log.md.\n')
    return 1
  }
  writeFileSync(path, updated)
  process.stdout.write(`parked: ${text}\n`)
  return 0
}
