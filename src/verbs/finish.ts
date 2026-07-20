// `plumbbob finish` (D9/D68) — the close-out: append the checkpoint SHAs to the
// report, make the final commit, and clear the control state. The build folder is
// NOT deleted — it IS the archive now (D29): tracked, it merges with the branch and
// shows up in the PR, so nothing is copied into a local-only `archive/` (that
// helper retired with this step). No refuse-without-report gate — guidance offers
// the artifact, it does not wall the exit (D9). Git footprint stays additive (C5):
// one forward commit under the Conventional `chore(<scope>): finish` subject, its
// `plumbbob finish` identifier riding the body marker (D68).

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
  const sha = commit(root, subject(root, slug), withMarker('plumbbob finish', bodyArg(args) ?? undefined))

  // Clear the control state: the in-flight markers first, then the session sentinel
  // last (so "no session" flips exactly at the end). Deleting STATE also drops the
  // cursor (D28) — cursor and session share the one file now, so a single delete does
  // both. The tracked artifacts stay in place — only the ephemera go.
  rmSync(seamPath(root, slug), { force: true })
  rmSync(stepPath(root, slug), { force: true })
  rmSync(spikePath(root, slug), { force: true })
  // The latch's per-build entry stamp and the one-turn grant go with the session
  // (D64/D65): a grant is one-turn by construction, but the session's last tick is
  // the last time it was rewritten — left behind, a stale `auto` could self-approve
  // the next session's first landing.
  clearTick(root, slug)
  setGrant(root, null)
  rmSync(join(sidecarDir(root), 'STATE'), { force: true })

  const where = slug === null ? '.plumbbob/' : `.plumbbob/builds/${slug}/`
  process.stdout.write(
    `plumbbob: finished — ${sha.slice(0, 9)}. ${where} rides your branch into the PR. ` +
      'Run `/pb-plan` (or `plumbbob start "<title>"`) to frame the next goal.\n',
  )
  return 0
}

// The CLI-owned final-commit subject (D68): `chore(<scope>): finish`, the scope
// resolved through the same build-default fallback chain as plan/step subjects
// (D3/D4): the `**Scope:**` header field, else the build slug, else bare (e.g.
// `--local`). The `plumbbob finish` identifier rides the body marker, not the
// subject.
function subject(root: string, slug: string | null): string {
  return conventionalSubject({ type: 'chore', scope: buildDefaultScope(root, slug), description: 'finish' })
}

// See checkpoint.ts's twin of this helper (same fallback, this verb's own `slug`
// resolution instead of the active-build cursor).
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

// `--body` reads the final-commit body from stdin (the single-quoted heredoc of
// D34), so the pb-finish skill can compose a proportional close-out message. Returns
// null when the flag is absent or stdin is empty — the commit then carries subject
// only. Reading fd 0 blocks until EOF, which the heredoc supplies; a read error (no
// stdin attached) degrades to null, and an interactive TTY — which would never send
// EOF — skips the read instead of hanging (twin of checkpoint.ts's guard).
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

// Roll the per-step receipts (research/07 Build 2b) into report.md as a `## Stats`
// table — one row per step plus totals, so "is the loop worth it?" is a table,
// not a feeling. Silently skipped when nothing accrued (an old build, a build
// with no red/revert/drift and no `build <n>` stamps has nothing to say).
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

function wallClockMs(s: StepStats): number | null {
  if (s.startedAt === undefined || s.landedAt === undefined) {
    return null
  }
  const ms = Date.parse(s.landedAt) - Date.parse(s.startedAt)
  return Number.isFinite(ms) && ms >= 0 ? ms : null
}

// `—` when unknown (a hand-built step never ran `build <n>`, so it has no
// startedAt), `<1m` under a minute, whole minutes otherwise.
function formatWall(ms: number | null): string {
  if (ms === null) {
    return '—'
  }
  return ms < 60_000 ? '<1m' : `${Math.round(ms / 60_000)}m`
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
