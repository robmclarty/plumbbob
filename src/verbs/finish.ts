// `plumbbob finish` — the close-out. It appends the checkpoint SHAs and per-step
// stats to report.md, makes the final commit, and clears the control state (the
// untracked session and step markers under `.plumbbob/`). The build folder is NOT
// deleted — the tracked `.plumbbob/builds/<slug>/` folder IS the archive: it
// merges with the branch and shows up in the PR, so nothing is copied into a
// separate local archive. A missing report never blocks the exit — guidance
// offers the artifact, it does not wall the door. The git footprint stays
// additive: one forward commit under the Conventional `chore(<scope>): finish`
// subject, with the `plumbbob finish` identifier riding a marker line at the head
// of the body so `git log --grep plumbbob` still finds it.

import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { commit, findRepoRoot, isDirty, stageAll } from '../lib/git.ts'
import {
  buildScope,
  checkpointsPath,
  clearTick,
  hasSession,
  intentPath,
  readStats,
  reportPath,
  resolveBuild,
  seamPath,
  setGrant,
  sidecarDir,
  spikePath,
  stepPath,
  type StepStats,
} from '../lib/sidecar.ts'
import { conventionalSubject, withMarker } from '../lib/commitmsg.ts'
import { parseBuildScope } from '../lib/intent.ts'

/**
 * Close out the active build: report tail, final commit, control-state cleanup.
 *
 * Requires an active session (the `.plumbbob/STATE` sentinel). When report.md
 * exists it gains a `## Checkpoints` SHA list and a `## Stats` table first; when
 * it doesn't, finish notes the absence and proceeds — the exit is never gated on
 * a report.
 */
export function finish(cwd: string, args: ReadonlyArray<string> = []): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug } = resolveBuild(root, args)

  if (existsSync(reportPath(root, slug))) {
    appendCheckpointShas(root, slug)
    appendStats(root, slug)
  } else {
    process.stderr.write(
      'plumbbob: note — no report.md found; finishing without one ' +
        '(/plumbbob:finish normally writes the report first). No gate (D9).\n',
    )
  }

  // The final commit: stage the report just written plus the build folder's tail —
  // a step's commit sweeps its own bookkeeping along with the work, so the last
  // step's `checkpoints` line lands one commit late and finish absorbs it — and
  // commit under the `finish` subject. `--allow-empty` (via `commit`) still marks
  // the narrative endpoint when the tree is already clean, or under `--local`,
  // where the whole sidecar is git-excluded and there is nothing tracked to stage.
  if (isDirty(root)) {
    stageAll(root)
  }
  const sha = commit(root, subject(root, slug), withMarker('plumbbob finish', bodyArg(args) ?? undefined))

  // Clear the control state: the in-flight markers first, then the session
  // sentinel last (so "no session" flips exactly at the end). Deleting STATE also
  // drops the active-build cursor — cursor and session share that one file, so a
  // single delete does both. The tracked artifacts stay in place — only the
  // ephemera go.
  rmSync(seamPath(root, slug), { force: true })
  rmSync(stepPath(root, slug), { force: true })
  rmSync(spikePath(root, slug), { force: true })
  // The checkpoint latch's per-build entry stamp and the one-turn self-approval
  // grant go with the session: a grant lives one turn by construction, but only
  // because every tick rewrites it — the session's last tick was the last rewrite,
  // so left behind, a stale `auto` could self-approve the next session's first
  // landing.
  clearTick(root, slug)
  setGrant(root, null)
  rmSync(join(sidecarDir(root), 'STATE'), { force: true })

  const where = slug === null ? '.plumbbob/' : `.plumbbob/builds/${slug}/`
  process.stdout.write(
    `plumbbob: finished — ${sha.slice(0, 9)}. ${where} rides your branch into the PR. ` +
      'Run `/plumbbob:plan` (or `plumbbob start "<title>"`) to frame the next goal.\n',
  )
  return 0
}

/**
 * The CLI-owned final-commit subject: `chore(<scope>): finish`.
 *
 * The scope resolves through the same build-default fallback chain as the plan
 * and step subjects: the intent.md `**Scope:**` header field, else the build
 * slug, else bare (e.g. `--local`). The `plumbbob finish` identifier rides the
 * body marker, not the subject.
 */
