// `plumbbob park "<text>"`: the raw capture path for a thought you don't want
// to chase mid-step: append one flat line under the "## Park list" section of
// build-log.md (the build's human-facing ledger). Capture stays dumb by design:
// a grep-readable append, no markdown parsing, no model turn (wording the line
// well is /plumbbob:park's job); triage waits for a step boundary, via harvest.
// Capture is not a state transition, so it runs in any context (terminal or
// in-session).

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { hasSession, buildLogPath } from '../lib/sidecar.ts'
import { appendToSection } from '../lib/buildlog.ts'
import { notice } from '../lib/notice.ts'

/**
 * Append the given text as one unchecked `- [ ]` line to the build-log's Park list.
 *
 * All non-flag args join into a single line. Refuses when there is no active
 * session, when the text is empty, or when build-log.md lacks a "## Park list"
 * section: a park line must never vanish silently.
 */
export function park(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(
      notice({ fact: 'no active session', detail: ['nothing to park to'], remedy: 'plumbbob start "<title>"' }),
    )
    return 1
  }
  const text = args
    .filter((a) => !a.startsWith('--'))
    .join(' ')
    .trim()
  if (text.length === 0) {
    process.stderr.write(
      notice({ fact: 'park needs text', remedy: 'plumbbob park "the idea you do not want to chase right now"' }),
    )
    return 1
  }
  const path = buildLogPath(root)
  const updated = appendToSection(readFileSync(path, 'utf8'), 'Park list', `- [ ] ${text}`)
  if (updated === null) {
    process.stderr.write(
      notice({ fact: 'no "## Park list" section in build-log.md', remedy: 'add the section, then park again' }),
    )
    return 1
  }
  writeFileSync(path, updated)
  process.stdout.write(notice({ prefix: 'parked', fact: text }))
  return 0
}
