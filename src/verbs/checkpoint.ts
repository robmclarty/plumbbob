// `plumbbob checkpoint [<n>] [-m <msg>]`: the commit tick that lands a step.
// Executor-agnostic and author-blind: it reads the diff, not who wrote it, so a
// `/plumbbob:build` run, your own hands, a vibe session, or another harness all
// checkpoint identically. It does NOT require a STEP marker (the flat control
// file recording the step in flight): the step is whatever you pass, else the
// in-flight STEP, else the next undone step in intent.md. It evaluates the
// approval latch, gates on a green check, commits any pending work (or records
// the existing HEAD when the tree is already clean: the human's commit skill
// may have committed first), records the SHA, flips the intent checkbox to
// `[x]`, and clears the STEP/SEAM markers: returning the dashboard to the
// DESIGN boundary.

import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { commit, findRepoRoot, headSha, isDirty, stageAll, stagePath, stagedPaths, stagedStat } from '../lib/git.ts'
import {
  activeBuild,
  buildFolder,
  buildLogPath,
  buildScope,
  bumpStepStat,
  checkpointsPath,
  clearDetail,
  clearHandoff,
  clearTick,
  detailPath,
  hasSession,
  intentPath,
  readStats,
  refreshExcludes,
  seamPath,
  stampStepStat,
  stepPath,
} from '../lib/sidecar.ts'
import { runCheck } from '../lib/check.ts'
import { readCommitBody } from '../lib/commitbody.ts'
import { checkLatch } from '../lib/latch.ts'
import { markStepDone, parseSteps } from '../lib/orient.ts'
import { parseBuildScope, parseStepSeam, scopeDrift } from '../lib/intent.ts'
import { conventionalSubject, subjectFromTitle, withMarker } from '../lib/commitmsg.ts'
import { appendToSection, checkpointLogLine, logEntry, planLogLine } from '../lib/buildlog.ts'
import { AT_BOUNDARY, syncBuildLogState } from '../lib/buildlogsync.ts'
import { advisory, ending, notice, transition } from '../lib/notice.ts'
import { boundaryEnding, planRecord, stepRecord } from './handoff.ts'

/**
 * Land a step: latch, check gate, commit, record, return to the boundary.
 *
 * Exit 1 on any refusal: no session, no resolvable step, a latched tick, or a
 * red/broken check; each refusal says what unblocks it.
 */
