// Reach, end to end on plumbbob's side: the quiet question to an optional atis
// at the plan checkpoint and at a step's entry, the stored `reach.json`, the
// plumb row at the pause, the drift stat at the checkpoint, and doctor's line.
// Every atis here is a fake script on PATH; the suite's setup has already
// dropped any real one, so "absent" is the default.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { build } from '../build.ts'
import { checkpoint } from '../checkpoint.ts'
import { doctor } from '../doctor.ts'
import { handoff } from '../handoff.ts'
import { start } from '../start.ts'
import { askAtis } from '../../lib/check.ts'
import { parseStoredReach, serializeReach } from '../../lib/reach.ts'
import { atisVersion, reachJsonPath, readReach, refreshReach } from '../../lib/reachfile.ts'
import { detailPath, intentPath, readStats, seamPath, stepPath } from '../../lib/sidecar.ts'
import { settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'
import { withFakeAtis, type FakeAtis } from '../../../test/helpers/fake-atis.ts'

afterAll(cleanupTempRepos)

let fake: FakeAtis | null = null
afterEach(() => {
  fake?.restore()
  fake = null
})

const INTENT = `# Reach test

## Steps

1. [ ] First
   - seam: \`src/a.ts\`, \`src/lib/\`
   - proof: a works
2. [ ] Second
   - seam: \`src/b.ts\`
   - proof: b works
3. [x] Third
   - seam: \`src/c.ts\`
   - proof: c works
`

const DETAIL = `# Detail · Step 1 · First

── recap · step 1 of 3 ──
proof        met
decisions    none exercised
constraints  all honored

## Summary

A works now.

## 1 The first move

The whole story.

## Recommendation

Approve it. Nothing is off.
`

/** A started session on INTENT behind a green stub gate, the scaffold committed so the tree is clean. */
async function started(intent = INTENT): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Reach test', '--slug', 'reach-test']))
  writeFileSync(intentPath(dir), intent)
  writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
  return dir
}

/** Write a work file, making its folder. */
function work(dir: string, path: string, text = 'work\n'): void {
  mkdirSync(join(dir, path, '..'), { recursive: true })
  writeFileSync(join(dir, path), text)
}

/** Git output with every sha blanked, so two repos' endings compare. */
function unsha(text: string): string {
  return text.replace(/\b[0-9a-f]{7,40}\b/g, '<sha>')
}

const git = (dir: string, args: ReadonlyArray<string>): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })

describe('askAtis', () => {
  it('reports an absent atis as a fatal failure, without throwing', () => {
    expect(askAtis(makeTempRepo(), ['--version'], 5_000)).toEqual({ ok: false, fatal: true })
    expect(atisVersion(makeTempRepo())).toBeNull()
  })

  it('hands back stdout from the atis on PATH, and a non-zero exit as a failure worth another try', () => {
    fake = withFakeAtis()
    const dir = makeTempRepo()
    expect(askAtis(dir, ['--version'], 5_000)).toEqual({ ok: true, stdout: '9.9.9\n' })
    expect(atisVersion(dir)).toBe('9.9.9')
    expect(askAtis(dir, ['map'], 5_000)).toEqual({ ok: false, fatal: false })
  })

  it('gives up on an atis that runs past the timeout, and says asking again is pointless', () => {
    fake = withFakeAtis({ reachScript: 'sleep 5' })
    expect(askAtis(makeTempRepo(), ['reach', '--json', 'a.ts'], 200)).toEqual({ ok: false, fatal: true })
  })
})

