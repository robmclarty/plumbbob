// `plumbbob handoff`: emit the CLI-owned ending of a turn as one contiguous
// block (docs/presentation.md). Read-only, no state change. Every part outside
// the readout fence is a bold label, a colon, and text that wraps, one blank
// line between blocks and no fence but the readout's own. It derives the moment
// from the session: a step in flight ⇒ the decision-tier ending (the labeled
// Readout and its fence, the inline diff when the change is 20 lines or fewer,
// the Verdict, Next Up, Your Call, and the Recommendation last); a landed step
// with none in flight ⇒ the orientation-tier ending (Verdict and Next Up); a
// fresh session with nothing yet measured ⇒ the forward pointer alone.
//
// The whole decision turn is rendered here, its opening block included: the
// Summary lead and the numbered highlights come out of `.plumbbob/detail.md`
// as the markdown the model wrote, with the `(details: …)` bracket appended so
// the model never types a path. A region the model does not author is a region
// it cannot narrate into.
//
// If the CLI can compute a recap row, the CLI does: the check row comes from
// the last run's summary, the seam row from the SEAM marker against the
// work-plane diff, the diff row from `git diff --numstat`. The model's part
// (`.plumbbob/detail.md`) supplies only what takes judgment: the Summary, the
// three judgment rows, and the recommendation; the Verdict folds the same
// assembled rows worst-of with the step's accrued stats, so the fence shows
// exactly what the fold saw.
//
// Every tier's ending is emitted here, so no skill has to fake the furniture in
// prose: `--plan` renders the plan-pause ending and `--driver` the driver
// turn's pointer, the two endings the session state cannot tell apart from the
// ones above. The driver pointer reads the phase it lands in: a spike open over
// the step names closing the spike, a step exit (a revert, an abandon, a spike
// closed at the boundary) finds nothing in flight and points forward, with no
// Verdict either way, since nothing landed.

import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { commitsSince, diffNumstat, diffPatch, findRepoRoot } from '../lib/git.ts'
import { blocks } from '../lib/notice.ts'
import { isArtifactPath, parseStepSeam } from '../lib/intent.ts'
import {
  checkpointsPath,
  detailPath,
  hasSession,
  inSpike,
  intentPath,
  readStats,
  readTurn,
  resolveBuild,
  seamPath,
  stepPath,
  tickPath,
} from '../lib/sidecar.ts'
import {
  type AccruedStats,
  type CheckSummary,
  type Ladder,
  type RecapRow,
  type RecapRowName,
  type SpentInputs,
  type Step,
  type Summary,
  countDiff,
  diffRowValue,
  foldVerdict,
  lastLedgerSha,
  parseConstraintCount,
  parseLastCheckpoint,
  parseRecap,
  parseRecommendation,
  parseSteps,
  parseSummary,
  recapLines,
  seamRowFromDiff,
  spentRowValue,
  summaryCheckRow,
} from '../lib/orient.ts'

// The inline-diff threshold (docs/presentation.md): at 20 changed lines or
// fewer the patch rides the turn; at 21 it stays in the working tree behind
// the counted diff row.
const INLINE_DIFF_MAX = 20

// plumbbob's own plan commits carry this marker on a line of their body. A
// `chore(plan)` harvest lands between nearly every step, so counting them as
// out-of-band would trip the advisory rung on routine housekeeping and stop
// meaning anything within three steps.
const PLAN_COMMIT_MARKER = '^plumbbob plan$'

// The seam rule, and the one tier that still has a seam to mark: at the plan
// pause the model presents the framed plan above the relay, so the rule keeps
// a label from reading as the tail of what precedes it, and a run of blank
// lines collapses to one in every markdown renderer where a thematic break
// renders as space. The blank line above it matters: `---` flush under a text
// line turns that line into a heading (the underline form), not a rule. The
// step pause needs none: handoff renders that whole turn, Summary included.
const SEAM_RULE = '\n---'

