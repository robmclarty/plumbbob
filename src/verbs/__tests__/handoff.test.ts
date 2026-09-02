import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { handoff } from '../handoff.ts'
import { start } from '../start.ts'
import { checkpointsPath, detailPath, intentPath, seamPath, statsPath, stepPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Step 1 done, 2 and 3 planned; step 3 carries a `- model:` recommendation and
// opens on line 9, which is where Next Up's `details:` pointer must land. Two
// constraints, since the CLI reads that count for the constraints row.
const INTENT = `# Handoff test

## Steps

1. [x] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`
3. [ ] Third — **done when:** c works.
   - seam: \`src/c.ts\`
   - model: sonnet — mechanical

## Constraints

- <a id="c1"></a>**C1 (no-new-deps)**: no new dependencies.
- <a id="c2"></a>**C2 (markdown-only)**: it has to read as plain text too.
`

const THIRD_STEP_LINE = 9

// What the model writes above its numbered detail sections: the lead handoff
// labels, and the section titles it renders as the highlights.
const SUMMARY = `
## Summary

The limiter runs before credentials are checked.

## 1 \`POST /login\` returns 429 on the 6th attempt inside a minute.

The full story.

## 2 Misses count against the bucket; a success does not reset it.

The rest of it.
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

type CheckEntry = { name: string; ok: boolean; skipped?: boolean; output_file?: string | null }

function writeCheckSummary(dir: string, ok: boolean, checks: ReadonlyArray<CheckEntry>, totalMs?: number): void {
  mkdirSync(join(dir, '.check'), { recursive: true })
  const summary = { schema_version: 1, ok, checks_run: checks.length, total_duration_ms: totalMs, checks }
  writeFileSync(join(dir, '.check', 'summary.json'), JSON.stringify(summary))
}

/** The `details:` target Next Up points at for step 3: the intent path as a human would type it. */
function thirdStepPointer(dir: string): string {
  return `${relative(dir, intentPath(dir))}:${THIRD_STEP_LINE}`
}

function git(dir: string, args: ReadonlyArray<string>): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
}

/** Land a commit with `body` on the fixture repo, so the out-of-band count has something to see. */
function commitWith(dir: string, file: string, subject: string, body: string): void {
  writeFileSync(join(dir, file), `${subject}\n`)
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', subject, '-m', body])
}

describe('handoff', () => {
  it('renders the whole decision-tier ending, labeled lines and blank lines included', async () => {
    // The canonical pause, asserted whole: this is the shape every other test
    // here only checks one part of.
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'README.md\n')
    writeFileSync(join(dir, 'README.md'), `# fixture\n${Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join('\n')}\n`)
    writeFileSync(detailPath(dir), `${GREEN_RECAP}${SUMMARY}\n## recommendation\n\nApprove it. The seam held and the gate is green.\n`)
    writeCheckSummary(dir, true, [{ name: 'lint', ok: true }, { name: 'types', ok: true }, { name: 'test', ok: true }], 63_000)
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toBe(
      [
        '**Summary**: The limiter runs before credentials are checked. (details: `.plumbbob/detail.md`)',
        '',
        '1. `POST /login` returns 429 on the 6th attempt inside a minute.',
        '2. Misses count against the bucket; a success does not reset it.',
        '',
        '**Readout**: Step 2 - Second',
        '',
        '```text',
        'check        green: 3 of 3 checks',
        'done-when    met',
        'decisions    1 of 1 honored',
        'constraints  2 of 2 honored',
        'seam         held: 1 of 1 declared, no strays',
        'diff         +25 -0 across 1 file',
        'spent        63s gate · green first run',
        '```',
        '',
        '**Verdict**: ● Plumb',
        '',
        `**Next Up**: Step 3 of 3 - Third (model: **Sonnet**, details: \`${thirdStepPointer(dir)}\`)`,
        '',
        '**Your Call**:',
        '',
        '- `looks good` → I checkpoint step 2; back to the boundary',
        '- `expand`, or any question → I show more of what is there; nothing changes',
        '- anything that reads as direction → I take it as what to change; nothing lands until you approve',
        '- `revert` → I wind the work back to the last checkpoint',
        '',
        '**Recommendation**: Approve it. The seam held and the gate is green.',
        '',
        '',
      ].join('\n'),
    )
    expect(stdout).not.toContain('── recap') // the header rule left the rendering; the label carries the identity
  })

  it('numbers each highlight by its own section handle, so `expand 2` opens `## 2`', async () => {
    // The handles are the model's, passed through: renumbering them by position
    // would silently break the one move the Your Call block offers.
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), '## Summary\n\nOne line.\n\n## 1 First move\n\nthe story\n\n## 2 Second move\n\nthe rest\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('**Summary**: One line. (details: `.plumbbob/detail.md`)\n\n1. First move\n2. Second move\n\n')).toBe(true)
  })

  it('unwraps a hard-wrapped Summary lead, keeping its paragraph breaks', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), '## Summary\n\nThe limiter runs first,\nand nothing else moved.\n\nThe step needed the extra breath.\n\n## 1 A move\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain(
      '**Summary**: The limiter runs first, and nothing else moved.\n\nThe step needed the extra breath. (details: `.plumbbob/detail.md`)',
    )
  })

  it('renders the lead alone when the step has no numbered sections', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), '## Summary\n\nOne line covers it.\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('**Summary**: One line covers it. (details: `.plumbbob/detail.md`)\n\n**Verdict**')).toBe(true)
  })

  it('vanishes the Summary block when the detail file carries no lead', async () => {
    // A label over nothing is worse than no label; the rest of the ending stands.
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), `${GREEN_RECAP}\n## 1 A move\n\nthe story\n`)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).not.toContain('**Summary**')
    expect(stdout).not.toContain('1. A move')
    expect(stdout.startsWith('**Readout**: Step 2 - Second\n')).toBe(true)
  })

  it('leaves the Summary out of the boundary and driver tiers, where nothing is pending', async () => {
    const dir = await started()
    writeFileSync(checkpointsPath(dir), 'step 2 abc1234\n')
    writeFileSync(detailPath(dir), '## Summary\n\nA lead the boundary never shows.\n\n## 1 A move\n')
    expect(captureIo(() => handoff(dir, [])).stdout).not.toContain('**Summary**')
    expect(captureIo(() => handoff(dir, ['--driver'])).stdout).not.toContain('**Summary**')
  })

  it('keeps every readout line inside 80 columns', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { stdout } = captureIo(() => handoff(dir, []))
    const fence = stdout.split('```text\n')[1]?.split('```')[0] ?? ''
    expect(fence.length).toBeGreaterThan(0)
    for (const line of fence.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80)
    }
  })

  it('at the pause, with nothing measured yet, renders no readout and omits the looks-good move', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n') // step 2 in flight, no detail.md, no .check/summary.json
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('**Verdict**: ● Plumb')
    expect(stdout).not.toContain('**Readout**')
    expect(stdout).not.toContain('looks good')
    expect(stdout).toContain('- `revert` → I wind the work back to the last checkpoint')
  })

  it('at the boundary (no step in flight), renders the verdict and next-up line but no your-call block', async () => {
    const dir = await started()
    writeFileSync(checkpointsPath(dir), 'step 2 abc1234\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('**Verdict**: ● Plumb')
    expect(stdout).toContain(`**Next Up**: Step 3 of 3 - Third (model: **Sonnet**, details: \`${thirdStepPointer(dir)}\`)`)
    expect(stdout).not.toContain('**Your Call**')
    expect(stdout).not.toContain('**Readout**')
  })

  it('names the worst component in the verdict parenthetical, with no step segment', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    writeFileSync(statsPath(dir), JSON.stringify({ '2': { redChecks: 2 } }))
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('**Verdict**: ◐ A hair off (2 red runs before green)')
    expect(stdout).not.toContain('Step 2 of 3') // the identity renders once, on the Readout and Next Up
  })

  it('folds a strayed seam row into an out-of-plumb verdict naming the seam', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(
      detailPath(dir),
      GREEN_RECAP.replace('seam         held: 1 file, all inside', 'seam         strayed: src/other.ts outside the seam'),
    )
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('**Verdict**: ○ Out of plumb (seam strayed)')
  })

  it('folds a drifted done-when row into a not-standing verdict', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(
      detailPath(dir),
      GREEN_RECAP.replace('done-when    met: b works', 'done-when    drift: the plan no longer matches reality'),
    )
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('**Verdict**: ✗ Not standing (done-when drifted)')
  })

  it('measures a red check over a green attested row, pointing at the failing slot output', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP) // the model attested green...
    writeCheckSummary(dir, false, [
      { name: 'lint', ok: true },
      { name: 'test', ok: false, output_file: 'test.json' },
    ]) // ...but the measured run is red
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('check        red: test failing\n             → .check/test.json')
    expect(stdout).toContain('**Verdict**: ○ Out of plumb (check red)')
    expect(stdout).not.toContain('looks good')
  })

  it('collapses two or more failing slots to a count, listing them under the row', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeCheckSummary(dir, false, [
      { name: 'lint', ok: false, output_file: 'lint.json' },
      { name: 'types', ok: true },
      { name: 'test', ok: false, output_file: 'test.json' },
    ])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain(
      ['check        red: 2 of 3 checks failing', '             - lint', '             - test', '             → .check/summary.json'].join(
        '\n',
      ),
    )
  })

  it('omits the model clause when the next step has no recommendation, keeping the details pointer', async () => {
    const noModel = INTENT.replace('   - model: sonnet — mechanical\n', '')
    const dir = await started(noModel)
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain(`**Next Up**: Step 3 of 3 - Third (details: \`${thirdStepPointer(dir)}\`)`)
    expect(stdout).not.toContain('model:')
  })

  it('reports no planned steps remain when everything is done', async () => {
    const allDone = INTENT.replace('2. [ ]', '2. [x]').replace('3. [ ]', '3. [x]')
    const dir = await started(allDone)
    writeFileSync(checkpointsPath(dir), 'step 3 abc1234\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('**Next Up**: Nothing planned - /plumbbob:step or /plumbbob:finish')
  })

  it('lets an explicit step number override the derived current step', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n') // in-flight is 2…
    writeFileSync(detailPath(dir), GREEN_RECAP)
    const { code, stdout } = captureIo(() => handoff(dir, ['1'])) // …but ask about 1
    expect(code).toBe(0)
    expect(stdout).toContain('**Readout**: Step 1 - First')
    expect(stdout).toContain('**Next Up**: Step 2 of 3 - Second')
  })

  it('with no step in flight and no checkpoint yet, emits only the forward pointer and no verdict', async () => {
    // Fresh session (planned, nothing built): there is nothing measured, so the
    // ending degrades to the "Next Up" line alone.
    const dir = await started()
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe(`**Next Up**: Step 2 of 3 - Second (details: \`${relative(dir, intentPath(dir))}:7\`)`)
  })

  it('treats a whitespace-only model recommendation as none', async () => {
    // `- model:` with only trailing space trims to empty in parseSteps; the model
    // token guard must read that as "no recommendation", not print an empty clause.
    const blankModel = INTENT.replace('   - model: sonnet — mechanical\n', '   - model:   \n')
    const dir = await started(blankModel)
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('**Next Up**: Step 3 of 3 - Third (details:')
    expect(stdout).not.toContain('model:')
  })

  it('ends every ending with a trailing blank line, so the next output cannot clobber it', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout.endsWith('\n\n')).toBe(true)
  })

  it('renders the plan-pause ending under --plan: no verdict, and the plan moves', async () => {
    // The plan pause judges the plan, not a diff: nothing is measured, and
    // nothing is recorded yet, so `revert` has nothing to wind back to.
    const planned = INTENT.replace('1. [x] First', '1. [ ] First')
    const dir = await started(planned)
    const { code, stdout } = captureIo(() => handoff(dir, ['--plan']))
    expect(code).toBe(0)
    expect(stdout).not.toContain('Plumb')
    expect(stdout.startsWith('\n---\n\n**Next Up**: Step 1 of 3 - First')).toBe(true) // the one tier that still opens on the seam rule: the plan is presented above it
    expect(stdout).toContain('- `looks good` → I mark the plan decided; /plumbbob:build starts step 1')
    expect(stdout).toContain('- `expand`, or any question → I show more of what is there; nothing changes')
    expect(stdout).toContain('- anything that reads as direction → I take it as what to sharpen; the plan is cheap to change now')
    expect(stdout).not.toContain('revert')
    expect(stdout.endsWith('\n\n')).toBe(true)
  })

  it('points --plan at the first undone step, so a mid-build refine names where the build resumes', async () => {
    const dir = await started() // step 1 done, 2 and 3 planned
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--plan']))
    expect(code).toBe(0)
    expect(stdout).toContain('**Next Up**: Step 2 of 3 - Second')
    expect(stdout).toContain('/plumbbob:build starts step 2')
  })

  it('renders the driver next-up line under --driver, pointing back at the step still in flight', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('**Next Up**: Back to step 2 of 3 - Second') // no seam rule: nothing of the model's precedes a driver pointer
    expect(stdout.endsWith('\n\n')).toBe(true)
  })

  it('falls back to the forward pointer under --driver with no step in flight', async () => {
    const dir = await started()
    writeFileSync(checkpointsPath(dir), 'step 2 abc1234\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe(`**Next Up**: Step 3 of 3 - Third (model: **Sonnet**, details: \`${thirdStepPointer(dir)}\`)`)
  })

  it('names the step number alone when the plan no longer holds the in-flight step', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '9\n') // a step the plan does not contain
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('**Next Up**: Back to step 9') // no "of 3": the count would be a lie
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

  it('sizes the seam row by the declared tokens the diff actually touched', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'README.md\nsrc/b.ts\n') // two declared, one touched
    writeFileSync(join(dir, 'README.md'), '# fixture\nchanged\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('seam         held: 1 of 2 declared, no strays')
  })

  it('replaces an attested seam row with its own stray measurement, pointing at the one path', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'src/b.ts\n') // the granted seam…
    writeFileSync(join(dir, 'README.md'), '# fixture\nchanged\n') // …and a change outside it
    writeFileSync(detailPath(dir), GREEN_RECAP) // the model attested `held`
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('seam         strayed: 1 path outside the seam\n             → README.md')
    expect(stdout).toContain('**Verdict**: ○ Out of plumb (seam strayed)')
  })

  it('lists two or more strays under the row instead of naming one', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'src/b.ts\n')
    writeFileSync(join(dir, 'other.md'), '# other\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'add other'])
    writeFileSync(join(dir, 'README.md'), '# fixture\nchanged\n')
    writeFileSync(join(dir, 'other.md'), '# other\nmore\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('seam         strayed: 2 paths outside the seam\n             - README.md\n             - other.md')
  })

  it('carries the gate verdict in the check row as a count, naming a narrowed gate', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeCheckSummary(dir, true, [
      { name: 'lint', ok: true },
      { name: 'types', ok: true },
      { name: 'test', ok: true, skipped: true },
    ])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('check        green: 2 of 3 checks · without test')
    expect(stdout).not.toContain('plumbbob: check') // the standalone verdict line left the anatomy
  })

  it('collapses a long list of deselected slots to its count, keeping the row inside its budget', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const skipped = ['struct', 'dead', 'links', 'refs', 'types', 'docs', 'prose', 'mutation', 'coverage']
    writeCheckSummary(dir, true, [{ name: 'lint', ok: true }, ...skipped.map((name) => ({ name, ok: true, skipped: true }))])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    const row = stdout.split('\n').find((l) => l.startsWith('check'))
    expect(row).toBe('check        green: 1 of 10 checks · without 9 others')
    expect((row ?? '').length).toBeLessThanOrEqual(80)
  })

  it('collapses the judgment rows the model wrote, reading the constraint count from intent.md', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('done-when    met') // the Summary above is its evidence
    expect(stdout).toContain('decisions    1 of 1 honored')
    expect(stdout).toContain('constraints  2 of 2 honored') // both declared under `## Constraints`
  })

  it('carries a judgment row\'s continuation lines through the detail file into the readout', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(
      detailPath(dir),
      GREEN_RECAP.replace(
        'constraints  all honored\n',
        ['constraints  bent: C1 (no-new-deps), a dep rode in', '             - C2 (markdown-only), the fence lost its rails', '             → .plumbbob/detail.md', ''].join('\n'),
      ),
    )
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain(
      [
        'constraints  bent: C1 (no-new-deps), a dep rode in',
        '             - C2 (markdown-only), the fence lost its rails',
        '             → .plumbbob/detail.md',
      ].join('\n'),
    )
    expect(stdout).toContain('**Verdict**: ○ Out of plumb (constraints bent)')
  })

  it('renders the spent row from stats.json and the last gate', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(
      statsPath(dir),
      JSON.stringify({ '2': { startedAt: '2026-09-02T10:00:00.000Z', landedAt: '2026-09-02T11:28:00.000Z', redChecks: 2, driftWarnings: 1 } }),
    )
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }], 63_400)
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('spent        88 min · 63s gate · 2 red runs · 1 drift warning')
  })

  it('vanishes the spent row when there is nothing to count', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP)
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).not.toContain('spent')
  })

  it('leaves plumbbob\'s own plan commits out of the out-of-band count', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const anchor = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    writeFileSync(checkpointsPath(dir), `step 1 ${anchor}\n`)
    commitWith(dir, 'plan.txt', 'chore(plan): harvest the boundary', 'plumbbob plan')
    const { stdout: quiet } = captureIo(() => handoff(dir, []))
    expect(quiet).toContain('**Verdict**: ● Plumb') // routine housekeeping is not an advisory
    commitWith(dir, 'other.txt', 'fix: something the human did', 'no marker here')
    const { stdout: noisy } = captureIo(() => handoff(dir, []))
    expect(noisy).toContain('**Verdict**: ◐ A hair off (1 commit outside the ledger)')
  })

  it('unwraps a hard-wrapped recommendation so it flows at the renderer width', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(
      detailPath(dir),
      `${GREEN_RECAP}\n## recommendation\n\nApprove it. The gate is green\nand the seam held,\nso nothing blocks the land.\n`,
    )
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('**Recommendation**: Approve it. The gate is green and the seam held, so nothing blocks the land.')
  })

  it('labels the recommendation on the plan pause too, as the ending of a decision turn', async () => {
    const dir = await started()
    writeFileSync(detailPath(dir), '## recommendation\n\nDecide it. Every open question is closed.\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--plan']))
    expect(code).toBe(0)
    expect(stdout).toContain('**Your Call**:')
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
