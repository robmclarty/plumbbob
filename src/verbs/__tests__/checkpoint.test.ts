import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkpoint } from '../checkpoint.ts'
import { start } from '../start.ts'
import { buildLogPath, checkpointsPath, configPath, intentPath, readState } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

const INTENT = `# Checkpoint test

## Steps

1. [ ] First — **done when:** a works.
   - seam: \`src/a.ts\`
`

// A started session with one planned step and a green stub gate. The sidecar is
// git-excluded, so overwriting intent/config does not dirty the tree.
function startedGreen(): string {
  const dir = makeTempRepo()
  captureIo(() => start(dir, ['Checkpoint test']))
  writeFileSync(intentPath(dir), INTENT)
  writeFileSync(configPath(dir), 'check=true\n')
  return dir
}

describe('checkpoint', () => {
  it('commits pending work, records the SHA, flips the step, returns to DESIGN', () => {
    const dir = startedGreen()
    writeFileSync(join(dir, 'work.txt'), 'pending\n') // dirty the tracked tree
    const { code, stdout } = captureIo(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    expect(readState(dir)).toBe('DESIGN')
    expect(readFileSync(checkpointsPath(dir), 'utf8')).toMatch(/step 1 [0-9a-f]{40}/)
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]')
    expect(stdout).toContain('step 1 checkpointed')
  })

  it("appends a dated history line to the build-log's Log, naming the step", () => {
    const dir = startedGreen()
    captureIo(() => checkpoint(dir, ['1']))
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toMatch(/- \d{4}-\d{2}-\d{2} — step 1 checkpointed · [0-9a-f]{9} — First/)
  })

  it('refuses on a red check', () => {
    const dir = startedGreen()
    writeFileSync(configPath(dir), 'check=false\n')
    const { code, stderr } = captureIo(() => checkpoint(dir, ['1']))
    expect(code).toBe(1)
    expect(stderr).toContain('check failed')
  })

  it('resolves the first undone step when none is given (clean tree records HEAD)', () => {
    const dir = startedGreen()
    const { code } = captureIo(() => checkpoint(dir, []))
    expect(code).toBe(0)
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x]')
  })

  it('refuses with no active session', () => {
    expect(captureIo(() => checkpoint(makeTempRepo(), ['1'])).code).toBe(1)
  })
})
