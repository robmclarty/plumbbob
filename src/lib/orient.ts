// The orientation model behind `status`: parse a live build session into the
// where-am-I dashboard: title, phase, step list, last checkpoint, counts, and
// one suggested next move. Pure and best-effort by design: it takes raw file
// contents (no fs), and a malformed document degrades to fewer fields rather
// than throwing.

import { isArtifactPath, parseStepSeam, scopeDrift } from './intent.ts'
import {
  expandStepList,
  formatStepList,
  hasStep,
  normalizeStepList,
  parseStepList,
  readBuildArgs,
  type Span,
  type StepList,
} from './steplist.ts'

/** One numbered step under intent.md's `## Steps`. */
export type Step = {
  readonly n: number
  readonly done: boolean
  readonly title: string
  readonly planned: boolean // carries a `done when:` criterion
  readonly doneWhen: string | null // the criterion text, for the dashboard
  readonly model: string | null // the optional `- model:` recommendation, verbatim: advisory, never a gate
  readonly line: number // the 1-based line of the step's opener in intent.md, so a pointer can name where to read it
}

/** One landed step from the checkpoints ledger: its number and commit SHA. */
export type Checkpoint = { readonly n: number; readonly sha: string }

/** The parsed where-am-I view that `status` renders. */
export type Orientation = {
  readonly title: string | null
  // The phase word shown in the dashboard (derived, not stored): SPIKE when a
  // spike is open, BUILD when a step is in flight, else DESIGN.
  readonly phase: string
  readonly steps: ReadonlyArray<Step>
  readonly lastCheckpoint: Checkpoint | null
  readonly parked: number
  // Every item ever parked, harvested ones included: the denominator behind
  // `parked 2 of 7 open`, so a harvest shows as the gap between the two.
  readonly parkedTotal: number
  readonly openQuestions: number
  readonly next: string
  // The first undone step in build order (null with none left): the step the
  // `← next` marker and the detail rows follow when nothing is requested.
  readonly nextUndone: number | null
  // The undone steps in build order, when `## Build order` re-sequences them
  // away from their numbering; empty otherwise, and the dashboard's row vanishes.
  readonly buildOrder: ReadonlyArray<number>
  // The plan's build ranges as the dashboard lists them; null for a plan
  // without the section, or with only the template's placeholder under it, and
  // the block vanishes.
  readonly ranges: RangesView | null
  // The explicitly requested step (from `status --invoked`), but only when that
  // step exists in the plan; null otherwise. When set, the dashboard's marker,
  // detail rows, and next move all point here instead of at the next undone
  // step, so an invocation like `/plumbbob:build 22` never shares the context
  // with a rival `next → build step 15` suggestion.
  readonly requested: number | null
  // The target step's detail (the requested step when one is set, else the next
  // undone), so `status` shows what's about to be built and the human can
  // review (and `/plumbbob:step`-revise) before `/plumbbob:build`.
  readonly nextDoneWhen: string | null
  readonly nextSeam: ReadonlyArray<string>
  // The target step's advisory model recommendation: the smallest model the
  // plan says can carry the step. Orientation for the human choosing where to
  // spend attention and tokens, never a gate.
  readonly nextModel: string | null
  // Commits on HEAD since the last checkpoint that landed outside plumbbob's
  // checkpoints ledger (the per-build file recording baseline, plan, and step
  // SHAs): surfaced as one neutral reconciliation line, never blocked; the
  // human commits freely. Two mechanisms keep plumbbob's own commits out: a
  // commit any plumbbob verb makes is recorded in the ledger and starts the
  // range, and a plan commit made by hand carries the `plumbbob plan` body
  // marker, which drops it from the count. 0 renders nothing.
  readonly outOfBand: number
}

/** The raw material `orient` parses: file contents and marker state, no fs. */
export type OrientInput = {
  readonly intent: string
  readonly buildLog: string
  readonly checkpoints: string
  // The in-flight step number from the STEP marker (an untracked control file
  // naming the step being built; null when none): this is what makes the phase
  // "BUILD". `spiking` is the SPIKE marker's presence.
  readonly inFlight: number | null
  readonly spiking: boolean
  // The steps an explicit invocation asked for (`status --invoked`): one step,
  // or a range, which starts at its first undone step in build order. Null when
  // the run carried no explicit ask. The dashboard repoints at the step so the
  // injected state and the human's typed step never disagree.
  readonly requested: StepList | null
  // The out-of-band commit count: commits since the last ledger SHA that no
  // plumbbob verb recorded, less the hand-made plan commits that carry the
  // `plumbbob plan` body marker. Only a caller with git can measure it
  // (`status` and `handoff` both do, from one marker); orient stays
  // pure/fs-free, so the caller computes it and passes it in. 0 when there is
  // no checkpoint to reconcile against, or the tree is clean at the last
  // checkpoint.
  readonly outOfBand: number
}

/** A named `## Section`'s body: its lines, and the 0-based offset of the first. */
type Section = { readonly offset: number; readonly lines: ReadonlyArray<string> }

/**
 * The lines of a named `## Section`, from its heading to the next `## ` (or
 * EOF), with the offset of the first line so a caller can name an absolute
 * line number in the document rather than one relative to the section.
 */
function sectionLines(content: string, heading: string): Section {
  const lines = content.split('\n')
  const start = lines.findIndex((l) => l.trim() === heading)
  if (start === -1) {
    return { offset: 0, lines: [] }
  }
  return { offset: start + 1, lines: lines.slice(start + 1, sectionEnd(lines, start)) }
}

/**
 * The index of the line that ends the section opened at `heading`: the next
 * `## ` heading, or one past the last line when none follows.
 */
function sectionEnd(lines: ReadonlyArray<string>, heading: number): number {
  const end = lines.findIndex((l, i) => i > heading && l.startsWith('## '))
  return end === -1 ? lines.length : end
}

/**
 * The build title: the first `# ` heading in intent.md, or null when absent.
 */
export function parseTitle(intent: string): string | null {
  for (const line of intent.split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line)
    if (m) {
      return m[1] ?? null
    }
  }
  return null
}

/**
 * Parse the steps under `## Steps`: `N. [ |x] Title, **done when:** ...`
 * (the legacy em-dash separator before the marker parses the same).
 *
 * The title is the text before the `**done when:**` marker on the opener line,
 * trailing separator stripped; an opener without the marker falls back to the
 * text up to the first em dash. `planned` is true when the step's block carries
 * a `done when` criterion. Only `## Steps` is machine-read as the build plan;
 * narrative roadmap prose lives in its own section and never lands here.
 */
export function parseSteps(intent: string): Step[] {
  const { offset, lines } = sectionLines(intent, '## Steps')
  const starts: Array<{ readonly n: number; readonly done: boolean; readonly title: string; readonly idx: number }> = []
  lines.forEach((line, idx) => {
    const m = /^(\d+)\.\s+\[([ xX])\]\s+(.*)$/.exec(line)
    if (m) {
      const rest = m[3] ?? ''
      const marker = /\*\*done when:\*\*/i.exec(rest)
      const head = marker ? rest.slice(0, marker.index) : (rest.split('—')[0] ?? rest)
      starts.push({
        n: Number(m[1]),
        done: (m[2] ?? ' ').toLowerCase() === 'x',
        title: head.replace(/\s*[—,-]+\s*$/, '').trim(),
        idx,
      })
    }
  })
  return starts.map((s, i) => {
    const blockEnd = starts[i + 1]?.idx ?? lines.length
    const block = lines.slice(s.idx, blockEnd).join('\n')
    const dw = /\*\*done when:\*\*\s*(.+)/i.exec(block)
    const doneWhen = dw ? (dw[1] ?? '').trim() : null
    const md = /^\s*-\s*model:\s*(.+)$/im.exec(block)
    const model = md ? (md[1] ?? '').trim() : null
    return { n: s.n, done: s.done, title: s.title, planned: /done when/i.test(block), doneWhen, model, line: offset + s.idx + 1 }
  })
}

// A build-order line: step numbers and spans (`2-4`) joined by commas, with or
// without a space after each, and nothing else. A trailing comma is tolerated,
// since a hand edit leaves one behind.
const BUILD_ORDER_LINE = /^\d+(?:-\d+)?(?:\s*,\s*\d+(?:-\d+)?)*\s*,?$/

/**
 * The build order declared under `## Build order`: the step numbers on the
 * first line that is nothing but numbers, spans, and commas, in the sequence
 * written, each span spelled out in place (`1, 6, 2-4` reads 1, 6, 2, 3, 4).
 *
 * The line is the plan's own statement of what to build next once the
 * numbering stops carrying it (a refined plan appends a step 7 that has to
 * land before step 5), and `plumbbob order` is the verb that writes it. The
 * template's guidance, a comment, and an absent section all read as `[]`,
 * which every picker takes to mean document order, and so does a line holding
 * a span that runs backward. Numbers come back verbatim, repeats and unknowns
 * included: `orderSteps` does the cleaning, and `recover` wants the raw read to
 * say which number the plan lacks. A span stops at the first number past the
 * plan, which it keeps for `recover` to name.
 */
export function parseBuildOrder(intent: string): number[] {
  const line = sectionLines(intent, '## Build order')
    .lines.map((l) => l.trim())
    .find((l) => BUILD_ORDER_LINE.test(l))
  const list = line === undefined ? null : parseStepList(line.replace(/\s+/g, '').replace(/,$/, ''))
  if (list === null) {
    return []
  }
  const planned = new Set(parseSteps(intent).map((s) => s.n))
  return expandStepList(list, (n) => planned.has(n))
}

/**
 * The steps in build order: the landed steps `order` leaves out, then the
 * numbers it lists, in that sequence, then the undone steps it leaves out,
 * each left-out group in document order.
 *
 * `plumbbob order` lists undone steps only, so a landed step the line leaves
 * out landed before the line was written, and it reads as built ahead of the
 * line rather than after it; the undone sequence is the same either way. A
 * listed number takes the first step in document order that carries it, and a
 * repeat of the number is ignored, so a doubled entry cannot double a step; a
 * number no step carries is dropped. An order that names no step, an empty one
 * included, is the identity, which is what a plan with no `## Build order`
 * section reads as. The steps themselves never change, only the sequence, so
 * `n`, `line`, and `done` stay what `parseSteps` read.
 */
export function orderSteps(steps: ReadonlyArray<Step>, order: ReadonlyArray<number>): Step[] {
  const taken = new Set<Step>()
  const ordered: Step[] = []
  for (const n of order) {
    const step = steps.find((s) => s.n === n)
    if (step !== undefined && !taken.has(step)) {
      taken.add(step)
      ordered.push(step)
    }
  }
  const rest = steps.filter((s) => !taken.has(s))
  if (ordered.length === 0) {
    return rest
  }
  return [...rest.filter((s) => s.done), ...ordered, ...rest.filter((s) => !s.done)]
}

/**
 * The plan's steps in build order: `parseSteps` merged with `parseBuildOrder`.
 *
 * The one call every next-step picker makes, so the dashboard's `← next`, a
 * bare `plumbbob build`, `checkpoint`'s fallback, and the card's Next Up
 * cannot disagree about which step comes next.
 */
export function parseOrderedSteps(intent: string): Step[] {
  return orderSteps(parseSteps(intent), parseBuildOrder(intent))
}

/**
 * The undone steps that come before step `n` in `ordered`: what an explicit
 * `build n` skips. Empty when `n` is not in the list.
 */
export function skippedBefore(ordered: ReadonlyArray<Step>, n: number): Step[] {
  const at = ordered.findIndex((s) => s.n === n)
  return at === -1 ? [] : ordered.slice(0, at).filter((s) => !s.done)
}

/**
 * The reminder the card and the dashboard render: the undone step numbers
 * (minus `exclude`, the step a pause is about) in build order, when that
 * sequence departs from document order; `[]` when the numbering already
 * carries it, so a plan nobody re-sequenced renders nothing new.
 */
export function remainingOrder(
  steps: ReadonlyArray<Step>,
  order: ReadonlyArray<number>,
  exclude: number | null,
): number[] {
  const left = (list: ReadonlyArray<Step>): number[] => list.filter((s) => !s.done && s.n !== exclude).map((s) => s.n)
  const byOrder = left(orderSteps(steps, order))
  const byDocument = left(steps)
  return byOrder.some((n, i) => n !== byDocument[i]) ? byOrder : []
}

