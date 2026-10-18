// `plumbbob handoff`: emit the CLI-owned ending of a turn as one contiguous
// block (docs/presentation.md). Changes no state but three: at a pause it
// leaves the detail file with a blank line around each heading, at a step pause
// it stamps what the card showed in `PAUSE`, and every render it prints is
// recorded in `RELAY` for the check at the turn's end. Every part outside
// the readout fence is a bold label, a colon, and text that wraps, one blank
// line between blocks and no fence but the readout's own. It derives the moment
// from the session: a step in flight ⇒ the decision-tier ending (the Now line
// naming that step, the labeled Readout and its fence, the inline diff when
// the change is 20 lines or fewer, the Verdict, Next Up, Your Call, and the
// Recommendation last); a landed step
// with none in flight ⇒ the orientation-tier ending (Verdict and Next Up); a
// fresh session with nothing yet measured ⇒ the forward pointer alone.
//
// A step pause renders its card once (D87 (pause-once)). While the stamp still
// matches, a later render is the one-line reminder, the driver pointer back at
// the step; the card comes back when the pause changes or on `--full`.
//
// The whole decision turn is rendered here, its opening block included: the
// Summary lead and the numbered highlights come out of `.plumbbob/detail.md`
// as the markdown the model wrote, with the `(details: …)` bracket appended so
// the model never types a path. A region the model does not author is a region
// it cannot narrate into.
//
// If the CLI can compute a recap row, the CLI does: the check row comes from
// the last run's summary, the seam and diff rows from the SEAM marker against
// the step's whole product (everything changed since HEAD, staged or not, plus
// each non-ignored new file). The model's part (`.plumbbob/detail.md`) supplies
// only what takes judgment: the Summary, the three judgment rows, and the
// recommendation; the Verdict folds the same assembled rows worst-of with the
// step's accrued stats, so the fence shows exactly what the fold saw.
//
// Every tier's ending is emitted here, so no skill has to fake the furniture in
// prose: `--plan` renders the plan-pause ending and `--driver` the driver
// turn's pointer, the two endings the session state cannot tell apart from the
// ones above. The driver pointer reads the phase it lands in: a spike open over
// the step names closing the spike, a step exit (a revert, an abandon, a spike
// closed at the boundary) finds nothing in flight and points forward, with no
// Verdict either way, since nothing landed.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { type NumstatEntry, PLAN_COMMIT_MARKER, commitsSince, diffNumstat, diffPatch, findRepoRoot } from '../lib/git.ts'
import { blocks, printEnding } from '../lib/notice.ts'
import { isArtifactPath, parseStepSeam } from '../lib/intent.ts'
import {
  buildLogPath,
  checkpointsPath,
  detailPath,
  hasSession,
  inSpike,
  intentPath,
  pausePath,
  type Relay,
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
  type DetailSection,
  type RecapRowName,
  type SpentInputs,
  type Step,
  type Summary,
  buildOrderPhrase,
  countDiff,
  diffRowValue,
  foldVerdict,
  lastLedgerSha,
  normalizeDetailHeadings,
  parkedPhrase,
  parseBuildOrder,
  parseBuildRanges,
  parseConstraintCount,
  parseLastCheckpoint,
  parseOrderedSteps,
  parseParkTotals,
  parseRecap,
  parseRecommendation,
  parseSections,
  parseSteps,
  parseSummary,
  rangeStanding,
  recapLines,
  remainingOrder,
  seamRowFromDiff,
  spentRowValue,
  summaryCheckRow,
} from '../lib/orient.ts'

