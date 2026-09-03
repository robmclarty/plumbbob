import { describe, expect, it } from 'vitest'
import { appendToSection, checkpointLogLine, setCurrentStep, syncStepsSection } from '../buildlog.ts'
import type { Step } from '../orient.ts'

const step = (n: number, done: boolean, title: string): Step => ({
  n,
  done,
  title,
  planned: true,
  doneWhen: null,
  model: null,
  line: n,
})

// The relevant top-half shape of templates/build-log.md.
const LEDGER = `# Build log — Demo

**Current step:** none (at the boundary)
**Heavy check:** checkride

## Steps

*(Mirror of intent.md's Steps, with live status. Only ONE step is in flight.)*

- ☐ 1. <step>

## Park list

> guidance line
`

const DOC = `# Build log

## Park list

> guidance line

## Log

*(instructions)*

## Harvest

- (none yet)
`

describe('appendToSection', () => {
  it('appends after the last non-blank line of the named section', () => {
    const out = appendToSection(DOC, 'Park list', '- [ ] new idea')
    expect(out).not.toBeNull()
    const lines = (out as string).split('\n')
    // lands after the guidance line, before the next `## ` heading
    expect(lines.indexOf('- [ ] new idea')).toBeGreaterThan(lines.indexOf('> guidance line'))
    expect(lines.indexOf('- [ ] new idea')).toBeLessThan(lines.indexOf('## Log'))
  })

  it('opens the list a blank line after prose, so the first park lints clean (MD032)', () => {
    const lines = (appendToSection(DOC, 'Park list', '- [ ] new idea') as string).split('\n')
    expect(lines[lines.indexOf('> guidance line') + 1]).toBe('')
    expect(lines[lines.indexOf('> guidance line') + 2]).toBe('- [ ] new idea')
  })

  it('opens the Log a blank line after the instructions paragraph (first checkpoint)', () => {
    const lines = (appendToSection(DOC, 'Log', '- 2026-06-30 — step 1 checkpointed') as string).split('\n')
    expect(lines[lines.indexOf('*(instructions)*') + 1]).toBe('')
    expect(lines[lines.indexOf('*(instructions)*') + 2]).toBe('- 2026-06-30 — step 1 checkpointed')
  })

  it('appends directly under an existing list item, no extra blank', () => {
    const once = appendToSection(DOC, 'Park list', '- [ ] first') as string
    const lines = (appendToSection(once, 'Park list', '- [ ] second') as string).split('\n')
    expect(lines[lines.indexOf('- [ ] first') + 1]).toBe('- [ ] second')
  })

  it('appends into a section that ends at EOF', () => {
    const out = appendToSection(DOC, 'Harvest', '- blocker: folded into intent') as string
    expect(out.trimEnd().endsWith('- blocker: folded into intent')).toBe(true)
  })

  it('does not bleed into the following section', () => {
    const out = appendToSection(DOC, 'Log', '- 2026-06-30 — step 1 checkpointed') as string
    const lines = out.split('\n')
    const logIdx = lines.indexOf('- 2026-06-30 — step 1 checkpointed')
    const harvestIdx = lines.indexOf('## Harvest')
    expect(logIdx).toBeGreaterThan(-1)
    expect(logIdx).toBeLessThan(harvestIdx)
  })

  it('returns null when the section is absent', () => {
    expect(appendToSection(DOC, 'Nope', '- x')).toBeNull()
  })
})

describe('setCurrentStep', () => {
  it('replaces the Current step line with the given label', () => {
    const out = setCurrentStep(LEDGER, '2 — Wire the mirror') as string
    expect(out).toContain('**Current step:** 2 — Wire the mirror')
    expect(out).not.toContain('**Current step:** none (at the boundary)')
  })

  it('does not disturb the rest of the doc', () => {
    const out = setCurrentStep(LEDGER, 'none (at the boundary)') as string
    expect(out).toContain('**Heavy check:** checkride')
    expect(out).toContain('- ☐ 1. <step>')
  })

  it('returns null when the Current step line is absent', () => {
    expect(setCurrentStep('# Build log\n\n## Steps\n', 'anything')).toBeNull()
  })
})

