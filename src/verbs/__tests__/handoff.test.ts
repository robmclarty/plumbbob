import { writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { handoff } from '../handoff.ts'
import { start } from '../start.ts'
import { checkpointsPath, intentPath, stepPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Step 1 done, 2 and 3 planned; step 3 carries a `- model:` recommendation.
const INTENT = `# Handoff test

## Steps

1. [x] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`
3. [ ] Third — **done when:** c works.
   - seam: \`src/c.ts\`
   - model: sonnet — mechanical
`

async function started(intent = INTENT): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Handoff test']))
  writeFileSync(intentPath(dir), intent)
  return dir
}

describe('handoff', () => {
  it('at the pause (a step in flight) shows the built step, the choice, and the next step + model', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n') // step 2 in flight
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('Step 2 (Second) is built')
    expect(stdout).toContain('looks good')
    expect(stdout).toContain('needs work')
    expect(stdout).toContain('Next up: step 3 (Third)')
    // The model clause shows the token (not the verbatim rationale) for the /model call.
    expect(stdout).toContain('model: sonnet')
    expect(stdout).toContain('/model sonnet')
  })

  it('at the boundary (no step in flight) shows the checkpointed step and points at the next', async () => {
    const dir = await started()
    writeFileSync(checkpointsPath(dir), 'step 2 abc1234\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('Step 2 (Second) checkpointed')
    expect(stdout).toContain('Next up: step 3 (Third)')
  })

  it('omits the model clause when the next step has no recommendation', async () => {
    const noModel = INTENT.replace('   - model: sonnet — mechanical\n', '')
    const dir = await started(noModel)
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('Next up: step 3 (Third)')
    expect(stdout).not.toContain('model:')
    expect(stdout).toContain('/pb-build to start it')
  })

  it('reports no planned steps remain when everything is done', async () => {
    const allDone = INTENT.replace('2. [ ]', '2. [x]').replace('3. [ ]', '3. [x]')
    const dir = await started(allDone)
    writeFileSync(checkpointsPath(dir), 'step 3 abc1234\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('No planned steps remain')
  })

  it('lets an explicit step number override the derived current step', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n') // in-flight is 2…
    const { code, stdout } = captureIo(() => handoff(dir, ['1'])) // …but ask about 1
    expect(code).toBe(0)
    expect(stdout).toContain('Step 1 (First) is built')
    expect(stdout).toContain('Next up: step 2 (Second)')
  })

  it('with no step in flight and no checkpoint yet, emits only the forward pointer', async () => {
    // Fresh session (planned, nothing built): there is no just-done step to label,
    // so the block degrades to the "Next up" line alone.
    const dir = await started()
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('Next up: step 2 (Second)')
    expect(stdout).not.toContain('is built')
    expect(stdout).not.toContain('checkpointed')
  })

  it('treats a whitespace-only model recommendation as none', async () => {
    // `- model:` with only trailing space trims to empty in parseSteps; the model
    // token guard must read that as "no recommendation", not print an empty clause.
    const blankModel = INTENT.replace('   - model: sonnet — mechanical\n', '   - model:   \n')
    const dir = await started(blankModel)
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('Next up: step 3 (Third)')
    expect(stdout).not.toContain('model:')
    expect(stdout).toContain('/pb-build to start it')
  })

  it('refuses with no active session', async () => {
    const { code, stderr } = captureIo(() => handoff(makeTempRepo(), []))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})
