import { mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  buildLogPath,
  checkpointsPath,
  configPath,
  excludeSidecar,
  hasSession,
  intentPath,
  readState,
  seamPath,
  sidecarDir,
  stepPath,
  writeState,
} from '../sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

describe('path helpers', () => {
  it('all resolve under <root>/.plumbbob', () => {
    const root = '/tmp/x'
    expect(sidecarDir(root)).toBe('/tmp/x/.plumbbob')
    expect(seamPath(root)).toBe('/tmp/x/.plumbbob/SEAM')
    expect(stepPath(root)).toBe('/tmp/x/.plumbbob/STEP')
    expect(checkpointsPath(root)).toBe('/tmp/x/.plumbbob/checkpoints')
    expect(configPath(root)).toBe('/tmp/x/.plumbbob/config')
    expect(intentPath(root)).toBe('/tmp/x/.plumbbob/intent.md')
    expect(buildLogPath(root)).toBe('/tmp/x/.plumbbob/build-log.md')
  })
})

describe('session state', () => {
  it('round-trips STATE and reports session presence', () => {
    const dir = makeTempRepo()
    mkdirSync(sidecarDir(dir), { recursive: true })
    expect(hasSession(dir)).toBe(false)
    expect(readState(dir)).toBeNull()
    writeState(dir, 'BUILD')
    expect(hasSession(dir)).toBe(true)
    expect(readState(dir)).toBe('BUILD')
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
})
