import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { start } from '../start.ts'
import { hasSession } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

describe('start', () => {
  it('scaffolds the sidecar and opens the session on a clean repo', () => {
    const dir = makeTempRepo()
    const { code, stdout } = captureIo(() => start(dir, ['My Feature']))
    expect(code).toBe(0)
    expect(hasSession(dir)).toBe(true)
    expect(existsSync(join(dir, '.plumbbob', 'intent.md'))).toBe(true)
    expect(readFileSync(join(dir, '.plumbbob', 'checkpoints'), 'utf8')).toMatch(/^baseline [0-9a-f]{40}\n$/)
    expect(stdout).toContain('started "My Feature"')
  })

  it('scaffolds settings.json (not the retired config file) with check and auto keys', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    expect(existsSync(join(dir, '.plumbbob', 'config'))).toBe(false)
    const settings = JSON.parse(readFileSync(join(dir, '.plumbbob', 'settings.json'), 'utf8')) as {
      check: string
      auto: boolean
    }
    expect(settings.check).toBe('pnpm run check')
    expect(settings.auto).toBe(false)
  })

  it('rejects an empty title', () => {
    const dir = makeTempRepo()
    const { code, stderr } = captureIo(() => start(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('needs a title')
    expect(hasSession(dir)).toBe(false)
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
    expect(hasSession(dir)).toBe(true)
  })

  it('refuses a second session', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['first']))
    const { code, stderr } = captureIo(() => start(dir, ['second']))
    expect(code).toBe(1)
    expect(stderr).toContain('already active')
  })
})