export async function checkpoint(cwd: string, args: ReadonlyArray<string>): Promise<number> {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' }))
    return 1
  }

  // Before either staging path: `-A` below, and the plan commit's folder-scoped
  // add, which also leans on the excludes to skip the in-flight markers inside
  // the build folder.
  refreshExcludes(root)

  if (args.includes('--plan')) {
    return checkpointPlan(root, args)
  }

  const step = resolveStep(root, args)
  if (step === null) {
    process.stderr.write(
      notice({ fact: 'no step to checkpoint', remedy: 'pass a step number, or plan a step in intent.md first' }),
    )
    return 1
  }

  // Checked before the latch and the check gate: a socket stdin can never
  // deliver the requested body, so there is no point latching or running a
  // ~55s check only to discover that afterward.
  const bodyResult = readCommitBody(args)
  if (!bodyResult.ok) {
    process.stderr.write(bodyResult.message)
    return 1
  }

  // The approval latch runs before the check gate: cheap first. The tick may
  // not land without a human turn since the step was entered, a one-turn grant
  // the human typed, or a dormant ledger. A refusal is not an error: the
  // message is the pause affordance: exit 1 and hand the turn back.
  const latch = checkLatch(root, step)
  if (!latch.allow) {
    process.stderr.write(latch.message)
    return 1
  }

  const gate = await runCheck(root)
  if (gate !== 0) {
    if (gate === 1) {
      // Red attempts before green accrue as a per-step stat, surfaced in the
      // build-log receipt and the finish report. Harness breakage (exit 2) is
      // not a red check.
      bumpStepStat(root, undefined, step, 'redChecks')
    }
    process.stderr.write(
      gate === 2
        ? notice({
            fact: 'checkpoint refused',
            detail: ['the check gate itself broke'],
            remedy: 'fix the harness, then run it again',
          })
        : notice({ fact: 'checkpoint refused', detail: ['the check is red'], remedy: 'fix it, then run it again' }),
    )
    return 1
  }

  // The step's record, as the pause showed it: measured now, before the work
  // is staged, since the seam and diff rows read the working tree the way the
  // pause did. It lands in the build-log's Log beneath the dated line (the
  // tracked ledger is the archive, and it rides the branch where a commit body
  // would not survive the squash); the commit body keeps its marker and the
  // lead prose only.
  const record = stepRecord(root, activeBuild(root), step, readDetail(root) ?? '')
  let sha: string
  // The drift advisory is read off the index (staged, before the commit clears
  // it) but printed inside the ending below, where the fixed order puts it: the
  // fact, the Verdict it earned a rung on, then what qualifies it.
  let drift = ''
  if (isDirty(root)) {
    stageAll(root)
    drift = scopeDriftNotice(root, step)
    const body = withMarker(`plumbbob step ${step}`, bodyResult.body ?? fallbackBody(root, step))
    sha = commit(root, messageArg(args) ?? subjectForStep(root, step), body)
  } else {
    sha = headSha(root)
  }
  clearDetail(root) // the detail is recorded in the Log below; clear it so no stale detail rides into the next step.

  appendFileSync(checkpointsPath(root), `step ${step} ${sha}\n`)
  const flipNotice = flipIntent(root, step)
  stampStepStat(root, undefined, step, 'landedAt', new Date().toISOString())
  const pointer = logCheckpoint(root, step, sha, record)
  // The step landed: the build-log's ☐/☑ mirror flips and its Current-step line
  // returns to the boundary, re-read from the intent.md `flipIntent` just wrote.
  // The artifact-plane whitelist keeps this build-log write from ever reading as
  // scope drift.
  syncBuildLogState(root, activeBuild(root), AT_BOUNDARY)
  rmSync(seamPath(root), { force: true })
  rmSync(stepPath(root), { force: true })
  clearHandoff(root) // the agent-run handoff ledger is step-scoped; clear it with the markers.
  clearTick(root) // the step's entry stamp is spent; the next `build <n>` re-stamps.

  // The whole ending, one block: the lead line, the Verdict folded over what
  // just landed, the advisories this checkpoint alone can state, and the
  // pointer. Read after the flip and the ledger append, so the fold and the
  // pointer both see the boundary the human is standing at.
  const landed = boundaryEnding(root, activeBuild(root), step)
  process.stdout.write(
    ending({
      lead: transition({ label: 'Checkpoint', fact: `Step ${step} complete`, detail: leadDetail(sha, pointer) }),
      verdict: landed.verdict,
      advisories: [drift, flipNotice],
      pointer: landed.pointer,
    }),
  )
  return 0
}

/**
 * The plan-approval commit: stage only the build's artifact folder, commit it as
 * `chore(<scope>): plan`, and record a `plan <sha>` line.
 *
 * Giving the plan its own commit keeps the first step's diff from absorbing the
 * scaffold, so `git log` reads baseline → plan → steps. No check gate (there is
 * no code work to verify yet), no intent flip, no step markers: the plan lives
 * entirely in DESIGN. An optional `--body` (stdin heredoc) rides after the
 * `plumbbob plan` marker line; the folder is whitelisted artifact plane, so
 * there is no scope drift to warn about.
 */
