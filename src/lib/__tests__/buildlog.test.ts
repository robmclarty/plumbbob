import { describe, expect, it } from 'vitest'
import {
  appendHarvest,
  appendToSection,
  checkpointLogLine,
  flipParks,
  harvestLines,
  setCurrentStep,
  stopLogLine,
  syncStepsSection,
} from '../buildlog.ts'
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

// The lower half of templates/build-log.md, with three parks, one harvested.
const PARKED = `## Park list

> guidance line

- [ ] first idea
- [x] second idea
- [ ] third idea (tangent)

## Harvest  *(run \`/plumbbob:harvest\` at each step boundary, after green)*

Harvest results this boundary:

- (none yet)

## Log

*(instructions)*
`

describe('the harvest record — D104 (harvest-records)', () => {
  it('flips the parks it names by handle, counting harvested lines, and leaves the rest', () => {
    const out = flipParks(PARKED, [1, 2, 3]) as string
    expect(out).toContain('- [x] first idea\n- [x] second idea\n- [x] third idea (tangent)')
    expect(flipParks(PARKED, [3])).toContain('- [ ] first idea\n- [x] second idea\n- [x] third idea (tangent)')
    expect(flipParks(PARKED, [9])).toBe(PARKED)
    expect(flipParks('# no park list\n', [1])).toBeNull()
  })

  it('writes one dated line for where it ran, then one per park with its class, handle, text, and reason', () => {
    const settled = [
      { handle: 1, kind: 'tangent', text: 'first idea', reason: 'cosmetic' },
      { handle: 3, kind: 'blocker', text: 'third idea (tangent)', reason: '' },
    ]
    expect(harvestLines('2026-10-18', "at range 3 of 5's stop", settled)).toEqual([
      "- 2026-10-18, at range 3 of 5's stop: 2 parked ideas, classified.",
      '- **tangent**: park 1 · first idea → cosmetic',
      '- **blocker**: park 3 · third idea (tangent)',
    ])
    expect(harvestLines('2026-10-18', 'at the step 9 boundary', [])).toEqual([])
  })

  it('drops the placeholder on the first harvest, and appends beneath the last one after it', () => {
    const first = appendHarvest(PARKED, ['- one', '- two']) as string
    expect(first).not.toContain('(none yet)')
    expect(first).toContain('Harvest results this boundary:\n\n- one\n- two\n\n## Log')
    const second = appendHarvest(first, ['- three']) as string
    expect(second).toContain('- one\n- two\n- three\n\n## Log')
    expect(appendHarvest(PARKED, [])).toBe(PARKED)
    expect(appendHarvest('# no harvest\n', ['- one'])).toBeNull()
  })

  it("dates the range's Log line and names its stop", () => {
    expect(stopLogLine('2026-10-18', 3, 5, 'review the card')).toBe("- 2026-10-18 — range 3 of 5's stop recorded — review the card")
  })
})
