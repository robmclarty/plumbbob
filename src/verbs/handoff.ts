// `plumbbob handoff`: emit the CLI-owned ending of a turn as one contiguous
// block (docs/presentation.md). Changes no state but three: at a pause it
// leaves the detail file with a blank line around each heading, it stamps
// which card has shown in `PAUSE` (or `STOP`, for a stop card), and every
// render it prints is recorded in `RELAY` for the check at the turn's end. It
// derives the moment from the session: a step in flight ⇒ the decision-tier
// card (the Summary, the labeled Readout and its fence, the inline diff when
// the change is 20 lines or fewer, Your Call, the state table, the
// Recommendation, and the `more details` link last); a landed step with none
// in flight ⇒ the orientation-tier ending (the state table, headed by the
// Verdict); a fresh session with nothing yet measured ⇒ the table's pointer
// alone.
//
// A card shows once (D110 (reply-after-the-card)). After a pause, a stop, or
// a boundary has shown, every later render of it is the one line that points
// back at it, whatever the work did since: the turn that asked is the model's
// reply, closed by that line, and the card comes back only on `--full`.
//
// The whole decision turn is rendered here, its opening block included: the
// Summary lead comes out of `.plumbbob/detail.md` as the markdown the model
// wrote, and the card closes on one `more details` link to the file, so the
// model never types a path (D113 (short-card)). A region the model does not
// author is a region it cannot narrate into.
//
// If the CLI can compute a recap row, the CLI does: the check row comes from
// the last run's summary, the seam and diff rows from the SEAM marker against
// the step's whole product (everything changed since HEAD, staged or not, plus
// each non-ignored new file), with the changed files listed beneath the diff
// row. The model's part (`.plumbbob/detail.md`) supplies only what takes
// judgment: the Summary, the three judgment rows, and the recommendation; the
// Verdict folds the same assembled rows worst-of with the step's accrued
// stats, so the fence shows exactly what the fold saw.
//
// Every tier's ending is emitted here, so no skill has to fake the furniture in
// prose: `--plan` renders the plan-pause ending and `--driver` the driver
// turn's pointer, the two endings the session state cannot tell apart from the
// ones above; `--stop` the stop card that closes a run's range, which reads
// a boundary the session state cannot tell from a plain one either; and
// `--harvest` a boundary harvest's leans, as the same table the stop card
// carries (D112 (lean-table)). The stop card shows once too, under its own
// stamp in `STOP`, which also carries the turn it printed in for
// `plumbbob harvest`'s latch. The driver pointer reads the phase it lands in:
// a spike open over the step names closing the spike, a step exit (a revert,
// an abandon, a spike closed at the boundary) finds nothing in flight and
// points forward, with no Verdict either way, since nothing landed.

