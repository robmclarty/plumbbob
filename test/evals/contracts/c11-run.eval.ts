// Contract 11: a run lands its range and ends on its stop card. `/plumbbob:run`
// over three planned steps whose `## Build ranges` declares two ranges (steps 1
// and 2 landing, then step 3 bare), with one park open, checkpoints exactly
// steps 1 and 2, leaves step 3 untouched, and ends on the stop card that
// reviews range 1 with a lean proposed for the park. It records nothing: the
// human's reply to the card is what records the stop (D103 (stop-latched)), so
// the park stays open, the Harvest section and the Log carry no stop, and the
// stamp and the detail the card printed from are still on disk.
//
// In the latched sweep the driver pre-arms `steps 1-2` and the RUN mark naming
// range 1, which is what the hook writes for that prompt, for parity with
// earlier receipts (armGrant says why); the minting and the marking themselves
// are unit-tested in src/verbs/__tests__/turn.test.ts.
//
// The stamp is the card's mechanical trace: `handoff --stop` writes it as the
// card prints, naming the range and the turn it printed in, and the record
// clears it. It names no digest of the detail file since D110
// (reply-after-the-card), because a reply may rewrite a lean without printing
// the card again; the detail still on disk is read for its header instead.
// Whether the turn's text carried the card whole is the anatomy probes'
// measurement, and they stay `info`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  check,
  checkpointLines,
  dirtyPathsIn,
  fileContent,
  info,
  intentBoxes,
  landedDetail,
  parkLines,
  snapshot,
  unledgeredCommits,
  validity,
} from '../helpers/assert.ts'
import { anatomyChecks } from '../helpers/anatomy.ts'
import { armGrant, armRun, readLedger } from '../helpers/driver.ts'
import { makeEvalFixture, type RangeSpec } from '../helpers/fixture.ts'
import { THREE_STEPS, type Contract } from './contract.ts'

const C11_PROMPT = '/plumbbob:run'

export const C11_RANGES: ReadonlyArray<RangeSpec> = [
  { steps: '1-2', stop: 'review the greeting and the farewell before the shout helper' },
  { steps: '3', stop: "at step 3's pause, approve the shout helper" },
]

// One park, plainly off the plan's path, so any of the three classes is a
// lean the card can carry; which one the model proposes is its call.
export const C11_PARK = 'greet() could take a locale, for greetings in other languages'

const CLASSES = ['blocker', 'tangent', 'pivot']

