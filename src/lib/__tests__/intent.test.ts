import { describe, expect, it } from 'vitest'
import { matchesSeam, parseStepSeam } from '../intent.ts'

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
