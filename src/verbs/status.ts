// `plumbbob status` — the orientation dashboard (D8/D15), or NO ACTIVE SESSION.
// Read-only, always exits 0. Skills pre-inject this output to gate their own
// behavior, so the `NO ACTIVE SESSION` sentinel is kept exact.

import { readFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { buildLogPath, checkpointsPath, hasSession, intentPath, readState, stepPath } from '../lib/sidecar.ts'
import { formatOrientation, orient } from '../lib/orient.ts'

function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

export function status(cwd: string): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stdout.write('NO ACTIVE SESSION\n')
    return 0
  }
  const inFlightRaw = readOr(stepPath(root)).trim()
  const orientation = orient({
    state: readState(root) ?? 'UNKNOWN',
    intent: readOr(intentPath(root)),
    buildLog: readOr(buildLogPath(root)),
    checkpoints: readOr(checkpointsPath(root)),
    inFlight: /^\d+$/.test(inFlightRaw) ? Number(inFlightRaw) : null,
  })
  process.stdout.write(`${formatOrientation(orientation)}\n`)
  return 0
}