/**
 * Print the resolved build's turn ending; return the exit code.
 *
 * Requires an active session (the STATE sentinel under `.plumbbob/`). The step
 * tiers are derived, not passed: a step in flight yields the full
 * decision-tier ending (the Readout and its fence, the inline diff when small
 * enough, the Verdict, Next Up, Your Call, and the Recommendation), a landed
 * step yields the orientation-tier ending (Verdict and Next Up, no Your Call),
 * and a fresh session with nothing to report yields only
 * the forward pointer. The two endings no session state can distinguish are
 * named by a flag: `--plan` is the plan pause (a decision turn about the plan,
 * not a diff) and `--driver` is a driver turn (a park, a spike, a `use`), which
 * interrupts a step without ending it.
 */
export function handoff(cwd: string, args: ReadonlyArray<string> = []): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug, rest } = resolveBuild(root, args)
  if (rest.includes('--plan') && rest.includes('--driver')) {
    process.stderr.write('plumbbob: handoff: --plan and --driver name different tiers; pass one.\n')
    return 1
  }
  const intent = readOr(intentPath(root, slug))
  const steps = parseSteps(intent)
  const inFlight = readMarker(stepPath(root, slug))
  const detail = readOr(detailPath(root))
  // Where a pointer sends the reader to read the step itself: the intent file
  // as the human would type it, relative to the repo root.
  const where = relative(root, intentPath(root, slug))

  if (rest.includes('--plan')) {
    // The plan pause judges the plan, so nothing is measured and no Verdict
    // renders; the pointer and the moves both aim at the first undone step. A
    // decision turn still ends on the model's recommendation when it wrote one.
    const first = steps.find((s) => !s.done)
    const plan = [SEAM_RULE, nextUpLine(first, steps.length, where), planCallBlock(first)]
    return emit(withRecommendation(plan, parseRecommendation(detail)))
  }

  const explicit = rest.find((a) => /^\d+$/.test(a))
  const lastDone = parseLastCheckpoint(readOr(checkpointsPath(root, slug)))
  // The step this hand-off is about: an explicit arg wins (the skill's override),
  // else the in-flight step (the pause), else the last checkpointed step (the
  // boundary). Null only on a fresh session the skill would not hand off from.
  const current = explicit !== undefined ? Number(explicit) : (inFlight ?? lastDone?.n ?? null)

  // Next up: the first undone step that is not the current one. At the pause the
  // current step is still `[ ]`, so excluding it by number is what makes "next"
  // mean the step *after* it; at the boundary the current step is already `[x]`,
  // so the `!== current` clause is a harmless no-op. Skipping-ahead builds still
  // land on the earliest remaining step, never a gap.
  const nextUp = steps.find((s) => !s.done && s.n !== current)

  if (rest.includes('--driver')) {
    // A driver turn interrupts a step without ending it, so its pointer aims
    // back at the step still open, or at the spike open over it. With neither
    // (a step exit: a revert, an abandon, a spike closed at the boundary) the
    // ordinary forward pointer stands, and no Verdict rides above it: nothing
    // landed to measure.
    return emit([driverPointer(root, slug)])
  }

  if (current === null) {
    // Nothing measured yet (a fresh session): no Verdict, just the forward pointer.
    return emit([nextUpLine(nextUp, steps.length, where)])
  }

  if (inFlight === null) {
    // The boundary: the orientation-tier ending, the state word and the forward
    // pointer, no decision pending and so no Your Call. The same two parts the
    // checkpoint printed for itself, from the same call.
    const landed = boundaryEnding(root, slug, current)
    return emit([landed.verdict, landed.pointer])
  }

  // The pause: the whole turn as one contiguous block, each part a labeled line
  // with one blank line between, and the only fence the readout's own (plus the
  // inline diff when the change is small enough). It opens on the Summary the
  // model wrote into the detail file, so there is no seam left to rule off.
  const { rows, work, summary, checkGreen } = measured(root, slug, intent, detail, current)
  const { ladder, worst } = foldVerdict(rows, accruedStats(root, slug, current))
  const verdict = verdictLine(ladder, worst)
  const counts = countDiff(work)
  const changed = counts.added + counts.removed
  const inline = changed > 0 && changed <= INLINE_DIFF_MAX
  const readout = recapLines(rows, {
    diff: diffRowValue(counts, inline),
    spent: spentRowValue(spentInputs(root, slug, current, summary)),
    constraints: parseConstraintCount(intent),
  })
  const parts: string[] = [summaryBlock(parseSummary(detail), relative(root, detailPath(root)))]
  if (readout.length > 0) {
    parts.push([readoutLabel(current, steps), '', ...fence('text', readout)].join('\n'))
  }
  if (inline) {
    const patch = diffPatch(
      root,
      work.map((e) => e.path),
    )
    if (patch.length > 0) {
      parts.push(fence('diff', patch.split('\n')).join('\n'))
    }
  }
  parts.push(verdict, nextUpLine(nextUp, steps.length, where), yourCallBlock(current, checkGreen))
  return emit(withRecommendation(parts, parseRecommendation(detail)))
}