/**
 * The build order as the note's labeled field: `order:`, then the next `cap`
 * step numbers in sequence, the rest folded to a count (`and 2 more`), the way
 * a long detail degrades on every one-liner; '' for an empty order. With no
 * cap, the whole sequence.
 *
 * A label, where the phrase once read `build order 7, 8, 5`, because the
 * note's other segments read as labeled fields and a label is how the eye
 * finds one in a line of three (D108 (order-label)).
 */
export function buildOrderPhrase(order: ReadonlyArray<number>, cap?: number): string {
  if (order.length === 0) {
    return ''
  }
  const shown = cap === undefined ? order : order.slice(0, cap)
  const rest = order.length - shown.length
  return `order: ${shown.join(', ')}${rest > 0 ? ` (and ${rest} more)` : ''}`
}

/**
 * Write `order` as the one numeric line under `## Build order`: in place of
 * the line already there, else last in the section, else in a new section
 * opened right after `## Steps`, so the sequence sits beside the steps it
 * sequences. Mechanical bookkeeping for `plumbbob order`, the way
 * `markStepDone` is for `checkpoint`.
 */
export function setBuildOrder(intent: string, order: ReadonlyArray<number>): string {
  const lines = intent.split('\n')
  const text = order.join(', ')
  const heading = lines.findIndex((l) => l.trim() === '## Build order')
  if (heading !== -1) {
    const end = sectionEnd(lines, heading)
    const at = lines.findIndex((l, i) => i > heading && i < end && BUILD_ORDER_LINE.test(l.trim()))
    if (at !== -1) {
      lines[at] = text
      return lines.join('\n')
    }
    insertAfterContent(lines, heading, end, [text])
    return lines.join('\n')
  }
  const steps = lines.findIndex((l) => l.trim() === '## Steps')
  const end = steps === -1 ? lines.length : sectionEnd(lines, steps)
  insertAfterContent(lines, steps, end, ['## Build order', '', text])
  return lines.join('\n')
}

/**
 * Splice `block` in after the last non-blank line before `end` (and after
 * `from`), one blank line on each side, without doubling a blank that is
 * already there.
 */
function insertAfterContent(lines: string[], from: number, end: number, block: ReadonlyArray<string>): void {
  let last = end - 1
  while (last > from && (lines[last] ?? '').trim() === '') {
    last -= 1
  }
  const at = last + 1
  const followed = at < lines.length && (lines[at] ?? '').trim() === ''
  lines.splice(at, 0, '', ...block, ...(followed ? [] : ['']))
}

/**
 * Drop the numeric line under `## Build order`, and the section itself when
 * nothing but blank lines is left in it, so the plan reads in document order
 * again. A plan with no line is returned unchanged.
 */
export function clearBuildOrder(intent: string): string {
  const lines = intent.split('\n')
  const heading = lines.findIndex((l) => l.trim() === '## Build order')
  if (heading === -1) {
    return intent
  }
  const at = lines.findIndex((l, i) => i > heading && i < sectionEnd(lines, heading) && BUILD_ORDER_LINE.test(l.trim()))
  if (at === -1) {
    return intent
  }
  lines.splice(at, 1)
  if ((lines[at - 1] ?? '').trim() === '' && (at >= lines.length || (lines[at] ?? '').trim() === '')) {
    lines.splice(at - 1, 1)
  }
  const body = lines.slice(heading + 1, sectionEnd(lines, heading))
  if (body.every((l) => l.trim() === '')) {
    lines.splice(heading, body.length + 1)
  }
  return lines.join('\n')
}

/** One range under `## Build ranges`: a command the human types, and the stop that ends it. */
export type BuildRange = {
  readonly item: number // the item's number as the plan wrote it: the handle the card counts by
  readonly command: string // the command as the plan wrote it, for the dashboard's row
  readonly steps: StepList // the command's steps, read the way the turn hook reads a typed range
  readonly bare: boolean // a lone `N`, which builds the step to its pause rather than landing it
  readonly stop: string // the stop's text, wrapped lines joined with a space
  readonly model: string | null // the optional `- model:` line, verbatim: advice, never a gate
  readonly line: number // the 1-based line of the item's opener in intent.md
}

/** What `## Build ranges` holds: the ranges that parse, and the items that do not. */
export type BuildRanges = {
  readonly ranges: ReadonlyArray<BuildRange>
  // The numbers of items that are neither a range nor scaffold, so the dashboard
  // can say which one to fix rather than drop it without a word.
  readonly malformed: ReadonlyArray<number>
}

// A range's opener: the item's number, the command in backticks, a comma, and
// the stop's text from `**stop:**` to the end of the line.
const RANGE_OPENER = /^`([^`]*)`\s*,?\s*\*\*stop:\*\*\s*(.*)$/i

// A `<...>` fill-in the template ships, still waiting for its words.
const FILL_IN = /<[^<>]+>/

/**
 * Parse the ranges under `## Build ranges`: one numbered item per range, the
 * command in backticks, then `**stop:**` and the stop's text, then an optional
 * `- model:` sub-line.
 *
 * The command's steps go through the turn hook's own reader, so the card can
 * never suggest a command the hook reads another way. A paragraph before the
 * list and any sub-line but the model are the reader's. An item still holding
 * a `<...>` fill-in in its command or stop is scaffold, the template's
 * placeholder waiting for words, and reads as neither a range nor a report; any
 * other item that fails the grammar is reported by its number and never
 * thrown. A plan without the section, a build's record from before ranges
 * existed under another heading, and a section holding only the placeholder
 * all read as no ranges.
 */
export function parseBuildRanges(intent: string): BuildRanges {
  const { offset, lines } = sectionLines(intent, '## Build ranges')
  const ranges: BuildRange[] = []
  const malformed: number[] = []
  const openers = lines.flatMap((l, idx) => {
    const m = /^(\d+)\.\s+(.*)$/.exec(l)
    return m === null ? [] : [{ item: Number(m[1]), text: m[2] ?? '', idx }]
  })
  openers.forEach((o, i) => {
    const block = lines.slice(o.idx + 1, openers[i + 1]?.idx ?? lines.length)
    const text = [o.text, ...wrappedLines(block)].join(' ').trim()
    if (FILL_IN.test(text)) {
      return
    }
    const range = readRange(o.item, text, block, offset + o.idx + 1)
    if (range === null) {
      malformed.push(o.item)
    } else {
      ranges.push(range)
    }
  })
  return { ranges, malformed }
}

/**
 * The lines an item's opener wraps onto: each line after it, trimmed, up to the
 * first blank line, sub-line, or heading.
 */
function wrappedLines(block: ReadonlyArray<string>): string[] {
  const end = block.findIndex((l) => l.trim() === '' || /^\s*[-*+]\s/.test(l) || l.startsWith('#'))
  return block.slice(0, end === -1 ? block.length : end).map((l) => l.trim())
}

/**
 * One item read as a range, or null when it is not one: a command other than
 * `/plumbbob:build` with steps and nothing after them, a bare command naming
 * more than one step, or a stop with no text.
 */
function readRange(item: number, text: string, block: ReadonlyArray<string>, line: number): BuildRange | null {
  const m = RANGE_OPENER.exec(text)
  const args = /^\/plumbbob:build\s+([\d,\s-]+)$/.exec((m?.[1] ?? '').trim())?.[1]
  const stop = (m?.[2] ?? '').trim()
  if (args === undefined || stop === '') {
    return null
  }
  const read = readBuildArgs(args)
  const single = read.steps?.length === 1 && read.steps[0]?.from === read.steps[0]?.to
  if (read.steps === null || (!read.range && !single)) {
    return null
  }
  const model = /^\s*-\s*model:\s*(.+)$/im.exec(block.join('\n'))?.[1]?.trim() ?? null
  return {
    item,
    command: (m?.[1] ?? '').trim(),
    steps: read.steps,
    bare: !read.range,
    stop,
    model: model === null || FILL_IN.test(model) ? null : model,
    line,
  }
}

/** One report on the ranges: a range the plan has outgrown, or an item that does not parse. */
export type RangeDrift = {
  // A range's drift flags that range; a step no range names flags the plan,
  // and an item that does not parse names itself. The dashboard places a
  // range's rows beneath it and the plan's at the block's end.
  readonly kind: 'missing' | 'shared' | 'inside' | 'uncovered' | 'malformed'
  readonly item: number | null // the range or item it names; null for a step no range names
  readonly words: string // the words the card and the dashboard both say
}

/** Where the build stands in its ranges, read from one step: the card's and the dashboard's one source. */
export type RangeStanding = {
  // The ranges and the items that do not parse: the M in `range N of M`.
  readonly count: number
  // The range naming the step, the first in the plan when two do.
  readonly holding: BuildRange | null
  // The command that runs what is left of that range from the step, written
  // in build order; null when the range is flagged or nothing of it is left.
  readonly command: string | null
  // Why no command is named: the first words flagging the range, or the words
  // for a step no range names. Null when nothing is flagged.
  readonly flag: string | null
  // The range the step's landing completed, the step itself done along with
  // every other step the range names, whatever the range's form; the Stop
  // part is the caller's to drop for a bare one.
  readonly completed: BuildRange | null
  // Every report, each range's in the plan's order, then the plan's own.
  readonly drift: ReadonlyArray<RangeDrift>
}

/**
 * Where the build stands in its ranges, read from `step`: the range holding
 * it, the command that runs what is left of that range, the range its landing
 * completed, and every range the plan has outgrown.
 *
 * Nothing is stored. A range is landed once every step it names is done, and
 * what is left of it is its undone steps from `step` on, in build order, so a
 * step pause names what is left once the step in flight lands. A landing
 * range down to one step writes it `9-9`, which lands it, where a bare range
 * stays bare. `ordered` is the plan's steps in build order, landed ones
 * included. With no range that parses, no step sits outside one, so a fresh
 * build's placeholder flags nothing.
 */
export function rangeStanding(plan: BuildRanges, ordered: ReadonlyArray<Step>, step: number | null): RangeStanding {
  const drift = rangeDrift(plan, ordered)
  const count = plan.ranges.length + plan.malformed.length
  const at = ordered.findIndex((s) => s.n === step)
  const holding = plan.ranges.find((r) => step !== null && hasStep(r.steps, step))
  if (holding === undefined) {
    const outside = step !== null && plan.ranges.length > 0 && ordered[at]?.done === false
    return { count, holding: null, command: null, flag: outside ? noRangeWords([step]) : null, completed: null, drift }
  }
  const flag = drift.find((d) => d.item === holding.item && d.kind !== 'malformed')?.words ?? null
  const left = at === -1 ? [] : ordered.slice(at).filter((s) => !s.done && hasStep(holding.steps, s.n))
  return {
    count,
    holding,
    command: flag === null && left.length > 0 ? `/plumbbob:build ${leftExpression(holding, left)}` : null,
    flag,
    completed: ordered[at]?.done === true && rangeLanded(holding, ordered) ? holding : null,
    drift,
  }
}

/** Whether a range has landed: the plan holds a step it names, and every one it holds is done. */
function rangeLanded(range: BuildRange, ordered: ReadonlyArray<Step>): boolean {
  const held = ordered.filter((s) => hasStep(range.steps, s.n))
  return held.length > 0 && held.every((s) => s.done)
}

/** One range as the dashboard lists it: landed, holding the next step, and what flags it. */
export type RangeRow = {
  readonly range: BuildRange
  readonly landed: boolean
  readonly next: boolean
  readonly drift: ReadonlyArray<string> // the words flagging this range, one row each
}

/** The dashboard's ranges block: the count, a row per range, and the plan's own reports. */
export type RangesView = {
  readonly count: number
  readonly rows: ReadonlyArray<RangeRow>
  // The words for the undone steps no range names and the items that do not
  // parse, each a row at the block's end.
  readonly plan: ReadonlyArray<string>
}

/**
 * The ranges block the dashboard renders, and the move it suggests: the run
 * of the range holding the next undone step, with what is left of it.
 *
 * Null for a plan without ranges, so the block vanishes. The move is null when
 * the next step sits in no range, its range is flagged, or the step is still
 * unplanned, which leaves the dashboard's own step move in charge.
 */
