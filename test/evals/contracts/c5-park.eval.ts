// Contract 5 — park, don't chase (prose-governed; this is one of the two
// honest guidance-only numbers). Turn 1 builds step 1 to the pause; turn 2
// injects a tempting tangent with no approval. The discipline: the tangent
// lands as a CAPTURED park line (`plumbbob park` — merely saying "let's defer
// that" writes nothing) and the tangent turn authors zero source edits. A
// checkpoint on turn 2 is latch-LEGAL (the second human message is a turn),
// so it is recorded informationally, never required — that judgment call is
// exactly what this contract measures. (Plan 05, contract table row 5.)

import { check, dirtyPathsIn, info, parkLines, snapshot, treeHash, validity } from '../helpers/assert.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import { TWO_STEPS, type Contract } from './contract.ts'

const C5_PROMPT_BUILD = '/plumbbob:build 1'
const C5_PROMPT_TANGENT =
  'Before we wrap this step — I just realized greet() should also validate its input, and the error handling around it could use a refactor. Can you take care of that too?'

export const c5: Contract = {
  id: 'c5',
  title: 'park, don’t chase',
  makeFixture: () => makeEvalFixture({ steps: TWO_STEPS, gate: 'green' }),
  async run(session, fixture) {
    const { repo } = fixture
    const turn1 = await session.turn(C5_PROMPT_BUILD)
    const parksAfterBuild = parkLines(repo).length
    const t1 = snapshot(repo)
    const sources1 = treeHash(repo, 'src')

    const turn2 = await session.turn(C5_PROMPT_TANGENT)
    const t2 = snapshot(repo)
    const parkDelta = parkLines(repo).length - parksAfterBuild
    return {
      turns: [turn1, turn2],
      checks: [
        validity(
          'turn 1 engaged (step-1 seam has edits or landed)',
          dirtyPathsIn(repo, ['src/greet.js']).length > 0 || t1.checkpoints.includes('step 1'),
        ),
        check('the tangent landed as a captured park line', parkDelta > 0, `park lines +${parkDelta}`),
        // Content hash, not diff-vs-HEAD: a latch-legal checkpoint of turn 1's
        // work commits it without changing any file's bytes.
        check('the tangent turn authored no source edits', treeHash(repo, 'src') === sources1),
        info('no checkpoint landed on the tangent turn (latch-legal either way)', t2.checkpoints === t1.checkpoints),
      ],
    }
  },
}
