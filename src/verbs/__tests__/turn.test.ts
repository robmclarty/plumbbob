import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { applyTurn, grantFromPrompt, isNotice, mintFromPrompt, turn, turnContext, type BuildRead } from '../turn.ts'
import { start } from '../start.ts'
import {
  detailPath,
  grantPath,
  intentPath,
  markSpike,
  pausePath,
  promptPath,
  readRelay,
  readRun,
  relayPath,
  runPath,
  stepPath,
  stopPath,
  turnPath,
  writeRelay,
} from '../../lib/sidecar.ts'
import { formatHelp } from '../../cli-core.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { runCli } from '../../../test/helpers/fixture-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

async function startedSession(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['The turn ledger']))
  return dir
}

const hookJson = (prompt: string): string => JSON.stringify({ prompt })

describe('grantFromPrompt', () => {
  it('mints `auto` from a literal `/build --auto`', async () => {
    expect(grantFromPrompt('/build --auto')).toBe('auto')
  })

  it('honors the namespaced `/plumbbob:build` form', async () => {
    expect(grantFromPrompt('/plumbbob:build --auto')).toBe('auto')
    expect(grantFromPrompt('/plumbbob:build 2-5')).toBe('steps 2-5')
    expect(grantFromPrompt('/plumbbob:build 1-2')).toBe('steps 1-2') // what contract 4's armGrant pre-arms
  })

  it('mints `steps N-M` from a N-M range, naming exactly the steps it holds — D12 (step-list-grants)', async () => {
    expect(grantFromPrompt('/build 1-3')).toBe('steps 1-3')
    expect(grantFromPrompt('/build 4-4')).toBe('steps 4')
  })

  it('mints a list as its normal form, typed with or without a space — D16 (list-reading)', async () => {
    expect(grantFromPrompt('/plumbbob:build 20,5-9')).toBe('steps 5-9,20')
    expect(grantFromPrompt('/plumbbob:build 20, 5-9')).toBe('steps 5-9,20')
    expect(grantFromPrompt('/plumbbob:build 48-51,76,52-57')).toBe('steps 48-57,76')
  })

  it('stores a long range as one short line, never the expansion', async () => {
    expect(grantFromPrompt('/build 1-100000')).toBe('steps 1-100000')
  })

  it('mints nothing from bare numbers alone, or a comma that only ends the sentence', async () => {
    expect(grantFromPrompt('/build 2 3')).toBeNull()
    expect(grantFromPrompt('/build 2, then review it')).toBeNull()
  })

  it('mints nothing from a range that does not parse, even beside --auto (bounded wins)', async () => {
    expect(grantFromPrompt('/build 5-3')).toBeNull()
    expect(grantFromPrompt('/build --auto 5-3')).toBeNull()
  })

  it('lets a bounded range beat --auto, in either order (bounded wins)', async () => {
    expect(grantFromPrompt('/build --auto 1-3')).toBe('steps 1-3')
    expect(grantFromPrompt('/build 1-3 --auto')).toBe('steps 1-3')
  })

  it('mints nothing from a bare invocation or a single step', async () => {
    expect(grantFromPrompt('/build')).toBeNull()
    expect(grantFromPrompt('/build 2')).toBeNull()
  })

  it('mints nothing when the flag/range rides a non-invocation prompt — D65 (human-typed-grants)', async () => {
    expect(grantFromPrompt('please run it with --auto and steps 1-3')).toBeNull()
    expect(grantFromPrompt('just a normal message')).toBeNull()
  })

  it('mints nothing from a path segment that merely ends in /build', async () => {
    expect(grantFromPrompt('rerun src/build --auto')).toBeNull()
    expect(grantFromPrompt('see ./build 1-3')).toBeNull()
    expect(grantFromPrompt('check ~/build --auto')).toBeNull()
    expect(grantFromPrompt('packages/app/build 1-3')).toBeNull()
    expect(grantFromPrompt('run tools/plumbbob:build --auto')).toBeNull()
    // …but an invocation the human typed mid-prompt still mints.
    expect(grantFromPrompt('when the check is green, /build --auto')).toBe('auto')
  })

  it('ignores an incidental range in prose after the invocation — D65 (human-typed-grants), arguments only', async () => {
    expect(grantFromPrompt('/build the 1-5 endpoints')).toBeNull()
    expect(grantFromPrompt('/build fix the issues from 2020-2024')).toBeNull()
    // …but prose never retro-cancels a flag the human led with: arguments are the
    // clean prefix, and a leading `--auto` is the literal ask.
    expect(grantFromPrompt('/build --auto please')).toBe('auto')
  })

  it('ignores a range on a later line of a multi-line prompt', async () => {
    expect(grantFromPrompt('/build\ncontext: tickets 1-3 are related')).toBeNull()
  })

  it('tolerates trailing sentence punctuation on an argument', async () => {
    expect(grantFromPrompt('/build 1-3.')).toBe('steps 1-3')
    expect(grantFromPrompt('/build --auto!')).toBe('auto')
  })

  it('reads through a bare step number to a grant, but an unrecognized flag ends the scan', async () => {
    expect(grantFromPrompt('/build 2 --auto')).toBe('auto') // a step number is argument-shaped
    // Only `--auto` is a sanctioned flag; any other `-` token ends the scan before a
    // following range can mint, so `--wip 2020-2024` grants nothing (a known residual
    // gap in minting grants from the human's literal prompt).
    expect(grantFromPrompt('/build --wip 2020-2024')).toBeNull()
    expect(grantFromPrompt('/build --draft 1-3')).toBeNull()
    expect(grantFromPrompt('/build 1-3 --auto')).toBe('steps 1-3') // sanctioned args still compose
  })
})

