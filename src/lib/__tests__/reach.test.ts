import { describe, expect, it } from 'vitest'
import { foldVerdict, measureRange, parseBuildRanges, plumbRowFromDiff, recapLines, type BuildRange } from '../orient.ts'
import {
  binFiles,
  mergeReach,
  parseReachAnswer,
  parseStoredReach,
  reachFor,
  sameSeam,
  serializeReach,
  stepsToAsk,
  type ReachAnswer,
} from '../reach.ts'

// The sample answer from atis's own spec, as plumbbob receives it.
const SAMPLE = {
  schema_version: 1,
  kind: 'atis.reach',
  head: '9f3c2a1',
  paths: ['src/limiter.ts', 'src/__tests__/limiter.test.ts'],
  new: [],
  reach: [
    { path: 'src/server.ts', by: 'import', hops: 1, via: ['src/limiter.ts'] },
    { path: 'src/routes/login.ts', by: 'import', hops: 2, via: ['src/limiter.ts', 'src/server.ts'] },
    { path: 'src/config.ts', by: 'cochange', rate: 0.6, support: 5, with: 'src/limiter.ts' },
  ],
  muted: ['cochange: the clone is shallow, so history reads 12 commits'],
}

/** An answer asked for `paths` that reaches `reached`. */
function answerFor(paths: ReadonlyArray<string>, reached: ReadonlyArray<string> = []): ReachAnswer {
  const answer = parseReachAnswer({ schema_version: 1, kind: 'atis.reach', paths, reach: reached.map((path) => ({ path, by: 'import' })) })
  if (answer === null) {
    throw new Error('the fixture answer did not parse')
  }
  return answer
}

const NO_STATS = { driftWarnings: 0, redChecks: 0, reverts: 0, outOfBand: 0 }

describe('parseReachAnswer', () => {
  it("accepts the spec's sample and hands it back verbatim, unknown keys kept", () => {
    expect(parseReachAnswer(SAMPLE)).toBe(SAMPLE)
  })

  it('rejects another kind, another schema version, a missing list, and a non-object', () => {
    expect(parseReachAnswer({ ...SAMPLE, kind: 'atis.reach/1' })).toBeNull()
    expect(parseReachAnswer({ ...SAMPLE, schema_version: 2 })).toBeNull()
    expect(parseReachAnswer({ ...SAMPLE, schema_version: '1' })).toBeNull()
    expect(parseReachAnswer({ ...SAMPLE, paths: undefined })).toBeNull()
    expect(parseReachAnswer({ ...SAMPLE, paths: [1] })).toBeNull()
    expect(parseReachAnswer({ ...SAMPLE, reach: 'none' })).toBeNull()
    expect(parseReachAnswer({ ...SAMPLE, reach: [{ by: 'import' }] })).toBeNull()
    expect(parseReachAnswer(null)).toBeNull()
    expect(parseReachAnswer('atis.reach')).toBeNull()
    expect(parseReachAnswer([SAMPLE])).toBeNull()
  })
})

describe('parseStoredReach and serializeReach', () => {
  it('reads garbage as null', () => {
    expect(parseStoredReach('not json')).toBeNull()
    expect(parseStoredReach('[]')).toBeNull()
    expect(parseStoredReach('{"steps":{}}')).toBeNull()
    expect(parseStoredReach('{"atis":"1.0.0","steps":[]}')).toBeNull()
  })

  it('drops a step whose answer no longer reads and keeps the rest', () => {
    const stored = parseStoredReach(JSON.stringify({ atis: '1.2.3', steps: { '1': SAMPLE, '2': { kind: 'atis.map' }, '3': SAMPLE } }))
    expect(stored?.atis).toBe('1.2.3')
    expect(Object.keys(stored?.steps ?? {})).toEqual(['1', '3'])
  })

  it('writes the steps in numeric order with a closing newline, and round-trips byte for byte', () => {
    const text = serializeReach({ atis: '1.2.3', steps: { '10': answerFor(['b.ts']), '2': answerFor(['a.ts'], ['c.ts']) } })
    expect(text.endsWith('}\n')).toBe(true)
    expect(text.indexOf('"2"')).toBeLessThan(text.indexOf('"10"'))
    const again = parseStoredReach(text)
    expect(again).not.toBeNull()
    expect(serializeReach(again ?? { atis: '', steps: {} })).toBe(text)
    expect(JSON.parse(serializeReach({ atis: '1.2.3', steps: { '1': SAMPLE as unknown as ReachAnswer } })).steps['1']).toEqual(SAMPLE)
  })
})

