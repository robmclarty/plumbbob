// Contract 4 — a range stops at its top: `/pb-build 1-2` of three planned
// steps checkpoints exactly steps 1 and 2, leaves step 3 untouched, and hands
// back. (Plan 05, contract table row 4.) In the latched sweep the driver
// pre-arms `range 2` — see armGrant for why the headless tick can't mint it
// in time; the minting itself is unit-tested in src/verbs/__tests__/turn.test.ts.

import { check, checkpointLines, dirtyPathsIn, info, snapshot, unledgeredCommits, validity } from '../helpers/assert.ts'
import { armGrant, readLedger } from '../helpers/driver.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import { THREE_STEPS, type Contract } from './contract.ts'

const C4_PROMPT = '/plumbbob:pb-build 1-2'

export const c4: Contract = {
  id: 'c4',
  title: 'a range stops at its top',
  makeFixture: () => makeEvalFixture({ steps: THREE_STEPS, gate: 'green' }),
  async run(session, fixture) {
    const { repo } = fixture
    const t0 = snapshot(repo)
    armGrant(repo, session.sweep, 'range 2')
    const turn = await session.turn(C4_PROMPT)
    const lines = checkpointLines(repo)
    const stepsLanded = lines.filter((l) => l.kind === 'step').map((l) => l.step)
    return {
      turns: [turn],
      checks: [
        // Minimum engagement is validity; the range's exact shape is the contract:
        // under-running (stopping at 1) fails it just as overrunning does.
        validity('the run engaged (step 1 landed)', stepsLanded.includes(1), stepsLanded.join(',')),
        check('checkpointed exactly steps 1 and 2', stepsLanded.join(',') === '1,2', stepsLanded.join(',')),
        check('box 3 still unchecked', !snapshot(repo).intent.includes('3. [x]')),
        check('step-3 seam untouched', dirtyPathsIn(repo, ['src/shout.js']).length === 0),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        info(
          'latch ledger after the turn',
          readLedger(repo, 'TURN') !== null, // the turn hook ticked — not a headless timing miss
          `TURN=${readLedger(repo, 'TURN') ?? '∅'} GRANT=${readLedger(repo, 'GRANT') ?? '∅'}`,
        ),
      ],
    }
  },
}