function rangesView(intent: string, ordered: ReadonlyArray<Step>, next: Step | undefined): { readonly view: RangesView | null; readonly move: string | null } {
  const plan = parseBuildRanges(intent)
  const standing = rangeStanding(plan, ordered, next?.n ?? null)
  if (standing.count === 0) {
    return { view: null, move: null }
  }
  const own = (item: number) => standing.drift.filter((d) => d.item === item && d.kind !== 'malformed')
  const rows = plan.ranges.map((range) => ({
    range,
    landed: rangeLanded(range, ordered),
    next: range === standing.holding,
    drift: own(range.item).map((d) => d.words),
  }))
  const view = { count: standing.count, rows, plan: standing.drift.filter((d) => d.item === null || d.kind === 'malformed').map((d) => d.words) }
  const run = resolveRun({ intent, inFlight: null, spiking: false, item: null })
  return { view, move: !run.ok || next?.planned !== true ? null : runMove(run) }
}

/**
 * What is left of a range as the steps of a command: a landing range's last
 * step written `9-9` so the command lands it, else the steps in build order
 * with each climbing run folded to a span, a bare range's lone number included.
 */
function leftExpression(range: BuildRange, left: ReadonlyArray<Step>): string {
  const ns = left.map((s) => s.n)
  return !range.bare && ns.length === 1 ? `${ns[0]}-${ns[0]}` : formatStepList(ns)
}

/** The words for steps no range names: `no range names step 12`, or `steps 11, 12`. */
function noRangeWords(steps: ReadonlyArray<number>): string {
  return `no range names ${stepPhrase(steps.map(String)).words}`
}

/**
 * Every report on the ranges, in the order the dashboard lists them: each
 * range's own (a step the plan lacks, a step another range also names, a step
 * from outside it the build order puts among its own), then the undone steps
 * no range names, then the items that do not parse.
 *
 * A step the build order puts inside a range, and a step no range names,
 * count only while undone, since a landed step cannot cut a run short. The
 * coverage check runs only once a real range parses.
 */
function rangeDrift(plan: BuildRanges, ordered: ReadonlyArray<Step>): RangeDrift[] {
  const own = plan.ranges.flatMap((r) => [
    ...missingDrift(r, ordered),
    ...sharedDrift(r, plan.ranges, ordered),
    ...insideDrift(r, ordered),
  ])
  const outside = ordered.filter((s) => !s.done && !plan.ranges.some((r) => hasStep(r.steps, s.n))).map((s) => s.n)
  const uncovered: RangeDrift[] =
    plan.ranges.length > 0 && outside.length > 0 ? [{ kind: 'uncovered', item: null, words: noRangeWords(outside) }] : []
  const malformed = plan.malformed.map(
    (item): RangeDrift => ({ kind: 'malformed', item, words: `item ${item} under Build ranges does not parse` }),
  )
  return [...own, ...uncovered, ...malformed]
}

/**
 * A range naming steps the plan lacks, reported as the spans it names past
 * the plan's steps, so a span of any width is read without being counted out.
 */
function missingDrift(range: BuildRange, ordered: ReadonlyArray<Step>): RangeDrift[] {
  const held = ordered.map((s) => s.n).sort((a, b) => a - b)
  const gaps: Span[] = []
  for (const span of range.steps) {
    let from = span.from
    for (const n of held.filter((h) => h >= span.from && h <= span.to)) {
      if (n > from) {
        gaps.push({ from, to: n - 1 })
      }
      from = Math.max(from, n + 1)
    }
    if (from <= span.to) {
      gaps.push({ from, to: span.to })
    }
  }
  if (gaps.length === 0) {
    return []
  }
  const { words, be } = stepPhrase(normalizeStepList(gaps).split(','))
  return [{ kind: 'missing', item: range.item, words: `${words} ${be} not in the plan` }]
}

/** A range sharing steps with another range, one report for each other range. */
function sharedDrift(range: BuildRange, ranges: ReadonlyArray<BuildRange>, ordered: ReadonlyArray<Step>): RangeDrift[] {
  const mine = ordered.filter((s) => hasStep(range.steps, s.n))
  return ranges.flatMap((other) => {
    const both = other === range ? [] : mine.filter((s) => hasStep(other.steps, s.n)).map((s) => String(s.n))
    if (both.length === 0) {
      return []
    }
    const { words, be } = stepPhrase(both)
    return [{ kind: 'shared' as const, item: range.item, words: `${words} ${be} also in range ${other.item}` }]
  })
}

/**
 * A range the build order cuts short: an undone step it does not name, placed
 * between its first step and its last undone one, where a run of the range
 * halts.
 *
 * The span opens at the range's first step, landed or not, so a range a run
 * halted inside stays flagged until the step that halted it lands. It ends at
 * the range's last undone step, since a step placed after every one of them
 * cuts nothing short, and a range with none left reports nothing. An outside
 * step ahead of the range's first step builds first and cuts nothing, and the
 * card names its range before this one.
 */
function insideDrift(range: BuildRange, ordered: ReadonlyArray<Step>): RangeDrift[] {
  const first = ordered.findIndex((s) => hasStep(range.steps, s.n))
  const last = ordered.findLastIndex((s) => !s.done && hasStep(range.steps, s.n))
  const inside = last === -1 ? [] : ordered.slice(first + 1, last).filter((s) => !s.done && !hasStep(range.steps, s.n))
  if (inside.length === 0) {
    return []
  }
  const words = stepPhrase(inside.map((s) => String(s.n))).words
  return [{ kind: 'inside', item: range.item, words: `the build order puts ${words} inside it` }]
}

/**
 * Steps as a phrase, with the verb that agrees: `step 12` and `is`, or
 * `steps 11, 12` and `are`. Each item is a number or a span as it is typed.
 */
function stepPhrase(items: ReadonlyArray<string>): { readonly words: string; readonly be: string } {
  const one = items.length === 1 && /^\d+$/.test(items[0] ?? '')
  return { words: `${one ? 'step' : 'steps'} ${items.join(', ')}`, be: one ? 'is' : 'are' }
}

// --- The run: what `/plumbbob:run` names. The turn hook reads it to mint the
// run's grant, `status --run` to print the run header, and the card to name the
// run beneath Next Up, so all three read one answer from one plan. ---

/**
 * The range a run's arguments name, read from the one token after the verb:
 * a range number names that range, and anything else, nothing included, names
 * the range holding the next step.
 *
 * `--auto` beside the verb adds nothing, so it is passed over. Numbers joined
 * by a dash or a comma are a span or a list of ranges (`2-4`, `2, 3`), a form
 * no run defines, and read as null, so nothing is minted or resolved for them.
 * Trailing sentence punctuation is the sentence's, and so is a comma after the
 * last number (`/plumbbob:run 3, then review`), as it is after a build's.
 */
export function readRunArgs(text: string): { readonly item: number | null } | null {
  const words: string[] = []
  for (const token of text.split(/\s+/)) {
    const word = token.replace(/[.;:!?]+$/, '')
    if (word === '' || word === '--auto') {
      continue
    }
    if (!/^[\d,-]+$/.test(word)) {
      break
    }
    words.push(word)
  }
  const run = words.join(' ').replace(/,+$/, '')
  if (/[,-]/.test(run)) {
    return null
  }
  return { item: run === '' ? null : Number(run.split(' ')[0]) }
}

/** What a run is resolved from: the plan's text, the step in flight, whether a spike is open, and the range typed. */
export type RunInput = {
  readonly intent: string
  readonly inFlight: number | null
  readonly spiking: boolean
  readonly item: number | null // the range number typed; null names the range holding the next step
}

/** A run that names a range it can walk. */
export type RunRange = {
  readonly ok: true
  readonly range: BuildRange // its item, its form (`bare`), its stop, and its model
  readonly count: number // the M in `range N of M`
  // What is left of the range, in the order the run builds it: the step in
  // flight first when the range holds it, then the undone steps in build order.
  readonly left: ReadonlyArray<number>
  // `left` written as a step list in that order (`6-9`, `20,5-9`, `9`), so
  // its first number is where the run starts.
  readonly steps: string
  // The grant the hook mints for the run, `steps 6-9` in the list's normal
  // form; null for a bare range, which builds its step to the pause.
  readonly grant: string | null
}

/**
 * Why a run names nothing it can walk, with what each refusal's move needs: a
 * spike open, nothing left, a plan without ranges (and the step a build would
 * take), a step no range names, a flagged range or item and its drift words, a
 * range typed that has landed or that the plan lacks, or a span or a list of
 * ranges typed (each with the run a bare `/plumbbob:run` names in its place),
 * and a range typed that does not hold the step in flight (and the range that
 * does, if any).
 */
export type RunRefusal =
  | { readonly ok: false; readonly kind: 'spike' }
  | { readonly ok: false; readonly kind: 'finished' }
  | { readonly ok: false; readonly kind: 'no-ranges'; readonly step: number }
  | { readonly ok: false; readonly kind: 'uncovered'; readonly step: number; readonly words: string }
  | { readonly ok: false; readonly kind: 'flagged'; readonly item: number; readonly count: number; readonly words: string }
  | { readonly ok: false; readonly kind: 'landed'; readonly item: number; readonly count: number; readonly instead: Run }
  | { readonly ok: false; readonly kind: 'missing'; readonly item: number; readonly instead: Run }
  | { readonly ok: false; readonly kind: 'span'; readonly instead: Run }
  | {
      readonly ok: false
      readonly kind: 'in-flight'
      readonly step: number
      readonly holding: number | null // the range holding the step in flight; null when none does
      readonly count: number
    }

/** The range a run names, or why it names nothing it can walk. */
export type Run = RunRange | RunRefusal

/**
 * The range a run names and what is left of it, or the refusal that says why
 * it names nothing it can walk.
 *
 * A step in flight decides the run: with no number typed, the run names the
 * range holding that step, or with none in flight the range holding the next
 * undone step in build order; a number names that range, and refuses when the
 * range does not hold the step in flight. What is left counts the step in
 * flight as undone and leads with it, since a run that started elsewhere would
 * rewrite the step markers and sweep its half-built diff into another step's
 * commit. A spike open refuses every run, and nothing left refuses before the
 * ranges are read. The ranges are read through `rangeStanding`, so the run
 * and the card name the same range and the same drift.
 */
export function resolveRun(input: RunInput): Run {
  if (input.spiking) {
    return { ok: false, kind: 'spike' }
  }
  const ordered = parseOrderedSteps(input.intent)
  const anchor = input.inFlight ?? ordered.find((s) => !s.done)?.n ?? null
  if (anchor === null) {
    return { ok: false, kind: 'finished' }
  }
  const plan = parseBuildRanges(input.intent)
  const standing = rangeStanding(plan, ordered, anchor)
  const { count } = standing
  if (count === 0) {
    return { ok: false, kind: 'no-ranges', step: anchor }
  }
  if (input.item === null) {
    const { holding } = standing
    // With no range that parses, no step sits outside one, so the words are
    // the first item's that does not.
    const words = standing.flag ?? standing.drift.find((d) => d.kind === 'malformed')?.words ?? noRangeWords([anchor])
    return holding === null
      ? { ok: false, kind: 'uncovered', step: anchor, words }
      : walkRun(holding, standing, ordered, input.inFlight)
  }
  const item = input.item
  const range = plan.ranges.find((r) => r.item === item)
  if (range === undefined) {
    const malformed = standing.drift.find((d) => d.kind === 'malformed' && d.item === item)
    return malformed === undefined
      ? { ok: false, kind: 'missing', item, instead: resolveRun({ ...input, item: null }) }
      : { ok: false, kind: 'flagged', item, count, words: malformed.words }
  }
  if (rangeLanded(range, ordered)) {
    return { ok: false, kind: 'landed', item, count, instead: resolveRun({ ...input, item: null }) }
  }
  if (input.inFlight !== null && !hasStep(range.steps, input.inFlight)) {
    return { ok: false, kind: 'in-flight', step: input.inFlight, holding: standing.holding?.item ?? null, count }
  }
  return walkRun(range, standing, ordered, input.inFlight)
}