import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import {
  type NumstatEntry,
  PLAN_COMMIT_MARKER,
  commitNumstat,
  commitsBetween,
  commitsSince,
  diffNumstat,
  diffPatch,
  findRepoRoot,
} from '../lib/git.ts'
import { blocks, cell, notice, printEnding, type StateRow, stateTable } from '../lib/notice.ts'
import { hasStep } from '../lib/steplist.ts'
import { isArtifactPath, parseStepSeam } from '../lib/intent.ts'
import {
  buildLogPath,
  checkpointsPath,
  detailPath,
  hasSession,
  inSpike,
  intentPath,
  type Relay,
  readPause,
  readStats,
  readStop,
  readTurn,
  resolveBuild,
  seamPath,
  stepPath,
  tickPath,
  writePause,
  writeStop,
} from '../lib/sidecar.ts'
import {
  type AccruedStats,
  type BuildRange,
  type CheckSummary,
  type Ladder,
  type RecapRow,
  type DetailSection,
  type RangeMeasure,
  type RecapRowName,
  type SpentInputs,
  type Step,
  type Summary,
  buildOrderPhrase,
  countDiff,
  diffFileItems,
  diffRowValue,
  foldVerdict,
  lastLedgerSha,
  measureRange,
  normalizeDetailHeadings,
  parseBuildOrder,
  parseBuildRanges,
  parseConstraintCount,
  parseLastCheckpoint,
  parseOpenQuestions,
  parseOrderedSteps,
  parseParkTotals,
  parseRecap,
  parseRecommendation,
  parseSections,
  parseSteps,
  parseSummary,
  rangeLanded,
  rangeSpan,
  rangeStanding,
  recapLines,
  remainingOrder,
  resolveRun,
  runBracket,
  seamRowFromDiff,
  spentRowValue,
  stopFollowUp,
  summaryCheckRow,
  type Run,
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
 * decision-tier card (the Summary, the Readout and its fence, the inline diff
 * when small enough, Your Call, the state table, the Recommendation, and the
 * `more details` link), and so does a named step that has not landed when
 * nothing is in flight (a hand-built diff under verify). A landed step yields
 * the orientation-tier ending (the state table, no Your Call), and a fresh
 * session with nothing to report yields the table's pointer alone.
 *
 * Each card shows once (D110 (reply-after-the-card)): once a pause or a
 * boundary has shown, a later render of it is the one line that points back
 * at it, whatever the work did since, and `--full` prints the card again. The
 * endings no session state can distinguish are named by a flag: `--plan` is
 * the plan pause (a decision turn about the plan, not a diff), `--driver` is a
 * driver turn (a park, a spike, a `use`), which interrupts a step without
 * ending it, `--stop` is the stop card, and `--harvest` a boundary harvest's
 * leans.
 */
export function handoff(cwd: string, args: ReadonlyArray<string> = []): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug, rest } = resolveBuild(root, args)
  const tiers = ['--plan', '--driver', '--stop', '--harvest'].filter((flag) => rest.includes(flag))
  if (tiers.length > 1) {
    process.stderr.write(`plumbbob: handoff: ${tiers.join(' and ')} name different tiers; pass one.\n`)
    return 1
  }
  // A build named by flag rides any command that reprints this ending, since
  // the cursor may point elsewhere.
  const named = args.includes('--build') ? slug : null
  const full = rest.includes('--full')
  if (rest.includes('--stop')) {
    return stopCard(root, slug, named, full)
  }
  if (rest.includes('--harvest')) {
    return harvestCard(root, slug)
  }
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
  const detailWhere = relative(root, detailPath(root))

  if (rest.includes('--plan')) {
    // The plan pause judges the plan, so nothing is measured and no Verdict
    // renders; the moves and the table both aim at the first undone step. A
    // decision turn still ends on the model's recommendation when it wrote one.
    const first = steps.find((s) => !s.done)
    const detail = settleDetail(root, rawDetail)
    const plan = [
      SEAM_RULE,
      planCallBlock(first, cardRun(intent, null)),
      stateTable(stateRows({ intent, buildLog, verdict: null, now: null, stop: null, nextUp: first, exclude: null, where })),
    ]
    const command = reprintCommand('--plan', undefined, named)
    return emit(root, { tier: 'decision', render: 'plan', command }, cardFoot(plan, detail, detailWhere))
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
    // Nothing measured yet (a fresh session): no Verdict, just the table's pointer.
    return emit(root, { tier: 'orientation', render: 'pointer' }, [
      stateTable(stateRows({ intent, buildLog, verdict: null, now: null, stop: null, nextUp, exclude: current, where })),
    ])
  }

  // A step is pending, and its hand-off is the pause, while it is in flight.
  // With nothing in flight, a step the turn names that has not landed is
  // pending too: a diff built outside `/plumbbob:build` reaches
  // `/plumbbob:verify` with no STEP marker, and the number is how the skill says
  // which pause to render.
  const pending = inFlight !== null || (explicit !== undefined && steps.some((s) => s.n === current && !s.done))
  const shown = readPause(root, slug)
  if (!pending) {
    if (!full && shown?.kind === 'landed' && shown.step === current) {
      // The boundary the human already read: the reply above this line is what
      // they asked for, and the block would push it off the screen. Driver
      // tier, since nothing is pending to hold the turn for.
      return emit(root, { tier: 'driver', render: 'pointer' }, [pointerLine(intent, nextUp, current, where)])
    }
    // The boundary: the orientation-tier ending, the state table headed by the
    // Verdict, with the Stop row where a range just landed, and no decision
    // pending, so no Your Call. The same table the checkpoint printed for
    // itself, from the same call.
    writePause(root, slug, { kind: 'landed', step: current })
    return emit(root, { tier: 'orientation', render: 'boundary' }, [stateTable(boundaryEnding(root, slug, current).state)])
  }

  // The pause: the whole turn as one contiguous block, each part a labeled line
  // or the state table, with one blank line between, and the only fence the
  // readout's own (plus the inline diff when the change is small enough). It
  // opens on the Summary the model wrote into the detail file, so there is no
  // seam left to rule off.
  const detail = settleDetail(root, rawDetail)
  if (!full && shown?.kind === 'pause' && shown.step === current) {
    // The pause the human already read: the reply above this line is what
    // they asked for, and the card would push it off the screen. It stays the
    // reminder whatever changed since, a rewritten detail file, an edit, or a
    // gate run that moved the check row, because a later turn at the pause is
    // the model's reply, and the card comes back only when asked.
    const command = reprintCommand(null, explicit, named)
    return emit(root, { tier: 'decision', render: 'reminder', command }, [
      `**Next Up**: Back to ${stepPhrase(current, steps)}`,
    ])
  }
  const { rows, work, summary, checkGreen } = measured(root, slug, intent, detail, current)
  const { ladder, worst } = foldVerdict(rows, accruedStats(root, slug, current))
  const counts = countDiff(work)
  const changed = counts.added + counts.removed
  // The patch comes first so `· inline below` is a promise the fence keeps: a
  // small change git can still print nothing for (a vanished path) falls back
  // to the bare counts rather than pointing at a fence that never arrives.
  const patch = changed > 0 && changed <= INLINE_DIFF_MAX ? diffPatch(root, work) : ''
  const inline = patch.length > 0
  writePause(root, slug, { kind: 'pause', step: current })
  const readout = recapLines(rows, {
    diff: diffRowValue(counts, inline),
    files: diffFileItems(work),
    spent: spentRowValue(spentInputs(root, slug, current, summary)),
    constraints: parseConstraintCount(intent),
  })
  const parts: string[] = [summaryBlock(parseSummary(detail))]
  if (readout.length > 0) {
    parts.push([READOUT_LABEL, '', ...fence('text', readout)].join('\n'))
  }
  if (inline) {
    parts.push(fence('diff', patch.split('\n')).join('\n'))
  }
  parts.push(
    yourCallBlock(current, checkGreen, cardRun(intent, current)),
    stateTable(
      stateRows({
        intent,
        buildLog,
        verdict: verdictValue(ladder, worst),
        now: stepPhrase(current, steps),
        stop: null,
        nextUp,
        exclude: current,
        where,
      }),
    ),
  )
  const command = reprintCommand('--full', explicit, named)
  return emit(root, { tier: 'decision', render: 'card', command }, cardFoot(parts, detail, detailWhere))
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
 * The CLI-rendered state of a boundary ending: the state table's rows, headed
 * by the Verdict folded from everything measurable right now, with the Stop
 * row when the landing finished a range, then Next Up and the rows beneath it.
 *
 * `step` is the step that just landed, or null at a plan commit and a stop's
 * record, where nothing was measured and the Verdict and the Stop row both
 * vanish. A transition verb prints the table beneath its own lead line, so a
 * boundary reads identically whether `checkpoint` emitted it or a later
 * `handoff` did; the paths a stray advisory named are the one part that does
 * not survive, and the commit holds those.
 */