function checkpointPlan(root: string, args: ReadonlyArray<string>): number {
  // The latch covers the plan commit too, keyed on the TICK that `start`
  // stamped: the plan pause is a real pause. No step number: a step-range
  // grant does not speak to a plan.
  const latch = checkLatch(root, null)
  if (!latch.allow) {
    process.stderr.write(latch.message)
    return 1
  }

  const bodyResult = readCommitBody(args)
  if (!bodyResult.ok) {
    process.stderr.write(bodyResult.message)
    return 1
  }

  // A repo that gitignores the sidecar (its `.gitignore`, not plumbbob's own
  // info/exclude) makes this folder-scoped add impossible; stagePath skips it
  // and reports false, and the plan still lands as a valid record-only commit:
  // its body carries the plan, the files stay untracked, and `--allow-empty`
  // (in commit) makes the empty diff legal. History still reads baseline → plan
  // → steps.
  const staged = stagePath(root, buildFolder(root))
  const sha = commit(root, planSubject(root), withMarker('plumbbob plan', bodyResult.body ?? undefined))
  appendFileSync(checkpointsPath(root), `plan ${sha}\n`)
  // The cold read that approved the plan is the Log's first entry, beneath a
  // dated plan line; the detail file is then spent, the same as at a step.
  const pointer = logPlan(root, sha, planRecord(readDetail(root) ?? ''))
  clearDetail(root)
  // Landing the plan consumes `start`'s entry stamp: a later hand-built diff
  // (no `build <n>`) must find no stale TICK and stay guidance-governed.
  clearTick(root)
  // No Verdict: the plan commit measures nothing. The pointer aims at the step
  // the build starts on, which is what `handoff` renders from a null step.
  process.stdout.write(
    ending({
      lead: transition({ label: 'Plan', fact: 'committed', detail: leadDetail(sha, pointer) }),
      advisories: staged
        ? []
        : [
            advisory({
              fact: 'the plan rides the commit message',
              detail: ['record-only', '.plumbbob/ is gitignored, so the files stay untracked'],
              remedy: 'unignore .plumbbob/builds/ to keep the record in the tree',
            }),
          ],
      pointer: boundaryEnding(root, activeBuild(root), null).pointer,
    }),
  )
  return 0
}

/**
 * Compose the plan commit's CLI-owned subject: `chore(<scope>): plan`.
 *
 * The scope resolves through the build-default fallback chain: a bare
 * `chore: plan` when none resolves. The `plumbbob plan` identifier rides the
 * body marker line, never the subject.
 */
function planSubject(root: string): string {
  return conventionalSubject({ type: 'chore', scope: buildDefaultScope(root), description: 'plan' })
}

/**
 * Resolve the step being checkpointed, or null when none can be determined.
 *
 * Explicit arg > in-flight STEP file > first undone step in intent.md. A `-m`
 * value is a message, never a step: `checkpoint -m "2"` must not read as
 * step 2.
 */
function resolveStep(root: string, args: ReadonlyArray<string>): number | null {
  const explicit = args.filter((_, i) => args[i - 1] !== '-m').find((a) => /^\d+$/.test(a))
  if (explicit !== undefined) {
    return Number(explicit)
  }
  const inFlight = readStep(root)
  if (inFlight !== null) {
    return inFlight
  }
  try {
    return parseSteps(readFileSync(intentPath(root), 'utf8')).find((s) => !s.done)?.n ?? null
  } catch {
    return null
  }
}

/**
 * The advisory (never a refusal) for a staged tree that reaches beyond the
 * step's seam, or '' when it held.
 *
 * Guidance, not a gate: the checkpoint captures the drift and says so, and the
 * bumped stat puts a `staged outside the seam` rung under the Verdict. The seam
 * (the step's edit grant: exact paths or `dir/` prefixes) comes from the
 * in-flight SEAM file when a build is live, else the step's declared seam in
 * intent.md. Plumbbob's own artifact plane is whitelisted inside `scopeDrift`,
 * so the `[x]` flip and build-log line this very checkpoint stages never read
 * as drift. No seam means no warning.
 */
function scopeDriftNotice(root: string, step: number): string {
  const seam = seamTokens(root, step)
  const outside = scopeDrift(stagedPaths(root), seam)
  if (outside.length === 0) return ''
  bumpStepStat(root, undefined, step, 'driftWarnings') // accrues into the build-log's stats receipt, and into the Verdict's third rung
  return advisory({
    fact: `staged paths reach outside Step ${step}'s seam`,
    detail: outside,
    remedy: 'the checkpoint captures them, so revise the plan with /plumbbob:step if that is real scope drift',
  })
}

/**
 * The seam tokens governing the in-flight step.
 *
 * The normalized SEAM file `build` wrote is authoritative while a build is
 * live; fall back to the step's declared seam parsed from intent.md. Empty when
 * neither resolves: the caller then skips the drift warning rather than
 * flagging the whole tree.
 */
