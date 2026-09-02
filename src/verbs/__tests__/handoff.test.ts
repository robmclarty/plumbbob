import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { handoff } from '../handoff.ts'
import { start } from '../start.ts'
import { checkpointsPath, detailPath, intentPath, seamPath, statsPath, stepPath } from '../../lib/sidecar.ts'
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

const GREEN_RECAP = `── recap · step 2 of 3 ──
check        green (checkride: lint, types, test)
done-when    met: b works
decisions    honored: D1 (some-decision)
constraints  all honored
seam         held: 1 file, all inside
diff         +10 -2 across 1 file
`

async function started(intent = INTENT): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Handoff test']))
  writeFileSync(intentPath(dir), intent)
  return dir
}

function writeCheckSummary(dir: string, ok: boolean, checks: ReadonlyArray<{ name: string; ok: boolean; skipped?: boolean }>): void {
  mkdirSync(join(dir, '.check'), { recursive: true })
  writeFileSync(join(dir, '.check', 'summary.json'), JSON.stringify({ schema_version: 1, ok, checks_run: checks.length, checks }))
}

describe('handoff', () => {
  it('at the pause, with a green recap and a measured green check, renders the plumb banner and the full your-call block', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n') // step 2 in flight
    writeFileSync(detailPath(dir), GREEN_RECAP)
    writeCheckSummary(dir, true, [
      { name: 'lint', ok: true },
      { name: 'types', ok: true },
      { name: 'test', ok: true },
    ])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('● Plumb: Step 2 of 3')
    expect(stdout).toContain('Next Up: Step 3 - Third (model: Sonnet)')
    expect(stdout).toContain('Your Call:')
    expect(stdout).toContain('  looks good  → I checkpoint step 2; back to the boundary')
    expect(stdout).toContain('  needs work  → Tell me what to change; nothing lands until you approve')
    expect(stdout).toContain('  revert      → I wind the work back to the last checkpoint')
  })

  it('at the pause, with nothing measured yet, still renders a plumb banner but omits the looks-good move', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n') // step 2 in flight, no detail.md, no .check/summary.json
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('● Plumb: Step 2 of 3')
    expect(stdout).not.toContain('looks good')
    expect(stdout).toContain('needs work')
    expect(stdout).toContain('revert')
  })

  it('at the boundary (no step in flight), renders the banner and next-up line but no your-call block', async () => {
    const dir = await started()
    writeFileSync(checkpointsPath(dir), 'step 2 abc1234\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('● Plumb: Step 2 of 3')
    expect(stdout).toContain('Next Up: Step 3 - Third (model: Sonnet)')
    expect(stdout).not.toContain('Your Call:')
  })

  it('folds a strayed seam row into an out-of-plumb banner naming the seam', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(
      detailPath(dir),
      GREEN_RECAP.replace('seam         held: 1 file, all inside', 'seam         strayed: src/other.ts outside the seam'),
    )
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('○ Out of plumb: seam strayed · Step 2 of 3')
  })

  it('folds a drifted done-when row into a not-standing banner', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(
      detailPath(dir),
      GREEN_RECAP.replace('done-when    met: b works', 'done-when    drift: the plan no longer matches reality'),
    )
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('✗ Not standing: done-when drifted · Step 2 of 3')
  })

  it('folds accrued red-check runs into an a-hair-off banner', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    writeFileSync(statsPath(dir), JSON.stringify({ '2': { redChecks: 2 } }))
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('◐ A hair off: 2 red runs before green · Step 2 of 3')
  })

  it('measures a red check over a green attested row (measured beats attested)', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP) // model attested green...
    writeCheckSummary(dir, false, [
      { name: 'lint', ok: true },
      { name: 'test', ok: false },
    ]) // ...but the measured run is red
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('○ Out of plumb: check red · Step 2 of 3')
    expect(stdout).not.toContain('looks good')
  })

  it('omits the model clause when the next step has no recommendation', async () => {
    const noModel = INTENT.replace('   - model: sonnet — mechanical\n', '')
    const dir = await started(noModel)
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('Next Up: Step 3 - Third')
    expect(stdout).not.toContain('model:')
  })

  it('reports no planned steps remain when everything is done', async () => {
    const allDone = INTENT.replace('2. [ ]', '2. [x]').replace('3. [ ]', '3. [x]')
    const dir = await started(allDone)
    writeFileSync(checkpointsPath(dir), 'step 3 abc1234\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('Next Up: Nothing planned - /plumbbob:step or /plumbbob:finish')
  })

  it('lets an explicit step number override the derived current step', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n') // in-flight is 2…
    const { code, stdout } = captureIo(() => handoff(dir, ['1'])) // …but ask about 1
    expect(code).toBe(0)
    expect(stdout).toContain('Step 1 of 3')
    expect(stdout).toContain('Next Up: Step 2 - Second')
  })

  it('with no step in flight and no checkpoint yet, emits only the forward pointer and no banner', async () => {
    // Fresh session (planned, nothing built): there is nothing measured, so the
    // card degrades to the "Next Up" line alone.
    const dir = await started()
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('Next Up: Step 2 - Second')
  })

  it('treats a whitespace-only model recommendation as none', async () => {
    // `- model:` with only trailing space trims to empty in parseSteps; the model
    // token guard must read that as "no recommendation", not print an empty clause.
    const blankModel = INTENT.replace('   - model: sonnet — mechanical\n', '   - model:   \n')
    const dir = await started(blankModel)
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('Next Up: Step 3 - Third')
    expect(stdout).not.toContain('model:')
  })

  it('ends every card with a trailing blank line, so the next output cannot clobber it', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout.endsWith('\n\n')).toBe(true)
  })

  it('renders the plan-pause card under --plan: no banner, and the two plan moves', async () => {
    // The plan pause judges the plan, not a diff: nothing is measured, and
    // nothing is recorded yet, so `revert` has nothing to wind back to.
    const planned = INTENT.replace('1. [x] First', '1. [ ] First')
    const dir = await started(planned)
    const { code, stdout } = captureIo(() => handoff(dir, ['--plan']))
    expect(code).toBe(0)
    expect(stdout).not.toContain('Plumb')
    expect(stdout).toContain('Next Up: Step 1 - First')
    expect(stdout).toContain('  looks good  → I mark the plan decided; /plumbbob:build starts step 1')
    expect(stdout).toContain('  needs work  → Tell me what to sharpen; the plan is cheap to change now')
    expect(stdout).not.toContain('revert')
    expect(stdout.endsWith('\n\n')).toBe(true)
  })

  it('points --plan at the first undone step, so a mid-build refine names where the build resumes', async () => {
    const dir = await started() // step 1 done, 2 and 3 planned
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--plan']))
    expect(code).toBe(0)
    expect(stdout).toContain('Next Up: Step 2 - Second')
    expect(stdout).toContain('/plumbbob:build starts step 2')
  })

  it('renders the driver next-up line under --driver, pointing back at the step still in flight', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('Next Up: Back to step 2 - Second')
    expect(stdout.endsWith('\n\n')).toBe(true)
  })

  it('falls back to the forward pointer under --driver with no step in flight', async () => {
    const dir = await started()
    writeFileSync(checkpointsPath(dir), 'step 2 abc1234\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('Next Up: Step 3 - Third (model: Sonnet)')
  })

  it('names the step number alone when the plan no longer holds the in-flight step', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '9\n') // a step the plan does not contain
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('Next Up: Back to step 9')
  })

  it('computes the diff row from numstat and rides a small change inline', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'README.md\n')
    writeFileSync(join(dir, 'README.md'), '# fixture\nchanged\n') // one added line against the initial commit
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('diff         +1 -0 across 1 file · inline below')
    expect(stdout).toContain('```diff')
    expect(stdout).toContain('+changed')
  })

  it('keeps a diff past 20 lines out of the block, behind its counted row', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'README.md\n')
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join('\n')
    writeFileSync(join(dir, 'README.md'), `# fixture\n${lines}\n`)
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('diff         +25 -0 across 1 file')
    expect(stdout).not.toContain('inline below')
    expect(stdout).not.toContain('```diff')
  })

  it('computes the seam row from the SEAM marker against the work-plane diff', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'README.md\n')
    writeFileSync(join(dir, 'README.md'), '# fixture\nchanged\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('seam         held: 1 file, all inside')
  })

  it('replaces an attested seam row with its own stray measurement (measured beats attested)', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'src/b.ts\n') // the granted seam…
    writeFileSync(join(dir, 'README.md'), '# fixture\nchanged\n') // …and a change outside it
    writeFileSync(detailPath(dir), GREEN_RECAP) // the model attested `held`
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('seam         strayed: README.md outside the seam')
    expect(stdout).toContain('○ Out of plumb: seam strayed · Step 2 of 3')
  })

  it('carries the gate verdict in the check row, naming a narrowed gate', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeCheckSummary(dir, true, [
      { name: 'lint', ok: true },
      { name: 'types', ok: true },
      { name: 'test', ok: true, skipped: true },
    ])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('check        green (checkride: lint, types · without test)')
    expect(stdout).not.toContain('plumbbob: check') // the standalone verdict line left the anatomy
  })

  it('collapses a long slot list to its count, keeping the row inside 72 columns', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const names = ['lint', 'struct', 'dead', 'links', 'refs', 'types', 'docs', 'prose', 'test']
    writeCheckSummary(
      dir,
      true,
      names.map((name) => ({ name, ok: true })),
    )
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    const row = stdout.split('\n').find((l) => l.startsWith('check'))
    expect(row).toBe('check        green (checkride: 9 checks)')
    expect((row ?? '').length).toBeLessThanOrEqual(72)
  })

  it('re-emits the judgment rows parsed from the detail file inside the assembled fence', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('done-when    met: b works')
    expect(stdout).toContain('decisions    honored: D1 (some-decision)')
    expect(stdout).toContain('constraints  all honored')
  })

  it('assembles the recap fence, the card, and the labeled recommendation as one block, in that order', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'README.md\n')
    writeFileSync(join(dir, 'README.md'), '# fixture\nchanged\n')
    writeFileSync(detailPath(dir), `${GREEN_RECAP}\n## recommendation\n\nApprove it. The seam held and the gate is green.\n`)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('```text\n── recap · step 2 of 3 ──')).toBe(true)
    expect(stdout.indexOf('── recap')).toBeLessThan(stdout.indexOf('● Plumb'))
    expect(stdout.indexOf('Your Call:')).toBeLessThan(stdout.indexOf('Approve it'))
    expect(stdout).toContain('```\n\n**Recommendation**: Approve it. The seam held and the gate is green.') // after the card fence, unfenced, labeled
    expect(stdout.trimEnd().endsWith('Approve it. The seam held and the gate is green.')).toBe(true)
    expect(stdout.endsWith('\n\n')).toBe(true)
  })

  it('unwraps a hard-wrapped recommendation so it flows at the renderer width', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), `${GREEN_RECAP}\n## recommendation\n\nApprove it: the gate is green\nand the seam held,\nso nothing blocks the land.\n`)
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('**Recommendation**: Approve it: the gate is green and the seam held, so nothing blocks the land.')
  })

  it('labels the recommendation on the plan pause too, as the ending of a decision turn', async () => {
    const dir = await started()
    writeFileSync(detailPath(dir), '## recommendation\n\nDecide it. Every open question is closed.\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--plan']))
    expect(code).toBe(0)
    expect(stdout).toContain('Your Call:')
    expect(stdout.trimEnd().endsWith('**Recommendation**: Decide it. Every open question is closed.')).toBe(true)
  })

  it('refuses --plan and --driver together, since they name different tiers', async () => {
    const dir = await started()
    const { code, stderr } = captureIo(() => handoff(dir, ['--plan', '--driver']))
    expect(code).toBe(1)
    expect(stderr).toContain('different tiers')
  })

  it('refuses with no active session', async () => {
    const { code, stderr } = captureIo(() => handoff(makeTempRepo(), []))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})