export function boundaryEnding(root: string, slug: string | null, step: number | null): BoundaryEnding {
  const intent = readOr(intentPath(root, slug))
  const steps = parseOrderedSteps(intent)
  const nextUp = steps.find((s) => !s.done && s.n !== step)
  const where = relative(root, intentPath(root, slug))
  const landed = landedRange(intent, steps, step)
  return {
    state: stateRows({
      intent,
      buildLog: readOr(buildLogPath(root, slug)),
      verdict: step === null ? null : landedVerdict(root, slug, intent, step),
      now: null,
      stop: landed === null ? null : stopValue(landed, where),
      nextUp,
      exclude: step,
      where,
    }),
    range: landed === null ? null : { item: landed.range.item, count: landed.count },
  }
}

/**
 * A boundary ending's CLI-rendered state: the table's rows, and the range
 * whose landing earned the Stop row, so a run's checkpoint can say its
 * boundary owes the stop card.
 */
export type BoundaryEnding = {
  readonly state: ReadonlyArray<StateRow>
  readonly range: { readonly item: number; readonly count: number } | null
}

/** A range that lands its steps, completed by the landing of `step`, and the plan's count of ranges. */
type LandedRange = { readonly range: BuildRange; readonly count: number; readonly step: number }

/**
 * The range that lands its steps whose last undone step was `step`, now
 * landed, or null for every other landing: one that leaves its range open, a
 * bare range (its stop was its own pause), a step no range names, a plan
 * without ranges, and the plan commit, where nothing landed.
 */
function landedRange(intent: string, steps: ReadonlyArray<Step>, step: number | null): LandedRange | null {
  if (step === null) {
    return null
  }
  const { count, completed } = rangeStanding(parseBuildRanges(intent), steps, step)
  return completed === null || completed.bare ? null : { range: completed, count, step }
}

/**
 * The Stop row's fact: why the build stops at this boundary. The range over
 * the count, a plain hyphen, the stop as the plan wrote it, and a bracket
 * pointing at the item, where its note can be read. The stop card's state
 * table carries the same row.
 */
function stopValue(landed: LandedRange, where: string): string {
  return `Range ${landed.range.item} of ${landed.count} landed - ${landed.range.stop} (${detailsLink(where, landed.range.line)})`
}

/**
 * The `details:` clause every bracket on a card carries, in its short linked
 * form: the file's name and line as the link's text, and its path from the
 * repo root with a `#L41` fragment as the target. With no line, the name links
 * the whole file, as the Summary lead's does, since the whole file is the
 * detail.
 *
 * The full path was noise on every card while the name alone still says which
 * file, and a relative target keeps any one machine's path out of a pasted
 * card (D107 (short-linked-paths)).
 */
export function detailsLink(path: string, line: number | null): string {
  const name = basename(path)
  return line === null ? `details: [${name}](${path})` : `details: [${name}:${line}](${path}#L${line})`
}

/**
 * The stop card that closes a run's range (docs/presentation.md): the range's
 * Summary from the range's detail file, the Readout measured across the range,
 * the Harvested part while a park is open, Your Call, the state table headed
 * by the Verdict, with the Stop row, Next Up, and the rows beneath it, the
 * recommendation, and the `more details` link.
 *
 * It renders for the range the last landing completed, and refuses with a
 * step in flight, with no range just landed, and with a detail file written
 * for anything but that range, since a card with none of the model's review
 * on it would ask the human to approve nothing. It shows once per stop: while
 * the STOP stamp names the range, a later render is the one-line reminder,
 * whatever changed since (a lean the human changed, a park, a gate run), and
 * `--full` prints the card again. Every card it prints rewrites the stamp with
 * the turn it printed in, which is the turn `plumbbob harvest` waits past.
 */
function stopCard(root: string, slug: string | null, named: string | null, full: boolean): number {
  const intent = readOr(intentPath(root, slug))
  const steps = parseOrderedSteps(intent)
  const landed = stopRange(root, slug, intent, steps)
  if (typeof landed === 'string') {
    process.stderr.write(landed)
    return 1
  }
  const { range, count, step } = landed
  const detail = settleDetail(root, readOr(detailPath(root)))
  if (parseDetailRange(detail) !== range.item) {
    process.stderr.write(
      notice({
        fact: 'no stop card to render',
        detail: [`the detail file is not range ${range.item}'s`],
        remedy: `write range ${range.item}'s detail in .plumbbob/detail.md, then plumbbob handoff --stop`,
      }),
    )
    return 1
  }
  const stamp = readStop(root, slug)
  if (!full && stamp !== null && stamp.range === range.item) {
    // The stop the human already read: the reply above this line is what they
    // asked for, and the card would push it off the screen.
    const command = reprintCommand('--stop', undefined, named)
    return emit(root, { tier: 'decision', render: 'stop-reminder', command }, [
      `**Next Up**: Back to Range ${range.item} of ${count}'s stop - ${range.stop}`,
    ])
  }
  writeStop(root, slug, { range: range.item, turn: readTurn(root) })
  const where = relative(root, intentPath(root, slug))
  const review = stopReview(root, slug, intent, range, detail)
  const parks = parkList(readOr(buildLogPath(root, slug)))
  const proposals = harvestProposals(detail)
  const nextUp = steps.find((s) => !s.done && s.n !== step)
  const parts: string[] = [summaryBlock(parseSummary(detail))]
  if (review.readout.length > 0) {
    parts.push([READOUT_LABEL, '', ...fence('text', review.readout)].join('\n'))
  }
  parts.push(
    harvestPart(parks, proposals) ?? '',
    stopCallBlock(leanExample(parks, proposals), intent),
    stateTable(
      stateRows({
        intent,
        // No Parked row here: the Harvested lead above sizes the list.
        buildLog: '',
        verdict: review.verdict,
        now: null,
        stop: stopValue(landed, where),
        nextUp,
        exclude: step,
        where,
      }),
    ),
  )
  const command = reprintCommand('--stop --full', undefined, named)
  return emit(root, { tier: 'decision', render: 'stop', command }, cardFoot(parts, detail, relative(root, detailPath(root))))
}

