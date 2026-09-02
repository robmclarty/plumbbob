import { describe, expect, it } from 'vitest'
import { notice } from '../notice.ts'

describe('notice', () => {
  it('renders the bare shape: one prefix colon, the fact, no terminal period', () => {
    expect(notice({ fact: 'no active spike to close' })).toBe('plumbbob: no active spike to close\n')
  })

  it('rides the detail in one trailing parenthetical', () => {
    expect(notice({ fact: 'step 2 checkpointed', detail: ['b4c5d6e7f'] })).toBe(
      'plumbbob: step 2 checkpointed (b4c5d6e7f)\n',
    )
  })

  it('comma-separates several detail items', () => {
    expect(notice({ fact: 'step 2 abandoned', detail: ['work kept in the tree', 'the step stays planned'] })).toBe(
      'plumbbob: step 2 abandoned (work kept in the tree, the step stays planned)\n',
    )
  })

  it('trails the warning glyph after the fact, before the parenthetical', () => {
    expect(notice({ fact: 'this repo gitignores .plumbbob/', advisory: true, detail: ['record-only'] })).toBe(
      'plumbbob: this repo gitignores .plumbbob/ ⚠ (record-only)\n',
    )
  })

  it('puts the remedy on its own indented arrow line', () => {
    expect(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' })).toBe(
      'plumbbob: no active session\n  → plumbbob start "<title>"\n',
    )
  })

  it('spends the one colon on `parked` for a capture', () => {
    expect(notice({ prefix: 'parked', fact: 'throttle /password-reset too (tangent)' })).toBe(
      'parked: throttle /password-reset too (tangent)\n',
    )
  })

  it('drops one terminal period so a message composed elsewhere still reads as a clause', () => {
    expect(notice({ fact: 'intent.md has no "## Steps" section.', remedy: 'plan a step first' })).toBe(
      'plumbbob: intent.md has no "## Steps" section\n  → plan a step first\n',
    )
  })

  it('keeps an ellipsis intact rather than reading it as a terminal period', () => {
    expect(notice({ fact: 'the agent said things...' })).toBe('plumbbob: the agent said things...\n')
  })

  it('omits the parenthetical when every detail item is empty', () => {
    expect(notice({ fact: 'plan committed', detail: ['', '  '] })).toBe('plumbbob: plan committed\n')
  })

  it('never cuts one or two items, even past the budget: a notice wraps where a fence row cannot', () => {
    const line = notice({
      fact: 'finished',
      detail: ['f3e9a1b2c', '.plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/ rides your branch into the PR'],
    })
    expect(line).toContain('rate-limit-the-login-endpoint/ rides your branch into the PR)')
    expect(line).not.toContain('other')
  })

  it('collapses a long list to a count, naming at least two so the count sizes something visible', () => {
    expect(
      notice({
        fact: "staged paths reach outside step 4's seam",
        advisory: true,
        detail: ['src/verbs/park.ts', 'src/verbs/use.ts', 'src/verbs/start.ts', 'src/verbs/finish.ts'],
      }),
    ).toBe("plumbbob: staged paths reach outside step 4's seam ⚠ (src/verbs/park.ts, src/verbs/use.ts, and 2 others)\n")
  })

  it('names every item of a short list that fits', () => {
    expect(notice({ fact: "unknown --mode 'x'", detail: ['before', 'build', 'after'] })).toBe(
      "plumbbob: unknown --mode 'x' (before, build, after)\n",
    )
  })

  it('singularises the collapsed count', () => {
    const line = notice({
      fact: 'no build named "auth" in .plumbbob/builds/',
      detail: ['2026-08-28-presentation', '2026-07-03-rate-limit-the-login-endpoint', '2026-07-14-structured-logging'],
    })
    expect(line).toContain('and 1 other)')
    expect(line).not.toContain('1 others')
  })
})
