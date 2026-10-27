import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { handoff } from '../handoff.ts'
import { park } from '../park.ts'
import { relayCheck } from '../relay.ts'
import { start } from '../start.ts'
import { applyTurn } from '../turn.ts'
import {
  detailPath,
  intentPath,
  readRelay,
  readTurn,
  relayPath,
  seamPath,
  stepPath,
  turnPath,
  writeRelay,
} from '../../lib/sidecar.ts'
import { ending, transition } from '../../lib/notice.ts'
import { formatHelp } from '../../cli-core.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { cleanupFixtures, runCli } from '../../../test/helpers/fixture-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)
afterAll(cleanupFixtures)

const INTENT = `# Relay test

## Steps

1. [x] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`README.md\`
3. [ ] Third — **done when:** c works.
   - seam: \`src/c.ts\`
`

const DETAIL = `── recap · step 2 of 3 ──
done-when    met
decisions    none exercised
constraints  all honored

## Summary

The second step works.

## 1 It does the thing

The whole story.

## Recommendation

Approve it.
`

const PROMPT_ID = 'prompt-1'

/** A session at turn 4 with step 2 at its pause: a change in its seam and a detail file. */
async function paused(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Relay test']))
  writeFileSync(intentPath(dir), INTENT)
  writeFileSync(stepPath(dir), '2\n')
  writeFileSync(seamPath(dir), 'README.md\n')
  writeFileSync(join(dir, 'README.md'), '# fixture\nchanged\n')
  writeFileSync(detailPath(dir), DETAIL)
  writeFileSync(turnPath(dir), '4\n')
  return dir
}

/** Print an ending the way the turn did, and return what it printed. */
function printed(dir: string, args: ReadonlyArray<string> = []): string {
  return captureIo(() => handoff(dir, args)).stdout
}

/** A boundary block as `checkpoint` prints it, recorded at the current turn. */
function recordBoundary(dir: string): string {
  const text = ending({
    lead: transition({ label: 'Checkpoint', fact: 'Step 2 complete', detail: ['b4c5d6e7f'] }),
    state: [
      { label: 'Verdict', value: '● Plumb' },
      { label: 'Next Up', value: 'Step 3 of 3 - Third' },
    ],
  })
  writeRelay(dir, { tier: 'orientation', render: 'checkpoint', text })
  return text
}

type Payload = { last?: string; active?: boolean; transcript?: string | null }

/** A Stop payload for the session, the way the harness sends it on stdin. */
function stop(dir: string, p: Payload): string {
  return JSON.stringify({
    session_id: 'session-1',
    transcript_path: p.transcript === null ? undefined : (p.transcript ?? join(dir, 'missing.jsonl')),
    cwd: dir,
    prompt_id: PROMPT_ID,
    hook_event_name: 'Stop',
    stop_hook_active: p.active ?? false,
    ...(p.last === undefined ? {} : { last_assistant_message: p.last }),
  })
}

