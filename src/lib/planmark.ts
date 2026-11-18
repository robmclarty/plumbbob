// The plan mark's readers and writers: whether intent.md still reads as the
// plan the CLI last knew to be sanctioned, and what changed when it does not.
// Nothing here blocks an edit. The plan stays a file anyone can change; what
// this module adds is that a change made with nobody present is counted,
// shown at the step's pause, and never carried past the person by a grant.
//
// The mark itself (a snapshot of intent.md under the TURN it was taken in and
// the step whose entry settled it) lives in the sidecar. This module decides
// when it moves: the CLI's own writes move it, a landing moves it after the
// tick, and the human's typed prompt moves it while no step's edit is waiting
// to be shown, since the plan as it stands when a person types is the plan
// they are typing over. A step's entry never accepts a changed plan on a host
// that counts turns: whatever changed after the last prompt rides into the
// step and is shown at its pause. An edit lands only once it stood, whole, at
// a typed prompt; until then the checkpoint stops for it, grant or not.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { clearBase, intentPath, type PlanMark, readBase, readMark, readTurn, stepPath, writeBase, writeMark } from './sidecar.ts'

/**
 * A plan edit, measured against the mark: the lines added and removed, and
 * the change itself as the body of a unified diff.
 */
export type PlanEdit = {
  readonly added: number
  readonly removed: number
  readonly lines: ReadonlyArray<string>
}

// The unchanged lines a hunk keeps on either side of a change.
const CONTEXT = 3

// Past this many cells the table that aligns the two texts is not built, and
// the changed stretch reads as removed whole and added whole.
const ALIGN_LIMIT = 4_000_000

/**
 * intent.md's text, or null when the file cannot be read.
 */
function readIntent(root: string, slug?: string | null): string | null {
  try {
    return readFileSync(intentPath(root, slug), 'utf8')
  } catch {
    return null
  }
}

/**
 * Whether a human turn has happened since the mark was taken.
 *
 * A host with no turn hook keeps no count, so there is nothing to tell a
 * person's edit from a model's by, and the answer is yes: the mark stays out
 * of the way there, as the checkpoint latch does.
 */
function humanSince(root: string, mark: PlanMark): boolean {
  const turn = readTurn(root)
  return turn === null || mark.turn === null || turn > mark.turn
}

/**
 * The step in flight, or null when the STEP marker is absent or garbled.
 */
