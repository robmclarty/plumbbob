// `plumbline finish` (D19/D20) — the closing gate, symmetric with the step gate.
// Refuses unless a report exists, appends the checkpoint SHA list to it, archives
// intent + build-log + report under .plumbline/archive/, clears the active files,
// and deletes SEAM, STEP, then STATE LAST (deleting STATE is what switches the
// muzzle off, so it happens exactly at session end). Never touches git (C5).

import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { findRepoRoot } from '../lib/git.ts'
import {
  buildLogPath,
  checkpointsPath,
  hasSession,
  intentPath,
  seamPath,
  sidecarDir,
  stepPath,
} from '../lib/sidecar.ts'
import { archiveSession, reportPath } from '../lib/archive.ts'

export function finish(cwd: string): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbline: no active session. Run `plumbline start "<title>"` first.\n')
    return 1
  }
  if (!existsSync(reportPath(root))) {
    process.stderr.write(
      'plumbline: finish refuses without a report — run `/plumbline-report` first (it writes .plumbline/report.md). ' +
        'The closing gate is symmetric with the step gate: you do not walk away without capturing what happened.\n',
    )
    return 1
  }

  appendCheckpointShas(root)
  const archived = archiveSession(root)

  // Clear the active files — now safely archived.
  rmSync(intentPath(root), { force: true })
  rmSync(buildLogPath(root), { force: true })
  rmSync(reportPath(root), { force: true })

  // Delete the control files LAST, STATE the very last: while STATE exists the
  // muzzle is live, so it comes off only once everything else is torn down.
  rmSync(seamPath(root), { force: true })
  rmSync(stepPath(root), { force: true })
  rmSync(join(sidecarDir(root), 'STATE'), { force: true })

  process.stdout.write(
    `plumbline: finished — archived to ${relative(root, archived)}. STATE cleared (muzzle off). ` +
      'Run `plumbline start "<title>"` to begin the next task.\n',
  )
  return 0
}

// Append the recorded checkpoints (baseline + each `step n <sha>`) to the report,
// so the archived report lists the SHAs (spec: "finish lists the SHAs in the
// report").
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
