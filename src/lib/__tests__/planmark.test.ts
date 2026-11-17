// The pure half of D162 (plan-edit-shown): the line diff a plan edit is counted
// and shown by, the row and the rung it earns, the test the checkpoint refusal
// turns on, the mark's settling at a typed prompt, and its round trip through
// the sidecar.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { diffLines, planEditUnseen, settlePlan } from '../planmark.ts'
import { foldVerdict, measureRange, parseBuildRanges, parseRecap, planRowFromEdit, recapLines, spentRowValue } from '../orient.ts'
import type { BuildRange } from '../orient.ts'
import { planEditMessage } from '../latch.ts'
import { clearMark, intentPath, markPath, type PlanMark, readMark, readPause, stepPath, turnPath, writeMark, writePause } from '../sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

const NO_STATS = { driftWarnings: 0, redChecks: 0, reverts: 0, outOfBand: 0 }

describe('diffLines', () => {
  it('reads two equal texts as no change', () => {
    expect(diffLines('a\nb\n', 'a\nb\n')).toEqual({ added: 0, removed: 0, lines: [] })
  })

  it('counts a line added, with three lines of context either side', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8', ''].join('\n')
    const after = ['1', '2', '3', '4', 'new', '5', '6', '7', '8', ''].join('\n')
    expect(diffLines(before, after)).toEqual({
      added: 1,
      removed: 0,
      lines: ['@@ -2,6 +2,7 @@', ' 2', ' 3', ' 4', '+new', ' 5', ' 6', ' 7'],
    })
  })

  it('reads a changed line as one removed and one added, the removal first', () => {
    expect(diffLines('a\nb\nc\n', 'a\nB\nc\n')).toEqual({
      added: 1,
      removed: 1,
      lines: ['@@ -1,4 +1,4 @@', ' a', '-b', '+B', ' c', ' '],
    })
  })

  it('folds two changes whose contexts meet into one hunk, and keeps far ones apart', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)
    const near = lines.map((l, i) => (i === 4 || i === 8 ? `${l}!` : l))
    expect(diffLines(lines.join('\n'), near.join('\n')).lines.filter((l) => l.startsWith('@@'))).toEqual(['@@ -2,11 +2,11 @@'])
    const far = lines.map((l, i) => (i === 4 || i === 24 ? `${l}!` : l))
    expect(diffLines(lines.join('\n'), far.join('\n')).lines.filter((l) => l.startsWith('@@'))).toEqual([
      '@@ -2,7 +2,7 @@',
      '@@ -22,7 +22,7 @@',
    ])
  })

  it('counts bytes as bytes: trailing whitespace, and a trailing newline gained or lost', () => {
    expect(diffLines('a\nb\n', 'a \nb\n')).toMatchObject({ added: 1, removed: 1 })
    expect(diffLines('a\nb', 'a\nb\n')).toMatchObject({ added: 1, removed: 0 })
    expect(diffLines('a\nb\n', 'a\nb')).toMatchObject({ added: 0, removed: 1 })
  })

  it('numbers a hunk that starts from nothing the way a unified diff does', () => {
    expect(diffLines('', 'a\nb')).toEqual({ added: 2, removed: 1, lines: ['@@ -1,1 +1,2 @@', '-', '+a', '+b'] })
  })

  it('reads a rewrite too large to align as removed whole, then added whole', () => {
    const before = Array.from({ length: 2100 }, (_, i) => `old ${i}`).join('\n')
    const after = Array.from({ length: 2100 }, (_, i) => `new ${i}`).join('\n')
    const edit = diffLines(before, after)
    expect(edit.added).toBe(2100)
    expect(edit.removed).toBe(2100)
    expect(edit.lines[1]).toBe('-old 0')
    expect(edit.lines.at(-1)).toBe('+new 2099')
  })
})

