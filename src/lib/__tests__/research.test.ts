import { describe, expect, it } from 'vitest'
import {
  formatStamp,
  movedSince,
  npmName,
  parseStamp,
  readStamp,
  stalenessClause,
  staleness,
  fitsStamp,
  withStamp,
  type Stamp,
} from '../research.ts'

const FULL = '3f9a1c2d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b'
const STAMP: Stamp = {
  date: '2026-11-11',
  locks: [{ name: 'pnpm-lock.yaml', hash: FULL }],
  deps: [
    { name: 'fascicle', version: '0.18.0' },
    { name: 'checkride', version: '0.20.0' },
  ],
}
const LINE = 'Researched 2026-11-11 · pnpm-lock.yaml 3f9a1c2 · fascicle 0.18.0, checkride 0.20.0'

describe('formatStamp', () => {
  it('writes the date, the lockfiles and the dependencies on one line, the hash shortened', () => {
    expect(formatStamp(STAMP)).toBe(LINE)
  })

  it('leaves out a segment with nothing in it', () => {
    expect(formatStamp({ date: '2026-11-13', locks: [], deps: [] })).toBe('Researched 2026-11-13')
    expect(formatStamp({ ...STAMP, deps: [] })).toBe('Researched 2026-11-11 · pnpm-lock.yaml 3f9a1c2')
    expect(formatStamp({ ...STAMP, locks: [] })).toBe('Researched 2026-11-11 · fascicle 0.18.0, checkride 0.20.0')
  })

  it('lists a dependency with no readable version by its name alone', () => {
    expect(formatStamp({ date: '2026-11-13', locks: [], deps: [{ name: 'github.com/a/b', version: null }] })).toBe(
      'Researched 2026-11-13 · github.com/a/b',
    )
  })

  it('joins several lockfiles with a comma', () => {
    const locks = [
      { name: 'pnpm-lock.yaml', hash: 'aaaaaaa1' },
      { name: 'go.sum', hash: 'bbbbbbb2' },
    ]
    expect(formatStamp({ date: '2026-11-13', locks, deps: [] })).toBe('Researched 2026-11-13 · pnpm-lock.yaml aaaaaaa, go.sum bbbbbbb')
  })
})

describe('parseStamp', () => {
  it('reads back what formatStamp wrote', () => {
    expect(parseStamp(LINE)).toEqual({ ...STAMP, locks: [{ name: 'pnpm-lock.yaml', hash: '3f9a1c2' }] })
  })

  it('tells a lockfile from a dependency by its name, whichever segments are present', () => {
    expect(parseStamp('Researched 2026-11-13')).toEqual({ date: '2026-11-13', locks: [], deps: [] })
    expect(parseStamp('Researched 2026-11-13 · fascicle 0.18.0, zod')).toEqual({
      date: '2026-11-13',
      locks: [],
      deps: [
        { name: 'fascicle', version: '0.18.0' },
        { name: 'zod', version: null },
      ],
    })
    expect(parseStamp('Researched 2026-11-13 · pnpm-lock.yaml aaaaaaa, go.sum bbbbbbb')).toEqual({
      date: '2026-11-13',
      locks: [
        { name: 'pnpm-lock.yaml', hash: 'aaaaaaa' },
        { name: 'go.sum', hash: 'bbbbbbb' },
      ],
      deps: [],
    })
  })

  it('reads anything else as no stamp', () => {
    for (const line of ['', '# Research', 'Researched', 'Researched yesterday', 'researched 2026-11-13', 'Researched 2026-11-13 · ', 'Researched 2026-11-13 · a b c']) {
      expect(parseStamp(line), line).toBeNull()
    }
  })
})

describe('readStamp', () => {
  it('reads the first line only', () => {
    expect(readStamp(`${LINE}\n\n## Ecosystem\n`)?.date).toBe('2026-11-11')
    expect(readStamp(`# Research\n\n${LINE}\n`)).toBeNull()
  })
})

