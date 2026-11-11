// The plan-time seam check: what the plan pause can say about a plan's seams
// before any step is built. A seam that will not parse is refused only when
// `plumbbob build` enters its step, which can be a range or a day after the
// plan was approved; a seam that names a file one keystroke away from a file
// that exists is never refused at all, and the step's first edit lands on a
// new file beside the one it meant. Both are cheapest to fix on paper.
//
// Guidance, never a gate: the plan card names what it found, and nothing here
// refuses a plan. A new file is the ordinary case and draws no line; only a
// near miss does, so a fresh repo with no `src/` yet reads as clean.

import { parseSteps } from './orient.ts'
import { parseStepSeam } from './intent.ts'

/** What the check can see of the working tree: injected, so the check stays pure and its tests need no repo. */
export type Tree = {
  readonly exists: (relPath: string) => boolean
  readonly entries: (relDir: string) => ReadonlyArray<string> // names in the directory, [] when it is missing
}

/** One thing the plan card names about a step's seam. */
export type SeamFinding = {
  readonly step: number
  readonly line: number // the step opener's 1-based line, for the card's link
  readonly kind: 'unparsed' | 'near-miss'
  // The words after the step's name: `has no \`seam:\` line.`, `'s seam lists
  // no files.`, or `names \`src/limited.ts\`, which does not exist;
  // \`src/limiter.ts\` does.`
  readonly words: string
}

/**
 * Every seam finding across the plan's undone steps, in step order: a seam the
 * build would refuse, and a token that names no file while a sibling one edit
 * away does.
 *
 * Landed steps are skipped, since their files may have moved on since. A
 * token that exists, or that names a new file with no near sibling, draws
 * nothing.
 */
export function seamFindings(intent: string, tree: Tree): SeamFinding[] {
  return parseSteps(intent)
    .filter((s) => !s.done)
    .flatMap((s): SeamFinding[] => {
      const parsed = parseStepSeam(intent, s.n)
      if (!parsed.ok) {
        // The parse's own words, less the leading `step N`, which the card's link says.
        return [{ step: s.n, line: s.line, kind: 'unparsed', words: parsed.error.replace(/^step \d+ ?/, '') }]
      }
      return parsed.seam.flatMap((token) => {
        const near = nearMiss(token, tree)
        return near === null
          ? []
          : [{ step: s.n, line: s.line, kind: 'near-miss', words: `names \`${token}\`, which does not exist; \`${near}\` does.` }]
      })
    })
}

/**
 * The existing sibling a missing seam token most likely meant, or null.
 *
 * A token that exists, or whose directory does not, has no near miss. Among
 * the directory's entries, a candidate is one edit away (an insertion, a
 * deletion, a substitution, or two neighbours swapped), keeps the token's
 * extension, and is not the token's stem grown or cut at the end: `users.ts`
 * beside `user.ts`, or `limiter2.ts` beside `limiter.ts`, is a new file on
 * purpose, not a slip.
 */
function nearMiss(token: string, tree: Tree): string | null {
  const isDir = token.endsWith('/')
  const path = isDir ? token.slice(0, -1) : token
  if (tree.exists(path)) {
    return null
  }
  const cut = path.lastIndexOf('/')
  const dir = cut === -1 ? '' : path.slice(0, cut)
  if (dir !== '' && !tree.exists(dir)) {
    return null
  }
  const name = path.slice(cut + 1)
  const ext = extension(name)
  const stem = name.slice(0, name.length - ext.length)
  if (stem.length < 4) {
    return null
  }
  const match = tree
    .entries(dir)
    .filter((e) => e !== name && extension(e) === ext)
    .filter((e) => {
      const other = e.slice(0, e.length - ext.length)
      return !other.startsWith(stem) && !stem.startsWith(other) && oneEditApart(stem, other)
    })
    .sort()[0]
  return match === undefined ? null : `${dir === '' ? '' : `${dir}/`}${match}${isDir ? '/' : ''}`
}

/** A file name's extension with its dot (`.ts`, `.md`), or '' for none; a leading dot (`.env`) is part of the name. */
function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot)
}

/**
 * Whether two strings are exactly one edit apart: one character inserted,
 * deleted, or substituted, or two adjacent characters swapped.
 */
function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) {
    return false
  }
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i += 1
  }
  if (a.length === b.length) {
    const swapped = a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)
    return swapped || a.slice(i + 1) === b.slice(i + 1)
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  return short.slice(i) === long.slice(i + 1)
}
