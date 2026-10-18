import { describe, expect, it } from 'vitest'
import {
  buildOrderPhrase,
  clearBuildOrder,
  formatOrientation,
  lastLedgerSha,
  markStepDone,
  normalizeDetailHeadings,
  orderSteps,
  orient,
  parkedPhrase,
  parseBuildOrder,
  parseBuildRanges,
  parseConstraintCount,
  parseDetailStep,
  parseLastCheckpoint,
  parseOpenQuestions,
  parseOrderedSteps,
  parseParked,
  parseParkTotals,
  parseRecap,
  parseRequestedStep,
  parseSteps,
  parseTitle,
  rangeStanding,
  rangeStart,
  remainingOrder,
  recapLines,
  seamRowFromDiff,
  setBuildOrder,
  skippedBefore,
  spentRowValue,
  summaryCheckRow,
} from '../orient.ts'
import type { OrientInput } from '../orient.ts'
import { readTemplate } from '../templates.ts'
import type { StepList } from '../steplist.ts'

/** A request for one step, as `status --invoked` reads a bare number. */
const one = (n: number): StepList => [{ from: n, to: n }]

const INTENT = `# My Feature

## Roadmap

1. a roadmap line that is NOT a step
2. another roadmap line

## Steps

1. [x] First step — **done** (checkpoint abc1234).
   - seam: \`src/a.ts\`
2. [ ] Second step — **done when:** the thing works.
   - seam: \`src/b.ts\`
   - model: sonnet — mechanical
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
const base = {
  intent: INTENT,
  buildLog: BUILDLOG,
  checkpoints: CHECKPOINTS,
  inFlight: null,
  spiking: false,
  requested: null,
  outOfBand: 0,
}

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
    // A numbered checkbox floating outside any Steps section is not a step:
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
    // so it must be the criterion alone (not the seam line, not padding).
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

  it('parseSteps reads the comma step form with a clean title — D78 (em-dash-ban)', () => {
    // The scaffold teaches `Title, **done when:**` now that the em dash is out
    // of the prose kit; the marker anchors the split, so a comma inside the
    // title survives, and the legacy dash form parses unchanged beside it.
    const intent = [
      '## Steps',
      '',
      '1. [ ] feat(scope): add a, then b, **done when:** both land',
      '   - seam: `src/x.ts`',
      '2. [ ] Legacy dash — **done when:** still parses',
    ].join('\n')
    const steps = parseSteps(intent)
    expect(steps[0]).toMatchObject({ n: 1, title: 'feat(scope): add a, then b', planned: true })
    expect(steps[0]?.doneWhen).toBe('both land')
    expect(steps[1]?.title).toBe('Legacy dash')
  })

  it('parseSteps reads only the ## Steps section, not roadmap prose', () => {
    const steps = parseSteps(INTENT)
    expect(steps).toHaveLength(3)
    expect(steps[0]).toMatchObject({ n: 1, done: true, title: 'First step', planned: false })
    expect(steps[1]).toMatchObject({ n: 2, done: false, title: 'Second step', planned: true })
    expect(steps[2]).toMatchObject({ n: 3, done: false, title: 'Third step', planned: false })
  })

  it('parseSteps scrapes the optional model recommendation verbatim, per step — D62 (model-recommendation)', () => {
    // The recommendation is advisory prose echoed back to the human, so it must
    // come through verbatim, and only from the step's own block, never a neighbor's.
    const intent = [
      '## Steps',
      '',
      '1. [ ] a — **done when:** ok',
      '   - seam: `a.ts`',
      '   - model: sonnet — mechanical, fully specified',
      '2. [ ] b — **done when:** ok',
      '   - seam: `b.ts`',
    ].join('\n')
    const steps = parseSteps(intent)
    expect(steps[0]?.model).toBe('sonnet — mechanical, fully specified')
    expect(steps[1]?.model).toBe(null)
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

  it('parseOpenQuestions is unmoved by *plain:*/*lean:* sub-lines under an opener (research/08 R1)', () => {
    // The expanded question form (opener + explanation + proposal) is parser-safe:
    // the counter matches opener lines only, so the sub-lines add zero to the count.
    const intent = [
      '## Open questions',
      '',
      '- Q7: the pack check isn\'t read-only — *resolve by:* decide',
      '  - *plain:* `npm pack --dry-run` runs `prepack`/`prepare` first, so the',
      '    check can rebuild dist/ mid-wave while other slots read those files.',
      '  - *lean:* spawn pack with `--ignore-scripts` instead.',
    ].join('\n')
    expect(parseOpenQuestions(intent)).toBe(1)
  })

  it('parseOpenQuestions drops an opener whose *resolved:* marker lands on the opener line, sub-lines and all', () => {
    // Resolution is read from the opener line: the *resolved:* marker must be on
    // the opener for the count to drop: pinning that the still-present
    // *plain:*/*lean:* scaffolding doesn't prevent it, and that a genuinely open
    // neighbor still counts.
    const intent = [
      '## Open questions',
      '',
      '- Q7: *resolved:* 2026-07-18, ignore-scripts',
      '  - *plain:* `npm pack --dry-run` runs `prepack`/`prepare` first.',
      '  - *lean:* spawn pack with `--ignore-scripts` instead.',
      '- Q8: another real open question — *resolve by:* decide',
    ].join('\n')
    expect(parseOpenQuestions(intent)).toBe(1) // Q7 resolved, Q8 open
  })

  it('parseOpenQuestions is not resolved by the word "resolved" appearing on a sub-line', () => {
    // The parser tests each opener line in isolation (research/08 R1's noted sharp
    // edge): a *lean:* sub-line that merely discusses "resolved" downstream must
    // not silently drop the opener from the count.
    const intent = [
      '## Open questions',
      '',
      '- Q9: a real open question — *resolve by:* decide',
      '  - *plain:* explains what happens once this gets resolved downstream.',
      '  - *lean:* a proposal, not yet resolved by anyone.',
    ].join('\n')
    expect(parseOpenQuestions(intent)).toBe(1)
  })

  it('parseOpenQuestions counts a slugged opener `- Q2 (some-slug): ...` as open (the slug-at-birth form)', () => {
    // The slug-at-birth gloss lands on the opener; the count reads through it so a
    // genuinely open slugged question still registers, sub-lines and all.
    const intent = [
      '## Open questions',
      '',
      '- Q2 (default-waves): should waves default on? — *resolve by:* decide',
      '  - *plain:* the plan leaves the default unstated, so a fresh run guesses.',
      '  - *lean:* default off; opt in per build.',
    ].join('\n')
    expect(parseOpenQuestions(intent)).toBe(1)
  })

  it('parseOpenQuestions drops a slugged opener when *resolved:* lands on that opener', () => {
    // Slug on the opener must not shield it from resolution: a *resolved:* marker on
    // the slugged opener drops it, while a slugged open neighbor still counts.
    const intent = [
      '## Open questions',
      '',
      '- Q2 (default-waves): *resolved:* 2026-07-18, default off',
      '  - *lean:* default off; opt in per build.',
      '- Q3 (retry-budget): how many retries? — *resolve by:* decide',
    ].join('\n')
    expect(parseOpenQuestions(intent)).toBe(1) // Q2 resolved, Q3 open
  })

  it('parseOpenQuestions counts an anchored opener `- <a id="q2"></a>**Q2 (slug)**: ...` as open', () => {
    // The citation convention gives every build-local number an anchor to link to, so
    // an opener a `[Q2 (default-waves)](#q2)` reference points at is born carrying
    // `<a id="q2"></a>` and bold markers. The counter must read straight through both:
    // an anchored question that stopped counting would silently empty the dashboard.
    const intent = [
      '## Open questions',
      '',
      '- <a id="q2"></a>**Q2 (default-waves)**: should waves default on? — *resolve by:* decide',
      '  - *plain:* the plan leaves the default unstated, so a fresh run guesses.',
      '  - *lean:* default off; opt in per build.',
    ].join('\n')
    expect(parseOpenQuestions(intent)).toBe(1)
  })

  it('parseOpenQuestions reads an anchored opener in every partial form, and still drops a resolved one', () => {
    // An intent is hand-edited mid-build, so the three renderings coexist and the
    // anchor and the bold markers arrive independently. Every shape counts, and
    // *resolved:* on the opener still drops it whichever shape it wears.
    const intent = [
      '## Open questions',
      '',
      '- <a id="q1"></a>**Q1 (anchored-and-bold)**: the full form — *resolve by:* decide',
      '- <a id="q2"></a>Q2 (anchored-only): the anchor landed before the bold did',
      '- **Q3 (bold-only)**: the bold landed before the anchor did',
      '- <a id="q4"></a>**Q4 (unslugged)**: no gloss yet, still a hole',
      '- <a id="q5"></a>**Q5 (settled)**: *resolved:* 2026-08-08, default off',
    ].join('\n')
    expect(parseOpenQuestions(intent)).toBe(4) // Q1–Q4 open; Q5 resolved
  })

  it('parseOpenQuestions counts an opener that calls itself "unresolved" (the marker is a whole word)', () => {
    // The malign half of the substring test: a bare /resolved/ matches inside
    // "unresolved", so a hole the human deliberately marked as still open read as
    // settled and left the dashboard. The word boundary is what keeps it visible,
    // and it still drops every shape a real marker wears.
    const intent = [
      '## Open questions',
      '',
      '- <a id="q1"></a>**Q1 (transport-default)**: still unresolved after the spike — *resolve by:* decide',
      '- Q2: unresolved, and unslugged, and still a hole',
      '- Q3: *resolved:* 2026-08-11, native',
    ].join('\n')
    expect(parseOpenQuestions(intent)).toBe(2) // Q1, Q2 open; Q3 resolved
  })

  it('parseOpenQuestions drops an opener whose body is still an unfilled `<...>` fill-in', () => {
    // The scaffold rule, stated rather than inherited: a placeholder body counts as
    // nothing because it is unfilled, not because the word "unresolved" happens to
    // contain "resolved". Note that this fixture carries no "resolved" token at all,
    // so it can only pass by the rule. The rule reads the START of the body, which is
    // what leaves a real question free to mention angle brackets further along.
    const intent = [
      '## Open questions',
      '',
      '- <a id="q1"></a>**Q1 (slug-here)**: <the hole, framed as a question> — *resolve by:* decide',
      '  - *plain:* <what is at stake, in plain words>',
      '- Q2: does a bare `<name>` belong in the seam? — *resolve by:* decide',
    ].join('\n')
    expect(parseOpenQuestions(intent)).toBe(1) // Q1 is scaffold; Q2 is a real question
  })

  it('the real templates/intent.md parses to an open-question count of 0 (the placeholder is uncounted)', () => {
    // The scaffolded Q1 placeholder must never read as an open question: a fresh
    // build showing "open questions 1" would be shipped noise.
    expect(parseOpenQuestions(readTemplate('intent.md'))).toBe(0)
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
    // Only real checkpoint records count: "redo step N" prose must not
    // become the last checkpoint the dashboard reports.
    const checkpoints = ['baseline deadbeef', 'step 1 abc1111', '  step  12  cafe3333', 'redo step 99 ffff9999'].join(
      '\n'
    )
    expect(parseLastCheckpoint(checkpoints)).toEqual({ n: 12, sha: 'cafe3333' })
  })

  it('lastLedgerSha anchors on the last line of ANY kind — baseline, plan, or step — D66 (oob-commits-surfaced)', () => {
    expect(lastLedgerSha('baseline aaa1111\n')).toBe('aaa1111')
    expect(lastLedgerSha('baseline aaa1111\nplan bbb2222\n')).toBe('bbb2222')
    expect(lastLedgerSha('baseline aaa1111\nplan bbb2222\nstep 1 ccc3333\n')).toBe('ccc3333')
    // A garbled or empty ledger anchors nothing rather than mis-anchoring.
    expect(lastLedgerSha('')).toBe(null)
    expect(lastLedgerSha('redo step 9 ffff9999\n')).toBe(null)
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
    // must survive untouched; this is bookkeeping, not a rewrite.
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

describe('orient next-move inference — D15 (one-next-move)', () => {
  it('DESIGN with the next step planned → /plumbbob:build that step, with a revise hint', () => {
    const next = orient({ ...base }).next
    expect(next).toContain('/plumbbob:build')
    expect(next).toContain('step 2')
    expect(next).toContain('/plumbbob:step') // ...or revise it first
  })

  it('DESIGN with the next step unplanned → /plumbbob:step', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] done one — **done**\n2. [ ] just a rough idea\n'
    expect(orient({ ...base, intent }).next).toContain('/plumbbob:step')
  })

  it('an in-flight step (BUILD) → finish it with /plumbbob:verify', () => {
    expect(orient({ ...base, inFlight: 2 }).next).toContain('/plumbbob:verify')
  })

  it('all planned steps done, nothing parked → offers plan-next AND finish-up', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n'
    const buildLog = '## Park list\n- (none yet)\n## Harvest\n'
    const next = orient({ ...base, intent, buildLog }).next
    expect(next).toContain('/plumbbob:step') // just-in-time: plan the next step
    expect(next).toContain('/plumbbob:finish') // ...or finish up if truly done
    // With nothing parked there is no harvest preamble: the move leads with
    // finishing up, not with an empty harvest.
    expect(next).toMatch(/^finish up/)
  })

  it('all planned steps done with parked items → leads with /plumbbob:harvest', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n2. [x] b — **done**\n'
    // The count and plural read back to the human, so pin the exact phrasing.
    expect(orient({ ...base, intent }).next).toContain('harvest 2 parked ideas — `/plumbbob:harvest`; then ')
  })

  it('a single parked item reads singular', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n'
    const buildLog = '## Park list\n- [ ] one idea\n## Harvest\n'
    expect(orient({ ...base, intent, buildLog }).next).toContain('harvest 1 parked idea — `/plumbbob:harvest`; then ')
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
    expect(out).toContain('parked 2 of 2 open · open questions 2')
    expect(out).toContain('next →')
  })

  it('surfaces the next undone step\'s done-when, seam, and model so the human can review it', () => {
    const out = formatOrientation(orient({ ...base }))
    expect(out).toContain('done when: the thing works.')
    expect(out).toContain('seam: src/b.ts')
    expect(out).toContain('model: sonnet — mechanical')
  })

  it('renders the whole dashboard exactly', () => {
    // The dashboard IS the interface: layout, markers, blank lines, and the
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
        '        model: sonnet — mechanical',
        '    3  Third step',
        '',
        'last checkpoint  step 1 · abc1234',
        'parked 2 of 2 open · open questions 2',
        '',
        'next → build step 2 — `/plumbbob:build` (or `/plumbbob:step` to revise it first)',
      ].join('\n')
    )
  })

  it('a rough next step shows no done-when, seam, or model detail', () => {
    // "Only what's present": a rough step must not render empty detail rows.
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n2. [ ] rough idea\n'
    const out = formatOrientation(orient({ ...base, intent }))
    expect(out).not.toContain('done when:')
    expect(out).not.toContain('seam:')
    expect(out).not.toContain('model:')
  })

  it('a multi-file seam joins with commas', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n2. [ ] b — **done when:** works.\n   - seam: `src/a.ts`, `src/b.ts`\n'
    expect(formatOrientation(orient({ ...base, intent }))).toContain('seam: src/a.ts, src/b.ts')
  })

  it('surfaces out-of-band commits as one neutral line, just under the checkpoint — D66 (oob-commits-surfaced)', () => {
    // The count reads back to the human, so pin the phrasing and its placement:
    // the reconciliation note belongs with the ledger it reconciles.
    const out = formatOrientation(orient({ ...base, outOfBand: 3 }))
    expect(out).toContain('last checkpoint  step 1 · abc1234\n3 commits since the last checkpoint landed outside plumbbob\'s ledger.\nparked')
  })

  it('reads a single out-of-band commit as singular', () => {
    expect(formatOrientation(orient({ ...base, outOfBand: 1 }))).toContain(
      '1 commit since the last checkpoint landed outside plumbbob\'s ledger.',
    )
  })

  it('prints no reconciliation line when nothing landed out of band', () => {
    // The line appears only when the count is positive: a clean ledger stays quiet.
    expect(formatOrientation(orient({ ...base, outOfBand: 0 }))).not.toContain('outside plumbbob')
  })

  it('empty inputs degrade to placeholders, never throw', () => {
    const out = formatOrientation(
      orient({ intent: '', buildLog: '', checkpoints: '', inFlight: null, spiking: false, requested: null, outOfBand: 0 }),
    )
    expect(out).toContain('PlumbBob — (untitled)   [DESIGN]')
    expect(out).toContain('  (no steps planned yet)')
    expect(out).toContain('last checkpoint  none yet')
    expect(out).toContain('parked 0 · open questions 0')
    expect(out).toContain('plan the first step')
  })
})

