// Relative links written for one directory, re-aimed for another. A section of
// `.plumbbob/detail.md` cites `builds/<slug>/intent.md#d5` relative to
// `.plumbbob/`; copied verbatim into `builds/<slug>/build-log.md` the same
// target now points one directory too deep and the link breaks. Only the copy
// step knows both directories, so this is the one place the target moves:
// every inline link and image in prose gets its target resolved against the
// directory the text was written for and re-expressed from the directory it is
// bound for. Code is never touched: a fenced block is tracked across lines and
// an inline code span across one, because a link inside a sample is part of
// the sample. Pure string work; no fs, no process, `node:path` only.

import { relative, resolve, sep } from 'node:path'
import { closesFence, type Fence, fenceOpening } from './orient.ts'

/** One inline code span on a line: a run of backticks up to the next run of the same length. */
const CODE_SPAN = /(`+).*?\1/g

/**
 * One inline link or image in prose, in three parts: everything up to and
 * including the opening parenthesis, the target, and the rest (an optional
 * quoted title, then the closing parenthesis). An angle-bracketed target does
 * not match, so it rides through untouched.
 */
const LINK = /(!?\[[^\]]*\]\()([^\s()<>]*)((?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\))/g

/** A target that names its own scheme (`https:`, `mailto:`), which no directory move can change. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * Re-aim every relative link in `text` so it resolves the same from `toDir`
 * as it did from `fromDir`.
 *
 * A link aimed at `builds/x/intent.md#d5`, written for `.plumbbob/`, aims at
 * `intent.md#d5` once it is bound for `.plumbbob/builds/x/`; `../README.md` becomes
 * `../../../README.md`. A fragment rides along unchanged. The text comes
 * back byte for byte when the two directories are one, when no link is
 * relative, or when every link sits inside a fence or a code span.
 */
export function rerootLinks(text: string, fromDir: string, toDir: string): string {
  const from = resolve(fromDir)
  const to = resolve(toDir)
  if (from === to) return text
  let fence: Fence | null = null
  const lines: string[] = []
  for (const line of text.split('\n')) {
    if (fence !== null) {
      if (closesFence(line, fence)) fence = null
      lines.push(line)
      continue
    }
    const opened = fenceOpening(line)
    if (opened !== null) {
      fence = opened
      lines.push(line)
      continue
    }
    lines.push(rerootLine(line, from, to))
  }
  return lines.join('\n')
}

/**
 * One unfenced line with its prose segments rewritten and its code spans
 * passed through.
 *
 * The line splits at every code span; the span is copied as it stands and the
 * text between spans is where links move. A lone backtick with no closer is
 * prose, as it is to a markdown renderer.
 */
function rerootLine(line: string, from: string, to: string): string {
  let out = ''
  let last = 0
  for (const span of line.matchAll(CODE_SPAN)) {
    out += rerootProse(line.slice(last, span.index), from, to) + span[0]
    last = span.index + span[0].length
  }
  return out + rerootProse(line.slice(last), from, to)
}

/** A prose segment with the target of every inline link and image re-aimed. */
function rerootProse(prose: string, from: string, to: string): string {
  return prose.replace(LINK, (_, open: string, target: string, close: string) => `${open}${rerootTarget(target, from, to)}${close}`)
}

/**
 * One link target, moved from `from` to `to` when it is relative and returned
 * as written otherwise.
 *
 * Untouched: an empty target, a bare `#anchor`, a root-relative `/docs/a.md`,
 * and anything with a scheme. A relative target resolves against `from`, is
 * re-expressed from `to` with posix separators, and keeps its `#fragment`.
 * A target that lands on `to` itself comes back as `.` rather than as
 * nothing.
 */
function rerootTarget(target: string, from: string, to: string): string {
  if (target === '' || target.startsWith('#') || target.startsWith('/') || SCHEME.test(target)) return target
  const hash = target.indexOf('#')
  const file = hash === -1 ? target : target.slice(0, hash)
  const fragment = hash === -1 ? '' : target.slice(hash)
  const moved = relative(to, resolve(from, file)).split(sep).join('/')
  return `${moved === '' ? '.' : moved}${fragment}`
}
