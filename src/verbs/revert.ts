// `plumbbob revert [--to n]` — git reset --hard to a checkpoint SHA (the most
// recent step, or `--to n`, with the baseline as fallback), then remove untracked
// files under the SEAM only (the seam is the in-flight step's flat list of
// granted edit paths). The artifact plane — the tracked `.plumbbob/builds/<slug>/`
// folder holding intent, build-log, checkpoints, and park lines — would not
// survive a bare reset: it would discard park lines and intent edits, or, when
// reverting to a baseline that predates the build folder, delete the folder
// wholesale. So revert snapshots the sidecar to temp and restores it as
// uncommitted changes after the reset — a rewind must never destroy recorded
// work, in either case. The untracked cleanup additionally whitelists the
// artifact plane, so no seam pattern can ever sweep away a build's own files.
//
// Plumbbob also installs its driver skills INTO the repo (.claude/skills/<driver>/
// for a self-contained install), so a blunt reset would discard an out-of-seam
// skill edit — or a `pnpm up plumbbob` re-setup — together with the half-done
// step. revert discards the step's WORK, never plumbbob's own machinery, so those
// paths are carried across the reset unchanged.

import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findRepoRoot, resetHard, untrackedPaths } from '../lib/git.ts'
import { bumpStepStat, checkpointsPath, hasSession, resolveBuild, seamPath, sidecarDir, stepPath } from '../lib/sidecar.ts'
import { isArtifactPath, matchesSeam } from '../lib/intent.ts'
import { AT_BOUNDARY, syncBuildLogState } from '../lib/buildlogsync.ts'

/**
 * Rewind to a recorded checkpoint and return the build to the boundary.
 *
 * Requires an active session (the `.plumbbob/STATE` sentinel). Resolves the
 * target SHA from the checkpoints ledger (latest step, `--to n`, or the
 * baseline), resets hard while preserving plumbbob-owned paths, removes
 * untracked files inside the seam, clears the in-flight STEP/SEAM markers, and
 * re-renders the build-log. Exit 1 with a hint on any refusal.
 */
export function revert(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug, rest } = resolveBuild(root, args)
  const to = parseTo(rest)
  if (to === 'invalid') {
    process.stderr.write('plumbbob: revert --to needs a step number. Try: plumbbob revert --to 2.\n')
    return 1
  }

  const checkpoints = readCheckpoints(root, slug)
  let sha: string | undefined
  if (to === null) {
    sha = checkpoints.steps.at(-1)?.sha ?? checkpoints.baseline
  } else {
    const entry = checkpoints.steps.find((e) => e.n === to)
    if (entry === undefined) {
      process.stderr.write(`plumbbob: no checkpoint recorded for step ${to}.\n`)
      return 1
    }
    sha = entry.sha
  }
  if (sha === undefined) {
    process.stderr.write('plumbbob: no baseline recorded in checkpoints — cannot revert.\n')
    return 1
  }

  // Compute untracked-in-seam BEFORE the reset (reset --hard leaves untracked and
  // ignored files alone, so they must be removed explicitly afterward).
  const seam = readSeamTokens(root, slug)
  const toRemove = untrackedPaths(root).filter((p) => matchesSeam(p, seam) && !isArtifactPath(p))
  // A revert against an in-flight step is a datapoint the finish report's stats
  // table wants — read the STEP marker before it goes, bump the counter after
  // the reset (the sidecar is preserved through it, so the write survives).
  const inFlight = readInFlightStep(root, slug)

  resetPreserving(root, sha, plumbbobOwnedPaths(root))
  for (const rel of toRemove) {
    rmSync(join(root, rel), { force: true, recursive: true })
  }
  rmSync(seamPath(root, slug), { force: true })
  rmSync(stepPath(root, slug), { force: true })
  if (inFlight !== null) {
    bumpStepStat(root, slug, inFlight, 'reverts')
  }
  // The step is abandoned: the build-log's Current-step line returns to the
  // boundary and its Steps mirror re-renders from the preserved intent.md —
  // revert keeps intent edits, so intent's checkboxes stay the truth to reflect.
  // Best-effort, like every build-log write.
  syncBuildLogState(root, slug, AT_BOUNDARY)

  process.stdout.write(
    `plumbbob: reverted to ${sha.slice(0, 9)} — back at the boundary. Park lines and intent edits were preserved.\n`,
  )
  return 0
}

/**
 * The repo paths that belong to plumbbob, not to the work being reverted.
 *
 * They are the sidecar (already git-excluded, listed so revert is robust even
 * where `.plumbbob/` was tracked by mistake) and each installed driver skill
 * under .claude/skills/. Skill names come from plumbbob's own bundled `skills/`
 * dir — the same source `setup` copies from — so only plumbbob's own skills are
 * protected, never the user's. Only paths that currently exist are returned.
 */
function plumbbobOwnedPaths(root: string): ReadonlyArray<string> {
  const paths = [sidecarDir(root)]
  try {
    for (const name of readdirSync(fileURLToPath(new URL('../../skills', import.meta.url)))) {
      paths.push(join(root, '.claude', 'skills', name))
    }
  } catch {
    // Bundled skills dir not resolvable (unexpected) — protect just the sidecar.
  }
  return paths.filter((p) => existsSync(p))
}

/**
 * `git reset --hard <sha>` with the given paths carried across it.
 *
 * The reset is repo-wide, so paths that must survive it are copied to a temp
 * snapshot first, then copied back over whatever the reset produced. Restoring
 * on top (no pre-delete) keeps the live sidecar safe if a copy throws.
 */
function resetPreserving(root: string, sha: string, preserve: ReadonlyArray<string>): void {
  const snap = mkdtempSync(join(tmpdir(), 'plumbbob-revert-'))
  try {
    preserve.forEach((p, i) => cpSync(p, join(snap, String(i)), { recursive: true }))
    resetHard(root, sha)
    preserve.forEach((p, i) => cpSync(join(snap, String(i)), p, { recursive: true }))
  } finally {
    rmSync(snap, { force: true, recursive: true })
  }
}

/**
 * Parse `--to <n>`: the step number, null when the flag is absent, or
 * 'invalid' when the flag lacks a numeric argument.
 */
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

/**
 * Parse the build's CHECKPOINTS record into a baseline sha and per-step shas.
 *
 * A missing or unreadable file yields an empty record — the caller then refuses
 * with its own message rather than crashing here.
 */
function readCheckpoints(root: string, slug: string | null): Checkpoints {
  let content = ''
  try {
    content = readFileSync(checkpointsPath(root, slug), 'utf8')
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

/**
 * Read the in-flight step's seam — its edit-grant paths, one per line.
 *
 * A missing or unreadable SEAM contributes nothing: no tokens, never an error.
 */
function readSeamTokens(root: string, slug: string | null): ReadonlyArray<string> {
  try {
    return readFileSync(seamPath(root, slug), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  } catch {
    return []
  }
}

/**
 * The in-flight STEP number, or null when none.
 *
 * Read for the revert receipt before the marker is cleared.
 */
function readInFlightStep(root: string, slug: string | null): number | null {
  try {
    const raw = readFileSync(stepPath(root, slug), 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}