describe('parseRequestedStep', () => {
  it('reads a bare step number, ignoring flags around it', () => {
    expect(parseRequestedStep('22')).toEqual(one(22))
    expect(parseRequestedStep('  22 --auto')).toEqual(one(22))
    expect(parseRequestedStep('--auto 22')).toEqual(one(22))
  })

  it('reads a range or a list as the steps it names, the way the turn hook reads it — D16 (list-reading)', () => {
    expect(parseRequestedStep('1-3')).toEqual([{ from: 1, to: 3 }])
    expect(parseRequestedStep('22-24 --auto')).toEqual([{ from: 22, to: 24 }])
    expect(parseRequestedStep('20,5-9')).toEqual([{ from: 20, to: 20 }, { from: 5, to: 9 }])
    expect(parseRequestedStep('20, 5-9')).toEqual([{ from: 20, to: 20 }, { from: 5, to: 9 }])
  })

  it('parses no ask to null', () => {
    expect(parseRequestedStep(null)).toBe(null)
    expect(parseRequestedStep('')).toBe(null)
    expect(parseRequestedStep('--auto')).toBe(null)
    // A host that never substitutes the invocation passes the placeholder
    // through literally; that must degrade to "no ask", not a step.
    expect(parseRequestedStep('$ARGUMENTS')).toBe(null)
    expect(parseRequestedStep('0')).toBe(null)
    expect(parseRequestedStep('5-3')).toBe(null) // a range that does not parse asks for nothing
  })
})

