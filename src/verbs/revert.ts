// `plumbline revert [--to n]` — git reset --hard to a checkpoint SHA (the most
// recent step, or `--to n`, with the baseline as fallback), then remove untracked
// files under the SEAM only. The sidecar is git-excluded (D17), so the reset
// never touches it — park lines and intent edits survive the revert (C4).

import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { findRepoRoot, resetHard, untrackedPaths } from '../lib/git.ts'
import { checkpointsPath, hasSession, seamPath, stepPath, writeState } from '../lib/sidecar.ts'
import { matchesSeam } from '../lib/intent.ts'

export function revert(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbline: no active session. Run `plumbline start "<title>"` first.\n')
    return 1
  }

  const to = parseTo(args)
  if (to === 'invalid') {
    process.stderr.write('plumbline: revert --to needs a step number. Try: plumbline revert --to 2.\n')
    return 1
  }

  const checkpoints = readCheckpoints(root)
  let sha: string | undefined
  if (to === null) {
    sha = checkpoints.steps.at(-1)?.sha ?? checkpoints.baseline
  } else {
    const entry = checkpoints.steps.find((e) => e.n === to)
    if (entry === undefined) {
      process.stderr.write(`plumbline: no checkpoint recorded for step ${to}.\n`)
      return 1
    }
    sha = entry.sha
  }
  if (sha === undefined) {
    process.stderr.write('plumbline: no baseline recorded in checkpoints — cannot revert.\n')
    return 1
  }

  // Compute untracked-in-seam BEFORE the reset (reset --hard leaves untracked and
  // ignored files alone, so they must be removed explicitly afterward).
  const seam = readSeamTokens(root)
  const toRemove = untrackedPaths(root).filter((p) => matchesSeam(p, seam))

  resetHard(root, sha)
  for (const rel of toRemove) {
    rmSync(join(root, rel), { force: true, recursive: true })
  }
  rmSync(seamPath(root), { force: true })
  rmSync(stepPath(root), { force: true })
  writeState(root, 'DESIGN')

  process.stdout.write(
    `plumbline: reverted to ${sha.slice(0, 9)} — STATE=DESIGN. Park lines and intent edits were preserved.\n`,
  )
  return 0
}

function parseTo(args: ReadonlyArray<string>): number | null | 'invalid' {
  const idx = args.indexOf('--to')
  if (idx === -1) {
    return null
  }
  const raw = args[idx + 1]
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return 'invalid'
  }
  return Number(raw)
}

type Checkpoints = {
  readonly baseline: string | undefined
  readonly steps: ReadonlyArray<{ readonly n: number; readonly sha: string }>
}

function readCheckpoints(root: string): Checkpoints {
  let content = ''
  try {
    content = readFileSync(checkpointsPath(root), 'utf8')
  } catch {
    return { baseline: undefined, steps: [] }
  }
  let baseline: string | undefined
  const steps: Array<{ readonly n: number; readonly sha: string }> = []
  for (const line of content.split('\n')) {
    const baselineMatch = /^baseline\s+(\S+)/.exec(line)
    if (baselineMatch) {
      baseline = baselineMatch[1]
      continue
    }
    const stepMatch = /^step\s+(\d+)\s+(\S+)/.exec(line)
    if (stepMatch) {
      steps.push({ n: Number(stepMatch[1]), sha: stepMatch[2] ?? '' })
    }
  }
  return { baseline, steps }
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