/** A transcript holding one turn: the human prompt, then each assistant text in order. */
function transcript(dir: string, texts: ReadonlyArray<string>): string {
  const path = join(dir, 'transcript.jsonl')
  const lines = [
    { type: 'user', promptId: 'prompt-0', message: { role: 'user', content: 'an earlier turn' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'earlier text' }] } },
    { type: 'user', promptId: PROMPT_ID, message: { role: 'user', content: 'looks good' } },
    ...texts.flatMap((text) => [
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash' }] } },
      { type: 'user', promptId: PROMPT_ID, message: { role: 'user', content: [{ type: 'tool_result' }] } },
    ]),
  ]
  writeFileSync(path, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`)
  return path
}

/** The reason a hold carries, or null when the check let the turn end. */
function held(output: string | null): string | null {
  if (output === null) return null
  const parsed = JSON.parse(output) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }
  expect(Object.keys(parsed)).toEqual(['hookSpecificOutput']) // never `decision`, never `continue: false`
  expect(parsed.hookSpecificOutput.hookEventName).toBe('Stop')
  return parsed.hookSpecificOutput.additionalContext
}

describe('relay — a decision ending has to close the turn', () => {
  it('lets a turn end that closed on its whole relay, with an answer above it', async () => {
    const dir = await paused()
    const card = printed(dir)
    expect(held(relayCheck(dir, stop(dir, { last: `Here is the pause.\n\n${card}` })))).toBeNull()
  })

  it('matches a relay whose whitespace moved: a rewrapped line, a dropped trailing blank', async () => {
    const dir = await paused()
    const card = printed(dir)
    const rewrapped = card.replace('**Summary**: ', '**Summary**:\n').trimEnd()
    expect(held(relayCheck(dir, stop(dir, { last: rewrapped })))).toBeNull()
  })

  it('holds a paraphrased step card once, naming `plumbbob handoff --full`', async () => {
    const dir = await paused()
    printed(dir)
    const reason = held(relayCheck(dir, stop(dir, { last: 'Step 2 is done and the check is green. Approve?' })))
    expect(reason).toBe(
      'plumbbob: the turn did not close on the pause card it printed. ' +
        'Run `plumbbob handoff --full` and end the turn on its output, whole, with nothing after it.',
    )
    expect(readRelay(dir)?.held).toBe(4)
  })

  it('names the step a verify pause was asked about in the command', async () => {
    const dir = await paused()
    writeFileSync(stepPath(dir), '')
    printed(dir, ['2'])
    expect(held(relayCheck(dir, stop(dir, { last: 'Approve?' })))).toContain('Run `plumbbob handoff --full 2`')
  })

  it('holds a missed plan card, naming `plumbbob handoff --plan`', async () => {
    const dir = await paused()
    printed(dir, ['--plan'])
    const reason = held(relayCheck(dir, stop(dir, { last: 'The plan is ready for review.' })))
    expect(reason).toContain('the plan card it printed')
    expect(reason).toContain('Run `plumbbob handoff --plan`')
  })

  it('accepts a plan card relayed without its leading rule', async () => {
    const dir = await paused()
    const plan = printed(dir, ['--plan'])
    expect(plan.startsWith('\n---\n')).toBe(true)
    expect(held(relayCheck(dir, stop(dir, { last: plan })))).toBeNull()
    expect(held(relayCheck(dir, stop(dir, { last: `The plan.\n\n${plan.replace('\n---\n', '')}` })))).toBeNull()
  })

  it('holds a turn with no text', async () => {
    const dir = await paused()
    printed(dir)
    expect(held(relayCheck(dir, stop(dir, { last: '' })))).toContain('did not close on the pause card')
  })

  it('holds text written after the relay', async () => {
    const dir = await paused()
    const card = printed(dir)
    expect(held(relayCheck(dir, stop(dir, { last: `${card}Let me know what you think!` })))).not.toBeNull()
  })

  it('lets an answer followed by the reminder end the turn', async () => {
    const dir = await paused()
    printed(dir)
    writeFileSync(turnPath(dir), '5\n') // the human asked a question
    const reminder = printed(dir)
    expect(reminder).toBe('**Next Up**: Back to Step 2 of 3 - Second\n\n')
    const last = `The limiter runs first because a miss has to count.\n\n${reminder}`
    expect(held(relayCheck(dir, stop(dir, { last })))).toBeNull()
  })

  it('holds a missed reminder, naming plain `plumbbob handoff`', async () => {
    const dir = await paused()
    printed(dir)
    printed(dir)
    expect(held(relayCheck(dir, stop(dir, { last: 'It runs first.' })))).toContain(
      'the pause reminder it printed. Run `plumbbob handoff` and',
    )
  })
})

describe('relay — an orientation ending has to appear in the turn', () => {
  it('lets a boundary block followed by an answer end the turn', async () => {
    const dir = await paused()
    const block = recordBoundary(dir)
    const last = `${block}And yes, the limiter counts misses.`
    expect(held(relayCheck(dir, stop(dir, { last })))).toBeNull()
  })

  it('finds a boundary block relayed in an earlier message of the same turn', async () => {
    const dir = await paused()
    const block = recordBoundary(dir)
    const path = transcript(dir, [block])
    expect(held(relayCheck(dir, stop(dir, { last: 'Anything else?', transcript: path })))).toBeNull()
  })

  it('holds a boundary the turn never relayed, pointing at the block as it printed', async () => {
    const dir = await paused()
    recordBoundary(dir)
    const path = transcript(dir, ['Landing it now.'])
    expect(held(relayCheck(dir, stop(dir, { last: 'Step 2 is in.', transcript: path })))).toBe(
      'plumbbob: the turn did not relay the block `plumbbob checkpoint` printed. ' +
        'Paste that block whole, exactly as it printed (it is stored below the header in `.plumbbob/RELAY`).',
    )
  })

  it('reads only the current prompt, so a block from an earlier turn does not count', async () => {
    const dir = await paused()
    const block = recordBoundary(dir)
    const path = transcript(dir, ['Landing it now.'])
    // The block sits before this prompt in the transcript, not in its turn.
    const lines = readFileSync(path, 'utf8').replace('earlier text', block.replace(/\n/g, '\\n'))
    writeFileSync(path, lines)
    expect(held(relayCheck(dir, stop(dir, { last: 'Step 2 is in.', transcript: path })))).not.toBeNull()
  })

  it('judges nothing when the transcript cannot be read and the final message lacks the block', async () => {
    const dir = await paused()
    recordBoundary(dir)
    expect(relayCheck(dir, stop(dir, { last: 'Step 2 is in.' }))).toBeNull() // the path does not exist
    expect(relayCheck(dir, stop(dir, { last: 'Step 2 is in.', transcript: null }))).toBeNull() // no path at all
    const garbled = join(dir, 'garbled.jsonl')
    writeFileSync(garbled, 'not json\n{"type":"assistant"}\n')
    expect(relayCheck(dir, stop(dir, { last: 'Step 2 is in.', transcript: garbled }))).toBeNull() // no prompt in it
    expect(readRelay(dir)?.held).toBeUndefined()
  })
})

describe('relay — what it never judges', () => {
  it('lets a park after a handoff end the turn on the park, since the last ending wins', async () => {
    const dir = await paused()
    printed(dir)
    const parked = captureIo(() => park(dir, ['a tangent'])).stdout
    expect(readRelay(dir)?.render).toBe('park')
    expect(held(relayCheck(dir, stop(dir, { last: parked })))).toBeNull()
    expect(held(relayCheck(dir, stop(dir, { last: 'Parked it.' })))).toBeNull() // a driver ending is not checked
  })

  it('ignores a RELAY from an earlier turn', async () => {
    const dir = await paused()
    printed(dir)
    writeFileSync(turnPath(dir), '5\n') // a new human turn that printed nothing
    expect(relayCheck(dir, stop(dir, { last: 'Sure, here is the answer.' }))).toBeNull()
  })

  it('judges nothing from a host too old to send the final message', async () => {
    const dir = await paused()
    printed(dir)
    expect(relayCheck(dir, stop(dir, {}))).toBeNull()
  })

  it('judges nothing outside a session, or with no ending recorded', async () => {
    const dir = makeTempRepo()
    expect(relayCheck(dir, stop(dir, { last: 'Hello.' }))).toBeNull()
    const session = await paused()
    expect(relayCheck(session, stop(session, { last: 'Hello.' }))).toBeNull()
  })
})

/** The prompt hook's stdin for a background job's completion notice, under a given prompt id. */
const notice = (promptId: string): string =>
  JSON.stringify({ prompt_id: promptId, prompt: '<task-notification>\n<status>completed</status>\n</task-notification>' })

describe('relay — a background notice after a pause — D90 (notice-not-turn)', () => {
  it('lets the turn a notice starts end, instead of holding it for the card the pause already showed', async () => {
    const dir = await paused()
    const card = printed(dir)
    expect(held(relayCheck(dir, stop(dir, { last: card })))).toBeNull() // the pause turn closed on its card
    applyTurn(dir, notice('notice-1'))
    expect(readTurn(dir)).toBe(4) // the notice ticked nothing, so the card's TURN is still the current one
    expect(readRelay(dir)).toBeNull()
    expect(held(relayCheck(dir, stop(dir, { last: 'The sweep finished green.' })))).toBeNull()
  })

  it('still checks an ending printed after the notice', async () => {
    const dir = await paused()
    printed(dir)
    applyTurn(dir, notice('notice-1'))
    expect(printed(dir)).toBe('**Next Up**: Back to Step 2 of 3 - Second\n\n')
    expect(held(relayCheck(dir, stop(dir, { last: 'The sweep finished green.' })))).toContain(
      'the pause reminder it printed',
    )
  })

  it('holds a missed card when the notice was folded into the turn that printed it', async () => {
    const dir = await paused()
    applyTurn(dir, JSON.stringify({ prompt_id: PROMPT_ID, prompt: 'build step 2' }))
    printed(dir)
    applyTurn(dir, notice(PROMPT_ID)) // delivered mid-turn, under the running turn's id
    expect(held(relayCheck(dir, stop(dir, { last: 'Step 2 is done. Approve?' })))).toContain(
      'did not close on the pause card',
    )
  })
})

describe('relay — it holds a turn open once', () => {
  it('holds once per turn, even after the retry reprinted the card and missed again', async () => {
    const dir = await paused()
    printed(dir)
    expect(held(relayCheck(dir, stop(dir, { last: 'Approve?' })))).not.toBeNull()
    printed(dir, ['--full']) // the retry runs the command the reason named, rewriting RELAY
    expect(readRelay(dir)?.held).toBe(4) // the spent hold rides the rewrite
    expect(relayCheck(dir, stop(dir, { last: 'Approve now?', active: true }))).toBeNull()
  })

  it('still holds a miss when `stop_hook_active` was set by another hook', async () => {
    // checkride's gate re-blocks on every red Stop: the shared flag names no
    // hook, so the check counts its own hold instead of trusting it.
    const dir = await paused()
    printed(dir)
    expect(held(relayCheck(dir, stop(dir, { last: 'Approve?', active: true })))).not.toBeNull()
  })

  it('holds again on the next turn, whose ending is a new one', async () => {
    const dir = await paused()
    printed(dir)
    relayCheck(dir, stop(dir, { last: 'Approve?' }))
    writeFileSync(turnPath(dir), '5\n')
    printed(dir, ['--full'])
    expect(readRelay(dir)?.held).toBeUndefined()
    expect(held(relayCheck(dir, stop(dir, { last: 'Approve?' })))).not.toBeNull()
  })

  it('holds nothing when it cannot record the hold, since an uncounted hold could repeat', async () => {
    const dir = await paused()
    printed(dir)
    chmodSync(relayPath(dir), 0o444) // readable, so the miss is seen; the stamp cannot land
    try {
      expect(relayCheck(dir, stop(dir, { last: 'Approve?' }))).toBeNull()
      expect(readRelay(dir)?.held).toBeUndefined()
    } finally {
      chmodSync(relayPath(dir), 0o644)
    }
  })
})

/** A relay the 2026-10-17 A/B held: the block the verb printed, and what the model wrote in its place. */
type Held = {
  readonly run: string
  readonly tier: 'decision' | 'plan'
  readonly command: string
  readonly whole: boolean
  readonly printed: string
  readonly relayed: string
}

const HELD = JSON.parse(readFileSync(new URL('./fixtures/relay-holds.json', import.meta.url), 'utf8')) as ReadonlyArray<Held>

/** Record a held relay's printed block as this turn's ending. */
function recordHeld(dir: string, h: Held): void {
  writeRelay(dir, { tier: 'decision', render: h.tier === 'plan' ? 'plan' : 'card', command: h.command, text: h.printed })
}

describe('relay — the holds the 2026-10-17 A/B made, replayed — D19 (facts-exact)', () => {
  it('replays all eight, five the receipt read as whole and three it read as missed', () => {
    expect(HELD.map((h) => h.whole)).toEqual([true, true, true, false, false, true, false, true])
  })

  for (const h of HELD) {
    it(`${h.whole ? 'lets through' : 'still holds'} ${h.run}, a ${h.tier === 'plan' ? 'plan card' : 'pause card'} ${h.whole ? 'relayed with one line changed' : 'never relayed'}`, async () => {
      const dir = await paused()
      recordHeld(dir, h)
      expect(held(relayCheck(dir, stop(dir, { last: h.relayed }))) === null).toBe(h.whole)
    })
  }

  it('holds a relay that keeps every part but turns the check row green', async () => {
    const dir = await paused()
    const h = HELD[0] as Held
    recordHeld(dir, h)
    expect(h.printed).toContain('check        red: node check.js failing')
    const laundered = h.printed.replace('check        red: node check.js failing', 'check        green: 1 of 1 checks')
    expect(held(relayCheck(dir, stop(dir, { last: laundered })))).toContain('did not close on the pause card')
  })

  it('holds a relay that keeps every part but changes the Verdict', async () => {
    const dir = await paused()
    const h = HELD[0] as Held
    recordHeld(dir, h)
    expect(h.printed).toContain('**Verdict**: ○ Out of plumb (check red)')
    const laundered = h.printed.replace('**Verdict**: ○ Out of plumb (check red)', '**Verdict**: ● Plumb')
    expect(held(relayCheck(dir, stop(dir, { last: laundered })))).not.toBeNull()
  })

  it('holds a relay wrapped in a fence, whose labels no longer open lines of the ending', async () => {
    const dir = await paused()
    const card = printed(dir)
    expect(held(relayCheck(dir, stop(dir, { last: `\`\`\`\`markdown\n${card}\`\`\`\`\n` })))).not.toBeNull()
  })

  it('reads the last copy of a card relayed twice in one message', async () => {
    const dir = await paused()
    const card = printed(dir)
    expect(held(relayCheck(dir, stop(dir, { last: `${card}${card}` })))).toBeNull()
    expect(held(relayCheck(dir, stop(dir, { last: `${card}${card.replace('| **Verdict** | ', '| **Verdict** | ✗ ')}` })))).not.toBeNull()
  })

  it("holds a card whose Verdict row changed, and lets through one whose table was respaced, read as the fact — D111 (state-table)", async () => {
    const dir = await paused()
    const card = printed(dir)
    const verdict = /^\| \*\*Verdict\*\* \| (.*) \|$/m.exec(card)
    expect(verdict).not.toBeNull()
    const laundered = card.replace(verdict?.[0] ?? '', '| **Verdict** | ✗ Not standing (done-when drifted) |')
    expect(held(relayCheck(dir, stop(dir, { last: laundered })))).not.toBeNull()
    writeFileSync(turnPath(dir), '5\n')
    printed(dir, ['--full'])
    const respaced = card.replace(verdict?.[0] ?? '', `|**Verdict**|${verdict?.[1] ?? ''}|`)
    expect(held(relayCheck(dir, stop(dir, { last: respaced })))).toBeNull()
  })

  it('lets a boundary relayed whole with its Stop row through, and holds one that dropped it', async () => {
    const dir = await paused()
    const text = ending({
      lead: transition({ label: 'Checkpoint', fact: 'Step 3 complete', detail: ['b4c5d6e7f'] }),
      state: [
        { label: 'Verdict', value: '● Plumb' },
        { label: 'Stop', value: 'Range 2 of 2 landed - review the parser (details: [intent.md:16](x/intent.md#L16))' },
        { label: 'Next Up', value: 'Nothing planned - /plumbbob:step or /plumbbob:finish' },
      ],
    })
    writeRelay(dir, { tier: 'orientation', render: 'checkpoint', text })
    const path = transcript(dir, ['Landing it now.'])
    expect(held(relayCheck(dir, stop(dir, { last: text, transcript: path })))).toBeNull()
    writeFileSync(turnPath(dir), '5\n')
    writeRelay(dir, { tier: 'orientation', render: 'checkpoint', text })
    const dropped = text.replace(/\| Stop \|.*\n/, '')
    expect(dropped).not.toContain('| Stop |')
    expect(held(relayCheck(dir, stop(dir, { last: dropped, transcript: path })))).not.toBeNull()
  })

  it('lets a boundary through with its lead reworded, and holds one whose Verdict changed', async () => {
    const dir = await paused()
    const block = recordBoundary(dir)
    const path = transcript(dir, ['Landing it now.'])
    expect(held(relayCheck(dir, stop(dir, { last: block.replace('Step 2 complete', 'Step 2 landed'), transcript: path })))).toBeNull()
    writeFileSync(turnPath(dir), '5\n')
    recordBoundary(dir)
    expect(held(relayCheck(dir, stop(dir, { last: block.replace('● Plumb', '○ Out of plumb'), transcript: path })))).not.toBeNull()
  })

  it('holds a paragraph written inside a pause card, between two of its parts', async () => {
    const dir = await paused()
    const card = printed(dir)
    const crowded = card.replace('**Your Call**:', 'One more thing before you decide.\n\n**Your Call**:')
    expect(held(relayCheck(dir, stop(dir, { last: crowded })))).not.toBeNull()
  })
})

