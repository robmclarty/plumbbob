import { describe, expect, it } from 'vitest'
import { derivePlan, type Plan, type StepFacts } from '../plan.ts'
import { checkPlan, parseMapPaths } from '../plancheck.ts'

/** A tree holding the given files, and every folder above them. */
function treeOf(files: ReadonlyArray<string>): { exists: (p: string) => boolean } {
  const dirs = new Set<string>()
  for (const f of files) {
    const parts = f.split('/')
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'))
  }
  return { exists: (p) => files.includes(p) || dirs.has(p) }
}

const TREE = treeOf(['src/lib/intent.ts', 'src/lib/plan.ts', 'src/verbs/build.ts', 'docs/a.md'])

/** A plan derived from step openers and sub-lines, with optional ranges and build order. */
function derived(steps: string, extra: { readonly ranges?: string; readonly order?: string } = {}): {
  readonly plan: Plan
  readonly facts: ReadonlyArray<StepFacts>
} {
  const text = ['# A build', '', '## Steps', '', steps, '', '## Build order', '', extra.order ?? '', '', '## Build ranges', '', extra.ranges ?? '', ''].join('\n')
  const r = derivePlan({ intent: text, slug: 's', path: 'p', sha256: '0'.repeat(64) })
  if (!r.ok) throw new Error(r.findings.join('\n'))
  return r
}

const step = (n: number, seam: string, extra: ReadonlyArray<string> = [], done = false): string =>
  [`${n}. [${done ? 'x' : ' '}] s${n}, **done when:** ok`, `   - seam: ${seam}`, ...extra].join('\n')

function check(d: { readonly plan: Plan; readonly facts: ReadonlyArray<StepFacts> }, mapPaths: ReadonlyArray<string> = []): string[] {
  return checkPlan({ ...d, tree: TREE, mapPaths })
}