/**
 * The two CLI-rendered parts of a boundary ending: the Verdict folded from
 * everything measurable right now, and the pointer at the step to come.
 *
 * `step` is the step that just landed, or null at a plan commit, where nothing
 * was measured and the Verdict vanishes. A transition verb prints these beneath
 * its own lead line, so a boundary reads identically whether `checkpoint`
 * emitted it or a later `handoff` did; the paths a stray advisory named are the
 * one part that does not survive, and the commit holds those.
 */
export function boundaryEnding(root: string, slug: string | null, step: number | null): BoundaryEnding {
  const intent = readOr(intentPath(root, slug))
  const steps = parseSteps(intent)
  const nextUp = steps.find((s) => !s.done && s.n !== step)
  return {
    verdict: step === null ? null : landedVerdict(root, slug, intent, step),
    pointer: nextUpLine(nextUp, steps.length, relative(root, intentPath(root, slug))),
  }
}

/** A boundary ending's CLI-rendered parts: the Verdict, where one was measured, and the pointer. */
export type BoundaryEnding = { readonly verdict: string | null; readonly pointer: string }

/**
 * The driver turn's pointer: back at the step still open, at the spike raised
 * over it, or forward from the boundary when the step has already exited.
 *
 * A park or a spike interrupts a step without ending it, so nothing landed and
 * no Verdict rides above this line.
 */
export function driverPointer(root: string, slug: string | null): string {
  const intent = readOr(intentPath(root, slug))
  const steps = parseSteps(intent)
  const inFlight = readMarker(stepPath(root, slug))
  const driver = inSpike(root, slug) ? spikeNextUpLine(inFlight) : driverNextUpLine(steps, inFlight, steps.length)
  // The forward fallback skips the step just landed as well as the one open, so
  // a checkpoint whose `[x]` flip failed still points on rather than back at
  // work already recorded.
  const landed = parseLastCheckpoint(readOr(checkpointsPath(root, slug)))?.n ?? null
  const forward = steps.find((s) => !s.done && s.n !== (inFlight ?? landed))
  return driver ?? nextUpLine(forward, steps.length, relative(root, intentPath(root, slug)))
}

/**
 * The Verdict for a step that just landed: the assembled rows folded worst-of
 * with the step's accrued stats, rendered as the line.
 */
function landedVerdict(root: string, slug: string | null, intent: string, step: number): string {
  const { rows } = measured(root, slug, intent, readOr(detailPath(root)), step)
  const { ladder, worst } = foldVerdict(rows, accruedStats(root, slug, step))
  return verdictLine(ladder, worst)
}

/** The measured inputs a Verdict and a readout are both built from. */
type Measured = {
  readonly rows: Partial<Record<RecapRowName, RecapRow>>
  readonly work: ReadonlyArray<{ readonly path: string; readonly added: number; readonly removed: number }>
  readonly summary: CheckSummary | null
  readonly checkGreen: boolean
}

/**
 * Assemble the rows once, so the fence and the fold read the same set: the
 * model's attested rows, with the check and seam rows replaced by the CLI's own
 * measurements where one exists (measured beats attested).
 *
 * `checkGreen` reports the *measured* check alone. A move offered on an
 * attested green would be a move the gate then refuses.
 */