describe('the plan row and its rung', () => {
  it('is a measured advisory named by its line counts', () => {
    expect(planRowFromEdit({ added: 3, removed: 1 })).toEqual({
      verdict: 'advisory',
      word: 'edited',
      evidence: 'edited during the step: intent.md +3 -1',
      measured: true,
    })
  })

  it('renders after the seam row and before diff and spent, in the label column', () => {
    const rows = {
      check: { verdict: 'true' as const, word: 'green', evidence: 'green: 1 of 1 checks' },
      seam: { verdict: 'true' as const, word: 'held', evidence: 'held: 1 of 1 declared, no strays' },
      plan: planRowFromEdit({ added: 3, removed: 1 }),
    }
    expect(recapLines(rows, { diff: '+1 -0 across 1 file', spent: '3s', constraints: 0 })).toEqual([
      'check        green: 1 of 1 checks',
      'seam         held: 1 of 1 declared, no strays',
      'plan         edited during the step: intent.md +3 -1',
      'diff         +1 -0 across 1 file',
      'spent        3s',
    ])
  })

  it('folds to the advisory rung as `plan edited`, behind a seam stray and under any failure', () => {
    const plan = planRowFromEdit({ added: 3, removed: 1 })
    expect(foldVerdict({ plan }, NO_STATS)).toEqual({ ladder: { glyph: '◐', state: 'A hair off' }, worst: 'plan edited' })
    const strayed = { verdict: 'advisory' as const, word: 'strayed', evidence: 'strayed: 1 path outside the seam' }
    expect(foldVerdict({ plan, seam: strayed }, NO_STATS).worst).toBe('seam strayed')
    const red = { verdict: 'failing' as const, word: 'red', evidence: 'red' }
    expect(foldVerdict({ plan, check: red }, NO_STATS)).toEqual({ ladder: { glyph: '○', state: 'Out of plumb' }, worst: 'check red' })
  })

  it('keeps the rung at the boundary through the stat, behind a stray and ahead of red runs', () => {
    expect(foldVerdict({}, { ...NO_STATS, planEdits: 1 }).worst).toBe('plan edited')
    expect(foldVerdict({}, { ...NO_STATS, planEdits: 1, redChecks: 2 }).worst).toBe('plan edited')
    expect(foldVerdict({}, { ...NO_STATS, planEdits: 1, driftWarnings: 1 }).worst).toBe('seam strayed')
  })

  it('is never read from the detail file: a plan row the model wrote is dropped', () => {
    const detail = ['── recap · step 1 of 2 ──', 'proof        met', 'plan         edited during the step: intent.md +9 -9', ''].join('\n')
    expect(Object.keys(parseRecap(detail)?.rows ?? {})).toEqual(['proof'])
  })

  it('counts on the spent row once the stat has it', () => {
    expect(spentRowValue({ now: 0, turns: null, redChecks: 0, gateMs: null, driftWarnings: 0, planEdits: 2 })).toBe('2 plan edits')
    expect(spentRowValue({ now: 0, turns: null, redChecks: 0, gateMs: null, driftWarnings: 0 })).toBeNull()
  })

  it('sums across a range, so a stop card names a step that edited the plan', () => {
    const intent = [
      '# Ranged',
      '',
      '## Steps',
      '',
      '1. [x] Step 1, **done when:** it works',
      '   - seam: `src/one.ts`',
      '2. [x] Step 2, **done when:** it works',
      '   - seam: `src/two.ts`',
      '',
      '## Build ranges',
      '',
      '1. `/plumbbob:build 1-2`, **stop:** review the two',
      '',
    ].join('\n')
    const sha = (c: string): string => c.repeat(40)
    const m = measureRange({
      range: parseBuildRanges(intent).ranges[0] as BuildRange,
      intent,
      checkpoints: [`baseline ${sha('a')}`, `step 1 ${sha('1')}`, `step 2 ${sha('2')}`].join('\n'),
      stats: { '1': {}, '2': { planEdits: 1 } },
      commits: { [sha('1')]: [{ path: 'src/one.ts', added: 1, removed: 0 }], [sha('2')]: [{ path: 'src/two.ts', added: 1, removed: 0 }] },
      between: [],
      summary: null,
    })
    expect(m.stats.planEdits).toBe(1)
    expect(m.spent).toBe('1 plan edit')
    expect(foldVerdict(m.rows, m.stats, 'range').worst).toBe('plan edited')
  })
})

