// `plumbbob mode <x>` — the hidden escape hatch: set STATE directly when reality
// and the machine desync. Not part of the normal flow; a transition verb, so the
// dispatch refuses it under CLAUDECODE (D21).

import { findRepoRoot } from '../lib/git.ts'
import { hasSession, readState, writeState, VALID_STATES } from '../lib/sidecar.ts'

export function mode(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }
  const target = args[0]
  if (target === undefined) {
    process.stderr.write(`plumbbob: mode needs a state — one of: ${VALID_STATES.join(', ')}.\n`)
    return 1
  }
  if (!VALID_STATES.includes(target)) {
    process.stderr.write(`plumbbob: '${target}' is not a valid state — one of: ${VALID_STATES.join(', ')}.\n`)
    return 1
  }
  const previous = readState(root) ?? 'UNKNOWN'
  writeState(root, target)
  process.stdout.write(`STATE: ${previous} -> ${target} (escape hatch — prefer the normal verbs when you can).\n`)
  return 0
}
