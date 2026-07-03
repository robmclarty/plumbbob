// `plumbbob status` — the orientation dashboard (D8/D15), or NO ACTIVE SESSION.
// Read-only, always exits 0. Skills pre-inject this output to gate their own
// behavior, so the `NO ACTIVE SESSION` sentinel is kept exact.

import { readFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import {
  buildLogPath,
  checkpointsPath,
  hasSession,
  inSpike,
  intentPath,
  listBuilds,
  resolveBuild,
  stepPath,
} from '../lib/sidecar.ts'
import { formatOrientation, orient } from '../lib/orient.ts'

function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

export function status(cwd: string, args: ReadonlyArray<string> = []): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stdout.write('NO ACTIVE SESSION\n')
    return 0
  }
  // A session with builds but no resolvable cursor (finish cleared it, or the repo
  // holds several builds and none is active) has no single dashboard to show, so
  // list the builds and point at `use` instead of rendering a broken, empty one.
  const { build: slug } = resolveBuild(root, args)
  if (slug === null) {
    const builds = listBuilds(root)
    if (builds.length > 0) {
      process.stdout.write(
        `NO ACTIVE BUILD — pick one with \`plumbbob use <slug>\`:\n${builds.map((b) => `  ${b}`).join('\n')}\n`,
      )
      return 0
    }
  }
  const inFlightRaw = readOr(stepPath(root, slug)).trim()
  const orientation = orient({
    intent: readOr(intentPath(root, slug)),
    buildLog: readOr(buildLogPath(root, slug)),
    checkpoints: readOr(checkpointsPath(root, slug)),
    inFlight: /^\d+$/.test(inFlightRaw) ? Number(inFlightRaw) : null,
    spiking: inSpike(root, slug),
  })
  process.stdout.write(`${formatOrientation(orientation)}\n`)
  return 0
}
