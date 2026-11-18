// `plumbbob checkpoint [<n>] [-m <msg>]`: the commit tick that lands a step.
// Executor-agnostic and author-blind: it reads the diff, not who wrote it, so a
// `/plumbbob:build` run, your own hands, a vibe session, or another harness all
// checkpoint identically. It does NOT require a STEP marker (the flat control
// file recording the step in flight): the step is whatever you pass, else the
// in-flight STEP, else the next undone step in intent.md's build order. It evaluates the
// approval latch, gates on a green check and then on the step's proof command
// where its proof opens on one, commits any pending work (or records
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
  readPause,
  readRun,
  readStats,
  refreshExcludes,
  seamPath,
  stampStepStat,
  stepPath,
  writePause,
} from '../lib/sidecar.ts'
import { runCheck, runProof } from '../lib/check.ts'
import { keepPlanCurrent, refreshAdvisory, refreshPlan } from '../lib/planfile.ts'
import { binFiles, reachFor } from '../lib/reach.ts'
import { readReach, refreshReach } from '../lib/reachfile.ts'
import { readCommitBody } from '../lib/commitbody.ts'
import { checkLatch, planEditHeldMessage, planEditMessage, readGrant } from '../lib/latch.ts'
import {
  enterPlan,
  heldPlanEdit,
  markPlan,
  noteRunEdit,
  type PlanEdit,
  planEdit,
  planEditUnseen,
  planEditsAllowed,
} from '../lib/planmark.ts'
import { markStepDone, parseDetailStep, parseOrderedSteps, parseSteps } from '../lib/orient.ts'
import { parseBuildScope, parseStepProof, parseStepSeam, scopeDrift } from '../lib/intent.ts'
import { conventionalSubject, subjectFromTitle, withMarker } from '../lib/commitmsg.ts'
import { appendToSection, checkpointLogLine, logEntry, planLogLine } from '../lib/buildlog.ts'
import { AT_BOUNDARY, syncBuildLogState } from '../lib/buildlogsync.ts'
import { advisory, ending, notice, printEnding, transition } from '../lib/notice.ts'
import { boundaryEnding, detailsLink, isHarvestDetail, parseDetailRange, planRecord, stepRecord } from './handoff.ts'

