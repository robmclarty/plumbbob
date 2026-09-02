// `plumbbob finish`: the close-out. It appends the checkpoint SHAs and per-step
// stats to report.md, makes the final commit, and clears the control state (the
// untracked session and step markers under `.plumbbob/`). The build folder is NOT
// deleted; the tracked `.plumbbob/builds/<slug>/` folder IS the archive: it
// merges with the branch and shows up in the PR, so nothing is copied into a
// separate local archive. A missing report never blocks the exit: guidance
// offers the artifact, it does not wall the door. The git footprint stays
// additive: one forward commit under the Conventional `chore(<scope>): finish`
// subject, with the `plumbbob finish` identifier riding a marker line at the head
// of the body so `git log --grep plumbbob` still finds it. The turn's forward
// pointer is printed here rather than by `handoff`, the one ending handoff
// cannot render: finish has just cleared the session it would read from.

import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { commit, findRepoRoot, isDirty, stageAll } from '../lib/git.ts'
import { readCommitBody } from '../lib/commitbody.ts'
import {
  buildScope,
  checkpointsPath,
  clearTick,
  hasSession,
  intentPath,
  readStats,
  refreshExcludes,
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
import { notice, transition } from '../lib/notice.ts'

// The pointer finish leaves the turn on. Every other one is `handoff`'s, but a
// finished session has no state left to render from, and past a closed build
// the only move is framing the next goal.
const NEXT_UP = '**Next Up**: Nothing planned - /plumbbob:plan'

/**
 * Close out the active build: report tail, final commit, control-state cleanup.
 *
 * Requires an active session (the `.plumbbob/STATE` sentinel). When report.md
 * exists it gains a `## Checkpoints` SHA list and a `## Stats` table first; when
 * it doesn't, finish notes the absence and proceeds; the exit is never gated on
 * a report.
 */
export function finish(cwd: string, args: ReadonlyArray<string> = []): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' }))
    return 1
  }

  // Checked before any of finish's writes: appendCheckpointShas/appendStats
  // are plain appends, not idempotent, so a refusal after they ran would
  // duplicate those sections on retry. A socket stdin can never deliver the
  // requested body, so there is nothing to do first.
  const bodyResult = readCommitBody(args)
  if (!bodyResult.ok) {
    process.stderr.write(bodyResult.message)
    return 1
  }

  const { build: slug } = resolveBuild(root, args)

  const reported = existsSync(reportPath(root, slug))
  if (reported) {
    appendCheckpointShas(root, slug)
    appendStats(root, slug)
  }

  // The final commit: stage the report just written plus the build folder's tail
  // (a step's commit sweeps its own bookkeeping along with the work, so the last
  // step's `checkpoints` line lands one commit late and finish absorbs it) and
  // commit under the `finish` subject. `--allow-empty` (via `commit`) still marks
  // the narrative endpoint when the tree is already clean, or under `--local`,
  // where the whole sidecar is git-excluded and there is nothing tracked to stage.
  refreshExcludes(root)
  if (isDirty(root)) {
    stageAll(root)
  }
  const sha = commit(root, subject(root, slug), withMarker('plumbbob finish', bodyResult.body ?? undefined))

  // Clear the control state: the in-flight markers first, then the session
  // sentinel last (so "no session" flips exactly at the end). Deleting STATE also
  // drops the active-build cursor: cursor and session share that one file, so a
  // single delete does both. The tracked artifacts stay in place; only the
  // ephemera go.
  rmSync(seamPath(root, slug), { force: true })
  rmSync(stepPath(root, slug), { force: true })
  rmSync(spikePath(root, slug), { force: true })
  // The checkpoint latch's per-build entry stamp and the one-turn self-approval
  // grant go with the session: a grant lives one turn by construction, but only
  // because every tick rewrites it: the session's last tick was the last rewrite,
  // so left behind, a stale `auto` could self-approve the next session's first
  // landing.
  clearTick(root, slug)
  setGrant(root, null)
  rmSync(join(sidecarDir(root), 'STATE'), { force: true })

  const where = slug === null ? '.plumbbob/' : `.plumbbob/builds/${slug}/`
  process.stdout.write(
    transition({ label: 'Session', fact: 'finished', detail: [sha.slice(0, 9), `${where} rides your branch into the PR`] }),
  )
  // The advisory follows the line it qualifies. Finishing without a report is
  // guidance, never a gate: the session is already closed by the time it prints.
  if (!reported) {
    process.stderr.write(
      notice({
        fact: 'no report.md found',
        advisory: true,
        detail: ['finished without one', 'no gate here by design'],
        remedy: '/plumbbob:finish normally writes the report first',
      }),
    )
  }
  // Last, under the fixed order of every ending: the verb's own line, its
  // advisories, a blank line, then the pointer, which is the turn's last text.
  process.stdout.write(`\n${NEXT_UP}\n\n`)
  return 0
}

/**
 * The CLI-owned final-commit subject: `chore(<scope>): finish`.
 *
 * The scope resolves through the same build-default fallback chain as the plan
 * and step subjects: the intent.md `**Scope:**` header field, else the build
 * slug, else bare (for example `--local`). The `plumbbob finish` identifier rides the
 * body marker, not the subject.
 */
function subject(root: string, slug: string | null): string {
  return conventionalSubject({ type: 'chore', scope: buildDefaultScope(root, slug), description: 'finish' })
}

/**
 * Resolve the commit scope: the intent.md `**Scope:**` header, else the slug.
 *
 * Twin of checkpoint.ts's helper: same fallback chain, but with this verb's own
 * `slug` resolution instead of the active-build cursor.
 */
function buildDefaultScope(root: string, slug: string | null): string | null {
  try {
    const fromHeader = parseBuildScope(readFileSync(intentPath(root, slug), 'utf8'))
    if (fromHeader !== null) {
      return fromHeader
    }
  } catch {
    // no intent.md: fall through to the slug rung.
  }
  return buildScope(slug)
}

/**
 * Roll the per-step receipts into report.md as a `## Stats` table.
 *
 * One row per step plus totals (red checks, drift warnings, reverts,
 * wall-clock) so "is the loop worth it?" is a table, not a feeling. Silently
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
      '| ---- | ---------- | -------------- | ------- | ---------- |',
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
 * An em dash when unknown (a hand-built step never ran `build <n>`, so it has no
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