function measured(root: string, slug: string | null, intent: string, detail: string, step: number): Measured {
  const summary = readCheckSummary(root)
  const measuredCheck = summary === null ? null : summaryCheckRow(summary)
  const work = diffNumstat(root).filter((e) => !isArtifactPath(e.path))
  const rows: Partial<Record<RecapRowName, RecapRow>> = { ...(parseRecap(detail)?.rows ?? {}) }
  if (measuredCheck !== null) {
    rows.check = measuredCheck
  }
  const measuredSeam = seamRowFromDiff(
    work.map((e) => e.path),
    seamTokens(root, slug, intent, step),
  )
  if (measuredSeam !== null) {
    rows.seam = measuredSeam
  }
  return { rows, work, summary, checkGreen: measuredCheck?.verdict === 'true' }
}

/**
 * Write an ending to stdout and return handoff's exit code.
 *
 * The parts are stacked by the same assembly a transition verb prints its own
 * ending through, so the block reads the same whichever command emitted it.
 */
function emit(parts: ReadonlyArray<string | null>): number {
  process.stdout.write(blocks(parts))
  return 0
}

/**
 * The Verdict line from an already-folded result: the ladder rung, and the
 * worst component in a trailing parenthetical when one exists.
 *
 * No step segment rides here. The identity renders once per turn: the Readout
 * label names the step, Next Up carries the progress count, and the Verdict is
 * left saying the one thing only it says.
 */
function verdictLine(ladder: Ladder, worst: string | null): string {
  const state = `**Verdict**: ${ladder.glyph} ${ladder.state}`
  return worst === null ? state : `${state} (${worst})`
}

/**
 * The turn's opening block: the model's lead behind the Summary label, with the
 * `(details: …)` bracket appended, then the numbered highlights beneath it.
 *
 * The lead and the titles are the markdown the model wrote, passed through; the
 * label, the bracket, and the numbering are the CLI's, so the model never types
 * a path and the block cannot drift from where the detail actually is. Empty
 * when the detail file carries no lead: a Summary that says nothing vanishes
 * rather than labeling nothing.
 */
function summaryBlock(summary: Summary | null, where: string): string {
  if (summary === null) {
    return ''
  }
  const lead = `**Summary**: ${summary.lead} (details: \`${where}\`)`
  if (summary.highlights.length === 0) {
    return lead
  }
  return [lead, '', ...summary.highlights.map((h) => `${h.n}. ${h.title}`)].join('\n')
}

/**
 * The Readout's label: the step the fence below it measures, named once.
 */
function readoutLabel(step: number, steps: ReadonlyArray<Step>): string {
  const open = steps.find((s) => s.n === step)
  const title = open !== undefined && open.title.length > 0 ? ` - ${open.title}` : ''
  return `**Readout**: Step ${step}${title}`
}

/**
 * What the `spent` row is rendered from: the step's own stamps and counters
 * from stats.json, the turns the ledger counted across the step (TURN minus
 * the TICK stamped on entry), and the last gate's wall clock.
 *
 * A host with no turn hook grows no ledger, so `turns` comes back null there
 * and the clause simply vanishes rather than reading zero.
 */
function spentInputs(root: string, slug: string | null, step: number, summary: CheckSummary | null): SpentInputs {
  const stats = readStats(root, slug)[String(step)] ?? {}
  const turn = readTurn(root)
  const tick = readMarker(tickPath(root, slug))
  return {
    startedAt: stats.startedAt,
    landedAt: stats.landedAt,
    now: Date.now(),
    turns: turn === null || tick === null ? null : Math.max(0, turn - tick),
    redChecks: stats.redChecks ?? 0,
    gateMs: summary?.total_duration_ms ?? null,
    driftWarnings: stats.driftWarnings ?? 0,
  }
}

/**
 * The seam tokens governing `step`: the SEAM marker `build` wrote is
 * authoritative while a build is live, else the step's declared seam parsed
 * from intent.md. Empty when neither resolves, which vanishes the measured
 * seam row rather than flagging the whole tree.
 */
