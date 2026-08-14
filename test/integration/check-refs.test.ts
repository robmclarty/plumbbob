import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  checkCitation,
  findCitations,
  parseDefinitions,
  scanRepo,
  type Surface,
  type Violation,
} from '../../scripts/check-refs.ts'

const DEFS = new Map([
  ['D26', 'build-folders'],
  ['D1', 'lean-cli'],
])

function violationsFor(text: string, surface: Surface, definitions = DEFS): ReadonlyArray<Omit<Violation, 'file' | 'line'>> {
  return findCitations(text, surface)
    .map((citation) => checkCitation(citation, definitions, surface))
    .filter((violation): violation is Omit<Violation, 'file' | 'line'> => violation !== null)
}

describe('parseDefinitions — the canonical D#/C# -> slug map', () => {
  it('reads a decisions.md-style definition line', () => {
    const text = '- <a id="d26"></a>**D26 (build-folders) — One folder per build.**'
    expect(parseDefinitions(text)).toEqual(new Map([['D26', 'build-folders']]))
  })

  it('finds every definition in a multi-entry key', () => {
    const text = [
      '- <a id="c1"></a>**C1 (functional-only) — Functional and procedural only.**',
      '- <a id="d26"></a>**D26 (build-folders) — One folder per build.**',
    ].join('\n')
    expect(parseDefinitions(text)).toEqual(
      new Map([
        ['C1', 'functional-only'],
        ['D26', 'build-folders'],
      ]),
    )
  })
})

describe('the four markdown rules', () => {
  it('rule 1 (linked): passes a properly linked citation', () => {
    expect(violationsFor('See [D26 (build-folders)](#d26) for the record.', 'markdown')).toEqual([])
  })

  it('rule 1 (linked): flags a bare citation', () => {
    const violations = violationsFor('See D26 for the record.', 'markdown')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('unlinked')
  })

  it('rule 2 (anchor matches the number): flags a mismatched anchor', () => {
    const violations = violationsFor('[D26 (build-folders)](#d29)', 'markdown')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('bad-anchor')
  })

  it('rule 3 (slug present): flags a link with no gloss', () => {
    const violations = violationsFor('[D26](#d26)', 'markdown')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('missing-slug')
  })

  it('rule 4 (slug matches the definition verbatim): flags a wrong gloss', () => {
    const violations = violationsFor('[D26 (a-different-slug)](#d26)', 'markdown')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('wrong-slug')
  })

  it('rule 4 also catches an unknown tag — nothing to match verbatim', () => {
    const violations = violationsFor('[D999 (some-slug)](#d999)', 'markdown')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('wrong-slug')
    expect(violations[0]?.message).toContain('no matching entry')
  })

  it('a bold-wrapped citation reads the same as an unbolded one', () => {
    expect(violationsFor('[**D26 (build-folders)**](#d26)', 'markdown')).toEqual([])
  })
})

describe('the src variant — D74 (glossed-citations)', () => {
  it('passes a printed string carrying its gloss, no link', () => {
    expect(violationsFor('plumbbob doctor — check gate (D1 (lean-cli))', 'src')).toEqual([])
  })

  it('flags a printed tag with no gloss', () => {
    const violations = violationsFor('plumbbob doctor — check gate (D1)', 'src')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('missing-slug')
  })

  it('flags a printed string that carries a markdown link', () => {
    const violations = violationsFor('[D1 (lean-cli)](#d1)', 'src')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('link-forbidden')
  })
})

describe('D74 (glossed-citations) — a tag in a code span is never a citation', () => {
  it('skips a bare tag inside inline code', () => {
    expect(violationsFor('Retired: `D2`, `D5` belonged to superseded decisions.', 'markdown')).toEqual([])
  })

  it('skips a tag inside a fenced code block', () => {
    const text = ['```', 'D26 (build-folders)', '```'].join('\n')
    expect(violationsFor(text, 'markdown')).toEqual([])
  })

  it('skips a fill-in-the-blank placeholder', () => {
    expect(violationsFor('Format: `D1 (slug-here)`', 'markdown')).toEqual([])
  })

  it('skips a bare tag inside a code span whose backticks wrap a line break (D15 (wrapped-code-spans))', () => {
    const text = ['See `D26 (build-folders)', 'for details` in the docs.'].join('\n')
    expect(violationsFor(text, 'markdown')).toEqual([])
  })

  it('does not skip a tag whose would-be code span is broken by a blank line — a code span cannot cross a paragraph break', () => {
    const text = ['See `D26 (build-folders)', '', 'for details` in the docs.'].join('\n')
    const violations = violationsFor(text, 'markdown')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('unlinked')
  })
})

