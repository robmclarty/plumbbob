import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from '../build.ts'
import { start } from '../start.ts'
import { buildDir, intentPath, seamPath, stepPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

const INTENT = `# Build test

## Steps

1. [ ] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`, \`src/c.ts\`
`

function startedWithSteps(): string {
  const dir = makeTempRepo()
  captureIo(() => start(dir, ['Build test']))
  writeFileSync(intentPath(dir), INTENT)
  return dir
}

describe('build', () => {
  it('writes the seam + step and goes in-flight (the BUILD phase signal)', () => {
    const dir = startedWithSteps()
    const { code, stdout } = captureIo(() => build(dir, ['2']))
    expect(code).toBe(0)
    expect(readFileSync(seamPath(dir), 'utf8')).toBe('src/b.ts\nsrc/c.ts\n')
    expect(readFileSync(stepPath(dir), 'utf8').trim()).toBe('2')
    expect(stdout).toContain('building step 2')
    // The seam is printed indented, one path per line, under the not-a-lock banner.
    expect(stdout).toContain('not a lock):\n  src/b.ts\n  src/c.ts')
  })

  it('rejects a non-numeric, mixed, or sub-1 step with the usage message', () => {
    // Each shape trips a different validation clause: no digits, digits at the
    // wrong end (both ends), and a number below 1.
    for (const bad of ['nope', 'x2', '2x', '0']) {
      const { code, stderr } = captureIo(() => build(startedWithSteps(), [bad]))
      expect(code).toBe(1)
      expect(stderr).toContain('build needs a step number')
    }
  })

  it('accepts a multi-digit step number as a number, not a stray token', () => {
    // Step 12 does not exist in the intent — but it must reach seam parsing,
    // not bounce off the step-number validation.
    const { code, stderr } = captureIo(() => build(startedWithSteps(), ['12']))
    expect(code).toBe(1)
    expect(stderr).not.toContain('build needs a step number')
    expect(stderr).toContain('`build 12` again')
  })

  it('skips flag args when finding the step number', () => {
    const dir = startedWithSteps()
    const { code } = captureIo(() => build(dir, ['--quiet', '2']))
    expect(code).toBe(0)
    expect(readFileSync(stepPath(dir), 'utf8').trim()).toBe('2')
  })

  it('reports a step with no parseable seam, pointing at intent.md', () => {
    const { code, stderr } = captureIo(() => build(startedWithSteps(), ['9']))
    expect(code).toBe(1)
    expect(stderr).toContain("Fix the step's seam in intent.md, then `build 9` again.")
  })

  it('refuses with no active session — and says so', () => {
    const { code, stderr } = captureIo(() => build(makeTempRepo(), ['1']))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })

  it('targets a non-cursor build with --build, landing SEAM/STEP in that folder', () => {
    const dir = startedWithSteps() // cursor build is `build-test`
    const alt = buildDir(dir, 'alt-build')
    mkdirSync(alt, { recursive: true })
    writeFileSync(join(alt, 'intent.md'), INTENT)

    const { code } = captureIo(() => build(dir, ['--build', 'alt-build', '2']))
    expect(code).toBe(0)
    // the slug is a bare token after --build; it must not be read as the step number
    expect(readFileSync(join(alt, 'SEAM'), 'utf8')).toBe('src/b.ts\nsrc/c.ts\n')
    expect(readFileSync(join(alt, 'STEP'), 'utf8').trim()).toBe('2')
    expect(existsSync(seamPath(dir))).toBe(false) // the cursor build was not touched
  })
})
