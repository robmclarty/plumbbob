// `plumbbob wrap` (D9) — the v2 close-out, replacing the v1 four-verb
// finish ceremony. It archives intent + build-log + report
// (the `/pb-wrap` skill writes the report by default) under .plumbbob/archive/,
// clears the active files, and deletes the control state (STATE last). Unlike v1
// `finish` there is NO refuse-without-report gate — guidance offers the artifact, it
// does not wall the exit. Archive-then-clear, never destroy (C4); git untouched (C5).

import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { findRepoRoot } from '../lib/git.ts'
import { buildLogPath, checkpointsPath, hasSession, intentPath, seamPath, sidecarDir, stepPath } from '../lib/sidecar.ts'
import { archiveSession, reportPath } from '../lib/archive.ts'

export function wrap(cwd: string): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  if (existsSync(reportPath(root))) {
    appendCheckpointShas(root)
  } else {
    process.stderr.write(
      'plumbbob: note — no report.md found; archiving intent + build-log without one ' +
        '(/pb-wrap normally writes the report first). No gate (D9).\n',
    )
  }

  const archived = archiveSession(root)

  // Clear the active files — now safely archived — then the control state, STATE
  // last so "no session" flips exactly at the end.
  rmSync(intentPath(root), { force: true })
  rmSync(buildLogPath(root), { force: true })
  rmSync(reportPath(root), { force: true })
  rmSync(seamPath(root), { force: true })
  rmSync(stepPath(root), { force: true })
  rmSync(join(sidecarDir(root), 'STATE'), { force: true })

  process.stdout.write(
    `plumbbob: wrap — archived to ${relative(root, archived)}. Sidecar cleared. ` +
      'Run `/pb-plan` (or `plumbbob start "<title>"`) to frame the next goal.\n',
  )
  return 0
}

// Append the recorded checkpoints (baseline + each `step n <sha>`) to the report so
// the archived report lists the SHAs.
function appendCheckpointShas(root: string): void {
  let raw = ''
  try {
    raw = readFileSync(checkpointsPath(root), 'utf8')
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
