import { describe, expect, it } from 'vitest'
import {
  buildOrderPhrase,
  clearBuildOrder,
  formatOrientation,
  lastLedgerSha,
  markStepDone,
  orderSteps,
  orient,
  parkedPhrase,
  parseBuildOrder,
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
  remainingOrder,
  recapLines,
  seamRowFromDiff,
  setBuildOrder,
  skippedBefore,
  spentRowValue,
  summaryCheckRow,
} from '../orient.ts'
import { readTemplate } from '../templates.ts'

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
    expect(parseRequestedStep('22')).toBe(22)
    expect(parseRequestedStep('  22 --auto')).toBe(22)
    expect(parseRequestedStep('--auto 22')).toBe(22)
  })

  it('reads a range as its first number (the range is the skill\'s auto-approve ceiling)', () => {
    expect(parseRequestedStep('1-3')).toBe(1)
    expect(parseRequestedStep('22-24 --auto')).toBe(22)
  })

  it('parses no ask to null', () => {
    expect(parseRequestedStep(null)).toBe(null)
    expect(parseRequestedStep('')).toBe(null)
    expect(parseRequestedStep('--auto')).toBe(null)
    // A host that never substitutes the invocation passes the placeholder
    // through literally; that must degrade to "no ask", not a step.
    expect(parseRequestedStep('$ARGUMENTS')).toBe(null)
    expect(parseRequestedStep('0')).toBe(null)
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

describe('orient with an explicitly requested step', () => {
  // The whole point: an explicit `/plumbbob:build <n>` must never share the context
  // with a rival `next → build step <m>` line, whatever the plan says.
  it('the request outranks the derived suggestion and names what it skips', () => {
    // Step 3 is both a jump past undone step 2 and still rough: both notes
    // ride in one parenthetical rather than fighting for the line.
    expect(orient({ ...base, requested: 3 }).next).toBe(
      'build step 3 — explicitly requested (skips 1 undone step; still unplanned: `/plumbbob:step` it first)',
    )
  })

  it('a request agreeing with the next undone step still reads as requested', () => {
    expect(orient({ ...base, requested: 2 }).next).toBe('build step 2 — explicitly requested')
  })

  it('a request for a checkpointed step says so instead of pointing elsewhere', () => {
    expect(orient({ ...base, requested: 1 }).next).toBe('build step 1 — explicitly requested (already checkpointed)')
  })

  it('a request outside the plan asks for a report, and repoints nothing', () => {
    const o = orient({ ...base, requested: 9 })
    expect(o.next).toBe('step 9 is not in the plan (3 steps planned) — report the mismatch rather than guess')
    expect(o.requested).toBe(null)
    expect(o.nextDoneWhen).toBe('the thing works.') // detail stays with the next undone step
  })

  it('detail rows repoint at the requested step', () => {
    const o = orient({ ...base, requested: 1 })
    expect(o.requested).toBe(1)
    expect(o.nextSeam).toEqual(['src/a.ts'])
    expect(o.nextDoneWhen).toBe(null) // step 1 carries no done-when of its own
  })

  it('a request matching the in-flight step keeps the finish move', () => {
    expect(orient({ ...base, requested: 2, inFlight: 2 }).next).toContain('finish step 2')
  })

  it('a request colliding with a different in-flight step surfaces the collision', () => {
    expect(orient({ ...base, requested: 3, inFlight: 2 }).next).toBe(
      'build step 3 — explicitly requested (step 2 is still in flight: `/plumbbob:verify` it or `/plumbbob:abandon` it first)',
    )
  })

  it('a spike still closes first; the request rides behind it', () => {
    expect(orient({ ...base, requested: 3, spiking: true }).next).toBe(
      'close the spike — `plumbbob spike done`; then build step 3 (explicitly requested)',
    )
  })
})

describe('formatOrientation with an explicitly requested step', () => {
  it('moves the one arrow to the requested row, exactly', () => {
    // One arrow, always: the requested step takes the marker and the derived
    // next step loses it, so the dashboard never argues with the invocation.
    expect(formatOrientation(orient({ ...base, requested: 3 }))).toBe(
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
    const out = formatOrientation(orient({ ...base, requested: 1 }))
    expect(out).toContain('✓ 1  First step   ← requested')
    expect(out).toContain('seam: src/a.ts')
    expect(out).not.toContain('← next')
  })

  it('an out-of-plan request leaves the ← next marker in place', () => {
    const out = formatOrientation(orient({ ...base, requested: 9 }))
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

  it("a requested step's skip count reads the build order", () => {
    expect(orient({ ...base, intent: ORDERED, requested: 2 }).next).toBe(
      'build step 2 — explicitly requested (skips 1 undone step)',
    )
    expect(orient({ ...base, intent: ORDERED, requested: 3 }).next).toBe(
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
