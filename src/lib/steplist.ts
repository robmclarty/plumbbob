// A step expression: the one grammar a `/plumbbob:build` range is typed in. The
// turn hook reads it to mint a grant, the latch to land exactly what the grant
// names, `build` to say where a range stops, and the dashboard to point at where
// one starts, so no two of them can read the same keystrokes two ways. An
// expression is one number, a span `N-M` with N no greater than M, or numbers
// and spans joined by commas (`20,5-9`). It names plan numbers, never positions
// in the build order, and it is held as the spans it was written in, so
// `1-100000` stays two numbers rather than a hundred thousand. Pure: no fs.

/** One span of an expression: the steps from `from` through `to`, both included. */
export type Span = { readonly from: number; readonly to: number }

/** A parsed step expression: its spans, in the order they were written. */
export type StepList = ReadonlyArray<Span>

/**
 * Parse a step expression, or null when it is anything else.
 *
 * Every item is a positive number or a span whose first number is no greater
 * than its last. An empty item, a stray dash, or a space inside the expression
 * reads as no list at all, so a malformed range names nothing and grants
 * nothing.
 */
export function parseStepList(text: string): StepList | null {
  const spans: Span[] = []
  for (const item of text.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(item)
    if (m === null) return null
    const from = Number(m[1])
    const to = m[2] === undefined ? from : Number(m[2])
    if (!Number.isSafeInteger(to) || from < 1 || to < from) return null
    spans.push({ from, to })
  }
  return spans
}

/** Whether a list names step `n`. */
export function hasStep(list: StepList, n: number): boolean {
  return list.some((span) => n >= span.from && n <= span.to)
}

/**
 * Write steps back as an expression in the order given, folding each run that
 * climbs by one into a span: `[20, 5, 6, 7, 8, 9]` writes `20,5-9`.
 *
 * The order is the caller's, because a list has none of its own: the card
 * writes one in build order, so its first number is where the range starts.
 */
export function formatStepList(steps: ReadonlyArray<number>): string {
  const runs: Array<{ from: number; to: number }> = []
  for (const n of steps) {
    const last = runs.at(-1)
    if (last !== undefined && n === last.to + 1) {
      last.to = n
    } else {
      runs.push({ from: n, to: n })
    }
  }
  return runs.map(spanText).join(',')
}

/**
 * A list's normal form: its spans sorted and merged, so two ways of typing the
 * same steps write the same line (`20, 5-9` and `5-9,20` both write `5-9,20`).
 *
 * The grant stores this form and never the expansion, so a range of any length
 * is one short line.
 */
export function normalizeStepList(list: StepList): string {
  const merged: Array<{ from: number; to: number }> = []
  for (const span of [...list].sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1)
    if (last !== undefined && span.from <= last.to + 1) {
      last.to = Math.max(last.to, span.to)
    } else {
      merged.push({ from: span.from, to: span.to })
    }
  }
  return merged.map(spanText).join(',')
}

/**
 * The numbers a list names, in the order written, each span walked only while
 * `known` holds and stopped at the first number it does not, which is kept.
 *
 * A build order is a sequence rather than a set, so its spans expand in place
 * (`1,6,2-4` names 1, 6, 2, 3, 4). The number kept past the plan is the one a
 * caller reports the plan lacks, and stopping there means `2-100000` costs one
 * number past the last planned step rather than a hundred thousand.
 */
export function expandStepList(list: StepList, known: (n: number) => boolean): number[] {
  const numbers: number[] = []
  for (const span of list) {
    for (let n = span.from; n <= span.to; n += 1) {
      numbers.push(n)
      if (!known(n)) break
    }
  }
  return numbers
}

/** One span as it is typed: a lone number, or `from-to`. */
function spanText(span: Span): string {
  return span.from === span.to ? String(span.from) : `${span.from}-${span.to}`
}

/** What the arguments of a build invocation ask for. */
export type BuildArgs = {
  // `--auto` was among them.
  readonly auto: boolean
  // A comma or a dash among the numbers: a range, which lands each step it
  // names. Bare numbers alone are not one.
  readonly range: boolean
  // Every number and span in the run as one list, or null when the run holds
  // no number, or a range that does not parse.
  readonly steps: StepList | null
}

/**
 * Read the arguments a build invocation carries, up to the first token that is
 * not one: `--auto`, or a run of digits, commas, and dashes.
 *
 * Once any number carries a comma or a dash, every number and span in the run
 * joins one list, so `20, 5-9` typed with a space reads as `20,5-9`. Trailing
 * sentence punctuation is the sentence's (`/build 1-3.`), and so is a comma
 * after the run's last number (`/build 2, then review`), which separates
 * nothing.
 */
export function readBuildArgs(text: string): BuildArgs {
  let auto = false
  const words: string[] = []
  for (const token of text.split(/\s+/)) {
    const word = token.replace(/[.;:!?]+$/, '')
    if (word === '') continue
    if (word === '--auto') {
      auto = true
      continue
    }
    if (!/^[\d,-]+$/.test(word)) break
    words.push(word)
  }
  const items = words.map((w, i) => (i === words.length - 1 ? w.replace(/,+$/, '') : w)).filter((w) => w !== '')
  const range = items.some((w) => /[,-]/.test(w))
  const steps = items.length === 0 ? null : parseStepList(items.join(',').replace(/,{2,}/g, ','))
  return { auto, range, steps }
}