// A stop card as `handoff --stop` prints it, whole: the range's review, the
// Harvested part's lean table, the line that says approving locks in the
// leans, the moves that settle it, the state table, and the foot.
const STOP_CARD = [
  '**Summary**: The parser reads the plan.',
  '',
  '**Readout**:',
  '',
  '```text',
  'steps        2 of 2 landed',
  '             - 2 a1b2c3d · 3 b2c3d4e',
  'check        green: 1 of 1 checks, 2 landings',
  'done-when    met',
  'seam         held: 2 of 2 steps, no strays',
  'diff         +2 -0 across 2 files',
  '             - src/b.ts +1 -0',
  '             - src/c.ts +1 -0',
  '```',
  '',
  '**Harvested**: 1 of 1 parked idea open',
  '',
  '| Park | What it is | Why it matters | Lean |',
  '| --- | --- | --- | --- |',
  '| P1 · card renders | one idea | the dashboard prints it raw | tangent: the card renders it |',
  '',
  '**Your Call**:',
  '',
  'Approving locks in each lean above; to change one, say so first (`make P1 a blocker`).',
  '',
  '- `looks good` → I record the review and every lean as proposed, folding a blocker into the plan; back to the boundary',
  '- `/plumbbob:finish` → I record them the same way, then write the report and close the build',
  '',
  '| **Verdict** | ● Plumb |',
  '| --- | --- |',
  '| Stop | Range 2 of 2 landed - review the parser (details: [intent.md:16](x/intent.md#L16)) |',
  '| Next Up | Nothing planned - /plumbbob:step or /plumbbob:finish |',
  '',
  '**Recommendation**: Approve it. Both steps held their seams.',
  '',
  '[more details](.plumbbob/detail.md)',
  '',
  '',
].join('\n')