function subject(root: string, slug: string | null): string {
  return conventionalSubject({ type: 'chore', scope: buildDefaultScope(root, slug), description: 'finish' })
}

/**
 * Resolve the commit scope: the intent.md `**Scope:**` header, else the slug.
 *
 * Twin of checkpoint.ts's helper — same fallback chain, but with this verb's own
 * `slug` resolution instead of the active-build cursor.
 */
function buildDefaultScope(root: string, slug: string | null): string | null {
  try {
    const fromHeader = parseBuildScope(readFileSync(intentPath(root, slug), 'utf8'))
    if (fromHeader !== null) {
      return fromHeader
    }
  } catch {
    // no intent.md — fall through to the slug rung.
  }
  return buildScope(slug)
}

/**
 * Read the `--body` final-commit body from stdin, or null.
 *
 * The body arrives as a single-quoted stdin heredoc — the CLI owns every commit
 * subject, but the finish skill composes a proportional close-out body this
 * way. Returns null when the flag is absent or stdin is empty; the commit then
 * carries subject only. Reading fd 0 blocks until EOF, which the heredoc
 * supplies; a read error (no stdin attached) degrades to null, and an
 * interactive TTY — which would never send EOF — skips the read instead of
 * hanging (twin of checkpoint.ts's guard).
 */
function bodyArg(args: ReadonlyArray<string>): string | null {
  if (!args.includes('--body') || process.stdin.isTTY === true) {
    return null
  }
  try {
    const raw = readFileSync(0, 'utf8').trimEnd()
    return raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

/**
 * Roll the per-step receipts into report.md as a `## Stats` table.
 *
 * One row per step plus totals — red checks, drift warnings, reverts,
 * wall-clock — so "is the loop worth it?" is a table, not a feeling. Silently
 * skipped when nothing accrued (a build with no red/revert/drift and no
 * `build <n>` stamps has nothing to say).
 */
function appendStats(root: string, slug: string | null): void {
  const stats = readStats(root, slug)
  const steps = Object.keys(stats)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (steps.length === 0) {
    return
  }
  const totals = { redChecks: 0, driftWarnings: 0, reverts: 0, wallMs: 0 }
  const rows = steps.map((n) => {
    const s = stats[String(n)] ?? {}
    totals.redChecks += s.redChecks ?? 0
    totals.driftWarnings += s.driftWarnings ?? 0
    totals.reverts += s.reverts ?? 0
    const wall = wallClockMs(s)
    totals.wallMs += wall ?? 0
    return `| ${n} | ${s.redChecks ?? 0} | ${s.driftWarnings ?? 0} | ${s.reverts ?? 0} | ${formatWall(wall)} |`
  })
  appendFileSync(
    reportPath(root, slug),
    [
      '',
      '## Stats',
      '',
      '| step | red checks | drift warnings | reverts | wall-clock |',
      '|------|------------|----------------|---------|------------|',
      ...rows,
      `| **total** | ${totals.redChecks} | ${totals.driftWarnings} | ${totals.reverts} | ${formatWall(totals.wallMs > 0 ? totals.wallMs : null)} |`,
      '',
    ].join('\n'),
  )
}

/**
 * Milliseconds from a step's entry stamp to its landing stamp, or null when
 * either timestamp is missing or malformed.
 */
function wallClockMs(s: StepStats): number | null {
  if (s.startedAt === undefined || s.landedAt === undefined) {
    return null
  }
  const ms = Date.parse(s.landedAt) - Date.parse(s.startedAt)
  return Number.isFinite(ms) && ms >= 0 ? ms : null
}

/**
 * Format a wall-clock duration for the stats table.
 *
 * `—` when unknown (a hand-built step never ran `build <n>`, so it has no
 * startedAt), `<1m` under a minute, whole minutes otherwise.
 */
function formatWall(ms: number | null): string {
  if (ms === null) {
    return '—'
  }
  return ms < 60_000 ? '<1m' : `${Math.round(ms / 60_000)}m`
}

/**
 * Append the recorded checkpoints (baseline + each `step n <sha>`) to report.md
 * as a `## Checkpoints` section.
 *
 * The report rides the branch into the PR, so it carries the SHAs with it.
 * Best-effort: an unreadable checkpoints file yields an empty list.
 */
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
