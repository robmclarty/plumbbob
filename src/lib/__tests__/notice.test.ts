import { describe, expect, it } from 'vitest'
import { advisory, blocks, ending, notice, transition } from '../notice.ts'

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
    expect(notice({ fact: 'no agent named "reviewer"', advisory: true, detail: ['ambient'] })).toBe(
      'plumbbob: no agent named "reviewer" ⚠ (ambient)\n',
    )
  })

  it('puts the remedy on its own indented arrow line', () => {
    expect(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' })).toBe(
      'plumbbob: no active session\n  → plumbbob start "<title>"\n',
    )
  })

  it('spends the one colon on `parked` for a capture an agent reports', () => {
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
        fact: 'no agent manifest resolved for the before slot',
        advisory: true,
        detail: ['src/verbs/park.ts', 'src/verbs/use.ts', 'src/verbs/start.ts', 'src/verbs/finish.ts'],
      }),
    ).toBe(
      'plumbbob: no agent manifest resolved for the before slot ⚠ (src/verbs/park.ts, src/verbs/use.ts, and 2 others)\n',
    )
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

describe('transition — D42 (transitions-wear-the-label)', () => {
  it('wears a bold label where a notice wears the speaker prefix', () => {
    expect(transition({ label: 'Checkpoint', fact: 'Step 15 complete', detail: ['2d917cde7'] })).toBe(
      '**Checkpoint**: Step 15 complete (2d917cde7)\n',
    )
  })

  it('reads the capture on from its label, the tag in the tail', () => {
    expect(transition({ label: 'Parked', fact: 'should /password-reset get the same throttle? (tangent)' })).toBe(
      '**Parked**: should /password-reset get the same throttle? (tangent)\n',
    )
  })

  it('degrades its detail and drops a terminal period the same way a notice does', () => {
    expect(
      transition({
        label: 'Session',
        fact: 'finished.',
        detail: ['f3e9a1b2c', 'src/verbs/park.ts', 'src/verbs/use.ts', 'src/verbs/start.ts'],
      }),
    ).toBe('**Session**: finished (f3e9a1b2c, src/verbs/park.ts, and 2 others)\n')
  })

  it('puts the remedy on the same indented arrow line beneath', () => {
    expect(
      transition({ label: 'Spike report', fact: 'scaffolded', detail: ['spike-01-auth.md'], remedy: 'record the Verdict there' }),
    ).toBe('**Spike report**: scaffolded (spike-01-auth.md)\n  → record the Verdict there\n')
  })
})

describe('advisory — D43 (verb-prints-its-ending)', () => {
  it('drops the prefix and opens as a sentence, the glyph trailing the fact', () => {
    expect(
      advisory({
        fact: "staged paths reach outside Step 16's seam",
        detail: ['test/integration/spike.test.ts', 'test/integration/use.test.ts'],
        remedy: 'the checkpoint captures them, so revise the plan with /plumbbob:step',
      }),
    ).toBe(
      "Staged paths reach outside Step 16's seam ⚠ (test/integration/spike.test.ts, test/integration/use.test.ts)\n" +
        '  → the checkpoint captures them, so revise the plan with /plumbbob:step\n',
    )
  })

  it('degrades its detail and drops a terminal period the same way every head does', () => {
    expect(
      advisory({
        fact: 'no verdict recorded.',
        detail: ['spike-01-auth.md', 'spike-02-redis.md', 'spike-03-store.md', 'spike-04-queue.md'],
      }),
    ).toBe('No verdict recorded ⚠ (spike-01-auth.md, spike-02-redis.md, and 2 others)\n')
  })
})

describe('ending — D43 (verb-prints-its-ending)', () => {
  it('stacks the parts in one fixed order, blank-line separated, and closes on a blank line', () => {
    expect(
      ending({
        lead: transition({ label: 'Checkpoint', fact: 'Step 16 complete', detail: ['f2b83e17c'] }),
        verdict: '**Verdict**: ◐ A hair off (staged outside the seam)',
        advisories: [advisory({ fact: 'staged paths reach outside Step 16\'s seam', detail: ['test/a.ts'] })],
        pointer: '**Next Up**: Step 17 of 18 - feat(ending): every transition prints its whole ending',
      }),
    ).toBe(
      [
        '**Checkpoint**: Step 16 complete (f2b83e17c)',
        '',
        '**Verdict**: ◐ A hair off (staged outside the seam)',
        '',
        "Staged paths reach outside Step 16's seam ⚠ (test/a.ts)",
        '',
        '**Next Up**: Step 17 of 18 - feat(ending): every transition prints its whole ending',
        '',
        '',
      ].join('\n'),
    )
  })

  it('vanishes the parts a transition does not have rather than leaving a gap', () => {
    expect(ending({ lead: transition({ label: 'Parked', fact: 'throttle /password-reset too (tangent)' }) })).toBe(
      '**Parked**: throttle /password-reset too (tangent)\n\n',
    )
  })

  it('ends on the remedy line where no pointer follows, which is start\'s whole shape', () => {
    expect(
      ending({
        lead: transition({
          label: 'Session',
          fact: 'started "Rate limit"',
          detail: ['baseline a1b2c3d4e'],
          remedy: 'frame and decide in .plumbbob/builds/rate-limit/intent.md, then build a step',
        }),
      }),
    ).toBe(
      '**Session**: started "Rate limit" (baseline a1b2c3d4e)\n' +
        '  → frame and decide in .plumbbob/builds/rate-limit/intent.md, then build a step\n\n',
    )
  })

  it('collapses a part to one blank line however many its text carried', () => {
    expect(blocks(['first\n\n\n', null, '   ', 'second'])).toBe('first\n\nsecond\n\n')
  })
})
