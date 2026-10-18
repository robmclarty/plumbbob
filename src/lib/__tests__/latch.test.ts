import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkLatch, checkStopLatch, evaluateLatch, evaluateStopLatch, parseGrant, type LatchInput } from '../latch.ts'
import { grantPath, tickPath, turnPath } from '../sidecar.ts'
import { setLocalSetting } from '../settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

// The strictest baseline: every row's allow condition false, so evaluation falls
// through to the final refusal row. Each test flips exactly the input its row reads.
const LATCHED: LatchInput = { isTTY: false, turn: 2, tick: 2, grant: null, step: 1, settingsAuto: false }

describe('evaluateLatch — the five-row matrix, first hit wins', () => {
  it('row 1: a TTY stdin allows — a human at the keyboard is their own approval', () => {
    expect(evaluateLatch({ ...LATCHED, isTTY: true }).allow).toBe(true)
  })

  it('row 2: an absent TURN allows — the ledger is dormant (no hooks)', () => {
    expect(evaluateLatch({ ...LATCHED, turn: null }).allow).toBe(true)
  })

  it('row 2: an absent TICK allows — a hand-built diff has no stamped entry', () => {
    expect(evaluateLatch({ ...LATCHED, tick: null }).allow).toBe(true)
  })

  it('D67 (auto-not-a-grant): a settings `auto` no longer allows — it refuses with the migration note', () => {
    const decision = evaluateLatch({ ...LATCHED, settingsAuto: true })
    expect(decision.allow).toBe(false)
    if (!decision.allow) {
      expect(decision.reason).toBe('no-turn')
      expect(decision.message).toContain('`auto` is set in settings but is no longer a grant — D67 (auto-not-a-grant)')
      expect(decision.message).toContain('Type `/plumbbob:build --auto` yourself to self-approve')
    }
  })

  it('the settings note rides only when set — a clean pause carries no note', () => {
    const decision = evaluateLatch(LATCHED)
    expect(decision.allow).toBe(false)
    if (!decision.allow) expect(decision.message).not.toContain('no longer a grant')
  })

  it('row 3: a one-turn `auto` grant allows — D65 (human-typed-grants)', () => {
    expect(evaluateLatch({ ...LATCHED, grant: { kind: 'auto' } }).allow).toBe(true)
  })

  it('row 3: a range grant allows a step at or under its ceiling', () => {
    const grant = { kind: 'range', ceiling: 3 } as const
    expect(evaluateLatch({ ...LATCHED, grant, step: 3 }).allow).toBe(true)
    expect(evaluateLatch({ ...LATCHED, grant, step: 1 }).allow).toBe(true)
  })

  it('row 3: a range grant refuses past its ceiling, with the top-of-range affordance', () => {
    const decision = evaluateLatch({ ...LATCHED, grant: { kind: 'range', ceiling: 3 }, step: 4 })
    expect(decision.allow).toBe(false)
    if (!decision.allow) {
      expect(decision.reason).toBe('ceiling')
      expect(decision.message).toContain('the range you granted ends at step 3')
      expect(decision.message).toContain('run it again to continue')
    }
  })

  it('row 3 precedes row 4: the ceiling refuses even when a human turn intervened', () => {
    // First hit wins: a freshly minted `range M` speaks for this turn, and a step
    // past M refuses at row 3 before the turn comparison is ever reached.
    const decision = evaluateLatch({ ...LATCHED, turn: 3, tick: 2, grant: { kind: 'range', ceiling: 1 }, step: 2 })
    expect(decision.allow).toBe(false)
    if (!decision.allow) expect(decision.reason).toBe('ceiling')
  })

  it('row 3: a range grant does not speak to a plan checkpoint — falls through', () => {
    const grant = { kind: 'range', ceiling: 3 } as const
    // With no intervening turn the plan still refuses at row 5…
    expect(evaluateLatch({ ...LATCHED, grant, step: null }).allow).toBe(false)
    // …and with one, row 4 allows it.
    expect(evaluateLatch({ ...LATCHED, grant, step: null, turn: 3 }).allow).toBe(true)
  })

  it('row 3: a step-list grant lands each step it names, and refuses any other by name — D12 (step-list-grants)', () => {
    const grant = { kind: 'steps', steps: [{ from: 20, to: 20 }, { from: 5, to: 9 }] } as const
    for (const step of [5, 7, 9, 20]) expect(evaluateLatch({ ...LATCHED, grant, step }).allow).toBe(true)
    for (const step of [1, 4, 10, 19, 21]) {
      const decision = evaluateLatch({ ...LATCHED, grant, step })
      expect(decision.allow).toBe(false)
      if (!decision.allow) {
        expect(decision.reason).toBe('ceiling')
        expect(decision.message).toBe(
          `plumbbob: checkpoint refused — step ${step} is not in the range you granted (5-9,20) — pause here; run it again to continue.\n`,
        )
      }
    }
  })

  it('row 3: a span grants exactly N through M, so a step under N refuses where `range M` would land it', () => {
    const grant = { kind: 'steps', steps: [{ from: 2, to: 4 }] } as const
    expect(evaluateLatch({ ...LATCHED, grant, step: 1 }).allow).toBe(false)
    expect(evaluateLatch({ ...LATCHED, grant: { kind: 'range', ceiling: 4 }, step: 1 }).allow).toBe(true)
  })

  it('row 3 precedes row 4 for a list too: a step it does not name refuses even after a human turn', () => {
    const grant = { kind: 'steps', steps: [{ from: 2, to: 3 }] } as const
    expect(evaluateLatch({ ...LATCHED, turn: 3, tick: 2, grant, step: 4 }).allow).toBe(false)
  })

  it('row 3: a step-list grant does not speak to a plan checkpoint — falls through', () => {
    const grant = { kind: 'steps', steps: [{ from: 1, to: 3 }] } as const
    expect(evaluateLatch({ ...LATCHED, grant, step: null }).allow).toBe(false)
    expect(evaluateLatch({ ...LATCHED, grant, step: null, turn: 3 }).allow).toBe(true)
  })

  it('row 4: a human turn since entry allows', () => {
    expect(evaluateLatch({ ...LATCHED, turn: 3, tick: 2 }).allow).toBe(true)
  })

  it('row 5: no turn since entry refuses with the pause affordance', () => {
    const decision = evaluateLatch(LATCHED)
    expect(decision.allow).toBe(false)
    if (!decision.allow) {
      expect(decision.reason).toBe('no-turn')
      expect(decision.message).toContain('no human turn since this step began')
      expect(decision.message).toContain('This is the')
      expect(decision.message).toContain("The human's approval on")
      expect(decision.message).toContain('`/plumbbob:build` only starts the next step')
      expect(decision.message).toContain('`/plumbbob:build --auto`')
      expect(decision.message).toContain('is the only self-approval')
    }
  })

  it('row 5: a plan refusal (step null) speaks plan, not step', () => {
    const decision = evaluateLatch({ ...LATCHED, step: null })
    expect(decision.allow).toBe(false)
    if (!decision.allow) {
      expect(decision.reason).toBe('no-turn')
      expect(decision.message).toContain('no human turn since `start` stamped this plan')
      expect(decision.message).toContain('present the plan')
      expect(decision.message).not.toContain('self-review')
    }
  })

  it('row 5: a stale TICK above TURN also refuses — only a strictly later turn allows', () => {
    // TURN < TICK cannot arise from the verbs (TICK is copied from TURN), but a
    // mangled ledger must land on the safe side of the latch, not sneak past it.
    const decision = evaluateLatch({ ...LATCHED, turn: 1, tick: 2 })
    expect(decision.allow).toBe(false)
    if (!decision.allow) expect(decision.reason).toBe('no-turn')
  })
})