/**
 * Land a step: latch, check gate, proof, commit, record, return to the boundary.
 *
 * Exit 1 on any refusal: no session, no resolvable step, a latched tick, a
 * red/broken check, or a red proof; each refusal says what unblocks it.
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

  // Ahead of the gate and of either commit: a hand edit to intent.md since the
  // last export would otherwise fail the plan check, or ride the plan commit as
  // a stale file.
  keepPlanCurrent(root, activeBuild(root))

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

  // A step built by hand never ran `build <n>`, so no entry settled the plan
  // mark for it; the landing settles it by the entry's rule instead.
  if (readStep(root) !== step) {
    enterPlan(root, undefined, step)
  }
  // An approval, and a grant, cover the plan as it stood when the human
  // typed. A step whose plan was edited since stops here at its pause,
  // whatever the grant or the entry stamp says: nothing is run, staged, or
  // recorded, and the human's next turn lands it.
  const edit = planEdit(root)
  if (edit !== null && planEditUnseen(root)) {
    // A grant the human typed with `--plan-edits` lets the edit land, and still
    // holds at the Decisions, the Constraints, and any step already landed.
    const allowed = planEditsAllowed(root) && readGrant(root) !== null
    const held = allowed ? heldPlanEdit(root) : null
    if (!allowed || held !== null) {
      process.stderr.write(
        held === null ? planEditMessage(step, edit.added, edit.removed) : planEditHeldMessage(step, edit.added, edit.removed, held),
      )
      return 1
    }
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

  // The proof runs behind a green gate and ahead of the record, so the record
  // measures the tree the proof left and carries the row the run earned. A red
  // proof refuses the way a red check does: nothing staged, nothing recorded.
  const proofRefusal = await holdOnProof(root, step)
  if (proofRefusal !== null) {
    process.stderr.write(proofRefusal)
    return 1
  }

  // The step's record, as the pause showed it: built here, before the work is
  // staged, though both measures now run against HEAD, so staging no longer
  // moves them. It lands in the build-log's Log beneath the dated line (the
  // tracked ledger is the archive, and it rides the branch where a commit body
  // would not survive the squash); the commit body keeps its marker and the
  // lead prose only.
  const record = stepRecord(root, activeBuild(root), step, readDetail(root, step) ?? '')
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
  // The detail is recorded in the Log below; clear it so no stale detail rides
  // into the next step. A stop's or a harvest's detail is the record's to
  // clear, so it stays where it is.
  if (!heldDetail(root)) {
    clearDetail(root)
  }

  appendFileSync(checkpointsPath(root), `step ${step} ${sha}\n`)
  // An edited plan that landed is counted on the step, which is what carries
  // it past this point: the Log line, the boundary's Verdict, a range's stop
  // card, and the finish report all read the stat.
  const planNote = planEditNotice(root, step, edit)
  // Named on the run's base only now, with the landing certain, so the steps
  // the next card lists are the steps whose records carry the `plan` row.
  if (edit !== null && planEditsAllowed(root)) {
    noteRunEdit(root, undefined, step)
  }
  const flipNotice = flipIntent(root, step)
  // The tick is the CLI's own write, and the step has landed with whatever
  // edit it carried: the plan as it stands is the plan as sanctioned.
  markPlan(root)
  // The tick wrote intent.md, so an exported plan.json follows it here and rides
  // the same commit the tick does, the next one, which stages them together.
  const planNotice = refreshAdvisory(refreshPlan(root, activeBuild(root)))
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
  // The pause it stamped is over, and the boundary this ending prints is the
  // card the stamp now names, so a later handoff here ends on its pointer
  // (D110 (reply-after-the-card)); the next step's pause renders whole. A
  // landing that answers this step's own pause card, already shown, says so,
  // and the stop card it may owe prints short (D119 (short-stop-after-a-halt)).
  const shown = readPause(root)
  const answered = shown?.kind === 'pause' && shown.step === step
  writePause(root, undefined, { kind: 'landed', step, ...(answered ? { answered: true } : {}) })

  // The whole ending, one block: the lead line, the advisories this checkpoint
  // alone can state, and the state table headed by the Verdict folded over
  // what just landed. Read after the flip and the ledger append, so the fold
  // and the pointer both see the boundary the human is standing at.
  const landed = boundaryEnding(root, activeBuild(root), step)
  // A landing that completes the range a typed run marked owes the stop card:
  // the record says so, and the relay check holds a turn that ends here.
  const owes =
    landed.range !== null && readRun(root) === landed.range.item ? { range: landed.range.item, count: landed.range.count, step } : null
  printEnding(root, {
    tier: 'orientation',
    render: 'checkpoint',
    ...(owes === null ? {} : { owes }),
    text: ending({
      lead: transition({ label: 'Checkpoint', fact: `Step ${step} complete`, detail: leadDetail(sha, pointer) }),
      advisories: [drift, planNote, flipNotice, planNotice],
      state: landed.state,
    }),
  })
  return 0
}

/**
 * Run the step's proof command, when its proof opens on one, and return the
 * refusal to print, or null when the checkpoint may go on.
 *
 * A proof with no command runs nothing, and so does a step with no proof or
 * an intent that cannot be read: the proof is then the model's to attest. A
 * step carrying two `proof:` lines is refused before anything runs, since
 * which command to hold it to would be a guess. A red run accrues as a
 * per-step stat, the way a red check does.
 */
async function holdOnProof(root: string, step: number): Promise<string | null> {
  let intent: string
  try {
    intent = readFileSync(intentPath(root), 'utf8')
  } catch {
    return null
  }
  const parsed = parseStepProof(intent, step)
  if (!parsed.ok) {
    const finding = parsed.findings.find((f) => f.includes('`proof:`'))
    return finding === undefined
      ? null
      : notice({ fact: 'checkpoint refused', detail: [finding], remedy: 'keep one proof line that says something, then run it again' })
  }
  const command = parsed.proof?.command ?? null
  if (command === null) {
    return null
  }
  const run = await runProof(root, step, command)
  if (run.exitCode === 0) {
    return null
  }
  bumpStepStat(root, undefined, step, 'redProofs')
  return notice({
    fact: 'checkpoint refused',
    detail: ['the proof is red', `\`${command}\` exited ${run.exitCode}`],
    remedy: 'fix it, then run it again',
  })
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
  // The plan is approved: ask atis, when it is on PATH, what each undone step's
  // seam reaches, so the answers ride this commit. Silent whatever comes back.
  refreshReach(root, activeBuild(root))
  const first = readStep(root) === null && !planLanded(root)
  const staged = stagePath(root, buildFolder(root))
  const sha = commit(root, planSubject(root), withMarker('plumbbob plan', bodyResult.body ?? undefined))
  appendFileSync(checkpointsPath(root), `plan ${sha}\n`)
  // The plan the human just approved is the plan as sanctioned. Only the
  // first plan commit says so, with no step in flight and no grant standing:
  // a plan committed again, beside a step, or by a granted run leaves the
  // mark where it is, so an edit waiting to be shown is not made the approved
  // plan by committing it.
  if (first && readGrant(root) === null) {
    markPlan(root)
  }
  // The cold read that approved the plan is the Log's first entry, beneath a
  // dated plan line; the detail file is then spent, the same as at a step.
  const pointer = logPlan(root, sha, planRecord(root, activeBuild(root), readDetail(root, null) ?? ''))
  clearDetail(root)
  // Landing the plan consumes `start`'s entry stamp: a later hand-built diff
  // (no `build <n>`) must find no stale TICK and stay guidance-governed. A
  // step in flight keeps the stamp its own entry wrote.
  if (readStep(root) === null) {
    clearTick(root)
  }
  // No Verdict: the plan commit measures nothing. The pointer aims at the step
  // the build starts on, which is what `handoff` renders from a null step.
  printEnding(root, {
    tier: 'orientation',
    render: 'plan-commit',
    text: ending({
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
      state: boundaryEnding(root, activeBuild(root), null).state,
    }),
  })
  return 0
}