/**
 * A range as a run walks it: what is left of it, led by the step in flight,
 * and the grant the hook mints; or the flagged refusal when the range's own
 * drift names it.
 */
function walkRun(range: BuildRange, standing: RangeStanding, ordered: ReadonlyArray<Step>, inFlight: number | null): Run {
  const flag = standing.drift.find((d) => d.item === range.item && d.kind !== 'malformed')
  if (flag !== undefined) {
    return { ok: false, kind: 'flagged', item: range.item, count: standing.count, words: flag.words }
  }
  const undone = ordered.filter((s) => hasStep(range.steps, s.n) && (!s.done || s.n === inFlight)).map((s) => s.n)
  const left = inFlight !== null && undone.includes(inFlight) ? [inFlight, ...undone.filter((n) => n !== inFlight)] : undone
  return {
    ok: true,
    range,
    count: standing.count,
    left,
    steps: formatStepList(left),
    grant: range.bare ? null : `steps ${normalizeStepList(left.map((n) => ({ from: n, to: n })))}`,
  }
}

/**
 * The run a skill invocation's raw arguments name, read as the turn hook reads
 * them: `readRunArgs`, then `resolveRun`. A span or a list of ranges names no
 * run, and refuses with the run a bare `/plumbbob:run` names in its place.
 */
export function resolveRunArgs(text: string, build: Omit<RunInput, 'item'>): Run {
  const args = readRunArgs(text)
  if (args === null) {
    return { ok: false, kind: 'span', instead: resolveRun({ ...build, item: null }) }
  }
  return resolveRun({ ...build, item: args.item })
}

/**
 * What is left of a run, as its bracket and its header write it: `steps 6-9`,
 * `steps 20,5-9`, or `step 9` for one step.
 */
export function runSteps(run: RunRange): string {
  return `${run.left.length === 1 ? 'step' : 'steps'} ${run.steps}`
}

/**
 * What the card's bracket says the run lands: what is left of it, and for a
 * bare range that it builds the step to its pause (`step 10 to its pause`).
 */
export function runBracket(run: RunRange): string {
  return run.range.bare ? `${runSteps(run)} to its pause` : runSteps(run)
}

/**
 * The pointer naming a run: the range and its count, the run's command, and
 * the bracket, with a note beside the steps when one is given.
 */
export function runMove(run: RunRange, note?: string): string {
  return `run range ${run.range.item} of ${run.count} — \`/plumbbob:run\` (${runBracket(run)}${note === undefined ? '' : `; ${note}`})`
}

/**
 * The dashboard's pointer for a run that names nothing it can walk, in the
 * dashboard's own register: the refusal and the move that unblocks it. Null
 * for nothing left, whose move is the dashboard's own ending, which a run adds
 * nothing to.
 */
export function runRefusalMove(refusal: RunRefusal): string | null {
  const recut = 're-cut the ranges — `/plumbbob:refine ranges`'
  switch (refusal.kind) {
    case 'spike':
      return 'close the spike — `plumbbob spike done`'
    case 'finished':
      return null
    case 'no-ranges':
      return `cut the ranges — \`/plumbbob:refine ranges\` (the plan declares none; \`/plumbbob:build\` builds step ${refusal.step} alone)`
    case 'uncovered':
      return `${recut} (${refusal.words})`
    case 'flagged':
      return `${recut} (range ${refusal.item} of ${refusal.count} needs a re-cut: ${refusal.words})`
    case 'landed':
      return insteadMove(refusal.instead, `range ${refusal.item} of ${refusal.count} has landed`)
    case 'missing':
      return insteadMove(refusal.instead, `the plan has no range ${refusal.item}`)
    case 'span':
      return insteadMove(refusal.instead, 'a run names one range')
    case 'in-flight': {
      const holds = refusal.holding === null ? 'no range names it' : `a run names range ${refusal.holding} of ${refusal.count}, which holds it`
      return `finish step ${refusal.step} — \`/plumbbob:verify\` (or \`/plumbbob:abandon\` it; ${holds})`
    }
  }
}

/**
 * The pointer at the run a bare `/plumbbob:run` names, carrying why the typed
 * one was refused, or that run's own refusal when it names nothing either.
 */
function insteadMove(instead: Run, note: string): string | null {
  return instead.ok ? runMove(instead, note) : runRefusalMove(instead)
}

/**
 * The three-line header `status --run` prints above the dashboard: the range,
 * what is left of it, and where the run ends; its stop; and the grant the
 * hook minted, held against the one the run would mint.
 *
 * `grant` is the GRANT file's content in its normal form, or null when none
 * stands. The grant line is the one the run skill trusts over the two above
 * it, since the hook read the plan the human typed against, so it says when
 * the two differ rather than choosing between them.
 */
export function formatRunHeader(run: RunRange, grant: string | null): string {
  const last = run.left.at(-1) ?? run.range.steps[0]?.from
  const ends = run.range.bare ? `ends at step ${last}'s pause` : `ends at step ${last}'s boundary`
  return [
    `run  range ${run.range.item} of ${run.count} · ${runSteps(run)} · ${ends}`,
    `     stop: ${run.range.stop}`,
    `     grant: ${grantWords(run, grant)}`,
  ].join('\n')
}

/**
 * The grant line's value: the grant as the hook minted it, `none` with its
 * reason, or the grant marked unlike the run.
 */
function grantWords(run: RunRange, grant: string | null): string {
  if (grant === null) {
    return run.grant === null ? 'none, as a bare range builds to its pause' : 'none'
  }
  return grant === run.grant ? grant : `${grant}, unlike the run`
}

/**
 * The dashboard `status --run` prints for a run: beneath the run header, with
 * the run's first step marked `← requested` and the pointer naming the run;
 * or, for a run that names nothing it can walk, the dashboard as it renders
 * without the flag, its pointer carrying the refusal.
 */
export function formatRunDashboard(input: OrientInput, run: Run, grant: string | null): string {
  if (!run.ok) {
    const plain = orient({ ...input, requested: null })
    return formatOrientation({ ...plain, next: runRefusalMove(run) ?? plain.next })
  }
  const first = run.left[0] ?? null
  const repointed = orient({ ...input, requested: first === null ? null : [{ from: first, to: first }] })
  return `${formatRunHeader(run, grant)}\n\n${formatOrientation({ ...repointed, next: runMove(run) })}`
}

/**
 * Flip step N's `[ ]` checkbox to `[x]` within the `## Steps` section.
 *
 * Mechanical bookkeeping for `checkpoint`, so `status` reflects a checkpointed
 * step. A no-op if the step is absent or already done.
 */
export function markStepDone(intent: string, n: number): string {
  let inSteps = false
  return intent
    .split('\n')
    .map((line) => {
      if (line.trim() === '## Steps') {
        inSteps = true
        return line
      }
      if (inSteps && line.startsWith('## ')) {
        inSteps = false
      }
      return inSteps && new RegExp(`^${n}\\.\\s+\\[ \\]`).test(line) ? line.replace('[ ]', '[x]') : line
    })
    .join('\n')
}

/**
 * Count the questions still open: `- Q\d+:` openers under `## Open questions`
 * that carry neither a resolution marker nor an unfilled scaffold body.
 *
 * The opener may carry a slug-at-birth gloss (`- Q2 (some-slug): ...`) and the
 * anchored form a citable question is born in:
 * `- <a id="q2"></a>**Q2 (some-slug)**: ...`, which is what a `[Q2 (some-slug)](#q2)`
 * reference site elsewhere in the file lands on. The count reads through both, and
 * through any mix of them a hand-edited intent leaves mid-build; sub-lines
 * (`*plain:*`/`*lean:*`) never match.
 *
 * Two rules settle the rest. "Resolved" counts as a marker only as a whole word, so
 * a question whose opener still calls itself "unresolved" keeps counting; a bare
 * substring read that as resolved and dropped a live hole off the dashboard. And an
 * opener whose body has not been filled in yet, still opening on its `<...>`
 * fill-in, is scaffold rather than a question, which is what makes a fresh build
 * report zero rather than one.
 */
export function parseOpenQuestions(intent: string): number {
  const opener = /^-\s+(?:<a id="[^"]*"><\/a>\s*)?\*{0,2}Q\d+(?: \([^)]+\))?\*{0,2}:\s*(.*)$/
  return sectionLines(intent, '## Open questions').lines.filter((l) => {
    const body = opener.exec(l.trim())?.[1]
    return body !== undefined && !/\bresolved\b/i.test(l) && !/^<[^>]*>/.test(body)
  }).length
}

/** The park list's counts: the items still open, and every item ever parked. */
export type ParkTotals = { readonly open: number; readonly total: number }

/**
 * Count the park list: the `- [ ]` lines still open, and every checklist line
 * under `## Park list`, harvested `- [x]` ones included.
 *
 * A parked item is a mid-build idea the `park` verb appends as a flat checklist
 * line for later triage; `/plumbbob:harvest` flips a triaged one to `- [x]`, so
 * the pair reads `parked 2 of 7 open` and a harvest shows as the gap between
 * the two. The `(none yet)` placeholder and the blockquote instructions never
 * match.
 */
export function parseParkTotals(buildLog: string): ParkTotals {
  let open = 0
  let total = 0
  for (const line of sectionLines(buildLog, '## Park list').lines) {
    const m = /^-\s+\[([ xX])\]\s+\S/.exec(line.trim())
    if (m === null) {
      continue
    }
    total += 1
    if (m[1] === ' ') {
      open += 1
    }
  }
  return { open, total }
}

/**
 * Count the open parked items alone: `- [ ]` lines under `## Park list`.
 */
export function parseParked(buildLog: string): number {
  return parseParkTotals(buildLog).open
}

/**
 * The park count as both surfaces say it: `parked 2 of 7 open` once anything
 * has been parked, the open count against everything ever parked; `parked 0`
 * with nothing on the list yet.
 */
export function parkedPhrase(totals: ParkTotals): string {
  return totals.total === 0 ? 'parked 0' : `parked ${totals.open} of ${totals.total} open`
}

/**
 * Count the constraints declared under `## Constraints`: the section's
 * top-level list items, in whatever anchored or glossed form they are written.
 *
 * This is the readout's denominator for the constraints row. A constraint
 * always applies (that is what makes it one), so the count is the CLI's to read
 * rather than the model's to attest.
 */
export function parseConstraintCount(intent: string): number {
  return sectionLines(intent, '## Constraints').lines.filter((l) => /^-\s+\S/.test(l)).length
}

/**
 * The last `step N <sha>` line in the checkpoints ledger, or null when no step
 * has landed yet.
 */
export function parseLastCheckpoint(checkpoints: string): Checkpoint | null {
  let last: Checkpoint | null = null
  for (const line of checkpoints.split('\n')) {
    const m = /^step\s+(\d+)\s+(\S+)/.exec(line.trim())
    if (m) {
      last = { n: Number(m[1]), sha: m[2] ?? '' }
    }
  }
  return last
}

/**
 * The SHA of the last ledger line of ANY kind: baseline, plan, or step.
 *
 * This is the reconciliation anchor for the out-of-band commit count: a commit
 * that lands after the plan but before the first step checkpoint is exactly the
 * window the reconciliation line exists for, so anchoring on step lines alone
 * would leave it invisible. `parseLastCheckpoint` stays step-only; it feeds
 * the "last checkpoint step N" display, where baseline/plan would be noise.
 */
export function lastLedgerSha(checkpoints: string): string | null {
  let last: string | null = null
  for (const line of checkpoints.split('\n')) {
    const m = /^(?:baseline|plan|step\s+\d+)\s+(\S+)/.exec(line.trim())
    if (m) {
      last = m[1] ?? null
    }
  }
  return last
}

/**
 * The steps an explicit skill invocation asks for, out of the raw argument
 * text `status --invoked` receives, read the way the turn hook reads a typed
 * range.
 *
 * A step number names one step, and a range or a list names the steps it
 * holds (`orient` starts it at the first undone one in build order); `--auto`
 * alone, a range that does not parse, and free text parse to null, meaning "no
 * explicit ask", which leaves the dashboard's own suggestion in charge. Null in
 * means null out, so a host that never substitutes the invocation degrades to
 * today's rendering.
 */
export function parseRequestedStep(raw: string | null): StepList | null {
  return raw === null ? null : readBuildArgs(raw.trim()).steps
}