/**
 * The range the stop card reviews: the one the last landing completed, or the
 * refusal that says why no stop card renders, with the move that does render
 * this moment.
 */
function stopRange(root: string, slug: string | null, intent: string, steps: ReadonlyArray<Step>): LandedRange | string {
  const refuse = (why: string, remedy: string): string => notice({ fact: 'no stop card to render', detail: [why], remedy })
  const inFlight = readMarker(stepPath(root, slug))
  if (inFlight !== null) {
    return refuse(`step ${inFlight} is in flight`, 'plumbbob handoff renders its pause')
  }
  const last = parseLastCheckpoint(readOr(checkpointsPath(root, slug)))
  if (last === null) {
    return refuse('no step has landed', 'plumbbob handoff renders the pointer')
  }
  const landed = landedRange(intent, steps, last.n)
  if (landed === null) {
    const { completed, count } = rangeStanding(parseBuildRanges(intent), steps, last.n)
    const why =
      completed === null
        ? `step ${last.n} landed last, and completed no range`
        : `range ${completed.item} of ${count} is bare, and its stop was step ${last.n}'s pause`
    return refuse(why, 'plumbbob handoff renders this boundary')
  }
  return landed
}

/** A stop's review as the CLI measures it: the Readout's lines, and the Verdict's fact. */
type StopReview = { readonly readout: ReadonlyArray<string>; readonly verdict: string }

/**
 * Measure a landed range and fold its Verdict: the CLI's rows across the
 * range's commits, the ledger, stats.json, and the last check, joined with
 * the three judgment rows the range's detail wrote, the measured ones winning
 * where both exist.
 *
 * The card and the record read the review through this one call, so the Log
 * keeps exactly what the card showed.
 */
function stopReview(root: string, slug: string | null, intent: string, range: BuildRange, detail: string): StopReview {
  const measure = rangeMeasure(root, slug, intent, range)
  const rows: Partial<Record<RecapRowName, RecapRow>> = { ...(parseRecap(detail, 'range')?.rows ?? {}), ...measure.rows }
  const { ladder, worst } = foldVerdict(rows, measure.stats, 'range')
  return {
    readout: recapLines(rows, {
      steps: measure.steps,
      diff: measure.diff,
      files: measure.files,
      spent: measure.spent,
      constraints: parseConstraintCount(intent),
    }),
    verdict: verdictValue(ladder, worst),
  }
}

/**
 * Read what a landed range's measures are taken from: each checkpoint's
 * commit the ledger names for a step of the range, the first-parent commits
 * across the range's span for the out-of-band count, stats.json, and the last
 * check's summary.
 */
function rangeMeasure(root: string, slug: string | null, intent: string, range: BuildRange): RangeMeasure {
  const checkpoints = readOr(checkpointsPath(root, slug))
  const commits: Record<string, ReadonlyArray<NumstatEntry>> = {}
  for (const line of checkpoints.split('\n')) {
    const m = /^step\s+(\d+)\s+(\S+)/.exec(line.trim())
    const sha = m?.[2]
    if (sha !== undefined && hasStep(range.steps, Number(m?.[1]))) {
      commits[sha] = commitNumstat(root, sha)
    }
  }
  const span = rangeSpan(checkpoints, range)
  return measureRange({
    range,
    intent,
    checkpoints,
    stats: readStats(root, slug),
    commits,
    between: span === null ? [] : commitsBetween(root, span.from, span.to, PLAN_COMMIT_MARKER),
    summary: readCheckSummary(root),
  })
}

/** One line of the park list: its handle, whether it is still open, and its text as the list holds it. */
export type Park = { readonly handle: number; readonly open: boolean; readonly text: string }

/**
 * The park list under `build-log.md`'s `## Park list`, each line with its
 * handle: its place in the list, counting every line ever parked, harvested
 * ones included.
 *
 * A line is never deleted from the list, only flipped, so the handle is
 * stable for the life of the build, and it counts the same lines the note's
 * `parked 3 of 8 open` does. The stop card prints the handle and the text
 * from here, and `plumbbob harvest` matches a proposal to its park by the
 * handle alone.
 */
export function parkList(buildLog: string): Park[] {
  const lines = buildLog.split('\n')
  const start = lines.findIndex((l) => l.trim() === '## Park list')
  if (start === -1) {
    return []
  }
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  return lines.slice(start + 1, end === -1 ? lines.length : end).flatMap((line) => {
    const m = /^-\s+\[([ xX])\]\s+(\S.*)$/.exec(line.trim())
    return m === null ? [] : [{ open: m[1] === ' ', text: (m[2] ?? '').trim() }]
  }).map((park, i) => ({ handle: i + 1, ...park }))
}

/**
 * One proposal from a detail file's `## Harvest` section: the park's handle,
 * the class proposed and its reason, and the short title and the why the lean
 * table shows beside the park's own text ('' where the model wrote none).
 */
export type Proposal = {
  readonly handle: number
  readonly kind: string
  readonly reason: string
  readonly title: string
  readonly why: string
}

// A proposal's first line: `- P6 → tangent: <the reason>`, or the `- park 6 →`
// form a detail written before D105 (park-handles) carried.
const PROPOSAL = /^-\s+(?:P|park\s+)(\d+)\s*(?:→|->)\s*([\w-]+)\s*(?::\s*(.*))?$/i

// A proposal's indented field line: `- title: <2 to 5 words>` or `- why: <one clause>`.
const PROPOSAL_FIELD = /^-\s+(title|why)\s*:\s*(.*)$/i