describe('planEditUnseen', () => {
  const PLAN = '# Plan\n\n1. [ ] First\n'
  const EDITED = `${PLAN}2. [ ] Second\n`

  /** A sidecar holding `plan`, a mark of PLAN taken in turn `marked`, and TURN at `turn` (null for a host with no hook). */
  function held(plan: string, turn: number | null, marked: number | null = turn): string {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writeFileSync(intentPath(dir, null), plan)
    if (turn !== null) writeFileSync(turnPath(dir), `${turn}\n`)
    writeMark(dir, null, { turn: marked, step: 1, text: PLAN })
    return dir
  }

  function withTty<T>(tty: boolean, run: () => T): T {
    const stdin = process.stdin as unknown as { isTTY?: boolean }
    const had = stdin.isTTY
    stdin.isTTY = tty
    try {
      return run()
    } finally {
      stdin.isTTY = had
    }
  }

  it('is true for a plan that differs from the mark and has not stood at a typed prompt', () => {
    expect(withTty(false, () => planEditUnseen(held(EDITED, 2), null))).toBe(true)
    // A later turn count alone is not the person typing over the edit.
    expect(withTty(false, () => planEditUnseen(held(EDITED, 5, 2), null))).toBe(true)
  })

  it('is false once the human has typed over the edit, and true again for an edit made after that', () => {
    const dir = held(EDITED, 2)
    settlePlan(dir, null) // step-settled and differing: the prompt notes the plan and keeps the snapshot
    expect(readMark(dir, null)?.text).toBe(PLAN)
    expect(readMark(dir, null)?.seen).toMatch(/^[0-9a-f]{16}$/)
    expect(withTty(false, () => planEditUnseen(dir, null))).toBe(false)
    writeFileSync(intentPath(dir, null), `${EDITED}3. [ ] Third\n`)
    expect(withTty(false, () => planEditUnseen(dir, null))).toBe(true)
  })

  it('is false with no edit, a human at the keyboard, a host with no turn hook, and no mark', () => {
    expect(withTty(false, () => planEditUnseen(held(PLAN, 2), null))).toBe(false)
    expect(withTty(true, () => planEditUnseen(held(EDITED, 2), null))).toBe(false)
    expect(withTty(false, () => planEditUnseen(held(EDITED, null), null))).toBe(false)
    const unmarked = held(EDITED, 2)
    clearMark(unmarked, null)
    expect(withTty(false, () => planEditUnseen(unmarked, null))).toBe(false)
  })

  it('refuses in the latch voice: what happened, whose call it is, and how the pause ends', () => {
    const message = planEditMessage(4, 3, 1)
    expect(message).toMatch(/^plumbbob: checkpoint refused — intent\.md was edited during step 4 \(\+3 -1\)/)
    expect(message).toContain('the call is theirs')
    expect(message).toContain('run `plumbbob handoff` (it prints the card with the `plan` row and the diff)')
    expect(message.endsWith('stop at the boundary.\n')).toBe(true)
  })
})

