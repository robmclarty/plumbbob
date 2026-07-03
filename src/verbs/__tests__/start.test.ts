import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { start } from '../start.ts'
import { buildDir, hasSession } from '../../lib/sidecar.ts'
import { localSetting } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

describe('start', () => {
  it('scaffolds a tracked builds/<slug>/ folder and opens the session on a clean repo', () => {
    const dir = makeTempRepo()
    const { code, stdout } = captureIo(() => start(dir, ['My Feature']))
    expect(code).toBe(0)
    expect(hasSession(dir)).toBe(true)
    const build = join(dir, '.plumbbob', 'builds', 'my-feature')
    expect(existsSync(join(build, 'intent.md'))).toBe(true)
    expect(existsSync(join(build, 'build-log.md'))).toBe(true)
    expect(readFileSync(join(build, 'checkpoints'), 'utf8')).toMatch(/^baseline [0-9a-f]{40}\n$/)
    expect(stdout).toContain('started "My Feature"')
    expect(stdout).toContain('.plumbbob/builds/my-feature/intent.md')
  })

  it('points the settings.local.json activeBuild cursor at the new build (D3)', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    expect(localSetting(dir, 'activeBuild')).toBe('my-feature')
  })

  it('narrows info/exclude to the control patterns, tracking the artifact plane', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    const exclude = readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8').split('\n')
    expect(exclude).toContain('.plumbbob/settings.local.json')
    expect(exclude).toContain('.plumbbob/builds/*/SEAM')
    expect(exclude).not.toContain('.plumbbob/')
  })

  it('refuses when the derived slug collides with an existing build (D17)', () => {
    const dir = makeTempRepo()
    mkdirSync(buildDir(dir, 'my-feature'), { recursive: true }) // a prior build already owns the slug
    const { code, stderr } = captureIo(() => start(dir, ['My Feature']))
    expect(code).toBe(1)
    expect(stderr).toContain('already exists')
    expect(hasSession(dir)).toBe(false)
  })

  it('honors an explicit --slug over the title', () => {
    const dir = makeTempRepo()
    const { code } = captureIo(() => start(dir, ['My Feature', '--slug', 'custom-name']))
    expect(code).toBe(0)
    expect(existsSync(join(dir, '.plumbbob', 'builds', 'custom-name', 'intent.md'))).toBe(true)
    expect(localSetting(dir, 'activeBuild')).toBe('custom-name')
  })

  it('refuses when the title yields an empty slug and no --slug is given', () => {
    const dir = makeTempRepo()
    const { code, stderr } = captureIo(() => start(dir, ['!!! ???']))
    expect(code).toBe(1)
    expect(stderr).toContain('could not derive a build slug')
    expect(hasSession(dir)).toBe(false)
  })

  it('--local scaffolds the fully-untracked flat layout with no cursor (D13)', () => {
    const dir = makeTempRepo()
    const { code, stdout } = captureIo(() => start(dir, ['My Feature', '--local']))
    expect(code).toBe(0)
    expect(existsSync(join(dir, '.plumbbob', 'intent.md'))).toBe(true)
    expect(existsSync(join(dir, '.plumbbob', 'builds'))).toBe(false)
    expect(localSetting(dir, 'activeBuild')).toBeUndefined()
    expect(stdout).toContain('.plumbbob/intent.md')
    const exclude = readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8').split('\n')
    expect(exclude).toContain('.plumbbob/')
  })

  it('scaffolds settings.json with auto only — no check key, absence means checkride (D32)', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    expect(existsSync(join(dir, '.plumbbob', 'config'))).toBe(false)
    const settings = JSON.parse(readFileSync(join(dir, '.plumbbob', 'settings.json'), 'utf8')) as {
      check?: string
      auto: boolean
    }
    expect(settings.check).toBeUndefined()
    expect(settings.auto).toBe(false)
  })

  it('echoes the checkride gate into the scaffolded build-log (documentation only)', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    const log = readFileSync(join(dir, '.plumbbob', 'builds', 'my-feature', 'build-log.md'), 'utf8')
    expect(log).toContain('checkride')
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
