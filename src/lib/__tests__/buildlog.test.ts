import { describe, expect, it } from 'vitest'
import { appendToSection, checkpointLogLine } from '../buildlog.ts'

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
    // lands right after the guidance line, before the next `## ` heading
    expect(lines[lines.indexOf('> guidance line') + 1]).toBe('- [ ] new idea')
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