function seamTokens(root: string, slug: string | null, intent: string, step: number): ReadonlyArray<string> {
  try {
    const fromFile = readFileSync(seamPath(root, slug), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (fromFile.length > 0) {
      return fromFile
    }
  } catch {
    // no SEAM marker: fall through to the declared seam.
  }
  const parsed = parseStepSeam(intent, step)
  return parsed.ok ? parsed.seam : []
}

/**
 * Wrap lines in a markdown fence whose rail outruns any backtick run inside,
 * so a patch that itself contains fence markers cannot break out of the
 * `diff` fence it rides in.
 */
function fence(lang: string, lines: ReadonlyArray<string>): string[] {
  const longest = lines.reduce((max, l) => Math.max(max, ...(l.match(/`+/g) ?? ['']).map((run) => run.length)), 0)
  const rail = '`'.repeat(Math.max(3, longest + 1))
  return [`${rail}${lang}`, ...lines, rail]
}

// The recommendation's label (docs/presentation.md): the one bold token the
// turn body spends, prepended here so the model never types it.
const RECOMMENDATION_LABEL = '**Recommendation**: '

/**
 * Append the recommendation beneath a block, blank-line separated, when the
 * model wrote one; the ending's last text is then the model's own call. The
 * label is the CLI's: it announces what the last text is before the eye
 * reads it, and a label the model typed would be one more line to drift.
 */
function withRecommendation(parts: ReadonlyArray<string>, recommendation: string | null): string[] {
  return recommendation === null ? [...parts] : [...parts, `${RECOMMENDATION_LABEL}${recommendation}`]
}

/**
 * The step's accrued stats (seam strays, red checks, reverts) plus commits that
 * landed since the last ledger entry outside plumbbob's checkpoints: the
 * advisory inputs to the Verdict's third fold rung.
 */
function accruedStats(root: string, slug: string | null, step: number): AccruedStats {
  const stats = readStats(root, slug)[String(step)] ?? {}
  const anchor = lastLedgerSha(readOr(checkpointsPath(root, slug)))
  return {
    driftWarnings: stats.driftWarnings ?? 0,
    redChecks: stats.redChecks ?? 0,
    reverts: stats.reverts ?? 0,
    outOfBand: anchor === null ? 0 : commitsSince(root, anchor, PLAN_COMMIT_MARKER),
  }
}

/**
 * The last `plumbbob check` run's `.check/summary.json`, or null when it is
 * absent or unreadable (nothing to measure with; the fold then falls back to
 * the readout's attested row, if the model wrote one).
 *
 * Read once: the check row is measured from it, and so is the gate's wall
 * clock in the `spent` row.
 */
function readCheckSummary(root: string): CheckSummary | null {
  try {
    return JSON.parse(readFileSync(join(root, '.check', 'summary.json'), 'utf8')) as CheckSummary
  } catch {
    return null
  }
}

/**
 * The Your Call block: the moves a human actually makes at a pause, each
 * quoting what they say and stating what happens next.
 *
 * Nobody types "needs work", so the block names what really happens instead:
 * a message that asks is an expand (nothing changes), and a message that
 * directs is the fix. `revert` comes last, because a destructive move is named
 * rather than discovered. `looks good` renders only while the measured check is
 * green; offering a move that would refuse teaches a false ceremony.
 */
function yourCallBlock(step: number, checkGreen: boolean): string {
  const moves: string[] = []
  if (checkGreen) {
    moves.push(callLine('`looks good`', `I checkpoint Step ${step}; back to the boundary`))
  }
  moves.push(callLine('`expand`, or any question', 'I show more of what is there; nothing changes'))
  moves.push(callLine('anything that reads as direction', 'I take it as what to change; nothing lands until you approve'))
  moves.push(callLine('`revert`', 'I wind the work back to the last checkpoint'))
  return ['**Your Call**:', '', ...moves].join('\n')
}

/**
 * One Your Call row: a list item naming the move, then the outcome clause
 * behind the arrow, opening with a capital letter. The move stays lowercase
 * because it quotes what the human says.
 */
function callLine(move: string, outcome: string): string {
  return `- ${move} → ${outcome}`
}

/**
 * The plan pause's Your Call block: the same shape with the moves that apply
 * there. Nothing is recorded yet, so `revert` has nothing to wind back to and
 * vanishes; `looks good` names the step the plan starts at, which is Step 1 at
 * the plan pause and the first undone step after a mid-build refine.
 */
function planCallBlock(first: Step | undefined): string {
  const starts = first === undefined ? '' : `; /plumbbob:build starts Step ${first.n}`
  return [
    '**Your Call**:',
    '',
    callLine('`looks good`', `I mark the plan decided${starts}`),
    callLine('`expand`, or any question', 'I show more of what is there; nothing changes'),
    callLine('anything that reads as direction', 'I take it as what to sharpen; the plan is cheap to change now'),
  ].join('\n')
}

/**
 * The driver turn's pointer: back to the step still in flight, since a park or
 * a spike interrupts a step without ending it. No model clause rides here; the
 * step is already being built, so the `/model` call is behind us. Null when no
 * step is open, which is the caller's cue to fall back to the forward pointer.
 */
function driverNextUpLine(steps: ReadonlyArray<Step>, inFlight: number | null, total: number): string | null {
  if (inFlight === null) {
    return null
  }
  const open = steps.find((s) => s.n === inFlight)
  const title = open !== undefined && open.title.length > 0 ? ` - ${open.title}` : ''
  // The progress count rides every tier's pointer, but only where the plan
  // actually holds the step: "step 9 of 3" would be worse than no count.
  const progress = open === undefined ? '' : ` of ${total}`
  return `**Next Up**: Back to Step ${inFlight}${progress}${title}`
}

/**
 * The driver pointer while a spike is open: the spike outranks the step it
 * interrupted, so the move named is closing it and the step to come back to
 * rides as a trailing clause.
 *
 * No progress count rides that clause. The count belongs to the step a pointer
 * aims at, and this one aims at the spike; with nothing in flight (a spike
 * opened at the boundary) the clause vanishes and the move stands alone.
 */
function spikeNextUpLine(inFlight: number | null): string {
  const back = inFlight === null ? '' : `, then back to Step ${inFlight}`
  return `**Next Up**: Close the spike - /plumbbob:spike done${back}`
}

/**
 * The forward pointer: the next undone step with the progress count, its
 * title, and a closing bracket carrying its advisory `- model:` recommendation
 * and where to read the step in full. No next step ⇒ the finish/step nudge
 * instead.
 *
 * The model is the second bold token the line spends, because it is the one
 * the human acts on (a `/model` call) before the next run; the path is a bare
 * `path:line` in a code span, the one link form that opens in a host and still
 * reads as a path in a PR diff.
 */
function nextUpLine(nextUp: Step | undefined, total: number, where: string): string {
  if (nextUp === undefined) {
    return '**Next Up**: Nothing planned - /plumbbob:step or /plumbbob:finish'
  }
  const title = nextUp.title.length > 0 ? ` - ${nextUp.title}` : ''
  const token = modelToken(nextUp.model)
  const bracket = token === null ? [] : [`model: **${capitalize(token)}**`]
  bracket.push(`details: \`${where}:${nextUp.line}\``)
  return `**Next Up**: Step ${nextUp.n} of ${total}${title} (${bracket.join(', ')})`
}

/**
 * The model token from a `- model:` recommendation: the first word, so a
 * `model: opus` line followed by an em dash and rationale yields `opus`.
 *
 * Null when there is no recommendation, or it degraded to whitespace (folding
 * the null model into the same guard keeps both branches live).
 */
function modelToken(model: string | null): string | null {
  const first = model?.trim().split(/\s+/)[0]
  return first !== undefined && first.length > 0 ? first : null
}

/**
 * Capitalize a token's first letter for the card's title-case furniture
 * (`(model: Sonnet)`); the rest rides through unchanged.
 */
function capitalize(s: string): string {
  return s.length === 0 ? s : `${s[0]?.toUpperCase()}${s.slice(1)}`
}

/**
 * Read a file as UTF-8, or return '' when it is missing or unreadable: an
 * absent sidecar file reads as empty rather than throwing.
 */
function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * The count in a one-line marker file: STEP (which step is open) and TICK (the
 * turn the step was entered on) are both written this way. Null when the file
 * is absent or holds anything but a bare number.
 */
function readMarker(path: string): number | null {
  try {
    const raw = readFileSync(path, 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}