describe('parseGrant', () => {
  it('parses the minted forms, trailing newline and all', () => {
    expect(parseGrant('auto\n')).toEqual({ kind: 'auto' })
    expect(parseGrant('steps 5-9,20\n')).toEqual({ kind: 'steps', steps: [{ from: 5, to: 9 }, { from: 20, to: 20 }] })
    expect(parseGrant('steps 3')).toEqual({ kind: 'steps', steps: [{ from: 3, to: 3 }] })
    expect(parseGrant('steps 1-100000')).toEqual({ kind: 'steps', steps: [{ from: 1, to: 100000 }] })
  })

  it('still parses the `range M` a hook from before step lists mints — C8 (old-grants-land)', () => {
    expect(parseGrant('range 3\n')).toEqual({ kind: 'range', ceiling: 3 })
    expect(parseGrant('range 12')).toEqual({ kind: 'range', ceiling: 12 })
  })

  it('malformed content contributes nothing — D27 (settings-ladder) — no grant, never an error', () => {
    expect(parseGrant('')).toBeNull()
    expect(parseGrant('yes')).toBeNull()
    expect(parseGrant('range')).toBeNull()
    expect(parseGrant('range x')).toBeNull()
    expect(parseGrant('range -1')).toBeNull()
    expect(parseGrant('auto range 3')).toBeNull()
    expect(parseGrant('steps')).toBeNull()
    expect(parseGrant('steps 5-3')).toBeNull()
    expect(parseGrant('steps 1,,2')).toBeNull()
    expect(parseGrant('steps 1, 2')).toBeNull()
    expect(parseGrant('steps x')).toBeNull()
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

  it('reads a step-list GRANT, landing its members only', () => {
    const dir = latchedRepo()
    writeFileSync(grantPath(dir), 'steps 2-4\n')
    expect(withoutTty(() => checkLatch(dir, 3)).allow).toBe(true)
    expect(withoutTty(() => checkLatch(dir, 1)).allow).toBe(false)
  })

  it('reads a settings `auto` only to note it — it no longer allows — D67 (auto-not-a-grant)', () => {
    const dir = latchedRepo()
    setLocalSetting(dir, 'auto', true)
    const decision = withoutTty(() => checkLatch(dir, 1))
    expect(decision.allow).toBe(false)
    if (!decision.allow) expect(decision.message).toContain('no longer a grant — D67 (auto-not-a-grant)')
  })
})

describe('evaluateStopLatch — the stop record waits for a human turn after its card — D103 (stop-latched)', () => {
  it('refuses in the turn the card printed, and allows once a human turn has passed', () => {
    expect(evaluateStopLatch({ isTTY: false, turn: 4, printed: 4 })).toBe(false)
    expect(evaluateStopLatch({ isTTY: false, turn: 5, printed: 4 })).toBe(true)
  })

  it('allows a human at the keyboard, and stays out of the way of a dormant ledger', () => {
    expect(evaluateStopLatch({ isTTY: true, turn: 4, printed: 4 })).toBe(true)
    expect(evaluateStopLatch({ isTTY: false, turn: null, printed: 4 })).toBe(true)
    expect(evaluateStopLatch({ isTTY: false, turn: 4, printed: null })).toBe(true)
  })

  it('opens to no grant: a typed range or --auto in the turn the card printed still refuses', () => {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writeFileSync(turnPath(dir), '6\n')
    for (const grant of ['auto\n', 'steps 1-9\n']) {
      writeFileSync(grantPath(dir), grant)
      expect(checkStopLatch(dir, 6)).toBe(false)
    }
    expect(checkStopLatch(dir, 5)).toBe(true)
  })
})
