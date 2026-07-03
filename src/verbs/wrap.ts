// `plumbbob wrap` (D9) — the close-out: one verb does the whole thing.
// It archives intent + build-log + report
// (the `/plumbbob:pb-wrap` skill writes the report by default) under .plumbbob/archive/,
// clears the active files, and deletes the control state (STATE last). There is
// NO refuse-without-report gate — guidance offers the artifact, it
// does not wall the exit. Archive-then-clear, never destroy (C4); git untouched (C5).

import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { findRepoRoot } from '../lib/git.ts'
import { buildLogPath, checkpointsPath, hasSession, intentPath, resolveBuild, seamPath, sidecarDir, spikePath, stepPath } from '../lib/sidecar.ts'
import { archiveSession, reportPath } from '../lib/archive.ts'

export function wrap(cwd: string, args: ReadonlyArray<string> = []): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug } = resolveBuild(root, args)

  if (existsSync(reportPath(root))) {
    appendCheckpointShas(root, slug)
  } else {
    process.stderr.write(
      'plumbbob: note — no report.md found; archiving intent + build-log without one ' +
        '(/plumbbob:pb-wrap normally writes the report first). No gate (D9).\n',
    )
  }

  const archived = archiveSession(root)

  // Clear the active files — now safely archived — then the control state, STATE
  // last so "no session" flips exactly at the end.
  rmSync(intentPath(root, slug), { force: true })
  rmSync(buildLogPath(root, slug), { force: true })
  rmSync(reportPath(root), { force: true })
  rmSync(seamPath(root, slug), { force: true })
  rmSync(stepPath(root, slug), { force: true })
  rmSync(spikePath(root, slug), { force: true })
  rmSync(join(sidecarDir(root), 'STATE'), { force: true })

  process.stdout.write(
    `plumbbob: wrap — archived to ${relative(root, archived)}. Sidecar cleared. ` +
      'Run `/plumbbob:pb-plan` (or `plumbbob start "<title>"`) to frame the next goal.\n',
  )
  return 0
}

// Append the recorded checkpoints (baseline + each `step n <sha>`) to the report so
// the archived report lists the SHAs.
function appendCheckpointShas(root: string, slug: string | null): void {
  let raw = ''
  try {
    raw = readFileSync(checkpointsPath(root, slug), 'utf8')
  } catch {
    raw = ''
  }
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => `- ${l}`)
  appendFileSync(reportPath(root), ['', '## Checkpoints', '', ...lines, ''].join('\n'))
}
