import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  activeBuild,
  beginSession,
  buildDir,
  buildLogPath,
  checkpointsPath,
  clearSpike,
  excludeControl,
  excludeSidecar,
  hasSession,
  inSpike,
  intentPath,
  listBuilds,
  markSpike,
  seamPath,
  sidecarDir,
  slugify,
  spikePath,
  stepPath,
} from '../sidecar.ts'
import { setLocalSetting } from '../settings.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

describe('path helpers', () => {
  it('all resolve under <root>/.plumbbob', () => {
    const root = '/tmp/x'
    expect(sidecarDir(root)).toBe('/tmp/x/.plumbbob')
    expect(seamPath(root)).toBe('/tmp/x/.plumbbob/SEAM')
    expect(stepPath(root)).toBe('/tmp/x/.plumbbob/STEP')
    expect(spikePath(root)).toBe('/tmp/x/.plumbbob/SPIKE')
    expect(checkpointsPath(root)).toBe('/tmp/x/.plumbbob/checkpoints')
    expect(intentPath(root)).toBe('/tmp/x/.plumbbob/intent.md')
    expect(buildLogPath(root)).toBe('/tmp/x/.plumbbob/build-log.md')
  })
})

describe('session sentinel', () => {
  it('beginSession opens the session; presence is the whole signal', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    expect(hasSession(dir)).toBe(false)
    beginSession(dir)
    expect(hasSession(dir)).toBe(true)
  })
})

describe('spike marker', () => {
  it('mark/clear flips inSpike, presence is the whole signal', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    expect(inSpike(dir)).toBe(false)
    markSpike(dir)
    expect(inSpike(dir)).toBe(true)
    clearSpike(dir)
    expect(inSpike(dir)).toBe(false)
  })
})

describe('slugify', () => {
  it('lowercases, collapses non-alphanumerics to single hyphens, and trims', () => {
    expect(slugify('Worktree-proof sidecar restructure')).toBe('worktree-proof-sidecar-restructure')
    expect(slugify('  Add   OAuth 2.0!! ')).toBe('add-oauth-2-0')
    expect(slugify('CamelCase & symbols')).toBe('camelcase-symbols')
  })

  it('yields an empty slug when the title has no alphanumerics (caller must reject)', () => {
    expect(slugify('!!! ??? ---')).toBe('')
  })
})

describe('buildDir', () => {
  it('resolves under <root>/.plumbbob/builds/<slug>', () => {
    expect(buildDir('/tmp/x', 'my-build')).toBe('/tmp/x/.plumbbob/builds/my-build')
  })
})

describe('listBuilds', () => {
  it('is empty before any build folder exists', () => {
    expect(listBuilds(makeTempRepo())).toEqual([])
  })

  it('returns the sorted directory names under builds/, ignoring files', () => {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, 'beta'), { recursive: true })
    mkdirSync(buildDir(dir, 'alpha'), { recursive: true })
    writeFileSync(join(sidecarDir(dir), 'builds', 'stray.txt'), 'x\n')
    expect(listBuilds(dir)).toEqual(['alpha', 'beta'])
  })
})

describe('activeBuild', () => {
  it('prefers an explicit flag over everything else', () => {
    const dir = makeTempRepo()
    setLocalSetting(dir, 'activeBuild', 'from-cursor')
    expect(activeBuild(dir, 'from-flag')).toBe('from-flag')
  })

  it('falls back to the settings.local.json cursor', () => {
    const dir = makeTempRepo()
    setLocalSetting(dir, 'activeBuild', 'the-cursor')
    expect(activeBuild(dir)).toBe('the-cursor')
  })

  it('falls back to the sole build folder when no cursor is set', () => {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, 'only-one'), { recursive: true })
    expect(activeBuild(dir)).toBe('only-one')
  })

  it('is null when there is no cursor and the build is ambiguous or absent', () => {
    const dir = makeTempRepo()
    expect(activeBuild(dir)).toBeNull()
    mkdirSync(buildDir(dir, 'a'), { recursive: true })
    mkdirSync(buildDir(dir, 'b'), { recursive: true })
    expect(activeBuild(dir)).toBeNull()
  })
})

describe('excludeControl', () => {
  it('excludes only the control patterns, leaving the tracked artifact plane visible', () => {
    const dir = makeTempRepo()
    excludeControl(dir)
    excludeControl(dir) // idempotent
    const lines = readFileSync(join(realpathSync(dir), '.git', 'info', 'exclude'), 'utf8').split('\n')
    for (const pattern of [
      '.plumbbob/STATE',
      '.plumbbob/settings.local.json',
      '.plumbbob/builds/*/STEP',
      '.plumbbob/builds/*/SEAM',
      '.plumbbob/builds/*/SPIKE',
    ]) {
      expect(lines.filter((line) => line.trim() === pattern).length).toBe(1)
    }
    // The whole directory is NOT excluded — intent/build-log/checkpoints track.
    expect(lines).not.toContain('.plumbbob/')
  })
})

describe('excludeSidecar', () => {
  it('adds .plumbbob/ to info/exclude exactly once (idempotent)', () => {
    const dir = makeTempRepo()
    excludeSidecar(dir)
    excludeSidecar(dir)
    const exclude = readFileSync(join(realpathSync(dir), '.git', 'info', 'exclude'), 'utf8')
    const hits = exclude.split('\n').filter((line) => line.trim() === '.plumbbob/').length
    expect(hits).toBe(1)
  })

  it('from a linked worktree, writes to the common gitdir exclude git actually reads (D1)', () => {
    const main = makeTempRepo()
    const wt = join(makeTempDir(), 'wt')
    execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', 'wt-sidecar'])

    excludeSidecar(wt)

    // Lands in the common gitdir's exclude — the only file git reads — not the
    // per-worktree gitdir, whose missing info/ was the ENOENT crash this fixes.
    const commonExclude = readFileSync(join(realpathSync(main), '.git', 'info', 'exclude'), 'utf8')
    expect(commonExclude.split('\n')).toContain('.plumbbob/')
  })
})
