import { describe, expect, it } from 'vitest'
import {
  formatOrientation,
  markStepDone,
  orient,
  parseLastCheckpoint,
  parseOpenQuestions,
  parseParked,
  parseSteps,
  parseTitle,
} from '../orient.ts'

const INTENT = `# My Feature

## Roadmap

1. a roadmap line that is NOT a step
2. another roadmap line

## Steps

1. [x] First step — **done** (checkpoint abc1234).
   - seam: \`src/a.ts\`
2. [ ] Second step — **done when:** the thing works.
   - seam: \`src/b.ts\`
3. [ ] Third step

## Open questions

- Q1: *(resolved → D9)*
- Q2: a real open hole — *resolve by:* decide
- Q3: another open one
`

const BUILDLOG = `# Build log

## Park list

> instructions, not an item
- [ ] an idea
- [ ] another idea

## Harvest

- (none yet)
`

const CHECKPOINTS = 'baseline deadbeef\nstep 1 abc1234def\n'
const base = { intent: INTENT, buildLog: BUILDLOG, checkpoints: CHECKPOINTS, inFlight: null, spiking: false }

describe('orient parsers', () => {
  it('parseTitle takes the first heading', () => {
    expect(parseTitle(INTENT)).toBe('My Feature')
    expect(parseTitle('no heading here')).toBe(null)
  })

  it('parseTitle skips a mid-line # and normalizes internal padding', () => {
    // Prose mentioning "# something" must not be mistaken for the title, and
    // the `#   Title` spacing must not leak into the dashboard header.
    expect(parseTitle('the notes mention # nope here\n#   Padded Title')).toBe('Padded Title')
  })

  it('parseSteps returns nothing when there is no ## Steps section', () => {
    // A numbered checkbox floating outside any Steps section is not a step —
    // a fresh intent with only prose must orient as "no steps planned yet".
    expect(parseSteps('1. [ ] stray line, no section\n\n## Notes\n\ntext\n')).toEqual([])
  })

  it('parseSteps stops at the next section heading', () => {
    // Checkbox-shaped lines in a later section must never count as steps.
    const intent = '# T\n\n## Steps\n\n1. [ ] real step\n\n## Notes\n\n2. [ ] not a step\n'
    const steps = parseSteps(intent)
    expect(steps).toHaveLength(1)
    expect(steps[0]?.n).toBe(1)
  })

  it('parseSteps tolerates heading whitespace and a section ending at EOF', () => {
    // Hand-edited intents pick up trailing spaces on headings, and the Steps
    // section is often the last thing in the file with no trailing newline.
    const steps = parseSteps('## Steps   \n1. [ ] only step')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ n: 1, title: 'only step' })
  })

  it('parseSteps anchors at line start, reads multi-digit numbers and wide spacing', () => {
    // Indented lines and in-prose references are step-block content, not new
    // steps; long builds pass step 10 so two-digit numbers must parse.
    const intent = [
      '## Steps',
      '',
      '9.  [ ] Wide spacing after the dot',
      '   10. [ ] indented continuation, not a step',
      '12. [ ] Twelfth step',
      'see 3. [ ] for the embedded reference',
    ].join('\n')
    expect(parseSteps(intent).map((s) => s.n)).toEqual([9, 12])
  })

  it('parseSteps captures the done-when criterion exactly: trimmed, single line, tight spacing ok', () => {
    // The criterion is echoed verbatim in the dashboard and the build report,
    // so it must be the criterion alone — not the seam line, not padding.
    const intent = [
      '## Steps',
      '',
      '1. [ ] Tight — **done when:**no space after the marker',
      '2. [ ] Padded — **done when:** trailing spaces survive the parse.   ',
      '   - seam: `src/x.ts`',
    ].join('\n')
    const steps = parseSteps(intent)
    expect(steps[0]?.doneWhen).toBe('no space after the marker')
    expect(steps[1]?.doneWhen).toBe('trailing spaces survive the parse.')
    expect(parseSteps(INTENT)[1]?.doneWhen).toBe('the thing works.')
  })

  it('parseSteps reads only the ## Steps section, not roadmap prose', () => {
    const steps = parseSteps(INTENT)
    expect(steps).toHaveLength(3)
    expect(steps[0]).toMatchObject({ n: 1, done: true, title: 'First step', planned: false })
    expect(steps[1]).toMatchObject({ n: 2, done: false, title: 'Second step', planned: true })
    expect(steps[2]).toMatchObject({ n: 3, done: false, title: 'Third step', planned: false })
  })

  it('parseOpenQuestions counts only unresolved Q lines', () => {
    expect(parseOpenQuestions(INTENT)).toBe(2) // Q2, Q3; Q1 is resolved
  })

  it('parseOpenQuestions reads multi-digit and indented Q lines but not in-prose mentions', () => {
    const intent = [
      '## Open questions',
      '',
      '- Q10: multi-digit and still open',
      '  - Q2: indented but a real open question',
      'prose about - Q3: embedded, not a question line',
      '- Q4: was answered — resolved',
    ].join('\n')
    expect(parseOpenQuestions(intent)).toBe(2) // Q10 + indented Q2
  })

  it('parseParked counts only OPEN [ ] items, not harvested [x], the placeholder, or instructions', () => {
    expect(parseParked(BUILDLOG)).toBe(2)
    expect(parseParked('## Park list\n- (none yet)\n## Harvest\n')).toBe(0)
    expect(parseParked('## Park list\n- [ ] still open\n- [x] already harvested\n## Harvest\n')).toBe(1)
  })

  it('parseLastCheckpoint returns the last step line, short sha intact', () => {
    expect(parseLastCheckpoint(CHECKPOINTS)).toEqual({ n: 1, sha: 'abc1234def' })
    expect(parseLastCheckpoint('baseline x\n')).toBe(null)
  })

  it('parseParked tolerates messy list spacing but not in-prose checkboxes', () => {
    // The park file is hand-edited mid-build; indentation and doubled spaces
    // must still count, while a checkbox quoted inside prose must not.
    const buildLog = [
      '## Park list',
      '',
      '- [ ] plain idea',
      '  - [ ] indented idea',
      '-  [ ] double space after the dash',
      '- [ ]  double space after the box',
      'note - [ ] embedded in prose, not an item',
      '- [x] harvested already',
    ].join('\n')
    expect(parseParked(buildLog)).toBe(4)
  })

  it('parseLastCheckpoint requires a line-start `step`, reads wide spacing and multi-digit steps', () => {
    // Only real checkpoint records count — "redo step N" prose must not
    // become the last checkpoint the dashboard reports.
    const checkpoints = ['baseline deadbeef', 'step 1 abc1111', '  step  12  cafe3333', 'redo step 99 ffff9999'].join(
      '\n'
    )
    expect(parseLastCheckpoint(checkpoints)).toEqual({ n: 12, sha: 'cafe3333' })
  })
})

