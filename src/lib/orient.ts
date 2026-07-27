// The orientation model behind `status`: parse a live build session into the
// where-am-I dashboard — title, phase, step list, last checkpoint, counts, and
// one suggested next move. Pure and best-effort by design: it takes raw file
// contents (no fs), and a malformed document degrades to fewer fields rather
// than throwing.

import { parseStepSeam } from './intent.ts'

/** One numbered step under intent.md's `## Steps`. */
export type Step = {
  readonly n: number
  readonly done: boolean
  readonly title: string
  readonly planned: boolean // carries a `done when:` criterion
  readonly doneWhen: string | null // the criterion text, for the dashboard
  readonly model: string | null // the optional `- model:` recommendation, verbatim — advisory, never a gate
}

/** One landed step from the checkpoints ledger: its number and commit SHA. */
export type Checkpoint = { readonly n: number; readonly sha: string }

/** The parsed where-am-I view that `status` renders. */
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
  // the human can review (and `/plumbbob:step`-revise) before `/plumbbob:build`.
  readonly nextDoneWhen: string | null
  readonly nextSeam: ReadonlyArray<string>
  // The next step's advisory model recommendation — the smallest model the plan
  // says can carry the step. Orientation for the human choosing where to spend
  // attention and tokens, never a gate.
  readonly nextModel: string | null
  // Commits on HEAD since the last checkpoint that landed outside plumbbob's
  // checkpoints ledger (the per-build file recording baseline, plan, and step
  // SHAs): surfaced as one neutral reconciliation line, never blocked — the
  // human commits freely. 0 renders nothing.
  readonly outOfBand: number
}

/** The raw material `orient` parses — file contents and marker state, no fs. */
export type OrientInput = {
  readonly intent: string
  readonly buildLog: string
  readonly checkpoints: string
  // The in-flight step number from the STEP marker (an untracked control file
  // naming the step being built; null when none) — this is what makes the phase
  // "BUILD". `spiking` is the SPIKE marker's presence.
  readonly inFlight: number | null
  readonly spiking: boolean
  // The out-of-band commit count: commits since the last checkpoint's SHA that
  // the ledger didn't record. Only `status` can measure it (it needs git) —
  // orient stays pure/fs-free, so the caller computes it and passes it in. 0
  // when there is no checkpoint to reconcile against, or the tree is clean at
  // the last checkpoint.
  readonly outOfBand: number
}

/**
 * The lines of a named `## Section`, from its heading to the next `## ` (or EOF).
 */
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

/**
 * The build title — the first `# ` heading in intent.md, or null when absent.
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
 * Parse the steps under `## Steps`: `N. [ |x] Title — **done when:** ...`.
 *
 * The title is the text up to the first em dash; `planned` is true when the
 * step's block carries a `done when` criterion. Only `## Steps` is machine-read
 * as the build plan — narrative roadmap prose lives in its own section and
 * never lands here.
 */
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
 * that do not say "resolved".
 *
 * The opener may carry a slug-at-birth gloss — `- Q2 (some-slug): ...` — which
 * the count reads through; sub-lines (`*plain:*`/`*lean:*`) never match.
 */
export function parseOpenQuestions(intent: string): number {
  return sectionLines(intent, '## Open questions').filter(
    (l) => /^- Q\d+(?: \([^)]+\))?:/.test(l.trim()) && !/resolved/i.test(l),
  ).length
}

/**
 * Count the open parked items: `- [ ]` lines under `## Park list`.
 *
 * A parked item is a mid-build idea the `park` verb appends as a flat checklist
 * line for later triage; `/plumbbob:harvest` flips a triaged one to `- [x]` and it
 * stops counting. The `(none yet)` placeholder and the blockquote instructions
 * never match.
 */
export function parseParked(buildLog: string): number {
  return sectionLines(buildLog, '## Park list').filter((l) => /^-\s+\[ \]\s+\S/.test(l.trim())).length
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
 * The SHA of the last ledger line of ANY kind — baseline, plan, or step.
 *
 * This is the reconciliation anchor for the out-of-band commit count: a commit
 * that lands after the plan but before the first step checkpoint is exactly the
 * window the reconciliation line exists for, so anchoring on step lines alone
 * would leave it invisible. `parseLastCheckpoint` stays step-only — it feeds
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
 * The single primary next move the dashboard suggests.
 *
 * It suggests; the dashboard prints the full list + counts so the human can
 * always override. The phase is derived: a spike in progress and an in-flight
 * step each have one obvious next move; otherwise you are at the boundary and
 * the move follows from the steps.
 */
function nextMove(spiking: boolean, steps: ReadonlyArray<Step>, inFlight: number | null, parked: number): string {
  if (spiking) {
    return 'close the spike — `plumbbob spike done`'
  }
  if (inFlight !== null) {
    return `finish step ${inFlight} — \`/plumbbob:verify\` (or keep editing, then \`/plumbbob:verify\`)`
  }
  // At the boundary (DESIGN): the move follows from the steps.
  const nextUndone = steps.find((s) => !s.done)
  if (nextUndone === undefined) {
    if (steps.length === 0) {
      return 'plan the first step — `/plumbbob:step`'
    }
    // Batch-default: the steps were planned up front, so finishing them usually
    // means "finish up" — but `/plumbbob:step` can still add an increment if reality grew.
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

/**
 * Render an Orientation as the plain-text dashboard `status` prints.
 */
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
    // Surface the next step's detail so the human can review it (and `/plumbbob:step`-
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

  // A neutral reconciliation note, only when there is something to reconcile:
  // commits landed since the last checkpoint that plumbbob's ledger didn't
  // record. Informational — the human commits freely, so this never gates.
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