function inFlight(root: string, slug?: string | null): number | null {
  try {
    const raw = readFileSync(stepPath(root, slug), 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}

/**
 * A short hash of a plan's text: what the mark and the pause stamp keep of a
 * plan they need to recognize again without holding a second copy.
 */
function planHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/**
 * Take the mark: intent.md as it stands is the plan as sanctioned.
 *
 * Called when a build starts, when its plan first lands, and after a step's
 * tick. A plan that cannot be read marks nothing.
 */
export function markPlan(root: string, slug?: string | null): void {
  const intent = readIntent(root, slug)
  if (intent !== null) {
    writeMark(root, slug, { turn: readTurn(root), step: null, text: intent })
  }
}

/**
 * Move the mark across one of the CLI's own writes to intent.md, given the
 * text the write started from.
 *
 * The CLI's write is never an edit, so the mark follows it, keeping the turn
 * and the step it was settled under. It follows only when the plan matched
 * the mark before the write: an edit already waiting to be shown stays
 * measured against the older mark, and the write is then shown with it. A
 * waiting edit the human has already typed over stays typed over: the CLI's
 * write on top of it is not a new edit to stop for. A build with no mark
 * stays without one until its next entry.
 */
export function remarkPlan(root: string, slug: string | null | undefined, before: string): void {
  const mark = readMark(root, slug)
  const intent = readIntent(root, slug)
  if (intent !== null && intent !== before) {
    noteRunWrite(root, slug)
  }
  if (mark === null || intent === null) {
    return
  }
  if (mark.text === before) {
    writeMark(root, slug, { turn: mark.turn, step: mark.step, text: intent })
  } else if (mark.seen === planHash(before)) {
    writeMark(root, slug, { ...mark, seen: planHash(intent) })
  }
}

/**
 * Settle the mark at the human's typed prompt, which the turn hook calls
 * after it has counted the turn.
 *
 * Whatever the plan says when a person types is the plan they are typing
 * over: their own edit, a refine they approved last turn, a fold. With no
 * step's edit waiting to be shown, the mark is taken again and nothing is
 * reported. Two cases keep the snapshot. A step in flight is at its pause,
 * and an edit it carries is the card's to show and the Log's to keep. A mark
 * a step's entry settled, whose plan has changed since and never landed (an
 * abandoned step, a refused landing), still holds an edit no pause has
 * shown, so it rides into the next entry. In both the mark only notes the
 * plan the person typed over, which is what lets that edit, and no later
 * one, land. A build with no mark stays without one until its next entry.
 */
export function settlePlan(root: string, slug?: string | null): void {
  const mark = readMark(root, slug)
  const intent = readIntent(root, slug)
  if (mark === null || intent === null) {
    return
  }
  const flying = inFlight(root, slug)
  if (intent === mark.text) {
    writeMark(root, slug, { turn: readTurn(root), step: flying === null ? null : mark.step, text: intent })
  } else if (flying === null && mark.step === null) {
    writeMark(root, slug, { turn: readTurn(root), step: null, text: intent })
  } else {
    writeMark(root, slug, { ...mark, seen: planHash(intent) })
  }
}

/**
 * Settle the mark as `step` is entered.
 *
 * On a host that counts turns the entry accepts only the plan the mark
 * already holds. The human's prompt is what accepts a changed plan, so a
 * plan that differs here was changed after they last typed, by a model
 * between two steps of a run or ahead of the first: the snapshot stays as it
 * is, and the edit rides into this step to be shown at its pause. Either way
 * the mark now names the step, so every later difference is this step's to
 * show. A host with no turn hook has no prompt to accept anything at, so an
 * entry there takes the plan as it stands, and so does an entry over a mark
 * taken before the host counted turns, which no prompt has had the chance to
 * settle. A build with no mark gains one here and reports nothing.
 */
export function enterPlan(root: string, slug: string | null | undefined, step: number): void {
  dropShownBase(root, slug)
  const intent = readIntent(root, slug)
  if (intent === null) {
    return
  }
  const mark = readMark(root, slug)
  const turn = readTurn(root)
  if (mark === null || mark.text === intent || turn === null || mark.turn === null) {
    writeMark(root, slug, { turn, step, text: intent })
  } else {
    writeMark(root, slug, { ...mark, step })
  }
}

/**
 * The plan edit a step's pause has to show, or null when there is none.
 *
 * Once a step's entry has settled the mark, any difference from it counts
 * until that step lands: the plan was edited during the step, or the edit was
 * carried into it, and abandoning the step does not make it go away. With no
 * entry settled (a start, a plan commit, a landing, or a prompt took the
 * mark) a difference counts only when no human turn has happened since, the
 * edit a model made after the person last typed. No mark, or a plan that
 * cannot be read, is nothing to show.
 */
export function planEdit(root: string, slug?: string | null): PlanEdit | null {
  const mark = readMark(root, slug)
  const intent = readIntent(root, slug)
  if (mark === null || intent === null || intent === mark.text) {
    return null
  }
  if (mark.step === null && humanSince(root, mark)) {
    return null
  }
  return diffLines(mark.text, intent)
}

/**
 * Whether the plan holds an edit the human has not typed over: it differs
 * from the mark, and it is not the plan that stood at their last typed
 * prompt.
 *
 * This is what a checkpoint stops for. An approval, and a grant, cover the
 * plan as it stood when the person typed, so an edit made after that waits
 * for their next prompt whatever the grant, the entry stamp, or the step's
 * route here says. A human at the keyboard is their own approval, and a host
 * with no turn hook has no prompt to measure from, so neither stops.
 */
export function planEditUnseen(root: string, slug?: string | null): boolean {
  if (process.stdin.isTTY === true || readTurn(root) === null) {
    return false
  }
  const mark = readMark(root, slug)
  const intent = readIntent(root, slug)
  if (mark === null || intent === null || intent === mark.text) {
    return false
  }
  return mark.seen !== planHash(intent)
}

/**
 * The hash of the plan a pause card is showing as edited, or null when the
 * card shows no plan edit. The pause stamp keeps it, so a later handoff can
 * tell the edit the card showed from one made since.
 */
export function shownPlan(root: string, slug?: string | null): string | null {
  const intent = readIntent(root, slug)
  return intent === null || planEdit(root, slug) === null ? null : planHash(intent)
}

/**
 * Take, keep or settle the run's plan base at a typed prompt, which the turn
 * hook calls after it has counted the turn and minted the grant.
 *
 * A prompt whose grant carries `--plan-edits` takes the base: the plan as it
 * stands is what the run's edits will be measured against, and the base
 * under this turn is the allowance. A base whose edits no card has shown yet
 * is kept and only moved to this turn, so two flagged runs back to back are
 * listed together. Any other prompt ends the allowance. A base that never
 * noted an edit is dropped there; one that did is frozen, the plan as it
 * stands kept beside the snapshot, so nothing changed later is read as the
 * run's, and dropped when the run's edits came to nothing. A base a card has
 * shown is left for that card's reprint and dropped when the build moves on.
 */
export function basePlan(root: string, slug: string | null | undefined, allowed: boolean): void {
  const turn = readTurn(root)
  const intent = readIntent(root, slug)
  const base = readBase(root, slug)
  const waiting = base !== null && !base.shown && (base.steps.length > 0 || base.cli)
  if (allowed && turn !== null && intent !== null) {
    if (base !== null && waiting) {
      writeBase(root, slug, { turn, steps: base.steps, cli: base.cli, shown: false, text: base.text })
    } else {
      writeBase(root, slug, { turn, steps: [], cli: false, shown: false, text: intent })
    }
    return
  }
  if (base === null || base.shown) {
    return
  }
  if (!waiting || intent === null || unticked(base.text) === unticked(base.after ?? intent)) {
    clearBase(root, slug)
  } else if (base.after === undefined) {
    writeBase(root, slug, { ...base, after: intent })
  }
}

/**
 * Drop a base a card has already shown, as the build moves on: a step's
 * entry and a recorded stop call it. Until then the card that showed the
 * run's edits can still be reprinted whole.
 */
export function dropShownBase(root: string, slug?: string | null): void {
  const base = readBase(root, slug)
  if (base !== null && base.shown && base.turn !== readTurn(root)) {
    clearBase(root, slug)
  }
}

/**
 * Whether the grant standing this turn allows plan edits: a base taken in
 * this very turn. The grant is one turn long, and so is the allowance.
 */
export function planEditsAllowed(root: string, slug?: string | null): boolean {
  const base = readBase(root, slug)
  return base !== null && base.after === undefined && base.turn === readTurn(root)
}

/**
 * What an allowed plan edit may still not touch, or null when the edit
 * touches none of it: the plan's Decisions, its Constraints, and any step
 * that has already landed.
 *
 * A grant that allows plan edits lets the build sharpen what is still ahead
 * of it. The Decisions and Constraints are what the range was approved
 * against, and a landed step is the record of what was built, so a change to
 * either still waits for the person. Each is read the way the CLI's own
 * readers read it, the first heading of its name and the first block of a
 * step's number, and a second heading of the name or a second opener of a
 * landed number holds too, since either would put other text in front of
 * those readers while the original stood untouched behind it.
 */
export function heldPlanEdit(root: string, slug?: string | null): 'a Decision' | 'a Constraint' | 'a landed step' | null {
  const mark = readMark(root, slug)
  const intent = readIntent(root, slug)
  if (mark === null || intent === null) {
    return null
  }
  if (sectionChanged(mark.text, intent, 'Decisions')) return 'a Decision'
  if (sectionChanged(mark.text, intent, 'Constraints')) return 'a Constraint'
  if (headings(mark.text, 'Steps') !== headings(intent, 'Steps')) return 'a landed step'
  const before = stepBlocks(mark.text)
  const after = stepBlocks(intent)
  for (const [n, was] of before) {
    if (!was.landed) continue
    const now = after.get(n)
    if (now === undefined || !now.landed || now.block !== was.block || now.openers !== was.openers) return 'a landed step'
  }
  return null
}

/**
 * Note that `step` landed a plan edit under the run's allowance, so the next
 * card can name it.
 */
export function noteRunEdit(root: string, slug: string | null | undefined, step: number): void {
  const base = readBase(root, slug)
  if (base !== null && !base.steps.includes(step)) {
    writeBase(root, slug, { ...base, steps: [...base.steps, step] })
  }
}

/**
 * Note that one of the CLI's own verbs, `order` or `defer`, wrote the plan
 * while a run's allowance stood: the write is no step's edit, and it is
 * still part of what the run did to the plan, so the next card says so.
 */
function noteRunWrite(root: string, slug?: string | null): void {
  const base = readBase(root, slug)
  if (base !== null && !base.cli && base.after === undefined && base.turn === readTurn(root)) {
    writeBase(root, slug, { ...base, cli: true })
  }
}

/**
 * What a run did to the plan: the steps that edited it, whether the CLI's
 * own `order` or `defer` wrote it too, and one diff against the plan as the
 * grant found it.
 */
export type RunEdits = { readonly steps: ReadonlyArray<number>; readonly cli: boolean; readonly edit: PlanEdit }

/**
 * The plan edits a run landed under its allowance, for the next card to
 * list, or null when it landed none.
 *
 * The diff is the plan as the run left it against the plan as it stood when
 * the grant was typed, with every step's box read as unticked on both sides:
 * a tick is the CLI's own write, never an edit. While the allowance stands
 * the plan as the run left it is the plan now; once it has ended it is the
 * plan frozen at that prompt, so a later edit is never listed as the run's.
 */
export function runEdits(root: string, slug?: string | null): RunEdits | null {
  const base = readBase(root, slug)
  const now = base?.after ?? readIntent(root, slug)
  if (base === null || now === null || (base.steps.length === 0 && !base.cli)) {
    return null
  }
  const edit = diffLines(unticked(base.text), unticked(now))
  return edit.lines.length === 0 ? null : { steps: base.steps, cli: base.cli, edit }
}

/**
 * Record that a card has shown the run's edits, so the base is dropped once
 * the build moves on and a reprint of that card still carries them.
 */
export function shownRunEdits(root: string, slug?: string | null): void {
  const base = readBase(root, slug)
  if (base !== null && !base.shown) {
    writeBase(root, slug, { ...base, shown: true })
  }
}

// A step's opener in the plan, in the plan parser's own grammar: its number,
// then its box, with any run of whitespace around it.
const STEP_OPENER = /^(\d+)\.(\s+)\[([ xX])\](\s+)/

/**
 * A plan's text with every step's box unticked.
 */
function unticked(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(STEP_OPENER, '$1.$2[ ]$4'))
    .join('\n')
}

/**
 * How many lines of a plan read as the `## <name>` heading, wherever they
 * sit: inside a fence or a comment as well, since the CLI's readers take the
 * first such line whatever surrounds it.
 */
function headings(text: string, name: string): number {
  return text.split('\n').filter((line) => line.trim() === `## ${name}`).length
}

/**
 * The lines of a plan's `## <name>` section as the CLI's readers take it:
 * from the first line that reads as the heading to the next line that opens
 * a second-level heading. Empty when the plan has no such heading.
 */
function section(text: string, name: string): ReadonlyArray<string> {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.trim() === `## ${name}`)
  if (start === -1) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  return [lines[start] ?? '', ...(end === -1 ? rest : rest.slice(0, end))]
}

