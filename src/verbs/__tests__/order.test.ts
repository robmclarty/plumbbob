import { readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { order } from '../order.ts'
import { start } from '../start.ts'
import { activeBuild, intentPath, stepPath } from '../../lib/sidecar.ts'
import { blocks, ending, transition } from '../../lib/notice.ts'
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

  it('reads spans beside numbers, with or without a space after a comma, and spells them out', async () => {
    const dir = await started()
    for (const args of [['4,', '2-3'], ['4,2-3'], ['4', '2-3']]) {
      const { code, stdout } = captureIo(() => order(dir, args))
      expect(code).toBe(0)
      expect(stdout).toContain('**Build order**: 4, 2, 3')
    }
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('## Build order\n\n4, 2, 3\n\n## Open questions')
  })

  it('refuses a backward span, a span past the plan, one over a landed step, and one that repeats a number', async () => {
    const dir = await started()
    expect(captureIo(() => order(dir, ['3-2'])).stderr).toContain('`3-2` is not a step number or span')
    expect(captureIo(() => order(dir, ['2-100000'])).stderr).toContain('no step 5 in the plan')
    expect(captureIo(() => order(dir, ['1-2'])).stderr).toContain('step 1 is already checkpointed')
    expect(captureIo(() => order(dir, ['2-3,', '3'])).stderr).toContain('step 3 is listed twice')
    expect(readFileSync(intentPath(dir), 'utf8')).toBe(INTENT)
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

// Range 1 has landed and its stop found step 5, a blocker that has to land
// before step 2: the plan as the harvest left it, before the order places it.
const RANGED = `# Order test

## Steps

1. [x] First — **done when:** a works.
2. [ ] Second — **done when:** b works.
3. [ ] Third — **done when:** c works.
4. [ ] Fourth — **done when:** d works.
5. [ ] Fifth — **done when:** the blocker is fixed.

## Build ranges

1. \`/plumbbob:build 1\`, **stop:** at step 1's pause, approve it
2. \`/plumbbob:build 2-3\`, **stop:** review the parser
   - model: opus
3. \`/plumbbob:build 4-4\`, **stop:** the final read

## Open questions
`

async function ranged(intent = RANGED): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Order test']))
  writeFileSync(intentPath(dir), intent)
  return dir
}

describe('order re-cuts the build ranges — D109 (ranges-follow-the-order)', () => {
  it('puts a step ordered next in the range it builds ahead of, and names the re-cut in its ending', async () => {
    const dir = await ranged()
    const { code, stdout } = captureIo(() => order(dir, ['5', '2', '3', '4']))
    expect(code).toBe(0)
    const intent = readFileSync(intentPath(dir), 'utf8')
    // Only the command moved: the stop and the model line stay as written.
    expect(intent).toContain('2. `/plumbbob:build 5,2-3`, **stop:** review the parser\n   - model: opus')
    expect(intent).toContain('## Build order\n\n5, 2, 3, 4\n')
    expect(stdout).toBe(
      ending({
        lead: blocks([
          transition({ label: 'Build order', fact: '5, 2, 3, 4' }),
          transition({ label: 'Build ranges', fact: 'range 2 of 3 re-cut', detail: ['steps 5,2-3'] }),
        ]),
        pointer: driverPointer(dir, activeBuild(dir)),
      }),
    )
    expect(stdout).toContain('**Build ranges**: range 2 of 3 re-cut (steps 5,2-3)')
  })

  it('names each range it re-cut, and --reset re-cuts them back to the numbering', async () => {
    const dir = await ranged()
    captureIo(() => order(dir, ['5', '2', '3', '4']))
    const { code, stdout } = captureIo(() => order(dir, ['--reset']))
    expect(code).toBe(0)
    // In document order step 5 builds last, so it joins the last range.
    expect(stdout).toContain('**Build order**: document order\n\n**Build ranges**: ranges 2, 3 of 3 re-cut (range 2: steps 2-3, range 3: steps 4-5)')
    const intent = readFileSync(intentPath(dir), 'utf8')
    expect(intent).toContain('2. `/plumbbob:build 2-3`')
    expect(intent).toContain('3. `/plumbbob:build 4-5`')
    expect(intent).not.toContain('## Build order')
  })

  it('says nothing of the ranges when the order changes none of them', async () => {
    // Every step already sits in a range, and the order only re-sequences inside range 2.
    const dir = await ranged(RANGED.replace('build 4-4`', 'build 4-5`'))
    const { stdout } = captureIo(() => order(dir, ['3', '2', '4', '5']))
    expect(stdout).toContain('**Build order**: 3, 2, 4, 5\n\n**Next Up**')
    expect(stdout).not.toContain('Build ranges')
    expect(stdout).not.toContain('⚠')
  })

  it('names a step the order puts where no range can take it, with the move that re-cuts the ranges by hand', async () => {
    // Range 3 is a bare call, and step 5 ordered ahead of it has no open range before it.
    const dir = await ranged(RANGED.replace('build 4-4`, **stop:** the final read', "build 4`, **stop:** at step 4's pause, decide it"))
    const { code, stdout } = captureIo(() => order(dir, ['5', '4', '2', '3']))
    expect(code).toBe(0)
    expect(stdout).not.toContain('**Build ranges**')
    expect(stdout).toContain('**Build order**: 5, 4, 2, 3\n\nNo range names step 5 ⚠\n  → /plumbbob:refine ranges\n\n**Next Up**')
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('2. `/plumbbob:build 2-3`')
  })
})
