import { describe, expect, it } from 'vitest'
import { buildState, movesFor, tasksFor, type MovesInput } from '../moves.ts'
import { orient, resolveRun, type OrientInput } from '../orient.ts'

const STEPS = (done: ReadonlyArray<number>, extra: ReadonlyArray<string> = []): string =>
  [
    '# Moves',
    '',
    '## Steps',
    '',
    `1. [${done.includes(1) ? 'x' : ' '}] First — **done when:** ok`,
    '   - seam: `src/a.ts`',
    `2. [${done.includes(2) ? 'x' : ' '}] Second — **done when:** ok`,
    '   - seam: `src/b.ts`',
    `3. [${done.includes(3) ? 'x' : ' '}] Third — **done when:** ok`,
    '   - seam: `src/c.ts`',
    '',
    ...extra,
  ].join('\n')

const RANGES = [
  '## Build ranges',
  '',
  "1. `/plumbbob:build 1`, **stop:** at step 1's pause, approve the schema",
  '2. `/plumbbob:build 2-3`, **stop:** review the parser',
  '',
]

const QUESTIONS = [
  '## Open questions',
  '',
  '- <a id="q1"></a>**Q1 (cache)**: Cache the parse? *resolve by:* decide',
  '  - *plain:* It changes the seam.',
  '  - *lean:* No, parse each time.',
  '',
]

const PARKED = ['# Build log', '', '## Park list', '', '- [ ] a tangent (tangent)', '- [x] settled', ''].join('\n')

function at(intent: string, over: Partial<OrientInput> = {}): OrientInput {
  return { intent, buildLog: '', checkpoints: 'baseline abc\nplan def\n', inFlight: null, spiking: false, requested: null, outOfBand: 0, waiting: null, ...over }
}

function cards(input: OrientInput, over: Partial<Omit<MovesInput, 'orient'>> = {}): MovesInput {
  return { orient: input, paused: null, waiting: null, ...over }
}

