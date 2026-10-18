// The orientation model behind `status`: parse a live build session into the
// where-am-I dashboard: title, phase, step list, last checkpoint, counts, and
// one suggested next move. Pure and best-effort by design: it takes raw file
// contents (no fs), and a malformed document degrades to fewer fields rather
// than throwing.

import { parseStepSeam, scopeDrift } from './intent.ts'
import { formatStepList, hasStep, normalizeStepList, readBuildArgs, type Span, type StepList } from './steplist.ts'

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

// A build-order line: step numbers and commas, nothing else. A trailing comma
// is tolerated, since a hand edit leaves one behind.
const BUILD_ORDER_LINE = /^\d+(?:\s*,\s*\d+)*\s*,?$/

/**
 * The build order declared under `## Build order`: the step numbers on the
 * first line that is nothing but numbers and commas, in the sequence written.
 *
 * The line is the plan's own statement of what to build next once the
 * numbering stops carrying it (a refined plan appends a step 7 that has to
 * land before step 5), and `plumbbob order` is the verb that writes it. The
 * template's guidance, a comment, and an absent section all read as `[]`,
 * which every picker takes to mean document order. Numbers come back
 * verbatim, repeats and unknowns included: `orderSteps` does the cleaning, and
 * `recover` wants the raw read to say which number the plan lacks.
 */
export function parseBuildOrder(intent: string): number[] {
  const line = sectionLines(intent, '## Build order')
    .lines.map((l) => l.trim())
    .find((l) => BUILD_ORDER_LINE.test(l))
  if (line === undefined) {
    return []
  }
  return line
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map(Number)
}

/**
 * The steps in build order: the numbers `order` lists first, in that sequence,
 * then every step it leaves out, in document order.
 *
 * A listed number takes the first step in document order that carries it, and
 * a repeat of the number is ignored, so a doubled entry cannot double a step; a
 * number no step carries is dropped. An empty order is the identity, which is
 * what a plan with no `## Build order` section reads as. The steps themselves
 * never change, only the sequence, so `n`, `line`, and `done` stay what
 * `parseSteps` read.
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
  return [...ordered, ...steps.filter((s) => !taken.has(s))]
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
 * The build order as a phrase: the next `cap` step numbers in sequence, the
 * rest folded to a count (`and 2 more`), the way a long detail degrades on
 * every one-liner; '' for an empty order. With no cap, the whole sequence,
 * which is the dashboard's row.
 */
export function buildOrderPhrase(order: ReadonlyArray<number>, cap?: number): string {
  if (order.length === 0) {
    return ''
  }
  const shown = cap === undefined ? order : order.slice(0, cap)
  const rest = order.length - shown.length
  return `build order ${shown.join(', ')}${rest > 0 ? ` (and ${rest} more)` : ''}`
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
  const landed = ordered[at]?.done === true && ordered.every((s) => s.done || !hasStep(holding.steps, s.n))
  return {
    count,
    holding,
    command: flag === null && left.length > 0 ? `/plumbbob:build ${leftExpression(holding, left)}` : null,
    flag,
    completed: landed ? holding : null,
    drift,
  }
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
 * between two of its own, where a run of the range halts.
 *
 * An outside step ahead of the range's first step builds first and cuts
 * nothing, and the card names its range before this one.
 */
function insideDrift(range: BuildRange, ordered: ReadonlyArray<Step>): RangeDrift[] {
  const first = ordered.findIndex((s) => hasStep(range.steps, s.n))
  const last = ordered.findLastIndex((s) => hasStep(range.steps, s.n))
  const inside = first === -1 ? [] : ordered.slice(first + 1, last).filter((s) => !s.done && !hasStep(range.steps, s.n))
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
  return {
    title: parseTitle(input.intent),
    phase,
    steps,
    lastCheckpoint: parseLastCheckpoint(input.checkpoints),
    parked: parks.open,
    parkedTotal: parks.total,
    openQuestions: parseOpenQuestions(input.intent),
    next: nextMove(input.spiking, ordered, input.inFlight, parks.open, requested),
    nextUndone: nextUndone?.n ?? null,
    buildOrder: remainingOrder(steps, order, null),
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

/** The recap the model writes into `.plumbbob/detail.md` before a pause. */
export type Recap = {
  readonly step: number
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
 * A row absent from the block is simply missing from `rows`: a vanished row
 * the fold treats exactly like one that never applied, never like a failure.
 * An indented `- ` or `→ ` line attaches to the row above it, which is how a
 * row carrying two or more items, or a pointer at its evidence, survives the
 * round trip through the file.
 */
export function parseRecap(detail: string): Recap | null {
  const lines = detail.split('\n')
  const headerIdx = lines.findIndex((l) => /^──\s*recap\s*·\s*step\s+\d+\s+of\s+\d+\s*──$/.test(l.trim()))
  if (headerIdx === -1) {
    return null
  }
  const header = /step\s+(\d+)\s+of\s+(\d+)/.exec(lines[headerIdx] ?? '')
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
  return { step: Number(header[1]), total: Number(header[2]), rows, diff }
}

/** One rung of the circle ladder (docs/presentation.md's state table): its glyph and its state word. */
export type Ladder = { readonly glyph: string; readonly state: string }

const PLUMB: Ladder = { glyph: '●', state: 'Plumb' }
const A_HAIR_OFF: Ladder = { glyph: '◐', state: 'A hair off' }
const OUT_OF_PLUMB: Ladder = { glyph: '○', state: 'Out of plumb' }
const NOT_STANDING: Ladder = { glyph: '✗', state: 'Not standing' }

/** The Verdict's computed result: the ladder rung, and the worst component named (null when nothing is off). */
export type VerdictFold = { readonly ladder: Ladder; readonly worst: string | null }

/** A step's accrued stats, the advisory inputs to the fold's third rung. */
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
 */
export function foldVerdict(rows: Readonly<Partial<Record<RecapRowName, RecapRow>>>, stats: AccruedStats): VerdictFold {
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
    return { ladder: A_HAIR_OFF, worst: `${stats.reverts} revert${stats.reverts === 1 ? '' : 's'} on this step` }
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
 */
export function summaryCheckRow(summary: CheckSummary): RecapRow {
  const ran = summary.checks.filter((c) => c.skipped !== true)
  const skipped = summary.checks.filter((c) => c.skipped === true).map((c) => c.name)
  const named = skipped.length === 0 ? '' : ` · without ${skipped.join(', ')}`
  const counted = skipped.length === 0 ? '' : ` · without ${skipped.length} others`
  const fit = (long: string, short: string): string => (long.length <= RECAP_VALUE_BUDGET ? long : short)
  if (summary.ok) {
    const size = `${ran.length} of ${summary.checks.length} checks`
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
  const ms = (Number.isFinite(landed) ? landed : input.now) - started
  if (ms < 0) {
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
 * The step's identity is not in here: the `**Readout**:` label above the fence
 * carries it, so it renders once. Empty when no row survived, so the caller can
 * drop the label and the fence together rather than emit an empty instrument.
 */
export function recapLines(rows: Readonly<Partial<Record<RecapRowName, RecapRow>>>, extras: RecapExtras): string[] {
  const body: string[] = []
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
    cpLine,
    ...receipts,
    ...orderRow,
    `${parkedPhrase({ open: o.parked, total: o.parkedTotal })} · open questions ${o.openQuestions}`,
    '',
    `next → ${o.next}`,
  ].join('\n')
}
