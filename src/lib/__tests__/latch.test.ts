import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkLatch, evaluateLatch, parseGrant, type LatchInput } from '../latch.ts'
import { grantPath, tickPath, turnPath } from '../sidecar.ts'
import { setLocalSetting } from '../settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

// The strictest baseline: every row's allow condition false, so evaluation falls
// through to row 6. Each test flips exactly the input its row reads.
const LATCHED: LatchInput = { isTTY: false, turn: 2, tick: 2, auto: false, grant: null, step: 1 }

describe('evaluateLatch — the six-row matrix, first hit wins', () => {
  it('row 1: a TTY stdin allows — a human at the keyboard is their own approval', () => {
    expect(evaluateLatch({ ...LATCHED, isTTY: true }).allow).toBe(true)
  })

  it('row 2: an absent TURN allows — the ledger is dormant (no hooks)', () => {
    expect(evaluateLatch({ ...LATCHED, turn: null }).allow).toBe(true)
  })

  it('row 2: an absent TICK allows — a hand-built diff has no stamped entry', () => {
    expect(evaluateLatch({ ...LATCHED, tick: null }).allow).toBe(true)
  })

  it('row 3: the standing settings grant allows (D27)', () => {
    expect(evaluateLatch({ ...LATCHED, auto: true }).allow).toBe(true)
  })

  it('row 4: a one-turn `auto` grant allows (D65)', () => {
    expect(evaluateLatch({ ...LATCHED, grant: { kind: 'auto' } }).allow).toBe(true)
  })

  it('row 4: a range grant allows a step at or under its ceiling', () => {
    const grant = { kind: 'range', ceiling: 3 } as const
    expect(evaluateLatch({ ...LATCHED, grant, step: 3 }).allow).toBe(true)
    expect(evaluateLatch({ ...LATCHED, grant, step: 1 }).allow).toBe(true)
  })

  it('row 4: a range grant refuses past its ceiling, with the top-of-range affordance', () => {
    const decision = evaluateLatch({ ...LATCHED, grant: { kind: 'range', ceiling: 3 }, step: 4 })
    expect(decision.allow).toBe(false)
    if (!decision.allow) {
      expect(decision.reason).toBe('ceiling')
      expect(decision.message).toContain('the range you granted ends at step 3')
      expect(decision.message).toContain('re-fire to continue')
    }
  })

  it('row 4 precedes row 5: the ceiling refuses even when a human turn intervened', () => {
    // First hit wins: a freshly minted `range M` speaks for this turn, and a step
    // past M refuses at row 4 before the turn comparison is ever reached.
    const decision = evaluateLatch({ ...LATCHED, turn: 3, tick: 2, grant: { kind: 'range', ceiling: 1 }, step: 2 })
    expect(decision.allow).toBe(false)
    if (!decision.allow) expect(decision.reason).toBe('ceiling')
  })

  it('row 4: a range grant does not speak to a plan checkpoint — falls through', () => {
    const grant = { kind: 'range', ceiling: 3 } as const
    // With no intervening turn the plan still refuses at row 6…
    expect(evaluateLatch({ ...LATCHED, grant, step: null }).allow).toBe(false)
    // …and with one, row 5 allows it.
    expect(evaluateLatch({ ...LATCHED, grant, step: null, turn: 3 }).allow).toBe(true)
  })

  it('row 5: a human turn since entry allows', () => {
    expect(evaluateLatch({ ...LATCHED, turn: 3, tick: 2 }).allow).toBe(true)
  })

  it('row 6: no turn since entry refuses with the pause affordance', () => {
    const decision = evaluateLatch(LATCHED)
    expect(decision.allow).toBe(false)
    if (!decision.allow) {
      expect(decision.reason).toBe('no-turn')
      expect(decision.message).toContain('no human turn since this step began')
      expect(decision.message).toContain('This is the')
      expect(decision.message).toContain("The human's approval on")
      expect(decision.message).toContain('`/pb-build` only starts the next step')
      expect(decision.message).toContain('`/pb-build --auto`')
      expect(decision.message).toContain('`auto: true` in settings.local.json')
    }
  })

  it('row 6: a plan refusal (step null) speaks plan, not step', () => {
    const decision = evaluateLatch({ ...LATCHED, step: null })
    expect(decision.allow).toBe(false)
    if (!decision.allow) {
      expect(decision.reason).toBe('no-turn')
      expect(decision.message).toContain('no human turn since `start` stamped this plan')
      expect(decision.message).toContain('present the plan')
      expect(decision.message).not.toContain('self-review')
    }
  })

  it('row 6: a stale TICK above TURN also refuses — only a strictly later turn allows', () => {
    // TURN < TICK cannot arise from the verbs (TICK is copied from TURN), but a
    // mangled ledger must land on the safe side of the latch, not sneak past it.
    const decision = evaluateLatch({ ...LATCHED, turn: 1, tick: 2 })
    expect(decision.allow).toBe(false)
    if (!decision.allow) expect(decision.reason).toBe('no-turn')
  })
})

describe('parseGrant', () => {
  it('parses the two minted forms, trailing newline and all', () => {
    expect(parseGrant('auto\n')).toEqual({ kind: 'auto' })
    expect(parseGrant('range 3\n')).toEqual({ kind: 'range', ceiling: 3 })
    expect(parseGrant('range 12')).toEqual({ kind: 'range', ceiling: 12 })
  })

  it('malformed content contributes nothing (D27) — no grant, never an error', () => {
    expect(parseGrant('')).toBeNull()
    expect(parseGrant('yes')).toBeNull()
    expect(parseGrant('range')).toBeNull()
    expect(parseGrant('range x')).toBeNull()
    expect(parseGrant('range -1')).toBeNull()
    expect(parseGrant('auto range 3')).toBeNull()
  })
})

// checkLatch reads the real files. stdin.isTTY is pinned false so the suite
// behaves the same under an interactive runner as under CI.
describe('checkLatch — gathering from the worktree', () => {
  function latchedRepo(): string {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writeFileSync(turnPath(dir), '2\n')
    writeFileSync(tickPath(dir), '2\n')
    return dir
  }

  function withoutTty<T>(run: () => T): T {
    const stdin = process.stdin as unknown as { isTTY?: boolean }
    const hadTty = stdin.isTTY
    stdin.isTTY = false
    try {
      return run()
    } finally {
      stdin.isTTY = hadTty
    }
  }

  it('reads TURN/TICK and refuses when no turn intervened', () => {
    const decision = withoutTty(() => checkLatch(latchedRepo(), 1))
    expect(decision.allow).toBe(false)
  })

  it('a garbage TURN reads as dormant — the latch never wedges on a mangled ledger', () => {
    const dir = latchedRepo()
    writeFileSync(turnPath(dir), 'not a number\n')
    expect(withoutTty(() => checkLatch(dir, 1)).allow).toBe(true)
  })

  it('reads the one-turn GRANT', () => {
    const dir = latchedRepo()
    writeFileSync(grantPath(dir), 'auto\n')
    expect(withoutTty(() => checkLatch(dir, 1)).allow).toBe(true)
  })

  it('reads the standing `auto` from the settings ladder (D27)', () => {
    const dir = latchedRepo()
    setLocalSetting(dir, 'auto', true)
    expect(withoutTty(() => checkLatch(dir, 1)).allow).toBe(true)
  })
})