describe('withStamp', () => {
  const next: Stamp = { date: '2026-11-13', locks: [], deps: [{ name: 'fascicle', version: '0.19.2' }] }

  it('is the stamp alone when there is no file, or an empty one', () => {
    expect(withStamp(null, next)).toBe('Researched 2026-11-13 · fascicle 0.19.2\n')
    expect(withStamp('\n', next)).toBe('Researched 2026-11-13 · fascicle 0.19.2\n')
  })

  it('replaces the stamp line and nothing beneath it', () => {
    const findings = '\n## Ecosystem\n\n- web_tools shipped in 0.18.0. Source: https://example.com/changelog. Changes: nothing.\n'
    expect(withStamp(`${LINE}${findings}`, next)).toBe(`Researched 2026-11-13 · fascicle 0.19.2${findings}`)
  })

  it('replaces a stamp that is the whole file', () => {
    expect(withStamp(LINE, next)).toBe('Researched 2026-11-13 · fascicle 0.19.2\n')
  })

  it('keeps a first line that opens on the stamp word and is not a stamp', () => {
    const prose = 'Researched the fascicle API on the train, it has no retries.\n\n## Record\n'
    expect(withStamp(prose, next)).toBe(`Researched 2026-11-13 · fascicle 0.19.2\n\n${prose}`)
    const edited = 'Researched 2026-11-11 · fascicle ^0.18.0 (peer)\n'
    expect(withStamp(edited, next)).toBe(`Researched 2026-11-13 · fascicle 0.19.2\n\n${edited}`)
    expect(withStamp('Researched', next)).toBe('Researched 2026-11-13 · fascicle 0.19.2\n\nResearched')
  })

  it("puts the stamp above a first line that is the person's, and keeps that line", () => {
    expect(withStamp('## Ecosystem\n\n- a finding\n', next)).toBe('Researched 2026-11-13 · fascicle 0.19.2\n\n## Ecosystem\n\n- a finding\n')
    expect(withStamp('Researchers disagree here.\n', next)).toBe('Researched 2026-11-13 · fascicle 0.19.2\n\nResearchers disagree here.\n')
  })
})

describe('movedSince and staleness', () => {
  const stored = parseStamp(LINE) as Stamp

  it('says nothing when the hash and the versions are what was stamped', () => {
    const moved = movedSince(stored, { locks: { 'pnpm-lock.yaml': FULL }, versions: { fascicle: '0.18.0', checkride: '0.20.0' } })
    expect(moved).toEqual({ locks: [], deps: [] })
    expect(staleness(moved)).toBeNull()
  })

  it('names the dependency whose version changed with the lockfile', () => {
    const moved = movedSince(stored, { locks: { 'pnpm-lock.yaml': 'ffff'.repeat(10) }, versions: { fascicle: '0.19.2', checkride: '0.20.0' } })
    expect(moved).toEqual({ locks: ['pnpm-lock.yaml'], deps: [{ name: 'fascicle', from: '0.18.0', to: '0.19.2' }] })
    expect(stalenessClause(staleness(moved)!)).toBe('predates a lockfile change: fascicle 0.18.0 → 0.19.2')
  })

  it('names the lockfile when only its hash moved', () => {
    const moved = movedSince(stored, { locks: { 'pnpm-lock.yaml': 'ffff'.repeat(10) }, versions: { fascicle: '0.18.0', checkride: '0.20.0' } })
    expect(stalenessClause(staleness(moved)!)).toBe('predates a lockfile change: pnpm-lock.yaml')
  })

  it('reads a stamped lockfile that is gone as moved', () => {
    const moved = movedSince(stored, { locks: { 'pnpm-lock.yaml': null }, versions: {} })
    expect(moved.locks).toEqual(['pnpm-lock.yaml'])
  })

  it('does not count a dependency that can no longer be read, or one stamped without a version', () => {
    const bare: Stamp = { date: '2026-11-11', locks: [], deps: [{ name: 'zod', version: null }, { name: 'fascicle', version: '0.18.0' }] }
    expect(movedSince(bare, { locks: {}, versions: { zod: '4.0.0', fascicle: null } })).toEqual({ locks: [], deps: [] })
  })

  it('says a dependency change when no stamped lockfile moved', () => {
    const bare: Stamp = { date: '2026-11-11', locks: [], deps: [{ name: 'fascicle', version: '0.18.0' }] }
    const moved = movedSince(bare, { locks: {}, versions: { fascicle: '0.19.2' } })
    expect(stalenessClause(staleness(moved)!)).toBe('predates a dependency change: fascicle 0.18.0 → 0.19.2')
  })
})

describe('names', () => {
  it('accepts a name the stamp can hold and refuses its punctuation', () => {
    expect(fitsStamp('fascicle')).toBe(true)
    expect(fitsStamp('github.com/a/b')).toBe(true)
    for (const name of ['', 'a b', 'a,b', 'a·b']) {
      expect(fitsStamp(name), name).toBe(false)
    }
  })

  it('reads only an npm-shaped name from node_modules', () => {
    expect(npmName('fascicle')).toBe(true)
    expect(npmName('@scope/name')).toBe(true)
    for (const name of ['../x', 'a/b', '@scope/a/b', '.bin', '@scope/../x']) {
      expect(npmName(name), name).toBe(false)
    }
  })
})