describe('checkpoint --plan asks atis for each undone step', () => {
  it('stores one answer per undone step, with the version, and the file rides the plan commit', async () => {
    fake = withFakeAtis({ reach: [{ path: 'src/server.ts', by: 'import', hops: 1 }] })
    const dir = await started()
    const { code } = await captureIoAsync(() => checkpoint(dir, ['--plan']))
    expect(code).toBe(0)
    const stored = readReach(dir)
    expect(stored?.atis).toBe('9.9.9')
    expect(Object.keys(stored?.steps ?? {})).toEqual(['1', '2']) // step 3 is landed: never asked
    expect(stored?.steps['1']?.paths).toEqual(['src/a.ts', 'src/lib/'])
    expect(stored?.steps['1']?.['head']).toBe('abc123') // the answer is kept verbatim
    expect(stored?.steps['2']?.reach).toEqual([{ path: 'src/server.ts', by: 'import', hops: 1 }])
    expect(fake.calls()).toEqual(['--version', 'reach --json -- src/a.ts src/lib/', 'reach --json -- src/b.ts'])
    expect(git(dir, ['show', '--stat', '--format=', 'HEAD'])).toContain('.plumbbob/builds/reach-test/reach.json')
    expect(git(dir, ['status', '--porcelain'])).not.toContain('reach.json') // committed, not left behind
    const text = readFileSync(reachJsonPath(dir), 'utf8')
    expect(serializeReach(parseStoredReach(text) ?? { atis: '', steps: {} })).toBe(text)
  })

  it('with atis absent, writes nothing and prints what it always printed', async () => {
    const absent = await started()
    const without = await captureIoAsync(() => checkpoint(absent, ['--plan']))
    expect(without.code).toBe(0)
    expect(without.stderr).toBe('')
    expect(existsSync(reachJsonPath(absent))).toBe(false)
    expect(without.stdout).not.toMatch(/atis/i)

    // The same plan with an atis that answers: the ending is the same bytes,
    // sha aside, so the reach never speaks at the plan checkpoint.
    fake = withFakeAtis()
    const present = await started()
    const withAtis = await captureIoAsync(() => checkpoint(present, ['--plan']))
    expect(existsSync(reachJsonPath(present))).toBe(true)
    expect(unsha(withAtis.stdout)).toBe(unsha(without.stdout))
    expect(withAtis.stderr).toBe('')
  })

  it.each([
    ['exits 2', { reachScript: 'exit 2' }],
    ['prints something that is not JSON', { reachScript: 'echo "reach: not a verb"' }],
    ['answers another kind', { kind: 'atis.reach/1' }],
    ['answers another schema version', { schemaVersion: 2 }],
    ['reports no version', { version: '' }],
  ])('with an atis that %s, writes nothing and prints what the absent run prints', async (_name, options) => {
    const absent = await started()
    const without = await captureIoAsync(() => checkpoint(absent, ['--plan']))
    fake = withFakeAtis(options)
    const dir = await started()
    const { code, stdout, stderr } = await captureIoAsync(() => checkpoint(dir, ['--plan']))
    expect(code).toBe(0)
    expect(existsSync(reachJsonPath(dir))).toBe(false)
    expect(unsha(stdout)).toBe(unsha(without.stdout))
    expect(stderr).toBe(without.stderr)
  })

  it('stops at the first call that runs past the timeout, and writes nothing', async () => {
    fake = withFakeAtis({ reachScript: 'sleep 5' })
    const dir = await started()
    const { stdout, stderr } = captureIo(() => {
      refreshReach(dir, undefined, undefined, { reachMs: 200 })
      return 0
    })
    expect(stdout + stderr).toBe('')
    expect(existsSync(reachJsonPath(dir))).toBe(false)
    expect(fake.calls()).toEqual(['--version', 'reach --json -- src/a.ts src/lib/']) // step 2 was never asked
  })

  it('keeps the steps that answered when one step fails', async () => {
    fake = withFakeAtis({ reachScript: 'if [ "$1" = "src/b.ts" ]; then exit 2; fi\necho \'{"schema_version":1,"kind":"atis.reach","paths":["src/a.ts","src/lib/"],"reach":[]}\'' })
    const dir = await started()
    refreshReach(dir)
    expect(Object.keys(readReach(dir)?.steps ?? {})).toEqual(['1'])
  })

  it('hands a seam path that opens on a dash to atis as a path, past a `--`', async () => {
    fake = withFakeAtis()
    const dir = await started(INTENT.replace('`src/a.ts`, `src/lib/`', '`--no-history`, `src/a.ts`'))
    refreshReach(dir, undefined, 1)
    expect(fake.calls()).toEqual(['--version', 'reach --json -- --no-history src/a.ts'])
    expect(readReach(dir)?.steps['1']?.paths).toEqual(['--no-history', 'src/a.ts'])
    const asked = fake.calls().length
    refreshReach(dir, undefined, 1)
    expect(fake.calls()).toHaveLength(asked) // the stored paths are the seam, so it is not asked again
  })
})

