import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { use } from '../use.ts'
import { ending, transition } from '../../lib/notice.ts'
import { start } from '../start.ts'
import { activeBuild, buildDir, stepPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

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
  it('re-points the activeBuild cursor at an existing build', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature', '--slug', 'my-feature']))
    seedBuild(dir, 'other-build')
    const { code, stdout, stderr } = captureIo(() => use(dir, ['other-build']))
    expect(code).toBe(0)
    expect(activeBuild(dir)).toBe('other-build')
    // Exact ending: no in-flight note when the target has no STEP file, and the
    // pointer aims into the build just switched to.
    expect(stdout).toBe(
      ending({
        lead: transition({ label: 'Active build', fact: 'other-build' }),
        pointer: '**Next Up**: Step 1 of 1 - Do it (details: `.plumbbob/builds/other-build/intent.md:5`)',
      }),
    )
    // And no in-flight warning when the build being left has none either.
    expect(stderr).toBe('')
    expect(stdout).not.toContain('step in flight')
  })

  it('skips flag args when finding the slug', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature', '--slug', 'my-feature']))
    seedBuild(dir, 'other-build')
    const { code } = captureIo(() => use(dir, ['--quiet', 'other-build']))
    expect(code).toBe(0)
    expect(activeBuild(dir)).toBe('other-build')
  })

  it('treats an empty slug as missing, not as a build lookup', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature', '--slug', 'my-feature']))
    const { code, stderr } = captureIo(() => use(dir, ['']))
    expect(code).toBe(1)
    expect(stderr).toContain('use needs a build slug')
  })

  it('refuses a slug with no matching build folder, listing the real ones', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature', '--slug', 'my-feature']))
    const { code, stderr } = captureIo(() => use(dir, ['ghost']))
    expect(code).toBe(1)
    expect(stderr).toContain('no build named "ghost"')
    expect(stderr).toContain('(my-feature)') // the real builds ride the detail parenthetical
    expect(activeBuild(dir)).toBe('my-feature') // unchanged
  })

  it('needs a slug', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature', '--slug', 'my-feature']))
    const { code, stderr } = captureIo(() => use(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('use needs a build slug')
  })

  it('warns — but still switches — when the build being left has a step in flight — D30 (use-to-switch)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature', '--slug', 'my-feature']))
    writeFileSync(stepPath(dir), '2\n') // my-feature has a step in flight
    seedBuild(dir, 'other-build')
    const { code, stdout } = captureIo(() => use(dir, ['other-build']))
    expect(code).toBe(0)
    expect(stdout).toContain('Build "my-feature" has a step in flight')
    expect(stdout).toContain('→ plumbbob use my-feature to pick it back up') // points back at the door
    expect(activeBuild(dir)).toBe('other-build')
  })

  it('does not warn when re-using the current build, even mid-step', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature', '--slug', 'my-feature']))
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout, stderr } = captureIo(() => use(dir, ['my-feature']))
    expect(code).toBe(0)
    expect(stderr).not.toContain('step in flight') // you are not leaving anything
    expect(stdout).toContain('a step is in flight') // but the resume note still lands
  })

  it('notes the in-flight step when resuming a build that has one', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['My Feature', '--slug', 'my-feature']))
    seedBuild(dir, 'other-build')
    writeFileSync(join(buildDir(dir, 'other-build'), 'STEP'), '1\n')
    const { code, stdout } = captureIo(() => use(dir, ['other-build']))
    expect(code).toBe(0)
    expect(stdout).toContain('a step is in flight')
  })

  it('refuses with no active session — and says so, not some later error', async () => {
    const { code, stderr } = captureIo(() => use(makeTempRepo(), ['whatever']))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})
