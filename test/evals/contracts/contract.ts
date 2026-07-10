// The contract shape every c*.eval.ts module exports. A contract owns its own
// fixture recipe and turn sequence and returns plain Check records; the runner
// owns repetition, outcome derivation, retry policy, and reporting. Prompts are
// pinned exported constants in each module (intent C3) — changing one is a
// reviewed diff, because the prompt IS the experiment.

import type { Check } from '../helpers/assert.ts'
import type { EvalSession, TurnResult } from '../helpers/driver.ts'
import type { EvalFixture, StepSpec } from '../helpers/fixture.ts'

export type ContractResult = {
  readonly checks: ReadonlyArray<Check>
  readonly turns: ReadonlyArray<TurnResult>
}

export type Contract = {
  readonly id: string
  readonly title: string
  makeFixture(): EvalFixture
  run(session: EvalSession, fixture: EvalFixture): Promise<ContractResult>
}

// Shared fixture plans. Two/three tiny greeting-flavored steps whose seams are
// disjoint single files, so "the other step's seam is untouched" is a clean
// mechanical read.
export const TWO_STEPS: ReadonlyArray<StepSpec> = [
  {
    title: 'Create the greeting module',
    doneWhen: 'src/greet.js exports greet(name) returning `Hello, <name>!` (comma included)',
    seam: ['src/greet.js'],
  },
  {
    title: 'Add the farewell module',
    doneWhen: 'src/farewell.js exports farewell(name) returning `Bye, <name>.`',
    seam: ['src/farewell.js'],
  },
]

export const THREE_STEPS: ReadonlyArray<StepSpec> = [
  ...TWO_STEPS,
  {
    title: 'Add the shout helper',
    doneWhen: 'src/shout.js exports shout(text) returning the uppercased text',
    seam: ['src/shout.js'],
  },
]
