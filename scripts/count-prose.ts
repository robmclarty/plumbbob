#!/usr/bin/env node
// scripts/count-prose.ts: a mask-aware sweep sizer. Counts occurrences of `--pattern`
// (default U+2014, the em-dash) in markdown prose using the same fenced/inline/indented
// mask `scripts/prose-mask.ts` shares with the citation scanner (D2 (shared-mask)), so a
// sizing run predicts what `Repo.EmDash` will actually flag instead of lying the way raw
// grep (counts code spans too) or vale's own per-file totals (collapse a multi-line
// paragraph's findings into one position) both do. A meter, not a gate: it always exits 0.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { collectIndentedCodeSpans, collectMaskSpans, isWithin } from './prose-mask.ts'

export const DEFAULT_PATTERN = '—'

// The `prose` slot's own walk (checkride.config.json); markdown-first (D3
// (markdown-first)), so a `.ts`-only directory in this list simply yields no files.
const DEFAULT_PATHS: readonly string[] = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs', 'src', 'scripts', 'skills', 'templates']

export type FileCount = {
  readonly file: string
  readonly count: number
}

export type SizeResult = {
  readonly counts: ReadonlyArray<FileCount>
  readonly total: number
  readonly filesScanned: number
}

export type Options = {
  readonly pattern: string
  readonly paths: readonly string[]
  readonly showMasked: boolean
}

/**
 * Parses `[--pattern <re>] [--show-masked] [path ...]` in any order; `--pattern`
 * consumes the following argument, `--show-masked` is a bare flag, and everything
 * else is a path. No paths given falls back to `DEFAULT_PATHS`.
 */
export function parseArgs(argv: readonly string[]): Options {
  let pattern = DEFAULT_PATTERN
  let showMasked = false
  const paths: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? ''
    if (arg === '--pattern') {
      i++
      pattern = argv[i] ?? pattern
      continue
    }
    if (arg === '--show-masked') {
      showMasked = true
      continue
    }
    paths.push(arg)
  }
  return { pattern, paths: paths.length > 0 ? paths : DEFAULT_PATHS, showMasked }
}

function isSkippedDir(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules'
}

/**
 * Every markdown file reachable from `absPath`: itself if it is a `.md` file, or every
 * `.md` file under it if it is a directory (recursing, skipping dot- and node_modules
 * directories). A path that names neither yields nothing.
 */
function* walkMarkdownFiles(absPath: string): Generator<string> {
  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(absPath)
  } catch {
    return
  }
  if (stats.isFile()) {
    if (absPath.endsWith('.md')) yield absPath
    return
  }
  if (!stats.isDirectory()) return
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    const full = resolve(absPath, entry.name)
    if (entry.isDirectory()) {
      if (isSkippedDir(entry.name)) continue
      yield* walkMarkdownFiles(full)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      yield full
    }
  }
}

/**
 * Every markdown file under `root` named by `paths` (files or directories, resolved
 * against `root`), sorted for stable output.
 */
export function collectMarkdownFiles(root: string, paths: readonly string[]): string[] {
  const files: string[] = []
  for (const path of paths) {
    files.push(...walkMarkdownFiles(resolve(root, path)))
  }
  return [...new Set(files)].sort()
}

/**
 * How many matches of `pattern` fall outside the shared fenced/inline/indented mask
 * (D2 (shared-mask), D14 (commonmark-parity)): the count `Repo.EmDash` would actually
 * flag in `text`.
 */
export function countMatches(text: string, pattern: RegExp): number {
  const spans = collectMaskSpans(text)
  let count = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (!isWithin(index, spans)) count++
  }
  return count
}

function lineOf(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

/**
 * Every masked indented-code span across `files`, for `--show-masked` auditing: D14
 * (commonmark-parity) names list context as the mask's one approximation, so this is
 * what a sizing run eyeballs instead of trusting blind.
 */
export function collectMaskedIndentedSpans(root: string, files: readonly string[]): Array<{ file: string; line: number; text: string }> {
  const spans: Array<{ file: string; line: number; text: string }> = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const [start, end] of collectIndentedCodeSpans(text)) {
      spans.push({ file: relative(root, file), line: lineOf(text, start), text: text.slice(start, end) })
    }
  }
  return spans
}

function sizeFiles(root: string, files: readonly string[], pattern: RegExp): SizeResult {
  const counts: FileCount[] = []
  let total = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const count = countMatches(text, pattern)
    total += count
    if (count > 0) counts.push({ file: relative(root, file), count })
  }
  return { counts, total, filesScanned: files.length }
}

/**
 * The mask-aware sweep size: a per-file count of `pattern` outside the shared mask for
 * every markdown file `paths` reaches under `root`, plus the total.
 */
export function sizeProse(root: string, paths: readonly string[], pattern: RegExp): SizeResult {
  return sizeFiles(root, collectMarkdownFiles(root, paths), pattern)
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  const pattern = new RegExp(options.pattern, 'g')
  const files = collectMarkdownFiles(root, options.paths)

  if (options.showMasked) {
    for (const span of collectMaskedIndentedSpans(root, files)) {
      process.stdout.write(`masked ${span.file}:${span.line}  ${JSON.stringify(span.text)}\n`)
    }
  }

  const { counts, total, filesScanned } = sizeFiles(root, files, pattern)
  for (const { file, count } of counts) {
    process.stdout.write(`${file}  ${count}\n`)
  }
  process.stdout.write(`\n${total} match${total === 1 ? '' : 'es'} across ${filesScanned} file${filesScanned === 1 ? '' : 's'} scanned.\n`)
  process.exitCode = 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