describe('markStepDone', () => {
  const MARK = `# T

2. [ ] decoy before the section

## Steps

1. [x] already done
2. [ ] the target
3. [ ] left alone

## Notes

2. [ ] decoy after the section
`

  it('flips only the target step inside ## Steps', () => {
    const out = markStepDone(MARK, 2)
    expect(out).toContain('2. [x] the target')
    // Checkbox-shaped lines outside the section, and other steps inside it,
    // must survive untouched — this is bookkeeping, not a rewrite.
    expect(out).toContain('2. [ ] decoy before the section')
    expect(out).toContain('2. [ ] decoy after the section')
    expect(out).toContain('3. [ ] left alone')
  })

  it('is a no-op when the step is already done or absent', () => {
    expect(markStepDone(MARK, 1)).toBe(MARK)
    expect(markStepDone(MARK, 7)).toBe(MARK)
  })

  it('finds the section even with trailing whitespace on the heading', () => {
    expect(markStepDone('## Steps  \n1. [ ] a\n', 1)).toContain('1. [x] a')
  })
})

describe('orient next-move inference (D15)', () => {
  it('DESIGN with the next step planned → /plumbbob:pb-build that step, with a revise hint', () => {
    const next = orient({ ...base }).next
    expect(next).toContain('/plumbbob:pb-build')
    expect(next).toContain('step 2')
    expect(next).toContain('/plumbbob:pb-step') // ...or revise it first
  })

  it('DESIGN with the next step unplanned → /plumbbob:pb-step', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] done one — **done**\n2. [ ] just a rough idea\n'
    expect(orient({ ...base, intent }).next).toContain('/plumbbob:pb-step')
  })

  it('an in-flight step (BUILD) → finish it with /plumbbob:pb-verify', () => {
    expect(orient({ ...base, inFlight: 2 }).next).toContain('/plumbbob:pb-verify')
  })

  it('all planned steps done, nothing parked → offers plan-next AND finish-up', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n'
    const buildLog = '## Park list\n- (none yet)\n## Harvest\n'
    const next = orient({ ...base, intent, buildLog }).next
    expect(next).toContain('/plumbbob:pb-step') // just-in-time: plan the next step
    expect(next).toContain('/plumbbob:pb-finish') // ...or finish up if truly done
    // With nothing parked there is no harvest preamble — the move leads with
    // finishing up, not with an empty harvest.
    expect(next).toMatch(/^finish up/)
  })

  it('all planned steps done with parked items → leads with /plumbbob:pb-harvest', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n2. [x] b — **done**\n'
    // The count and plural read back to the human, so pin the exact phrasing.
    expect(orient({ ...base, intent }).next).toContain('harvest 2 parked ideas — `/plumbbob:pb-harvest`; then ')
  })

  it('a single parked item reads singular', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n'
    const buildLog = '## Park list\n- [ ] one idea\n## Harvest\n'
    expect(orient({ ...base, intent, buildLog }).next).toContain('harvest 1 parked idea — `/plumbbob:pb-harvest`; then ')
  })

  it('no steps at all → plan the first step', () => {
    expect(orient({ ...base, intent: '# T\n' }).next).toContain('plan the first step')
  })

  it('a spike in progress points at its close-out', () => {
    expect(orient({ ...base, spiking: true }).next).toContain('spike done')
  })
})

