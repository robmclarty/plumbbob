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
  })

  it('rejects a non-numeric step', () => {
    expect(captureIo(() => build(startedWithSteps(), ['nope'])).code).toBe(1)
  })

  it('reports a step with no parseable seam', () => {
    expect(captureIo(() => build(startedWithSteps(), ['9'])).code).toBe(1)
  })

  it('refuses with no active session', () => {
    expect(captureIo(() => build(makeTempRepo(), ['1'])).code).toBe(1)
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