describe('checkPlan', () => {
  it('passes a serial plan whose seams exist, in one range', () => {
    const d = derived([step(1, '`src/lib/intent.ts`'), step(2, '`src/lib/intent.ts`'), step(3, '`src/lib/new.ts`')].join('\n'), {
      ranges: '1. `/plumbbob:build 1-3`, **stop:** review',
    })
    expect(check(d)).toEqual([])
  })

  it('rule 1: refuses two steps carrying one number', () => {
    const d = derived([step(1, '`docs/a.md`'), step(1, '`docs/a.md`')].join('\n'))
    expect(check(d)).toContain("two steps carry the number 1, so both would export as `step-1`; renumber one.")
  })

  it('check 1: names an after that points past the plan, and leaves rule 2 to the derivation', () => {
    const d = derived([step(1, '`docs/a.md`'), step(2, '`docs/a.md`', ['   - after: 9'])].join('\n'))
    expect(check(d)).toEqual(["step 2's `after:` names step 9, which the plan lacks."])
  })

  it('rule 2: names a dependency no after line accounts for', () => {
    const d = derived(step(1, '`docs/a.md`'))
    const plan = { ...d.plan, steps: d.plan.steps.map((s) => ({ ...s, depends_on: ['step-7'] })) }
    expect(check({ plan, facts: d.facts })).toEqual(['step-1 depends on `step-7`, which is not a step of the plan.'])
  })

  it('rule 3: names a loop by its steps', () => {
    const d = derived([step(3, '`docs/a.md`', ['   - after: 5']), step(5, '`docs/a.md`', ['   - after: 3'])].join('\n'))
    expect(check(d)).toContain("steps wait on each other in a loop: step 3 → step 5 → step 3; one of their `after:` lines has to go.")
  })

  it('rule 3: a step waiting on itself is the shortest loop', () => {
    const d = derived(step(3, '`docs/a.md`', ['   - after: 3']))
    expect(check(d)).toEqual(["steps wait on each other in a loop: step 3 → step 3; one of their `after:` lines has to go."])
  })

  it('check 2: passes a path that exists, a new file in an existing folder, a grant, and a path under a Map part', () => {
    const d = derived(step(1, '`src/lib/plan.ts`, `src/lib/fresh.ts`, `src/plan/`, `src/verbs/deep/new.ts`'))
    expect(check(d, ['src/verbs/'])).toEqual([])
  })

  it('check 2: refuses a new file in a folder that does not exist, outside every part', () => {
    const d = derived(step(6, '`src/plan/export.ts`'))
    expect(check(d, ['src/verbs/'])).toEqual([
      "step 6's seam path `src/plan/export.ts` does not exist, nor does its folder `src/plan/`, and no part of keyframes.md's Map holds it.",
    ])
  })

  it('check 2: a Map part that does not exist holds nothing', () => {
    const d = derived(step(1, '`site/new/page.html`'))
    expect(check(d, ['site/'])).toHaveLength(1)
  })

  it('check 2: skips a landed step', () => {
    const d = derived(step(1, '`gone/away.ts`', [], true))
    expect(check(d)).toEqual([])
  })

  it('check 3: refuses two steps in one range at one seam when neither waits on the other', () => {
    const d = derived([step(3, '`src/lib/intent.ts`'), step(4, '`src/lib/intent.ts`', ['   - after: none'])].join('\n'), {
      ranges: '1. `/plumbbob:build 3-4`, **stop:** review',
    })
    expect(check(d)).toEqual([
      'steps 3 and 4, both in range 1, overlap at `src/lib/intent.ts`, and neither waits on the other; give one an `after:` line that reaches the other, or move one to another range.',
    ])
  })

  it('check 3: names both entries when a grant covers a file', () => {
    const d = derived([step(3, '`src/lib/`'), step(4, '`src/lib/intent.ts`', ['   - after: none'])].join('\n'), {
      ranges: '2. `/plumbbob:build 3-4`, **stop:** review',
    })
    expect(check(d)).toEqual([
      'steps 3 and 4, both in range 2, overlap at `src/lib/` and `src/lib/intent.ts`, and neither waits on the other; give one an `after:` line that reaches the other, or move one to another range.',
    ])
  })

  it('check 3: a grant overlaps its own bare form, and not a longer name', () => {
    const bare = derived([step(1, '`src/lib/`'), step(2, '`src/lib`', ['   - after: none'])].join('\n'), {
      ranges: '1. `/plumbbob:build 1-2`, **stop:** r',
    })
    expect(check(bare)).toHaveLength(1)
    const longer = derived([step(1, '`src/lib/`'), step(2, '`src/library/a.ts`', ['   - after: none'])].join('\n'), {
      ranges: '1. `/plumbbob:build 1-2`, **stop:** r',
    })
    expect(check(longer, ['src/'])).toEqual([])
  })

  it('check 3: passes when one reaches the other through a step between', () => {
    const d = derived(
      [step(1, '`src/lib/intent.ts`'), step(2, '`docs/a.md`', ['   - after: 1']), step(3, '`src/lib/intent.ts`', ['   - after: 2'])].join('\n'),
      { ranges: '1. `/plumbbob:build 1-3`, **stop:** review' },
    )
    expect(check(d)).toEqual([])
  })

  it('check 3: reads only steps inside one range', () => {
    const d = derived([step(1, '`docs/a.md`'), step(2, '`docs/a.md`', ['   - after: none']), step(3, '`docs/a.md`', ['   - after: none'])].join('\n'), {
      ranges: ['1. `/plumbbob:build 1`, **stop:** a', '2. `/plumbbob:build 2`, **stop:** b'].join('\n'),
    })
    expect(check(d)).toEqual([])
  })

  it('check 4: refuses an after that names a step building later, and skips a landed step', () => {
    const d = derived([step(3, '`docs/a.md`', ['   - after: 5']), step(5, '`docs/a.md`', ['   - after: none'])].join('\n'))
    expect(check(d)).toEqual([
      "step 3's `after:` names step 5, which builds after it; move step 5 earlier with `plumbbob order`, or drop it from the line.",
    ])
    const reordered = derived([step(3, '`docs/a.md`', ['   - after: 5']), step(5, '`docs/a.md`', ['   - after: none'])].join('\n'), { order: '5, 3' })
    expect(check(reordered)).toEqual([])
    const landed = derived([step(3, '`docs/a.md`', ['   - after: 5'], true), step(5, '`docs/a.md`', ['   - after: none'])].join('\n'))
    expect(check(landed)).toEqual([])
  })
})

describe('parseMapPaths', () => {
  it("reads every part's paths, wrapped lines joined, and nothing outside the Map", () => {
    const keyframes = [
      '# x',
      '',
      '## Map',
      '',
      '- **M1 (cli)**: The CLI.',
      '  - paths: bin/, src/cli.ts,',
      '    src/verbs/',
      '- **M2 (lib)**: Shared.',
      '  - paths: `src/lib/`',
      '',
      '## Constraints',
      '',
      '- **C1 (x)**: y',
      '  - paths: not/these/',
    ].join('\n')
    expect(parseMapPaths(keyframes)).toEqual(['bin/', 'src/cli.ts', 'src/verbs/', 'src/lib/'])
  })

  it('reads no paths when there is no Map', () => {
    expect(parseMapPaths('# x\n')).toEqual([])
  })
})
