// `plumbbob harvest`: record a harvest from the detail file. The skill decides
// and the CLI records (D104 (harvest-records)): the model writes one proposal
// per open park under the detail file's `## Harvest` section, the human
// settles them in one reply, and this verb flips each settled park in
// `build-log.md`, appends the dated Harvest lines, and, when the detail is a
// range's, writes the range's review beneath a dated Log line, the way
// `checkpoint` keeps a step's pause beneath its own. It commits nothing: the
// record rides the next step's checkpoint, or the finish.
//
// A stop's record is latched (D103 (stop-latched)). It refuses in the turn
// the stop card printed, since a run's long turn ends on proposals and that is
// where a model would carry straight on into recording its own; it refuses a
// range no stop card showed, read off the range the card's STOP stamp names,
// though not a detail file rewritten since, which is a lean the human changed
// in a reply (D110 (reply-after-the-card)); and it refuses a range that no
// longer reads as landed, telling
// a step landed and reopened from one that joined the range after it landed,
// which moves to a range still to come. A harvest outside a stop (`# Detail · Harvest`) needs no stamp. A proposal
// naming a handle the list lacks (`P9` with eight parked), or a class outside
// the three, refuses the whole record, so the card and the ledger never
// disagree about which parks are open; a park no proposal names stays open,
// and the record says nothing about it.

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { ending, notice, printEnding, transition } from '../lib/notice.ts'
import { appendHarvest, appendToSection, flipParks, harvestLines, logEntry, type SettledPark, stopLogLine } from '../lib/buildlog.ts'
import { checkStopLatch } from '../lib/latch.ts'
import { parseBuildRanges, parseDetailStep, parseLastCheckpoint, parseOrderedSteps, stepShas } from '../lib/orient.ts'
import {
  activeBuild,
  buildLogPath,
  checkpointsPath,
  clearDetail,
  clearStop,
  detailPath,
  hasSession,
  intentPath,
  readStop,
} from '../lib/sidecar.ts'
import { hasStep } from '../lib/steplist.ts'
import {
  boundaryEnding,
  harvestProposals,
  isHarvestDetail,
  type Park,
  parkList,
  parseDetailRange,
  type Proposal,
  stopRecord,
} from './handoff.ts'

// The three classes a park settles as, in the order the ending counts them.
const CLASSES = ['blocker', 'tangent', 'pivot'] as const

// Where a refusal about the proposals sends the model: the file it wrote them in.
const FIX_PROPOSALS = 'fix the Harvest proposals in .plumbbob/detail.md'

/**
 * Record the harvest the detail file proposes, and the range's review when the
 * detail is a range's.
 *
 * Exit 1 on any refusal: no session, a detail file that is no range's or
 * harvest's, the latch, a range no stop card showed or no longer landed, and a
 * proposal it cannot settle. Each refusal names the move that unblocks it.
 */
export function harvest(cwd: string, _args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' }))
    return 1
  }
  const slug = activeBuild(root)
  const detail = readOr(detailPath(root))
  const item = parseDetailRange(detail)
  if (item === null && !isHarvestDetail(detail)) {
    process.stderr.write(nothingToRecord(detail))
    return 1
  }
  const intent = readOr(intentPath(root, slug))
  const buildLog = readOr(buildLogPath(root, slug))
  const parks = parkList(buildLog)

  let stop: StopRange | null = null
  if (item !== null) {
    const found = stopRange(root, slug, intent, item)
    if (typeof found === 'string') {
      process.stderr.write(found)
      return 1
    }
    stop = found
  }
  const subject = stop === null ? 'harvest not recorded' : `range ${stop.item} of ${stop.count}'s stop not recorded`
  const settled = settle(parks, harvestProposals(detail))
  if (typeof settled === 'string') {
    process.stderr.write(notice({ fact: subject, detail: [settled], remedy: FIX_PROPOSALS }))
    return 1
  }
  if (stop === null && settled.length === 0) {
    process.stderr.write(
      notice({ fact: 'harvest not recorded', detail: ['the detail file settles no open park'], remedy: FIX_PROPOSALS }),
    )
    return 1
  }

  // The review is read before the flip, so its Harvested part shows each lean
  // the human confirmed beside the park it settled.
  const record = stop === null ? null : stopRecord(root, slug, detail, buildLog)
  const date = new Date().toISOString().slice(0, 10)
  const where = stop === null ? boundaryWords(root, slug) : `at range ${stop.item} of ${stop.count}'s stop`
  let updated: string | null = flipParks(buildLog, settled.map((p) => p.handle))
  updated = updated === null ? null : appendHarvest(updated, harvestLines(date, where, settled))
  if (stop !== null) {
    updated = updated === null ? null : appendToSection(updated, 'Log', logEntry(stopLogLine(date, stop.item, stop.count, stop.stop), record))
  }
  if (updated === null) {
    process.stderr.write(
      notice({ fact: `${subject}`, detail: ['build-log.md is missing a section it writes to'], remedy: 'restore its Park list, Harvest, and Log sections' }),
    )
    return 1
  }
  writeFileSync(buildLogPath(root, slug), updated)
  clearDetail(root)
  clearStop(root, slug)

  // Outside a stop the label names the act, `Recorded`, since `Harvested` is
  // the stop card's part and one label over a part that proposes and an ending
  // that records would mean two things (D106 (leans-harvested)).
  const counted = classWords(settled)
  const lead =
    stop === null
      ? transition({ label: 'Recorded', fact: `${settled.length} parked idea${settled.length === 1 ? '' : 's'}`, detail: [counted] })
      : transition({ label: 'Stop', fact: `Range ${stop.item} of ${stop.count} recorded`, detail: [counted] })
  printEnding(root, {
    tier: 'orientation',
    render: 'harvest',
    text: ending({ lead, state: boundaryEnding(root, slug, null).state }),
  })
  return 0
}