describe('movesFor: the first move is the one the dashboard names', () => {
  const states: ReadonlyArray<readonly [string, MovesInput]> = [
    ['a spike open', cards(at(STEPS([]), { spiking: true }))],
    ['a step in flight', cards(at(STEPS([]), { inFlight: 1 }))],
    ['the boundary, no ranges', cards(at(STEPS([1])))],
    ['the boundary, a range to run', cards(at(STEPS([1], RANGES)))],
    ['the boundary, a bare range', cards(at(STEPS([], RANGES)))],
    ['an unplanned next step', cards(at(STEPS([]).replace('1. [ ] First — **done when:** ok', '1. [ ] First')))],
    ['no steps yet', cards(at('# Moves\n\n## Steps\n\n'))],
    ['every step landed', cards(at(STEPS([1, 2, 3])))],
    ['every step landed, an idea parked', cards(at(STEPS([1, 2, 3]), { buildLog: PARKED }))],
    ['a stop card waiting, a range to run next', cards(at(STEPS([1], RANGES), { waiting: 1 }), { waiting: { range: 1, count: 2 } })],
    ['a stop card waiting on the last range', cards(at(STEPS([1, 2, 3], RANGES), { waiting: 2 }), { waiting: { range: 2, count: 2 } })],
  ]

  it.each(states)('%s', (_name, input) => {
    const [first, ...rest] = movesFor(input)
    expect(first?.primary).toBe(true)
    expect(rest.every((m) => !m.primary)).toBe(true)
    // The dashboard writes a spike's close as the CLI's own command; every
    // other pointer names the skill.
    const next = orient(input.orient).next.replace('`plumbbob spike done`', '`/plumbbob:spike done`')
    expect(next).toContain(first?.command)
  })

  it('names each move once', () => {
    for (const [, input] of states) {
      const ids = movesFor(input).map((m) => m.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('movesFor: what only a typed prompt can do is marked typed', () => {
  it('leads a pause with the approval, typed, and offers the run where the card does', () => {
    const moves = movesFor(cards(at(STEPS([1], RANGES), { inFlight: 2 }), { paused: 2 }))
    expect(moves.map((m) => [m.id, m.typed])).toEqual([
      ['approve', true],
      ['run', true],
      ['show-pause', true],
      ['verify', false],
      ['abandon', true],
      ['revert', true],
      ['park', false],
    ])
    expect(moves[0]).toMatchObject({ label: 'Land step 2', command: 'looks good', primary: true })
  })

  it("keeps the run off a bare range's pause", () => {
    const moves = movesFor(cards(at(STEPS([], RANGES), { inFlight: 1 }), { paused: 1 }))
    expect(moves.map((m) => m.id)).not.toContain('run')
  })

  it('reads a pause stamp for another step as a step still being built', () => {
    const input = cards(at(STEPS([1]), { inFlight: 2 }), { paused: 1 })
    expect(buildState(input)).toBe('in-flight')
    expect(movesFor(input)[0]).toMatchObject({ id: 'verify', typed: false })
  })

  it('types the run and offers the one step beside it as a pick', () => {
    const moves = movesFor(cards(at(STEPS([1], RANGES))))
    expect(moves[0]).toMatchObject({ id: 'run', label: 'Run range 2 of 2', command: '/plumbbob:run', typed: true })
    expect(moves[0]?.description).toBe('Type `/plumbbob:run`: it builds steps 2-3, then stops for your review.')
    expect(moves[1]).toMatchObject({ id: 'build', label: 'Build step 2 only', command: '/plumbbob:build 2', typed: false })
  })

  it('types every move at a stop card, and the finish everywhere', () => {
    const stop = movesFor(cards(at(STEPS([1], RANGES), { waiting: 1 }), { waiting: { range: 1, count: 2 } }))
    expect(stop.filter((m) => m.id !== 'park').every((m) => m.typed)).toBe(true)
    expect(stop.map((m) => m.id)).toEqual(['run', 'approve', 'show-stop', 'park'])
    const done = movesFor(cards(at(STEPS([1, 2, 3]), { buildLog: PARKED })))
    expect(done.map((m) => [m.id, m.typed])).toEqual([
      ['harvest', false],
      ['finish', true],
      ['step', false],
      ['park', false],
    ])
  })

  it('offers the open questions and the plan approval while each stands', () => {
    const input = cards(at(STEPS([], QUESTIONS), { checkpoints: 'baseline abc\n' }))
    expect(buildState(input)).toBe('boundary')
    expect(movesFor(input).map((m) => m.id)).toEqual(['build', 'step', 'refine', 'questions', 'approve-plan', 'park'])
    const decided = movesFor(cards(at(STEPS([]))))
    expect(decided.map((m) => m.id)).toEqual(['build', 'step', 'refine', 'park'])
  })
})

describe('tasksFor: the steps of the range in play', () => {
  it('lists the range holding the next step, in build order, each with its place', () => {
    const input = at(STEPS([1], RANGES), { inFlight: 2 })
    expect(tasksFor(input, null)).toEqual([
      { step: 2, subject: 'Step 2 (1 of 2): Second', status: 'in_flight' },
      { step: 3, subject: 'Step 3 (2 of 2): Third', status: 'pending' },
    ])
  })

  it('reads the range a run names over the one holding the next step', () => {
    const input = at(STEPS([], RANGES))
    const run = resolveRun({ intent: input.intent, inFlight: null, spiking: false, item: 2 })
    expect(tasksFor(input, run).map((t) => t.step)).toEqual([2, 3])
    expect(tasksFor(input, null).map((t) => t.step)).toEqual([1])
  })

  it('lists the whole plan when it declares no ranges, landed steps as done', () => {
    expect(tasksFor(at(STEPS([1])), null)).toEqual([
      { step: 1, subject: 'Step 1 (1 of 3): First', status: 'done' },
      { step: 2, subject: 'Step 2 (2 of 3): Second', status: 'pending' },
      { step: 3, subject: 'Step 3 (3 of 3): Third', status: 'pending' },
    ])
  })

  it('keeps the landed range on the list while its stop card waits', () => {
    const tasks = tasksFor(at(STEPS([1, 2, 3], RANGES), { waiting: 2 }), null)
    expect(tasks.map((t) => [t.step, t.status])).toEqual([
      [2, 'done'],
      [3, 'done'],
    ])
  })
})