// The inline-diff threshold (docs/presentation.md): at 20 changed lines or
// fewer the patch rides the turn; at 21 it stays in the working tree behind
// the counted diff row.
const INLINE_DIFF_MAX = 20

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
 * decision-tier ending (the Now line, the Readout and its fence, the inline
 * diff when small enough, the Verdict, Next Up, Your Call, and the
 * Recommendation), and so does
 * a named step that has not landed when nothing is in flight (a hand-built diff
 * under verify). That card renders once: a later render of the same pause, with
 * nothing in it changed, is the one-line reminder, and `--full` prints the card
 * whatever the stamp says. A landed step yields the orientation-tier ending
 * (Verdict and Next Up, no Your Call),
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
  // A build named by flag rides any command that reprints this ending, since
  // the cursor may point elsewhere.
  const named = args.includes('--build') ? slug : null
  const intent = readOr(intentPath(root, slug))
  // In build order, so the pointer names the step a bare `plumbbob build`
  // would enter; the build-log feeds the park count beneath it.
  const steps = parseOrderedSteps(intent)
  const buildLog = readOr(buildLogPath(root, slug))
  const inFlight = readMarker(stepPath(root, slug))
  const rawDetail = readOr(detailPath(root))
  // Where a pointer sends the reader to read the step itself: the intent file
  // as the human would type it, relative to the repo root.
  const where = relative(root, intentPath(root, slug))

  if (rest.includes('--plan')) {
    // The plan pause judges the plan, so nothing is measured and no Verdict
    // renders; the pointer and the moves both aim at the first undone step. A
    // decision turn still ends on the model's recommendation when it wrote one.
    const first = steps.find((s) => !s.done)
    const detail = settleDetail(root, rawDetail)
    const plan = [
      SEAM_RULE,
      nextUpBlock(intent, buildLog, first, null, where),
      planCallBlock(first),
    ]
    const command = reprintCommand('--plan', undefined, named)
    return emit(root, { tier: 'decision', render: 'plan', command }, withRecommendation(plan, parseRecommendation(detail)))
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
    return emit(root, { tier: 'driver', render: 'driver' }, [driverPointer(root, slug)])
  }

  if (current === null) {
    // Nothing measured yet (a fresh session): no Verdict, just the forward pointer.
    return emit(root, { tier: 'orientation', render: 'pointer' }, [
      nextUpBlock(intent, buildLog, nextUp, current, where),
    ])
  }

  // A step is pending, and its hand-off is the pause, while it is in flight.
  // With nothing in flight, a step the turn names that has not landed is
  // pending too: a diff built outside `/plumbbob:build` reaches
  // `/plumbbob:verify` with no STEP marker, and the number is how the skill says
  // which pause to render.
  const pending = inFlight !== null || (explicit !== undefined && steps.some((s) => s.n === current && !s.done))
  if (!pending) {
    // The boundary: the orientation-tier ending, the state word and the forward
    // pointer, no decision pending and so no Your Call. The same two parts the
    // checkpoint printed for itself, from the same call.
    const landed = boundaryEnding(root, slug, current)
    return emit(root, { tier: 'orientation', render: 'boundary' }, [landed.verdict, landed.pointer])
  }

  // The pause: the whole turn as one contiguous block, each part a labeled line
  // with one blank line between, and the only fence the readout's own (plus the
  // inline diff when the change is small enough). It opens on the step in
  // flight and then the Summary the model wrote into the detail file, so there
  // is no seam left to rule off.
  const detail = settleDetail(root, rawDetail)
  const { rows, work, summary, checkGreen } = measured(root, slug, intent, detail, current)
  const { ladder, worst } = foldVerdict(rows, accruedStats(root, slug, current))
  const verdict = verdictLine(ladder, worst)
  const counts = countDiff(work)
  const changed = counts.added + counts.removed
  // The patch comes first so `· inline below` is a promise the fence keeps: a
  // small change git can still print nothing for (a vanished path) falls back
  // to the bare counts rather than pointing at a fence that never arrives. The
  // stamp hashes it at any size, so it is read whenever there is a change.
  const fullPatch = changed > 0 ? diffPatch(root, work) : ''
  const patch = changed <= INLINE_DIFF_MAX ? fullPatch : ''
  const inline = patch.length > 0
  const diffRow = diffRowValue(counts, inline)
  const stamp = pauseStamp(current, detail, measuredLines(rows, diffRow), fullPatch)
  if (!rest.includes('--full') && readOr(pausePath(root, slug)).trim() === stamp) {
    // The pause the human already read, unchanged: the answer above this line
    // is what they asked for, and the card would push it off the screen.
    const command = reprintCommand(null, explicit, named)
    return emit(root, { tier: 'decision', render: 'reminder', command }, [
      `**Next Up**: Back to ${stepPhrase(current, steps)}`,
    ])
  }
  writePause(root, slug, stamp)
  const readout = recapLines(rows, {
    diff: diffRow,
    spent: spentRowValue(spentInputs(root, slug, current, summary)),
    constraints: parseConstraintCount(intent),
  })
  const parts: string[] = [
    `**Now**: ${stepPhrase(current, steps)}`,
    summaryBlock(parseSummary(detail), relative(root, detailPath(root))),
  ]
  if (readout.length > 0) {
    parts.push([READOUT_LABEL, '', ...fence('text', readout)].join('\n'))
  }
  if (inline) {
    parts.push(fence('diff', patch.split('\n')).join('\n'))
  }
  parts.push(
    verdict,
    nextUpBlock(intent, buildLog, nextUp, current, where),
    yourCallBlock(current, checkGreen),
  )
  const command = reprintCommand('--full', explicit, named)
  return emit(root, { tier: 'decision', render: 'card', command }, withRecommendation(parts, parseRecommendation(detail)))
}