/**
 * Whether the checkpoints file already records a plan commit.
 */
function planLanded(root: string): boolean {
  try {
    return readFileSync(checkpointsPath(root), 'utf8')
      .split('\n')
      .some((line) => line.startsWith('plan '))
  } catch {
    return false
  }
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
 * Explicit arg > in-flight STEP file > first undone step in build order. A `-m`
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
    return parseOrderedSteps(readFileSync(intentPath(root), 'utf8')).find((s) => !s.done)?.n ?? null
  } catch {
    return null
  }
}

/**
 * The advisory (never a refusal) for a staged tree that reaches beyond the
 * step's seam, or '' when it held.
 *
 * Guidance, not a gate: the checkpoint captures the drift and says so, and the
 * bumped stat puts a `seam strayed` rung under the Verdict, the same rung the
 * pause's measured seam row gave it, since the row vanishes once the tree is
 * committed and the stat is what carries the stray past that point. The seam
 * (the step's edit grant: exact paths or `dir/` prefixes) comes from the
 * in-flight SEAM file when a build is live, else the step's declared seam in
 * intent.md. Plumbbob's own artifact plane is whitelisted inside `scopeDrift`,
 * so the `[x]` flip and build-log line this very checkpoint stages never read
 * as drift. No seam means no warning. With a reach stored for the step, a
 * staged file its reach expected is no stray: only one outside the seam and
 * the reach both is named and counted, so the stat agrees with the pause.
 */
function scopeDriftNotice(root: string, step: number): string {
  const seam = seamTokens(root, step)
  const strays = scopeDrift(stagedPaths(root), seam)
  // A step with a stored reach is held to its seam and its reach together, the
  // way its pause split it: only a file outside both is a stray.
  const answer = reachFor(readReach(root), step, seam)
  const outside = answer === null ? strays : binFiles(strays, seam, answer).out
  if (outside.length === 0) return ''
  bumpStepStat(root, undefined, step, 'driftWarnings') // accrues into the build-log's stats receipt, and into the Verdict's third rung
  return advisory({
    fact: answer === null ? `staged paths reach outside Step ${step}'s seam` : `staged paths reach outside Step ${step}'s seam and its reach`,
    detail: outside,
    remedy: 'the checkpoint captures them, so revise the plan with /plumbbob:step if that is real scope drift',
  })
}

/**
 * The advisory for a landed step that edited the plan, or '' when it did not.
 *
 * The pause showed the `plan` row and the diff; once the step lands the mark
 * is taken again and the row is gone, so the boundary says it here and the
 * bumped stat puts a `plan edited` rung under the Verdict, the way a seam
 * stray survives its landing.
 */
