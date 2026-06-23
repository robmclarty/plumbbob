import { describe, expect, it } from 'vitest'
import {
  formatOrientation,
  orient,
  parseLastCheckpoint,
  parseOpenQuestions,
  parseParked,
  parseSteps,
  parseTitle,
} from '../src/lib/orient.ts'

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
const base = { intent: INTENT, buildLog: BUILDLOG, checkpoints: CHECKPOINTS, inFlight: null }

describe('orient parsers', () => {
  it('parseTitle takes the first heading', () => {
    expect(parseTitle(INTENT)).toBe('My Feature')
    expect(parseTitle('no heading here')).toBe(null)
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

  it('parseParked counts only OPEN [ ] items, not harvested [x], the placeholder, or instructions', () => {
    expect(parseParked(BUILDLOG)).toBe(2)
    expect(parseParked('## Park list\n- (none yet)\n## Harvest\n')).toBe(0)
    expect(parseParked('## Park list\n- [ ] still open\n- [x] already harvested\n## Harvest\n')).toBe(1)
  })

  it('parseLastCheckpoint returns the last step line, short sha intact', () => {
    expect(parseLastCheckpoint(CHECKPOINTS)).toEqual({ n: 1, sha: 'abc1234def' })
    expect(parseLastCheckpoint('baseline x\n')).toBe(null)
  })
})

describe('orient next-move inference (D15)', () => {
  it('DESIGN with the next step planned → /pb-build that step', () => {
    const next = orient({ ...base, state: 'DESIGN' }).next
    expect(next).toContain('/pb-build')
    expect(next).toContain('step 2')
  })

  it('DESIGN with the next step unplanned → /pb-step', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] done one — **done**\n2. [ ] just a rough idea\n'
    expect(orient({ ...base, intent, state: 'DESIGN' }).next).toContain('/pb-step')
  })

  it('BUILD → finish the in-flight step with /pb-verify', () => {
    expect(orient({ ...base, state: 'BUILD', inFlight: 2 }).next).toContain('/pb-verify')
  })

  it('all planned steps done, nothing parked → offers plan-next AND wrap-up', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n'
    const buildLog = '## Park list\n- (none yet)\n## Harvest\n'
    const next = orient({ ...base, intent, buildLog, state: 'DESIGN' }).next
    expect(next).toContain('/pb-step') // just-in-time: plan the next step
    expect(next).toContain('/pb-reset') // ...or wrap up if truly done
  })

  it('all planned steps done with parked items → leads with /pb-harvest', () => {
    const intent = '# T\n\n## Steps\n\n1. [x] a — **done**\n2. [x] b — **done**\n'
    expect(orient({ ...base, intent, state: 'DESIGN' }).next).toContain('/pb-harvest')
  })

  it('SPIKE and FINISH point at their close-out', () => {
    expect(orient({ ...base, state: 'SPIKE' }).next).toContain('spike done')
    expect(orient({ ...base, state: 'FINISH' }).next).toContain('/pb-reset')
  })
})

describe('formatOrientation', () => {
  it('renders title, state, markers, counts, and the next move', () => {
    const out = formatOrientation(orient({ ...base, state: 'DESIGN' }))
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
})