/**
 * The proposals under a detail file's `## Harvest` section, one per
 * `- P6 → tangent: <the reason>` line, in the order written, each with the
 * `- title:` and `- why:` lines indented beneath it. The handle is the one the
 * card prints (D105 (park-handles)); the `- park 6 →` form a detail written
 * before it carried is still read, and so is a proposal with no field lines,
 * the shape every detail had before the lean table (D112 (lean-table)).
 *
 * The class is read as written, whatever its word: the card shows the
 * proposal the model made, and `plumbbob harvest` is what refuses one outside
 * blocker, tangent, and pivot. A line in any other shape is not a proposal,
 * and a field line is read only indented beneath one.
 */
export function harvestProposals(detail: string): Proposal[] {
  const lines = detail.split('\n')
  const start = lines.findIndex((l) => /^##\s+Harvest\s*$/i.test(l.trim()))
  if (start === -1) {
    return []
  }
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  const proposals: Array<{ handle: number; kind: string; reason: string; title: string; why: string }> = []
  for (const line of lines.slice(start + 1, end === -1 ? lines.length : end)) {
    const m = PROPOSAL.exec(line.trim())
    if (m !== null) {
      proposals.push({ handle: Number(m[1]), kind: (m[2] ?? '').toLowerCase(), reason: (m[3] ?? '').trim(), title: '', why: '' })
      continue
    }
    const field = /^\s+/.test(line) ? PROPOSAL_FIELD.exec(line.trim()) : null
    const last = proposals.at(-1)
    if (field !== null && last !== undefined) {
      last[(field[1] ?? '').toLowerCase() === 'title' ? 'title' : 'why'] = (field[2] ?? '').trim()
    }
  }
  return proposals
}

/**
 * The range a detail file reviews, read off its `# Detail · Range <n> · <stop>`
 * header, or null when the first line is not a range's header (a step's
 * detail, a boundary harvest's, or a file written without one).
 */
export function parseDetailRange(detail: string): number | null {
  const first = detail.trimStart().split('\n', 1)[0] ?? ''
  const m = /^#\s+Detail\s*·\s*Range\s+(\d+)\b/.exec(first)
  return m === null ? null : Number(m[1])
}

/** A stop card waiting for its reply: the range it reviews, and the plan's count of ranges. */
export type WaitingCard = { readonly range: number; readonly count: number }

/**
 * The stop card still waiting for its reply, or null when none waits: a STOP
 * stamp, a detail file whose header names the stamp's range, and that range
 * still parsing and reading as landed. The record clears the stamp and the
 * detail file, so the wait ends with it.
 *
 * A detail file rewritten since the card showed (a lean the human changed)
 * still waits, since the stamp names the range and nothing it said. The
 * landed condition is what keeps a re-cut from wedging the build, since a
 * range re-cut to take a new step stops waiting.
 * The stamp is the build's own but the detail file is the session's, so in a
 * session of several builds, a stamp left in this build and another build's
 * card for the same range number read as this build's card waiting.
 */
export function waitingCard(root: string, slug: string | null, intent: string): WaitingCard | null {
  const stamp = readStop(root, slug)
  if (stamp === null || parseDetailRange(readOr(detailPath(root))) !== stamp.range) {
    return null
  }
  const plan = parseBuildRanges(intent)
  const range = plan.ranges.find((r) => r.item === stamp.range)
  if (range === undefined || !rangeLanded(range, parseOrderedSteps(intent))) {
    return null
  }
  return { range: range.item, count: plan.ranges.length + plan.malformed.length }
}

/**
 * The Harvested part: a lead that sizes the list, then the lean table, one row
 * per open park in list order (D112 (lean-table)). The first column is the
 * park's `P6` handle with the short title the detail file gives it, the second
 * the park's text exactly as the list holds it, so the card can never
 * misquote a park, the third why it matters, and the fourth the lean:
 * `tangent: <the reason>`. A park the detail left out reads
 * `no lean proposed`, and a missing why reads `not given`, so a silent
 * omission is one on the card. Null with no park open, which renders the card
 * without the part.
 *
 * The handle rides its own cell, never a list number, because the number the
 * human reads has to be the one the record matches (D105 (park-handles)).
 */
function harvestPart(parks: ReadonlyArray<Park>, proposals: ReadonlyArray<Proposal>): string | null {
  const open = parks.filter((p) => p.open)
  if (open.length === 0) {
    return null
  }
  const rows = open.map((park) => {
    const proposal = proposals.find((p) => p.handle === park.handle)
    const name = proposal === undefined || proposal.title.length === 0 ? `P${park.handle}` : `P${park.handle} · ${proposal.title}`
    const why = proposal === undefined || proposal.why.length === 0 ? 'not given' : proposal.why
    const lean = proposal === undefined ? 'no lean proposed' : proposal.reason.length === 0 ? proposal.kind : `${proposal.kind}: ${proposal.reason}`
    return `| ${cell(name)} | ${cell(park.text)} | ${cell(why)} | ${cell(lean)} |`
  })
  const lead = `**Harvested**: ${open.length} of ${parks.length} parked idea${parks.length === 1 ? '' : 's'} open`
  return [lead, '', LEAN_TABLE_HEAD, '| --- | --- | --- | --- |', ...rows].join('\n')
}

// The lean table's header row, the same on the stop card, a boundary
// harvest's render, and the stop's record.
const LEAN_TABLE_HEAD = '| Park | What it is | Why it matters | Lean |'

/**
 * A boundary harvest's leans (`plumbbob handoff --harvest`): the Harvested
 * part, the lean table the stop card carries, read from a `# Detail · Harvest`
 * file, then the moves that settle it in one reply. A driver-tier render with
 * no stamp: nothing is pending on the session, and the record waits for no
 * card. It refuses a detail file that is no harvest's, and a list with no park
 * open, since there is then nothing to propose.
 */
function harvestCard(root: string, slug: string | null): number {
  const detail = settleDetail(root, readOr(detailPath(root)))
  if (!isHarvestDetail(detail)) {
    process.stderr.write(
      notice({
        fact: 'no harvest to render',
        detail: ["the detail file is not a harvest's"],
        remedy: 'write the proposals in .plumbbob/detail.md under `# Detail · Harvest`, then plumbbob handoff --harvest',
      }),
    )
    return 1
  }
  const parks = parkList(readOr(buildLogPath(root, slug)))
  const proposals = harvestProposals(detail)
  const part = harvestPart(parks, proposals)
  if (part === null) {
    process.stderr.write(notice({ fact: 'no harvest to render', detail: ['no park is open'], remedy: 'plumbbob park "<one line>" captures one' }))
    return 1
  }
  return emit(root, { tier: 'driver', render: 'harvest-card' }, [part, harvestCallBlock(leanExample(parks, proposals))])
}

/**
 * A boundary harvest's Your Call block: the lock-in line, then the moves that
 * settle every lean in one reply, as at a stop with no run to name.
 */
function harvestCallBlock(example: string | null): string {
  return [
    '**Your Call**:',
    '',
    `Approving locks in each lean above; to change one, say so first (\`${example ?? 'make P1 a blocker'}\`).`,
    '',
    callLine('`looks good`', 'I record every lean as proposed, folding a blocker into the plan'),
    callLine('anything that reads as direction', 'I change the lean and say what moved; nothing is recorded until you approve'),
    callLine('`expand`, or any question', 'I show more of what is there; nothing changes'),
  ].join('\n')
}

/**
 * Whether a detail file is a boundary harvest's wire, read off its
 * `# Detail · Harvest` header.
 */
export function isHarvestDetail(detail: string): boolean {
  const first = detail.trimStart().split('\n', 1)[0] ?? ''
  return /^#\s+Detail\s*·\s*Harvest\s*$/.test(first)
}

/**
 * The stop card's Your Call block: the replies that settle the card in one
 * message, each recording the review and every lean before what it names.
 *
 * While a park is open (`example` set), one line beneath the label says that
 * approving locks in each lean and that changing one means saying so first,
 * with the example naming a handle on the card, since the reply is a decision
 * on every lean at once (D106 (leans-harvested)); the direction row then
 * carries no example of its own. The second row is the move after the stop,
 * read through `stopFollowUp` so the dashboard and `plumbbob build`'s refusal
 * name the same one: the next range's run, the finish on the plan's last
 * range, and nothing when the run would refuse (a flagged range, or a next
 * step no range names), where the note beneath Next Up carries the drift
 * words. With no park open, no line renders, the rows record the review alone,
 * and direction is a change to it.
 */
function stopCallBlock(example: string | null, intent: string): string {
  const parked = example !== null
  const what = parked ? 'them' : 'it'
  const moves = [
    callLine(
      '`looks good`',
      parked ? 'I record the review and every lean as proposed, folding a blocker into the plan; back to the boundary' : 'I record the review; back to the boundary',
    ),
  ]
  const follow = stopFollowUp(intent)
  if (follow === 'finish') {
    moves.push(callLine('`/plumbbob:finish`', `I record ${what} the same way, then write the report and close the build`))
  } else if (follow !== null) {
    moves.push(callLine('`/plumbbob:run`', `I record ${what} the same way, then run range ${follow.range.item} of ${follow.count} to its stop`))
  }
  moves.push(
    callLine('anything that reads as direction', `I change the ${parked ? 'lean' : 'review'} and say what moved; nothing is recorded until you approve`),
    callLine('`expand`, or any question', 'I show more of what is there; nothing changes, and `show the stop` brings all of this back'),
  )
  const lockIn = parked ? [`Approving locks in each lean above; to change one, say so first (\`${example}\`).`, ''] : []
  return ['**Your Call**:', '', ...lockIn, ...moves].join('\n')
}

/**
 * The lock-in line's example, a reply naming a park on this card by its
 * handle: the first open park recast as the class its lean is not, a blocker
 * for a tangent, a pivot, or no lean at all, and a tangent for a blocker, so
 * it always names a change the card could take. Null with no park open, where
 * there is no lean to change.
 */
function leanExample(parks: ReadonlyArray<Park>, proposals: ReadonlyArray<Proposal>): string | null {
  const first = parks.find((p) => p.open)
  if (first === undefined) {
    return null
  }
  const kind = proposals.find((p) => p.handle === first.handle)?.kind
  return `make P${first.handle} a ${kind === 'blocker' ? 'tangent' : 'blocker'}`
}

/**
 * A stop's record for the Log: the card as the human settled it, with the
 * full story behind each highlight beneath. The Summary and its highlights,
 * the Readout fence, the Verdict, the Harvested part, the recommendation, then
 * the numbered sections' bodies, blank-line separated and unindented; the
 * caller nests it under the range's dated Log line.
 *
 * Measured, not recalled, through the same review the card rendered. The
 * Harvested part reads the park list as `buildLog` holds it, so the caller
 * passes the list from before its record flips the settled parks, and the
 * part shows each class the human confirmed. Null when the detail file
 * reviews no range the plan declares.
 */
export function stopRecord(root: string, slug: string | null, detail: string, buildLog: string): string | null {
  const intent = readOr(intentPath(root, slug))
  const item = parseDetailRange(detail)
  const range = parseBuildRanges(intent).ranges.find((r) => r.item === item)
  if (range === undefined) {
    return null
  }
  const review = stopReview(root, slug, intent, range, detail)
  const summary = parseSummary(detail)
  const parts: string[] = []
  if (summary !== null) {
    parts.push(recordSummary(summary))
  }
  if (review.readout.length > 0) {
    parts.push([READOUT_LABEL, '', ...fence('text', review.readout)].join('\n'))
  }
  parts.push(verdictLine(review.verdict))
  const harvest = harvestPart(parkList(buildLog), harvestProposals(detail))
  if (harvest !== null) {
    parts.push(harvest)
  }
  return [...withRecommendation(parts, parseRecommendation(detail)), ...sectionBlocks(parseSections(detail))].join('\n\n')
}

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
    files: diffFileItems(work),
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
  parts.push(verdictLine(verdictValue(ladder, worst)))
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
 * with the step's accrued stats, as the state table's header states it.
 */
function landedVerdict(root: string, slug: string | null, intent: string, step: number): string {
  const { rows } = measured(root, slug, intent, readOr(detailPath(root)), step)
  const { ladder, worst } = foldVerdict(rows, accruedStats(root, slug, step))
  return verdictValue(ladder, worst)
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
function reprintCommand(
  form: '--full' | '--plan' | '--stop' | '--stop --full' | null,
  step: string | undefined,
  build: string | null,
): string {
  const parts = ['plumbbob handoff', form, step, build === null ? null : `--build ${build}`]
  return parts.filter((p) => p !== null && p !== undefined).join(' ')
}

/**
 * The Verdict's fact from an already-folded result: the ladder rung, and the
 * worst component in a trailing parenthetical when one exists. The state
 * table's header row carries it on a card; the record keeps it as a line.
 *
 * No step segment rides here. The identity renders once per turn: the Now row
 * names the step in flight with its count, Next Up names the step to come with
 * its own, and the Verdict is left saying the one thing only it says.
 */
function verdictValue(ladder: Ladder, worst: string | null): string {
  const state = `${ladder.glyph} ${ladder.state}`
  return worst === null ? state : `${state} (${worst})`
}

/**
 * The Verdict as the build-log record keeps it, a labeled line, since the
 * record is the archive and carries no state table.
 */
function verdictLine(value: string): string {
  return `**Verdict**: ${value}`
}

/**
 * The card's opening block: the model's lead behind the Summary label, and
 * nothing beneath it.
 *
 * The numbered highlights stay in the detail file, behind the `more details`
 * link the card closes on and the `expand` move, and the build-log record
 * still lists them: the card is read for the Verdict, the lead, and the call,
 * and a list read past is a list in the way (D113 (short-card)). Empty when
 * the detail file carries no lead: a Summary that says nothing vanishes rather
 * than labeling nothing.
 */
function summaryBlock(summary: Summary | null): string {
  return summary === null ? '' : `**Summary**: ${summary.lead}`
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
 * model wrote one. The label is the CLI's: it announces what the text is
 * before the eye reads it, and a label the model typed would be one more line
 * to drift.
 */
function withRecommendation(parts: ReadonlyArray<string>, recommendation: string | null): string[] {
  return recommendation === null ? [...parts] : [...parts, `${RECOMMENDATION_LABEL}${recommendation}`]
}

/**
 * A card's foot: the recommendation the detail file carries, then one
 * `more details` link to the file, the card's last line.
 *
 * The link is the one place the card points at the detail, out of the way of
 * the parts the human reads (D113 (short-card)). It renders only when the file
 * holds something, since a link to an empty file points at nothing.
 */
function cardFoot(parts: ReadonlyArray<string>, detail: string, where: string): string[] {
  const foot = withRecommendation(parts, parseRecommendation(detail))
  return detail.trim().length === 0 ? foot : [...foot, `[more details](${where})`]
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
 *
 * `run` is what `/plumbbob:run` typed at this pause names. Inside a range
 * that lands its steps, with steps still ahead of this one, the run rides
 * second as the other approval: it lands this step and the rest of the range.
 * At a bare range's pause, and at a range's last step, it does no more than
 * `looks good`, so the block keeps its four moves.
 */
function yourCallBlock(step: number, checkGreen: boolean, run: Run): string {
  const moves: string[] = []
  if (checkGreen) {
    moves.push(callLine('`looks good`', `I checkpoint Step ${step}; back to the boundary`))
    if (run.ok && !run.range.bare && run.left[0] === step && run.left.length > 1) {
      moves.push(callLine('`/plumbbob:run`', `I checkpoint Step ${step}, then run the rest of range ${run.range.item} to its stop`))
    }
  }
  moves.push(
    callLine('`expand`, or any question', 'I show more of what is there; nothing changes, and `show the pause` brings all of this back'),
  )
  moves.push(callLine('anything that reads as direction', 'I make the change and say what moved; nothing lands until you approve'))
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
 *
 * When that step sits in a range the run can walk, `looks good` names the run
 * instead, since the run is what the human types next; a step in no range, or
 * in a flagged one, keeps the build.
 */
function planCallBlock(first: Step | undefined, run: Run): string {
  const build = first === undefined ? '' : `; /plumbbob:build starts Step ${first.n}`
  const starts = run.ok ? `; /plumbbob:run runs range ${run.range.item} from Step ${run.left[0]}` : build
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

// The Order row's cap: the next five steps, the rest a count. The row is a
// reminder; the dashboard holds the whole sequence.
const ORDER_CAP = 5

/** What a state table is read from: the plan, the park list, and the facts the turn measured. */
type StateInput = {
  readonly intent: string
  readonly buildLog: string // '' where the Parked row would repeat the Harvested lead
  readonly verdict: string | null // the Verdict's fact where one was measured; it heads the table
  readonly now: string | null // the step in flight, on a pause card
  readonly stop: string | null // the Stop row's fact, where a range just landed or a stop card waits
  readonly nextUp: Step | undefined
  readonly exclude: number | null // the step the turn is about, so Next Up and the order skip it
  readonly where: string // the intent file, for Next Up's `details:` link
}

/**
 * The state table's rows, in their fixed order, each only when it says
 * something: the Verdict, the step in flight, the Stop, Next Up, the range the
 * next run walks, the build order where `## Build order` re-sequences the
 * plan, the parks once anything has been parked, and the open questions the
 * plan still carries. The first row present becomes the header, which is the
 * Verdict wherever one was measured (D111 (state-table)).
 *
 * The Range, Order, and Parked rows are the segments the note beneath Next Up
 * used to carry on one indented line; as rows each one has a label of its own,
 * the way the human scans for it.
 */
function stateRows(input: StateInput): StateRow[] {
  const steps = parseOrderedSteps(input.intent)
  const range = rangeSegment(input.intent, steps, input.nextUp, input.exclude)
  const order = buildOrderPhrase(remainingOrder(parseSteps(input.intent), parseBuildOrder(input.intent), input.exclude), ORDER_CAP)
  const parks = parseParkTotals(input.buildLog)
  const questions = parseOpenQuestions(input.intent)
  const rows: Array<StateRow | null> = [
    input.verdict === null ? null : { label: 'Verdict', value: input.verdict },
    input.now === null ? null : { label: 'Now', value: input.now },
    input.stop === null ? null : { label: 'Stop', value: input.stop },
    { label: 'Next Up', value: pointerText(input.nextUp, steps.length, input.where, range.model ?? input.nextUp?.model ?? null) },
    range.segment.length === 0 ? null : { label: 'Range', value: range.segment },
    order.length === 0 ? null : { label: 'Order', value: order },
    parks.total === 0 ? null : { label: 'Parked', value: `${parks.open} of ${parks.total} open` },
    questions === 0 ? null : { label: 'Questions', value: `${questions} open` },
  ]
  return rows.filter((r): r is StateRow => r !== null)
}

/**
 * The bare forward pointer, the one line a boundary already shown ends on:
 * the Next Up line the driver tier keeps, with the range's model in its
 * bracket while the next run is a range, as the table's Next Up row has it.
 */
function pointerLine(intent: string, nextUp: Step | undefined, exclude: number | null, where: string): string {
  const steps = parseOrderedSteps(intent)
  const range = rangeSegment(intent, steps, nextUp, exclude)
  return nextUpLine(nextUp, steps.length, where, range.model ?? nextUp?.model ?? null)
}

/**
 * The Range row's fact, and the model the pointer's bracket bolds while it
 * suggests a range: the run `/plumbbob:run` typed now would walk,
 * `3 of 5: /plumbbob:run (steps 6-9)`, with the model of the range holding
 * the step Next Up names; the re-cut words for a flagged range; the words for
 * a step no range names; or '' for a plan without ranges. The row's label
 * says `Range`, so the fact opens on the range's count.
 *
 * The bracket is the grant the hook would mint. At a step pause that is the
 * range holding the step in flight, its bracket opening on that step, since a
 * run typed there lands it first; at the pause on a range's last step, where
 * a run ends on that range's stop, the segment names no run
 * (`range 3 of 5 lands with step 9`). The model is read with the step the turn
 * is about landed, so at that last-step pause it is the next range's, the one
 * the human picks a model for. A flagged range, and a range with no
 * `- model:` line, leave the step's model in the bracket.
 */
function rangeSegment(
  intent: string,
  steps: ReadonlyArray<Step>,
  nextUp: Step | undefined,
  exclude: number | null,
): { readonly segment: string; readonly model: string | null } {
  const landed = steps.map((s) => (s.n === exclude ? { ...s, done: true } : s))
  const { holding, command } = rangeStanding(parseBuildRanges(intent), landed, nextUp?.n ?? null)
  const model = holding !== null && command !== null ? holding.model : null
  const paused = steps.some((s) => s.n === exclude && !s.done) ? exclude : null
  const run = cardRun(intent, paused)
  if (run.ok) {
    const name = `${run.range.item} of ${run.count}`
    const lands = paused !== null && run.left.length === 1
    return { segment: lands ? `${name} lands with step ${paused}` : `${name}: /plumbbob:run (${runBracket(run)})`, model }
  }
  if (run.kind === 'uncovered') {
    return { segment: run.words, model }
  }
  return { segment: run.kind === 'flagged' ? `${run.item} of ${run.count} needs a re-cut (${run.words})` : '', model }
}

/**
 * The run `/plumbbob:run` typed now would walk, as the card names it: the
 * range holding `paused`, the step waiting at its pause, or with none the
 * range holding the next undone step. A spike open is the run's refusal to
 * make, not the card's, so the card names the run that waits beyond it.
 */
function cardRun(intent: string, paused: number | null): Run {
  return resolveRun({ intent, inFlight: paused, spiking: false, item: null })
}

/**
 * The forward pointer's fact: the next undone step with the progress count,
 * its title, and a closing bracket carrying its advisory `- model:`
 * recommendation and where to read the step in full. No next step ⇒ the
 * finish/step nudge instead.
 *
 * The model is the second bold token the line spends, because it is the one
 * the human acts on (a `/model` call) before the next run; the path is the
 * short link every `details:` bracket carries (`detailsLink`). The state
 * table's Next Up row carries it; `nextUpLine` labels it for the one line a
 * driver turn ends on.
 */
function pointerText(nextUp: Step | undefined, total: number, where: string, model = nextUp?.model ?? null): string {
  if (nextUp === undefined) {
    return 'Nothing planned - /plumbbob:step or /plumbbob:finish'
  }
  const title = nextUp.title.length > 0 ? ` - ${nextUp.title}` : ''
  const token = modelToken(model)
  const bracket = token === null ? [] : [`model: **${capitalize(token)}**`]
  bracket.push(detailsLink(where, nextUp.line))
  return `Step ${nextUp.n} of ${total}${title} (${bracket.join(', ')})`
}

/**
 * The forward pointer as one labeled line: the driver tier's pointer, and the
 * line a boundary already shown ends on.
 */
function nextUpLine(nextUp: Step | undefined, total: number, where: string, model = nextUp?.model ?? null): string {
  return `**Next Up**: ${pointerText(nextUp, total, where, model)}`
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
