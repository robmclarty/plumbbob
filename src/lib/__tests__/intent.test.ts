import { describe, expect, it } from 'vitest'
import { matchesSeam, parseBuildScope, parseBuildTitle, parseStepMeta, parseStepSeam, scrapeBullets } from '../intent.ts'

function intentWith(stepsBody: string): string {
  return `# Title\n\n## Frame\n\nstuff\n\n## Steps\n\n${stepsBody}\n\n## Open questions\n\n- none\n`
}

describe('parseStepSeam', () => {
  it('extracts the seam tokens of the nth step', () => {
    const intent = intentWith(
      ['1. [ ] First — **done when:** ok', '   - seam: `a.ts`, `b.ts`', '2. [ ] Second — **done when:** ok', '   - seam: `c.ts`'].join('\n'),
    )
    const r1 = parseStepSeam(intent, 1)
    expect(r1.ok).toBe(true)
    expect(r1.ok && r1.seam).toEqual(['a.ts', 'b.ts'])

    const r2 = parseStepSeam(intent, 2)
    expect(r2.ok && r2.seam).toEqual(['c.ts'])
  })

  it('collects tokens across wrapped seam continuation lines', () => {
    const intent = intentWith(['1. [ ] Big — **done when:** ok', '   - seam: `a.ts`, `b.ts`,', '     `c.ts`, `d.ts`'].join('\n'))
    const r = parseStepSeam(intent, 1)
    expect(r.ok && r.seam).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts'])
  })

  it('a following sub-bullet is not a seam continuation, even when it carries backticks — D62 (model-recommendation)', () => {
    // A `- model:` line written with backticks (against the convention) must end
    // the seam declaration, never leak its content in as seam tokens.
    const intent = intentWith(
      ['1. [ ] Step — **done when:** ok', '   - seam: `a.ts`,', '     `b.ts`', '   - model: `sonnet` — mechanical'].join('\n'),
    )
    const r = parseStepSeam(intent, 1)
    expect(r.ok && r.seam).toEqual(['a.ts', 'b.ts'])
  })

  it('ignores backticks in the done-when line and a trailing HTML comment', () => {
    const intent = intentWith(
      [
        '1. [ ] Step — **done when:** `pnpm check` exits 0',
        '   - seam: `src/cli.ts`, `dir/`',
        '     <!-- note: `not-a-seam` `also-not` -->',
      ].join('\n'),
    )
    const r = parseStepSeam(intent, 1)
    expect(r.ok && r.seam).toEqual(['src/cli.ts', 'dir/'])
  })

  it('allows a `dir/` prefix grant token', () => {
    const intent = intentWith(['1. [ ] Step — **done when:** ok', '   - seam: `test/fixtures/`'].join('\n'))
    const r = parseStepSeam(intent, 1)
    expect(r.ok && r.seam).toEqual(['test/fixtures/'])
  })

  it('refuses a glob token', () => {
    const intent = intentWith(['1. [ ] Step — **done when:** ok', '   - seam: `src/*.ts`'].join('\n'))
    const r = parseStepSeam(intent, 1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('glob')
  })

  it('refuses an absolute token', () => {
    const intent = intentWith(['1. [ ] Step — **done when:** ok', '   - seam: `/etc/passwd`'].join('\n'))
    const r = parseStepSeam(intent, 1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('absolute')
  })

  it('refuses a step with no seam line', () => {
    const intent = intentWith('1. [ ] Step — **done when:** ok')
    const r = parseStepSeam(intent, 1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('no `seam:`')
  })

  it('refuses a step with more than one seam line', () => {
    const intent = intentWith(['1. [ ] Step — **done when:** ok', '   - seam: `a.ts`', '   - seam: `b.ts`'].join('\n'))
    const r = parseStepSeam(intent, 1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('more than one')
  })

  it('refuses a missing step number', () => {
    const intent = intentWith(['1. [ ] Step — **done when:** ok', '   - seam: `a.ts`'].join('\n'))
    const r = parseStepSeam(intent, 9)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('no step 9')
  })

  it('refuses intent with no Steps section', () => {
    const r = parseStepSeam('# Title\n\nno steps here\n', 1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('## Steps')
  })
})

describe('parseBuildTitle', () => {
  it('returns the first `# ` heading', () => {
    expect(parseBuildTitle('<!-- a comment -->\n\n# My Build — with an em dash\n\n## Frame\n')).toBe(
      'My Build — with an em dash',
    )
  })

  it('is empty when there is no heading', () => {
    expect(parseBuildTitle('no heading here\n## Frame\n')).toBe('')
  })
})

describe('parseStepMeta', () => {
  it('splits the title and done-when of a step', () => {
    const intent = intentWith(['1. [ ] First thing — **done when:** it works', '   - seam: `a.ts`'].join('\n'))
    expect(parseStepMeta(intent, 1)).toEqual({ title: 'First thing', doneWhen: 'it works' })
  })

  it('joins a wrapped done-when up to the seam sub-bullet', () => {
    const intent = intentWith(
      [
        '1. [ ] Big step — **done when:** the input JSON is composed',
        '   from intent.md and settings, warnings surfaced',
        '   - seam: `a.ts`',
      ].join('\n'),
    )
    expect(parseStepMeta(intent, 1)).toEqual({
      title: 'Big step',
      doneWhen: 'the input JSON is composed from intent.md and settings, warnings surfaced',
    })
  })

  it('handles a checked box and returns empty strings for an unparseable step', () => {
    const intent = intentWith(['1. [x] Done step — **done when:** shipped', '   - seam: `a.ts`'].join('\n'))
    expect(parseStepMeta(intent, 1).title).toBe('Done step')
    expect(parseStepMeta(intent, 9)).toEqual({ title: '', doneWhen: '' })
  })

  it('reads a title-only step with no done-when marker', () => {
    const intent = intentWith(['1. [ ] Just a title', '   - seam: `a.ts`'].join('\n'))
    expect(parseStepMeta(intent, 1)).toEqual({ title: 'Just a title', doneWhen: '' })
  })

  it('strips the comma separator of the scaffold step form — D78 (em-dash-ban)', () => {
    const intent = intentWith(['1. [ ] First thing, **done when:** it works', '   - seam: `a.ts`'].join('\n'))
    expect(parseStepMeta(intent, 1)).toEqual({ title: 'First thing', doneWhen: 'it works' })
  })
})

describe('scrapeBullets', () => {
  const doc = [
    '# Title',
    '',
    '## Decisions',
    '',
    '- D1: first decision — *because* reasons',
    '  that wrap onto a second line',
    '- D2: second decision',
    '',
    '## Constraints',
    '',
    '- C1: a lone constraint',
    '',
    '## Steps',
    '',
    '1. [ ] Step',
    '   - seam: `a.ts`',
  ].join('\n')

  it('joins wrapped continuation lines into one verbatim bullet', () => {
    const { items, skipped } = scrapeBullets(doc, '## Decisions')
    expect(items).toEqual([
      'D1: first decision — *because* reasons that wrap onto a second line',
      'D2: second decision',
    ])
    expect(skipped).toEqual([])
  })

  it('scopes to the named heading', () => {
    expect(scrapeBullets(doc, '## Constraints').items).toEqual(['C1: a lone constraint'])
  })

  it('is empty when the heading is absent', () => {
    expect(scrapeBullets(doc, '## Nope')).toEqual({ items: [], skipped: [] })
  })

  it('reports a malformed (non-bullet, non-indented) line as skipped without dropping the good bullets', () => {
    const malformed = ['## Decisions', '', '- D1: fine', 'D2 forgot its dash', '- D3: fine again', ''].join('\n')
    const { items, skipped } = scrapeBullets(malformed, '## Decisions')
    expect(items).toEqual(['D1: fine', 'D3: fine again'])
    expect(skipped).toEqual(['D2 forgot its dash'])
  })
})

describe('parseBuildScope', () => {
  it('reads the `**Scope:**` header value', () => {
    expect(parseBuildScope('**Phase**: frame\n**Scope:** commit-subject\n\n## Frame\n')).toBe('commit-subject')
  })

  it('strips a trailing HTML comment note', () => {
    expect(parseBuildScope('**Scope:** commit-subject  <!-- the per-build default scope (D4) -->\n')).toBe(
      'commit-subject',
    )
  })

  it('parses an angle-bracket placeholder as absent — D68 (conventional-subjects)', () => {
    expect(parseBuildScope('**Scope:** <scope>\n')).toBeNull()
  })

  it('parses an empty value as absent — D68 (conventional-subjects)', () => {
    expect(parseBuildScope('**Scope:**\n')).toBeNull()
    expect(parseBuildScope('**Scope:**   \n')).toBeNull()
  })

  it('is absent when the header is missing entirely — back-compat, D68 (conventional-subjects)', () => {
    expect(parseBuildScope('# Title\n\n## Frame\n\nno scope header here\n')).toBeNull()
  })
})

describe('matchesSeam', () => {
  const tokens = ['src/cli.ts', 'test/fixtures/']
  it('matches an exact file token', () => {
    expect(matchesSeam('src/cli.ts', tokens)).toBe(true)
  })
  it('matches under a dir/ prefix grant', () => {
    expect(matchesSeam('test/fixtures/a/b.ts', tokens)).toBe(true)
  })
  it('rejects a path outside every token', () => {
    expect(matchesSeam('src/other.ts', tokens)).toBe(false)
    expect(matchesSeam('test/fixtures', tokens)).toBe(false) // the dir itself, no trailing slash
  })
})