describe('sameSeam, stepsToAsk and reachFor', () => {
  it('compares the asked paths to the seam as sets, a leading ./ dropped and a trailing / kept', () => {
    expect(sameSeam(['a.ts', 'src/'], ['src/', './a.ts'])).toBe(true)
    expect(sameSeam(['src'], ['src/'])).toBe(false)
    expect(sameSeam(['a.ts'], ['a.ts', 'b.ts'])).toBe(false)
  })

  it('asks for a step with no answer and a step whose seam moved, and not for one whose seam is only reordered', () => {
    const stored = { atis: '1.0.0', steps: { '1': answerFor(['a.ts', 'b.ts']), '2': answerFor(['c.ts']) } }
    const undone = [
      { n: 1, seam: ['b.ts', 'a.ts'] },
      { n: 2, seam: ['c.ts', 'd.ts'] },
      { n: 3, seam: ['e.ts'] },
      { n: 4, seam: [] },
    ]
    expect(stepsToAsk(undone, stored).map((s) => s.n)).toEqual([2, 3])
    expect(stepsToAsk(undone, null).map((s) => s.n)).toEqual([1, 2, 3])
  })

  it('reads a stored answer only while it speaks for the seam as it stands', () => {
    const stored = { atis: '1.0.0', steps: { '1': answerFor(['a.ts']) } }
    expect(reachFor(stored, 1, ['a.ts'])).toBe(stored.steps['1'])
    expect(reachFor(stored, 1, ['a.ts', 'b.ts'])).toBeNull() // stale
    expect(reachFor(stored, 2, ['a.ts'])).toBeNull()
    expect(reachFor(null, 1, ['a.ts'])).toBeNull()
  })
})

describe('binFiles', () => {
  it('splits the files three ways, in the order they came', () => {
    const answer = parseReachAnswer({
      ...SAMPLE,
      paths: ['src/lib/', 'src/limiter.ts'],
      reach: [
        { path: 'src/server.ts', by: 'import', hops: 1 },
        { path: 'src/server.ts', by: 'cochange', rate: 0.6 },
        { path: 'src/config.ts', by: 'cochange', rate: 0.6 },
        { path: 'src/limiter.ts', by: 'import', hops: 0 },
      ],
    })
    expect(answer).not.toBeNull()
    if (answer === null) return
    const bins = binFiles(
      ['src/routes/admin.ts', 'src/lib/deep/x.ts', 'src/config.ts', 'src/limiter.ts', 'src/server.ts'],
      ['src/lib/', 'src/limiter.ts'],
      answer,
    )
    expect(bins.seam).toEqual(['src/lib/deep/x.ts', 'src/limiter.ts']) // a dir/ token, and a file the reach lists too
    expect(bins.reach).toEqual(['src/config.ts', 'src/server.ts']) // a co-change entry counts; a file listed twice counts once
    expect(bins.out).toEqual(['src/routes/admin.ts'])
  })
})

describe('mergeReach', () => {
  it('overlays fresh answers, keeps a landed step, drops a key the plan no longer has, and takes the new version', () => {
    const stored = { atis: '1.0.0', steps: { '1': answerFor(['a.ts']), '2': answerFor(['b.ts']), '9': answerFor(['gone.ts']) } }
    const fresh = { '2': answerFor(['b.ts', 'c.ts']), '3': answerFor(['d.ts']) }
    const merged = mergeReach(stored, '1.1.0', fresh, [1, 2, 3])
    expect(merged.atis).toBe('1.1.0')
    expect(Object.keys(merged.steps).sort()).toEqual(['1', '2', '3'])
    expect(merged.steps['1']).toBe(stored.steps['1'])
    expect(merged.steps['2']).toBe(fresh['2'])
    expect(mergeReach(null, '1.1.0', fresh, [3]).steps).toEqual({ '3': fresh['3'] })
  })
})