describe('relay — a run owes its stop card — D103 (stop-latched)', () => {
  it("holds a run's boundary that still owes the card, however whole the boundary was relayed, and only once", async () => {
    const dir = await paused()
    const text = ending({
      lead: transition({ label: 'Checkpoint', fact: 'Step 3 complete', detail: ['b4c5d6e7f'] }),
      state: [
        { label: 'Verdict', value: '● Plumb' },
        { label: 'Stop', value: 'Range 2 of 2 landed - review the parser (details: [intent.md:16](x/intent.md#L16))' },
        { label: 'Next Up', value: 'Nothing planned - /plumbbob:step or /plumbbob:finish' },
      ],
    })
    writeRelay(dir, { tier: 'orientation', render: 'checkpoint', owes: { range: 2, count: 2, step: 3 }, text })
    expect(held(relayCheck(dir, stop(dir, { last: text })))).toBe(
      "plumbbob: the turn ended on Step 3's boundary, and range 2 of 2's stop card is still owed. " +
        "Write the range's detail file, run `plumbbob handoff --stop`, and end the turn on its output, whole, with nothing after it.",
    )
    expect(readRelay(dir)).toMatchObject({ held: 4, owes: { range: 2, count: 2, step: 3 } })
    expect(relayCheck(dir, stop(dir, { last: text }))).toBeNull()
  })

  it("lets the turn end on the stop card the retry printed in the boundary's place", async () => {
    const dir = await paused()
    writeRelay(dir, { tier: 'orientation', render: 'checkpoint', owes: { range: 2, count: 2, step: 3 }, text: '**Checkpoint**: x\n\n' })
    writeRelay(dir, { tier: 'decision', render: 'stop', command: 'plumbbob handoff --stop --full', text: STOP_CARD })
    expect(readRelay(dir)?.owes).toBeUndefined()
    expect(held(relayCheck(dir, stop(dir, { last: `Range 2 is in.\n\n${STOP_CARD}` })))).toBeNull()
  })

  it('holds a stop card that dropped a part, naming `plumbbob handoff --stop --full`', async () => {
    const dir = await paused()
    writeRelay(dir, { tier: 'decision', render: 'stop', command: 'plumbbob handoff --stop --full', text: STOP_CARD })
    const dropped = STOP_CARD.replace(/\*\*Harvested\*\*:[\s\S]*?\n\n\| Park [\s\S]*?\n\n/, '')
    expect(dropped).not.toContain('**Harvested**')
    expect(held(relayCheck(dir, stop(dir, { last: dropped })))).toBe(
      'plumbbob: the turn did not close on the stop card it printed. ' +
        'Run `plumbbob handoff --stop --full` and end the turn on its output, whole, with nothing after it.',
    )
  })

  it('holds a missed stop reminder, naming `plumbbob handoff --stop`', async () => {
    const dir = await paused()
    const reminder = "**Next Up**: Back to Range 2 of 2's stop - review the parser\n\n"
    writeRelay(dir, { tier: 'decision', render: 'stop-reminder', command: 'plumbbob handoff --stop', text: reminder })
    expect(held(relayCheck(dir, stop(dir, { last: `It parses first.\n\n${reminder}` })))).toBeNull()
    writeFileSync(turnPath(dir), '5\n')
    writeRelay(dir, { tier: 'decision', render: 'stop-reminder', command: 'plumbbob handoff --stop', text: reminder })
    expect(held(relayCheck(dir, stop(dir, { last: 'It parses first.' })))).toContain(
      'the stop reminder it printed. Run `plumbbob handoff --stop` and',
    )
  })
})