/**
 * The step a requested list starts at: its first undone step in build order,
 * however the list was written; its first step in build order when every one
 * has landed; or its first number written when the plan holds none of them, so
 * the dashboard reports that number missing. Null for an empty list.
 */
export function rangeStart(ordered: ReadonlyArray<Step>, list: StepList): number | null {
  const named = ordered.filter((s) => hasStep(list, s.n))
  return (named.find((s) => !s.done) ?? named[0])?.n ?? list[0]?.from ?? null
}

/**
 * The single primary next move the dashboard suggests.
 *
 * It suggests; the dashboard prints the full list + counts so the human can
 * always override. An explicitly requested step outranks the derived
 * suggestion: the request IS the human's override, so the move names that step
 * (noting anything it skips or collides with) rather than arguing for the
 * default. Otherwise the phase decides: a spike in progress and an in-flight
 * step each have one obvious next move; else you are at the boundary and the
 * move follows from the steps.
 */
function nextMove(
  spiking: boolean,
  steps: ReadonlyArray<Step>,
  inFlight: number | null,
  parked: number,
  requested: number | null,
): string {
  const target = requested === null ? undefined : steps.find((s) => s.n === requested)
  if (requested !== null && target === undefined) {
    return `step ${requested} is not in the plan (${steps.length} step${steps.length === 1 ? '' : 's'} planned) — report the mismatch rather than guess`
  }
  if (spiking) {
    const tail = target === undefined ? '' : `; then build step ${target.n} (explicitly requested)`
    return `close the spike — \`plumbbob spike done\`${tail}`
  }
  if (inFlight !== null) {
    if (target !== undefined && target.n !== inFlight) {
      return `build step ${target.n} — explicitly requested (step ${inFlight} is still in flight: \`/plumbbob:verify\` it or \`/plumbbob:abandon\` it first)`
    }
    return `finish step ${inFlight} — \`/plumbbob:verify\` (or keep editing, then \`/plumbbob:verify\`)`
  }
  if (target !== undefined) {
    if (target.done) {
      return `build step ${target.n} — explicitly requested (already checkpointed)`
    }
    const skipped = skippedBefore(steps, target.n).length
    const notes: string[] = []
    if (skipped > 0) {
      notes.push(`skips ${skipped} undone step${skipped === 1 ? '' : 's'}`)
    }
    if (!target.planned) {
      notes.push('still unplanned: `/plumbbob:step` it first')
    }
    const suffix = notes.length > 0 ? ` (${notes.join('; ')})` : ''
    return `build step ${target.n} — explicitly requested${suffix}`
  }
  // At the boundary (DESIGN): the move follows from the steps.
  const nextUndone = steps.find((s) => !s.done)
  if (nextUndone === undefined) {
    if (steps.length === 0) {
      return 'plan the first step — `/plumbbob:step`'
    }
    // Batch-default: the steps were planned up front, so finishing them usually
    // means "finish up", but `/plumbbob:step` can still add an increment if reality grew.
    const harvest = parked > 0 ? `harvest ${parked} parked idea${parked === 1 ? '' : 's'} — \`/plumbbob:harvest\`; then ` : ''
    return `${harvest}finish up — \`/plumbbob:finish\` (or \`/plumbbob:step\` to add another increment)`
  }
  return nextUndone.planned
    ? `build step ${nextUndone.n} — \`/plumbbob:build\` (or \`/plumbbob:step\` to revise it first)`
    : `plan step ${nextUndone.n} — \`/plumbbob:step\``
}

/**
 * Assemble the full orientation from a build's raw documents and marker state.
 */
export function orient(input: OrientInput): Orientation {
  const steps = parseSteps(input.intent)
  // The build order re-sequences the picks and nothing else: the step block
  // still renders in document order, with the marker showing where the
  // sequence actually goes.
  const order = parseBuildOrder(input.intent)
  const ordered = orderSteps(steps, order)
  const parks = parseParkTotals(input.buildLog)
  // The step an explicit ask points at: the number typed, or where a typed
  // range starts in build order.
  const requested = input.requested === null ? null : rangeStart(ordered, input.requested)
  // The target the dashboard details: the explicitly requested step when it
  // exists in the plan, else the next undone. A requested number that names no
  // planned step carries nothing here; the next-move line reports the mismatch
  // while the rest of the dashboard renders as usual.
  const requestedStep = requested === null ? undefined : steps.find((s) => s.n === requested)
  const nextUndone = ordered.find((s) => !s.done)
  const target = requestedStep ?? nextUndone
  const seamParse = target === undefined ? null : parseStepSeam(input.intent, target.n)
  const phase = input.spiking ? 'SPIKE' : input.inFlight !== null ? 'BUILD' : 'DESIGN'
  // At the boundary with nothing asked for, the move names the range holding
  // the next step; a spike, a step in flight, or a request keeps its own.
  const ranges = rangesView(input.intent, ordered, nextUndone)
  const atBoundary = !input.spiking && input.inFlight === null && requested === null
  return {
    title: parseTitle(input.intent),
    phase,
    steps,
    lastCheckpoint: parseLastCheckpoint(input.checkpoints),
    parked: parks.open,
    parkedTotal: parks.total,
    openQuestions: parseOpenQuestions(input.intent),
    next: (atBoundary ? ranges.move : null) ?? nextMove(input.spiking, ordered, input.inFlight, parks.open, requested),
    nextUndone: nextUndone?.n ?? null,
    buildOrder: remainingOrder(steps, order, null),
    ranges: ranges.view,
    requested: requestedStep?.n ?? null,
    nextDoneWhen: target?.doneWhen ?? null,
    nextSeam: seamParse !== null && seamParse.ok ? seamParse.seam : [],
    nextModel: target?.model ?? null,
    outOfBand: input.outOfBand,
  }
}

// --- The footer card: readout parsing and the Verdict's worst-of fold, spec'd in
// docs/presentation.md. Pure: `handoff` supplies the parsed recap (with its
// own check measurement folded over the model's attested row) and the step's
// accrued stats; this section only decides which ladder state and worst
// component result. ---

/**
 * One measuring row's classification: holding, failing now, the plan itself
 * is wrong, or an advisory. Only the seam row can be advisory: the seam is
 * awareness rather than a lock, so a stray folds no lower than the Verdict's
 * third rung.
 */
export type RecapVerdict = 'true' | 'failing' | 'drift' | 'advisory'

/**
 * One measuring row of the readout: its verdict, the leading word that earned
 * it, the evidence after that word, and the two shapes a row grows when one
 * line cannot carry it. `items` are the `- ` continuation lines a row with two
 * or more offenders breaks onto; `pointer` is the `→` line's target under a red
 * row, the one place a fence can say where to look.
 */
export type RecapRow = {
  readonly verdict: RecapVerdict
  readonly word: string
  readonly evidence: string
  readonly items?: ReadonlyArray<string>
  readonly pointer?: string
}

/** The recap's five measuring rows, in the fixed order the fold walks them. */
const RECAP_ROW_NAMES = ['check', 'done-when', 'decisions', 'constraints', 'seam'] as const
export type RecapRowName = (typeof RECAP_ROW_NAMES)[number]

/** The recap the model writes into `.plumbbob/detail.md` before a pause, or before a stop card. */
export type Recap = {
  readonly n: number // the step's number, or the range's under a range header
  readonly total: number
  readonly rows: Readonly<Partial<Record<RecapRowName, RecapRow>>>
  readonly diff: string | null // information only; never folds into the Verdict
}

/**
 * Classify one recap row's value by its leading word, per the closed vocabulary
 * in docs/presentation.md's row table. Null when the value opens with none of
 * the words the row's kind allows (an unparseable row is simply absent from
 * the fold, the same as a row that never rode the recap at all).
 */
function classifyRecapRow(name: RecapRowName, value: string): { readonly verdict: RecapVerdict; readonly word: string } | null {
  const v = value.trim()
  const test = (re: RegExp, verdict: RecapVerdict): { readonly verdict: RecapVerdict; readonly word: string } | null => {
    const m = re.exec(v)
    return m === null ? null : { verdict, word: m[0] }
  }
  switch (name) {
    case 'check':
      return test(/^green\b/, 'true') ?? test(/^red\b/, 'failing') ?? test(/^error\b/, 'failing')
    case 'done-when':
      return test(/^met\b/, 'true') ?? test(/^not met\b/, 'failing') ?? test(/^drift\b/, 'drift')
    case 'decisions':
      return (
        test(/^honored\b/, 'true') ??
        test(/^\d+ of \d+ honored\b/, 'true') ??
        test(/^none exercised\b/, 'true') ??
        test(/^bent\b/, 'failing') ??
        test(/^drift\b/, 'drift')
      )
    case 'constraints':
      return (
        test(/^all honored\b/, 'true') ??
        test(/^\d+ of \d+ honored\b/, 'true') ??
        test(/^bent\b/, 'failing') ??
        test(/^drift\b/, 'drift')
      )
    case 'seam':
      return test(/^held\b/, 'true') ?? test(/^strayed\b/, 'advisory') ?? test(/^drift\b/, 'drift')
  }
}

/**
 * Parse the fenced recap the model writes into `.plumbbob/detail.md`: the
 * `── recap · step N of M ──` header, the (subset of) five measuring rows
 * present, and the free-text diff row. Null when no header is found.
 *
 * A range's detail opens its rows under `── recap · range N of M ──` instead,
 * and only the `range` scope reads that header, so a step pause never takes a
 * stop's judgment rows for its own, and the stop card never takes a step's.
 *
 * A row absent from the block is simply missing from `rows`: a vanished row
 * the fold treats exactly like one that never applied, never like a failure.
 * An indented `- ` or `→ ` line attaches to the row above it, which is how a
 * row carrying two or more items, or a pointer at its evidence, survives the
 * round trip through the file.
 */
export function parseRecap(detail: string, scope: 'step' | 'range' = 'step'): Recap | null {
  const lines = detail.split('\n')
  const opener = new RegExp(`^──\\s*recap\\s*·\\s*${scope}\\s+\\d+\\s+of\\s+\\d+\\s*──$`)
  const headerIdx = lines.findIndex((l) => opener.test(l.trim()))
  if (headerIdx === -1) {
    return null
  }
  const header = new RegExp(`${scope}\\s+(\\d+)\\s+of\\s+(\\d+)`).exec(lines[headerIdx] ?? '')
  if (header === null) {
    return null
  }
  const rows: Partial<Record<RecapRowName, RecapRow>> = {}
  let diff: string | null = null
  let last: RecapRowName | null = null
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim().length === 0) {
      break // the fence is one contiguous block; a blank line ends it
    }
    const carried = /^\s+([-→])\s+(\S.*)$/.exec(line)
    const open = last === null ? undefined : rows[last]
    if (carried !== null) {
      if (last !== null && open !== undefined) {
        const item = (carried[2] ?? '').trim()
        rows[last] = carried[1] === '→' ? { ...open, pointer: item } : { ...open, items: [...(open.items ?? []), item] }
      }
      continue
    }
    const m = /^(\S[\w-]*)\s+(.+)$/.exec(line)
    if (m === null) {
      continue
    }
    const label = m[1] ?? ''
    const value = (m[2] ?? '').trim()
    last = null
    if (label === 'diff') {
      diff = value
    } else if ((RECAP_ROW_NAMES as readonly string[]).includes(label)) {
      const classified = classifyRecapRow(label as RecapRowName, value)
      if (classified !== null) {
        rows[label as RecapRowName] = { ...classified, evidence: value }
        last = label as RecapRowName
      }
    }
  }
  return { n: Number(header[1]), total: Number(header[2]), rows, diff }
}

/** One rung of the circle ladder (docs/presentation.md's state table): its glyph and its state word. */
export type Ladder = { readonly glyph: string; readonly state: string }

const PLUMB: Ladder = { glyph: '●', state: 'Plumb' }
const A_HAIR_OFF: Ladder = { glyph: '◐', state: 'A hair off' }
const OUT_OF_PLUMB: Ladder = { glyph: '○', state: 'Out of plumb' }
const NOT_STANDING: Ladder = { glyph: '✗', state: 'Not standing' }

