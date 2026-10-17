// Contract 10 — a question at the pause is answered, not re-carded. Turn 1
// builds step 1 to its pause, which renders the whole card and stamps it. Turn
// 2 asks a plain question, one that reads as neither approval nor direction;
// turn 3 asks to see the pause again, in the words the card's `expand` move
// teaches. The discipline: neither later turn changes anything (no source edit,
// no checkpoint, the step still in flight), which is the contract's verdict.
// Whether turn 2 ends on the answer and the one-line reminder with no card, and
// whether turn 3 brings the whole card back, are the turn-anatomy probes, and
// they stay `info`.
//
// Each scripted turn is a fresh `claude -p` session, like every contract's, so
// turns 2 and 3 run with the card and the build skill's prose out of context:
// what they have is the turn hook's in-flight nudge and the CLI. Their probes
// carry names of their own, so the shared decision and "nothing after the
// relay" rates still read first renders alone and stay comparable with every
// receipt before this contract existed; turn 1 joins them as an ordinary pause.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { check, checkpointLines, dirtyPathsIn, info, snapshot, treeHash, unledgeredCommits, validity } from '../helpers/assert.ts'
import { anatomyChecks, endingRenders, readAnatomy, shapeDetail } from '../helpers/anatomy.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import { TWO_STEPS, type Contract } from './contract.ts'

const C10_PROMPT_BUILD = '/plumbbob:build 1'
// Informational on purpose: a question that could be read as a hint to change
// greet() would measure the needs-work path instead of the expand one.
const C10_PROMPT_QUESTION = 'Quick question before I decide: which file did this step add, and what does it export?'
// The phrase the card's `expand` move names as the way back to the card.
const C10_PROMPT_SHOW = 'show the pause'

export const c10: Contract = {
  id: 'c10',
  title: 'a question at the pause',
  makeFixture: () => makeEvalFixture({ steps: TWO_STEPS, gate: 'green' }),
  async run(session, fixture) {
    const { repo, buildDir } = fixture
    const t0 = snapshot(repo)
    const turn1 = await session.turn(C10_PROMPT_BUILD)
    const t1 = snapshot(repo)
    const engaged = dirtyPathsIn(repo, ['src/greet.js']).length > 0 || t1.checkpoints.includes('step 1')
    // The pause is what turns 2 and 3 are about: a turn 1 that never rendered
    // the card (no stamp) or already landed the step leaves them nothing to read.
    const paused = t1.step === '1' && existsSync(join(buildDir, 'PAUSE'))
    const sources1 = treeHash(repo, 'src')

    const turn2 = await session.turn(C10_PROMPT_QUESTION)
    const t2 = snapshot(repo)
    const sources2 = treeHash(repo, 'src')
    const turn3 = await session.turn(C10_PROMPT_SHOW)
    const t3 = snapshot(repo)

    const shown = readAnatomy(turn3.content)
    const kinds = checkpointLines(repo).map((l) => l.kind)
    return {
      turns: [turn1, turn2, turn3],
      checks: [
        validity('turn 1 engaged (step-1 seam has edits or landed)', engaged),
        validity('turn 1 reached the pause (step 1 in flight, its card stamped)', paused, `step ${t1.step ?? 'none'}`),
        check('the question turn authored no source edits', sources2 === sources1),
        check('the show turn authored no source edits', treeHash(repo, 'src') === sources2),
        check('nothing landed on the later turns', kinds.join(',') === 'baseline,plan', kinds.join(',')),
        check('step 1 still in flight after both', t2.step === '1' && t3.step === '1', `step ${t3.step ?? 'none'}`),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        // Three tiers in one contract: the first render, a pause already shown,
        // and the card brought back on request.
        ...anatomyChecks(turn1.content, 'decision'),
        ...anatomyChecks(turn2.content, 'reminder'),
        info('anatomy: the pause comes back whole on request', endingRenders(shown, 'decision'), shapeDetail(shown, 'decision')),
      ],
    }
  },
}