describe('build re-asks for a step whose seam moved', () => {
  it('asks nothing when the stored answer still speaks for the seam', async () => {
    fake = withFakeAtis()
    const dir = await started()
    await captureIoAsync(() => checkpoint(dir, ['--plan']))
    const before = readFileSync(reachJsonPath(dir), 'utf8')
    const asked = fake.calls().length
    const { code } = captureIo(() => build(dir, ['1']))
    expect(code).toBe(0)
    expect(fake.calls()).toHaveLength(asked) // atis was not run again
    expect(readFileSync(reachJsonPath(dir), 'utf8')).toBe(before)
  })

  it('rewrites that one step when its seam is no longer the paths it was asked about', async () => {
    fake = withFakeAtis()
    const dir = await started()
    await captureIoAsync(() => checkpoint(dir, ['--plan']))
    const second = readReach(dir)?.steps['2']
    writeFileSync(intentPath(dir), INTENT.replace('`src/a.ts`, `src/lib/`', '`src/a.ts`, `src/lib/`, `src/new.ts`'))
    const asked = fake.calls().length
    const { code } = captureIo(() => build(dir, ['1']))
    expect(code).toBe(0)
    expect(fake.calls().slice(asked)).toEqual(['--version', 'reach --json -- src/a.ts src/lib/ src/new.ts'])
    expect(readReach(dir)?.steps['1']?.paths).toEqual(['src/a.ts', 'src/lib/', 'src/new.ts'])
    expect(readReach(dir)?.steps['2']).toEqual(second)
  })

  it('asks for a step that was never answered, once atis turns up', async () => {
    const dir = await started()
    await captureIoAsync(() => checkpoint(dir, ['--plan'])) // atis absent at plan time
    expect(existsSync(reachJsonPath(dir))).toBe(false)
    fake = withFakeAtis()
    captureIo(() => build(dir, ['2']))
    expect(Object.keys(readReach(dir)?.steps ?? {})).toEqual(['2']) // only the step entered
  })

  it('with atis absent, enters the step with the same output and writes no file', async () => {
    const absent = await started()
    const without = captureIo(() => build(absent, ['1']))
    expect(without.code).toBe(0)
    expect(existsSync(reachJsonPath(absent))).toBe(false)
    fake = withFakeAtis()
    const present = await started()
    const withAtis = captureIo(() => build(present, ['1']))
    expect(withAtis).toEqual(without)
  })
})

