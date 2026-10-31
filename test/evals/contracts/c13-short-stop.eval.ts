// Contract 13: a stop card that follows a halt the human approved prints
// short (D119 (short-stop-after-a-halt)). Range 1 is steps 1 and 2, step 1
// already landed. Turn 1 builds step 2 to its pause, which renders the whole
// card and stamps it, the halt a run stops on. Turn 2 types `/plumbbob:run` at
// that pause, which the run skill takes as the pause's `looks good` (D95
// (run-verb)): it lands step 2, which completes range 1, and the run ends on
// range 1's stop card. The card has to print short, since the human read step
// 2's Summary, Readout, and recommendation one turn before, and nothing may be
// recorded, since the human has not replied to the card yet.
//
// Turn 2 is the run rather than a bare `looks good` because each scripted turn
// is a fresh `claude -p` session: a bare approval would land the step with no
// skill in context to write the range's review, and the contract would measure
// that rather than the card. The run skill carries the range's detail shape.
//
// The checkpoint's mark on the PAUSE stamp is the short card's mechanical
// trace: `landed 2 answered` says the landing answered a pause card that had
// shown. Whether the turn's text carried the short card, and no Summary or
// Readout, is the anatomy probes' measurement, and it stays `info`. In the
// latched sweep the driver pre-arms the grant and the RUN mark the hook writes
// for that prompt, for parity with earlier receipts, as c11 does.

import { join } from 'node:path'
import { check, checkpointLines, fileContent, info, parkLines, snapshot, unledgeredCommits, validity } from '../helpers/assert.ts'
import { anatomyChecks } from '../helpers/anatomy.ts'
import { armGrant, armRun, readLedger } from '../helpers/driver.ts'
import { makeEvalFixture, type RangeSpec } from '../helpers/fixture.ts'
import { CLASSES, detailHeader, isRangeDetail, proposedClass, readStopStamp, relayHeader } from './c11-run.eval.ts'
import { TWO_STEPS, type Contract } from './contract.ts'

const C13_PROMPT_BUILD = '/plumbbob:build 2'
const C13_PROMPT_RUN = '/plumbbob:run'

const C13_RANGES: ReadonlyArray<RangeSpec> = [{ steps: '1-2', stop: 'review the greeting and the farewell together' }]

// One park, so the short card still carries its lean table.
const C13_PARK = 'greet() could take a locale, for greetings in other languages'

// Step 1's product, landed by the fixture so the measured turns start at step 2.
const GREETING = 'export function greet(name) {\n  return `Hello, ${name}!`\n}\n'

export const c13: Contract = {
  id: 'c13',
  title: 'a short stop card after an approved halt',
  makeFixture: () =>
    makeEvalFixture({
      steps: TWO_STEPS,
      gate: 'green',
      ranges: C13_RANGES,
      parks: [C13_PARK],
      landed: [{ step: 1, files: { 'src/greet.js': GREETING } }],
    }),
  async run(session, fixture) {
    const { repo, buildDir } = fixture
    const t0 = snapshot(repo)
    const parks0 = parkLines(repo)
    const turn1 = await session.turn(C13_PROMPT_BUILD)
    const t1 = snapshot(repo)
    const paused = t1.step === '2' && pauseStamp(buildDir) === '2'
    armGrant(repo, session.sweep, 'steps 2')
    armRun(repo, session.sweep, 1)
    const turn2 = await session.turn(C13_PROMPT_RUN)
    const t2 = snapshot(repo)
    const stepsLanded = checkpointLines(repo)
      .filter((l) => l.kind === 'step')
      .map((l) => l.step)
    const stamp = readStopStamp(buildDir)
    const detail = fileContent(repo, join('.plumbbob', 'detail.md'))
    const lean = proposedClass(detail, 1)
    const relay = relayHeader(repo)
    const parks2 = parkLines(repo)
    return {
      turns: [turn1, turn2],
      checks: [
        // The card the second turn answers has to have shown in the first.
        validity('step 2 waited at its pause, its card shown', paused, `STEP=${t1.step ?? 'none'} PAUSE=${pauseStamp(buildDir) ?? '∅'}`),
        check('checkpointed exactly steps 1 and 2', stepsLanded.join(',') === '1,2', stepsLanded.join(',')),
        check('no step left in flight', t2.step === null, `step ${t2.step ?? 'none'}`),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        check('the landing answered step 2’s card', pauseStamp(buildDir) === 'landed 2 answered', `PAUSE=${pauseStamp(buildDir) ?? '∅'}`),
        check('the stop card printed for range 1', stamp?.range === 1, stamp === null ? 'no STOP stamp' : `STOP names range ${stamp.range}`),
        // The detail stays whole on disk: the stop's record reads it, and
        // `show the stop` prints the whole card from it.
        check('the card printed from range 1’s detail, still on disk', stamp !== null && isRangeDetail(detail, 1), detailHeader(detail)),
        check('the detail proposes a lean for P1', lean !== null && CLASSES.includes(lean), lean ?? 'no `- P1 →` line under ## Harvest'),
        check(
          'nothing recorded: P1 still open',
          parks2.length === parks0.length && parks2.every((line) => line.startsWith('- [ ]')),
          parks2.join(' | '),
        ),
        info('the last ending the CLI printed was the stop card', relay.get('render') === 'stop', `RELAY render=${relay.get('render') ?? '∅'}`),
        info('the stop card landed without a hold', !relay.has('held'), relay.has('held') ? `held on TURN ${relay.get('held')}` : ''),
        // The short card leaves out what step 2's card showed one turn before.
        info('the turn carried no Summary and no Readout', !/^\*\*(?:Summary|Readout)\*\*:/m.test(turn2.content)),
        info(
          'latch ledger after the run',
          readLedger(repo, 'TURN') !== null,
          `TURN=${readLedger(repo, 'TURN') ?? '∅'} GRANT=${readLedger(repo, 'GRANT') ?? '∅'} RUN=${readLedger(repo, 'RUN') ?? '∅'}`,
        ),
        ...anatomyChecks(turn2.content, 'stop-short'),
      ],
    }
  },
}

// The PAUSE stamp as the CLI wrote it: `2` while step 2's card has shown,
// `landed 2 answered` once a landing answered it. Null when absent.
function pauseStamp(buildDir: string): string | null {
  const raw = fileContent(buildDir, 'PAUSE').trim()
  return raw.length === 0 ? null : raw
}
