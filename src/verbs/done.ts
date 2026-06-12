// `plumbbob done` — the step gate. Refuses on a red check, then stages the whole
// step (D8: `git add -A`; the sidecar is git-excluded so it never lands), warns
// about anything committed outside the SEAM, takes the checkpoint commit, records
// its SHA, and returns to DESIGN.

import { appendFileSync, readFileSync, rmSync } from 'node:fs'
import { commit, findRepoRoot, stageAll, stagedPaths } from '../lib/git.ts'
import { checkpointsPath, hasSession, readState, seamPath, stepPath, writeState } from '../lib/sidecar.ts'
import { runCheck } from '../lib/check.ts'
import { matchesSeam } from '../lib/intent.ts'

export function done(cwd: string): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }
  const state = readState(root)
  if (state !== 'BUILD' && state !== 'REVIEW') {
    process.stderr.write(`plumbbob: done runs from BUILD or REVIEW (current state is ${state ?? 'UNKNOWN'}). Run \`plumbbob build <n>\` first.\n`)
    return 1
  }
  const step = readStepNumber(root)
  if (step === null) {
    process.stderr.write('plumbbob: no in-flight step — run `plumbbob build <n>` first.\n')
    return 1
  }

  if (runCheck(root) !== 0) {
    process.stderr.write('plumbbob: check failed (red) — done refuses on red. Fix it and re-run `done`.\n')
    return 1
  }

  stageAll(root)
  const seam = readSeamTokens(root)
  const outside = stagedPaths(root).filter((p) => !matchesSeam(p, seam))
  if (outside.length > 0) {
    process.stderr.write(
      `plumbbob: WARNING committed paths outside the SEAM: ${outside.join(', ')}. The checkpoint captures them, but scope drift may mean the plan needs revising.\n`,
    )
  }

  const sha = commit(root, `plumbbob: step ${step} done`)
  appendFileSync(checkpointsPath(root), `step ${step} ${sha}\n`)
  rmSync(seamPath(root), { force: true })
  rmSync(stepPath(root), { force: true })
  writeState(root, 'DESIGN')

  process.stdout.write(`plumbbob: step ${step} done — checkpoint ${sha.slice(0, 9)}. STATE=DESIGN.\n`)
  return 0
}

function readStepNumber(root: string): number | null {
  try {
    const raw = readFileSync(stepPath(root), 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}

function readSeamTokens(root: string): ReadonlyArray<string> {
  try {
    return readFileSync(seamPath(root), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  } catch {
    return []
  }
}
