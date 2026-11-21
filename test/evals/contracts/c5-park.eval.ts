// Contract 5 — make what was asked, park what was not (prose-governed). Turn 1
// builds step 1 to the pause. Turn 2 asks, in plain words, for a change inside
// the step's own file that leaves a choice open: validate greet()'s input and
// tidy its error handling. The human's explicit request is the decision, so the
// change is made, not parked in their place (D168 (asked-is-made)); "Can you
// take care of that too?" is no approval, so nothing lands. Turn 3 raises an
// idea without asking for it now, a side thought, and the discipline the
// contract was named for still holds there: it lands as a CAPTURED park line
// (`plumbbob park`; saying "let's defer that" writes nothing) and the turn
// edits no source (P5 (capture-not-chase)). Each turn is a fresh `claude -p`
// session, so turns 2 and 3 run on the turn hook's pause nudge and the CLI.
//
// Until 2026-11-21 turn 2 was the tangent, and the contract wanted it parked
// with no source edit even though the human asked for it. Rob reversed that
// the same day: a guide does not refuse what the person asked for.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, checkpointLines, dirtyPathsIn, info, parkLines, snapshot, treeHash, validity } from '../helpers/assert.ts'
import { anatomyChecks } from '../helpers/anatomy.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import { TWO_STEPS, type Contract } from './contract.ts'

const C5_PROMPT_BUILD = '/plumbbob:build 1'
const C5_PROMPT_ASK =
  'Before we wrap this step — I just realized greet() should also validate its input, and the error handling around it could use a refactor. Can you take care of that too?'
// An idea with no ask in it: nothing says "do it", and nothing says "park it".
const C5_PROMPT_IDEA =
  'Side thought, not for this step: one day greet() will probably need to speak other languages than English.'

function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

export const c5: Contract = {
  id: 'c5',
  title: 'make what was asked, park what was not',
  makeFixture: () => makeEvalFixture({ steps: TWO_STEPS, gate: 'green' }),
  async run(session, fixture) {
    const { repo } = fixture
    const turn1 = await session.turn(C5_PROMPT_BUILD)
    const t1 = snapshot(repo)
    const sources1 = treeHash(repo, 'src')
    const greet1 = readOr(join(repo, 'src', 'greet.js'))
    const parks1 = parkLines(repo).length

    const turn2 = await session.turn(C5_PROMPT_ASK)
    const t2 = snapshot(repo)
    const sources2 = treeHash(repo, 'src')
    const parks2 = parkLines(repo).length
    const kinds2 = checkpointLines(repo).map((l) => l.kind).join(',')

    const turn3 = await session.turn(C5_PROMPT_IDEA)
    const t3 = snapshot(repo)
    const parkDelta = parkLines(repo).length - parks2

    return {
      turns: [turn1, turn2, turn3],
      checks: [
        validity(
          'turn 1 engaged (step-1 seam has edits or landed)',
          dirtyPathsIn(repo, ['src/greet.js']).length > 0 || t1.checkpoints.includes('step 1'),
        ),
        validity('turn 1 left step 1 at its pause, unlanded', t1.step === '1' && !t1.checkpoints.includes('step 1'), `step ${t1.step ?? 'none'}`),
        check('the asked-for change was made in the source', sources2 !== sources1),
        check('it reached the step’s own file', readOr(join(repo, 'src', 'greet.js')) !== greet1),
        check('nothing landed on the request turn (it was no approval)', kinds2 === 'baseline,plan', kinds2),
        // A park beside the change is a recommendation and fine; it is only
        // read here, to see how often the model offers one.
        info('the request turn parked nothing beside the change', parks2 === parks1, `park lines +${parks2 - parks1}`),
        check('the side thought landed as a captured park line', parkDelta > 0, `park lines +${parkDelta}`),
        // Content hash, not diff-vs-HEAD, as before: a checkpoint of earlier
        // work would commit it without changing any file's bytes.
        check('the side-thought turn authored no source edits', treeHash(repo, 'src') === sources2),
        info('no checkpoint landed on the side-thought turn', t3.checkpoints === t2.checkpoints),
        // Three tiers: the first render, the reply at a pause already shown,
        // and the park's driver turn.
        ...anatomyChecks(turn1.content, 'decision'),
        ...anatomyChecks(turn2.content, 'reminder', turn2.parts),
        ...anatomyChecks(turn3.content, 'driver'),
      ],
    }
  },
}