function seamTokens(root: string, step: number): ReadonlyArray<string> {
  try {
    const fromFile = readFileSync(seamPath(root), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (fromFile.length > 0) {
      return fromFile
    }
  } catch {
    // no SEAM file: fall through to the declared seam.
  }
  return seamForStep(root, step)
}

/**
 * Flip the step's checkbox in intent.md to `[x]`.
 *
 * Best-effort bookkeeping (the checkpoint SHA is the source of truth) but the
 * dashboard reads intent.md, so a swallowed failure here would make orientation
 * lie; the catch returns the advisory asking for a hand flip, which the caller
 * folds into the ending. Returns '' on the happy path.
 */
function flipIntent(root: string, step: number): string {
  try {
    writeFileSync(intentPath(root), markStepDone(readFileSync(intentPath(root), 'utf8'), step))
    return ''
  } catch {
    return advisory({
      fact: `could not flip Step ${step} to [x] in intent.md`,
      detail: ['the checkpoint is recorded', `the dashboard still shows Step ${step} as next`],
      remedy: 'flip the checkbox by hand',
    })
  }
}

/**
 * The lead line's trailing parenthetical: the short SHA, and where the Log
 * entry landed when one did, as the same `details:` clause Next Up carries.
 */
function leadDetail(sha: string, pointer: string | null): string[] {
  return pointer === null ? [sha.slice(0, 9)] : [sha.slice(0, 9), `details: \`${pointer}\``]
}

/**
 * Append the step's entry to the build-log's `## Log` section: the dated line,
 * and beneath it the record of the pause when the model wrote one.
 *
 * The build's history accrues at each checkpoint instead of being reconstructed
 * at finish; the step's title is lifted from intent.md when still present.
 * Best-effort: a missing or odd build-log never blocks a checkpoint; the
 * `checkpoints` SHA is the source of truth. Returns where the line landed, as
 * `path:line` from the repo root, or null when nothing was written.
 */
function logCheckpoint(root: string, step: number, sha: string, record: string | null): string | null {
  const date = new Date().toISOString().slice(0, 10)
  return appendLog(root, checkpointLogLine(date, step, sha, titleForStep(root, step), statsSuffix(root, step)), record)
}

/**
 * Append the plan's entry to the Log: a dated `plan committed` line, and
 * beneath it the cold read that approved the plan when the model wrote one.
 */
function logPlan(root: string, sha: string, record: string | null): string | null {
  return appendLog(root, planLogLine(new Date().toISOString().slice(0, 10), sha), record)
}

/**
 * Write one Log entry and say where its dated line landed (`path:line` from
 * the repo root), or null when the section is missing or the write failed.
 */
function appendLog(root: string, line: string, record: string | null): string | null {
  try {
    const path = buildLogPath(root)
    const updated = appendToSection(readFileSync(path, 'utf8'), 'Log', logEntry(line, record))
    if (updated === null) {
      return null
    }
    writeFileSync(path, updated)
    const at = updated.split('\n').lastIndexOf(line)
    return at === -1 ? null : `${relative(root, path)}:${at + 1}`
  } catch {
    // best-effort ledger; never fail a checkpoint over the build-log.
    return null
  }
}

/**
 * The compact stats receipt riding the Log line, or null when nothing accrued.
 *
 * Only what happened is shown: a clean first-try step gets no suffix at all.
 * Wall-clock needs both stamps: a hand-built step never ran `build <n>`, so it
 * has no startedAt.
 */
function statsSuffix(root: string, step: number): string | null {
  const stats = readStats(root)[String(step)]
  if (stats === undefined) return null
  const parts: string[] = []
  if ((stats.redChecks ?? 0) > 0) parts.push(`${stats.redChecks} red`)
  if ((stats.driftWarnings ?? 0) > 0) parts.push(`${stats.driftWarnings} drift`)
  if ((stats.reverts ?? 0) > 0) parts.push(`${stats.reverts} revert${stats.reverts === 1 ? '' : 's'}`)
  if (stats.startedAt !== undefined && stats.landedAt !== undefined) {
    const ms = Date.parse(stats.landedAt) - Date.parse(stats.startedAt)
    if (Number.isFinite(ms) && ms >= 0) parts.push(ms < 60_000 ? '<1m' : `${Math.round(ms / 60_000)}m`)
  }
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * Compose the step's CLI-owned, deterministic Conventional Commit subject.
 *
 * The type and wording come from the step's title: an author-written prefix
 * (`fix(parser): …`) is honoured verbatim, a bare prose title defaults to
 * `feat`. The title's own `(scope)` wins (handled inside `subjectFromTitle`),
 * else the build-default scope. A titleless step falls back to
 * `chore(<scope>): checkpoint`. The `plumbbob`/`step N` identifiers ride the
 * body marker line, not the subject; a `-m` override or `--body` prose is a
 * separate concern.
 */
function subjectForStep(root: string, step: number): string {
  const scope = buildDefaultScope(root)
  const title = titleForStep(root, step)
  return title !== null && title.trim().length > 0
    ? subjectFromTitle(title, 'feat', scope)
    : conventionalSubject({ type: 'chore', scope, description: 'checkpoint' })
}

/**
 * The build-default Conventional scope, or null for a bare subject.
 *
 * The `**Scope:**` header field in intent.md wins when authored and filled;
 * else the build slug with its date prefix stripped; else null: a build with
 * neither field keeps producing bare subjects.
 */
function buildDefaultScope(root: string): string | null {
  try {
    const fromHeader = parseBuildScope(readFileSync(intentPath(root), 'utf8'))
    if (fromHeader !== null) {
      return fromHeader
    }
  } catch {
    // no intent.md yet: fall through to the slug rung.
  }
  return buildScope(activeBuild(root))
}

/**
 * The step's title from intent.md, or null when absent or unreadable.
 */
function titleForStep(root: string, step: number): string | null {
  try {
    return parseSteps(readFileSync(intentPath(root), 'utf8')).find((s) => s.n === step)?.title ?? null
  } catch {
    return null
  }
}

/**
 * The `-m <msg>` subject override, or null when the flag is absent.
 */
function messageArg(args: ReadonlyArray<string>): string | null {
  const i = args.indexOf('-m')
  return i !== -1 && i + 1 < args.length ? (args[i + 1] ?? null) : null
}

/**
 * The deterministic fallback commit body: the step's done-when, its seam, and
 * the staged diffstat.
 *
 * A hand-built or vibed checkpoint still gets informative history without a
 * model turn. Each part is best-effort; a missing piece is simply omitted, and
 * an empty result leaves the commit body blank.
 */
function fallbackBody(root: string, step: number): string | undefined {
  const parts: string[] = []
  const doneWhen = doneWhenForStep(root, step)
  if (doneWhen !== null) {
    parts.push(`done when: ${doneWhen}`)
  }
  const seam = seamForStep(root, step)
  if (seam.length > 0) {
    parts.push(`seam: ${seam.join(', ')}`)
  }
  const stat = safeStagedStat(root)
  if (stat.length > 0) {
    parts.push(stat)
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

/**
 * The in-flight step's detail from `.plumbbob/detail.md`, or null when the file
 * is absent or empty.
 *
 * The model overwrites it before every pause; checkpoint reads it once here for
 * the Log's record, and the caller clears it afterward. A missing or blank file
 * records nothing.
 */
function readDetail(root: string): string | null {
  try {
    const raw = readFileSync(detailPath(root), 'utf8').trim()
    return raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

/**
 * The step's done-when line from intent.md, or null when absent or unreadable.
 */
function doneWhenForStep(root: string, step: number): string | null {
  try {
    return parseSteps(readFileSync(intentPath(root), 'utf8')).find((s) => s.n === step)?.doneWhen ?? null
  } catch {
    return null
  }
}

/**
 * The step's declared seam from intent.md, or empty when missing or malformed.
 */
function seamForStep(root: string, step: number): ReadonlyArray<string> {
  try {
    const parsed = parseStepSeam(readFileSync(intentPath(root), 'utf8'), step)
    return parsed.ok ? parsed.seam : []
  } catch {
    return []
  }
}

/**
 * The staged diffstat, or '' when git refuses.
 */
function safeStagedStat(root: string): string {
  try {
    return stagedStat(root)
  } catch {
    return ''
  }
}

/**
 * The in-flight step number from the STEP file, or null when absent or garbled.
 */
function readStep(root: string): number | null {
  try {
    const raw = readFileSync(stepPath(root), 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}
