import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  beginSession,
  buildLogPath,
  checkpointsPath,
  clearSpike,
  configPath,
  excludeSidecar,
  hasSession,
  inSpike,
  intentPath,
  markSpike,
  seamPath,
  sidecarDir,
  spikePath,
  stepPath,
} from '../sidecar.ts'
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
    expect(configPath(root)).toBe('/tmp/x/.plumbbob/config')
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
