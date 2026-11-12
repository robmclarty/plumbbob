import { describe, expect, it } from 'vitest'
import { matchesSeam, parseBuildScope, parseBuildTitle, parseStepFields, parseStepMeta, parseStepSeam, scrapeBullets } from '../intent.ts'

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

  it('refuses a token holding `!`, as a glob, naming the token and D23 (no-glob-seams)', () => {
    const r = parseStepSeam(intentWith(['1. [ ] Step, **done when:** ok', '   - seam: `src/!a.ts`'].join('\n')), 1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toBe(
      "step 1's seam token `src/!a.ts` is a glob; seams are exact paths or `dir/` grants, per D23 (no-glob-seams).",
    )
  })

  it('refuses a token holding a backslash, naming the token and D23 (no-glob-seams)', () => {
    const r = parseStepSeam(intentWith(['1. [ ] Step, **done when:** ok', '   - seam: `src\\a.ts`'].join('\n')), 1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toBe(
      "step 1's seam token `src\\a.ts` holds a backslash; seams are POSIX paths, per D23 (no-glob-seams).",
    )
  })

  it.each([
    ['an empty segment', 'src//a.ts'],
    ['a `.` segment', 'src/./a.ts'],
    ['a `..` segment', 'src/../a.ts'],
    ['a leading `..`', '../a.ts'],
    ['a `.` left after the `./` strip', '././a.ts'],
    ['a `..` grant', 'src/../'],
    ['a doubled grant slash', 'src//'],
  ])('refuses %s, naming the token and D23 (no-glob-seams)', (_label, token) => {
    const r = parseStepSeam(intentWith(['1. [ ] Step, **done when:** ok', `   - seam: \`${token}\``].join('\n')), 1)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toBe(
      `step 1's seam token \`${token}\` has an empty, \`.\` or \`..\` segment; seams are plain repo-relative paths, per D23 (no-glob-seams).`,
    )
  })

  it('reads a leading `/` as absolute, not as an empty segment', () => {
    const r = parseStepSeam(intentWith(['1. [ ] Step, **done when:** ok', '   - seam: `/src/a.ts`'].join('\n')), 1)
    expect(!r.ok && r.error).toBe("step 1's seam token `/src/a.ts` is absolute; seams are repo-relative.")
  })

  it('still strips a leading `./`, and passes a dotted name that is not a dot segment', () => {
    const r = parseStepSeam(intentWith(['1. [ ] Step, **done when:** ok', '   - seam: `./src/a.ts`, `.github/`, `a..b.ts`'].join('\n')), 1)
    expect(r.ok && r.seam).toEqual(['src/a.ts', '.github/', 'a..b.ts'])
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

describe('parseStepFields', () => {
  function stepWith(...subLines: string[]): string {
    return intentWith(['1. [ ] One, **done when:** ok', '   - seam: `a.ts`', '2. [ ] Two, **done when:** ok', '   - seam: `b.ts`', ...subLines].join('\n'))
  }

  function findings(intent: string): ReadonlyArray<string> {
    const r = parseStepFields(intent, 2)
    return r.ok ? [] : r.findings
  }

  it('reads a step carrying none of the lines as all absent', () => {
    const r = parseStepFields(stepWith('   - model: sonnet (mechanical)'), 2)
    expect(r).toEqual({ ok: true, fields: { after: null, stop: null, effort: null, notes: [] } })
  })

  it('reads every value the three lines take, and the notes in order', () => {
    const r = parseStepFields(
      stepWith('   - after: 1, 3-4', '   - stop: structural', '   - effort: xhigh', '   - note: first `note`', '   - note: second'),
      2,
    )
    expect(r).toEqual({
      ok: true,
      fields: { after: [{ from: 1, to: 1 }, { from: 3, to: 4 }], stop: 'structural', effort: 'xhigh', notes: ['first `note`', 'second'] },
    })
  })

  it('reads `after: none` as waiting on nothing', () => {
    const r = parseStepFields(stepWith('   - after: none'), 2)
    expect(r.ok && r.fields.after).toBe('none')
  })

  it.each(['planned', 'structural'])('reads `stop: %s`', (value) => {
    const r = parseStepFields(stepWith(`   - stop: ${value}`), 2)
    expect(r.ok && r.fields.stop).toBe(value)
  })

  it.each(['low', 'medium', 'high', 'xhigh', 'max'])('reads `effort: %s`', (value) => {
    const r = parseStepFields(stepWith(`   - effort: ${value}`), 2)
    expect(r.ok && r.fields.effort).toBe(value)
  })

  it('joins a wrapped note line and drops a trailing HTML comment', () => {
    const r = parseStepFields(stepWith('   - note: the refusals sit at', '     `src/lib/intent.ts:114` <!-- aside -->', '   - effort: low'), 2)
    expect(r.ok && r.fields.notes).toEqual(['the refusals sit at `src/lib/intent.ts:114`'])
    expect(r.ok && r.fields.effort).toBe('low')
  })

  it.each(['2-', '3-1', 'none, 3', 'two', '0', '1 2'])('refuses `after: %s`, naming the step', (value) => {
    expect(findings(stepWith(`   - after: ${value}`))).toEqual([
      `step 2's \`after:\` line reads \`${value}\`; it takes step numbers and spans, such as \`2, 4-5\`, or \`none\`.`,
    ])
  })

  it('refuses a malformed stop line, naming the step', () => {
    expect(findings(stepWith('   - stop: soon'))).toEqual(["step 2's `stop:` line reads `soon`; it takes `planned` or `structural`."])
  })

  it('refuses a malformed effort line, naming the step', () => {
    expect(findings(stepWith('   - effort: hard'))).toEqual([
      "step 2's `effort:` line reads `hard`; it takes `low`, `medium`, `high`, `xhigh` or `max`.",
    ])
  })

  it('refuses an empty line, naming the step', () => {
    expect(findings(stepWith('   - effort:'))).toEqual([
      "step 2's `effort:` line is empty; it takes `low`, `medium`, `high`, `xhigh` or `max`.",
    ])
  })

  it.each(['after: 1', 'stop: planned', 'effort: low'])('refuses a doubled `%s` line', (line) => {
    const key = line.split(':')[0] ?? ''
    expect(findings(stepWith(`   - ${line}`, `   - ${line}`))).toEqual([`step 2 has more than one \`${key}:\` line.`])
  })

  it('names every finding on the step at once', () => {
    expect(findings(stepWith('   - after: x', '   - stop: soon'))).toHaveLength(2)
  })

  it('reads only its own step, never the next', () => {
    const intent = intentWith(['1. [ ] One, **done when:** ok', '   - seam: `a.ts`', '2. [ ] Two, **done when:** ok', '   - effort: max'].join('\n'))
    const r = parseStepFields(intent, 1)
    expect(r.ok && r.fields.effort).toBeNull()
  })

  it('refuses a step the plan lacks', () => {
    expect(parseStepFields(stepWith(), 9)).toEqual({ ok: false, findings: ['intent.md has no step 9 under "## Steps".'] })
  })
})
