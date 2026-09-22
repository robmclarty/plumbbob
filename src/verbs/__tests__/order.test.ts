import { readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { order } from '../order.ts'
import { start } from '../start.ts'
import { activeBuild, intentPath, stepPath } from '../../lib/sidecar.ts'
import { ending, transition } from '../../lib/notice.ts'
import { driverPointer } from '../handoff.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Step 1 landed, three left: the plan a refine has just appended step 4 to,
// where 4 has to go before 3.
const INTENT = `# Order test

## Steps

1. [x] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`
3. [ ] Third — **done when:** c works.
   - seam: \`src/c.ts\`
4. [ ] Fourth — **done when:** d works.
   - seam: \`src/d.ts\`

## Open questions

- Q1: something
`

async function started(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Order test']))
  writeFileSync(intentPath(dir), INTENT)
  return dir
}

describe('order', () => {
  it('writes the whole remaining sequence under ## Build order and prints its ending', async () => {
    const dir = await started()
    const { code, stdout } = captureIo(() => order(dir, ['4', '3']))
    expect(code).toBe(0)
    // The listed steps first, then the undone rest in document order; the
    // landed step 1 is history and stays out of the line.
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('## Build order\n\n4, 3, 2\n\n## Open questions')
    expect(stdout).toBe(
      ending({
        lead: transition({ label: 'Build order', fact: '4, 3, 2' }),
        pointer: driverPointer(dir, activeBuild(dir)),
      }),
    )
    // The pointer already follows the order just written: forward from the
    // boundary to step 4, not to step 2.
    expect(stdout).toContain('**Next Up**: Step 4 of 4 - Fourth')
  })

  it('reads comma-separated numbers the same as spaced ones, and replaces the line in place', async () => {
    const dir = await started()
    captureIo(() => order(dir, ['4', '3']))
    const { code } = captureIo(() => order(dir, ['3,2']))
    expect(code).toBe(0)
    const intent = readFileSync(intentPath(dir), 'utf8')
    expect(intent).toContain('## Build order\n\n3, 2, 4\n')
    expect(intent).not.toContain('4, 3, 2')
    expect(intent.match(/## Build order/g)).toHaveLength(1)
  })

  it('points back at the step in flight when one is open: the order is a driver turn', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => order(dir, ['4', '3']))
    expect(code).toBe(0)
    expect(stdout).toContain('**Build order**: 4, 3, 2')
    expect(stdout).toContain('**Next Up**: Back to Step 2 of 4 - Second')
  })

  it('--reset drops the line, and the plan reads in document order again', async () => {
    const dir = await started()
    captureIo(() => order(dir, ['4', '3']))
    const { code, stdout } = captureIo(() => order(dir, ['--reset']))
    expect(code).toBe(0)
    expect(readFileSync(intentPath(dir), 'utf8')).toBe(INTENT)
    expect(stdout).toContain('**Build order**: document order')
    expect(stdout).toContain('**Next Up**: Step 2 of 4 - Second')
  })

  it('refuses a number the plan lacks, naming what is planned, and writes nothing', async () => {
    const dir = await started()
    const { code, stderr } = captureIo(() => order(dir, ['4', '9']))
    expect(code).toBe(1)
    expect(stderr).toContain('no step 9 in the plan')
    expect(stderr).toContain('planned: 1, 2, 3, 4')
    expect(readFileSync(intentPath(dir), 'utf8')).toBe(INTENT)
  })

  it('refuses a repeated number and a step already checkpointed', async () => {
    const dir = await started()
    expect(captureIo(() => order(dir, ['4', '4'])).stderr).toContain('step 4 is listed twice')
    expect(captureIo(() => order(dir, ['1', '4'])).stderr).toContain('step 1 is already checkpointed')
    expect(readFileSync(intentPath(dir), 'utf8')).toBe(INTENT)
  })

  it('refuses with no numbers, a token that is not a number, and no active session', async () => {
    const dir = await started()
    expect(captureIo(() => order(dir, [])).stderr).toContain('order needs step numbers')
    expect(captureIo(() => order(dir, ['4', 'then', '3'])).stderr).toContain('`then` is not a step number')
    expect(captureIo(() => order(makeTempRepo(), ['2'])).stderr).toContain('no active session')
  })
})
