import { describe, expect, it } from 'vitest'
import { matchesSeam, parseBuildScope, parseBuildTitle, parseStepFields, parseStepMeta, parseStepProof, parseStepSeam, scrapeBullets } from '../intent.ts'

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
    expect(parseStepMeta(intent, 1)).toEqual({ title: 'First thing', doneWhen: 'it works', proof: { command: null, text: 'it works' } })
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
      proof: { command: null, text: 'the input JSON is composed from intent.md and settings, warnings surfaced' },
    })
  })

  it('handles a checked box and returns empty strings for an unparseable step', () => {
    const intent = intentWith(['1. [x] Done step — **done when:** shipped', '   - seam: `a.ts`'].join('\n'))
    expect(parseStepMeta(intent, 1).title).toBe('Done step')
    expect(parseStepMeta(intent, 9)).toEqual({ title: '', doneWhen: '', proof: { command: null, text: '' } })
  })

  it('reads a title-only step with no done-when marker', () => {
    const intent = intentWith(['1. [ ] Just a title', '   - seam: `a.ts`'].join('\n'))
    expect(parseStepMeta(intent, 1)).toEqual({ title: 'Just a title', doneWhen: '', proof: { command: null, text: '' } })
  })

  it('strips the comma separator of the scaffold step form — D78 (em-dash-ban)', () => {
    const intent = intentWith(['1. [ ] First thing, **done when:** it works', '   - seam: `a.ts`'].join('\n'))
    expect(parseStepMeta(intent, 1)).toEqual({ title: 'First thing', doneWhen: 'it works', proof: { command: null, text: 'it works' } })
  })

  it('reads the proof line of a step, the whole opener as its title, and keeps doneWhen as the proof text', () => {
    const intent = intentWith(
      ['1. [ ] feat(limiter): read the cap', '   - seam: `a.ts`', '   - proof: `pnpm vitest run limiter` passes; the 6th request returns 429'].join('\n'),
    )
    expect(parseStepMeta(intent, 1)).toEqual({
      title: 'feat(limiter): read the cap',
      doneWhen: '`pnpm vitest run limiter` passes; the 6th request returns 429',
      proof: { command: 'pnpm vitest run limiter', text: '`pnpm vitest run limiter` passes; the 6th request returns 429' },
    })
  })

  it('never refuses a doubled proof line: the first one is read', () => {
    const intent = intentWith(['1. [ ] Twice', '   - proof: `true` first', '   - proof: `false` second'].join('\n'))
    expect(parseStepMeta(intent, 1).proof).toEqual({ command: 'true', text: '`true` first' })
  })
})