describe('orient derived fields', () => {
  it('phase derives from the spike marker, then the in-flight step, then the boundary', () => {
    expect(orient({ ...base }).phase).toBe('DESIGN')
    expect(orient({ ...base, inFlight: 2 }).phase).toBe('BUILD')
    expect(orient({ ...base, spiking: true }).phase).toBe('SPIKE')
    expect(orient({ ...base, spiking: true, inFlight: 2 }).phase).toBe('SPIKE') // spike wins
  })

  it('nextSeam is empty when the next step declares no seam', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n2. [ ] rough idea\n'
    expect(orient({ ...base, intent }).nextSeam).toEqual([])
  })
})

describe('formatOrientation', () => {
  it('renders title, state, markers, counts, and the next move', () => {
    const out = formatOrientation(orient({ ...base }))
    expect(out).toContain('My Feature')
    expect(out).toContain('[DESIGN]')
    expect(out).toContain('✓ 1')
    expect(out).toContain('▸ 2')
    expect(out).toContain('← next')
    expect(out).toContain('1/3 done')
    expect(out).toContain('step 1 · abc1234')
    expect(out).toContain('parked 2 · open questions 2')
    expect(out).toContain('next →')
  })

  it('surfaces the next undone step\'s done-when and seam so the human can review it', () => {
    const out = formatOrientation(orient({ ...base }))
    expect(out).toContain('done when: the thing works.')
    expect(out).toContain('seam: src/b.ts')
  })

  it('renders the whole dashboard exactly', () => {
    // The dashboard IS the interface — layout, markers, blank lines, and the
    // 7-char sha are what the human reads, so pin the rendering verbatim.
    expect(formatOrientation(orient({ ...base }))).toBe(
      [
        'PlumbBob — My Feature   [DESIGN]',
        '',
        '  steps  1/3 done',
        '  ✓ 1  First step',
        '  ▸ 2  Second step   ← next',
        '        done when: the thing works.',
        '        seam: src/b.ts',
        '    3  Third step',
        '',
        'last checkpoint  step 1 · abc1234',
        'parked 2 · open questions 2',
        '',
        'next → build step 2 — `/plumbbob:pb-build` (or `/plumbbob:pb-step` to revise it first)',
      ].join('\n')
    )
  })

  it('a rough next step shows neither done-when nor seam detail', () => {
    // "Only what's present" — a rough step must not render empty detail rows.
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n2. [ ] rough idea\n'
    const out = formatOrientation(orient({ ...base, intent }))
    expect(out).not.toContain('done when:')
    expect(out).not.toContain('seam:')
  })

  it('a multi-file seam joins with commas', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n2. [ ] b — **done when:** works.\n   - seam: `src/a.ts`, `src/b.ts`\n'
    expect(formatOrientation(orient({ ...base, intent }))).toContain('seam: src/a.ts, src/b.ts')
  })

  it('empty inputs degrade to placeholders, never throw', () => {
    const out = formatOrientation(orient({ intent: '', buildLog: '', checkpoints: '', inFlight: null, spiking: false }))
    expect(out).toContain('PlumbBob — (untitled)   [DESIGN]')
    expect(out).toContain('  (no steps planned yet)')
    expect(out).toContain('last checkpoint  none yet')
    expect(out).toContain('parked 0 · open questions 0')
    expect(out).toContain('plan the first step')
  })
})