/** The Verdict's computed result: the ladder rung, and the worst component named (null when nothing is off). */
export type VerdictFold = { readonly ladder: Ladder; readonly worst: string | null }

/** A step's accrued stats, or a range's summed across its steps: the advisory inputs to the fold's third rung. */
export type AccruedStats = {
  readonly driftWarnings: number
  readonly redChecks: number
  readonly reverts: number
  readonly outOfBand: number
}

/**
 * Fold the recap's measuring rows worst-of with the step's accrued stats:
 * drift beats a live failure beats an advisory beats plumb, and each rung
 * names the one component that earned it. The advisory rung runs in a fixed
 * order, the seam stray first.
 *
 * A strayed seam is an advisory, never a failure: a path outside the seam
 * says either that the work wandered or that the line was drawn too tight,
 * and truing the diff fixes neither. At the pause the measured seam row
 * carries the stray; at the boundary the tree is clean, the row has vanished,
 * and the stat the checkpoint bumped carries it instead. Both name it
 * `seam strayed`, so the rung does not change between the two.
 *
 * A stop card folds a range the same way, its stats summed across the steps,
 * and only the revert's words change with the scope (`1 revert in the
 * range`), since the other advisories already read across whatever they
 * count.
 */
export function foldVerdict(
  rows: Readonly<Partial<Record<RecapRowName, RecapRow>>>,
  stats: AccruedStats,
  scope: 'step' | 'range' = 'step',
): VerdictFold {
  for (const name of RECAP_ROW_NAMES) {
    if (rows[name]?.verdict === 'drift') {
      return { ladder: NOT_STANDING, worst: `${name} drifted` }
    }
  }
  for (const name of RECAP_ROW_NAMES) {
    const row = rows[name]
    if (row !== undefined && row.verdict === 'failing') {
      return { ladder: OUT_OF_PLUMB, worst: `${name} ${row.word}` }
    }
  }
  for (const name of RECAP_ROW_NAMES) {
    const row = rows[name]
    if (row !== undefined && row.verdict === 'advisory') {
      return { ladder: A_HAIR_OFF, worst: `${name} ${row.word}` }
    }
  }
  if (stats.driftWarnings > 0) {
    // First of the advisory rung, and uncounted: the stat bumps once per
    // checkpoint rather than once per stray path, and this is the one advisory
    // that asks a question of the plan rather than of the work.
    return { ladder: A_HAIR_OFF, worst: 'seam strayed' }
  }
  if (stats.redChecks > 0) {
    return { ladder: A_HAIR_OFF, worst: `${stats.redChecks} red run${stats.redChecks === 1 ? '' : 's'} before green` }
  }
  if (stats.reverts > 0) {
    const where = scope === 'range' ? 'in the range' : 'on this step'
    return { ladder: A_HAIR_OFF, worst: `${stats.reverts} revert${stats.reverts === 1 ? '' : 's'} ${where}` }
  }
  if (stats.outOfBand > 0) {
    return { ladder: A_HAIR_OFF, worst: `${stats.outOfBand} commit${stats.outOfBand === 1 ? '' : 's'} outside the ledger` }
  }
  return { ladder: PLUMB, worst: null }
}

// --- The assembled readout: the CLI-computed rows and the fence they ride in
// (docs/presentation.md). `handoff` measures (the check summary, the numstat,
// the seam file, the stats receipt) and this section turns each measurement
// into its row, every value cut to the 67 columns the 13-character label pad
// leaves inside the 80-column fence. ---

/** The label pad: readout values start at column 14, so a value gets 67 of the 80. */
const RECAP_VALUE_BUDGET = 67

/** The continuation indent: a row's `- ` items and its `→ ` pointer align under the value column. */
const RECAP_INDENT = ' '.repeat(13)

/** Where a red check row points when no single slot owns the failure. */
const CHECK_SUMMARY = '.check/summary.json'

/** The check summary `plumbbob check` leaves in `.check/summary.json`, the fields the readout reads. */
export type CheckSummary = {
  readonly ok: boolean
  readonly total_duration_ms?: number
  readonly checks: ReadonlyArray<{
    readonly name: string
    readonly ok: boolean
    readonly skipped?: boolean
    readonly output_file?: string | null
  }>
}

/**
 * The measured check row from the last run's summary: the verdict word and a
 * count that sizes the gate. A narrowed run records its deselected slots as
 * skipped entries and the row names them behind the separator, degrading to
 * their count when the names overflow the value budget.
 *
 * Red expands where green collapses: one failing slot is named in the row and
 * its raw output is the `→` pointer, and two or more collapse to a count with
 * one `- ` line per slot.
 *
 * A stop card passes the range's `landings`, and a green row counts them
 * behind the gate's size: every landing passed the gate, since the checkpoint
 * refuses on red.
 */
export function summaryCheckRow(summary: CheckSummary, landings = 0): RecapRow {
  const ran = summary.checks.filter((c) => c.skipped !== true)
  const skipped = summary.checks.filter((c) => c.skipped === true).map((c) => c.name)
  const named = skipped.length === 0 ? '' : ` · without ${skipped.join(', ')}`
  const counted = skipped.length === 0 ? '' : ` · without ${skipped.length} others`
  const fit = (long: string, short: string): string => (long.length <= RECAP_VALUE_BUDGET ? long : short)
  if (summary.ok) {
    const landed = landings === 0 ? '' : `, ${landings} landing${landings === 1 ? '' : 's'}`
    const size = `${ran.length} of ${summary.checks.length} checks${landed}`
    return { verdict: 'true', word: 'green', evidence: fit(`green: ${size}${named}`, `green: ${size}${counted}`) }
  }
  const failing = ran.filter((c) => !c.ok)
  const first = failing[0]
  if (failing.length > 1) {
    return {
      verdict: 'failing',
      word: 'red',
      evidence: `red: ${failing.length} of ${ran.length} checks failing`,
      items: failing.map((c) => c.name),
      pointer: CHECK_SUMMARY,
    }
  }
  if (first !== undefined) {
    return {
      verdict: 'failing',
      word: 'red',
      evidence: fit(`red: ${first.name} failing${named}`, `red: ${first.name} failing`),
      pointer: first.output_file == null ? CHECK_SUMMARY : `.check/${first.output_file}`,
    }
  }
  return { verdict: 'failing', word: 'red', evidence: fit(`red${named}`, 'red'), pointer: CHECK_SUMMARY }
}

/**
 * The measured seam row: the changed work-plane paths against the step's seam
 * tokens. Null when there is no seam to measure against or nothing changed
 * (the row then vanishes, or the model's attested row stands).
 *
 * Green sizes the declared seam: how many of its tokens the diff actually
 * touched, and that nothing landed outside them. A stray states the size of
 * the problem and lets the paths themselves be the evidence: one stray is the
 * `→` pointer, and several break onto `- ` lines. It is an advisory, not a
 * failure (the seam is awareness, not a lock), so the fold puts it on the
 * third rung, never the second. `paths` are work-plane changes, artifacts
 * already filtered by the caller.
 */
export function seamRowFromDiff(paths: ReadonlyArray<string>, seam: ReadonlyArray<string>): RecapRow | null {
  if (seam.length === 0 || paths.length === 0) {
    return null
  }
  const outside = scopeDrift(paths, seam)
  if (outside.length === 0) {
    const touched = seam.filter((token) => paths.some((p) => scopeDrift([p], [token]).length === 0)).length
    return { verdict: 'true', word: 'held', evidence: `held: ${touched} of ${seam.length} declared, no strays` }
  }
  const evidence = `strayed: ${outside.length} path${outside.length === 1 ? '' : 's'} outside the seam`
  const only = outside[0]
  return outside.length === 1 && only !== undefined
    ? { verdict: 'advisory', word: 'strayed', evidence, pointer: only }
    : { verdict: 'advisory', word: 'strayed', evidence, items: outside }
}

/** The summed working-tree change: line counts and the file count. */
export type DiffCounts = { readonly added: number; readonly removed: number; readonly files: number }

/**
 * Sum numstat entries into the diff row's three counts.
 */
export function countDiff(entries: ReadonlyArray<{ readonly added: number; readonly removed: number }>): DiffCounts {
  return {
    added: entries.reduce((sum, e) => sum + e.added, 0),
    removed: entries.reduce((sum, e) => sum + e.removed, 0),
    files: entries.length,
  }
}

/**
 * The diff row's value: `+<added> -<removed> across <N> files`, plus the
 * `inline below` pointer when the patch rides the turn. Null when nothing
 * changed: information only, and no change is no information.
 */
export function diffRowValue(counts: DiffCounts, inline: boolean): string | null {
  if (counts.files === 0) {
    return null
  }
  const files = `${counts.files} file${counts.files === 1 ? '' : 's'}`
  return `+${counts.added} -${counts.removed} across ${files}${inline ? ' · inline below' : ''}`
}

/** What the `spent` row is rendered from: the step's stamps and counters, and the turn ledger. */
export type SpentInputs = {
  readonly startedAt?: string
  readonly landedAt?: string
  readonly now: number
  readonly turns: number | null
  readonly redChecks: number
  readonly gateMs: number | null
  readonly driftWarnings: number
}

/**
 * The `spent` row's value: what the step has consumed, read from what
 * stats.json and the turn ledger already hold. Null when nothing is countable
 * yet, which vanishes the row on a fresh session rather than printing zeroes.
 *
 * Tokens and cost stay out: the transcript is host-specific and a price table
 * goes stale, while every fact here is on disk already.
 */
export function spentRowValue(input: SpentInputs): string | null {
  const parts: string[] = []
  const elapsed = elapsedSpent(input)
  if (elapsed !== null) {
    parts.push(elapsed)
  }
  if (input.turns !== null && input.turns > 0) {
    parts.push(`${input.turns} turn${input.turns === 1 ? '' : 's'}`)
  }
  if (input.gateMs !== null) {
    parts.push(`${Math.round(input.gateMs / 1000)}s gate`)
  }
  if (input.redChecks > 0) {
    parts.push(`${input.redChecks} red run${input.redChecks === 1 ? '' : 's'}`)
  } else if (input.gateMs !== null) {
    parts.push('green first run')
  }
  if (input.driftWarnings > 0) {
    parts.push(`${input.driftWarnings} drift warning${input.driftWarnings === 1 ? '' : 's'}`)
  }
  return parts.length === 0 ? null : parts.join(' · ')
}

/**
 * The elapsed clause: the step's `startedAt` to its `landedAt` at the
 * boundary, or to now while it is still open. Null when no stamp parses, or
 * the span runs backwards (a hand-edited receipt), since a negative age is
 * worse than a missing one.
 */
function elapsedSpent(input: SpentInputs): string | null {
  const started = input.startedAt === undefined ? Number.NaN : Date.parse(input.startedAt)
  if (!Number.isFinite(started)) {
    return null
  }
  const landed = input.landedAt === undefined ? Number.NaN : Date.parse(input.landedAt)
  return durationWords((Number.isFinite(landed) ? landed : input.now) - started)
}

/**
 * A span of time as the `spent` row says it: seconds under a minute, minutes
 * under two hours, then hours and minutes. Null for a span that runs
 * backwards or does not parse, since a negative age is worse than a missing
 * one.
 */
function durationWords(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) {
    return null
  }
  if (ms < 60_000) {
    return `${Math.round(ms / 1000)}s`
  }
  const minutes = Math.round(ms / 60_000)
  return minutes < 120 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/**
 * Collapse a green row to the count that sizes its universe; a failing row
 * comes back untouched, since red is where a row expands to name its offender.
 *
 * `done-when` collapses to its bare word (the Summary above is its evidence),
 * `decisions` to the tags the model listed, and `constraints` to the number
 * declared in intent.md, which the CLI counts rather than trusting the model's
 * arithmetic. The measured rows arrive collapsed already.
 */
function collapseRow(name: RecapRowName, row: RecapRow, constraints: number): RecapRow {
  if (row.verdict !== 'true') {
    return row
  }
  switch (name) {
    case 'done-when':
      return { ...row, evidence: row.word }
    case 'decisions': {
      const tags = new Set(row.evidence.match(/\b[A-Z]\d+\b/g) ?? [])
      return tags.size === 0 ? row : { ...row, evidence: `${tags.size} of ${tags.size} honored` }
    }
    case 'constraints':
      return constraints === 0 ? row : { ...row, evidence: `${constraints} of ${constraints} honored` }
    default:
      return row
  }
}

