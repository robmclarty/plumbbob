import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { resolveOrchestration, splitFindings } from '../orchestration.ts'
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

describe('resolveOrchestration — D167 (host-orchestration)', () => {
  it('is off when no settings file exists', () => {
    expect(resolveOrchestration(makeTempDir())).toBe('off')
  })

  it('is off when neither file has the key', () => {
    const dir = makeTempDir()
    writeProject(dir, { grain: 'coarse' })
    writeLocal(dir, { auto: true })
    expect(resolveOrchestration(dir)).toBe('off')
  })

  it('reads host from settings.json', () => {
    const dir = makeTempDir()
    writeProject(dir, { orchestration: 'host' })
    expect(resolveOrchestration(dir)).toBe('host')
  })

  it('reads any other value as off: another string, a near miss, a boolean, a list', () => {
    for (const value of ['workflow', 'Host', ' host', '', true, ['host'], 1]) {
      const dir = makeTempDir()
      writeProject(dir, { orchestration: value })
      expect(resolveOrchestration(dir)).toBe('off')
    }
  })

  it('lets the personal overlay turn it on over a project that says nothing', () => {
    const dir = makeTempDir()
    writeProject(dir, { check: 'make ci' })
    writeLocal(dir, { orchestration: 'host' })
    expect(resolveOrchestration(dir)).toBe('host')
  })

  it('lets the personal overlay turn off a project default of host', () => {
    const dir = makeTempDir()
    writeProject(dir, { orchestration: 'host' })
    writeLocal(dir, { orchestration: 'off' })
    expect(resolveOrchestration(dir)).toBe('off')
  })
})

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

const WORDS = (n: number): string => `'s seam holds ${n} slices and no note names the split; orchestration is host, where a wide step carries one.`

describe('splitFindings — D167 (host-orchestration)', () => {
  const FORMATS = 'seam: `src/format/json.js`, `src/format/json.test.js`, `src/format/text.js`, `src/format/text.test.js`, `src/format/index.js`'

  it('says nothing under off, whatever the plan holds', () => {
    expect(splitFindings(planOf([[FORMATS]]), 'off')).toEqual([])
  })

  it('names an undone step whose seam holds two slices or more and carries no note, with its count', () => {
    const plan = planOf([[FORMATS], ['seam: `src/cli/`, `docs/formats.md`']])
    expect(splitFindings(plan, 'host')).toEqual([
      { step: 1, line: 5, words: WORDS(3) },
      { step: 2, line: 7, words: WORDS(2) },
    ])
  })

  it('reads a module and its test as one slice, beside it or under __tests__/, and one dir/ grant as one', () => {
    const plan = planOf([
      ['seam: `src/cli/index.js`, `src/cli/index.test.js`'],
      ['seam: `src/limiter.ts`, `src/__tests__/limiter.test.ts`'],
      ['seam: `src/format/`'],
    ])
    expect(splitFindings(plan, 'host')).toEqual([])
  })

  it('leaves a step alone once a note names its split, and a step that has landed', () => {
    const plan = planOf([
      [FORMATS, 'note: split three ways, one slice per format'],
      ['x', FORMATS],
    ])
    expect(splitFindings(plan, 'host')).toEqual([])
  })

  it('draws nothing for a step whose seam or fields will not parse, which the plan checks already name', () => {
    const plan = planOf([['proof: it works'], [FORMATS, 'effort: huge']])
    expect(splitFindings(plan, 'host')).toEqual([])
  })
})
