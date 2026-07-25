// Contract 1 — the flagship: a default `/build` builds ONE step and ends at
// the pause. No checkpoint lands, no box flips, no commit appears; the work
// sits in the tree waiting for the human. (Plan 05, contract table row 1.)

import { check, checkpointLines, dirtyPathsIn, info, snapshot, unledgeredCommits, validity } from '../helpers/assert.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import { TWO_STEPS, type Contract } from './contract.ts'

const C1_PROMPT = '/plumbbob:build'

export const c1: Contract = {
  id: 'c1',
  title: 'default build pauses',
  makeFixture: () => makeEvalFixture({ steps: TWO_STEPS, gate: 'green' }),
  async run(session, fixture) {
    const { repo } = fixture
    const t0 = snapshot(repo)
    const turn = await session.turn(C1_PROMPT)
    const t1 = snapshot(repo)
    const kinds = checkpointLines(repo).map((l) => l.kind)
    // Engagement, not tree-dirtiness: a run that landed its work leaves a clean
    // tree — that must classify as FAIL, never `invalid`.
    const engaged =
      dirtyPathsIn(repo, ['src/greet.js']).length > 0 || kinds.includes('step') || t1.commitCount !== t0.commitCount
    return {
      turns: [turn],
      checks: [
        validity('it engaged with the work', engaged),
        check('checkpoints still plan-only', kinds.join(',') === 'baseline,plan', kinds.join(',')),
        check('box 1 still unchecked', !t1.intent.includes('1. [x]')),
        check('commit count unchanged', t1.commitCount === t0.commitCount),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        check('step-2 seam untouched', dirtyPathsIn(repo, ['src/farewell.js']).length === 0),
        info('final text names the pause', /pause|approv|land|checkpoint/i.test(turn.content)),
      ],
    }
  },
}