/**
 * The detail file's text with a blank line around each heading, written back to
 * disk when that changed anything, so the file the gate lints before
 * `checkpoint` clears it is clean whatever the model typed.
 *
 * The render goes out on the normalized text either way. A failed write costs
 * only the lint guard: stdout and the exit code are the same as if it had
 * landed.
 */
function settleDetail(root: string, raw: string): string {
  const clean = normalizeDetailHeadings(raw)
  if (clean !== raw) {
    try {
      writeFileSync(detailPath(root), clean)
    } catch {
      // Read-only tree or a vanished directory: the pause still renders.
    }
  }
  return clean
}

/**
 * The stamp of a step pause: its number and a hash of everything on the card a
 * later turn could change, so the reminder prints only while the pause is the
 * one the human already read.
 *
 * Hashed: the detail file as normalized, the measured check and seam rows and
 * the diff row as rendered, and the patch the diff row counts, so an edit that
 * keeps the counts still reads as a touched file. Never `spent`: it counts
 * turns, so it moves on every turn and would make every render look new.
 */
function pauseStamp(step: number, detail: string, rendered: ReadonlyArray<string>, patch: string): string {
  const hash = createHash('sha256')
  for (const part of [detail, ...rendered, patch]) {
    hash.update(part).update('\0')
  }
  return `${step} ${hash.digest('hex')}`
}

/**
 * The readout rows the CLI measured, as the card renders them: `check`,
 * `seam`, and `diff`. The judgment rows ride the detail file, which the stamp
 * hashes whole, and `spent` stays out of it.
 */
function measuredLines(rows: Partial<Record<RecapRowName, RecapRow>>, diff: string | null): string[] {
  const measuredRows: Partial<Record<RecapRowName, RecapRow>> = {}
  if (rows.check !== undefined) {
    measuredRows.check = rows.check
  }
  if (rows.seam !== undefined) {
    measuredRows.seam = rows.seam
  }
  return recapLines(measuredRows, { diff, spent: null, constraints: 0 })
}

/**
 * Record the stamp of the card just printed. A failed write costs one more
 * full card on a later turn, never this turn's output or its exit code.
 */