describe('rangeStart — D16 (list-reading)', () => {
  const steps = (done: ReadonlyArray<number>, order: ReadonlyArray<number>) =>
    order.map((n) => ({ n, title: `Step ${n}`, done: done.includes(n), planned: true, doneWhen: null, model: null, line: n }))

  it('starts a range at its first undone step in build order, however it is written', () => {
    const ordered = steps([], [20, 5, 6, 7, 8, 9])
    expect(rangeStart(ordered, [{ from: 5, to: 9 }, { from: 20, to: 20 }])).toBe(20)
    expect(rangeStart(ordered, [{ from: 20, to: 20 }, { from: 5, to: 9 }])).toBe(20)
    expect(rangeStart(steps([20, 5], [20, 5, 6, 7, 8, 9]), [{ from: 5, to: 9 }, { from: 20, to: 20 }])).toBe(6)
  })

  it('falls back to its first step in build order once every one has landed, then to the number typed', () => {
    expect(rangeStart(steps([1, 2, 3], [3, 1, 2]), [{ from: 1, to: 3 }])).toBe(3)
    expect(rangeStart(steps([], [1, 2, 3]), [{ from: 9, to: 12 }])).toBe(9)
    expect(rangeStart(steps([], [1, 2]), [])).toBeNull()
  })
})

describe('parseDetailStep', () => {
  it("reads the step a detail file's header names", () => {
    expect(parseDetailStep('# Detail · Step 2 · Add the farewell module\n\n## Summary\n\nDone.')).toBe(2)
    expect(parseDetailStep('\n# Detail · Step 14 · fix(step): mention Step 3 in passing\n')).toBe(14)
  })

  it('reads no step off a plan header, a missing header, or a header past the first line', () => {
    expect(parseDetailStep('# Detail · Plan · Checkpoint test\n\n## Recommendation\n\nApprove it.')).toBe(null)
    expect(parseDetailStep('## Summary\n\nStep 2 is done.')).toBe(null)
    expect(parseDetailStep('notes\n# Detail · Step 2 · Late header')).toBe(null)
    expect(parseDetailStep('')).toBe(null)
  })
})

describe('normalizeDetailHeadings', () => {
  it('puts a blank line between a heading and the body that runs into it, and before the next heading', () => {
    const tight = '## 1 First\nThe story.\n## 2 Second\nMore.\n## Recommendation\nApprove it.\n'
    expect(normalizeDetailHeadings(tight)).toBe(
      '## 1 First\n\nThe story.\n\n## 2 Second\n\nMore.\n\n## Recommendation\n\nApprove it.\n',
    )
  })

  it('leaves a detail that already has its blank lines exactly as it was', () => {
    const clean = '# Detail · Step 2 · Title\n\n── recap · step 2 of 3 ──\ndone-when    met\n\n## Summary\n\nDone.\n\n## 1 First\n\nThe story.\n'
    expect(normalizeDetailHeadings(clean)).toBe(clean)
    expect(normalizeDetailHeadings(normalizeDetailHeadings('## 1 First\nThe story.'))).toBe('## 1 First\n\nThe story.')
    expect(normalizeDetailHeadings('')).toBe('')
  })

  it('leaves a heading-shaped line inside a fenced block alone', () => {
    const fenced = '## 1 First\n\n```markdown\n## 2 not a heading\ntext\n```\nAfter the fence.\n'
    expect(normalizeDetailHeadings(fenced)).toBe(fenced)
    const tilde = '~~~\n# comment\nbody\n~~~\n'
    expect(normalizeDetailHeadings(tilde)).toBe(tilde)
  })

  it('keeps a longer fence open past a shorter fence line, and gaps a fence that opens right under a heading', () => {
    const nested = '````\n```\n## inside\nbody\n```\n````\n'
    expect(normalizeDetailHeadings(nested)).toBe(nested)
    expect(normalizeDetailHeadings('## 1 First\n```\ncode\n```\n')).toBe('## 1 First\n\n```\ncode\n```\n')
  })

  it('does not take a hash that is not a heading for one', () => {
    const prose = 'Use #hashtags freely.\n#nospace\nindented code:\n\n    # not a heading\n'
    expect(normalizeDetailHeadings(prose)).toBe(prose)
  })
})

describe('orient with an explicitly requested step', () => {
  // The whole point: an explicit `/plumbbob:build <n>` must never share the context
  // with a rival `next → build step <m>` line, whatever the plan says.
  it('the request outranks the derived suggestion and names what it skips', () => {
    // Step 3 is both a jump past undone step 2 and still rough: both notes
    // ride in one parenthetical rather than fighting for the line.
    expect(orient({ ...base, requested: one(3) }).next).toBe(
      'build step 3 — explicitly requested (skips 1 undone step; still unplanned: `/plumbbob:step` it first)',
    )
  })

  it('a request agreeing with the next undone step still reads as requested', () => {
    expect(orient({ ...base, requested: one(2) }).next).toBe('build step 2 — explicitly requested')
  })

  it('a request for a checkpointed step says so instead of pointing elsewhere', () => {
    expect(orient({ ...base, requested: one(1) }).next).toBe('build step 1 — explicitly requested (already checkpointed)')
  })

  it('a request outside the plan asks for a report, and repoints nothing', () => {
    const o = orient({ ...base, requested: one(9) })
    expect(o.next).toBe('step 9 is not in the plan (3 steps planned) — report the mismatch rather than guess')
    expect(o.requested).toBe(null)
    expect(o.nextDoneWhen).toBe('the thing works.') // detail stays with the next undone step
  })

  it('detail rows repoint at the requested step', () => {
    const o = orient({ ...base, requested: one(1) })
    expect(o.requested).toBe(1)
    expect(o.nextSeam).toEqual(['src/a.ts'])
    expect(o.nextDoneWhen).toBe(null) // step 1 carries no done-when of its own
  })

  it('a request matching the in-flight step keeps the finish move', () => {
    expect(orient({ ...base, requested: one(2), inFlight: 2 }).next).toContain('finish step 2')
  })

  it('a request colliding with a different in-flight step surfaces the collision', () => {
    expect(orient({ ...base, requested: one(3), inFlight: 2 }).next).toBe(
      'build step 3 — explicitly requested (step 2 is still in flight: `/plumbbob:verify` it or `/plumbbob:abandon` it first)',
    )
  })

  it('a spike still closes first; the request rides behind it', () => {
    expect(orient({ ...base, requested: one(3), spiking: true }).next).toBe(
      'close the spike — `plumbbob spike done`; then build step 3 (explicitly requested)',
    )
  })
})