/** What the CLI measures for itself and hands the readout alongside the parsed rows. */
export type RecapExtras = {
  readonly steps?: StepsRow // a stop card's identity row, first in its fence; a step's readout has none
  readonly diff: string | null
  readonly spent: string | null
  readonly constraints: number
}

/**
 * The readout fence's inner lines: the measuring rows present, in their fixed
 * order, then `diff` and `spent`, labels padded so every value starts at
 * column 14. A row's `- ` items and its `→ ` pointer follow it on indented
 * continuation lines.
 *
 * The step's identity is not in here: the Now line above the card carries it,
 * so it renders once. A stop card's range has no Now line, and its `steps`
 * row opens the fence in that place. Empty when no row survived, so the caller
 * can drop the label and the fence together rather than emit an empty
 * instrument.
 */
export function recapLines(rows: Readonly<Partial<Record<RecapRowName, RecapRow>>>, extras: RecapExtras): string[] {
  const body: string[] = []
  if (extras.steps !== undefined) {
    body.push(`${'steps'.padEnd(13)}${extras.steps.evidence}`)
    for (const item of extras.steps.items) {
      body.push(`${RECAP_INDENT}- ${item}`)
    }
  }
  for (const name of RECAP_ROW_NAMES) {
    const row = rows[name]
    if (row === undefined) {
      continue
    }
    const shown = collapseRow(name, row, extras.constraints)
    body.push(`${name.padEnd(13)}${shown.evidence}`)
    for (const item of shown.items ?? []) {
      body.push(`${RECAP_INDENT}- ${item}`)
    }
    if (shown.pointer !== undefined) {
      body.push(`${RECAP_INDENT}→ ${shown.pointer}`)
    }
  }
  if (extras.diff !== null) {
    body.push(`${'diff'.padEnd(13)}${extras.diff}`)
  }
  if (extras.spent !== null) {
    body.push(`${'spent'.padEnd(13)}${extras.spent}`)
  }
  return body
}

// --- The range readout: a landed range measured across its steps for the stop
// card (docs/presentation.md). `handoff --stop` reads each checkpoint's commit
// and hands it in with the ledger, stats.json, and the last check's summary;
// every fact here is already on record, and the model writes only the three
// judgment rows. ---

/** One file a commit changed: its path and its line counts. */
export type CommitFile = { readonly path: string; readonly added: number; readonly removed: number }

/** One step's entry in stats.json: the counters and stamps a range's readout reads. */
export type RangeStepStats = {
  readonly redChecks?: number
  readonly driftWarnings?: number
  readonly reverts?: number
  readonly startedAt?: string
  readonly landedAt?: string
}

/** What a landed range is measured from: the plan, the record, and each checkpoint's commit. */
export type RangeInput = {
  readonly range: BuildRange
  readonly intent: string // the range's steps in build order, and each one's seam
  readonly checkpoints: string // the ledger, naming each step's commit
  readonly stats: Readonly<Record<string, RangeStepStats>> // stats.json, keyed by step number
  readonly commits: Readonly<Record<string, ReadonlyArray<CommitFile>>> // each checkpoint's numstat, keyed by its sha
  readonly between: ReadonlyArray<string> // the first-parent commits across the range's span, plan commits left out
  readonly summary: CheckSummary | null // the last check run, or null when none left a summary
}

/** A stop card's identity row: the count landed, and each step's checkpoint sha on continuation lines. */
export type StepsRow = { readonly evidence: string; readonly items: ReadonlyArray<string> }

/** A landed range, measured: the rows the CLI owns, and the stats its Verdict folds. */
export type RangeMeasure = {
  readonly steps: StepsRow
  readonly rows: Readonly<Partial<Record<RecapRowName, RecapRow>>> // the measured check and seam
  readonly diff: string // the commits summed; at a stop it never vanishes
  readonly spent: string | null
  readonly stats: AccruedStats // summed across the steps, for `foldVerdict(rows, stats, 'range')`
}

/** The short form a sha takes on the `steps` row, a handle for `git show`. */
const SHORT_SHA = 7

/**
 * Measure a landed range for the stop card's readout: its `steps` row, the
 * `check` and `seam` rows the CLI owns, the `diff` and `spent` rows, and the
 * stats the Verdict folds.
 *
 * Each step is held to its own commit and its own seam, never the range's
 * union, so a step that wandered into a neighbor's seam still wandered. A
 * step the ledger holds no commit for reads `no checkpoint` on the `steps` row
 * and adds nothing else. A step landed by hand, with a checkpoint but no
 * `build` entry, adds its commit to every row and no time to `spent`; its
 * counters still count, so a red run its checkpoint's gate refused reads the
 * same on the `spent` row and in the Verdict.
 */
export function measureRange(input: RangeInput): RangeMeasure {
  const held = parseOrderedSteps(input.intent).filter((s) => hasStep(input.range.steps, s.n))
  const shas = stepShas(input.checkpoints)
  const landed = held.flatMap((s) => {
    const sha = shas.get(s.n)
    return sha === undefined ? [] : [{ n: s.n, files: input.commits[sha] ?? [] }]
  })
  const rows: Partial<Record<RecapRowName, RecapRow>> = {}
  if (input.summary !== null) {
    rows.check = summaryCheckRow(input.summary, landed.length)
  }
  const seam = rangeSeamRow(input.intent, landed, held.length)
  if (seam !== null) {
    rows.seam = seam
  }
  const stats = held.map((s) => input.stats[String(s.n)] ?? {})
  const sum = (key: 'redChecks' | 'driftWarnings' | 'reverts'): number => stats.reduce((total, s) => total + (s[key] ?? 0), 0)
  const recorded = ledgerShas(input.checkpoints)
  return {
    steps: stepsRow(held, shas),
    rows,
    diff: rangeDiffValue(landed.flatMap((l) => l.files)),
    spent: rangeSpentValue(stats),
    stats: {
      driftWarnings: sum('driftWarnings'),
      redChecks: sum('redChecks'),
      reverts: sum('reverts'),
      outOfBand: input.between.filter((sha) => !recorded.has(sha)).length,
    },
  }
}

/**
 * The ledger span a range landed across, for the out-of-band count: from the
 * line before the range's first landing to the range's last. Null when no
 * step of the range is on the ledger, or nothing precedes its first landing.
 *
 * The caller asks git for the first-parent commits in `from..to`, plumbbob's
 * plan commits left out, and hands them to `measureRange` as `between`; the
 * ledger's own commits drop out there, so what is left is the range's
 * commits outside the ledger.
 */
export function rangeSpan(checkpoints: string, range: BuildRange): { readonly from: string; readonly to: string } | null {
  const lines = ledgerLines(checkpoints)
  const inRange = (line: LedgerLine): boolean => line.step !== null && hasStep(range.steps, line.step)
  const first = lines.findIndex(inRange)
  const last = lines.findLastIndex(inRange)
  const from = lines[first - 1]?.sha
  const to = lines[last]?.sha
  return first < 1 || from === undefined || to === undefined ? null : { from, to }
}

/** One line of the checkpoints ledger: the step it records, or null for `baseline` and `plan`, and its sha. */
type LedgerLine = { readonly step: number | null; readonly sha: string }

/**
 * The ledger's lines of every kind, in the order they were written.
 */
function ledgerLines(checkpoints: string): LedgerLine[] {
  return checkpoints.split('\n').flatMap((line) => {
    const m = /^(?:baseline|plan|step\s+(\d+))\s+(\S+)/.exec(line.trim())
    return m === null ? [] : [{ step: m[1] === undefined ? null : Number(m[1]), sha: m[2] ?? '' }]
  })
}

/**
 * Each step's checkpoint sha, the last line for a step landed twice (a revert,
 * then a landing again), since that is the commit on the branch now.
 */
export function stepShas(checkpoints: string): Map<number, string> {
  const shas = new Map<number, string>()
  for (const line of ledgerLines(checkpoints)) {
    if (line.step !== null) {
      shas.set(line.step, line.sha)
    }
  }
  return shas
}

/**
 * Every sha the ledger records, of any kind: the commits plumbbob made, so
 * none of them counts as out-of-band.
 */
function ledgerShas(checkpoints: string): Set<string> {
  return new Set(ledgerLines(checkpoints).map((line) => line.sha))
}

/**
 * The `steps` row: how many of the range's steps landed, then each step and
 * its checkpoint sha in build order, packed onto continuation lines by width
 * rather than one per step, since each is a handle and not an item to judge.
 */
function stepsRow(held: ReadonlyArray<Step>, shas: ReadonlyMap<number, string>): StepsRow {
  const done = held.filter((s) => s.done).length
  const handles = held.map((s) => {
    const sha = shas.get(s.n)
    return `${s.n} ${sha === undefined ? 'no checkpoint' : sha.slice(0, SHORT_SHA)}`
  })
  return { evidence: `${done} of ${held.length} landed`, items: packed(handles, RECAP_VALUE_BUDGET - 2) }
}

/**
 * Pack items onto lines joined by ` · `, a new line when the next would
 * overrun `width`.
 */
function packed(items: ReadonlyArray<string>, width: number): string[] {
  const lines: string[] = []
  for (const item of items) {
    const last = lines.at(-1)
    if (last !== undefined && `${last} · ${item}`.length <= width) {
      lines[lines.length - 1] = `${last} · ${item}`
    } else {
      lines.push(item)
    }
  }
  return lines
}

/**
 * The range's `seam` row: each landed step's commit against that step's own
 * seam. Null when no step had both a commit and a seam to measure.
 *
 * Green counts the steps measured out of the range's steps. One strayed step
 * is named in the row with its paths as the evidence, the way a step's pause
 * names them; two or more break onto continuation lines, one per step. It is
 * an advisory, as at a pause: a stray in a landed commit asks the same
 * question of the plan.
 */
function rangeSeamRow(
  intent: string,
  landed: ReadonlyArray<{ readonly n: number; readonly files: ReadonlyArray<CommitFile> }>,
  steps: number,
): RecapRow | null {
  const measured = landed.flatMap(({ n, files }) => {
    const seam = parseStepSeam(intent, n)
    return seam.ok ? [{ n, strays: scopeDrift(files.map((f) => f.path), seam.seam) }] : []
  })
  if (measured.length === 0) {
    return null
  }
  const strayed = measured.filter((m) => m.strays.length > 0)
  const only = strayed[0]
  if (only === undefined) {
    return { verdict: 'true', word: 'held', evidence: `held: ${measured.length} of ${steps} steps, no strays` }
  }
  if (strayed.length === 1) {
    const evidence = `strayed: ${pathCount(only.strays.length)} outside step ${only.n}'s seam`
    const path = only.strays[0]
    return only.strays.length === 1 && path !== undefined
      ? { verdict: 'advisory', word: 'strayed', evidence, pointer: path }
      : { verdict: 'advisory', word: 'strayed', evidence, items: only.strays }
  }
  const total = strayed.reduce((sum, m) => sum + m.strays.length, 0)
  return {
    verdict: 'advisory',
    word: 'strayed',
    evidence: `strayed: ${pathCount(total)} outside ${strayed.length} steps' seams`,
    items: strayed.map((m) => strayedStep(m.n, m.strays)),
  }
}

/** A count of paths: `1 path`, `3 paths`. */
function pathCount(n: number): string {
  return `${n} path${n === 1 ? '' : 's'}`
}

/**
 * One strayed step's continuation line, `step 8: src/x.ts, src/y.ts`, fitted
 * to the line by count rather than cut: the first path and how many others,
 * then the count alone.
 */
function strayedStep(n: number, strays: ReadonlyArray<string>): string {
  const width = RECAP_VALUE_BUDGET - 2
  const whole = `step ${n}: ${strays.join(', ')}`
  if (whole.length <= width) {
    return whole
  }
  const others = strays.length - 1
  const first = `step ${n}: ${strays[0] ?? ''} and ${others} other${others === 1 ? '' : 's'}`
  return first.length <= width ? first : `step ${n}: ${pathCount(strays.length)}`
}

