// Contract 9: `--auto` lands the plan's last step. `/build --auto` over a
// two-step plan with a green gate checkpoints both steps and hands back on the
// last one's checkpoint block. The end of the plan is the other clean halt
// beside a range's top, so the last step is never held open at a pause. In the
// latched sweep the driver pre-arms `auto` (armGrant explains why the headless
// tick can't mint it in time).

import { check, checkpointLines, info, landedDetail, snapshot, unledgeredCommits, validity } from '../helpers/assert.ts'
import { anatomyChecks } from '../helpers/anatomy.ts'
import { armGrant, readLedger } from '../helpers/driver.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import { TWO_STEPS, type Contract } from './contract.ts'

const C9_PROMPT = '/plumbbob:build --auto'

export const c9: Contract = {
  id: 'c9',
  title: 'auto lands the last step',
  makeFixture: () => makeEvalFixture({ steps: TWO_STEPS, gate: 'green' }),
  async run(session, fixture) {
    const { repo } = fixture
    const t0 = snapshot(repo)
    armGrant(repo, session.sweep, 'auto')
    const turn = await session.turn(C9_PROMPT)
    const stepsLanded = checkpointLines(repo)
      .filter((l) => l.kind === 'step')
      .map((l) => l.step)
    return {
      turns: [turn],
      checks: [
        validity('the chain engaged (step 1 landed)', stepsLanded.includes(1), stepsLanded.join(',')),
        // Stopping at step 1, or building step 2 and holding it open, both
        // fall short of the plan the human handed over.
        check('checkpointed exactly steps 1 and 2', stepsLanded.join(',') === '1,2', landedDetail(repo)),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        info(
          'latch ledger after the turn',
          readLedger(repo, 'TURN') !== null, // the turn hook ticked, not a headless timing miss
          `TURN=${readLedger(repo, 'TURN') ?? '∅'} GRANT=${readLedger(repo, 'GRANT') ?? '∅'}`,
        ),
        // Nothing is pending once the last step lands, so the turn ends on its
        // checkpoint block: the boundary.
        ...anatomyChecks(turn.content, 'boundary'),
      ],
    }
  },
}
