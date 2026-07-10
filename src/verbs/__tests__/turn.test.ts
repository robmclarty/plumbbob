import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { applyTurn, grantFromPrompt, turn } from '../turn.ts'
import { start } from '../start.ts'
import { grantPath, turnPath } from '../../lib/sidecar.ts'
import { formatHelp } from '../../cli-core.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

function startedSession(): string {
  const dir = makeTempRepo()
  captureIo(() => start(dir, ['The turn ledger']))
  return dir
}

const hookJson = (prompt: string): string => JSON.stringify({ prompt })

describe('grantFromPrompt', () => {
  it('mints `auto` from a literal `/pb-build --auto`', () => {
    expect(grantFromPrompt('/pb-build --auto')).toBe('auto')
  })

  it('honors the namespaced `/plumbbob:pb-build` form', () => {
    expect(grantFromPrompt('/plumbbob:pb-build --auto')).toBe('auto')
    expect(grantFromPrompt('/plumbbob:pb-build 2-5')).toBe('range 5')
  })

  it('mints `range M` from a N-M range, carrying the ceiling', () => {
    expect(grantFromPrompt('/pb-build 1-3')).toBe('range 3')
  })

  it('lets a bounded range beat --auto, in either order (bounded wins)', () => {
    expect(grantFromPrompt('/pb-build --auto 1-3')).toBe('range 3')
    expect(grantFromPrompt('/pb-build 1-3 --auto')).toBe('range 3')
  })

  it('mints nothing from a bare invocation or a single step', () => {
    expect(grantFromPrompt('/pb-build')).toBeNull()
    expect(grantFromPrompt('/pb-build 2')).toBeNull()
  })

  it('mints nothing when the flag/range rides a non-invocation prompt (D65)', () => {
    expect(grantFromPrompt('please run it with --auto and steps 1-3')).toBeNull()
    expect(grantFromPrompt('just a normal message')).toBeNull()
  })

  it('ignores an incidental range in prose after the invocation (D65 — arguments only)', () => {
    expect(grantFromPrompt('/pb-build the 1-5 endpoints')).toBeNull()
    expect(grantFromPrompt('/pb-build fix the issues from 2020-2024')).toBeNull()
    // …but prose never retro-cancels a flag the human led with: arguments are the
    // clean prefix, and a leading `--auto` is the literal ask.
    expect(grantFromPrompt('/pb-build --auto please')).toBe('auto')
  })

  it('ignores a range on a later line of a multi-line prompt', () => {
    expect(grantFromPrompt('/pb-build\ncontext: tickets 1-3 are related')).toBeNull()
  })

  it('tolerates trailing sentence punctuation on an argument', () => {
    expect(grantFromPrompt('/pb-build 1-3.')).toBe('range 3')
    expect(grantFromPrompt('/pb-build --auto!')).toBe('auto')
  })

  it('reads through a step number or another flag to reach a grant argument', () => {
    expect(grantFromPrompt('/pb-build 2 --auto')).toBe('auto')
  })
})

describe('applyTurn', () => {
  it('creates TURN at 1 on the first tick and clears GRANT for a plain prompt', () => {
    const dir = startedSession()
    expect(applyTurn(dir, hookJson('hello'))).toBe(0)
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('1')
    expect(existsSync(grantPath(dir))).toBe(false)
  })

  it('increments TURN monotonically across prompts', () => {
    const dir = startedSession()
    applyTurn(dir, hookJson('one'))
    applyTurn(dir, hookJson('two'))
    applyTurn(dir, hookJson('three'))
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('3')
  })

  it('mints GRANT from a typed grant, then clears it on the next plain turn (one-turn lifetime)', () => {
    const dir = startedSession()
    applyTurn(dir, hookJson('/pb-build --auto'))
    expect(readFileSync(grantPath(dir), 'utf8').trim()).toBe('auto')
    applyTurn(dir, hookJson('carry on'))
    expect(existsSync(grantPath(dir))).toBe(false)
  })

  it('still ticks TURN and clears GRANT on malformed input, without throwing', () => {
    const dir = startedSession()
    applyTurn(dir, hookJson('/pb-build 1-3')) // seed a grant to prove it clears
    expect(() => applyTurn(dir, 'not json at all')).not.toThrow()
    expect(readFileSync(turnPath(dir), 'utf8').trim()).toBe('2')
    expect(existsSync(grantPath(dir))).toBe(false)
  })

  it('is a silent no-op with no active session — no ledger grows', () => {
    const dir = makeTempRepo() // no `start`, so no STATE above cwd
    expect(applyTurn(dir, hookJson('/pb-build --auto'))).toBe(0)
    expect(existsSync(turnPath(dir))).toBe(false)
    expect(existsSync(grantPath(dir))).toBe(false)
  })
})

describe('turn (the verb)', () => {
  it('exits 0 and skips the fd-0 read on an interactive TTY (never wedges a prompt, C3)', () => {
    const dir = startedSession()
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
})

describe('wiring', () => {
  it('lists turn in help, marked as machinery, not a user verb', () => {
    const help = formatHelp()
    expect(help).toMatch(/turn.*machinery/)
  })

  it('registers a UserPromptSubmit hook that runs `plumbbob turn`', () => {
    const path = fileURLToPath(new URL('../../../hooks/hooks.json', import.meta.url))
    const hooks = JSON.parse(readFileSync(path, 'utf8')) as {
      hooks: { UserPromptSubmit?: ReadonlyArray<{ hooks: ReadonlyArray<{ command: string }> }> }
    }
    const commands = (hooks.hooks.UserPromptSubmit ?? []).flatMap((group) => group.hooks.map((h) => h.command))
    expect(commands.some((c) => c.includes('plumbbob') && /\bturn\b/.test(c))).toBe(true)
  })
})