function planEditNotice(root: string, step: number, edit: PlanEdit | null): string {
  if (edit === null) return ''
  bumpStepStat(root, undefined, step, 'planEdits')
  return advisory({
    fact: `Step ${step} edited the plan`,
    detail: [`intent.md +${edit.added} -${edit.removed}`],
    remedy: 'the build log keeps the row, so revise the plan with /plumbbob:refine if the edit should not stand',
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

/** Where a Log entry's dated line landed: the build-log's path from the repo root, and its line. */
type LogPointer = { readonly path: string; readonly line: number }

/**
 * The lead line's trailing parenthetical: the short SHA, and where the Log
 * entry landed when one did, as the same short linked `details:` clause Next
 * Up carries.
 */
function leadDetail(sha: string, pointer: LogPointer | null): string[] {
  return pointer === null ? [sha.slice(0, 9)] : [sha.slice(0, 9), detailsLink(pointer.path, pointer.line)]
}

/**
 * Append the step's entry to the build-log's `## Log` section: the dated line,
 * and beneath it the record of the pause when the model wrote one.
 *
 * The build's history accrues at each checkpoint instead of being reconstructed
 * at finish; the step's title is lifted from intent.md when still present.
 * Best-effort: a missing or odd build-log never blocks a checkpoint; the
 * `checkpoints` SHA is the source of truth. Returns where the line landed, or
 * null when nothing was written.
 */
function logCheckpoint(root: string, step: number, sha: string, record: string | null): LogPointer | null {
  const date = new Date().toISOString().slice(0, 10)
  return appendLog(root, checkpointLogLine(date, step, sha, titleForStep(root, step), statsSuffix(root, step)), record)
}

/**
 * Append the plan's entry to the Log: a dated `plan committed` line, and
 * beneath it the cold read that approved the plan when the model wrote one.
 */
function logPlan(root: string, sha: string, record: string | null): LogPointer | null {
  return appendLog(root, planLogLine(new Date().toISOString().slice(0, 10), sha), record)
}

/**
 * Write one Log entry and say where its dated line landed, or null when the
 * section is missing or the write failed.
 */
function appendLog(root: string, line: string, record: string | null): LogPointer | null {
  try {
    const path = buildLogPath(root)
    const updated = appendToSection(readFileSync(path, 'utf8'), 'Log', logEntry(line, record))
    if (updated === null) {
      return null
    }
    writeFileSync(path, updated)
    const at = updated.split('\n').lastIndexOf(line)
    return at === -1 ? null : { path: relative(root, path), line: at + 1 }
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
  if ((stats.redProofs ?? 0) > 0) parts.push(`${stats.redProofs} red proof${stats.redProofs === 1 ? '' : 's'}`)
  if ((stats.driftWarnings ?? 0) > 0) parts.push(`${stats.driftWarnings} drift`)
  if ((stats.planEdits ?? 0) > 0) parts.push(`${stats.planEdits} plan edit${stats.planEdits === 1 ? '' : 's'}`)
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
 * The deterministic fallback commit body: the step's proof, its seam, and
 * the staged diffstat.
 *
 * A hand-built or vibed checkpoint still gets informative history without a
 * model turn. Each part is best-effort; a missing piece is simply omitted, and
 * an empty result leaves the commit body blank.
 */
function fallbackBody(root: string, step: number): string | undefined {
  const parts: string[] = []
  const proof = proofForStep(root, step)
  if (proof !== null) {
    parts.push(`proof: ${proof}`)
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
 * is absent, empty, or written for another step.
 *
 * The model overwrites it before every pause; checkpoint reads it once here for
 * the Log's record, and the caller clears it afterward. A missing or blank file
 * records nothing, and so does one whose header names a different step: that
 * file is a leftover, written after its own step had already landed, and
 * recording it would file one step's story under another. A range's detail
 * and a boundary harvest's record nothing here either: they are
 * `plumbbob harvest`'s to record. The plan commit passes no step and takes the
 * file as it is.
 */
function readDetail(root: string, step: number | null): string | null {
  try {
    const raw = readFileSync(detailPath(root), 'utf8').trim()
    if (raw.length === 0 || (step !== null && heldDetail(root))) {
      return null
    }
    const written = step === null ? null : parseDetailStep(raw)
    return written === null || written === step ? raw : null
  } catch {
    return null
  }
}

/**
 * Whether the detail file is one a step's checkpoint leaves alone: a range's,
 * the stop card's wire, or a boundary harvest's, each read off its header and
 * each recorded and cleared by `plumbbob harvest`.
 */
function heldDetail(root: string): boolean {
  try {
    const raw = readFileSync(detailPath(root), 'utf8')
    return parseDetailRange(raw) !== null || isHarvestDetail(raw)
  } catch {
    return false
  }
}

/**
 * The step's proof text from intent.md, or null when absent or unreadable.
 */
function proofForStep(root: string, step: number): string | null {
  try {
    return parseSteps(readFileSync(intentPath(root), 'utf8')).find((s) => s.n === step)?.proof?.text ?? null
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