/**
 * Whether a section the allowance never reaches reads differently now: its
 * lines changed, or the plan gained or lost a heading of its name.
 */
function sectionChanged(before: string, after: string, name: string): boolean {
  return headings(before, name) !== headings(after, name) || section(before, name).join('\n') !== section(after, name).join('\n')
}

/** A step as the held check reads it: whether its box is ticked, its lines with the box read as unticked, and how many openers carry its number. */
type StepBlock = { readonly landed: boolean; readonly block: string; readonly openers: number }

/**
 * Every step of the plan's `## Steps` section by number, the first block of
 * a number standing for it as it does for the CLI's readers, with a count of
 * the openers that carry the number.
 */
function stepBlocks(text: string): Map<number, StepBlock> {
  const found: Array<{ n: number; landed: boolean; lines: string[] }> = []
  for (const line of section(text, 'Steps').slice(1)) {
    const opener = STEP_OPENER.exec(line)
    if (opener !== null) {
      found.push({ n: Number(opener[1]), landed: opener[3] !== ' ', lines: [line.replace(STEP_OPENER, '$1.$2[ ]$4')] })
    } else {
      found.at(-1)?.lines.push(line)
    }
  }
  const blocks = new Map<number, StepBlock>()
  for (const step of found) {
    const first = blocks.get(step.n)
    if (first === undefined) {
      blocks.set(step.n, { landed: step.landed, block: step.lines.join('\n').trimEnd(), openers: 1 })
    } else {
      blocks.set(step.n, { ...first, openers: first.openers + 1 })
    }
  }
  return blocks
}