function writePause(root: string, slug: string | null, stamp: string): void {
  try {
    writeFileSync(pausePath(root, slug), `${stamp}\n`)
  } catch {
    // A read-only tree or a vanished build folder: the card still renders.
  }
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
  const steps = parseOrderedSteps(intent)
  const nextUp = steps.find((s) => !s.done && s.n !== step)
  return {
    verdict: step === null ? null : landedVerdict(root, slug, intent, step),
    pointer: nextUpBlock(intent, readOr(buildLogPath(root, slug)), nextUp, step, relative(root, intentPath(root, slug))),
  }
}

/** A boundary ending's CLI-rendered parts: the Verdict, where one was measured, and the pointer. */
export type BoundaryEnding = { readonly verdict: string | null; readonly pointer: string }

/**
 * The step's record for the build-log's Log: the pause as the human approved
 * it, with the full story behind each highlight beneath. The Summary and its
 * highlights, the Readout fence, the Verdict, the recommendation, then the
 * numbered sections' bodies, blank-line separated and unindented; the caller
 * nests it under the Log's dated line.
 *
 * The record carries no Now line, and its Readout label stays bare like the
 * card's: the dated Log line above it already names the step.
 *
 * Measured, not recalled: the check, seam, and diff rows are read the same way
 * the pause read them. Both measures run against HEAD, so staging no longer
 * moves the counts and the caller's build-then-stage order is a nicety rather
 * than a requirement. Null when the detail file carries nothing to record, so a
 * hand-built step with no detail gets the bare dated line it always did.
 */
export function stepRecord(root: string, slug: string | null, step: number, detail: string): string | null {
  const summary = parseSummary(detail)
  const recommendation = parseRecommendation(detail)
  const sections = parseSections(detail)
  if (summary === null && recommendation === null && sections.length === 0 && parseRecap(detail) === null) {
    // Nothing on the wire's shape: a blank file records nothing, and anything
    // else the model wrote is kept verbatim rather than lost with the file.
    const raw = detail.trim()
    return raw.length === 0 ? null : raw
  }
  const intent = readOr(intentPath(root, slug))
  const { rows, work, summary: check } = measured(root, slug, intent, detail, step)
  const { ladder, worst } = foldVerdict(rows, accruedStats(root, slug, step))
  const readout = recapLines(rows, {
    diff: diffRowValue(countDiff(work), false),
    spent: spentRowValue(spentInputs(root, slug, step, check)),
    constraints: parseConstraintCount(intent),
  })
  const parts: string[] = []
  if (summary !== null) {
    parts.push(recordSummary(summary))
  }
  if (readout.length > 0) {
    parts.push([READOUT_LABEL, '', ...fence('text', readout)].join('\n'))
  }
  parts.push(verdictLine(ladder, worst))
  return [...withRecommendation(parts, recommendation), ...sectionBlocks(sections)].join('\n\n')
}

/**
 * The plan's record for the Log: the cold read's recommendation and the
 * findings behind it. Nothing is measured at the plan pause, so no Readout and
 * no Verdict ride here. Null when the detail file carries neither.
 */
export function planRecord(detail: string): string | null {
  const recommendation = parseRecommendation(detail)
  const sections = parseSections(detail)
  if (recommendation === null && sections.length === 0) {
    return null
  }
  return [...withRecommendation([], recommendation), ...sectionBlocks(sections)].join('\n\n')
}

/**
 * The record's opening block: the Summary lead without the `(details: …)`
 * bracket, since the record is where the detail now lives, then the
 * highlights under their own handles.
 */
function recordSummary(summary: Summary): string {
  const lead = `**Summary**: ${summary.lead}`
  if (summary.highlights.length === 0) {
    return lead
  }
  return [lead, '', ...summary.highlights.map((h) => `${h.n}. ${h.title}`)].join('\n')
}

/**
 * The full story behind each highlight, one block per section: the handle in
 * bold, the title, then the body as the model wrote it. A section with no body
 * is just its line.
 */
function sectionBlocks(sections: ReadonlyArray<DetailSection>): string[] {
  return sections.map((s) => (s.body.length === 0 ? `**${s.n}.** ${s.title}` : `**${s.n}.** ${s.title}\n\n${s.body}`))
}

