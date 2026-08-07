import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { applyTurn, grantFromPrompt, stepInFlightContext, turn } from '../turn.ts'
import { start } from '../start.ts'
import { grantPath, stepPath, turnPath } from '../../lib/sidecar.ts'
import { formatHelp } from '../../cli-core.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
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
    expect(grantFromPrompt('/plumbbob:build 2-5')).toBe('range 5')
  })

  it('mints `range M` from a N-M range, carrying the ceiling', async () => {
    expect(grantFromPrompt('/build 1-3')).toBe('range 3')
  })

  it('lets a bounded range beat --auto, in either order (bounded wins)', async () => {
    expect(grantFromPrompt('/build --auto 1-3')).toBe('range 3')
    expect(grantFromPrompt('/build 1-3 --auto')).toBe('range 3')
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
    expect(grantFromPrompt('/build 1-3.')).toBe('range 3')
    expect(grantFromPrompt('/build --auto!')).toBe('auto')
  })

  it('reads through a bare step number to a grant, but an unrecognized flag ends the scan', async () => {
    expect(grantFromPrompt('/build 2 --auto')).toBe('auto') // a step number is argument-shaped
    // Only `--auto` is a sanctioned flag; any other `-` token ends the scan before a
    // following range can mint — so `--wip 2020-2024` grants nothing (a known residual
    // gap in minting grants from the human's literal prompt).
    expect(grantFromPrompt('/build --wip 2020-2024')).toBeNull()
    expect(grantFromPrompt('/build --draft 1-3')).toBeNull()
    expect(grantFromPrompt('/build 1-3 --auto')).toBe('range 3') // sanctioned args still compose
  })
})

describe('applyTurn', () => {
  it('creates TURN at 1 on the first tick and clears GRANT for a plain prompt', async () => {
    const dir = await startedSession()
    expect(applyTurn(dir, hookJson('hello'))).toBe(0)
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
    expect(applyTurn(dir, hookJson('/build --auto'))).toBe(0)
    expect(existsSync(turnPath(dir))).toBe(false)
    expect(existsSync(grantPath(dir))).toBe(false)
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
    stdin.isTTY = true // a terminal never sends EOF — the read must be skipped, not hung
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
