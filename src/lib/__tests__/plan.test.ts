import { describe, expect, it } from 'vitest'
import { derivePlan, serializePlan, stepId, type Plan } from '../plan.ts'

const SHA = 'a'.repeat(64)

function intent(parts: { readonly steps: string; readonly order?: string; readonly ranges?: string }): string {
  return [
    '# Rate-limit the API',
    '',
    '## Decisions',
    '',
    '- <a id="d1"></a>**D1 (token-bucket)**: a token bucket, *because* bursts are expected',
    '',
    '## Constraints',
    '',
    '- <a id="c1"></a>**C1 (no-new-deps)**: no new runtime dependencies',
    '',
    '## Steps',
    '',
    parts.steps,
    '',
    '## Build order',
    '',
    parts.order ?? '',
    '',
    '## Build ranges',
    '',
    parts.ranges ?? '',
    '',
    '## Open questions',
    '',
  ].join('\n')
}

const THREE = [
  '1. [x] feat(types): add the type, **done when:** the type is exported',
  '   - seam: `src/types.ts`',
  '2. [ ] feat(server): limit login, **done when:** the sixth login gets 429',
  '   - seam: `src/server/`',
  '3. [ ] feat(client): back off, **done when:** a 429 is retried',
  '   - seam: `src/client.ts`',
].join('\n')

function derive(text: string): Plan {
  const r = derivePlan({ intent: text, slug: 'rate-limit', path: '.plumbbob/builds/rate-limit/intent.md', sha256: SHA })
  if (!r.ok) throw new Error(r.findings.join('\n'))
  return r.plan
}