/**
 * The driver turn's pointer: back at the step still open, at the spike raised
 * over it, or forward from the boundary when the step has already exited.
 *
 * A park or a spike interrupts a step without ending it, so nothing landed and
 * no Verdict rides above this line.
 */
export function driverPointer(root: string, slug: string | null): string {
  const intent = readOr(intentPath(root, slug))
  // The forward fallback follows the build order like every other pick; the
  // driver line itself stays one line, with no note beneath it.
  const steps = parseOrderedSteps(intent)
  const inFlight = readMarker(stepPath(root, slug))
  const driver = inSpike(root, slug) ? spikeNextUpLine(inFlight) : driverNextUpLine(steps, inFlight)
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
  readonly work: ReadonlyArray<NumstatEntry>
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
 * Print an ending, record it for the relay check, and return handoff's exit
 * code.
 *
 * The parts are stacked by the same assembly a transition verb prints its own
 * ending through, so the block reads the same whichever command emitted it.
 */
function emit(root: string, kind: Omit<Relay, 'text'>, parts: ReadonlyArray<string | null>): number {
  printEnding(root, { ...kind, text: blocks(parts) })
  return 0
}

/**
 * The command that prints a decision ending again, for the retry the relay
 * check asks for: handoff in the form that printed it, with the step a verify
 * pause was named by and the build a flag named, so the retry lands on the
 * same pause with nothing in flight and the cursor elsewhere.
 */
function reprintCommand(form: '--full' | '--plan' | null, step: string | undefined, build: string | null): string {
  const parts = ['plumbbob handoff', form, step, build === null ? null : `--build ${build}`]
  return parts.filter((p) => p !== null && p !== undefined).join(' ')
}

/**
 * The Verdict line from an already-folded result: the ladder rung, and the
 * worst component in a trailing parenthetical when one exists.
 *
 * No step segment rides here. The identity renders once per turn: the Now line
 * names the step in flight with its count, Next Up names the step to come with
 * its own, and the Verdict is left saying the one thing only it says.
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

// The Readout's label, bare on the card and in the record alike: the Now line
// at the top of the card names the step the fence measures, and a label that
// named it too would put the step on the card twice.
const READOUT_LABEL = '**Readout**:'

/**
 * A step named the way every pointer names it: the number, the count out of
 * the whole plan, and the title behind a plain hyphen.
 *
 * The count is the plan's own, step number over total, so the Now line and
 * Next Up agree under a re-sequenced build order. It is dropped only where it
 * would lie: a step the plan no longer holds is its number alone, since
 * "Step 9 of 3" would be worse than no count.
 */
function stepPhrase(n: number, steps: ReadonlyArray<Step>): string {
  const step = steps.find((s) => s.n === n)
  if (step === undefined) {
    return `Step ${n}`
  }
  const title = step.title.length > 0 ? ` - ${step.title}` : ''
  return `Step ${n} of ${steps.length}${title}`
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
 * directs is the fix. The expand move also names the way back to the card,
 * since an expand turn ends on the reminder and the reminder states no move.
 * `revert` comes last, because a destructive move is named rather than
 * discovered. `looks good` renders only while the measured check is green;
 * offering a move that would refuse teaches a false ceremony.
 */
function yourCallBlock(step: number, checkGreen: boolean): string {
  const moves: string[] = []
  if (checkGreen) {
    moves.push(callLine('`looks good`', `I checkpoint Step ${step}; back to the boundary`))
  }
  moves.push(
    callLine('`expand`, or any question', 'I show more of what is there; nothing changes, and `show the pause` brings all of this back'),
  )
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
function driverNextUpLine(steps: ReadonlyArray<Step>, inFlight: number | null): string | null {
  return inFlight === null ? null : `**Next Up**: Back to ${stepPhrase(inFlight, steps)}`
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

// The card's cap on the build-order reminder: the next five steps, the rest a
// count. The line is a reminder; the dashboard holds the whole sequence.
const ORDER_CAP = 5

/**
 * The line beneath the forward pointer: the range segment, when the plan
 * declares build ranges; the build order from the step the pointer names, when
 * `## Build order` re-sequences the plan away from its numbering; and the park
 * count, when anything has been parked. '' when none says anything, so a plan
 * with no ranges, nobody re-sequenced, and an empty park list renders the
 * pointer alone, as before.
 *
 * Indented two spaces, because an indented line continues the part above it
 * to every reader of the anatomy (the advisory's `→` remedy line is the
 * precedent), where a flush one would open a stray. The parks ride even under
 * `Nothing planned`: an unharvested list at the end of the plan is the one
 * reminder that matters there.
 */
function nextUpNote(intent: string, buildLog: string, exclude: number | null, range: string): string {
  const parks = parseParkTotals(buildLog)
  const segments = [
    range,
    buildOrderPhrase(remainingOrder(parseSteps(intent), parseBuildOrder(intent), exclude), ORDER_CAP),
    parks.total > 0 ? parkedPhrase(parks) : '',
  ].filter((s) => s.length > 0)
  return segments.length === 0 ? '' : `  · ${segments.join(' · ')}`
}

/**
 * The forward pointer with its note beneath, as one part: `blocks` keeps a
 * part's own newlines, so the note rides flush under the line it qualifies.
 *
 * `exclude` is the step the turn is about: the step in flight at a pause, the
 * step just landed at a boundary, null at the plan pause and the plan commit.
 * While the note suggests a range, the bracket bolds the range's model, since
 * the run is the range and that is the `/model` the human picks before typing
 * it.
 */
function nextUpBlock(intent: string, buildLog: string, nextUp: Step | undefined, exclude: number | null, where: string): string {
  const steps = parseOrderedSteps(intent)
  const range = rangeSegment(intent, steps, nextUp, exclude)
  const line = nextUpLine(nextUp, steps.length, where, range.model ?? nextUp?.model ?? null)
  const note = nextUpNote(intent, buildLog, exclude, range.segment)
  return note.length === 0 ? line : `${line}\n${note}`
}

/**
 * The range segment that leads the note, and the model the pointer's bracket
 * bolds while it suggests a range: `range 3 of 5: /plumbbob:build 6-9` with
 * the range's model, the re-cut words for a flagged range, the words for a step
 * no range names, or '' for a plan without ranges.
 *
 * The step the turn is about reads as landed, so a step pause names what is
 * left of the range once the step in flight lands. A flagged range, and a
 * range with no `- model:` line, leave the step's model in the bracket.
 */
function rangeSegment(
  intent: string,
  steps: ReadonlyArray<Step>,
  nextUp: Step | undefined,
  exclude: number | null,
): { readonly segment: string; readonly model: string | null } {
  const landed = steps.map((s) => (s.n === exclude ? { ...s, done: true } : s))
  const { count, holding, command, flag } = rangeStanding(parseBuildRanges(intent), landed, nextUp?.n ?? null)
  if (holding !== null && command !== null) {
    return { segment: `range ${holding.item} of ${count}: ${command}`, model: holding.model }
  }
  if (flag === null) {
    return { segment: '', model: null }
  }
  return { segment: holding === null ? flag : `range ${holding.item} of ${count} needs a re-cut (${flag})`, model: null }
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
 * reads as a path in a PR diff. The line alone is the driver tier's pointer;
 * every other tier rides `nextUpNote` beneath it, through `nextUpBlock`.
 */
function nextUpLine(nextUp: Step | undefined, total: number, where: string, model = nextUp?.model ?? null): string {
  if (nextUp === undefined) {
    return '**Next Up**: Nothing planned - /plumbbob:step or /plumbbob:finish'
  }
  const title = nextUp.title.length > 0 ? ` - ${nextUp.title}` : ''
  const token = modelToken(model)
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
