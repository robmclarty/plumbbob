// Orientation model for `status` (D8/D15): parse a live session into the
// dashboard the human reads to know where they are and what to do next. Pure and
// best-effort — it takes raw file contents (no fs), and a malformed doc degrades
// to fewer fields rather than throwing. Functional/procedural, no classes, no
// default export (C1).

import { parseStepSeam } from './intent.ts'

export type Step = {
  readonly n: number
  readonly done: boolean
  readonly title: string
  readonly planned: boolean // carries a `done when:` criterion
  readonly doneWhen: string | null // the criterion text, for the dashboard
  readonly model: string | null // the advisory `- model:` recommendation, verbatim (D62)
}

export type Checkpoint = { readonly n: number; readonly sha: string }

export type Orientation = {
  readonly title: string | null
  // The phase word shown in the dashboard — derived, not stored: SPIKE when a
  // spike is open, BUILD when a step is in flight, else DESIGN.
  readonly phase: string
  readonly steps: ReadonlyArray<Step>
  readonly lastCheckpoint: Checkpoint | null
  readonly parked: number
  readonly openQuestions: number
  readonly next: string
  // The next undone step's detail, so `status` shows what's about to be built and
  // the human can review (and `/pb-step`-revise) before `/pb-build`.
  readonly nextDoneWhen: string | null
  readonly nextSeam: ReadonlyArray<string>
  // The next step's advisory model recommendation (D62) — orientation for the
  // human choosing where to spend attention and tokens, never a gate.
  readonly nextModel: string | null
  // Commits on HEAD since the last checkpoint that landed outside plumbbob's ledger
  // (D66): surfaced as one neutral reconciliation line, never blocked — the human
  // commits freely (repo D3/C5). 0 renders nothing.
  readonly outOfBand: number
}

export type OrientInput = {
  readonly intent: string
  readonly buildLog: string
  readonly checkpoints: string
  // The in-flight step number from the STEP file (null when none) — this is what
  // makes the phase "BUILD". `spiking` is the SPIKE marker's presence.
  readonly inFlight: number | null
  readonly spiking: boolean
  // The out-of-band commit count (D66): commits since the last checkpoint's SHA,
  // which only `status` can measure (it needs git) — orient stays pure/fs-free, so
  // the caller computes it and passes it in. 0 when there is no checkpoint to
  // reconcile against, or the tree is clean at the last checkpoint.
  readonly outOfBand: number
}

// The lines of a named `## Section`, from its heading to the next `## ` (or EOF).
function sectionLines(content: string, heading: string): string[] {
  const lines = content.split('\n')
  const start = lines.findIndex((l) => l.trim() === heading)
  if (start === -1) {
    return []
  }
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  if (end === -1) {
    end = lines.length
  }
  return lines.slice(start + 1, end)
}

export function parseTitle(intent: string): string | null {
  for (const line of intent.split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line)
    if (m) {
      return m[1] ?? null
    }
  }
  return null
}