// Nine steps in three ranges: two that land their steps and a bare one between.
const RUN_PLAN = [
  '# Runs',
  '',
  '## Steps',
  '',
  ...Array.from({ length: 9 }, (_, i) => `${i + 1}. [ ] Step ${i + 1}, **done when:** it works`),
  '',
  '## Build ranges',
  '',
  '1. `/plumbbob:build 1-3`, **stop:** review the parser',
  "2. `/plumbbob:build 4`, **stop:** at step 4's pause, pick the label",
  '3. `/plumbbob:build 5-9`, **stop:** review the card',
  '',
].join('\n')

/** RUN_PLAN with the steps in `done` ticked. */
const runPlan = (done: ReadonlyArray<number> = []): string =>
  done.reduce((text, n) => text.replace(`${n}. [ ]`, `${n}. [x]`), RUN_PLAN)

/** The build as the hook reads it: RUN_PLAN, nothing in flight and no spike unless given. */
const read = (opts: { done?: ReadonlyArray<number>; inFlight?: number; spiking?: boolean; intent?: string } = {}): BuildRead => ({
  intent: opts.intent ?? runPlan(opts.done),
  inFlight: opts.inFlight ?? null,
  spiking: opts.spiking ?? false,
})

describe('mintFromPrompt — D96 (plan-names-the-grant)', () => {
  it('mints what is left of the range holding the next step, and marks the range', () => {
    expect(mintFromPrompt('/plumbbob:run', read(), null)).toEqual({ grant: 'steps 1-3', run: 1 })
    expect(mintFromPrompt('/plumbbob:run', read({ done: [1] }), null)).toEqual({ grant: 'steps 2-3', run: 1 })
    expect(mintFromPrompt('/plumbbob:run', read({ done: [1, 2, 3, 4] }), null)).toEqual({ grant: 'steps 5-9', run: 3 })
  })

  it('mints a partly landed range under a build order written mid-range', () => {
    const midRange = runPlan([1]).replace('## Build ranges', '## Build order\n\n2, 3, 4, 5, 6, 7, 8, 9\n\n## Build ranges')
    expect(mintFromPrompt('/plumbbob:run', read({ intent: midRange }), null)).toEqual({ grant: 'steps 2-3', run: 1 })
  })

  it('mints what is left of range N when a number is typed', () => {
    expect(mintFromPrompt('/plumbbob:run 3', read(), null)).toEqual({ grant: 'steps 5-9', run: 3 })
    expect(mintFromPrompt('/plumbbob:run 3.', read({ done: [5, 6] }), null)).toEqual({ grant: 'steps 7-9', run: 3 })
    expect(mintFromPrompt('/plumbbob:run 3, then review it', read(), null)).toEqual({ grant: 'steps 5-9', run: 3 })
  })

  it('counts the step in flight, so a run typed at its pause grants it with the rest of its range', () => {
    expect(mintFromPrompt('/plumbbob:run', read({ done: [1, 2, 3, 4], inFlight: 5 }), null)).toEqual({ grant: 'steps 5-9', run: 3 })
    expect(mintFromPrompt('/plumbbob:run 3', read({ done: [1, 2, 3, 4, 5, 6, 7, 8], inFlight: 9 }), null)).toEqual({ grant: 'steps 9', run: 3 })
  })

  it('mints nothing for a bare range, which builds its step to the pause, and marks nothing', () => {
    expect(mintFromPrompt('/plumbbob:run', read({ done: [1, 2, 3] }), null)).toEqual({ grant: null, run: null })
    expect(mintFromPrompt('/plumbbob:run 2', read(), null)).toEqual({ grant: null, run: null })
  })

  it('mints nothing for a run that refuses — D97 (run-refuses)', () => {
    const none = { grant: null, run: null }
    // A step in flight outside the range typed, and a spike open.
    expect(mintFromPrompt('/plumbbob:run 3', read({ inFlight: 2 }), null)).toEqual(none)
    expect(mintFromPrompt('/plumbbob:run', read({ spiking: true }), null)).toEqual(none)
    expect(mintFromPrompt('/plumbbob:run 1', read({ spiking: true }), null)).toEqual(none)
    // A landed range, a number the plan lacks, nothing left, and a plan without ranges.
    expect(mintFromPrompt('/plumbbob:run 1', read({ done: [1, 2, 3] }), null)).toEqual(none)
    expect(mintFromPrompt('/plumbbob:run 7', read(), null)).toEqual(none)
    expect(mintFromPrompt('/plumbbob:run', read({ done: [1, 2, 3, 4, 5, 6, 7, 8, 9] }), null)).toEqual(none)
    expect(mintFromPrompt('/plumbbob:run', read({ intent: RUN_PLAN.replace(/## Build ranges[\s\S]*$/, '') }), null)).toEqual(none)
  })

  it('mints nothing for a span or a list of ranges, a bare /run, or a path segment — D96 (plan-names-the-grant)', () => {
    const none = { grant: null, run: null }
    for (const prompt of ['/plumbbob:run 1-3', '/plumbbob:run 1,3', '/plumbbob:run 1, 3', '/run', '/run 3', 'tools/plumbbob:run 3', '/plumbbob:running']) {
      expect(mintFromPrompt(prompt, read(), null), prompt).toEqual(none)
    }
  })

  it('reads --auto beside the verb as nothing, never an auto grant', () => {
    expect(mintFromPrompt('/plumbbob:run --auto', read(), null)).toEqual({ grant: 'steps 1-3', run: 1 })
    expect(mintFromPrompt('/plumbbob:run --auto 3', read(), null)).toEqual({ grant: 'steps 5-9', run: 3 })
    expect(mintFromPrompt('/plumbbob:run 2 --auto', read(), null)).toEqual({ grant: null, run: null })
  })

  it('mints nothing for a run when the plan could not be read — C2 (hooks-never-wedge)', () => {
    expect(mintFromPrompt('/plumbbob:run', null, 3)).toEqual({ grant: null, run: null })
    // A build still mints from the prompt alone.
    expect(mintFromPrompt('/plumbbob:build 1-3', null, 3)).toEqual({ grant: 'steps 1-3', run: null })
  })

  it('mints a build exactly as grantFromPrompt does — C10 (build-unchanged)', () => {
    for (const prompt of ['/plumbbob:build 2-5', '/build --auto', '/plumbbob:build 20, 5-9', '/build 2', 'carry on']) {
      expect(mintFromPrompt(prompt, read(), null).grant, prompt).toBe(grantFromPrompt(prompt))
    }
  })

  it('reads whichever invocation comes first as the one the human fired', () => {
    expect(mintFromPrompt('/plumbbob:run 3, or else /build --auto', read(), null)).toEqual({ grant: 'steps 5-9', run: 3 })
    expect(mintFromPrompt('/plumbbob:build 1-2, then /plumbbob:run', read(), null)).toEqual({ grant: 'steps 1-2', run: null })
  })

  it('keeps the mark while a step of the marked range waits at its pause, and clears it otherwise — D16 (stop-card-held)', () => {
    expect(mintFromPrompt('looks good', read({ done: [1, 2, 3, 4], inFlight: 6 }), 3)).toEqual({ grant: null, run: 3 })
    expect(mintFromPrompt('/plumbbob:build 7-9', read({ done: [1, 2, 3, 4], inFlight: 6 }), 3)).toEqual({ grant: 'steps 7-9', run: 3 })
    expect(mintFromPrompt('looks good', read({ inFlight: 2 }), 3)).toEqual({ grant: null, run: null })
    expect(mintFromPrompt('looks good', read(), 3)).toEqual({ grant: null, run: null })
    expect(mintFromPrompt('looks good', read({ inFlight: 6 }), null)).toEqual({ grant: null, run: null })
    // A new run replaces the mark with its own range, or clears it for a bare one.
    expect(mintFromPrompt('/plumbbob:run', read({ done: [1, 2, 3, 4], inFlight: 6 }), 1)).toEqual({ grant: 'steps 5-9', run: 3 })
    expect(mintFromPrompt('/plumbbob:run', read({ done: [1, 2, 3], inFlight: 4 }), 1)).toEqual({ grant: null, run: null })
    // A run that refuses clears it too.
    expect(mintFromPrompt('/plumbbob:run 1', read({ inFlight: 6 }), 3)).toEqual({ grant: null, run: null })
  })
})

describe("applyTurn and a run's grant — D96 (plan-names-the-grant), D16 (stop-card-held)", () => {
  /** A started session whose plan is RUN_PLAN. */
  async function runSession(done: ReadonlyArray<number> = []): Promise<string> {
    const dir = await startedSession()
    writeFileSync(intentPath(dir), runPlan(done))
    return dir
  }

  const control = (path: string): string | null => (existsSync(path) ? readFileSync(path, 'utf8').trim() : null)

  it('mints the grant and the mark from the plan at the keystroke, and the next plain prompt clears both', async () => {
    const dir = await runSession()
    expect(applyTurn(dir, hookJson('/plumbbob:run'))).toBe(true)
    expect([control(grantPath(dir)), control(runPath(dir))]).toEqual(['steps 1-3', '1'])
    expect(readRun(dir)).toBe(1)
    applyTurn(dir, hookJson('carry on'))
    expect([control(grantPath(dir)), control(runPath(dir))]).toEqual([null, null])
  })

  it('leaves a minted grant as it was through a later edit to the ranges or the build order, and through a notice', async () => {
    const dir = await runSession()
    applyTurn(dir, hookJson('/plumbbob:run 3'))
    writeFileSync(intentPath(dir), runPlan().replace('5-9', '5-6').replace('## Build ranges', '## Build order\n\n9, 8, 7, 6, 5\n\n## Build ranges'))
    expect(applyTurn(dir, raw(captured('859f0678')))).toBe(false)
    expect([control(grantPath(dir)), control(runPath(dir))]).toEqual(['steps 5-9', '3'])
  })

  it('keeps the mark across a prompt at a pause inside its range, and drops it once the step lands', async () => {
    const dir = await runSession([1, 2, 3, 4])
    applyTurn(dir, hookJson('/plumbbob:run'))
    writeFileSync(stepPath(dir), '6\n') // a halt on trouble left step 6 at its pause
    applyTurn(dir, hookJson('looks good'))
    expect([control(grantPath(dir)), control(runPath(dir))]).toEqual([null, '3'])
    rmSync(stepPath(dir), { force: true })
    applyTurn(dir, hookJson('what next?'))
    expect(control(runPath(dir))).toBeNull()
  })

  it('mints nothing while a spike is open, or for a run typed while a step outside its range is in flight', async () => {
    const dir = await runSession()
    markSpike(dir)
    applyTurn(dir, hookJson('/plumbbob:run'))
    expect([control(grantPath(dir)), control(runPath(dir))]).toEqual([null, null])
    const other = await runSession()
    writeFileSync(stepPath(other), '2\n')
    applyTurn(other, hookJson('/plumbbob:run 3'))
    expect([control(grantPath(other)), control(runPath(other))]).toEqual([null, null])
  })

  it('mints nothing for a plan it cannot read, and the hook still exits 0 — C2 (hooks-never-wedge)', async () => {
    const dir = await runSession()
    applyTurn(dir, hookJson('/plumbbob:run'))
    rmSync(intentPath(dir), { force: true })
    const hook = runCli(dir, ['turn'], {}, hookJson('/plumbbob:run'))
    expect(hook.status).toBe(0)
    expect([control(grantPath(dir)), control(runPath(dir))]).toEqual([null, null])
    expect(control(turnPath(dir))).toBe('2')
  })

  it('mints through the real hook on stdin', async () => {
    const dir = await runSession()
    const hook = runCli(dir, ['turn'], {}, hookJson('/plumbbob:run 3'))
    expect(hook.status).toBe(0)
    expect([control(grantPath(dir)), control(runPath(dir))]).toEqual(['steps 5-9', '3'])
  })

  it('git-excludes the mark beside the grant, so no checkpoint sweeps it into a commit', async () => {
    const dir = await startedSession()
    const exclude = readFileSync(join(realpathSync(dir), '.git', 'info', 'exclude'), 'utf8').split('\n')
    expect(exclude).toContain('.plumbbob/RUN')
  })
})

describe('applyTurn', () => {
  it('creates TURN at 1 on the first tick and clears GRANT for a plain prompt', async () => {
    const dir = await startedSession()
    expect(applyTurn(dir, hookJson('hello'))).toBe(true)
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('1')
    expect(existsSync(grantPath(dir))).toBe(false)
  })

  it('increments TURN monotonically across prompts', async () => {
    const dir = await startedSession()
    applyTurn(dir, hookJson('one'))
    applyTurn(dir, hookJson('two'))
    applyTurn(dir, hookJson('three'))
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('3')
  })

  it('mints GRANT from a typed grant, then clears it on the next plain turn (one-turn lifetime)', async () => {
    const dir = await startedSession()
    applyTurn(dir, hookJson('/build --auto'))
    expect(readFileSync(grantPath(dir), 'utf8').trim()).toBe('auto')
    applyTurn(dir, hookJson('carry on'))
    expect(existsSync(grantPath(dir))).toBe(false)
  })

  it('still ticks TURN and clears GRANT on malformed input, without throwing', async () => {
    const dir = await startedSession()
    applyTurn(dir, hookJson('/build 1-3')) // seed a grant to prove it clears
    expect(() => applyTurn(dir, 'not json at all')).not.toThrow()
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('2')
    expect(existsSync(grantPath(dir))).toBe(false)
  })

  it('is a silent no-op with no active session — no ledger grows', async () => {
    const dir = makeTempRepo() // no `start`, so no STATE above cwd
    expect(applyTurn(dir, hookJson('/build --auto'))).toBe(false)
    expect(existsSync(turnPath(dir))).toBe(false)
    expect(existsSync(grantPath(dir))).toBe(false)
  })
})

/** One prompt the 2026-10-17 spike captured, labeled by who sent it: the probe's typed text, or the harness. */
type Captured = { readonly from: 'human' | 'notice'; readonly payload: { readonly prompt: string; readonly prompt_id: string } }

// The 29 UserPromptSubmit payloads step 1's spike captured across five
// sessions on Claude Code 2.1.283 and 2.1.302, in the order the hook got them,
// paths trimmed. Every prompt the probe typed opens on "Hook probe" or "Queued
// line"; the other 13 are the harness reporting a background job.
const CAPTURED = JSON.parse(
  readFileSync(new URL('./fixtures/notice-payloads.json', import.meta.url), 'utf8'),
) as ReadonlyArray<Captured>

/** The captured payload whose prompt id starts with `id`, at its `nth` appearance. */
function captured(id: string, nth = 0): Captured {
  const found = CAPTURED.filter((c) => c.payload.prompt_id.startsWith(id))[nth]
  if (found === undefined) throw new Error(`no captured prompt ${id}`)
  return found
}

/** The hook's stdin for a captured prompt. */
const raw = (c: Captured): string => JSON.stringify(c.payload)

/** Record a pause card as the ending printed in the current turn. */
function recordCard(dir: string): void {
  writeRelay(dir, { tier: 'decision', render: 'card', command: 'plumbbob handoff --full', text: '**Now**: Step 2 of 3 - Second\n\n' })
}

describe('a background notice is not a human turn — D90 (notice-not-turn)', () => {
  it("holds 16 typed prompts and 13 notices, the spike's whole capture", () => {
    expect(CAPTURED).toHaveLength(29)
    expect(CAPTURED.filter((c) => c.from === 'human')).toHaveLength(16)
  })

  it('sorts every captured prompt the way the probe sent it, by its opening frame alone', () => {
    for (const c of CAPTURED) expect(isNotice(c.payload.prompt), c.payload.prompt.slice(0, 40)).toBe(c.from === 'notice')
  })

  it('reads a frame only at the first character, so a typed prompt that quotes one still counts', () => {
    expect(isNotice('why did <task-notification> fire twice?')).toBe(false)
    expect(isNotice(' <task-notification>')).toBe(false)
    expect(isNotice('<agent-message>')).toBe(false) // the harness frame always carries a `from`
    expect(isNotice('')).toBe(false)
  })

  it('replays the capture in order: only a typed prompt ticks TURN or rewrites GRANT', async () => {
    const dir = await startedSession()
    let typed = 0
    for (const c of CAPTURED) {
      const before = existsSync(grantPath(dir)) ? readFileSync(grantPath(dir), 'utf8') : null
      expect(applyTurn(dir, raw(c))).toBe(c.from === 'human')
      if (c.from === 'human') typed += 1
      expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe(String(typed))
      const after = existsSync(grantPath(dir)) ? readFileSync(grantPath(dir), 'utf8').trim() : null
      if (c.from === 'notice') expect(after).toBe(before === null ? null : before.trim())
      else expect(after).toBe(grantFromPrompt(c.payload.prompt))
    }
    expect(typed).toBe(16)
  })

  it('keeps a range typed while a notice was queued, the field failure in miniature', async () => {
    // Phase 6: the notice queued first, the human typed `/build 2-3` after it,
    // and the notice's hook call came last, at delivery. Today it cleared the range.
    const dir = await startedSession()
    applyTurn(dir, raw(captured('71c59aa3', 0)))
    applyTurn(dir, raw(captured('71c59aa3', 1)))
    expect(readFileSync(grantPath(dir), 'utf8').trim()).toBe('steps 2-3')
    expect(applyTurn(dir, raw(captured('71c59aa3', 2)))).toBe(false)
    expect(readFileSync(grantPath(dir), 'utf8').trim()).toBe('steps 2-3')
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('2')
  })

  it("leaves TURN where a step's entry stamp put it, so the latch still waits for the human", async () => {
    const dir = await startedSession()
    applyTurn(dir, raw(captured('382a3db9', 0))) // the typed prompt that started the step's turn
    const stamp = readFileSync(turnPath(dir), 'utf8')
    for (const id of ['859f0678', '49adbb5e', 'ce1b20d1', 'd8ae1cc7', '4729f6c4']) applyTurn(dir, raw(captured(id)))
    expect(readFileSync(turnPath(dir), 'utf8')).toBe(stamp)
  })

  it('clears RELAY for a notice that starts a turn of its own, under a fresh prompt id', async () => {
    const dir = await startedSession()
    applyTurn(dir, raw(captured('8fa388a6'))) // phase 2: the typed prompt that launched the job
    recordCard(dir)
    applyTurn(dir, raw(captured('859f0678'))) // the job's notice, idle, so a turn of its own
    expect(existsSync(relayPath(dir))).toBe(false)
  })

  it("leaves RELAY alone for a notice folded into the running turn, under that turn's prompt id", async () => {
    // Phase 5: the notice fired mid-turn under the typed prompt's own id, one
    // second before that turn's Stop, which still has the ending to judge.
    const dir = await startedSession()
    applyTurn(dir, raw(captured('382a3db9', 0)))
    recordCard(dir)
    expect(applyTurn(dir, raw(captured('382a3db9', 1)))).toBe(false)
    expect(readRelay(dir)?.render).toBe('card')
  })

  it("reads a notice folded into a notice's own turn the same way", async () => {
    const dir = await startedSession()
    applyTurn(dir, hookJson('carry on'))
    applyTurn(dir, JSON.stringify({ prompt_id: 'n-1', prompt: '<task-notification>\n</task-notification>' }))
    recordCard(dir) // printed in the turn the notice started
    applyTurn(dir, JSON.stringify({ prompt_id: 'n-1', prompt: '<task-notification>\n</task-notification>' }))
    expect(readRelay(dir)?.render).toBe('card')
  })

  it('clears RELAY for a notice with no prompt id, and records none, since nothing ties it to the running turn', async () => {
    const dir = await startedSession()
    applyTurn(dir, JSON.stringify({ prompt_id: 'p-1', prompt: 'build it' }))
    expect(readFileSync(promptPath(dir), 'utf8').trim()).toBe('p-1')
    recordCard(dir)
    applyTurn(dir, JSON.stringify({ prompt: '<task-notification>\n</task-notification>' }))
    expect(existsSync(relayPath(dir))).toBe(false)
    expect(existsSync(promptPath(dir))).toBe(false)
  })

  it('emits no in-flight nudge for a notice, through the real hook on stdin', async () => {
    const dir = await startedSession()
    writeFileSync(stepPath(dir), '2\n')
    const notice = runCli(dir, ['turn'], {}, raw(captured('859f0678')))
    expect(notice.status).toBe(0)
    expect(notice.stdout).toBe('')
    const typed = runCli(dir, ['turn'], {}, raw(captured('8fa388a6')))
    expect(typed.stdout).toContain('step 2 is in flight')
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('1')
  })
})

/** The additionalContext line `turnContext` emits for a session and a prompt, or '' when it emits none. */
function nudgeOf(dir: string, prompt = ''): string {
  const out = turnContext(dir, prompt)
  return out === null ? '' : (JSON.parse(out) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext
}

// Two steps, step 1 landed, each in a range that lands its steps, so range 1's
// stop card can wait for its reply.
const STOPPING = `# The turn ledger

## Steps

1. [x] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`

## Build ranges

1. \`/plumbbob:build 1-1\`, **stop:** review the first
2. \`/plumbbob:build 2-2\`, **stop:** review the second
`

describe('turnContext — the nudge, D64 (approval-latch) amended: guidance, not silence', () => {
  it('is null with no step in flight and no stop card waiting (session started, none entered)', async () => {
    const dir = await startedSession()
    expect(turnContext(dir)).toBeNull()
  })

  it('is null outside a session', () => {
    expect(turnContext(makeTempRepo())).toBeNull()
  })

  it('emits one UserPromptSubmit additionalContext line naming the in-flight step and the park verb', async () => {
    const dir = await startedSession()
    writeFileSync(stepPath(dir), '2\n') // a step entered, as `build 2` would mark it
    const out = turnContext(dir)
    expect(out).not.toBeNull()
    if (out === null) return
    const parsed = JSON.parse(out) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string }
    }
    expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit')
    expect(parsed.hookSpecificOutput.additionalContext).toContain('step 2 is in flight')
    expect(parsed.hookSpecificOutput.additionalContext).toContain('plumbbob park "')
    expect(parsed.hookSpecificOutput.additionalContext).toContain('plumbbob checkpoint 2')
    // A tangent that reaches the session as chat never loads the park skill, so
    // the nudge carries the driver-turn rule itself: the park's block is the turn.
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      'relay the block it prints whole, with nothing written around it',
    )
  })

  it('states both halves of answer-then-park: a tangent alone ends on the block, a question beside it is answered first', async () => {
    const dir = await startedSession()
    writeFileSync(stepPath(dir), '2\n')
    const context = nudgeOf(dir)
    // Only a tangent: the park's block is the whole turn, the rule df9b393 set.
    expect(context).toContain('relay the block it prints whole, with nothing written around it, since that block is the whole turn')
    // A tangent beside a question: the answer first, the block after it, nothing after the block.
    expect(context).toContain('a message that also asks something: answer the question first')
    expect(context).toContain("then relay the park's block after the answer and write nothing after it")
    // The block already ends on the pointer back at the step, so no second ending follows it.
    expect(context).toContain('run no `plumbbob handoff` after it')
  })

  it('reads a message at a pause whose card has shown as the reply, answered in the model\'s words, with no card — D110 (reply-after-the-card)', async () => {
    const dir = await startedSession()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(pausePath(dir), '2\n') // step 2's card has shown
    const context = nudgeOf(dir)
    expect(context).toContain("step 2's card has shown, and this message is the human's reply to it")
    expect(context).toContain('An approval lands the step: run `plumbbob checkpoint 2`')
    expect(context).toContain('Anything else is answered in your own words')
    expect(context).toContain('write `.plumbbob/detail.md` again so the record matches what lands')
    expect(context).toContain('Print no card for it: run `plumbbob handoff` and end the turn on the one line it prints')
    expect(context).toContain(
      'Only when the human asks to see the card again, run `plumbbob handoff --full` and paste its output exactly as it printed, as the whole turn',
    )
    // Feedback at a pause is not a tangent: the park line would swallow it.
    expect(context).not.toContain('a new idea or tangent is a park, not an edit')
    expect(context).toContain('A tangent the human hands you is still a park')
  })

  it('keeps the park nudge while the stamp names another card: the boundary before, or another step', async () => {
    const dir = await startedSession()
    writeFileSync(stepPath(dir), '2\n')
    for (const stamp of ['landed 1\n', '1\n']) {
      writeFileSync(pausePath(dir), stamp)
      expect(nudgeOf(dir)).toContain('step 2 is in flight')
    }
  })

  it("reads a message at a stop card waiting for its reply the same way, with handoff's --stop", async () => {
    const dir = await startedSession()
    writeFileSync(intentPath(dir), STOPPING)
    writeFileSync(stopPath(dir), '1 3\n') // range 1's card printed in turn 3
    writeFileSync(detailPath(dir), '# Detail · Range 1 · review the first\n')
    const context = nudgeOf(dir)
    expect(context).toContain("range 1 of 2's stop card has shown, and this message is the human's reply to it")
    expect(context).toContain('then run `plumbbob harvest` and relay its ending')
    expect(context).toContain("(a lean is its line under the detail file's `## Harvest`)")
    expect(context).toContain('run `plumbbob handoff --stop` and end the turn on the one line it prints')
    expect(context).toContain(
      'Only when the human asks to see the card again, run `plumbbob handoff --stop --full` and paste its output exactly as it printed, as the whole turn',
    )
    // The record clears the detail file, and the wait ends with it.
    writeFileSync(detailPath(dir), '')
    expect(turnContext(dir)).toBeNull()
  })

  it('answers a request to see the card with the one way to relay it: --full, exactly as it printed, as the whole turn', async () => {
    // In a fresh session the model ran `--full` on `show the pause` and then
    // retyped the card behind a line of its own, three runs in five of the
    // 2026-10-27 eval, since nothing in its context said how to relay it.
    const dir = await startedSession()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(pausePath(dir), '2\n')
    for (const prompt of ['show the pause', 'Show the pause.', 'can you show me the card again?']) {
      const context = nudgeOf(dir, prompt)
      expect(context, prompt).toBe(
        "plumbbob: the human asked to see step 2's card again. " +
          'Run `plumbbob handoff --full` and paste its output exactly as it printed, as the whole turn: ' +
          'no line before it, nothing after it, and nothing in it retyped, reworded, or cut.',
      )
    }
    // Any other message at the pause is still the reply.
    expect(nudgeOf(dir, 'why does the bucket refill on read?')).toContain("step 2's card has shown")
    // Mid-build, before any card, the request is no request for a card.
    writeFileSync(pausePath(dir), 'landed 1\n')
    expect(nudgeOf(dir, 'show the pause')).toContain('step 2 is in flight')
  })

  it('answers a request to see the stop card the same way, with --stop --full', async () => {
    const dir = await startedSession()
    writeFileSync(intentPath(dir), STOPPING)
    writeFileSync(stopPath(dir), '1 3\n')
    writeFileSync(detailPath(dir), '# Detail · Range 1 · review the first\n')
    expect(nudgeOf(dir, 'show the stop')).toBe(
      "plumbbob: the human asked to see range 1 of 2's stop card again. " +
        'Run `plumbbob handoff --stop --full` and paste its output exactly as it printed, as the whole turn: ' +
        'no line before it, nothing after it, and nothing in it retyped, reworded, or cut.',
    )
  })

  it('goes quiet again once the step checkpoints (STEP marker gone)', async () => {
    const dir = await startedSession()
    writeFileSync(stepPath(dir), '2\n')
    expect(turnContext(dir)).not.toBeNull()
    // checkpoint clears STEP and stamps the boundary; the nudge must stop so the boundary reads as guidance-free
    rmSync(stepPath(dir), { force: true })
    writeFileSync(pausePath(dir), 'landed 2\n')
    expect(turnContext(dir)).toBeNull()
  })
})

describe('turn (the verb)', () => {
  it('exits 0 and skips the fd-0 read on an interactive TTY (never wedges a prompt)', async () => {
    const dir = await startedSession()
    const stdin = process.stdin as unknown as { isTTY?: boolean }
    const had = stdin.isTTY
    stdin.isTTY = true // a terminal never sends EOF: the read must be skipped, not hung
    try {
      expect(turn(dir, [])).toBe(0)
    } finally {
      stdin.isTTY = had
    }
    // The TTY path reads '' → the tick still lands and the grant clears.
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('1')
    expect(existsSync(grantPath(dir))).toBe(false)
  })

  it('rides the in-flight nudge on stdout as the hook additionalContext (silent when no step)', async () => {
    const dir = await startedSession()
    const stdin = process.stdin as unknown as { isTTY?: boolean }
    const had = stdin.isTTY
    stdin.isTTY = true
    try {
      expect(captureIo(() => turn(dir, [])).stdout).toBe('') // no step in flight → silent
      writeFileSync(stepPath(dir), '3\n')
      const loud = captureIo(() => turn(dir, []))
      expect(loud.stdout).toContain('"hookEventName":"UserPromptSubmit"')
      expect(loud.stdout).toContain('step 3 is in flight')
    } finally {
      stdin.isTTY = had
    }
  })

  it('reads the prompt off the real hook payload, so a request to see the card gets the show nudge', async () => {
    const dir = await startedSession()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(pausePath(dir), '2\n')
    const shown = runCli(dir, ['turn'], {}, JSON.stringify({ prompt: 'show the pause', cwd: dir }))
    expect(shown.status).toBe(0)
    expect(shown.stdout).toContain("the human asked to see step 2's card again")
    const asked = runCli(dir, ['turn'], {}, JSON.stringify({ prompt: 'why 429?', cwd: dir }))
    expect(asked.stdout).toContain("step 2's card has shown, and this message is the human's reply to it")
  })

  it("ticks the session the payload's cwd names, and its own when the payload names none that holds one", async () => {
    const dir = await startedSession()
    const elsewhere = makeTempRepo() // no session here
    expect(runCli(elsewhere, ['turn'], {}, JSON.stringify({ prompt: 'carry on', cwd: dir })).status).toBe(0)
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('1')
    // A cwd that holds no session, as a payload replayed from another machine does, falls back to the process's.
    expect(runCli(dir, ['turn'], {}, JSON.stringify({ prompt: 'carry on', cwd: '/nowhere/at/all' })).status).toBe(0)
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('2')
  })
})

describe('wiring', () => {
  it('lists turn in help, marked as machinery, not a user verb', async () => {
    const help = formatHelp()
    expect(help).toMatch(/turn.*machinery/)
  })

  it('registers a UserPromptSubmit hook that runs `plumbbob turn`', async () => {
    const path = fileURLToPath(new URL('../../../hooks/hooks.json', import.meta.url))
    const hooks = JSON.parse(readFileSync(path, 'utf8')) as {
      hooks: { UserPromptSubmit?: ReadonlyArray<{ hooks: ReadonlyArray<{ command: string }> }> }
    }
    const commands = (hooks.hooks.UserPromptSubmit ?? []).flatMap((group) => group.hooks.map((h) => h.command))
    expect(commands.some((c) => c.includes('plumbbob') && /\bturn\b/.test(c))).toBe(true)
  })
})