describe('formatOrientation with an explicitly requested step', () => {
  it('moves the one arrow to the requested row, exactly', () => {
    // One arrow, always: the requested step takes the marker and the derived
    // next step loses it, so the dashboard never argues with the invocation.
    expect(formatOrientation(orient({ ...base, requested: one(3) }))).toBe(
      [
        'PlumbBob — My Feature   [DESIGN]',
        '',
        '  steps  1/3 done',
        '  ✓ 1  First step',
        '    2  Second step',
        '  ▸ 3  Third step   ← requested',
        '',
        'last checkpoint  step 1 · abc1234',
        'parked 2 of 2 open · open questions 2',
        '',
        'next → build step 3 — explicitly requested (skips 1 undone step; still unplanned: `/plumbbob:step` it first)',
      ].join('\n'),
    )
  })

  it('a requested checkpointed step keeps its ✓ and takes the arrow', () => {
    const out = formatOrientation(orient({ ...base, requested: one(1) }))
    expect(out).toContain('✓ 1  First step   ← requested')
    expect(out).toContain('seam: src/a.ts')
    expect(out).not.toContain('← next')
  })

  it('an out-of-plan request leaves the ← next marker in place', () => {
    const out = formatOrientation(orient({ ...base, requested: one(9) }))
    expect(out).toContain('▸ 2  Second step   ← next')
    expect(out).toContain('step 9 is not in the plan')
  })
})

describe('the readout rows', () => {
  it('parseSteps records each step\'s line, so a pointer can name where to read it', () => {
    // The `## Steps` heading is line 8 of INTENT, so the first opener is line 10.
    const steps = parseSteps(INTENT)
    expect(steps.map((s) => s.line)).toEqual([10, 12, 15])
    expect(INTENT.split('\n')[9]).toContain('1. [x] First step')
  })

  it('parseConstraintCount reads the declared constraints, in any glossed form', () => {
    const intent = `## Constraints

- <a id="c1"></a>**C1 (no-new-deps)**: no new dependencies.
- C2 (markdown-only): it reads as plain text too.
  - a sub-line that is not its own constraint

## Steps
`
    expect(parseConstraintCount(intent)).toBe(2)
    expect(parseConstraintCount('# no section here')).toBe(0)
  })

  it('parseRecap attaches an indented `- ` item and a `→ ` pointer to the row above', () => {
    const detail = [
      '── recap · step 2 of 3 ──',
      'constraints  bent: C1 (no-new-deps), a dep rode in',
      '             - C2 (markdown-only), the fence lost its rails',
      '             → .plumbbob/detail.md',
      'done-when    met',
      '',
    ].join('\n')
    const parsed = parseRecap(detail)
    expect(parsed?.rows.constraints?.items).toEqual(['C2 (markdown-only), the fence lost its rails'])
    expect(parsed?.rows.constraints?.pointer).toBe('.plumbbob/detail.md')
    // The next label ends the previous row: a stray continuation cannot attach to it.
    expect(parsed?.rows['done-when']?.items).toBeUndefined()
  })

  it('parseRecap reads the collapsed count form as green', () => {
    const detail = ['── recap · step 2 of 3 ──', 'decisions    5 of 5 honored', 'constraints  5 of 5 honored', ''].join('\n')
    expect(parseRecap(detail)?.rows.decisions?.verdict).toBe('true')
    expect(parseRecap(detail)?.rows.constraints?.verdict).toBe('true')
  })

  it('summaryCheckRow sizes a green gate by count and names what a narrowed run left out', () => {
    const ok = summaryCheckRow({ ok: true, checks: [{ name: 'lint', ok: true }, { name: 'test', ok: true }] })
    expect(ok.evidence).toBe('green: 2 of 2 checks')
    const narrowed = summaryCheckRow({
      ok: true,
      checks: [{ name: 'lint', ok: true }, { name: 'test', ok: true, skipped: true }],
    })
    expect(narrowed.evidence).toBe('green: 1 of 2 checks · without test')
  })

  it('summaryCheckRow points a single failing slot at its raw output, falling back to the summary', () => {
    const named = summaryCheckRow({ ok: false, checks: [{ name: 'types', ok: false, output_file: 'types.json' }] })
    expect(named).toMatchObject({ verdict: 'failing', evidence: 'red: types failing', pointer: '.check/types.json' })
    const unnamed = summaryCheckRow({ ok: false, checks: [{ name: 'refs', ok: false, output_file: null }] })
    expect(unnamed.pointer).toBe('.check/summary.json')
  })

  it('seamRowFromDiff sizes green by the declared tokens touched, and vanishes with nothing to measure', () => {
    expect(seamRowFromDiff(['src/a.ts'], ['src/a.ts', 'src/b.ts'])?.evidence).toBe('held: 1 of 2 declared, no strays')
    expect(seamRowFromDiff([], ['src/a.ts'])).toBe(null)
    expect(seamRowFromDiff(['src/a.ts'], [])).toBe(null)
  })

  it('seamRowFromDiff states the size of a stray and lets the paths be the evidence', () => {
    expect(seamRowFromDiff(['src/x.ts'], ['src/a.ts'])).toMatchObject({ evidence: 'strayed: 1 path outside the seam', pointer: 'src/x.ts' })
    expect(seamRowFromDiff(['src/x.ts', 'src/y.ts'], ['src/a.ts'])).toMatchObject({
      evidence: 'strayed: 2 paths outside the seam',
      items: ['src/x.ts', 'src/y.ts'],
    })
  })

  it('spentRowValue reads elapsed, turns, the gate, and the accrued counters', () => {
    expect(
      spentRowValue({
        startedAt: '2026-09-02T10:00:00.000Z',
        landedAt: '2026-09-02T11:28:00.000Z',
        now: Date.parse('2026-09-02T12:00:00.000Z'),
        turns: 3,
        redChecks: 0,
        gateMs: 63_400,
        driftWarnings: 0,
      }),
    ).toBe('88 min · 3 turns · 63s gate · green first run')
  })

  it('spentRowValue runs the clock to now while the step is open, and vanishes with nothing to count', () => {
    const open = spentRowValue({
      startedAt: '2026-09-02T10:00:00.000Z',
      now: Date.parse('2026-09-02T13:05:00.000Z'),
      turns: null,
      redChecks: 1,
      gateMs: null,
      driftWarnings: 2,
    })
    expect(open).toBe('3h 5m · 1 red run · 2 drift warnings')
    expect(spentRowValue({ now: Date.now(), turns: null, redChecks: 0, gateMs: null, driftWarnings: 0 })).toBe(null)
  })

  it('recapLines collapses the green rows and lays the continuations under their row', () => {
    const lines = recapLines(
      {
        check: { verdict: 'true', word: 'green', evidence: 'green: 3 of 3 checks' },
        'done-when': { verdict: 'true', word: 'met', evidence: 'met: the criterion, at length' },
        decisions: { verdict: 'true', word: 'honored', evidence: 'honored: D1 (one), D2 (two)' },
        constraints: { verdict: 'failing', word: 'bent', evidence: 'bent: C1 (no-new-deps)', items: ['C2 (markdown-only)'], pointer: '.plumbbob/detail.md' },
      },
      { diff: '+10 -2 across 1 file', spent: '3 turns', constraints: 5 },
    )
    expect(lines).toEqual([
      'check        green: 3 of 3 checks',
      'done-when    met',
      'decisions    2 of 2 honored',
      'constraints  bent: C1 (no-new-deps)',
      '             - C2 (markdown-only)',
      '             → .plumbbob/detail.md',
      'diff         +10 -2 across 1 file',
      'spent        3 turns',
    ])
  })

  it('recapLines is empty when no row survived, so the caller can drop the fence and its label', () => {
    expect(recapLines({}, { diff: null, spent: null, constraints: 0 })).toEqual([])
  })
})