describe('derivePlan', () => {
  it('fills the build, source, and plan-wide fields from the intent', () => {
    const plan = derive(intent({ steps: THREE }))
    expect(plan.protocol).toBe('runciter.plan/1')
    expect(plan.build).toEqual({ id: 'rate-limit', title: 'Rate-limit the API' })
    expect(plan.source).toEqual({ path: '.plumbbob/builds/rate-limit/intent.md', sha256: SHA })
    expect(plan.contract_paths).toEqual([])
    expect(plan.decisions).toEqual(['<a id="d1"></a>**D1 (token-bucket)**: a token bucket, *because* bursts are expected'])
    expect(plan.constraints).toEqual(['<a id="c1"></a>**C1 (no-new-deps)**: no new runtime dependencies'])
  })

  it('exports an unannotated plan fully serial, with no stop and no effort', () => {
    const plan = derive(intent({ steps: THREE }))
    expect(plan.steps.map((s) => [s.id, s.depends_on, s.stop, s.effort, s.range])).toEqual([
      ['step-1', [], 'none', null, null],
      ['step-2', ['step-1'], 'none', null, null],
      ['step-3', ['step-2'], 'none', null, null],
    ])
  })

  it('carries every step, landed or not, with its title, seam, and done-when', () => {
    const plan = derive(intent({ steps: THREE }))
    expect(plan.steps[0]).toEqual({
      id: 'step-1',
      title: 'feat(types): add the type',
      range: null,
      depends_on: [],
      seam: ['src/types.ts'],
      stop: 'none',
      effort: null,
      done_when: 'the type is exported',
      context: [],
    })
  })

  it('follows the build order for the serial default, and lists steps in plan-number order', () => {
    const plan = derive(intent({ steps: THREE, order: '3, 2' }))
    expect(plan.steps.map((s) => s.id)).toEqual(['step-1', 'step-2', 'step-3'])
    expect(plan.steps.map((s) => s.depends_on)).toEqual([[], ['step-3'], ['step-1']])
  })

  it('takes an after line exactly, `none` included, and expands its spans', () => {
    const steps = [
      '1. [ ] a, **done when:** ok',
      '   - seam: `a.ts`',
      '2. [ ] b, **done when:** ok',
      '   - seam: `b.ts`',
      '   - after: none',
      '3. [ ] c, **done when:** ok',
      '   - seam: `c.ts`',
      '4. [ ] d, **done when:** ok',
      '   - seam: `d.ts`',
      '   - after: 1-3',
    ].join('\n')
    const plan = derive(intent({ steps }))
    expect(plan.steps.map((s) => s.depends_on)).toEqual([[], [], ['step-1', 'step-2'], ['step-1', 'step-2', 'step-3']])
  })

  it('makes a step with no after line wait on every branch an earlier after line opened', () => {
    const steps = [
      '1. [ ] a, **done when:** ok',
      '   - seam: `a.ts`',
      '2. [ ] b, **done when:** ok',
      '   - seam: `b.ts`',
      '3. [ ] c, **done when:** ok',
      '   - seam: `c.ts`',
      '   - after: 1',
      '4. [ ] d, **done when:** ok',
      '   - seam: `d.ts`',
      '5. [ ] e, **done when:** ok',
      '   - seam: `e.ts`',
    ].join('\n')
    const plan = derive(intent({ steps }))
    expect(plan.steps.map((s) => s.depends_on)).toEqual([[], ['step-1'], ['step-1'], ['step-2', 'step-3'], ['step-4']])
  })

  it('keeps an after number the plan lacks, for the plan checks to name', () => {
    const steps = ['1. [ ] a, **done when:** ok', '   - seam: `a.ts`', '   - after: 9'].join('\n')
    const r = derivePlan({ intent: intent({ steps }), slug: 's', path: 'p', sha256: SHA })
    expect(r.ok && r.plan.steps[0]?.depends_on).toEqual(['step-9'])
    expect(r.ok && r.facts[0]).toEqual({ n: 1, done: false, position: 0, after: [9] })
  })

  it('stops `planned` on the last step of each range in build order, a bare range included', () => {
    const steps = [1, 2, 3, 4].map((n) => `${n}. [ ] s${n}, **done when:** ok\n   - seam: \`s${n}.ts\``).join('\n')
    const ranges = ['1. `/plumbbob:build 1-3`, **stop:** review', '2. `/plumbbob:build 4`, **stop:** a call'].join('\n')
    const plan = derive(intent({ steps, ranges, order: '1, 3, 2, 4' }))
    expect(plan.steps.map((s) => [s.id, s.range, s.stop])).toEqual([
      ['step-1', '1', 'none'],
      ['step-2', '1', 'planned'],
      ['step-3', '1', 'none'],
      ['step-4', '2', 'planned'],
    ])
  })

  it('lets a stop line override any step, and reads effort and notes', () => {
    const steps = [
      '1. [ ] a, **done when:** ok',
      '   - seam: `a.ts`',
      '   - stop: structural',
      '   - effort: high',
      '   - note: first',
      '   - note: second',
      '2. [ ] b, **done when:** ok',
      '   - seam: `b.ts`',
      '   - stop: planned',
    ].join('\n')
    const plan = derive(intent({ steps, ranges: '1. `/plumbbob:build 1-2`, **stop:** review' }))
    expect(plan.steps.map((s) => [s.stop, s.effort, s.context])).toEqual([
      ['structural', 'high', ['first', 'second']],
      ['planned', null, []],
    ])
  })

  it('refuses the plan with every finding by step, never a guess', () => {
    const steps = [
      '1. [ ] a, **done when:** ok',
      '   - seam: `src/*.ts`',
      '2. [ ] b, **done when:**',
      '   - seam: `b.ts`',
      '   - effort: hard',
    ].join('\n')
    const r = derivePlan({ intent: intent({ steps }), slug: 's', path: 'p', sha256: SHA })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.findings).toEqual([
      "step 1's seam token `src/*.ts` is a glob; seams are exact paths or `dir/` grants, per D23 (no-glob-seams).",
      "step 2's `effort:` line reads `hard`; it takes `low`, `medium`, `high`, `xhigh` or `max`.",
      'step 2 has no **done when:** text; the contract needs one.',
    ])
  })

  it('refuses a plan with no steps or no title', () => {
    const r = derivePlan({ intent: '## Steps\n', slug: 's', path: 'p', sha256: SHA })
    expect(!r.ok && r.findings).toEqual([
      'intent.md has no steps under "## Steps"; the contract needs one.',
      'intent.md has no `# ` title; the contract needs one.',
    ])
  })
})

describe('serializePlan', () => {
  it('writes two-space JSON in the contract key order, every default out, with a trailing newline', () => {
    const text = serializePlan(derive(intent({ steps: THREE })))
    expect(text.endsWith('}\n')).toBe(true)
    expect(Object.keys(JSON.parse(text))).toEqual(['protocol', 'build', 'source', 'contract_paths', 'decisions', 'constraints', 'steps'])
    expect(Object.keys(JSON.parse(text).steps[0])).toEqual([
      'id',
      'title',
      'range',
      'depends_on',
      'seam',
      'stop',
      'effort',
      'done_when',
      'context',
    ])
    expect(text).toContain('\n  "protocol": "runciter.plan/1",\n')
    expect(text).toContain('"effort": null')
  })

  it('serializes a plan read back from disk byte for byte, whatever its key order', () => {
    const text = serializePlan(derive(intent({ steps: THREE })))
    const shuffled = JSON.parse(text, (_key, value) =>
      value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value,
    )
    expect(serializePlan(shuffled)).toBe(text)
  })
})

describe('stepId', () => {
  it('names a step by its plan number', () => {
    expect(stepId(12)).toBe('step-12')
  })
})