describe('relay — the hook', () => {
  it('exits 0 with no output on a payload it cannot read', async () => {
    const dir = await paused()
    printed(dir)
    for (const input of ['', 'not json', '[]', '{"last_assistant_message": 7}']) {
      expect(runCli(dir, ['relay'], {}, input)).toEqual({ stdout: '', stderr: '', status: 0 })
    }
  })

  it('prints the hold on stdout and exits 0 when the turn missed its ending', async () => {
    const dir = await paused()
    printed(dir)
    const result = runCli(dir, ['relay'], {}, stop(dir, { last: 'Approve?' }))
    expect(result.status).toBe(0)
    expect(held(result.stdout)).toContain('Run `plumbbob handoff --full`')
  })

  it('lists relay in help, marked as machinery, not a user verb', async () => {
    expect(formatHelp()).toMatch(/relay.*machinery/)
  })

  it('wires the Stop event to `plumbbob relay`', async () => {
    const path = fileURLToPath(new URL('../../../hooks/hooks.json', import.meta.url))
    const hooks = JSON.parse(readFileSync(path, 'utf8')) as {
      hooks: { Stop?: ReadonlyArray<{ hooks: ReadonlyArray<{ command: string }> }> }
    }
    const commands = (hooks.hooks.Stop ?? []).flatMap((group) => group.hooks.map((h) => h.command))
    expect(commands.some((c) => c.includes('plumbbob') && /\brelay\b/.test(c))).toBe(true)
  })
})