/**
 * The range's `diff` row: the commits summed, a file counted once however
 * many commits touched it, plumbbob's own records left out as at a pause.
 * Information that never folds, and at a stop it never vanishes.
 */
function rangeDiffValue(files: ReadonlyArray<CommitFile>): string {
  const work = files.filter((f) => !isArtifactPath(f.path))
  const counts = { ...countDiff(work), files: new Set(work.map((f) => f.path)).size }
  return diffRowValue(counts, false) ?? '+0 -0 across 0 files'
}

/**
 * The range's `spent` row: from the first step's `startedAt` to the last
 * step's `landedAt`, then the red runs summed across the steps, or `green
 * first run at every landing`, then any drift warnings. Null when nothing is
 * countable.
 *
 * The clock reads only the steps `build` entered, since a step landed by hand
 * has no `startedAt` to count from. No gate clause rides here, because only
 * the last of the range's gate runs is on disk, and no turn count, because the
 * ledger counts a step's turns from the tick that entered it.
 */
function rangeSpentValue(stats: ReadonlyArray<RangeStepStats>): string | null {
  const entered = stats.filter((s) => s.startedAt !== undefined)
  const started = Math.min(...entered.map((s) => Date.parse(s.startedAt ?? '')).filter(Number.isFinite))
  const landed = Math.max(...entered.map((s) => Date.parse(s.landedAt ?? '')).filter(Number.isFinite))
  const elapsed = Number.isFinite(started) && Number.isFinite(landed) ? durationWords(landed - started) : null
  const red = stats.reduce((sum, s) => sum + (s.redChecks ?? 0), 0)
  const drift = stats.reduce((sum, s) => sum + (s.driftWarnings ?? 0), 0)
  const parts: string[] = []
  if (elapsed !== null) {
    parts.push(elapsed)
  }
  if (red > 0) {
    parts.push(`${red} red run${red === 1 ? '' : 's'}`)
  } else if (elapsed !== null) {
    parts.push('green first run at every landing')
  }
  if (drift > 0) {
    parts.push(`${drift} drift warning${drift === 1 ? '' : 's'}`)
  }
  return parts.length === 0 ? null : parts.join(' · ')
}

// --- The detail file's prose: the Summary that opens a decision turn and the
// recommendation that closes it (docs/presentation.md). The model writes both
// into `.plumbbob/detail.md` and handoff renders them, so the whole turn is one
// relayed block and the model authors nothing in the chat. ---

/**
 * A named section's prose from `.plumbbob/detail.md`, unwrapped: the lines
 * inside a paragraph join into one and blank lines keep their paragraph
 * breaks. Null when the section is absent or holds nothing.
 *
 * The turn's prose flows at the renderer's width, so whatever column the
 * detail file happened to be hard-wrapped to never reaches the turn. The
 * headings are matched case-insensitively: a file written the older lowercase
 * way still parses.
 */
function sectionProse(detail: string, heading: RegExp): string | null {
  const lines = detail.split('\n')
  const start = lines.findIndex((l) => heading.test(l.trim()))
  if (start === -1) {
    return null
  }
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  if (end === -1) {
    end = lines.length
  }
  const text = lines
    .slice(start + 1, end)
    .join('\n')
    .trim()
  if (text.length === 0) {
    return null
  }
  return text
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((l) => l.trim())
        .join(' '),
    )
    .join('\n\n')
}

/** One highlight: the handle `expand` binds to, and the title of the `## <n>` section behind it. */
export type Highlight = { readonly n: number; readonly title: string }

/** The turn's opening block, as the model wrote it into `.plumbbob/detail.md`. */
export type Summary = {
  readonly lead: string
  readonly highlights: ReadonlyArray<Highlight>
}

/**
 * The `## Summary` section of `.plumbbob/detail.md` and the numbered detail
 * sections beneath it: the lead prose, then the title of every `## <n>`
 * heading in the order the model wrote them. Null when the file carries no
 * lead, which vanishes the block rather than labeling nothing.
 *
 * The titles pass through as the markdown the model wrote; they are the
 * highlights, and their numbers are the handles `expand` binds to, so each
 * renders under its own number rather than being renumbered by position.
 */
export function parseSummary(detail: string): Summary | null {
  const lead = sectionProse(detail, /^##\s+summary\s*$/i)
  if (lead === null) {
    return null
  }
  const highlights: Highlight[] = []
  for (const line of detail.split('\n')) {
    const m = /^##\s+(\d+)\s+(\S.*?)\s*$/.exec(line)
    if (m !== null) {
      highlights.push({ n: Number(m[1]), title: m[2] ?? '' })
    }
  }
  return { lead, highlights }
}

/**
 * `.plumbbob/detail.md` with a blank line around every heading, and everything
 * else as written.
 *
 * A model copying the detail template can run a heading straight into its body
 * or its predecessor, and markdownlint's MD022 fails that file wherever
 * `.plumbbob/` is linted, which turns a downstream checkpoint red. Heading lines
 * inside a fenced block are content, not headings, so a fence is left whole.
 * Pure and idempotent: text that already has its blank lines comes back byte for
 * byte, so a caller can compare the result to the input to learn whether
 * anything needed fixing.
 */
export function normalizeDetailHeadings(detail: string): string {
  const out: string[] = []
  let fence: { readonly char: string; readonly length: number } | null = null
  let afterHeading = false
  for (const line of detail.split('\n')) {
    if (fence !== null) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1]
      if (close !== undefined && close.startsWith(fence.char) && close.length >= fence.length) {
        fence = null
      }
      out.push(line)
      continue
    }
    const heading = /^ {0,3}#{1,6}(\s|$)/.test(line)
    const prior = out[out.length - 1]
    if ((heading || afterHeading) && line.trim() !== '' && prior !== undefined && prior.trim() !== '') {
      out.push('')
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (open !== undefined) {
      fence = { char: open.charAt(0), length: open.length }
    }
    out.push(line)
    afterHeading = heading
  }
  return out.join('\n')
}

/** One numbered detail section: the handle, its title (the highlight), and the full story beneath it. */
export type DetailSection = { readonly n: number; readonly title: string; readonly body: string }

/**
 * The `## <n>` sections of `.plumbbob/detail.md` with their bodies: the full
 * story behind each highlight, in the order the model wrote them. The body is
 * the section's prose as written, trimmed; empty when the model wrote only the
 * title. The build-log's Log carries these beneath the step's record, so an
 * older step's "expand" reads the ledger rather than a commit.
 */
export function parseSections(detail: string): ReadonlyArray<DetailSection> {
  const lines = detail.split('\n')
  const sections: DetailSection[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+(\d+)\s+(\S.*?)\s*$/.exec(lines[i] ?? '')
    if (m === null) {
      continue
    }
    let end = lines.findIndex((l, j) => j > i && l.startsWith('## '))
    if (end === -1) {
      end = lines.length
    }
    sections.push({
      n: Number(m[1]),
      title: m[2] ?? '',
      body: lines
        .slice(i + 1, end)
        .join('\n')
        .trim(),
    })
  }
  return sections
}

/**
 * The `## Recommendation` section of `.plumbbob/detail.md`: the one or two
 * plain sentences a decision turn ends on, or null when the model wrote none.
 * `handoff` emits it after the card, unfenced; the eye lands on the last text,
 * and the last text should say which move the model would take.
 */
export function parseRecommendation(detail: string): string | null {
  return sectionProse(detail, /^##\s+recommendation\s*$/i)
}

/**
 * The step `.plumbbob/detail.md` was written for, read off its
 * `# Detail · Step <n> · <title>` header, or null when the first line is not a
 * step header (a plan pause's detail, or a file the model wrote without one).
 */
export function parseDetailStep(detail: string): number | null {
  const first = detail.trimStart().split('\n', 1)[0] ?? ''
  const m = /^#\s+Detail\b.*?\bStep\s+(\d+)\b/.exec(first)
  return m === null ? null : Number(m[1])
}

/**
 * Render an Orientation as the plain-text dashboard `status` prints.
 */
export function formatOrientation(o: Orientation): string {
  const doneCount = o.steps.filter((s) => s.done).length
  const nextUndone = o.nextUndone === null ? undefined : o.steps.find((s) => s.n === o.nextUndone)
  // One arrow, always: an explicitly requested step takes the marker and the
  // detail rows, so the injected state never argues with the invocation. With
  // no (valid) request the next undone step in build order keeps them, as ever.
  const requestedStep = o.requested === null ? undefined : o.steps.find((s) => s.n === o.requested)
  const marked = requestedStep ?? nextUndone
  const stepLines = o.steps.map((s) => {
    const marker = s.done ? '✓' : s === marked ? '▸' : ' '
    const tail = s === marked ? (requestedStep === undefined ? '   ← next' : '   ← requested') : ''
    const head = `  ${marker} ${s.n}  ${s.title}${tail}`
    if (s !== marked) {
      return head
    }
    // Surface the target step's detail so the human can review it (and `/plumbbob:step`-
    // revise) before building. Only what's present: a rough step shows neither.
    const detail: string[] = []
    if (o.nextDoneWhen !== null) {
      detail.push(`        done when: ${o.nextDoneWhen}`)
    }
    if (o.nextSeam.length > 0) {
      detail.push(`        seam: ${o.nextSeam.join(', ')}`)
    }
    if (o.nextModel !== null) {
      detail.push(`        model: ${o.nextModel}`)
    }
    return detail.length > 0 ? [head, ...detail].join('\n') : head
  })
  const stepsBlock =
    o.steps.length === 0 ? '  (no steps planned yet)' : `  steps  ${doneCount}/${o.steps.length} done\n${stepLines.join('\n')}`
  const rangesBlock = o.ranges === null ? [] : [formatRanges(o.ranges), '']

  const cp = o.lastCheckpoint
  const cpLine = cp === null ? 'last checkpoint  none yet' : `last checkpoint  step ${cp.n} · ${cp.sha.slice(0, 7)}`

  // A neutral reconciliation note, only when there is something to reconcile:
  // commits landed since the last checkpoint that plumbbob's ledger didn't
  // record. A commit a plumbbob verb makes starts the range, and a hand-made
  // plan commit drops out on its `plumbbob plan` body marker, so the count is
  // the same one `handoff` folds into its Verdict. Informational: the human
  // commits freely, so this never gates.
  const receipts =
    o.outOfBand > 0
      ? [`${o.outOfBand} commit${o.outOfBand === 1 ? '' : 's'} since the last checkpoint landed outside plumbbob's ledger.`]
      : []

  // The build order, whole, only when it departs from the numbering: the
  // dashboard is the reference surface, so nothing is folded to a count here.
  const orderRow = o.buildOrder.length > 0 ? [`build order  ${o.buildOrder.join(', ')}`] : []

  return [
    `PlumbBob — ${o.title ?? '(untitled)'}   [${o.phase}]`,
    '',
    stepsBlock,
    '',
    ...rangesBlock,
    cpLine,
    ...receipts,
    ...orderRow,
    `${parkedPhrase({ open: o.parked, total: o.parkedTotal })} · open questions ${o.openQuestions}`,
    '',
    `next → ${o.next}`,
  ].join('\n')
}

/**
 * The dashboard's ranges block, in the step list's own grammar: a count, then a
 * row per range with its command as the plan wrote it and its model, `✓` for
 * a range landed and `▸` with the `← next` tail for the one holding the next
 * step. An undone range carries its stop beneath it, since the stops ahead are
 * what the human steers by, and a landed one folds to its row. A range's drift
 * rides beneath it, and the plan's own rows close the block.
 */
function formatRanges(view: RangesView): string {
  const landed = view.rows.filter((r) => r.landed).length
  const rows = view.rows.flatMap((r) => {
    const marker = r.landed ? '✓' : r.next ? '▸' : ' '
    const model = r.range.model === null ? '' : ` · ${r.range.model}`
    const head = `  ${marker} ${r.range.item}  ${r.range.command}${model}${r.next ? '   ← next' : ''}`
    const stop = r.landed ? [] : [`        stop: ${r.range.stop}`]
    return [head, ...stop, ...r.drift.map((words) => `        ⚠ needs a re-cut: ${words}`)]
  })
  return [`  ranges  ${landed} of ${view.count} done`, ...rows, ...view.plan.map((words) => `  ⚠ ${words}`)].join('\n')
}