// INTENT with a build order putting step 3 ahead of step 2: what the plan
// reads once `plumbbob order 3 2` has run against it.
const ORDERED = `${INTENT}
## Build order

3, 2
`

describe('the build order', () => {
  it('parseBuildOrder reads the comma line, tolerating spaces and a trailing comma', () => {
    expect(parseBuildOrder('## Build order\n\n 3 ,2, 10,\n')).toEqual([3, 2, 10])
    expect(parseBuildOrder(ORDERED)).toEqual([3, 2])
  })

  it('parseBuildOrder returns [] with no section, an empty one, or guidance alone', () => {
    expect(parseBuildOrder(INTENT)).toEqual([])
    expect(parseBuildOrder('## Build order\n\n')).toEqual([])
    expect(parseBuildOrder('## Build order\n\n*(the sequence, such as `1, 2, 3`)*\n')).toEqual([])
    // The scaffold ships the section with guidance only, so a fresh build reads
    // in document order.
    expect(parseBuildOrder(readTemplate('intent.md'))).toEqual([])
  })

  it('parseBuildOrder reads the first numeric line only, verbatim, repeats and unknowns included', () => {
    expect(parseBuildOrder('## Build order\n\n2, 2, 9\n3\n\n## Open questions\n')).toEqual([2, 2, 9])
  })

  it('orderSteps puts the listed steps first, then the rest in document order', () => {
    const steps = parseSteps(INTENT)
    expect(orderSteps(steps, [3]).map((s) => s.n)).toEqual([3, 1, 2])
    expect(orderSteps(steps, [3, 2]).map((s) => s.n)).toEqual([3, 2, 1])
  })

  it('orderSteps drops an unknown number, keeps the first of a repeat, and is the identity for an empty order', () => {
    const steps = parseSteps(INTENT)
    expect(orderSteps(steps, [9, 2, 2]).map((s) => s.n)).toEqual([2, 1, 3])
    expect(orderSteps(steps, [])).toEqual(steps)
    // The steps themselves are untouched: only the sequence moves.
    expect(orderSteps(steps, [3, 2])[0]).toBe(steps[2])
  })

  it('parseOrderedSteps merges the two reads', () => {
    expect(parseOrderedSteps(ORDERED).map((s) => s.n)).toEqual([3, 2, 1])
    expect(parseOrderedSteps(INTENT).map((s) => s.n)).toEqual([1, 2, 3])
  })

  it('skippedBefore counts the undone steps ahead in build order, not the lower numbers', () => {
    const ordered = parseOrderedSteps(ORDERED)
    expect(skippedBefore(ordered, 2).map((s) => s.n)).toEqual([3])
    expect(skippedBefore(ordered, 3)).toEqual([])
    expect(skippedBefore(ordered, 9)).toEqual([])
  })

  it('remainingOrder is the undone sequence when it departs from document order, else empty', () => {
    const steps = parseSteps(INTENT)
    expect(remainingOrder(steps, [3, 2], null)).toEqual([3, 2])
    expect(remainingOrder(steps, [], null)).toEqual([])
    expect(remainingOrder(steps, [2, 3], null)).toEqual([]) // the numbering already carries it
    // With step 3 in flight and excluded, nothing is left to re-sequence.
    expect(remainingOrder(steps, [3, 2], 3)).toEqual([])
  })

  it('buildOrderPhrase caps the sequence and folds the rest to a count', () => {
    expect(buildOrderPhrase([7, 8, 5, 10, 6, 9, 11], 5)).toBe('build order 7, 8, 5, 10, 6 (and 2 more)')
    expect(buildOrderPhrase([7, 8], 5)).toBe('build order 7, 8')
    expect(buildOrderPhrase([7, 8, 5, 10, 6, 9, 11])).toBe('build order 7, 8, 5, 10, 6, 9, 11')
    expect(buildOrderPhrase([])).toBe('')
  })

  it('setBuildOrder opens the section right after ## Steps when the plan has none', () => {
    expect(setBuildOrder(INTENT, [3, 2])).toContain('3. [ ] Third step\n\n## Build order\n\n3, 2\n\n## Open questions')
    // No ## Steps at all: the section lands at the end.
    expect(setBuildOrder('# T\n', [3, 2])).toBe('# T\n\n## Build order\n\n3, 2\n')
  })

  it('setBuildOrder replaces the line in place, and fills a section that holds guidance only', () => {
    const replaced = setBuildOrder(ORDERED, [2, 3])
    expect(replaced).toContain('## Build order\n\n2, 3\n')
    expect(replaced).not.toContain('3, 2')
    const guided = '# T\n\n## Steps\n\n1. [ ] a\n\n## Build order\n\n*(guidance)*\n\n## Open questions\n'
    expect(setBuildOrder(guided, [1])).toBe('# T\n\n## Steps\n\n1. [ ] a\n\n## Build order\n\n*(guidance)*\n\n1\n\n## Open questions\n')
  })

  it('clearBuildOrder drops the line, drops an emptied section, and leaves a plan with no line alone', () => {
    expect(clearBuildOrder(ORDERED)).toBe(INTENT)
    const guided = '# T\n\n## Steps\n\n1. [ ] a\n\n## Build order\n\n*(guidance)*\n\n1\n\n## Open questions\n'
    expect(clearBuildOrder(guided)).toBe('# T\n\n## Steps\n\n1. [ ] a\n\n## Build order\n\n*(guidance)*\n\n## Open questions\n')
    expect(clearBuildOrder(INTENT)).toBe(INTENT)
  })

  it('the next move follows the build order', () => {
    // Step 3 carries no done-when, so the move is to plan it: the order put it first.
    expect(orient({ ...base, intent: ORDERED }).next).toBe('plan step 3 — `/plumbbob:step`')
  })

  it('points a requested range at its first undone step in build order, not its first number', () => {
    // Step 1 is done and the order runs 3 before 2, so `1-3` starts at 3.
    expect(orient({ ...base, intent: ORDERED, requested: parseRequestedStep('1-3') }).requested).toBe(3)
    expect(orient({ ...base, intent: ORDERED, requested: parseRequestedStep('2,3') }).requested).toBe(3)
    // Document order: the same range starts at 2, its first undone step.
    expect(orient({ ...base, requested: parseRequestedStep('1-3') }).requested).toBe(2)
    expect(orient({ ...base, requested: parseRequestedStep('3,2') }).requested).toBe(2)
  })

  it("a requested step's skip count reads the build order", () => {
    expect(orient({ ...base, intent: ORDERED, requested: one(2) }).next).toBe(
      'build step 2 — explicitly requested (skips 1 undone step)',
    )
    expect(orient({ ...base, intent: ORDERED, requested: one(3) }).next).toBe(
      'build step 3 — explicitly requested (still unplanned: `/plumbbob:step` it first)',
    )
  })

  it('renders the whole dashboard exactly with a build order row', () => {
    // The marker follows the order, the step block keeps document order, and
    // the row sits between the checkpoint and the counts.
    expect(formatOrientation(orient({ ...base, intent: ORDERED }))).toBe(
      [
        'PlumbBob — My Feature   [DESIGN]',
        '',
        '  steps  1/3 done',
        '  ✓ 1  First step',
        '    2  Second step',
        '  ▸ 3  Third step   ← next',
        '',
        'last checkpoint  step 1 · abc1234',
        'build order  3, 2',
        'parked 2 of 2 open · open questions 2',
        '',
        'next → plan step 3 — `/plumbbob:step`',
      ].join('\n'),
    )
  })

  it('the build order row vanishes when the order is the numbering', () => {
    const out = formatOrientation(orient({ ...base, intent: `${INTENT}\n## Build order\n\n2, 3\n` }))
    expect(out).not.toContain('build order')
    expect(out).toContain('▸ 2  Second step   ← next')
  })
})

