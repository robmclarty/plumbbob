import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { start } from '../start.ts'
import { readState } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

describe('start', () => {
  it('scaffolds the sidecar and enters DESIGN on a clean repo', () => {
    const dir = makeTempRepo()
    const { code, stdout } = captureIo(() => start(dir, ['My Feature']))
    expect(code).toBe(0)
    expect(readState(dir)).toBe('DESIGN')
    expect(existsSync(join(dir, '.plumbbob', 'intent.md'))).toBe(true)
    expect(readFileSync(join(dir, '.plumbbob', 'checkpoints'), 'utf8')).toMatch(/^baseline [0-9a-f]{40}\n$/)
    expect(stdout).toContain('started "My Feature"')
  })

  it('rejects an empty title', () => {
    const dir = makeTempRepo()
    const { code, stderr } = captureIo(() => start(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('needs a title')
    expect(readState(dir)).toBeNull()
  })

  it('rejects a non-git directory', () => {
    const { code, stderr } = captureIo(() => start(makeTempDir(), ['x']))
    expect(code).toBe(1)
    expect(stderr).toContain('not a git repository')
  })

  it('rejects a repo with no commits', () => {
    const { code, stderr } = captureIo(() => start(makeTempRepo({ commit: false }), ['x']))
    expect(code).toBe(1)
    expect(stderr).toContain('no commits yet')
  })

  it('refuses a dirty tree unless --allow-dirty', () => {
    const dir = makeTempRepo()
    writeFileSync(join(dir, 'README.md'), '# dirty\n')
    expect(captureIo(() => start(dir, ['x'])).code).toBe(1)
    const { code, stderr } = captureIo(() => start(dir, ['--allow-dirty', 'x']))
    expect(code).toBe(0)
    expect(stderr).toContain('--allow-dirty')
    expect(readState(dir)).toBe('DESIGN')
  })

  it('refuses a second session', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['first']))
    const { code, stderr } = captureIo(() => start(dir, ['second']))
    expect(code).toBe(1)
    expect(stderr).toContain('already active')
  })
})