/** One line of an aligned pair of texts: kept, removed from the first, or added by the second. */
type Op = { readonly kind: ' ' | '-' | '+'; readonly text: string }

/**
 * Compare two texts line by line: the counts, and the body of a unified diff
 * with three lines of context around each change.
 *
 * Bytes are bytes: a line that differs only in its whitespace is a changed
 * line, and a trailing newline gained or lost is one line added or removed.
 */
export function diffLines(before: string, after: string): PlanEdit {
  const ops = align(before.split('\n'), after.split('\n'))
  return {
    added: ops.filter((op) => op.kind === '+').length,
    removed: ops.filter((op) => op.kind === '-').length,
    lines: hunks(ops),
  }
}

/**
 * Align two lists of lines into one run of kept, removed and added lines.
 *
 * The shared head and tail are set aside first, since a plan edit is almost
 * always a small change in a long file, and the stretch between them is
 * aligned on its longest common subsequence.
 */
function align(a: ReadonlyArray<string>, b: ReadonlyArray<string>): Op[] {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) {
    head++
  }
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
    tail++
  }
  const kept = (lines: ReadonlyArray<string>): Op[] => lines.map((text) => ({ kind: ' ' as const, text }))
  return [...kept(a.slice(0, head)), ...alignMiddle(a.slice(head, a.length - tail), b.slice(head, b.length - tail)), ...kept(a.slice(a.length - tail))]
}