describe('D14 (commonmark-parity) — an indented code block is never a citation', () => {
  it('skips a bare tag in a four-space-indented block that opens after a blank line', () => {
    const text = ['Some paragraph.', '', '    D26 (build-folders) example', ''].join('\n')
    expect(violationsFor(text, 'markdown')).toEqual([])
  })

  it('does not skip a four-space-indented line with no preceding blank line — paragraph continuation, not code', () => {
    const text = ['See the note below.', '    D26 needs a link.'].join('\n')
    const violations = violationsFor(text, 'markdown')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('unlinked')
  })

  it('does not skip a two-space-indented line — sub-four-space indents are paragraphs, not code', () => {
    const text = ['- Some item', '  D26 needs a link.'].join('\n')
    const violations = violationsFor(text, 'markdown')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('unlinked')
  })

  it('skips a bare tag under a leading tab — a tab measures four columns', () => {
    const text = ['Some paragraph.', '', '\tD26 (build-folders) example'].join('\n')
    expect(violationsFor(text, 'markdown')).toEqual([])
  })
})

describe('a decisions.md definition line is not a citation of itself', () => {
  it('finds zero citations on the defining line', () => {
    const text = '- <a id="d26"></a>**D26 (build-folders) — One folder per build.**'
    expect(findCitations(text, 'markdown')).toEqual([])
  })

  it('still checks a cross-reference elsewhere in the same file', () => {
    const text = [
      '- <a id="d26"></a>**D26 (build-folders) — One folder per build.**',
      '- <a id="c4"></a>**C4 (never-destroy)** restores it, see D26.',
    ].join('\n')
    const definitions = parseDefinitions(text)
    const violations = findCitations(text, 'markdown')
      .map((citation) => checkCitation(citation, definitions, 'markdown'))
      .filter((violation): violation is Omit<Violation, 'file' | 'line'> => violation !== null)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe('unlinked')
  })
})

describe('scanRepo — walks the surfaces and honors the skip list', () => {
  const created: string[] = []

  afterAll(() => {
    for (const dir of created.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function makeTree(): string {
    const dir = mkdtempSync(join(tmpdir(), 'check-refs-'))
    created.push(dir)
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    mkdirSync(join(dir, 'research'), { recursive: true })
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    mkdirSync(join(dir, 'test'), { recursive: true })
    mkdirSync(join(dir, 'examples'), { recursive: true })

    writeFileSync(join(dir, 'docs', 'decisions.md'), '- <a id="d1"></a>**D1 (lean-cli) — A deterministic, lean CLI.**\n')
    writeFileSync(join(dir, 'docs', 'example.md'), 'D1 needs a link.\n')
    writeFileSync(join(dir, 'src', 'example.ts'), "// clean\nconst msg = 'D1 (lean-cli) is the foundation'\n")
    writeFileSync(join(dir, 'research', 'notes.md'), 'D1 bare, but research/ is out of scope.\n')
    writeFileSync(join(dir, '.plumbbob', 'build.md'), 'D1 bare, but .plumbbob/ is out of scope.\n')
    writeFileSync(join(dir, 'test', 'scratch.test.ts'), "it('D1: bare', () => {})\n")
    writeFileSync(join(dir, 'CHANGELOG.md'), 'D1 bare, but CHANGELOG.md is out of scope.\n')
    writeFileSync(join(dir, 'examples', 'intent.md'), '- D1 (some-fictional-decision): a demo build\'s own local numbering.\n')
    return dir
  }

  it('scans only docs/**/*.md and src/**/*.ts, skipping the rest (including examples/, D6 (records-stay))', () => {
    const dir = makeTree()
    const { violations, filesScanned } = scanRepo(dir)
    expect(filesScanned).toBe(3) // docs/decisions.md, docs/example.md, src/example.ts
    expect(violations).toHaveLength(1)
    expect(violations[0]?.file).toBe(join('docs', 'example.md'))
    expect(violations[0]?.kind).toBe('unlinked')
    expect(violations[0]?.line).toBe(1)
  })
})
