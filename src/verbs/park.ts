// `plumbline park "<text>"` — the dumb capture path: append one raw line under
// the build-log's Park list. No model turn, no composition (that is /park's job).
// Exempt from the CLAUDECODE transition refusal so capture is always available.

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { hasSession, buildLogPath } from '../lib/sidecar.ts'

export function park(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(
      'plumbline: no active session — nothing to park to. Run `plumbline start "<title>"` first.\n',
    )
    return 1
  }
  const text = args
    .filter((a) => !a.startsWith('--'))
    .join(' ')
    .trim()
  if (text.length === 0) {
    process.stderr.write('plumbline: park needs text. Try: plumbline park "the idea you do not want to chase right now".\n')
    return 1
  }
  const path = buildLogPath(root)
  const updated = insertParkItem(readFileSync(path, 'utf8'), text)
  if (updated === null) {
    process.stderr.write('plumbline: could not find a "## Park list" section in build-log.md.\n')
    return 1
  }
  writeFileSync(path, updated)
  process.stdout.write(`parked: ${text}\n`)
  return 0
}

// Append after the last non-blank line of the Park list section (i.e. just before
// the next `## ` heading). Returns null if there is no Park list to append to.
function insertParkItem(content: string, text: string): string | null {
  const lines = content.split('\n')
  const headingIdx = lines.findIndex((line) => line.trim() === '## Park list')
  if (headingIdx === -1) {
    return null
  }
  let nextSection = lines.findIndex((line, i) => i > headingIdx && line.startsWith('## '))
  if (nextSection === -1) {
    nextSection = lines.length
  }
  let insertAt = headingIdx + 1
  for (let i = headingIdx + 1; i < nextSection; i++) {
    if ((lines[i] ?? '').trim() !== '') {
      insertAt = i + 1
    }
  }
  lines.splice(insertAt, 0, `- [ ] ${text}`)
  return lines.join('\n')
}