describe('plumbRowFromDiff', () => {
  const seam = ['src/limiter.ts', 'src/__tests__/']
  const answer = answerFor(seam, ['src/server.ts'])
  const extras = { diff: null, spent: null, constraints: 0 }

  it("prints the spec's row: the three counts, and the one file outside both named on the line", () => {
    const row = plumbRowFromDiff(
      ['src/limiter.ts', 'src/__tests__/limiter.test.ts', 'src/__tests__/cap.test.ts', 'src/server.ts', 'src/routes/admin.ts'],
      seam,
      answer,
    )
    expect(row).not.toBeNull()
    expect(recapLines({ seam: row ?? undefined }, extras)).toEqual(['plumb        seam 3 · reach 1 · out 1 (src/routes/admin.ts)'])
    expect(foldVerdict({ seam: row ?? undefined }, NO_STATS)).toMatchObject({ worst: 'seam strayed' })
  })

  it('holds when nothing is outside both, all three counts still printed', () => {
    const row = plumbRowFromDiff(['src/limiter.ts', 'src/server.ts'], seam, answer)
    expect(row).toMatchObject({ verdict: 'true', word: 'held' })
    expect(recapLines({ seam: row ?? undefined }, extras)).toEqual(['plumb        seam 1 · reach 1 · out 0'])
    expect(foldVerdict({ seam: row ?? undefined }, NO_STATS).worst).toBeNull()
  })

  it('moves a path too long for the line onto the pointer line', () => {
    const long = 'src/routes/administration/permissions/very-long-file-name-here.ts'
    const row = plumbRowFromDiff(['src/limiter.ts', long], seam, answer)
    expect(recapLines({ seam: row ?? undefined }, extras)).toEqual(['plumb        seam 1 · reach 0 · out 1', `             → ${long}`])
  })

  it('lists two or more files outside both beneath the row', () => {
    const row = plumbRowFromDiff(['src/limiter.ts', 'a.md', 'b.md'], seam, answer)
    expect(row).toMatchObject({ verdict: 'advisory', word: 'strayed' })
    expect(recapLines({ seam: row ?? undefined }, extras)).toEqual(['plumb        seam 1 · reach 0 · out 2', '             - a.md', '             - b.md'])
  })

  it('is null with no seam or no changed file, as the seam row is', () => {
    expect(plumbRowFromDiff([], seam, answer)).toBeNull()
    expect(plumbRowFromDiff(['a.md'], [], answer)).toBeNull()
  })
})

describe("the stop card's seam row with a stored reach", () => {
  const RANGED = `# Ranged

## Steps

1. [x] Step 1
   - seam: \`src/one.ts\`
   - proof: it works
2. [x] Step 2
   - seam: \`src/two.ts\`
   - proof: it works

## Build ranges

1. \`/plumbbob:build 1-2\`, **stop:** review the two
`
  const sha = (c: string): string => c.repeat(40)
  const input = {
    range: parseBuildRanges(RANGED).ranges[0] as BuildRange,
    intent: RANGED,
    checkpoints: [`plan ${sha('b')}`, `step 1 ${sha('1')}`, `step 2 ${sha('2')}`].join('\n'),
    stats: {},
    commits: {
      [sha('1')]: [
        { path: 'src/one.ts', added: 1, removed: 0 },
        { path: 'src/server.ts', added: 1, removed: 0 },
      ],
      [sha('2')]: [
        { path: 'src/two.ts', added: 1, removed: 0 },
        { path: 'src/server.ts', added: 1, removed: 0 },
      ],
    },
    between: [],
    summary: null,
  }

  it('reads as it always did with no reach handed in', () => {
    expect(measureRange(input).rows.seam).toMatchObject({ word: 'strayed', evidence: "strayed: 2 paths outside 2 steps' seams" })
  })

  it('does not call a file a stray when the step that changed it has it in its reach', () => {
    const reach = { atis: '9.9.9', steps: { '1': answerFor(['src/one.ts'], ['src/server.ts']) } }
    // Step 1's reach expected src/server.ts; step 2 has no answer, so its seam alone holds it.
    expect(measureRange({ ...input, reach }).rows.seam).toMatchObject({
      word: 'strayed',
      evidence: "strayed: 1 path outside step 2's seam",
      pointer: 'src/server.ts',
    })
    const both = { atis: '9.9.9', steps: { ...reach.steps, '2': answerFor(['src/two.ts'], ['src/server.ts']) } }
    expect(measureRange({ ...input, reach: both }).rows.seam).toMatchObject({ verdict: 'true', evidence: 'held: 2 of 2 steps, no strays' })
  })

  it('ignores a stored answer asked for another seam', () => {
    const stale = { atis: '9.9.9', steps: { '1': answerFor(['src/other.ts'], ['src/server.ts']), '2': answerFor(['src/two.ts'], ['src/server.ts']) } }
    expect(measureRange({ ...input, reach: stale }).rows.seam).toMatchObject({ evidence: "strayed: 1 path outside step 1's seam" })
  })
})
