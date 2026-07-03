import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { use } from '../use.ts'
import { start } from '../start.ts'
import { buildDir, stepPath } from '../../lib/sidecar.ts'
import { localSetting } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Plant a second, resumable build folder alongside the one `start` created, so a
// switch has somewhere to go (in the real flow the prior build is left by finish).
function seedBuild(dir: string, slug: string): void {
  const d = buildDir(dir, slug)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'intent.md'), `# ${slug}\n\n## Steps\n\n1. [ ] Do it — **done when:** ok\n   - seam: \`src/\`\n`)
  writeFileSync(join(d, 'checkpoints'), 'baseline deadbeef\n')
}

describe('use', () => {
  it('re-points the activeBuild cursor at an existing build', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    seedBuild(dir, 'other-build')
    const { code, stdout, stderr } = captureIo(() => use(dir, ['other-build']))
    expect(code).toBe(0)
    expect(localSetting(dir, 'activeBuild')).toBe('other-build')
    // Exact tail: no in-flight note when the target has no STEP file.
    expect(stdout).toContain('now on build "other-build". `status` to orient.')
    // And no in-flight warning when the build being left has none either.
    expect(stderr).not.toContain('step in flight')
  })

  it('skips flag args when finding the slug', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    seedBuild(dir, 'other-build')
    const { code } = captureIo(() => use(dir, ['--quiet', 'other-build']))
    expect(code).toBe(0)
    expect(localSetting(dir, 'activeBuild')).toBe('other-build')
  })

  it('treats an empty slug as missing, not as a build lookup', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    const { code, stderr } = captureIo(() => use(dir, ['']))
    expect(code).toBe(1)
    expect(stderr).toContain('use needs a build slug')
  })

  it('refuses a slug with no matching build folder, listing the real ones', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    const { code, stderr } = captureIo(() => use(dir, ['ghost']))
    expect(code).toBe(1)
    expect(stderr).toContain('no build named "ghost"')
    expect(stderr).toContain('Builds: my-feature.')
    expect(localSetting(dir, 'activeBuild')).toBe('my-feature') // unchanged
  })

  it('needs a slug', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    const { code, stderr } = captureIo(() => use(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('use needs a build slug')
  })

  it('warns — but still switches — when the build being left has a step in flight (D4/D16)', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    writeFileSync(stepPath(dir), '2\n') // my-feature has a step in flight
    seedBuild(dir, 'other-build')
    const { code, stderr } = captureIo(() => use(dir, ['other-build']))
    expect(code).toBe(0)
    expect(stderr).toContain('has a step in flight')
    expect(stderr).toContain('resumes when you `use my-feature`') // points back at the door
    expect(localSetting(dir, 'activeBuild')).toBe('other-build')
  })

  it('does not warn when re-using the current build, even mid-step', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout, stderr } = captureIo(() => use(dir, ['my-feature']))
    expect(code).toBe(0)
    expect(stderr).not.toContain('step in flight') // you are not leaving anything
    expect(stdout).toContain('a step is in flight') // but the resume note still lands
  })

  it('notes the in-flight step when resuming a build that has one', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['My Feature']))
    seedBuild(dir, 'other-build')
    writeFileSync(join(buildDir(dir, 'other-build'), 'STEP'), '1\n')
    const { code, stdout } = captureIo(() => use(dir, ['other-build']))
    expect(code).toBe(0)
    expect(stdout).toContain('a step is in flight')
  })

  it('refuses with no active session — and says so, not some later error', () => {
    const { code, stderr } = captureIo(() => use(makeTempRepo(), ['whatever']))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})
