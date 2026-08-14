import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  collectMarkdownFiles,
  collectMaskedIndentedSpans,
  countMatches,
  DEFAULT_PATTERN,
  parseArgs,
  sizeProse,
} from '../../scripts/count-prose.ts'

const DASH = new RegExp(DEFAULT_PATTERN, 'g')

describe('countMatches — the mask-aware count Repo.EmDash would actually flag', () => {
  it('counts a plain-prose em-dash', () => {
    expect(countMatches('A pause — then a clause.', DASH)).toBe(1)
  })

  it('skips an em-dash inside a fenced code block', () => {
    const text = ['prose', '```', 'code — not prose', '```', 'more prose'].join('\n')
    expect(countMatches(text, DASH)).toBe(0)
  })

  it('skips an em-dash inside inline code', () => {
    expect(countMatches('See `a — b` for the token.', DASH)).toBe(0)
  })

  it('skips an em-dash inside an inline code span whose backticks wrap a line break (D15 (wrapped-code-spans))', () => {
    const text = ['See `a pause —', 'and more` for the token.'].join('\n')
    expect(countMatches(text, DASH)).toBe(0)
  })

  it('does not mask across a blank line — a code span cannot cross a paragraph break', () => {
    const text = ['See `a pause — clause.', '', 'and more` for the token.'].join('\n')
    expect(countMatches(text, DASH)).toBe(1)
  })

  it('skips an em-dash inside an indented code block that opens after a blank line', () => {
    const text = ['A paragraph.', '', '    code — not prose', ''].join('\n')
    expect(countMatches(text, DASH)).toBe(0)
  })

  it('does not skip a two-space-indented continuation — sub-four-space indents are paragraphs (D14 (commonmark-parity))', () => {
    const text = ['- Some item', '  a pause — a clause.'].join('\n')
    expect(countMatches(text, DASH)).toBe(1)
  })

  it('does not skip a three-space-indented continuation — still a paragraph', () => {
    const text = ['- Some item', '   a pause — a clause.'].join('\n')
    expect(countMatches(text, DASH)).toBe(1)
  })

  it('does not skip a four-space run with no preceding blank line — paragraph continuation, not code', () => {
    const text = ['See the note below.', '    a pause — a clause.'].join('\n')
    expect(countMatches(text, DASH)).toBe(1)
  })

  it('counts every em-dash across a multi-line paragraph, not just the first — the vale undercount this counter exists to fix', () => {
    const text = ['A pause — then more. Another pause — then more still.', 'A third line — and a fourth clause — closes it.'].join('\n')
    expect(countMatches(text, DASH)).toBe(4)
  })

  it('honors a custom pattern', () => {
    expect(countMatches('D26 needs a link, so does D27.', /\bD\d+\b/g)).toBe(2)
  })
})

describe('parseArgs — pattern, paths, and --show-masked in any order', () => {
  it('defaults to the em-dash pattern and the prose slot walk list', () => {
    const options = parseArgs([])
    expect(options.pattern).toBe(DEFAULT_PATTERN)
    expect(options.showMasked).toBe(false)
    expect(options.paths.length).toBeGreaterThan(0)
  })

  it('reads --pattern and leftover args as paths', () => {
    const options = parseArgs(['--pattern', 'D\\d+', 'docs', 'README.md'])
    expect(options.pattern).toBe('D\\d+')
    expect(options.paths).toEqual(['docs', 'README.md'])
  })

  it('reads --show-masked as a bare flag, order-independent', () => {
    const options = parseArgs(['docs', '--show-masked', '--pattern', '—'])
    expect(options.showMasked).toBe(true)
    expect(options.paths).toEqual(['docs'])
  })
})

describe('sizeProse and collectMaskedIndentedSpans — walking a tree', () => {
  const created: string[] = []

  afterAll(() => {
    for (const dir of created.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function makeTree(): string {
    const dir = mkdtempSync(join(tmpdir(), 'count-prose-'))
    created.push(dir)
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'node_modules', 'ignored'), { recursive: true })

    writeFileSync(join(dir, 'README.md'), 'Two here — and here — in the front door.\n')
    writeFileSync(
      join(dir, 'docs', 'notes.md'),
      ['One prose dash — counted.', '', '    an indented block — masked', ''].join('\n'),
    )
    writeFileSync(join(dir, 'docs', 'clean.md'), 'No dashes at all.\n')
    writeFileSync(join(dir, 'docs', 'code.ts'), "const s = 'a — b, not markdown, never walked'\n")
    writeFileSync(join(dir, 'node_modules', 'ignored', 'skip.md'), 'a — b — c, never walked\n')
    return dir
  }

  it('collectMarkdownFiles walks directories and files, skipping node_modules', () => {
    const dir = makeTree()
    const files = collectMarkdownFiles(dir, ['README.md', 'docs'])
    expect(files).toHaveLength(3)
    expect(files.every((file) => file.endsWith('.md'))).toBe(true)
  })

  it('sizeProse reports per-file counts, a total, and files-scanned, skipping zero-count files', () => {
    const dir = makeTree()
    const result = sizeProse(dir, ['README.md', 'docs'], DASH)
    expect(result.filesScanned).toBe(3)
    expect(result.total).toBe(3)
    expect(result.counts).toEqual(
      expect.arrayContaining([
        { file: 'README.md', count: 2 },
        { file: join('docs', 'notes.md'), count: 1 },
      ]),
    )
    expect(result.counts.find((entry) => entry.file === join('docs', 'clean.md'))).toBeUndefined()
  })

  it('collectMaskedIndentedSpans surfaces the audit trail --show-masked prints', () => {
    const dir = makeTree()
    const files = collectMarkdownFiles(dir, ['docs'])
    const spans = collectMaskedIndentedSpans(dir, files)
    expect(spans).toEqual([{ file: join('docs', 'notes.md'), line: 3, text: '    an indented block — masked' }])
  })
})
