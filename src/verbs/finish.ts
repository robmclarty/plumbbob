// `plumbbob finish` (D9/D34) — the close-out: append the checkpoint SHAs to the
// report, make the final commit, and clear the control state. The build folder is
// NOT deleted — it IS the archive now (D29): tracked, it merges with the branch and
// shows up in the PR, so nothing is copied into a local-only `archive/` (that
// helper retired with this step). No refuse-without-report gate — guidance offers
// the artifact, it does not wall the exit (D9). Git footprint stays additive (C5):
// one forward commit under the greppable `plumbbob: finish — <title>` subject.

import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { commit, findRepoRoot, isDirty, stageAll } from '../lib/git.ts'
import {
  checkpointsPath,
  hasSession,
  intentPath,
  reportPath,
  resolveBuild,
  seamPath,
  sidecarDir,
  spikePath,
  stepPath,
} from '../lib/sidecar.ts'
import { setLocalSetting } from '../lib/settings.ts'
import { parseTitle } from '../lib/orient.ts'

export function finish(cwd: string, args: ReadonlyArray<string> = []): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug } = resolveBuild(root, args)

  if (existsSync(reportPath(root, slug))) {
    appendCheckpointShas(root, slug)
  } else {
    process.stderr.write(
      'plumbbob: note — no report.md found; finishing without one ' +
        '(/pb-finish normally writes the report first). No gate (D9).\n',
    )
  }

  // The final commit (D34): stage the report just written plus the build folder's
  // tail (the last step's checkpoint line lands one commit late, D37) and commit it
  // under the greppable `finish` subject. `--allow-empty` (via `commit`) still marks
  // the narrative endpoint when the tree is already clean, or under `--local`, where
  // the whole sidecar is excluded and there is nothing tracked to stage.
  if (isDirty(root)) {
    stageAll(root)
  }
  const sha = commit(root, subject(root, slug), bodyArg(args) ?? undefined)

  // Clear the control state: the in-flight markers, the per-worktree cursor (D28),
  // and the session sentinel (STATE last, so "no session" flips exactly at the end).
  // The tracked artifacts stay in place — only the ephemera go.
  rmSync(seamPath(root, slug), { force: true })
  rmSync(stepPath(root, slug), { force: true })
  rmSync(spikePath(root, slug), { force: true })
  if (slug !== null) {
    // Drop the activeBuild key — JSON.stringify omits an `undefined` value, so the
    // cursor is removed while the other local settings (auto, …) survive. Skipped
    // under `--local`, where there is no cursor to clear.
    setLocalSetting(root, 'activeBuild', undefined)
  }
  rmSync(join(sidecarDir(root), 'STATE'), { force: true })

  const where = slug === null ? '.plumbbob/' : `.plumbbob/builds/${slug}/`
  process.stdout.write(
    `plumbbob: finished — ${sha.slice(0, 9)}. ${where} rides your branch into the PR. ` +
      'Run `/pb-plan` (or `plumbbob start "<title>"`) to frame the next goal.\n',
  )
  return 0
}

// The CLI-owned final-commit subject (D34): `plumbbob: finish — <title>`, mirroring
// the step-checkpoint format exactly so one greppable shape spans the whole history.
// Falls back to a bare `plumbbob: finish` when intent.md carries no title.
function subject(root: string, slug: string | null): string {
  let title: string | null = null
  try {
    title = parseTitle(readFileSync(intentPath(root, slug), 'utf8'))
  } catch {
    title = null
  }
  return title ? `plumbbob: finish — ${title}` : 'plumbbob: finish'
}

// `--body` reads the final-commit body from stdin (the single-quoted heredoc of
// D34), so the pb-finish skill can compose a proportional close-out message. Returns
// null when the flag is absent or stdin is empty — the commit then carries subject
// only. A read error (no stdin attached) degrades to null rather than throwing.
function bodyArg(args: ReadonlyArray<string>): string | null {
  if (!args.includes('--body')) {
    return null
  }
  try {
    const raw = readFileSync(0, 'utf8').trimEnd()
    return raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

// Append the recorded checkpoints (baseline + each `step n <sha>`) to report.md as a
// `## Checkpoints` section, so the report — which now rides the branch into the PR —
// lists the SHAs. Best-effort: an unreadable checkpoints file yields an empty list.
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
  appendFileSync(reportPath(root, slug), ['', '## Checkpoints', '', ...lines, ''].join('\n'))
}
