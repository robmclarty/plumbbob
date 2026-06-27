import { readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from '../build.ts'
import { start } from '../start.ts'
import { intentPath, readState, seamPath, stepPath } from '../../lib/sidecar.ts'
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
  it('writes the seam + step and enters BUILD', () => {
    const dir = startedWithSteps()
    const { code, stdout } = captureIo(() => build(dir, ['2']))
    expect(code).toBe(0)
    expect(readState(dir)).toBe('BUILD')
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
})