export const c11: Contract = {
  id: 'c11',
  title: 'a run ends on its stop card',
  makeFixture: () => makeEvalFixture({ steps: THREE_STEPS, gate: 'green', ranges: C11_RANGES, parks: [C11_PARK] }),
  async run(session, fixture) {
    const { repo, buildDir } = fixture
    const t0 = snapshot(repo)
    const parks0 = parkLines(repo)
    armGrant(repo, session.sweep, 'steps 1-2')
    armRun(repo, session.sweep, 1)
    const turn = await session.turn(C11_PROMPT)
    const t1 = snapshot(repo)
    const stepsLanded = checkpointLines(repo)
      .filter((l) => l.kind === 'step')
      .map((l) => l.step)
    const stamp = readStopStamp(buildDir)
    const detail = fileContent(repo, join('.plumbbob', 'detail.md'))
    const lean = proposedClass(detail, 1)
    const relay = relayHeader(repo)
    const parks1 = parkLines(repo)
    return {
      turns: [turn],
      checks: [
        validity('the run engaged (step 1 landed)', stepsLanded.includes(1), stepsLanded.join(',')),
        // Under-running and overrunning both miss the range the plan names.
        check('checkpointed exactly steps 1 and 2', stepsLanded.join(',') === '1,2', landedDetail(repo)),
        check('box 3 still unchecked', intentBoxes(repo).get(3) === false),
        check('step-3 seam untouched', dirtyPathsIn(repo, ['src/shout.js']).length === 0),
        check('no step left in flight', t1.step === null, `step ${t1.step ?? 'none'}`),
        check('no unledgered commits', unledgeredCommits(repo, t0.headSha).length === 0),
        check('the stop card printed for range 1', stamp?.range === 1, stamp === null ? 'no STOP stamp' : `STOP names range ${stamp.range}`),
        // The detail the card printed from stays on disk until the human's
        // reply records it, and its header names the range it reviews.
        check('the card printed from range 1’s detail, still on disk', stamp !== null && isRangeDetail(detail, 1), detailHeader(detail)),
        check('the detail proposes a lean for P1', lean !== null && CLASSES.includes(lean), lean ?? 'no `- P1 →` line under ## Harvest'),
        check(
          'nothing recorded: P1 still open',
          parks1.length === parks0.length && parks1.every((line) => line.startsWith('- [ ]')),
          parks1.join(' | '),
        ),
        check(
          'nothing recorded: no Harvest lines, no stop in the Log',
          section(t1.buildLog, 'Harvest') === section(t0.buildLog, 'Harvest') && !t1.buildLog.includes('stop recorded'),
        ),
        check('nothing recorded: no blocker folded into the plan', [...intentBoxes(repo).keys()].join(',') === '1,2,3'),
        info('the last ending the CLI printed was the stop card', relay.get('render') === 'stop', `RELAY render=${relay.get('render') ?? '∅'}`),
        // The relay check holds a run's boundary that still owes its card,
        // once (D100 (stop-card)); a pass with a hold landed the card on the retry.
        info('the stop card landed without a hold', !relay.has('held'), relay.has('held') ? `held on TURN ${relay.get('held')}` : ''),
        // The lean table's row for P1, its class opening the last cell (D112 (lean-table)).
        info('the turn carried P1’s lean', /^\| P1\b[^|]*\|[^|]*\|[^|]*\| (?:blocker|tangent|pivot)\b/m.test(turn.content)),
        info(
          'latch ledger after the turn',
          readLedger(repo, 'TURN') !== null, // the turn hook ticked, not a headless timing miss
          `TURN=${readLedger(repo, 'TURN') ?? '∅'} GRANT=${readLedger(repo, 'GRANT') ?? '∅'} RUN=${readLedger(repo, 'RUN') ?? '∅'}`,
        ),
        ...anatomyChecks(turn.content, 'stop'),
      ],
    }
  },
}

type StopStamp = { readonly range: number }

// The STOP stamp `handoff --stop` writes as the card prints: the range and the
// TURN it printed in.
function readStopStamp(buildDir: string): StopStamp | null {
  try {
    const m = /^(\d+) \S+/.exec(readFileSync(join(buildDir, 'STOP'), 'utf8').trim())
    return m === null ? null : { range: Number(m[1]) }
  } catch {
    return null
  }
}

function detailHeader(detail: string): string {
  return detail.trimStart().split('\n', 1)[0] || 'no detail file'
}

function isRangeDetail(detail: string, range: number): boolean {
  return new RegExp(`^#\\s+Detail\\s*·\\s*Range\\s+${range}\\b`).test(detailHeader(detail))
}

// The class the detail's `## Harvest` section proposes for one park handle
// (`- P1 → tangent: <reason>`), or null when no line names it.
function proposedClass(detail: string, handle: number): string | null {
  const lines = section(detail, 'Harvest').split('\n')
  for (const line of lines) {
    const m = new RegExp(`^-\\s+P${handle}\\s*(?:→|->)\\s*([\\w-]+)`, 'i').exec(line.trim())
    if (m !== null) return (m[1] ?? '').toLowerCase()
  }
  return null
}

// The text under a `## <heading>` line, up to the next `## ` heading; empty
// when the heading is absent.
function section(text: string, heading: string): string {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${heading}\\b`).test(l.trim()))
  if (start === -1) return ''
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  return lines.slice(start + 1, end === -1 ? lines.length : end).join('\n')
}

// The header lines of `.plumbbob/RELAY`, the ending the CLI printed last, as
// `key value` pairs; empty when no ending was recorded (a sweep without the
// turn ledger records none).
function relayHeader(repo: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>()
  const raw = fileContent(repo, join('.plumbbob', 'RELAY'))
  const split = raw.indexOf('\n\n')
  for (const line of (split === -1 ? '' : raw.slice(0, split)).split('\n')) {
    const space = line.indexOf(' ')
    if (space > 0) fields.set(line.slice(0, space), line.slice(space + 1))
  }
  return fields
}
