// plumbbob writes `plan.json` in runciter's shape, `runciter.plan/2`, and
// runciter owns that shape. This pins conformance against the contract itself:
// the JSON Schema and the example vendored byte for byte from runciter (see
// runciter-plan/README.md), validated with ajv rather than a hand check that
// would re-state the schema and drift from it. The schema holds the shapes; the
// three whole-plan rules it cannot express (unique ids, known dependencies, no
// cycle) are checked here the way runciter's own validator states them.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { derivePlan, serializePlan } from '../../src/lib/plan.ts'

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./runciter-plan/${name}`, import.meta.url)), 'utf8')

const SCHEMA = JSON.parse(read('runciter.plan.schema.json'))
const EXAMPLE = JSON.parse(read('runciter.plan.example.json'))
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(SCHEMA)

type RuleStep = { readonly id: string; readonly depends_on?: ReadonlyArray<string> }

/** The contract's three plan rules, as runciter's `plan_schema` states them; an empty list means they hold. */
function planRules(steps: ReadonlyArray<RuleStep>): string[] {
  const issues: string[] = []
  const ids = new Set<string>()
  for (const step of steps) {
    if (ids.has(step.id)) issues.push(`step id "${step.id}" is used twice`)
    ids.add(step.id)
  }
  for (const step of steps) {
    for (const dep of step.depends_on ?? []) {
      if (dep === step.id || !ids.has(dep)) issues.push(`step "${step.id}" depends on "${dep}"`)
    }
  }
  const deps = new Map(steps.map((s) => [s.id, s.depends_on ?? []]))
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string): boolean => {
    if (state.get(id) === 'done') return false
    if (state.get(id) === 'visiting') return true
    state.set(id, 'visiting')
    const cyclic = (deps.get(id) ?? []).some(visit)
    state.set(id, 'done')
    return cyclic
  }
  if (steps.some((s) => visit(s.id))) issues.push('depends_on has a cycle')
  return issues
}

function plan(steps: string, ranges = ''): unknown {
  const text = [
    '# A build',
    '',
    '## Decisions',
    '',
    '- **D1 (one)**: a decision',
    '',
    '## Steps',
    '',
    steps,
    '',
    '## Build ranges',
    '',
    ranges,
    '',
  ].join('\n')
  const r = derivePlan({ intent: text, slug: '2026-11-11-a-build', path: '.plumbbob/builds/2026-11-11-a-build/intent.md', sha256: '0'.repeat(64) })
  if (!r.ok) throw new Error(r.findings.join('\n'))
  return JSON.parse(serializePlan(r.plan))
}

const step = (n: number, extra: string[] = [], done = false): string =>
  [`${n}. [${done ? 'x' : ' '}] feat(s${n}): step ${n}`, `   - seam: \`src/s${n}.ts\``, `   - proof: \`pnpm vitest run s${n}\` passes`, ...extra].join('\n')

/** A step written the older way, its acceptance a `**done when:**` clause on the title line. */
const oldStep = (n: number): string =>
  [`${n}. [ ] feat(s${n}): step ${n}, **done when:** step ${n} works`, `   - seam: \`src/s${n}.ts\``].join('\n')

const DERIVED: ReadonlyArray<readonly [string, unknown]> = [
  ['an unannotated plan', plan([step(1, [], true), step(2), step(3)].join('\n'))],
  [
    'a plan with after lines',
    plan([step(1), step(2, ['   - after: none']), step(3, ['   - after: 1, 2', '   - effort: high', '   - note: read the spec'])].join('\n')),
  ],
  [
    'a plan with ranges and a bare range',
    plan(
      [step(1), step(2), step(3, ['   - stop: structural']), step(4)].join('\n'),
      ['1. `/plumbbob:build 1-2`, **stop:** review', '2. `/plumbbob:build 3`, **stop:** a call', '3. `/plumbbob:build 4`, **stop:** finish'].join('\n'),
    ),
  ],
  ['a plan whose steps carry the older done-when clause', plan([oldStep(1), step(2), step(3)].join('\n'))],
  [
    'a plan whose step names what it is like',
    plan([step(1, ['   - like: `src/s0.ts`, `src/*.ts`, `src/__tests__/`']), step(2)].join('\n')),
  ],
]

describe('plan.json conforms to runciter.plan/2', () => {
  it.each(DERIVED)('%s validates against the vendored schema', (_label, derived) => {
    expect(validate(derived), JSON.stringify(validate.errors)).toBe(true)
  })

  it.each(DERIVED)('%s holds the three plan rules', (_label, derived) => {
    expect(planRules((derived as { steps: RuleStep[] }).steps)).toEqual([])
  })

  it('the vendored example round-trips through the schema and the rules', () => {
    const copy = JSON.parse(JSON.stringify(EXAMPLE))
    expect(validate(copy), JSON.stringify(validate.errors)).toBe(true)
    expect(planRules(copy.steps)).toEqual([])
    expect(copy).toEqual(EXAMPLE)
  })

  it('marks a ticked step landed and every other step not', () => {
    const derived = DERIVED[0]?.[1] as { steps: { landed: boolean }[] }
    expect(derived.steps.map((s) => s.landed)).toEqual([true, false, false])
  })

  it('writes a proof line as its command and text, and the older clause as text alone', () => {
    const derived = DERIVED[3]?.[1] as { steps: { proof: unknown }[] }
    expect(derived.steps.map((s) => s.proof)).toEqual([
      { command: null, text: 'step 1 works' },
      { command: 'pnpm vitest run s2', text: '`pnpm vitest run s2` passes' },
      { command: 'pnpm vitest run s3', text: '`pnpm vitest run s3` passes' },
    ])
  })

  it('writes a step\'s like after its seam, the paths that read and no others', () => {
    const derived = DERIVED[4]?.[1] as { steps: Record<string, unknown>[] }
    expect(derived.steps.map((s) => s.like)).toEqual([['src/s0.ts', 'src/__tests__/'], []])
    expect(Object.keys(derived.steps[0] ?? {}).slice(4, 7)).toEqual(['seam', 'like', 'stop'])
  })

  it('the vendored example carries a like, so the copy is the contract that has one', () => {
    expect(EXAMPLE.steps.map((s: { like?: unknown }) => s.like)).toContainEqual(['packages/server/src/throttle/bucket.ts'])
    expect(SCHEMA.properties.steps.items.properties.like).toEqual({ default: [], type: 'array', items: { type: 'string' } })
  })

  it('the rules catch what the schema cannot', () => {
    expect(planRules([{ id: 'a' }, { id: 'a' }])).toEqual(['step id "a" is used twice'])
    expect(planRules([{ id: 'a', depends_on: ['b'] }])).toEqual(['step "a" depends on "b"'])
    expect(planRules([{ id: 'a', depends_on: ['b'] }, { id: 'b', depends_on: ['a'] }])).toEqual(['depends_on has a cycle'])
  })
})