describe('the pause splits the diff once a reach is stored', () => {
  /** A step 1 in flight with a stored reach of `src/server.ts`, and the given files changed. */
  async function paused(files: ReadonlyArray<string>): Promise<string> {
    fake = withFakeAtis({ reach: [{ path: 'src/server.ts', by: 'import', hops: 1 }] })
    const dir = await started()
    await captureIoAsync(() => checkpoint(dir, ['--plan']))
    captureIo(() => build(dir, ['1']))
    for (const file of files) {
      work(dir, file)
    }
    writeFileSync(detailPath(dir), DETAIL)
    return dir
  }

  it('prints the plumb row in the seam row\'s place, and names the file outside both', async () => {
    const dir = await paused(['src/a.ts', 'src/lib/x.ts', 'src/server.ts', 'src/routes/admin.ts'])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('\nplumb        seam 2 · reach 1 · out 1 (src/routes/admin.ts)\n')
    expect(stdout).not.toContain('\nseam         ')
    expect(stdout).toContain('◐ A hair off (seam strayed)')
  })

  it('holds when every changed file is in the seam or the reach', async () => {
    const dir = await paused(['src/a.ts', 'src/server.ts'])
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).toContain('\nplumb        seam 1 · reach 1 · out 0\n')
    expect(stdout).not.toContain('A hair off')
  })

  it('falls back to the seam row when the stored answer was asked for another seam', async () => {
    const dir = await paused(['src/a.ts', 'src/server.ts'])
    writeFileSync(seamPath(dir), 'src/a.ts\n') // the seam in flight is no longer what atis was asked
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).not.toContain('\nplumb        ')
    expect(stdout).toContain('\nseam         strayed: 1 path outside the seam\n             → src/server.ts\n')
  })

  it('lands a reach-only file with no drift advisory and no drift stat', async () => {
    const dir = await paused(['src/a.ts', 'src/server.ts'])
    const { code, stdout } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    expect(stdout).not.toContain('reach outside')
    expect(stdout).not.toContain('seam strayed')
    expect(readStats(dir)['1']?.driftWarnings).toBeUndefined()
  })

  it('names and counts a file outside both at the checkpoint, the way a seam stray is', async () => {
    const dir = await paused(['src/a.ts', 'src/server.ts', 'src/routes/admin.ts'])
    const { code, stdout } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    expect(stdout).toContain("Staged paths reach outside Step 1's seam and its reach ⚠ (src/routes/admin.ts)")
    expect(stdout).toContain('src/routes/admin.ts')
    expect(stdout).not.toContain('src/server.ts')
    expect(stdout).toContain('◐ A hair off (seam strayed)')
    expect(readStats(dir)['1']?.driftWarnings).toBe(1)
  })
})

describe('with no reach stored, the pause is byte for byte what it was', () => {
  it('renders the same card whether or not an atis is on PATH', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '1\n')
    writeFileSync(seamPath(dir), 'src/a.ts\nsrc/lib/\n')
    work(dir, 'src/a.ts')
    work(dir, 'src/routes/admin.ts')
    writeFileSync(detailPath(dir), DETAIL)
    const without = captureIo(() => handoff(dir, ['--full']))
    expect(without.stdout).toContain('\nseam         strayed: 1 path outside the seam\n             → src/routes/admin.ts\n')
    expect(without.stdout).not.toContain('\nplumb ')

    fake = withFakeAtis({ reach: [{ path: 'src/routes/admin.ts', by: 'import', hops: 1 }] })
    const withAtis = captureIo(() => handoff(dir, ['--full']))
    expect(withAtis).toEqual(without) // handoff never asks; only a stored answer changes a row
    expect(fake.calls()).toEqual([])
    expect(existsSync(reachJsonPath(dir))).toBe(false)
  })

  it('reads a reach.json that does not parse as no reach at all', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '1\n')
    writeFileSync(seamPath(dir), 'src/a.ts\n')
    work(dir, 'src/a.ts')
    writeFileSync(detailPath(dir), DETAIL)
    const without = captureIo(() => handoff(dir, ['--full']))
    writeFileSync(reachJsonPath(dir), '{ not json')
    expect(captureIo(() => handoff(dir, ['--full']))).toEqual(without)
  })
})

describe('doctor — reach', () => {
  it('says atis is optional when it is absent, and names its version when it is found, the exit code unmoved', async () => {
    const dir = makeTempRepo()
    const without = await captureIoAsync(() => doctor(dir, []))
    expect(without.stdout).toContain(
      "\n\nplumbbob doctor — reach — D155 (reach-is-computed)\n  ○ atis: not on PATH (optional; without it the pause reads a step's diff against its seam alone)\n",
    )
    fake = withFakeAtis()
    const withAtis = await captureIoAsync(() => doctor(dir, []))
    expect(withAtis.stdout).toContain("\n  ✓ atis 9.9.9: the pause splits a step's diff into seam, reach, and out\n")
    expect(withAtis.code).toBe(without.code)
  })
})