/**
 * Align the stretch that differs. Removals come before additions where the
 * two could go either way, which is the order a diff is read in.
 */
function alignMiddle(a: ReadonlyArray<string>, b: ReadonlyArray<string>): Op[] {
  const removed = (lines: ReadonlyArray<string>): Op[] => lines.map((text) => ({ kind: '-' as const, text }))
  const added = (lines: ReadonlyArray<string>): Op[] => lines.map((text) => ({ kind: '+' as const, text }))
  if (a.length === 0 || b.length === 0 || a.length * b.length > ALIGN_LIMIT) {
    return [...removed(a), ...added(b)]
  }
  // lengths[i][j] is the longest common subsequence of a from i and b from j.
  const width = b.length + 1
  const lengths = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const down = lengths[(i + 1) * width + j] ?? 0
      const right = lengths[i * width + j + 1] ?? 0
      lengths[i * width + j] = a[i] === b[j] ? (lengths[(i + 1) * width + j + 1] ?? 0) + 1 : Math.max(down, right)
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: ' ', text: a[i] ?? '' })
      i++
      j++
    } else if ((lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0)) {
      ops.push({ kind: '-', text: a[i] ?? '' })
      i++
    } else {
      ops.push({ kind: '+', text: b[j] ?? '' })
      j++
    }
  }
  return [...ops, ...removed(a.slice(i)), ...added(b.slice(j))]
}

/**
 * The aligned lines as unified-diff hunks: each change with its context, a
 * `@@ -start,count +start,count @@` line above each hunk, and two changes
 * whose contexts meet folded into one hunk.
 */
function hunks(ops: ReadonlyArray<Op>): string[] {
  const changed = ops.flatMap((op, at) => (op.kind === ' ' ? [] : [at]))
  const spans: Array<{ from: number; to: number }> = []
  for (const at of changed) {
    const from = Math.max(0, at - CONTEXT)
    const to = Math.min(ops.length, at + CONTEXT + 1)
    const last = spans.at(-1)
    if (last !== undefined && from <= last.to) {
      last.to = to
    } else {
      spans.push({ from, to })
    }
  }
  const out: string[] = []
  for (const span of spans) {
    const before = ops.slice(0, span.from)
    const body = ops.slice(span.from, span.to)
    const left = body.filter((op) => op.kind !== '+').length
    const right = body.filter((op) => op.kind !== '-').length
    const leftStart = before.filter((op) => op.kind !== '+').length + (left === 0 ? 0 : 1)
    const rightStart = before.filter((op) => op.kind !== '-').length + (right === 0 ? 0 : 1)
    out.push(`@@ -${leftStart},${left} +${rightStart},${right} @@`, ...body.map((op) => `${op.kind}${op.text}`))
  }
  return out
}
