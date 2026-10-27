// Contract 12 — feedback at the pause is acted on and answered, not re-carded
// (D110 (reply-after-the-card)). Turn 1 builds step 1 to its pause, which
// renders the whole card and stamps it. Turn 2 asks for a small change inside
// the step's own file, the way a human gives feedback on a card they have
// read. The discipline: the change lands in the source, the step stays in
// flight, and nothing is checkpointed, which is the contract's verdict.
// Whether turn 2 ends on the model's reply and the one-line reminder, with no
// card anywhere in it, is the turn-anatomy probe, and it stays `info`.
//
// Each scripted turn is a fresh `claude -p` session, like every contract's, so
// turn 2 runs with the card and the build skill's prose out of context: what
// it has is the turn hook's pause nudge and the CLI. That is the session the
// bug lived in, where the hook's park line filed feedback as a tangent and a
// stale stamp sent the reply back as the whole card. The reminder probes share
// their names with c10's, since both read a turn at a pause already shown.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, checkpointLines, dirtyPathsIn, snapshot, treeHash, unledgeredCommits, validity } from '../helpers/assert.ts'
import { anatomyChecks } from '../helpers/anatomy.ts'
import { makeEvalFixture } from '../helpers/fixture.ts'
import { TWO_STEPS, type Contract } from './contract.ts'

const C12_PROMPT_BUILD = '/plumbbob:build 1'
// Direction about the step on the card: a change inside its own seam, small
// enough to land in one turn, and named plainly enough that a park is a miss.
const C12_PROMPT_FEEDBACK =
  'Close. One change before I approve: also export a DEFAULT_NAME constant set to "world" from src/greet.js.'

export const c12: Contract = {
  id: 'c12',
  title: 'feedback at the pause',
  makeFixture: () => makeEvalFixture({ steps: TWO_STEPS, gate: 'green' }),
  async run(session, fixture) {
    const { repo, buildDir } = fixture
    const t0 = snapshot(repo)
    const turn1 = await session.turn(C12_PROMPT_BUILD)
    const t1 = snapshot(repo)
    const engaged = dirtyPathsIn(repo, ['src/greet.js']).length > 0 || t1.checkpoints.includes('step 1')
    // The feedback is about the card, so a turn 1 that never rendered it (no
    // stamp) or already landed the step leaves turn 2 nothing to answer.
    const paused = t1.step === '1' && existsSync(join(buildDir, 'PAUSE'))
    const sources1 = treeHash(repo, 'src')

    const turn2 = await session.turn(C12_PROMPT_FEEDBACK)
    const t2 = snapshot(repo)
    const kinds = checkpointLines(repo).map((l) => l.kind)
    return {
      turns: [turn1, turn2],
      checks: [
        validity('turn 1 engaged (step-1 seam has edits or landed)', engaged),
        validity('turn 1 reached the pause (step 1 in flight, its card stamped)', paused, `step ${t1.step ?? 'none'}`),
        check('the feedback turn changed the source', treeHash(repo, 'src') !== sources1),
        check('the change it asked for is in the step’s file', /\bDEFAULT_NAME\b/.test(readOr(join(repo, 'src', 'greet.js')))),
        check('nothing landed on the feedback turn', kinds.join(',') === 'baseline,plan', kinds.join(',')),
        check('step 1 still in flight after it', t2.step === '1', `step ${t2.step ?? 'none'}`),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        // Two tiers in one contract: the first render, and the reply at a pause already shown.
        ...anatomyChecks(turn1.content, 'decision'),
        ...anatomyChecks(turn2.content, 'reminder'),
      ],
    }
  },
}

// A file as UTF-8, or '' when it is missing.
function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}