describe('settlePlan', () => {
  const PLAN = '# Plan\n'

  function sidecar(plan: string, mark: PlanMark, inFlight: number | null): string {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writeFileSync(intentPath(dir, null), plan)
    writeFileSync(turnPath(dir), '7\n')
    writeMark(dir, null, mark)
    if (inFlight !== null) writeFileSync(stepPath(dir, null), `${inFlight}\n`)
    return dir
  }

  it('takes the mark again at the boundary: the plan as it stands is the plan the person typed over', () => {
    const dir = sidecar(`${PLAN}more\n`, { turn: 3, step: null, text: PLAN }, null)
    settlePlan(dir, null)
    expect(readMark(dir, null)).toEqual({ turn: 7, step: null, text: `${PLAN}more\n` })
  })

  it('keeps the snapshot while a step is in flight, and notes the plan typed over', () => {
    const dir = sidecar(`${PLAN}more\n`, { turn: 3, step: 2, text: PLAN }, 2)
    settlePlan(dir, null)
    expect(readMark(dir, null)).toMatchObject({ turn: 3, step: 2, text: PLAN })
    expect(readMark(dir, null)?.seen).toBeDefined()
  })

  it('keeps an edit a dropped step never showed, and lets go of a dropped step whose plan is as marked', () => {
    const waiting = sidecar(`${PLAN}more\n`, { turn: 3, step: 2, text: PLAN }, null)
    settlePlan(waiting, null)
    expect(readMark(waiting, null)).toMatchObject({ turn: 3, step: 2, text: PLAN })
    const clean = sidecar(PLAN, { turn: 3, step: 2, text: PLAN }, null)
    settlePlan(clean, null)
    expect(readMark(clean, null)).toEqual({ turn: 7, step: null, text: PLAN })
  })

  it('drops the note once the plan is back to the mark, and leaves a build with no mark without one', () => {
    const dir = sidecar(PLAN, { turn: 3, step: 2, text: PLAN, seen: 'abc123' }, 2)
    settlePlan(dir, null)
    expect(readMark(dir, null)).toEqual({ turn: 7, step: 2, text: PLAN })
    clearMark(dir, null)
    settlePlan(dir, null)
    expect(readMark(dir, null)).toBeNull()
  })
})

describe('the mark file', () => {
  it('round-trips the turn, the step, and the snapshot byte for byte', () => {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    expect(readMark(dir, null)).toBeNull()
    const text = '# Plan\n\nturn 9\nstep 9\n\n  trailing space \nno newline at the end'
    writeMark(dir, null, { turn: 4, step: 2, text })
    expect(readMark(dir, null)).toEqual({ turn: 4, step: 2, text })
    writeMark(dir, null, { turn: null, step: null, text: '' })
    expect(readMark(dir, null)).toEqual({ turn: null, step: null, text: '' })
    // The plan the person typed over rides in the header, and a snapshot that opens like one stays text.
    writeMark(dir, null, { turn: 4, step: 2, text: 'seen abc\n\nrest', seen: '0123abcd' })
    expect(readMark(dir, null)).toEqual({ turn: 4, step: 2, text: 'seen abc\n\nrest', seen: '0123abcd' })
    writeMark(dir, null, { turn: 4, step: 2, text: 'seen abc\n\nrest' })
    expect(readMark(dir, null)).toEqual({ turn: 4, step: 2, text: 'seen abc\n\nrest' })
  })

  it('keeps the plan a pause card showed as edited in the pause stamp, and nothing of a card that showed none', () => {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writePause(dir, null, { kind: 'pause', step: 3, plan: '0123abcd' })
    expect(readPause(dir, null)).toEqual({ kind: 'pause', step: 3, plan: '0123abcd' })
    writePause(dir, null, { kind: 'pause', step: 3 })
    expect(readPause(dir, null)).toEqual({ kind: 'pause', step: 3 })
    writePause(dir, null, { kind: 'landed', step: 3, answered: true })
    expect(readPause(dir, null)).toEqual({ kind: 'landed', step: 3, answered: true })
  })

  it('reads a file it cannot parse as no mark, and clears without complaint', () => {
    const dir = makeTempRepo()
    mkdirSync(join(dir, '.plumbbob'), { recursive: true })
    writeFileSync(markPath(dir, null), 'garbage\n')
    expect(readMark(dir, null)).toBeNull()
    clearMark(dir, null)
    clearMark(dir, null)
    expect(readMark(dir, null)).toBeNull()
  })
})
