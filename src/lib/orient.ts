// Orientation model for `status` (D8/D15): parse a live session into the
// dashboard the human reads to know where they are and what to do next. Pure and
// best-effort — it takes raw file contents (no fs), and a malformed doc degrades
// to fewer fields rather than throwing. Functional/procedural, no classes, no
// default export (C1).

export type Step = {
  readonly n: number
  readonly done: boolean
  readonly title: string
  readonly planned: boolean // carries a `done when:` criterion
}

export type Checkpoint = { readonly n: number; readonly sha: string }

export type Orientation = {
  readonly title: string | null
  readonly state: string
  readonly steps: ReadonlyArray<Step>
  readonly lastCheckpoint: Checkpoint | null
  readonly parked: number
  readonly openQuestions: number
  readonly next: string
}

export type OrientInput = {
  readonly state: string
  readonly intent: string
  readonly buildLog: string
  readonly checkpoints: string
  readonly inFlight: number | null
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
    const block = lines.slice(s.idx, blockEnd).join('\n').toLowerCase()
    return { n: s.n, done: s.done, title: s.title, planned: block.includes('done when') }
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

// Parked items: `- [ ] ...` checkbox lines under `## Park list` (the `park` verb's
// format), never the `(none yet)` placeholder or the blockquote instructions.
export function parseParked(buildLog: string): number {
  return sectionLines(buildLog, '## Park list').filter((l) => /^-\s+\[[ xX]\]\s+\S/.test(l.trim())).length
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
// list + counts so the human can always override.
function nextMove(state: string, steps: ReadonlyArray<Step>, inFlight: number | null, parked: number): string {
  switch (state) {
    case 'SPIKE':
      return 'close the spike — `plumbbob spike done`'
    case 'FINISH':
      return 'wrap up — `/pb-reset`'
    case 'REVIEW':
      return 'read the diff cold against intent, then `/pb-verify`'
    case 'BUILD': {
      const n = inFlight ?? steps.find((s) => !s.done)?.n
      return n === undefined
        ? 'finish the step in flight — `/pb-verify`'
        : `finish step ${n} — \`/pb-verify\` (or keep editing, then \`/pb-verify\`)`
    }
    default: {
      // DESIGN (and any unknown state): you are at the boundary.
      const nextUndone = steps.find((s) => !s.done)
      if (nextUndone === undefined) {
        if (steps.length === 0) {
          return 'plan the first step — `/pb-step`'
        }
        // Just-in-time (D6): finishing the *planned* steps usually means "plan the
        // next," not "done" — only the human knows which, so offer both.
        const harvest = parked > 0 ? `harvest ${parked} parked idea${parked === 1 ? '' : 's'} — \`/pb-harvest\`; then ` : ''
        return `${harvest}plan the next step — \`/pb-step\` (or \`/pb-reset\` to wrap up if you're done)`
      }
      return nextUndone.planned
        ? `build step ${nextUndone.n} — \`/pb-build\``
        : `plan step ${nextUndone.n} — \`/pb-step\``
    }
  }
}

export function orient(input: OrientInput): Orientation {
  const steps = parseSteps(input.intent)
  const parked = parseParked(input.buildLog)
  return {
    title: parseTitle(input.intent),
    state: input.state,
    steps,
    lastCheckpoint: parseLastCheckpoint(input.checkpoints),
    parked,
    openQuestions: parseOpenQuestions(input.intent),
    next: nextMove(input.state, steps, input.inFlight, parked),
  }
}

export function formatOrientation(o: Orientation): string {
  const doneCount = o.steps.filter((s) => s.done).length
  const nextUndone = o.steps.find((s) => !s.done)
  const stepLines = o.steps.map((s) => {
    const marker = s.done ? '✓' : s === nextUndone ? '▸' : ' '
    const tail = s === nextUndone ? '   ← next' : ''
    return `  ${marker} ${s.n}  ${s.title}${tail}`
  })
  const stepsBlock =
    o.steps.length === 0 ? '  (no steps planned yet)' : `  steps  ${doneCount}/${o.steps.length} done\n${stepLines.join('\n')}`

  const cp = o.lastCheckpoint
  const cpLine = cp === null ? 'last checkpoint  none yet' : `last checkpoint  step ${cp.n} · ${cp.sha.slice(0, 7)}`

  return [
    `Plumbbob — ${o.title ?? '(untitled)'}   [${o.state}]`,
    '',
    stepsBlock,
    '',
    cpLine,
    `parked ${o.parked} · open questions ${o.openQuestions}`,
    '',
    `next → ${o.next}`,
  ].join('\n')
}
