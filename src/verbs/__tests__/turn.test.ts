import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { applyTurn, grantFromPrompt, isNotice, stepInFlightContext, turn } from '../turn.ts'
import { start } from '../start.ts'
import { grantPath, promptPath, readRelay, relayPath, stepPath, turnPath, writeRelay } from '../../lib/sidecar.ts'
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

describe('stepInFlightContext — the park nudge, D64 (approval-latch) amended: guidance, not silence', () => {
  it('is null when no step is in flight (session started, none entered)', async () => {
    const dir = await startedSession()
    expect(stepInFlightContext(dir)).toBeNull()
  })

  it('is null outside a session', () => {
    expect(stepInFlightContext(makeTempRepo())).toBeNull()
  })

  it('emits one UserPromptSubmit additionalContext line naming the in-flight step and the park verb', async () => {
    const dir = await startedSession()
    writeFileSync(stepPath(dir), '2\n') // a step entered, as `build 2` would mark it
    const out = stepInFlightContext(dir)
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
    const out = stepInFlightContext(dir) ?? ''
    const context = (JSON.parse(out) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext
    // Only a tangent: the park's block is the whole turn, the rule df9b393 set.
    expect(context).toContain('relay the block it prints whole, with nothing written around it, since that block is the whole turn')
    // A tangent beside a question: the answer first, the block after it, nothing after the block.
    expect(context).toContain('a message that also asks something: answer the question first')
    expect(context).toContain("then relay the park's block after the answer and write nothing after it")
    // The block already ends on the pointer back at the step, so no second ending follows it.
    expect(context).toContain('run no `plumbbob handoff` after it')
  })

  it('goes quiet again once the step checkpoints (STEP marker gone)', async () => {
    const dir = await startedSession()
    writeFileSync(stepPath(dir), '2\n')
    expect(stepInFlightContext(dir)).not.toBeNull()
    // checkpoint clears STEP; the nudge must stop so the boundary reads as guidance-free
    rmSync(stepPath(dir), { force: true })
    expect(stepInFlightContext(dir)).toBeNull()
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