describe('the dashboard ranges block', () => {
  // Twelve steps cut the way the presentation spec's running example cuts them.
  const RANGED = [
    '# Ranged',
    '',
    '## Steps',
    '',
    ...Array.from({ length: 12 }, (_, i) => `${i + 1}. [ ] Step ${i + 1}, **done when:** it works`),
    '',
    '## Build ranges',
    '',
    'Five commands drive the build.',
    '',
    "1. `/plumbbob:build 1`, **stop:** at step 1's pause, approve the schema before anything writes to it",
    '   - model: opus',
    '2. `/plumbbob:build 2-5`, **stop:** review the parser before the renderers build on it',
    '   - model: opus',
    '3. `/plumbbob:build 6-9`, **stop:** review the card on a live boundary before the skills teach it',
    '   - model: opus',
    "4. `/plumbbob:build 10`, **stop:** at step 10's pause, pick the label the docs will name",
    '   - model: fable',
    '5. `/plumbbob:build 11-12`, **stop:** the final read of the docs, then `/plumbbob:finish`',
    '   - model: opus',
    '',
  ].join('\n')

  /** RANGED with the steps in `done` ticked. */
  const ranged = (done: ReadonlyArray<number>, intent = RANGED): string =>
    done.reduce((text, n) => text.replace(`${n}. [ ]`, `${n}. [x]`), intent)

  /** The dashboard for a plan, at the boundary, nothing parked. */
  const dashboard = (intent: string, extra: Partial<OrientInput> = {}) =>
    formatOrientation(orient({ ...base, intent, buildLog: '', checkpoints: 'step 5 1a2b3c4d\n', ...extra }))

  it('renders the block beneath the steps exactly, and names the range in next →', () => {
    const out = dashboard(ranged([1, 2, 3, 4, 5]))
    expect(out.slice(out.indexOf('  ranges'))).toBe(
      [
        '  ranges  2 of 5 done',
        '  ✓ 1  /plumbbob:build 1 · opus',
        '  ✓ 2  /plumbbob:build 2-5 · opus',
        '  ▸ 3  /plumbbob:build 6-9 · opus   ← next',
        '        stop: review the card on a live boundary before the skills teach it',
        "    4  /plumbbob:build 10 · fable",
        "        stop: at step 10's pause, pick the label the docs will name",
        '    5  /plumbbob:build 11-12 · opus',
        '        stop: the final read of the docs, then `/plumbbob:finish`',
        '',
        'last checkpoint  step 5 · 1a2b3c4',
        'parked 0 · open questions 0',
        '',
        'next → build range 3 of 5 — `/plumbbob:build 6-9`',
      ].join('\n'),
    )
    // The block sits under the step list, a blank line between.
    expect(out).toContain('  ▸ 6  Step 6   ← next\n        done when: it works\n    7  Step 7')
    expect(out).toContain('   12  Step 12\n\n  ranges  2 of 5 done')
  })

  it('names what is left of the range in next →, and drops the model for a range with none', () => {
    expect(dashboard(ranged([1, 2, 3, 4, 5, 6, 7]))).toContain('next → build range 3 of 5 — `/plumbbob:build 8-9`')
    const plainModel = ranged([1, 2, 3, 4, 5], RANGED.replace("   - model: fable\n", ''))
    expect(dashboard(plainModel)).toContain('    4  /plumbbob:build 10\n')
  })

  it('rides a drift row beneath the range it flags and closes on the plan rows, and the move falls back to the step', () => {
    const outgrown = ranged(
      [1, 2, 3, 4, 5],
      RANGED.replace('## Build ranges', '## Build order\n\n1, 2, 3, 4, 5, 6, 7, 11, 8\n\n## Build ranges')
        .replace(/^5\. `[\s\S]*$/m, '5. `/plumbbob:build 11`\n'),
    )
    const out = dashboard(outgrown)
    expect(out).toContain(
      [
        '  ▸ 3  /plumbbob:build 6-9 · opus   ← next',
        '        stop: review the card on a live boundary before the skills teach it',
        '        ⚠ needs a re-cut: the build order puts step 11 inside it',
        '    4  /plumbbob:build 10 · fable',
        "        stop: at step 10's pause, pick the label the docs will name",
        '  ⚠ no range names steps 11, 12',
        '  ⚠ item 5 under Build ranges does not parse',
      ].join('\n'),
    )
    expect(out).toContain('  ranges  2 of 5 done')
    expect(out).toContain('next → build step 6 — `/plumbbob:build` (or `/plumbbob:step` to revise it first)')
  })

  it('keeps the pointer as it reads today with a step in flight or a step asked for', () => {
    expect(dashboard(ranged([1, 2, 3, 4, 5]), { inFlight: 6 })).toContain('next → finish step 6 — `/plumbbob:verify`')
    expect(dashboard(ranged([1, 2, 3, 4, 5]), { requested: one(8) })).toContain('next → build step 8 — explicitly requested')
  })

  it("renders no block for a plan without ranges, or with only the template's placeholder", () => {
    const placeholder = RANGED.replace(
      /## Build ranges[\s\S]*$/,
      "## Build ranges\n\n1. `/plumbbob:build <N-M>`, **stop:** <the call that is the human's here>\n   - model: <the strongest model any step inside it recommends>\n",
    )
    for (const intent of [ranged([1], RANGED.replace(/## Build ranges[\s\S]*$/, '')), ranged([1], placeholder)]) {
      const o = orient({ ...base, intent })
      expect(o.ranges).toBeNull()
      expect(formatOrientation(o)).not.toContain('ranges')
      expect(o.next).toBe('build step 2 — `/plumbbob:build` (or `/plumbbob:step` to revise it first)')
    }
  })
})

describe('the park counts', () => {
  it('parseParkTotals counts the open items and every item; parseParked keeps its open count', () => {
    expect(parseParkTotals(BUILDLOG)).toEqual({ open: 2, total: 2 })
    expect(parseParkTotals('## Park list\n- [ ] still open\n- [x] already harvested\n## Harvest\n')).toEqual({ open: 1, total: 2 })
    expect(parseParkTotals('## Park list\n- (none yet)\n## Harvest\n')).toEqual({ open: 0, total: 0 })
    expect(parseParked('## Park list\n- [ ] still open\n- [x] already harvested\n## Harvest\n')).toBe(1)
  })

  it('parkedPhrase reads N of M open once anything was parked, and a bare 0 before', () => {
    expect(parkedPhrase({ open: 0, total: 0 })).toBe('parked 0')
    expect(parkedPhrase({ open: 2, total: 7 })).toBe('parked 2 of 7 open')
  })

  it('the dashboard reads N of M open once a park is harvested', () => {
    const buildLog = '## Park list\n- [ ] still open\n- [x] already harvested\n## Harvest\n'
    const o = orient({ ...base, buildLog })
    expect(o.parked).toBe(1)
    expect(o.parkedTotal).toBe(2)
    expect(formatOrientation(o)).toContain('parked 1 of 2 open · open questions 2')
  })
})

describe('the build ranges', () => {
  // The running example from docs/presentation.md: twelve steps cut into five ranges.
  const SECTION = `## Build ranges

Five commands drive the build. Two stops are calls made at a step's own pause, and three are reviews after a range lands.

1. \`/plumbbob:build 1\`, **stop:** at step 1's pause, approve the schema before anything writes to it
   - model: opus
2. \`/plumbbob:build 2-5\`, **stop:** review the parser before the renderers build on it
   - model: opus
   - note: run long jobs in the foreground while the range is live
3. \`/plumbbob:build 6-9\`, **stop:** review the card on a live boundary before the skills teach it
   - model: opus
4. \`/plumbbob:build 10\`, **stop:** at step 10's pause, pick the label the docs will name
   - model: fable
5. \`/plumbbob:build 11-12\`, **stop:** the final read of the docs, then \`/plumbbob:finish\`
   - model: opus
`

  // The template's placeholder, exactly as the spec fixes it.
  const PLACEHOLDER = `## Build ranges

1. \`/plumbbob:build <N-M>\`, **stop:** <the call that is the human's here: a decision the plan leaves open, a review before later steps build on what landed, or a thing only a human can do>
   - model: <the strongest model any step inside it recommends>
`

  /** A plan of `count` steps, those in `done` landed, under an optional build order and ranges section. */
  const plan = (opts: { count?: number; done?: ReadonlyArray<number>; order?: ReadonlyArray<number>; ranges?: string }): string => {
    const count = opts.count ?? 12
    const steps = Array.from({ length: count }, (_, i) => {
      const n = i + 1
      return `${n}. [${opts.done?.includes(n) === true ? 'x' : ' '}] Step ${n}, **done when:** it works`
    })
    const order = opts.order === undefined ? '' : `## Build order\n\n${opts.order.join(', ')}\n\n`
    return `# Ranged\n\n## Steps\n\n${steps.join('\n')}\n\n${order}${opts.ranges ?? ''}\n## Open questions\n`
  }

  /** The steps 1 through `n`. */
  const through = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1)

  /** A section of the given items under the heading, no intro. */
  const items = (...lines: string[]): string => `## Build ranges\n\n${lines.join('\n')}\n`

  /** Where the build stands from `step`, read the way every surface reads it. */
  const standing = (intent: string, step: number | null) =>
    rangeStanding(parseBuildRanges(intent), parseOrderedSteps(intent), step)

  describe('parseBuildRanges', () => {
    it('reads each item: its number, its steps, its form, its stop, its model, and its line', () => {
      const intent = plan({ ranges: SECTION })
      const lineOf = (opener: string) => intent.split('\n').findIndex((l) => l.startsWith(opener)) + 1
      const { ranges, malformed } = parseBuildRanges(intent)
      expect(malformed).toEqual([])
      expect(ranges.map((r) => r.item)).toEqual([1, 2, 3, 4, 5])
      expect(ranges[1]).toEqual({
        item: 2,
        command: '/plumbbob:build 2-5',
        steps: [{ from: 2, to: 5 }],
        bare: false,
        stop: 'review the parser before the renderers build on it',
        model: 'opus',
        line: lineOf('2. `'),
      })
      expect(ranges[3]).toEqual({
        item: 4,
        command: '/plumbbob:build 10',
        steps: [{ from: 10, to: 10 }],
        bare: true,
        stop: "at step 10's pause, pick the label the docs will name",
        model: 'fable',
        line: lineOf('4. `'),
      })
      expect(ranges[4]?.stop).toBe('the final read of the docs, then `/plumbbob:finish`')
    })

    it('joins a stop wrapped across lines and ends it at the first sub-line, leaving a note to the reader', () => {
      const { ranges } = parseBuildRanges(
        plan({
          ranges: items(
            '1. `/plumbbob:build 1-3`, **stop:** review the parser',
            '   before the renderers build on it,',
            'and before the docs name it',
            '   - note: watch the hook',
            '   - model: sonnet (the parser is small)',
          ),
        }),
      )
      expect(ranges[0]?.stop).toBe('review the parser before the renderers build on it, and before the docs name it')
      expect(ranges[0]?.model).toBe('sonnet (the parser is small)')
    })

    it('reads a list or a span the way the turn hook reads a typed range, and a lone number as bare', () => {
      const { ranges } = parseBuildRanges(
        plan({
          ranges: items(
            '1. `/plumbbob:build 20,5-9`, **stop:** review it',
            '2. `/plumbbob:build 20, 5-9`, **stop:** review it',
            '3. `/plumbbob:build 9-9`, **stop:** review it',
            '4. `/plumbbob:build 7`, **stop:** decide it',
          ),
        }),
      )
      expect(ranges.map((r) => [r.steps, r.bare])).toEqual([
        [[{ from: 20, to: 20 }, { from: 5, to: 9 }], false],
        [[{ from: 20, to: 20 }, { from: 5, to: 9 }], false],
        [[{ from: 9, to: 9 }], false],
        [[{ from: 7, to: 7 }], true],
      ])
      expect(ranges.every((r) => r.model === null)).toBe(true)
    })

    it("reads no ranges from a plan without the section, a record under another heading, or the template's placeholder", () => {
      const older = '## Build runs\n\n1. `/plumbbob:build 1-3`, **stop:** review it\n\n## Ranges\n\n1. `/plumbbob:build 4-6`, **stop:** review it\n'
      for (const intent of [plan({}), plan({ ranges: older }), plan({ ranges: PLACEHOLDER })]) {
        expect(parseBuildRanges(intent)).toEqual({ ranges: [], malformed: [] })
        expect(standing(intent, 6)).toEqual({ count: 0, holding: null, command: null, flag: null, completed: null, drift: [] })
      }
    })

    it('reads an item whose command or stop still holds a fill-in as scaffold, and a placeholder model as none', () => {
      const intent = plan({
        ranges: items(
          '1. `/plumbbob:build <N-M>`, **stop:** review the parser',
          '2. `/plumbbob:build 2-5`, **stop:** <the call that is the human here>',
          '3. `/plumbbob:build 6-9`, **stop:** review the card',
          '   - model: <the strongest model any step inside it recommends>',
        ),
      })
      const { ranges, malformed } = parseBuildRanges(intent)
      expect(malformed).toEqual([])
      expect(ranges.map((r) => [r.item, r.model])).toEqual([[3, null]])
    })

    it('reports an item that fails the grammar by its number, and never throws', () => {
      const intent = plan({
        ranges: items(
          '1. /plumbbob:build 1, **stop:** no backticks',
          '2. `/plumbbob:build 2`',
          '3. `/plumbbob:build 3`, **stop:**',
          '4. `/plumbbob:build 9-6`, **stop:** a span that runs backwards',
          '5. `/plumbbob:build 5 6`, **stop:** two bare numbers',
          '6. `/plumbbob:build --auto`, **stop:** a flag and no steps',
          '7. `/build 7`, **stop:** another command',
          '8. `/plumbbob:build 8 then review`, **stop:** words after the steps',
          '9. `/plumbbob:build 1-12`, **stop:** the one that parses',
        ),
      })
      const { ranges, malformed } = parseBuildRanges(intent)
      expect(malformed).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(ranges.map((r) => r.item)).toEqual([9])
      expect(standing(intent, 1).count).toBe(9)
      expect(standing(intent, 1).drift.at(-1)).toEqual({ kind: 'malformed', item: 8, words: 'item 8 under Build ranges does not parse' })
    })
  })

  describe('rangeStanding', () => {
    it('names the range holding a step and the command that runs it, in document order', () => {
      const intent = plan({ ranges: SECTION })
      const at6 = standing(intent, 6)
      expect(at6.count).toBe(5)
      expect(at6.holding?.item).toBe(3)
      expect(at6.command).toBe('/plumbbob:build 6-9')
      expect([at6.flag, at6.completed, at6.drift]).toEqual([null, null, []])
      expect(standing(intent, 1).command).toBe('/plumbbob:build 1')
      expect(standing(intent, 2).command).toBe('/plumbbob:build 2-5')
      expect(standing(intent, 10).command).toBe('/plumbbob:build 10')
      expect(standing(intent, null)).toEqual({ count: 5, holding: null, command: null, flag: null, completed: null, drift: [] })
    })

    it('names what is left from the step: a run resumed, its last step written to land, and a step pause', () => {
      expect(standing(plan({ done: through(7), ranges: SECTION }), 8).command).toBe('/plumbbob:build 8-9')
      expect(standing(plan({ done: through(8), ranges: SECTION }), 9).command).toBe('/plumbbob:build 9-9')
      // Step 6 in flight: Next Up names step 7, so the command is what is left once 6 lands.
      expect(standing(plan({ done: through(5), ranges: SECTION }), 7).command).toBe('/plumbbob:build 7-9')
      // A landed step's range with nothing left names no command.
      expect(standing(plan({ done: through(9), ranges: SECTION }), 9).command).toBeNull()
    })

    it('writes a list range in build order however it is written, under a re-sequenced build order', () => {
      const runs = (list: string) =>
        items('1. `/plumbbob:build 1-4`, **stop:** review it', `2. \`/plumbbob:build ${list}\`, **stop:** review it`, '3. `/plumbbob:build 10-19`, **stop:** review it')
      // Step 20 joined the plan late, and the build order puts it before step 5.
      const order = [1, 2, 3, 4, 20]
      for (const list of ['20,5-9', '5-9,20']) {
        const intent = plan({ count: 20, done: through(4), order, ranges: runs(list) })
        expect(standing(intent, 20).command).toBe('/plumbbob:build 20,5-9')
        expect(standing(intent, 20).drift).toEqual([])
      }
      const resumed = plan({ count: 20, done: [...through(4), 20], order, ranges: runs('5-9,20') })
      expect(standing(resumed, 5).command).toBe('/plumbbob:build 5-9')
      // A span the build order re-sequences is written in build order too.
      const whole = standing(plan({ count: 20, order, ranges: items('1. `/plumbbob:build 1-20`, **stop:** review it') }), 1)
      expect(whole).toMatchObject({ command: '/plumbbob:build 1-4,20,5-19', drift: [] })
    })

    it('names the range a landing completed, whichever step lands last and however it landed', () => {
      expect(standing(plan({ done: through(9), ranges: SECTION }), 9).completed?.item).toBe(3)
      expect(standing(plan({ done: through(8), ranges: SECTION }), 8).completed).toBeNull()
      // Landed by hand out of order: step 8 lands after 9, and finishes the range.
      expect(standing(plan({ done: [...through(7), 9, 8], ranges: SECTION }), 8).completed?.item).toBe(3)
      expect(standing(plan({ done: [...through(7), 9], ranges: SECTION }), 9).completed).toBeNull()
      // A bare range completes too; the caller drops the Stop part for it.
      expect(standing(plan({ done: through(10), ranges: SECTION }), 10).completed).toMatchObject({ item: 4, bare: true })
      // An undone step completes nothing.
      expect(standing(plan({ done: [...through(5), 7, 8, 9], ranges: SECTION }), 6).completed).toBeNull()
      // Under a re-sequenced build order, the range completes when its last undone step lands.
      const runs = items('1. `/plumbbob:build 1-4`, **stop:** review it', '2. `/plumbbob:build 20,5-9`, **stop:** review it')
      expect(standing(plan({ count: 20, done: through(9), order: [1, 2, 3, 4, 20], ranges: runs }), 9).completed).toBeNull()
      expect(standing(plan({ count: 20, done: [...through(9), 20], order: [1, 2, 3, 4, 20], ranges: runs }), 20).completed?.item).toBe(2)
    })

    it('flags a range naming steps the plan lacks, a span of any width read without counting it out', () => {
      const one = standing(plan({ ranges: items('1. `/plumbbob:build 1-12`, **stop:** review it', '2. `/plumbbob:build 14`, **stop:** decide it') }), 1)
      expect(one.drift).toEqual([{ kind: 'missing', item: 2, words: 'step 14 is not in the plan' }])
      const wide = plan({ ranges: items('1. `/plumbbob:build 1-10`, **stop:** review it', '2. `/plumbbob:build 11-1000000000`, **stop:** review it') })
      expect(standing(wide, 11).drift).toEqual([{ kind: 'missing', item: 2, words: 'steps 13-1000000000 are not in the plan' }])
      // A flagged range gets no command, and the words say why.
      expect(standing(wide, 11)).toMatchObject({ command: null, flag: 'steps 13-1000000000 are not in the plan' })
    })

    it('flags two ranges naming one step, each naming the other, landed or not', () => {
      const ranges = items(
        '1. `/plumbbob:build 1-5`, **stop:** review it',
        '2. `/plumbbob:build 5-9`, **stop:** review it',
        '3. `/plumbbob:build 10-12`, **stop:** review it',
      )
      const fresh = standing(plan({ ranges }), 5)
      expect(fresh.drift).toEqual([
        { kind: 'shared', item: 1, words: 'step 5 is also in range 2' },
        { kind: 'shared', item: 2, words: 'step 5 is also in range 1' },
      ])
      expect(fresh).toMatchObject({ holding: { item: 1 }, command: null, flag: 'step 5 is also in range 2' })
      const landed = standing(plan({ done: through(5), ranges }), 6)
      expect(landed).toMatchObject({ holding: { item: 2 }, command: null, flag: 'step 5 is also in range 1' })
    })

    it('flags a range the build order cuts short, and passes it once the range names the step', () => {
      // Checkride's case: step 76 joined late, and the build order puts it between 51 and 52.
      const order = [...through(51), 76]
      const cut = (second: string, rest: ReadonlyArray<string>) =>
        items('1. `/plumbbob:build 1-47`, **stop:** review it', `2. \`/plumbbob:build ${second}\`, **stop:** review it`, ...rest)
      const flagged = plan({ count: 76, done: through(47), order, ranges: cut('48-57', ['3. `/plumbbob:build 58-75`, **stop:** review it', '4. `/plumbbob:build 76`, **stop:** decide it']) })
      expect(standing(flagged, 48)).toMatchObject({
        holding: { item: 2 },
        command: null,
        flag: 'the build order puts step 76 inside it',
        drift: [{ kind: 'inside', item: 2, words: 'the build order puts step 76 inside it' }],
      })
      const passed = plan({ count: 76, done: through(47), order, ranges: cut('48-57,76', ['3. `/plumbbob:build 58-75`, **stop:** review it']) })
      expect(standing(passed, 48)).toMatchObject({ command: '/plumbbob:build 48-51,76,52-57', flag: null, drift: [] })
      // Step 76 ordered ahead of the range builds first and cuts nothing, and neither does a landed 76 inside it.
      const own76 = ['3. `/plumbbob:build 58-75`, **stop:** review it', '4. `/plumbbob:build 76`, **stop:** decide it']
      const ahead = plan({ count: 76, done: through(47), order: [...through(47), 76], ranges: cut('48-57', own76) })
      expect(standing(ahead, 76)).toMatchObject({ command: '/plumbbob:build 76', drift: [] })
      const landed = plan({ count: 76, done: [...through(51), 76], order, ranges: cut('48-57', own76) })
      expect(standing(landed, 52)).toMatchObject({ command: '/plumbbob:build 52-57', drift: [] })
      // A run that halted at 51 leaves the range flagged until step 76 lands; the card names 76's range meanwhile.
      const halted = plan({ count: 76, done: through(51), order, ranges: cut('48-57', own76) })
      expect(standing(halted, 76)).toMatchObject({ command: '/plumbbob:build 76', drift: [{ kind: 'inside', item: 2 }] })
    })

    it('flags the undone steps no range names, once a real range parses', () => {
      const four = SECTION.replace(/^5\. [\s\S]*$/m, '')
      const open = standing(plan({ ranges: four }), 11)
      expect(open.drift).toEqual([{ kind: 'uncovered', item: null, words: 'no range names steps 11, 12' }])
      expect(open).toMatchObject({ holding: null, command: null, flag: 'no range names step 11' })
      // A landed step outside every range is not flagged.
      expect(standing(plan({ done: [11], ranges: four }), 12).drift).toEqual([{ kind: 'uncovered', item: null, words: 'no range names step 12' }])
      // With no range that parses, no step sits outside one: only the item is reported.
      const broken = standing(plan({ ranges: items('1. `/plumbbob:build 1-12`') }), 1)
      expect(broken).toMatchObject({ count: 1, flag: null, drift: [{ kind: 'malformed', item: 1, words: 'item 1 under Build ranges does not parse' }] })
    })

    it('keeps the command as the plan wrote it, spacing and all', () => {
      const { ranges } = parseBuildRanges(plan({ ranges: items('1. `/plumbbob:build 20, 5-9`, **stop:** review it') }))
      expect(ranges[0]?.command).toBe('/plumbbob:build 20, 5-9')
    })

    it("lists each range's reports in the plan's order, then the steps no range names, then the items that do not parse", () => {
      const intent = plan({
        ranges: items(
          '1. `/plumbbob:build 1-5`, **stop:** review it',
          '2. `/plumbbob:build 6-9,14`, **stop:** review it',
          '3. `/plumbbob:build 10-11`',
        ),
      })
      expect(standing(intent, 6).drift.map((d) => [d.kind, d.item])).toEqual([
        ['missing', 2],
        ['uncovered', null],
        ['malformed', 3],
      ])
    })
  })
})