// Steps under `## Steps`: `N. [ |x] Title — **done when:** ...`. The title is the
// text up to the first em dash; `planned` is true when the step's block carries a
// `done when` criterion. Roadmap prose lives in its own section, never here (D6).
export function parseSteps(intent: string): Step[] {
  const lines = sectionLines(intent, '## Steps')
  const starts: Array<{ readonly n: number; readonly done: boolean; readonly title: string; readonly idx: number }> = []
  lines.forEach((line, idx) => {
    const m = /^(\d+)\.\s+\[([ xX])\]\s+(.*)$/.exec(line)
    if (m) {
      const rest = m[3] ?? ''
      starts.push({
        n: Number(m[1]),
        done: (m[2] ?? ' ').toLowerCase() === 'x',
        title: (rest.split('—')[0] ?? rest).trim(),
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
    return { n: s.n, done: s.done, title: s.title, planned: /done when/i.test(block), doneWhen, model }
  })
}

// Flip step N's `[ ]` checkbox to `[x]` within the `## Steps` section — mechanical
// bookkeeping for `checkpoint` so `status` reflects a checkpointed step. A no-op if
// the step is absent or already done.
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

// Open questions still open: `- Q\d+:` lines that do not say "resolved".
export function parseOpenQuestions(intent: string): number {
  return sectionLines(intent, '## Open questions').filter((l) => /^- Q\d+:/.test(l.trim()) && !/resolved/i.test(l))
    .length
}

// Open parked items: `- [ ]` lines under `## Park list` (the `park` verb's format).
// A harvested item is flipped to `- [x]` by `/pb-harvest` and no longer counts; the
// `(none yet)` placeholder and the blockquote instructions never match.
export function parseParked(buildLog: string): number {
  return sectionLines(buildLog, '## Park list').filter((l) => /^-\s+\[ \]\s+\S/.test(l.trim())).length
}

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

// The single primary next move (D15). It suggests; the dashboard prints the full
// list + counts so the human can always override. The phase is derived: a spike
// in progress and an in-flight step each have one obvious next move; otherwise you
// are at the boundary and the move follows from the steps.
function nextMove(spiking: boolean, steps: ReadonlyArray<Step>, inFlight: number | null, parked: number): string {
  if (spiking) {
    return 'close the spike — `plumbbob spike done`'
  }
  if (inFlight !== null) {
    return `finish step ${inFlight} — \`/pb-verify\` (or keep editing, then \`/pb-verify\`)`
  }
  // At the boundary (DESIGN): the move follows from the steps.
  const nextUndone = steps.find((s) => !s.done)
  if (nextUndone === undefined) {
    if (steps.length === 0) {
      return 'plan the first step — `/pb-step`'
    }
    // Batch-default: the steps were planned up front, so finishing them usually
    // means "finish up" — but `/pb-step` can still add an increment if reality grew.
    const harvest = parked > 0 ? `harvest ${parked} parked idea${parked === 1 ? '' : 's'} — \`/pb-harvest\`; then ` : ''
    return `${harvest}finish up — \`/pb-finish\` (or \`/pb-step\` to add another increment)`
  }
  return nextUndone.planned
    ? `build step ${nextUndone.n} — \`/pb-build\` (or \`/pb-step\` to revise it first)`
    : `plan step ${nextUndone.n} — \`/pb-step\``
}

export function orient(input: OrientInput): Orientation {
  const steps = parseSteps(input.intent)
  const parked = parseParked(input.buildLog)
  const nextUndone = steps.find((s) => !s.done)
  const seamParse = nextUndone === undefined ? null : parseStepSeam(input.intent, nextUndone.n)
  const phase = input.spiking ? 'SPIKE' : input.inFlight !== null ? 'BUILD' : 'DESIGN'
  return {
    title: parseTitle(input.intent),
    phase,
    steps,
    lastCheckpoint: parseLastCheckpoint(input.checkpoints),
    parked,
    openQuestions: parseOpenQuestions(input.intent),
    next: nextMove(input.spiking, steps, input.inFlight, parked),
    nextDoneWhen: nextUndone?.doneWhen ?? null,
    nextSeam: seamParse !== null && seamParse.ok ? seamParse.seam : [],
    nextModel: nextUndone?.model ?? null,
    outOfBand: input.outOfBand,
  }
}

export function formatOrientation(o: Orientation): string {
  const doneCount = o.steps.filter((s) => s.done).length
  const nextUndone = o.steps.find((s) => !s.done)
  const stepLines = o.steps.map((s) => {
    const marker = s.done ? '✓' : s === nextUndone ? '▸' : ' '
    const tail = s === nextUndone ? '   ← next' : ''
    const head = `  ${marker} ${s.n}  ${s.title}${tail}`
    if (s !== nextUndone) {
      return head
    }
    // Surface the next step's detail so the human can review it (and `/pb-step`-
    // revise) before building. Only what's present — a rough step shows neither.
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

  // A neutral reconciliation note (D66), only when there is something to reconcile:
  // commits landed since the last checkpoint that plumbbob's ledger didn't record.
  // Informational — the human commits freely (repo D3/C5), so this never gates.
  const receipts =
    o.outOfBand > 0
      ? [`${o.outOfBand} commit${o.outOfBand === 1 ? '' : 's'} since the last checkpoint landed outside plumbbob's ledger.`]
      : []

  return [
    `PlumbBob — ${o.title ?? '(untitled)'}   [${o.phase}]`,
    '',
    stepsBlock,
    '',
    cpLine,
    ...receipts,
    `parked ${o.parked} · open questions ${o.openQuestions}`,
    '',
    `next → ${o.next}`,
  ].join('\n')
}
