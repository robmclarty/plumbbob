import { describe, expect, it } from 'vitest'
import { scenarioContracts } from '../../scripts/scenario-evals.ts'

const CONTRACTS: Readonly<Record<string, string>> = {
  'test/evals/contracts/c1-pause.eval.ts': "export const C1 = { id: 'c1', title: 'default build pauses' }",
  'test/evals/contracts/c4-range.eval.ts': "export const C4 = {\n  id: 'c4',\n}",
  'test/evals/contracts/c9-blank.eval.ts': 'export const nothing = 1',
}

const read = (path: string): string | null => CONTRACTS[path] ?? null

const KEYFRAMES = `# demo

## Constraints

- **C1 (x)**: held by an eval nobody runs here.
  - held-by: file:test/evals/contracts/c9-blank.eval.ts#"x"

## Scenarios

- **S1 (one)**: pauses.
  - held-by: file:test/evals/contracts/c1-pause.eval.ts#"default build pauses",
    file:test/e2e/e2e.test.ts#"a full session"
- **S2 (two)**: stops at the top, and pauses again.
  - held-by: \`file:test/evals/contracts/c4-range.eval.ts#"a range stops at its top"\`,
    file:test/evals/contracts/c1-pause.eval.ts#"default build pauses"
- **S3 (gone)**: points at a file that is missing.
  - held-by: file:test/evals/contracts/c7-gone.eval.ts#"x"

## Decisions

- **D1 (y)**: also names file:test/evals/contracts/c9-blank.eval.ts
`

describe('scenarioContracts', () => {
  it('collects the eval contracts the Scenarios section points at, in first-named order, each once', () => {
    expect(scenarioContracts(KEYFRAMES, read)).toEqual(['c1', 'c4'])
  })

  it('reads nothing outside the Scenarios section, and nothing from a plan without one', () => {
    expect(scenarioContracts(KEYFRAMES.replace('## Scenarios', '## Notes'), read)).toEqual([])
  })
})