describe('parseStepProof', () => {
  const step = (...sub: string[]): string => intentWith(['1. [ ] A step', '   - seam: `a.ts`', ...sub].join('\n'))

  it('takes the code span that opens the line as the command, and the whole line as the text', () => {
    expect(parseStepProof(step('   - proof: `pnpm test` passes'), 1)).toEqual({
      ok: true,
      proof: { command: 'pnpm test', text: '`pnpm test` passes' },
    })
  })

  it('reads a proof that opens on words as a manual proof, a later span staying prose', () => {
    expect(parseStepProof(step('   - proof: the page loads; `curl localhost` answers 200'), 1)).toEqual({
      ok: true,
      proof: { command: null, text: 'the page loads; `curl localhost` answers 200' },
    })
  })

  it('takes only the opening span, never a second one', () => {
    const parsed = parseStepProof(step('   - proof: `a` then `b`'), 1)
    expect(parsed).toEqual({ ok: true, proof: { command: 'a', text: '`a` then `b`' } })
  })

  it('joins a wrapped line up to the next sub-bullet, and drops a trailing HTML comment', () => {
    const intent = step('   - proof: `pnpm test` passes, <!-- `not this` -->', '     and the log is quiet', '   - note: `nor this`')
    expect(parseStepProof(intent, 1)).toEqual({
      ok: true,
      proof: { command: 'pnpm test', text: '`pnpm test` passes, and the log is quiet' },
    })
  })

  it('reports a doubled proof line and an empty one as findings that name the step', () => {
    expect(parseStepProof(step('   - proof: `a`', '   - proof: `b`'), 1)).toEqual({
      ok: false,
      findings: ['step 1 has more than one `proof:` line.'],
    })
    const empty = parseStepProof(step('   - proof:'), 1)
    expect(empty.ok).toBe(false)
    expect(empty.ok ? [] : empty.findings).toEqual([expect.stringContaining("step 1's `proof:` line is empty")])
  })

  it('reads the older done-when clause as a proof with no command, even where it opens on a span', () => {
    const intent = intentWith(['1. [ ] Old, **done when:** `pnpm test` passes', '   - seam: `a.ts`'].join('\n'))
    expect(parseStepProof(intent, 1)).toEqual({ ok: true, proof: { command: null, text: '`pnpm test` passes' } })
  })

  it('lets the proof line win over the older clause', () => {
    const intent = intentWith(['1. [ ] Both, **done when:** the old words', '   - proof: `true` the new words'].join('\n'))
    expect(parseStepProof(intent, 1)).toEqual({ ok: true, proof: { command: 'true', text: '`true` the new words' } })
    expect(parseStepMeta(intent, 1).title).toBe('Both')
  })

  it('never reads a bullet nested under another sub-bullet as the step\'s proof', () => {
    const nested = step('   - note: an example', '     - proof: `touch nested-ran.txt` never runs')
    expect(parseStepProof(nested, 1)).toEqual({ ok: true, proof: null })
    const beside = step('   - proof: `true` the real one', '   - note: an example', '     - proof: `false` a sample')
    expect(parseStepProof(beside, 1)).toEqual({ ok: true, proof: { command: 'true', text: '`true` the real one' } })
  })

  it('stops at the blank line that ends the last step, so trailing prose is no second proof', () => {
    const lines = ['1. [ ] A step', '   - seam: `a.ts`', '   - proof: `true` holds', '', 'A proof line is written like so:', '', '- proof: `false` a sample']
    expect(parseStepProof(intentWith(lines.join('\n')), 1)).toEqual({ ok: true, proof: { command: 'true', text: '`true` holds' } })
    const only = ['1. [ ] A step', '   - seam: `a.ts`', '', '- proof: `false` a sample', '   - proof: `false` indented under the sample']
    expect(parseStepProof(intentWith(only.join('\n')), 1)).toEqual({ ok: true, proof: null })
    const margin = ['1. [ ] A step', '   - seam: `a.ts`', '- proof: `false` a list of its own']
    expect(parseStepProof(intentWith(margin.join('\n')), 1)).toEqual({ ok: true, proof: null })
  })

  it('keeps a sub-bullet that follows a blank line inside the item', () => {
    const loose = ['1. [ ] A step', '', '   - seam: `a.ts`', '', '   - proof: `true` holds'].join('\n')
    expect(parseStepProof(intentWith(loose), 1)).toEqual({ ok: true, proof: { command: 'true', text: '`true` holds' } })
  })

  it('never reads a line inside a fenced block as the step\'s proof', () => {
    const fenced = step('   - note: written like so', '', '   ```md', '   - proof: `false` a sample', '   ```', '', '   - proof: `true` holds')
    expect(parseStepProof(fenced, 1)).toEqual({ ok: true, proof: { command: 'true', text: '`true` holds' } })
    const onlyFenced = step('   ~~~', '   - proof: `false` a sample', '   ~~~')
    expect(parseStepProof(onlyFenced, 1)).toEqual({ ok: true, proof: null })
  })

  it('keeps a comment opener inside the command, and still drops a trailing comment', () => {
    expect(parseStepProof(step('   - proof: `grep -c "<!--" a.html` passes'), 1)).toEqual({
      ok: true,
      proof: { command: 'grep -c "<!--" a.html', text: '`grep -c "<!--" a.html` passes' },
    })
    expect(parseStepProof(step('   - proof: `grep -c "<!--" a.html` passes <!-- a note with `a span` -->'), 1)).toEqual({
      ok: true,
      proof: { command: 'grep -c "<!--" a.html', text: '`grep -c "<!--" a.html` passes' },
    })
    expect(parseStepProof(step('   - proof: an unclosed ` tick <!-- gone -->'), 1)).toEqual({
      ok: true,
      proof: { command: null, text: 'an unclosed ` tick' },
    })
    expect(parseStepProof(step('   - proof: `` echo `<!--` `` runs'), 1)).toMatchObject({ ok: true, proof: { text: '`` echo `<!--` `` runs' } })
  })

  it('reads the older clause on a sub-bullet, bold or bare, as a proof with no command', () => {
    expect(parseStepProof(step('   - **done when:** `pnpm test` passes'), 1)).toEqual({ ok: true, proof: { command: null, text: '`pnpm test` passes' } })
    expect(parseStepProof(step('   - done when: it works'), 1)).toEqual({ ok: true, proof: { command: null, text: 'it works' } })
    expect(parseStepProof(step('   - **Done when**: it works,', '     twice'), 1)).toEqual({ ok: true, proof: { command: null, text: 'it works, twice' } })
    const bare = intentWith(['1. [ ] Old, done when: it works', '   - seam: `a.ts`'].join('\n'))
    expect(parseStepProof(bare, 1)).toEqual({ ok: true, proof: { command: null, text: 'it works' } })
    expect(parseStepMeta(bare, 1).title).toBe('Old')
    const nested = step('   - note: the old way', '     - **done when:** a sample')
    expect(parseStepProof(nested, 1)).toEqual({ ok: true, proof: null })
  })

  it('reads a step with neither as no proof, and a missing step as a finding', () => {
    expect(parseStepProof(step(), 1)).toEqual({ ok: true, proof: null })
    expect(parseStepProof(step(), 9)).toEqual({ ok: false, findings: ['intent.md has no step 9 under "## Steps".'] })
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
