import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { FINE_SEAM_LIMIT, grainFindings, resolveGrain } from '../grain.ts'
import { localSettingsPath, settingsPath } from '../settings.ts'
import { sidecarDir } from '../sidecar.ts'
import { cleanupTempRepos, makeTempDir } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

function writeProject(root: string, obj: unknown): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(settingsPath(root), JSON.stringify(obj))
}

function writeLocal(root: string, obj: unknown): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(localSettingsPath(root), JSON.stringify(obj))
}

/**
 * A plan with one step per entry, its sub-lines as given; a step whose first
 * sub-line is `x` has landed. Step 1 opens on line 5.
 */
function planOf(steps: ReadonlyArray<ReadonlyArray<string>>): string {
  const body = steps.flatMap((subs, i) => {
    const done = subs[0] === 'x'
    const lines = done ? subs.slice(1) : subs
    return [`${i + 1}. [${done ? 'x' : ' '}] feat: step ${i + 1}`, ...lines.map((l) => `   - ${l}`)]
  })
  return ['# Plan', '', '## Steps', '', ...body, ''].join('\n')
}

/** A seam line naming `count` files. */
function seamOf(count: number): string {
  return `seam: ${Array.from({ length: count }, (_, i) => `\`src/f${i + 1}.ts\``).join(', ')}`
}

const BY_COMMAND = 'proof: `pnpm vitest run limiter` passes; the 6th request in 60s returns 429'
const IN_WORDS = 'proof: the 6th request in 60s returns 429'

describe('resolveGrain — D165 (grain)', () => {
  it('is default when no settings file exists', () => {
    expect(resolveGrain(makeTempDir())).toBe('default')
  })

  it('is default when neither file has the key', () => {
    const dir = makeTempDir()
    writeProject(dir, { check: 'make ci' })
    writeLocal(dir, { auto: true })
    expect(resolveGrain(dir)).toBe('default')
  })

  it('reads each of the three grains from settings.json', () => {
    for (const grain of ['fine', 'default', 'coarse'] as const) {
      const dir = makeTempDir()
      writeProject(dir, { grain })
      expect(resolveGrain(dir)).toBe(grain)
    }
  })

  it('reads the grain from settings.local.json when settings.json has none', () => {
    const dir = makeTempDir()
    writeLocal(dir, { grain: 'fine' })
    expect(resolveGrain(dir)).toBe('fine')
  })

  it('lets settings.local.json override settings.json', () => {
    const dir = makeTempDir()
    writeProject(dir, { grain: 'coarse' })
    writeLocal(dir, { grain: 'fine' })
    expect(resolveGrain(dir)).toBe('fine')
  })

  it('lets settings.local.json set a project grain back to default', () => {
    const dir = makeTempDir()
    writeProject(dir, { grain: 'coarse' })
    writeLocal(dir, { grain: 'default' })
    expect(resolveGrain(dir)).toBe('default')
  })

  it('keeps the settings.json grain when settings.local.json sets other keys', () => {
    const dir = makeTempDir()
    writeProject(dir, { grain: 'coarse' })
    writeLocal(dir, { auto: true })
    expect(resolveGrain(dir)).toBe('coarse')
  })

  it('reads a string that names no grain as default, matched exactly', () => {
    for (const value of ['medium', 'Fine', 'COARSE', ' fine', 'fine ', 'finer', '', '   ']) {
      const dir = makeTempDir()
      writeProject(dir, { grain: value })
      expect(resolveGrain(dir)).toBe('default')
    }
  })

  it('reads a value that is not a string as default', () => {
    for (const value of [3, 0, true, false, null, ['fine'], { grain: 'fine' }]) {
      const dir = makeTempDir()
      writeProject(dir, { grain: value })
      expect(resolveGrain(dir)).toBe('default')
    }
  })

  it('reads a settings.local.json value that names no grain as default, and does not fall through to settings.json', () => {
    for (const value of ['medium', 3, null, ['coarse']]) {
      const dir = makeTempDir()
      writeProject(dir, { grain: 'coarse' })
      writeLocal(dir, { grain: value })
      expect(resolveGrain(dir)).toBe('default')
    }
  })

  it('survives a malformed settings file: a broken overlay leaves the settings.json grain, and a broken settings.json reads as default', () => {
    const dir = makeTempDir()
    writeProject(dir, { grain: 'fine' })
    writeFileSync(localSettingsPath(dir), '{ not json')
    expect(resolveGrain(dir)).toBe('fine')

    const other = makeTempDir()
    mkdirSync(sidecarDir(other), { recursive: true })
    writeFileSync(settingsPath(other), '{ not json')
    expect(resolveGrain(other)).toBe('default')
  })
})

describe('FINE_SEAM_LIMIT — D165 (grain)', () => {
  it('is 3: the most seam entries a step names under fine', () => {
    expect(FINE_SEAM_LIMIT).toBe(3)
  })
})

describe('grainFindings — D165 (grain)', () => {
  // A plan that is cut against both grains at once: a seam of 5 and a proof in words.
  const AGAINST_BOTH = planOf([[seamOf(5), IN_WORDS]])

  it('says nothing under default, whatever the plan holds', () => {
    expect(grainFindings(AGAINST_BOTH, 'default')).toEqual([])
    expect(grainFindings('', 'default')).toEqual([])
  })

  it('names a step whose seam parses to more than 3 entries under fine, with its count and the limit', () => {
    const plan = planOf([
      [seamOf(3), BY_COMMAND],
      [seamOf(4), BY_COMMAND],
      [seamOf(5), BY_COMMAND],
    ])
    expect(grainFindings(plan, 'fine')).toEqual([
      { step: 2, line: 8, kind: 'seam-breadth', words: "'s seam names 4 paths; the grain is fine, which takes 3 at most." },
      { step: 3, line: 11, kind: 'seam-breadth', words: "'s seam names 5 paths; the grain is fine, which takes 3 at most." },
    ])
  })

  it('counts a `dir/` grant as one entry, and every entry of a seam wrapped onto a second line', () => {
    const plan = planOf([
      ['seam: `src/`, `docs/`, `test/`', BY_COMMAND],
      ['seam: `src/a.ts`, `src/b.ts`,\n     `src/c.ts`, `docs/`', BY_COMMAND],
    ])
    expect(grainFindings(plan, 'fine').map((f) => [f.step, f.words])).toEqual([
      [2, "'s seam names 4 paths; the grain is fine, which takes 3 at most."],
    ])
  })

  it('draws no breadth finding for a seam that will not parse, which the seam check already names', () => {
    const plan = planOf([[BY_COMMAND], ['seam: `src/a.ts`, `src/b.ts`, `src/c.ts`, `src/*.ts`', BY_COMMAND], [seamOf(4), 'seam: `src/z.ts`']])
    expect(grainFindings(plan, 'fine')).toEqual([])
  })

  it('skips a landed step under fine, and says nothing there about a proof in words', () => {
    const plan = planOf([['x', seamOf(6), IN_WORDS], [seamOf(2), IN_WORDS]])
    expect(grainFindings(plan, 'fine')).toEqual([])
  })

  it('names a step whose proof opens on words under coarse', () => {
    const plan = planOf([[seamOf(1), BY_COMMAND], [seamOf(1), IN_WORDS]])
    expect(grainFindings(plan, 'coarse')).toEqual([
      { step: 2, line: 8, kind: 'proof-in-words', words: 'is proved in words; the grain is coarse, where a proof opens on a command.' },
    ])
  })

  it('reads a code span further along the proof as prose, and the older done-when clause as a proof in words', () => {
    const plan = [
      '# Plan',
      '',
      '## Steps',
      '',
      '1. [ ] feat: step 1',
      '   - seam: `src/a.ts`',
      '   - proof: the test in `src/a.test.ts` passes',
      '2. [ ] Step 2, **done when:** it works.',
      '   - seam: `src/b.ts`',
      '',
    ].join('\n')
    expect(grainFindings(plan, 'coarse').map((f) => [f.step, f.line, f.kind])).toEqual([
      [1, 5, 'proof-in-words'],
      [2, 8, 'proof-in-words'],
    ])
  })

  it('draws nothing under coarse for a step with no proof, or one whose proof will not parse', () => {
    const plan = planOf([[seamOf(1)], [seamOf(1), IN_WORDS, IN_WORDS], [seamOf(1), 'proof:']])
    expect(grainFindings(plan, 'coarse')).toEqual([])
  })

  it('skips a landed step under coarse, and says nothing there about a wide seam', () => {
    const plan = planOf([['x', seamOf(1), IN_WORDS], [seamOf(6), BY_COMMAND]])
    expect(grainFindings(plan, 'coarse')).toEqual([])
  })

  it('reports in step order, one finding to a step', () => {
    const plan = planOf([[seamOf(4), IN_WORDS], [seamOf(1), BY_COMMAND], [seamOf(7), IN_WORDS]])
    expect(grainFindings(plan, 'fine').map((f) => f.step)).toEqual([1, 3])
    expect(grainFindings(plan, 'coarse').map((f) => f.step)).toEqual([1, 3])
  })

  it('says nothing for a plan with no steps', () => {
    expect(grainFindings('# Plan\n', 'fine')).toEqual([])
    expect(grainFindings('# Plan\n\n## Steps\n', 'coarse')).toEqual([])
  })
})
