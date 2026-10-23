// `plumbbob order <n>…`: write the build order, the sequence to build the
// remaining steps in, as the one numeric line under `## Build order` in
// intent.md. A refined plan appends steps whose numbers say nothing about when
// they land (a step 7 that has to go before step 5), and until this verb the
// human carried that sequence in their head and typed it into every `build`.
// The line is what every next-step picker reads (`status`, `build`,
// `checkpoint`, `handoff`), so the dashboard's `← next`, a bare
// `plumbbob build`, and the card's Next Up agree. The verb validates what a
// hand edit cannot: every number names an undone step, none twice. `--reset`
// drops the line, and the plan reads in document order again. Either way the
// build ranges are re-cut to follow the order written, wherever the order
// settles which range a step is in, so a step placed next runs in the range
// it now builds with. It runs in any state, since re-sequencing what comes
// after the step in flight is the mid-step use, and the sidecar sits outside
// every seam.

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { activeBuild, hasSession, intentPath } from '../lib/sidecar.ts'
import {
  clearBuildOrder,
  orderSteps,
  parseBuildRanges,
  parseOrderedSteps,
  parseSteps,
  rangeStanding,
  recutPlan,
  setBuildOrder,
  type RangeStanding,
  type Recut,
} from '../lib/orient.ts'
import { expandStepList, formatStepList, parseStepList } from '../lib/steplist.ts'
import { advisory, blocks, ending, notice, printEnding, transition } from '../lib/notice.ts'
import { driverPointer } from './handoff.ts'

/**
 * Set the build order to the given step numbers and spans, the rest of the
 * undone steps following in document order, or clear it with `--reset`.
 *
 * The line written is the whole remaining sequence, each span spelled out, so a
 * cold reader of intent.md sees every undone step and not only the ones
 * re-sequenced. Refuses (exit 1) with no session, no numbers, a token that is
 * neither a number nor a span, a number the plan lacks, a repeated number, or a
 * step already checkpointed.
 */
export function order(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(
      notice({ fact: 'no active session', detail: ['no plan to order'], remedy: 'plumbbob start "<title>"' }),
    )
    return 1
  }
  const path = intentPath(root)
  const intent = readFileSync(path, 'utf8')

  if (args.includes('--reset')) {
    writeOrder(root, path, clearBuildOrder(intent), 'document order')
    return 0
  }

  // Numbers and spans arrive space- or comma-separated, with or without a space
  // after a comma: `order 7 8 5`, `order 7,8,5`, and `order 1, 6, 2-4, 7, 5`
  // all read, and a span names its steps in place, since the line is a sequence.
  const tokens = args
    .filter((a) => !a.startsWith('--'))
    .flatMap((a) => a.split(','))
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
  if (tokens.length === 0) {
    process.stderr.write(
      notice({
        fact: 'order needs step numbers',
        detail: ['the undone steps, in the sequence to build them'],
        remedy: 'plumbbob order 7 8 5, or plumbbob order --reset for document order',
      }),
    )
    return 1
  }
  const lists = tokens.map(parseStepList)
  const stray = tokens.find((_, i) => lists[i] === null)
  if (stray !== undefined) {
    process.stderr.write(
      notice({ fact: `\`${stray}\` is not a step number or span`, remedy: 'plumbbob order 1, 6, 2-4, 7, 5' }),
    )
    return 1
  }
  const steps = parseSteps(intent)
  const planned = steps.map((s) => s.n)
  const given = expandStepList(
    lists.flatMap((list) => list ?? []),
    (n) => planned.includes(n),
  )
  const unknown = given.find((n) => !planned.includes(n))
  if (unknown !== undefined) {
    process.stderr.write(
      notice({
        fact: `no step ${unknown} in the plan`,
        detail: [planned.length === 0 ? 'no steps planned yet' : `planned: ${planned.join(', ')}`],
        remedy: 'fix the number, or /plumbbob:step to add the step first',
      }),
    )
    return 1
  }
  const repeat = given.find((n, i) => given.indexOf(n) !== i)
  if (repeat !== undefined) {
    process.stderr.write(notice({ fact: `step ${repeat} is listed twice`, remedy: 'list each step once' }))
    return 1
  }
  const landed = given.find((n) => steps.find((s) => s.n === n)?.done === true)
  if (landed !== undefined) {
    process.stderr.write(
      notice({
        fact: `step ${landed} is already checkpointed`,
        detail: ['the order sequences what is left'],
        remedy: 'list the undone steps only',
      }),
    )
    return 1
  }

  const full = orderSteps(steps, given)
    .filter((s) => !s.done)
    .map((s) => s.n)
  writeOrder(root, path, setBuildOrder(intent, full), full.join(', '))
  return 0
}

/**
 * Write the plan under its new build order, its ranges re-cut to follow it,
 * and print the ending: the order, the ranges the re-cut changed, any range it
 * left for the human to re-cut, and the pointer.
 *
 * The pointer reads the plan back from disk, so it already follows the order
 * just written: back at the step in flight, or forward from the boundary to
 * the first step in the new sequence.
 */
function writeOrder(root: string, path: string, ordered: string, sequence: string): void {
  const { intent, recut } = recutPlan(ordered)
  writeFileSync(path, intent)
  const standing = rangeStanding(parseBuildRanges(intent), parseOrderedSteps(intent), null)
  printEnding(root, {
    tier: 'driver',
    render: 'order',
    text: ending({
      lead: blocks([transition({ label: 'Build order', fact: sequence }), recutLead(recut, standing.count)]),
      advisories: rangeAdvisories(standing),
      pointer: driverPointer(root, activeBuild(root)),
    }),
  })
}

/**
 * The lead naming each range the re-cut changed and the steps it names now,
 * `range 2 of 3 re-cut (steps 10,4-6)`; null when it changed none.
 */
function recutLead(recut: ReadonlyArray<Recut>, count: number): string | null {
  const [only] = recut
  if (only === undefined) {
    return null
  }
  const steps = (cut: Recut): string => `${cut.steps.length === 1 ? 'step' : 'steps'} ${formatStepList(cut.steps)}`
  const items = recut.map((cut) => cut.item).join(', ')
  return transition({
    label: 'Build ranges',
    fact: `${recut.length === 1 ? 'range' : 'ranges'} ${items} of ${count} re-cut`,
    detail: recut.length === 1 ? [steps(only)] : recut.map((cut) => `range ${cut.item}: ${steps(cut)}`),
  })
}

/**
 * Every range still flagged once the re-cut is written, in the words the
 * dashboard flags it with, and beneath the last the move that re-cuts it by
 * hand: the ties the order did not settle, a step no range can take, and the
 * plan's other drift. Empty when every undone step sits in one stretch of one
 * range.
 */
function rangeAdvisories(standing: RangeStanding): string[] {
  const { count, drift } = standing
  const own = drift.filter((d) => d.item !== null && d.kind !== 'malformed')
  const flagged = [...new Set(own.map((d) => d.item))].map((item) => ({
    fact: `range ${item} of ${count} needs a re-cut`,
    detail: own.filter((d) => d.item === item).map((d) => d.words),
  }))
  const lines = [...flagged, ...drift.filter((d) => d.item === null || d.kind === 'malformed').map((d) => ({ fact: d.words }))]
  if (lines.length === 0) {
    return []
  }
  return [lines.map((l, i) => advisory(i === lines.length - 1 ? { ...l, remedy: '/plumbbob:refine ranges' } : l)).join('')]
}
