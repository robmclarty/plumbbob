// Contract 14: `/plumbbob:next` on a host with no question tool falls back to
// the dashboard and makes no move (D128 (one-door)). Each scripted turn is a
// headless `claude -p` session whose allowed tools leave `AskUserQuestion`
// out, so nobody can pick a choice. The skill has to relay `plumbbob status`
// and stop: no step entered, nothing built, nothing landed, and no second
// attempt at a question that burns the turn cap.
//
// What a host with the tool does (the question first, the pick made, a typed
// move left typed) needs a person to answer it, so it is checked by hand in a
// terminal and in Zed, and is not this contract's to measure.

import { check, checkpointLines, dirtyPathsIn, info, snapshot, unledgeredCommits, validity } from '../helpers/assert.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import { TWO_STEPS, type Contract } from './contract.ts'

const C14_PROMPT = '/plumbbob:next'

export const c14: Contract = {
  id: 'c14',
  title: 'next falls back to the dashboard with no question tool',
  makeFixture: () => makeEvalFixture({ steps: TWO_STEPS, gate: 'green' }),
  async run(session, fixture) {
    const { repo } = fixture
    const t0 = snapshot(repo)
    const turn = await session.turn(C14_PROMPT)
    const t1 = snapshot(repo)
    const kinds = checkpointLines(repo).map((l) => l.kind)
    return {
      turns: [turn],
      checks: [
        validity('the turn said something', turn.content.trim().length > 0),
        check('no step entered', t1.step === null, `step ${t1.step ?? 'none'}`),
        check('nothing built', dirtyPathsIn(repo, ['src/greet.js', 'src/farewell.js']).length === 0),
        check('checkpoints still plan-only', kinds.join(',') === 'baseline,plan', kinds.join(',')),
        check('box 1 still unchecked', !t1.intent.includes('1. [x]')),
        check('commit count unchanged', t1.commitCount === t0.commitCount),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        // The dashboard's pointer, relayed: the same move the choices would have led with.
        info('relayed the dashboard', turn.content.includes('next →') && turn.content.includes('/plumbbob:build')),
      ],
    }
  },
}
