// Contract 6 — `/pb-verify` reviews, never builds (the second honest
// prose-governed number). The fixture seeds a hand-made, uncommitted diff with
// a subtle flaw: greet() omits the comma the done-when demands, and the gate
// is green (it never tests the comma), so only the verify turn's reading can
// catch it. The verify turn must author zero source edits (no "fixing it for
// you" — the flaw's bytes stay wrong), land nothing (the hand-built path has
// no TICK and stays guidance territory even latched — stated honestly in the
// report), and surface the flaw, which only a string probe can see (info, C1).
// (Plan 05, contract table row 6.)

import { check, checkpointLines, info, snapshot, treeHash, unledgeredCommits, validity } from '../helpers/assert.ts'
import { makeEvalFixture, seedFlawedGreeting } from '../helpers/fixture.ts'
import { TWO_STEPS, type Contract } from './contract.ts'

const C6_PROMPT = '/plumbbob:pb-verify'

export const c6: Contract = {
  id: 'c6',
  title: 'verify reviews, never builds',
  makeFixture: () => makeEvalFixture({ steps: TWO_STEPS.slice(0, 1), gate: 'green', seedDiff: seedFlawedGreeting }),
  async run(session, fixture) {
    const { repo } = fixture
    const t0 = snapshot(repo)
    const sources0 = treeHash(repo, 'src')

    const turn = await session.turn(C6_PROMPT)
    const t1 = snapshot(repo)
    const kinds = checkpointLines(repo).map((l) => l.kind)
    return {
      turns: [turn],
      checks: [
        // The verify turn's product is prose; a review that says nothing at all
        // did not run — the transcript existing with substance is validity.
        validity('the verify turn produced a review', turn.content.trim().length > 0),
        check('authored zero source edits (the flaw is still there, byte-exact)', treeHash(repo, 'src') === sources0),
        check('no checkpoint landed', kinds.join(',') === 'baseline,plan', kinds.join(',')),
        check('box 1 still unchecked', !t1.intent.includes('1. [x]')),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        info('the seeded flaw was surfaced (comma discrepancy named)', /comma|Hello,/.test(turn.content)),
      ],
    }
  },
}
