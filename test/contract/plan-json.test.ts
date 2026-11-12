// plumbbob writes `plan.json` in runciter's shape, `runciter.plan/1`, and
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
  [`${n}. [${done ? 'x' : ' '}] feat(s${n}): step ${n}, **done when:** step ${n} works`, `   - seam: \`src/s${n}.ts\``, ...extra].join('\n')

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
]

describe('plan.json conforms to runciter.plan/1', () => {
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

  it('the rules catch what the schema cannot', () => {
    expect(planRules([{ id: 'a' }, { id: 'a' }])).toEqual(['step id "a" is used twice'])
    expect(planRules([{ id: 'a', depends_on: ['b'] }])).toEqual(['step "a" depends on "b"'])
    expect(planRules([{ id: 'a', depends_on: ['b'] }, { id: 'b', depends_on: ['a'] }])).toEqual(['depends_on has a cycle'])
  })
})