describe('syncStepsSection', () => {
  it('regenerates the ☑/☐ list from parsed steps, replacing the placeholder', () => {
    const out = syncStepsSection(LEDGER, [step(1, true, 'First'), step(2, false, 'Second')]) as string
    expect(out).toContain('- ☑ 1. First')
    expect(out).toContain('- ☐ 2. Second')
    expect(out).not.toContain('- ☐ 1. <step>')
  })

  it('preserves the instructions paragraph and the surrounding sections', () => {
    const out = syncStepsSection(LEDGER, [step(1, false, 'Only')]) as string
    expect(out).toContain('*(Mirror of intent.md')
    expect(out).toContain('**Current step:** none (at the boundary)')
    expect(out).toContain('> guidance line')
  })

  it('does not bleed the list into the next section', () => {
    const out = syncStepsSection(LEDGER, [step(1, true, 'First'), step(2, false, 'Second')]) as string
    const lines = out.split('\n')
    expect(lines.indexOf('- ☐ 2. Second')).toBeLessThan(lines.indexOf('## Park list'))
  })

  it('re-syncs in place on a second run (owns only its own list lines)', () => {
    const once = syncStepsSection(LEDGER, [step(1, false, 'First')]) as string
    const twice = syncStepsSection(once, [step(1, true, 'First'), step(2, false, 'Second')]) as string
    expect(twice.match(/- [☑☐] 1\. First/g)?.length).toBe(1)
    expect(twice).toContain('- ☑ 1. First')
    expect(twice).toContain('- ☐ 2. Second')
  })

  it('renders an empty mirror when there are no steps', () => {
    const out = syncStepsSection(LEDGER, []) as string
    expect(out).not.toContain('- ☐ 1. <step>')
    expect(out).toContain('*(Mirror of intent.md')
    expect(out).toContain('## Park list')
  })

  it('returns null when the Steps section is absent', () => {
    expect(syncStepsSection('# Build log\n\n## Log\n', [step(1, false, 'x')])).toBeNull()
  })
})

describe('checkpointLogLine', () => {
  it('includes date, step, short sha, and title', () => {
    const line = checkpointLogLine('2026-06-30', 3, 'a1b2c3d4e5f6', 'Wire the host flag')
    expect(line).toBe('- 2026-06-30 — step 3 checkpointed · a1b2c3d4e — Wire the host flag')
  })

  it('omits the title tail when none is known', () => {
    expect(checkpointLogLine('2026-06-30', 3, 'a1b2c3d4e5f6', null)).toBe(
      '- 2026-06-30 — step 3 checkpointed · a1b2c3d4e',
    )
    expect(checkpointLogLine('2026-06-30', 3, 'a1b2c3d4e5f6', '')).toBe('- 2026-06-30 — step 3 checkpointed · a1b2c3d4e')
  })
})

describe('checkpointLogLine — the compact stats receipt (research/07 2b)', () => {
  it('appends the suffix in parens when stats accrued', () => {
    expect(checkpointLogLine('2026-07-11', 2, 'a1b2c3d4e5f6', 'Wire it', '2 red, 34m')).toBe(
      '- 2026-07-11 — step 2 checkpointed · a1b2c3d4e — Wire it (2 red, 34m)',
    )
  })

  it('reads exactly as before when nothing accrued (null or empty)', () => {
    expect(checkpointLogLine('2026-07-11', 2, 'a1b2c3d4e5f6', 'Wire it', null)).toBe(
      '- 2026-07-11 — step 2 checkpointed · a1b2c3d4e — Wire it',
    )
    expect(checkpointLogLine('2026-07-11', 2, 'a1b2c3d4e5f6', 'Wire it', '')).toBe(
      '- 2026-07-11 — step 2 checkpointed · a1b2c3d4e — Wire it',
    )
  })
})
