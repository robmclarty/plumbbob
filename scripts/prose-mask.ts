// scripts/prose-mask.ts: the shared span collector for "what's code, not prose" in a
// markdown file. Fenced blocks, inline code, and indented code blocks all vanish from
// the citation scanner (D74 (glossed-citations)) and `Repo.EmDash` alike; this module is
// the one place that collects those spans, so the two consumers cannot drift into two
// different counts of the same file (D2 (shared-mask)).

export type Span = readonly [number, number]

const FENCED_CODE_RE = /```[\s\S]*?```/g
const INLINE_CODE_RE = /`[^`]*`/g

/**
 * Every fenced code block (```` ``` ````-delimited) span in `text`.
 */
function collectFencedCodeSpans(text: string): Span[] {
  const spans: Span[] = []
  for (const match of text.matchAll(FENCED_CODE_RE)) {
    const start = match.index ?? 0
    spans.push([start, start + match[0].length])
  }
  return spans
}

/**
 * `text` split into lines, plus each line's starting offset into `text`.
 */
function splitIntoLines(text: string): { lines: readonly string[]; starts: readonly number[] } {
  const lines = text.split('\n')
  const starts: number[] = []
  let offset = 0
  for (const line of lines) {
    starts.push(offset)
    offset += line.length + 1
  }
  return { lines, starts }
}

/**
 * The span of every run of consecutive non-blank lines in `text`: the boundary a code
 * span cannot cross (D15 (wrapped-code-spans)). CommonMark closes a code span at the
 * next matching backtick string regardless of newlines, but a blank line ends the block
 * its inline content is parsed within, so an opening backtick with no close before one
 * stays a literal backtick, never a span.
 */
function collectNonBlankLineBlocks(text: string): Span[] {
  const { lines, starts } = splitIntoLines(text)
  const spans: Span[] = []
  let blockStart = -1
  for (let i = 0; i <= lines.length; i++) {
    const isBlank = i === lines.length || (lines[i] ?? '').trim().length === 0
    if (isBlank) {
      if (blockStart !== -1) {
        const lastLine = i - 1
        const start = starts[blockStart] ?? 0
        const end = (starts[lastLine] ?? start) + (lines[lastLine]?.length ?? 0)
        spans.push([start, end])
      }
      blockStart = -1
    } else if (blockStart === -1) {
      blockStart = i
    }
  }
  return spans
}

/**
 * Every inline code span (backtick-delimited, spanning a line break under
 * D15 (wrapped-code-spans) but never a blank line) in `text`.
 */
function collectInlineCodeSpans(text: string): Span[] {
  const spans: Span[] = []
  for (const [blockStart, blockEnd] of collectNonBlankLineBlocks(text)) {
    const block = text.slice(blockStart, blockEnd)
    for (const match of block.matchAll(INLINE_CODE_RE)) {
      const start = blockStart + (match.index ?? 0)
      spans.push([start, start + match[0].length])
    }
  }
  return spans
}

/**
 * A line's leading indentation in columns, expanding a tab to the next multiple of
 * four (CommonMark's own tab-stop rule), so a leading tab measures four columns on
 * its own.
 */
function leadingColumns(line: string): number {
  let columns = 0
  for (const ch of line) {
    if (ch === ' ') columns++
    else if (ch === '\t') columns += 4 - (columns % 4)
    else break
  }
  return columns
}

/**
 * Every indented code block span in `text`, under CommonMark's own rule
 * (D14 (commonmark-parity)): a run of non-blank lines each indented four or more
 * columns is a code block only when it cannot be read as a paragraph continuation,
 * meaning the line immediately before the run is blank (or the run opens the
 * document) or itself already inside the block. A four-plus-space run that instead
 * follows a paragraph line is paragraph continuation text, and stays unmasked. List
 * context (indentation relative to a marker, not column zero) is not modeled; the
 * repo's own house style never nests indented code that deep.
 */
export function collectIndentedCodeSpans(text: string): Span[] {
  const spans: Span[] = []
  const { lines, starts: lineStarts } = splitIntoLines(text)

  let previousLineBlank = true
  let inBlock = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const isBlank = line.trim().length === 0

    if (isBlank) {
      if (inBlock) {
        let j = i
        while (j < lines.length && (lines[j] ?? '').trim().length === 0) j++
        const continues = j < lines.length && leadingColumns(lines[j] ?? '') >= 4
        if (continues) {
          const start = lineStarts[i] ?? 0
          const lastBlank = j - 1
          const end = (lineStarts[lastBlank] ?? start) + (lines[lastBlank]?.length ?? 0)
          spans.push([start, end])
          i = j
          continue
        }
        inBlock = false
      }
      previousLineBlank = true
      i++
      continue
    }

    const indented = leadingColumns(line) >= 4
    if (indented && (inBlock || previousLineBlank)) {
      const start = lineStarts[i] ?? 0
      spans.push([start, start + line.length])
      inBlock = true
    } else {
      inBlock = false
    }
    previousLineBlank = false
    i++
  }

  return spans
}

/**
 * The full mask for a markdown file: fenced blocks, inline code, and indented code
 * blocks, combined. Consumers that need their own additional exclusions (the citation
 * scanner's decisions.md definition lines) collect those separately and concatenate.
 */
export function collectMaskSpans(text: string): Span[] {
  return [...collectFencedCodeSpans(text), ...collectInlineCodeSpans(text), ...collectIndentedCodeSpans(text)]
}

/**
 * Whether `index` falls inside any of `spans`.
 */
export function isWithin(index: number, spans: ReadonlyArray<Span>): boolean {
  return spans.some(([start, end]) => index >= start && index < end)
}