/** The range a stop's record is for: its item, the plan's count of ranges, and its stop. */
type StopRange = { readonly item: number; readonly count: number; readonly stop: string }

/**
 * The range a range's detail reviews, once the record may land: the plan
 * holds the range, a stop card for it has shown, a human turn has read it,
 * and every step of the range has landed. Otherwise the refusal, with the move
 * that unblocks it.
 *
 * The card need not have shown this detail file byte for byte: a reply that
 * changed a lean rewrote the file without printing the card again, and the
 * change is the human's own (D110 (reply-after-the-card)).
 *
 * An undone step in the range reads two ways, told apart by the ledger. One
 * with a `step N <sha>` line landed and was reopened, so it lands again and
 * the card prints again on `--stop --full`, since the range it reviews has
 * changed under it. One with none joined the range after the card, a
 * blocker folded into the range that just landed, and `handoff --stop` would
 * refuse too, since the last landing no longer completes the range; so the
 * remedy moves the step to a range still to come and runs the record again,
 * which holds in the same reply while the detail file stays as the card
 * showed it.
 */
function stopRange(root: string, slug: string | null, intent: string, item: number): StopRange | string {
  const plan = parseBuildRanges(intent)
  const count = plan.ranges.length + plan.malformed.length
  const range = plan.ranges.find((r) => r.item === item)
  const refuse = (why: string, remedy: string): string =>
    notice({ fact: `range ${item} of ${count}'s stop not recorded`, detail: [why], remedy })
  if (range === undefined) {
    return refuse(`the plan has no range ${item}`, `write the range's number in the header of .plumbbob/detail.md`)
  }
  const stamp = readStop(root, slug)
  if (stamp === null || stamp.range !== item) {
    return refuse('no stop card showed it', 'plumbbob handoff --stop, then end the turn on the card')
  }
  if (!checkStopLatch(root, stamp.turn)) {
    return refuse("its card printed this turn, and no human turn has read it", "end the turn on the card; the human's reply is what records it")
  }
  const held = parseOrderedSteps(intent).filter((s) => hasStep(range.steps, s.n))
  if (held.length === 0) {
    return refuse('the plan holds none of its steps', 'land it, then plumbbob handoff --stop --full')
  }
  const open = held.find((s) => !s.done)
  if (open !== undefined) {
    // A step the ledger landed was reopened since, and lands again; one it never
    // landed was folded into the range after the card, and moves out instead.
    return stepShas(readOr(checkpointsPath(root, slug))).has(open.n)
      ? refuse(`step ${open.n} is open again`, 'land it, then plumbbob handoff --stop --full')
      : refuse(`step ${open.n} joined it after it landed`, `move step ${open.n} to a range still to come, then plumbbob harvest`)
  }
  return { item, count, stop: range.stop }
}

/**
 * The open parks the proposals settle, in list order, or the words for the
 * first proposal that cannot be recorded: one naming a handle the list lacks,
 * or a class outside the three, each named by the handle the card prints. A park no proposal names stays open; a proposal
 * for a park already harvested settles nothing; and the first proposal for a
 * park is the one the card showed.
 */
function settle(parks: ReadonlyArray<Park>, proposals: ReadonlyArray<Proposal>): SettledPark[] | string {
  for (const proposal of proposals) {
    if (proposal.handle < 1 || proposal.handle > parks.length) {
      return `P${proposal.handle} is not in the list; ${parks.length} parked`
    }
    if (!(CLASSES as readonly string[]).includes(proposal.kind)) {
      return `P${proposal.handle}'s class "${proposal.kind}" is not blocker, tangent, or pivot`
    }
  }
  return parks.flatMap((park) => {
    const proposal = proposals.find((p) => p.handle === park.handle)
    return park.open && proposal !== undefined ? [{ handle: park.handle, kind: proposal.kind, text: park.text, reason: proposal.reason }] : []
  })
}

/** The classes settled, counted in the ending's order: `1 blocker, 2 tangents`, or `nothing parked`. */
function classWords(settled: ReadonlyArray<SettledPark>): string {
  const words = CLASSES.flatMap((kind) => {
    const n = settled.filter((p) => p.kind === kind).length
    return n === 0 ? [] : [`${n} ${kind}${n === 1 ? '' : 's'}`]
  })
  return words.length === 0 ? 'nothing parked' : words.join(', ')
}

/** Where a harvest outside a stop ran, for its dated line: the boundary of the step that landed last. */
function boundaryWords(root: string, slug: string | null): string {
  const last = parseLastCheckpoint(readOr(checkpointsPath(root, slug)))
  return last === null ? 'before the first step landed' : `at the step ${last.n} boundary`
}

/**
 * The refusal for a detail file that is no range's and no harvest's: a step's
 * is checkpoint's to record, and an empty one, or one with no header, records nothing.
 */
function nothingToRecord(detail: string): string {
  const step = parseDetailStep(detail)
  if (step !== null) {
    return notice({
      fact: 'nothing to record',
      detail: [`the detail file is Step ${step}'s, not a range's or a harvest's`],
      remedy: `plumbbob checkpoint ${step} records a step's detail`,
    })
  }
  const why = detail.trim().length === 0 ? 'the detail file is empty' : 'the detail file names no range or harvest'
  return notice({
    fact: 'nothing to record',
    detail: [why],
    remedy: 'write the proposals in .plumbbob/detail.md under `# Detail · Harvest`',
  })
}

/**
 * Read a file as UTF-8, or '' when it is missing or unreadable.
 */
function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}
