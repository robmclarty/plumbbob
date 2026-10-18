import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { abandon } from '../abandon.ts'
import { checkpoint } from '../checkpoint.ts'
import { handoff } from '../handoff.ts'
import { park } from '../park.ts'
import { revert } from '../revert.ts'
import { start } from '../start.ts'
import {
  activeBuild,
  buildLogPath,
  checkpointsPath,
  detailPath,
  intentPath,
  pausePath,
  readRelay,
  relayPath,
  seamPath,
  spikePath,
  statsPath,
  stepPath,
  tickPath,
  turnPath,
} from '../../lib/sidecar.ts'
import { settingsPath } from '../../lib/settings.ts'
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
        '**Now**: Step 2 of 3 - Second',
        '',
        '**Summary**: The limiter runs before credentials are checked. (details: `.plumbbob/detail.md`)',
        '',
        '1. `POST /login` returns 429 on the 6th attempt inside a minute.',
        '2. Misses count against the bucket; a success does not reset it.',
        '',
        '**Readout**:',
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
        '- `looks good` → I checkpoint Step 2; back to the boundary',
        '- `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back',
        '- anything that reads as direction → I take it as what to change; nothing lands until you approve',
        '- `revert` → I wind the work back to the last checkpoint',
        '',
        '**Recommendation**: Approve it. The seam held and the gate is green.',
        '',
        '',
      ].join('\n'),
    )
    expect(stdout).not.toContain('── recap') // the header rule left the rendering; the Now line carries the identity
  })

  it('opens the pause on the step in flight with the count Next Up counts by, and names it nowhere else — D88 (current-step-shown)', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), `${GREEN_RECAP}${SUMMARY}`)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('**Now**: Step 2 of 3 - Second\n\n**Summary**:')).toBe(true)
    expect(stdout).toContain('\n**Readout**:\n\n```text\n') // the label goes bare
    expect(stdout.split('Step 2 of 3')).toHaveLength(2) // once, on the Now line
  })

  it('counts the Now line by the plan, not the build order, so it agrees with Next Up', async () => {
    // Step 4 is built ahead of step 3; both lines still count out of the four
    // steps the plan holds, by number, because a step keeps its number for life.
    const dir = await started(REORDERED)
    writeFileSync(stepPath(dir), '4\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('**Now**: Step 4 of 4 - Fourth\n\n')).toBe(true)
    expect(stdout).toContain('**Next Up**: Step 3 of 4 - Third')
  })

  it('names a step the plan no longer holds by its number alone on the Now line', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '9\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('**Now**: Step 9\n\n')).toBe(true) // no "of 3": the count would be a lie
  })

  it('numbers each highlight by its own section handle, so `expand 2` opens `## 2`', async () => {
    // The handles are the model's, passed through: renumbering them by position
    // would silently break the one move the Your Call block offers.
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), '## Summary\n\nOne line.\n\n## 1 First move\n\nthe story\n\n## 2 Second move\n\nthe rest\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('\n**Summary**: One line. (details: `.plumbbob/detail.md`)\n\n1. First move\n2. Second move\n\n')
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
    expect(stdout.startsWith('**Now**: Step 2 of 3 - Second\n\n**Summary**: One line covers it. (details: `.plumbbob/detail.md`)\n\n**Verdict**')).toBe(true)
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
    expect(stdout.startsWith('**Now**: Step 2 of 3 - Second\n\n**Readout**:\n')).toBe(true)
  })

  it('leaves the Now line and the Summary out of the boundary, driver, and plan tiers, where no step pause is pending', async () => {
    const dir = await started()
    writeFileSync(checkpointsPath(dir), 'step 2 abc1234\n')
    writeFileSync(detailPath(dir), '## Summary\n\nA lead the boundary never shows.\n\n## 1 A move\n')
    for (const args of [[], ['--driver'], ['--plan']]) {
      const { stdout } = captureIo(() => handoff(dir, args))
      expect(stdout).not.toContain('**Summary**')
      expect(stdout).not.toContain('**Now**')
    }
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
    expect(stdout).toContain('**Verdict**: ◐ A hair off (2 red runs before green)\n')
    expect(stdout.split('Step 2 of 3')).toHaveLength(2) // the identity renders once, on the Now line
  })

  it('leads the advisory rung with the seam stray, uncounted, ahead of red runs — D43 (verb-prints-its-ending)', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    // Both accrued; the stray outranks the red runs, and its rung carries no
    // count, because the stat bumps once per checkpoint, not once per path.
    writeFileSync(statsPath(dir), JSON.stringify({ '2': { driftWarnings: 2, redChecks: 2 } }))
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('**Verdict**: ◐ A hair off (seam strayed)')
  })

  it('folds a strayed seam row to a hair off, never out of plumb, and keeps looks good on the card', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(
      detailPath(dir),
      GREEN_RECAP.replace('seam         held: 1 file, all inside', 'seam         strayed: src/other.ts outside the seam'),
    )
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    // The seam is awareness, not a lock: the stray takes the advisory rung and
    // the card still offers the approve move, so the Verdict and the Your Call
    // block cannot disagree about it.
    expect(stdout).toContain('**Verdict**: ◐ A hair off (seam strayed)')
    expect(stdout).toContain('`looks good`')
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

  it('measures an override gate the same way: a one-check summary reads green: 1 of 1 checks and offers looks good', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(detailPath(dir), GREEN_RECAP)
    writeCheckSummary(dir, true, [{ name: 'npm test', ok: true, output_file: 'check.stdout.txt' }])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('check        green: 1 of 1 checks')
    expect(stdout).toContain('`looks good`')
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
    expect(stdout.startsWith('**Now**: Step 1 of 3 - First\n')).toBe(true)
    expect(stdout).toContain('**Next Up**: Step 2 of 3 - Second')
  })

  it('renders the pause for a named step that has not landed, with nothing in flight (a hand-built diff under verify)', async () => {
    // `/plumbbob:verify` on a diff built outside `/plumbbob:build` finds no STEP
    // marker; naming the step is how it asks for that step's pause.
    const dir = await started() // step 1 landed; 2 and 3 undone; nothing in flight
    writeFileSync(
      detailPath(dir),
      `# Detail · Step 2 · Second\n\n${GREEN_RECAP}${SUMMARY}\n## Recommendation\n\nApprove it. It does what step 2 asks.\n`,
    )
    const { code, stdout } = captureIo(() => handoff(dir, ['2']))
    expect(code).toBe(0)
    expect(stdout).toContain('**Summary**: The limiter runs before credentials are checked.')
    expect(stdout.startsWith('**Now**: Step 2 of 3 - Second\n')).toBe(true)
    expect(stdout).toContain('**Next Up**: Step 3 of 3 - Third')
    expect(stdout).toContain('**Your Call**:')
    expect(stdout).toContain('**Recommendation**: Approve it. It does what step 2 asks.')
  })

  it('keeps the boundary for a named step that has landed, or one the plan does not hold, with nothing in flight', async () => {
    const dir = await started()
    writeFileSync(checkpointsPath(dir), 'step 1 abc1234\n')
    const landed = captureIo(() => handoff(dir, ['1'])).stdout
    expect(landed).toContain('**Verdict**:')
    expect(landed).not.toContain('**Your Call**')
    expect(landed).not.toContain('**Readout**')
    expect(landed).not.toContain('**Now**')
    expect(captureIo(() => handoff(dir, ['9'])).stdout).not.toContain('**Your Call**')
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
    expect(stdout).toContain('- `looks good` → I mark the plan decided; /plumbbob:build starts Step 1')
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
    expect(stdout).toContain('/plumbbob:build starts Step 2')
  })

  it('renders the driver next-up line under --driver, pointing back at the step still in flight', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('**Next Up**: Back to Step 2 of 3 - Second') // no seam rule: nothing of the model's precedes a driver pointer
    expect(stdout.endsWith('\n\n')).toBe(true)
  })

  it('falls back to the forward pointer under --driver with no step in flight', async () => {
    const dir = await started()
    writeFileSync(checkpointsPath(dir), 'step 2 abc1234\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe(`**Next Up**: Step 3 of 3 - Third (model: **Sonnet**, details: \`${thirdStepPointer(dir)}\`)`)
  })

  it('points at closing the spike under --driver, with the interrupted step as the trailing clause', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(spikePath(dir), 'active\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    // The spike outranks the step it interrupted, so it is the move the pointer names.
    expect(stdout.trim()).toBe('**Next Up**: Close the spike - /plumbbob:spike done, then back to Step 2')
  })

  it('names closing the spike alone when one was opened at the boundary', async () => {
    const dir = await started()
    writeFileSync(spikePath(dir), 'active\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('**Next Up**: Close the spike - /plumbbob:spike done') // nothing in flight to come back to
  })

  it('ends a step exit on the forward pointer with no Verdict, since nothing landed', async () => {
    const dir = await started()
    // What a revert, an abandon, or a `spike done` at the boundary leaves behind:
    // a step checkpointed earlier, the STEP and SPIKE markers both gone.
    writeFileSync(checkpointsPath(dir), 'step 2 abc1234\n')
    writeFileSync(statsPath(dir), JSON.stringify({ '2': { redChecks: 2, reverts: 1 } })) // enough to fold a red Verdict, were one rendered
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout).not.toContain('**Verdict**')
    expect(stdout.trim()).toBe(`**Next Up**: Step 3 of 3 - Third (model: **Sonnet**, details: \`${thirdStepPointer(dir)}\`)`)
  })

  it('names the step number alone when the plan no longer holds the in-flight step', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '9\n') // a step the plan does not contain
    const { code, stdout } = captureIo(() => handoff(dir, ['--driver']))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe('**Next Up**: Back to Step 9') // no "of 3": the count would be a lie
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

  it('measures a step whose product is a new file, seam row and fence included', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'src/new.ts\n')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'new.ts'), 'const a = 1\nconst b = 2\nconst c = 3\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('seam         held: 1 of 1 declared, no strays')
    expect(stdout).toContain('diff         +3 -0 across 1 file · inline below')
    expect(stdout).toContain('```diff')
    expect(stdout).toContain('+++ b/src/new.ts')
  })

  it('sees a change that has already been staged', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'README.md\n')
    writeFileSync(join(dir, 'README.md'), '# fixture\nchanged\n')
    git(dir, ['add', 'README.md'])
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('seam         held: 1 of 1 declared, no strays')
    expect(stdout).toContain('diff         +1 -0 across 1 file · inline below')
    expect(stdout).toContain('+changed')
  })

  it('counts a file staged and then edited again once', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'README.md\n')
    writeFileSync(join(dir, 'README.md'), '# fixture\none\n')
    git(dir, ['add', 'README.md'])
    writeFileSync(join(dir, 'README.md'), '# fixture\none\ntwo\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('diff         +2 -0 across 1 file')
  })

  it('counts an untracked binary at 0/0, so no fence is promised', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'logo.png\n')
    writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x4e, 0x47]))
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).toContain('diff         +0 -0 across 1 file')
    expect(stdout).not.toContain('inline below')
    expect(stdout).not.toContain('```diff')
  })

  it('renders no diff or seam row when the step has touched nothing', async () => {
    // The artifact-plane filter, now that untracked files count: the build's own
    // tracked artifacts are untracked until the plan commit, and they are not work.
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(seamPath(dir), 'README.md\n')
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(stdout).not.toContain('diff  ')
    expect(stdout).not.toContain('seam  ')
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
    expect(stdout).toContain('**Verdict**: ◐ A hair off (seam strayed)')
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
    const { stdout: noisy } = captureIo(() => handoff(dir, ['--full'])) // the same pause again: ask for the card
    expect(noisy).toContain('**Verdict**: ◐ A hair off (1 commit outside the ledger)')
  })

  it('leaves the detail file with a blank line around each heading after a step pause', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const tight = `${GREEN_RECAP}## Summary\nThe limiter runs first.\n## 1 It limits.\nThe full story.\n## Recommendation\nApprove it. The gate is green.\n`
    writeFileSync(detailPath(dir), tight)
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(readFileSync(detailPath(dir), 'utf8')).toBe(
      `${GREEN_RECAP}\n## Summary\n\nThe limiter runs first.\n\n## 1 It limits.\n\nThe full story.\n\n## Recommendation\n\nApprove it. The gate is green.\n`,
    )
    // The render reads the normalized text: the lead and the recommendation still come through.
    expect(stdout).toContain('**Summary**: The limiter runs first.')
    expect(stdout).toContain('**Recommendation**: Approve it. The gate is green.')
  })

  it('leaves the detail file with a blank line around each heading after a plan pause', async () => {
    const dir = await started(INTENT.replace('1. [x] First', '1. [ ] First'))
    writeFileSync(detailPath(dir), '# Detail · Plan · Handoff test\n\n## 1 A hole.\nWhat closing it takes.\n## Recommendation\nSharpen it.\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--plan']))
    expect(code).toBe(0)
    expect(readFileSync(detailPath(dir), 'utf8')).toBe(
      '# Detail · Plan · Handoff test\n\n## 1 A hole.\n\nWhat closing it takes.\n\n## Recommendation\n\nSharpen it.\n',
    )
    expect(stdout).toContain('**Recommendation**: Sharpen it.')
  })

  it('writes nothing when the detail file is already clean or absent', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const { code } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    expect(() => readFileSync(detailPath(dir), 'utf8')).toThrow() // no file made out of nothing
    const clean = `${GREEN_RECAP}${SUMMARY}\n## Recommendation\n\nApprove it.\n`
    writeFileSync(detailPath(dir), clean)
    captureIo(() => handoff(dir, []))
    expect(readFileSync(detailPath(dir), 'utf8')).toBe(clean)
  })

  it.skipIf(process.getuid?.() === 0)('renders the same pause when the normalized detail cannot be written back', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '2\n')
    const tight = `${GREEN_RECAP}## Summary\nThe limiter runs first.\n## Recommendation\nApprove it.\n`
    // `--full`: the second render is the same pause, which would otherwise print the reminder.
    const render = (): { code: number; stdout: string } => captureIo(() => handoff(dir, ['--full']))
    writeFileSync(detailPath(dir), tight)
    chmodSync(detailPath(dir), 0o444)
    const locked = render()
    chmodSync(detailPath(dir), 0o644)
    writeFileSync(detailPath(dir), tight)
    const open = render()
    expect(locked.code).toBe(0)
    expect(locked).toEqual(open)
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

// Four steps, 1 done, and a build order putting 4 ahead of 3: what the plan
// reads once `plumbbob order 4 3` has run against it. Step 4 opens on line 11.
const REORDERED = `# Handoff order test

## Steps

1. [x] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`
3. [ ] Third — **done when:** c works.
   - seam: \`src/c.ts\`
4. [ ] Fourth — **done when:** d works.
   - seam: \`src/d.ts\`

## Build order

4, 3
`

const FOURTH_STEP_LINE = 11

// Two parks open and one harvested: `parked 2 of 3 open`.
const PARKS = '# Build log\n\n## Park list\n\n- [ ] one idea\n- [ ] another\n- [x] harvested already\n\n## Harvest\n\n- (none yet)\n'

/** The `details:` target Next Up points at for step 4 of REORDERED. */
function fourthStepPointer(dir: string): string {
  return `${relative(dir, intentPath(dir))}:${FOURTH_STEP_LINE}`
}

describe('handoff — the note beneath Next Up', () => {
  it('rides the build order and the park count beneath the pointer as one indented line', async () => {
    const dir = await started(REORDERED)
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(buildLogPath(dir), PARKS)
    const { code, stdout } = captureIo(() => handoff(dir, []))
    expect(code).toBe(0)
    // The order starts at the step the pointer names and leaves out the one in
    // flight; the indent keeps the line inside the Next Up part.
    expect(stdout).toContain(
      `**Next Up**: Step 4 of 4 - Fourth (details: \`${fourthStepPointer(dir)}\`)\n  · build order 4, 3 · parked 2 of 3 open\n\n**Your Call**:`,
    )
  })

  it('omits the order segment when the sequence is the numbering, keeping the parks', async () => {
    const dir = await started(REORDERED.replace('4, 3', '3, 4'))
    writeFileSync(stepPath(dir), '2\n')
    writeFileSync(buildLogPath(dir), PARKS)
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).toContain('**Next Up**: Step 3 of 4 - Third')
    expect(stdout).toContain(')\n  · parked 2 of 3 open\n\n**Your Call**:')
    expect(stdout).not.toContain('build order')
  })

  it('renders the pointer alone with nothing re-sequenced and nothing parked, as before', async () => {
    const dir = await started(REORDERED.replace('4, 3', '3, 4'))
    writeFileSync(stepPath(dir), '2\n')
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).toContain('**Next Up**: Step 3 of 4 - Third (details: `')
    expect(stdout).not.toContain('  · ')
  })

  it('caps the order at five and counts the rest', async () => {
    const eight = [
      '# Long plan',
      '',
      '## Steps',
      '',
      ...Array.from({ length: 8 }, (_, i) => `${i + 1}. [ ] Step ${i + 1} — **done when:** ok.\n   - seam: \`src/s${i + 1}.ts\``),
      '',
      '## Build order',
      '',
      '8, 7, 6, 5, 4, 3, 2',
      '',
    ].join('\n')
    const dir = await started(eight)
    writeFileSync(stepPath(dir), '1\n')
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).toContain('**Next Up**: Step 8 of 8 - Step 8 (details: `')
    expect(stdout).toContain('\n  · build order 8, 7, 6, 5, 4 (and 2 more)\n')
  })

  it('still counts the parks when nothing is planned', async () => {
    const dir = await started(INTENT.replace('2. [ ]', '2. [x]').replace('3. [ ]', '3. [x]'))
    writeFileSync(checkpointsPath(dir), 'step 3 abc1234\n')
    writeFileSync(buildLogPath(dir), PARKS)
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).toContain('**Next Up**: Nothing planned - /plumbbob:step or /plumbbob:finish\n  · parked 2 of 3 open\n')
  })

  it('points --plan at the first step in build order, and the plan moves agree', async () => {
    const dir = await started(REORDERED)
    const { stdout } = captureIo(() => handoff(dir, ['--plan']))
    expect(stdout).toContain(
      `**Next Up**: Step 4 of 4 - Fourth (details: \`${fourthStepPointer(dir)}\`)\n  · build order 4, 3, 2\n`,
    )
    expect(stdout).toContain('/plumbbob:build starts Step 4')
  })

  it('rides the note on the boundary pointer, and keeps the driver pointer to one line', async () => {
    const dir = await started(REORDERED.replace('2. [ ]', '2. [x]'))
    writeFileSync(checkpointsPath(dir), 'step 2 abc1234\n')
    const boundary = captureIo(() => handoff(dir, [])).stdout
    expect(boundary).toContain('**Verdict**')
    expect(boundary).toContain(
      `**Next Up**: Step 4 of 4 - Fourth (details: \`${fourthStepPointer(dir)}\`)\n  · build order 4, 3\n`,
    )
    // The driver line follows the order for its pick and carries no note.
    const driver = captureIo(() => handoff(dir, ['--driver'])).stdout
    expect(driver.trim()).toBe(`**Next Up**: Step 4 of 4 - Fourth (details: \`${fourthStepPointer(dir)}\`)`)
  })
})

// Four steps cut into three ranges: a bare call at step 1, a span over 2 and
// 3, and a bare call at step 4. Each range's model differs from its first
// step's, and range 3 has none, so the bracket says whose model it bolds.
const RANGED = `# Handoff range test

## Steps

1. [ ] First — **done when:** a works.
   - seam: \`src/a.ts\`
   - model: sonnet
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`
   - model: sonnet
3. [ ] Third — **done when:** c works.
   - seam: \`src/c.ts\`
   - model: haiku
4. [ ] Fourth — **done when:** d works.
   - seam: \`src/d.ts\`
   - model: sonnet

## Build ranges

Three commands drive the build.

1. \`/plumbbob:build 1\`, **stop:** at step 1's pause, approve the schema
   - model: opus
2. \`/plumbbob:build 2-3\`, **stop:** review the parser before the card reads it
   - model: fable
3. \`/plumbbob:build 4\`, **stop:** at step 4's pause, pick the label
`

/** The `details:` target Next Up points at for step `n` of RANGED. */
function rangedPointer(dir: string, n: number): string {
  return `${relative(dir, intentPath(dir))}:${2 + 3 * n}`
}

/** RANGED with the steps in `done` ticked. */
function rangedWith(done: ReadonlyArray<number>, intent = RANGED): string {
  return done.reduce((text, n) => text.replace(`${n}. [ ]`, `${n}. [x]`), intent)
}

describe('handoff — the range segment beneath Next Up', () => {
  it('names range 1 whole at the plan pause, with the range model in bold', async () => {
    const dir = await started(RANGED)
    const { stdout } = captureIo(() => handoff(dir, ['--plan']))
    expect(stdout).toContain(
      `**Next Up**: Step 1 of 4 - First (model: **Opus**, details: \`${rangedPointer(dir, 1)}\`)\n  · range 1 of 3: /plumbbob:build 1\n`,
    )
  })

  it('names what is left once the step in flight lands at a step pause, its last step written to land', async () => {
    const dir = await started(rangedWith([1]))
    writeFileSync(stepPath(dir), '2\n')
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).toContain(
      `**Next Up**: Step 3 of 4 - Third (model: **Fable**, details: \`${rangedPointer(dir, 3)}\`)\n  · range 2 of 3: /plumbbob:build 3-3\n\n**Your Call**:`,
    )
  })

  it('names the next range on the boundary, and leads the note ahead of the parks', async () => {
    const dir = await started(rangedWith([1]))
    writeFileSync(checkpointsPath(dir), 'step 1 abc1234\n')
    writeFileSync(buildLogPath(dir), PARKS)
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).toContain(
      `**Next Up**: Step 2 of 4 - Second (model: **Fable**, details: \`${rangedPointer(dir, 2)}\`)\n  · range 2 of 3: /plumbbob:build 2-3 · parked 2 of 3 open\n`,
    )
  })

  it("keeps the step's model when the range declares none", async () => {
    const dir = await started(rangedWith([1, 2, 3]))
    writeFileSync(checkpointsPath(dir), 'step 3 abc1234\n')
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).toContain(`**Next Up**: Step 4 of 4 - Fourth (model: **Sonnet**, details: \`${rangedPointer(dir, 4)}\`)\n  · range 3 of 3: /plumbbob:build 4\n`)
  })

  it("gives a flagged range the re-cut words in place of a command, and the step's model", async () => {
    const shared = rangedWith([1], RANGED.replace('`/plumbbob:build 4`', '`/plumbbob:build 3-4`'))
    const dir = await started(shared)
    writeFileSync(checkpointsPath(dir), 'step 1 abc1234\n')
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).toContain(
      `**Next Up**: Step 2 of 4 - Second (model: **Sonnet**, details: \`${rangedPointer(dir, 2)}\`)\n  · range 2 of 3 needs a re-cut (step 3 is also in range 3)\n`,
    )
  })

  it('says no range names a step that sits in none', async () => {
    const open = rangedWith([1, 2, 3], RANGED.replace(/^3\. `[\s\S]*$/m, ''))
    const dir = await started(open)
    writeFileSync(checkpointsPath(dir), 'step 3 abc1234\n')
    const { stdout } = captureIo(() => handoff(dir, []))
    expect(stdout).toContain(`**Next Up**: Step 4 of 4 - Fourth (model: **Sonnet**, details: \`${rangedPointer(dir, 4)}\`)\n  · no range names step 4\n`)
  })

  it("keeps the driver pointer to one line, and renders a plan holding only the template's placeholder as before", async () => {
    const dir = await started(rangedWith([1]))
    writeFileSync(checkpointsPath(dir), 'step 1 abc1234\n')
    const driver = captureIo(() => handoff(dir, ['--driver'])).stdout
    expect(driver.trim()).toBe(`**Next Up**: Step 2 of 4 - Second (model: **Sonnet**, details: \`${rangedPointer(dir, 2)}\`)`)
    const placeholder = RANGED.replace(
      /## Build ranges[\s\S]*$/,
      "## Build ranges\n\n1. `/plumbbob:build <N-M>`, **stop:** <the call that is the human's here>\n   - model: <the strongest model any step inside it recommends>\n",
    )
    const plain = await started(rangedWith([1], placeholder))
    writeFileSync(checkpointsPath(plain), 'step 1 abc1234\n')
    const { stdout } = captureIo(() => handoff(plain, []))
    expect(stdout).toContain(`**Next Up**: Step 2 of 4 - Second (model: **Sonnet**, details: \`${rangedPointer(plain, 2)}\`)`)
    expect(stdout).not.toContain('  · ')
  })
})

const REMINDER = '**Next Up**: Back to Step 2 of 3 - Second\n\n'

/** Step 2 at its pause: a one-line change in its seam, a detail file, and a green gate. */
async function paused(): Promise<string> {
  const dir = await started()
  writeFileSync(stepPath(dir), '2\n')
  writeFileSync(seamPath(dir), 'README.md\n')
  writeFileSync(join(dir, 'README.md'), '# fixture\nchanged\n')
  writeFileSync(detailPath(dir), `${GREEN_RECAP}${SUMMARY}\n## Recommendation\n\nApprove it.\n`)
  writeCheckSummary(dir, true, [{ name: 'test', ok: true }], 63_000)
  return dir
}

function render(dir: string, args: ReadonlyArray<string> = []): { code: number; stdout: string } {
  const { code, stdout } = captureIo(() => handoff(dir, args))
  return { code, stdout }
}

/** Whether a render is the whole card: it opens on the Now line and ends on the recommendation. */
function isCard(stdout: string): boolean {
  return stdout.startsWith('**Now**: Step 2 of 3 - Second\n\n**Summary**') && stdout.includes('**Your Call**:')
}

describe('handoff — a pause shown once', () => {
  it('prints the whole card on the first render and the reminder on a second with nothing changed — D87 (pause-once)', async () => {
    const dir = await paused()
    const first = render(dir)
    expect(first.code).toBe(0)
    expect(isCard(first.stdout)).toBe(true)
    expect(render(dir)).toEqual({ code: 0, stdout: REMINDER })
    expect(render(dir)).toEqual({ code: 0, stdout: REMINDER }) // however many questions it takes
  })

  it('brings the card back when the detail file changes', async () => {
    const dir = await paused()
    render(dir)
    writeFileSync(detailPath(dir), `${GREEN_RECAP}${SUMMARY}\n## Recommendation\n\nApprove it. The fix landed.\n`)
    const changed = render(dir)
    expect(isCard(changed.stdout)).toBe(true)
    expect(changed.stdout).toContain('**Recommendation**: Approve it. The fix landed.')
    expect(render(dir).stdout).toBe(REMINDER)
  })

  it('brings the card back when a file in the seam changes, even when its counts do not', async () => {
    const dir = await paused()
    render(dir)
    writeFileSync(join(dir, 'README.md'), '# fixture\nedited\n') // still +1 -0: only the content moved
    expect(isCard(render(dir).stdout)).toBe(true)
    expect(render(dir).stdout).toBe(REMINDER)
    writeFileSync(join(dir, 'README.md'), '# fixture\nedited\nagain\n')
    expect(render(dir).stdout).toContain('diff         +2 -0 across 1 file')
  })

  it('brings the card back when the check row changes, red or green again', async () => {
    const dir = await paused()
    render(dir)
    writeCheckSummary(dir, false, [{ name: 'test', ok: false, output_file: 'test.json' }], 63_000)
    const red = render(dir)
    expect(red.stdout).toContain('check        red: test failing')
    expect(render(dir).stdout).toBe(REMINDER)
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }], 63_000)
    expect(render(dir).stdout).toContain('check        green: 1 of 1 checks')
  })

  it('keeps the reminder when only the spent row moved — D8 (stamp-skips-spent)', async () => {
    const dir = await paused()
    render(dir)
    // Turns ticked and the gate re-ran green in a different time: spent moves, the pause does not.
    writeFileSync(turnPath(dir), '5\n')
    writeFileSync(tickPath(dir), '2\n')
    writeCheckSummary(dir, true, [{ name: 'test', ok: true }], 64_000)
    expect(render(dir).stdout).toBe(REMINDER)
    const full = render(dir, ['--full'])
    expect(full.stdout).toContain('3 turns')
    expect(full.stdout).toContain('64s gate')
  })

  it('prints the card on --full whatever the stamp says, and the reminder after it', async () => {
    const dir = await paused()
    const first = render(dir)
    const full = render(dir, ['--full'])
    expect(full).toEqual(first)
    expect(render(dir).stdout).toBe(REMINDER)
  })

  it('names the step a verify pause was asked about, with nothing in flight', async () => {
    const dir = await paused()
    writeFileSync(stepPath(dir), '') // a hand-built diff: no STEP marker, the step named instead
    expect(isCard(render(dir, ['2']).stdout)).toBe(true)
    expect(render(dir, ['2']).stdout).toBe(REMINDER)
  })

  it('stamps only the step pause: a driver pointer and the plan card leave the next render whole', async () => {
    const dir = await paused()
    render(dir, ['--driver'])
    render(dir, ['--plan'])
    expect(existsSync(pausePath(dir))).toBe(false)
    expect(isCard(render(dir).stdout)).toBe(true)
  })

  it('clears the stamp at a checkpoint, a revert, and an abandon, so the next pause renders whole', async () => {
    for (const exit of ['checkpoint', 'revert', 'abandon'] as const) {
      const dir = await paused()
      writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
      render(dir)
      expect(existsSync(pausePath(dir))).toBe(true)
      const { code } =
        exit === 'checkpoint'
          ? await captureIoAsync(() => checkpoint(dir, ['2']))
          : captureIo(() => (exit === 'revert' ? revert(dir, []) : abandon(dir, [])))
      expect(code).toBe(0)
      expect(existsSync(pausePath(dir))).toBe(false)
    }
  })

  it('keeps the stamp out of git, so no step commit sweeps it in', async () => {
    const dir = await paused()
    render(dir)
    const stamp = relative(dir, pausePath(dir))
    expect(() => git(dir, ['check-ignore', '-q', stamp])).not.toThrow()
  })

  it('prints the card on every render when the stamp cannot be written', async () => {
    const dir = await paused()
    mkdirSync(pausePath(dir)) // a directory where the stamp goes: every write fails
    const first = render(dir)
    expect(first.code).toBe(0)
    expect(isCard(first.stdout)).toBe(true)
    expect(render(dir)).toEqual(first) // never the reminder, never an error
  })
})

/** Tick the turn ledger to `turn`, the way the UserPromptSubmit hook would. */
function atTurn(dir: string, turn: number): void {
  writeFileSync(turnPath(dir), `${turn}\n`)
}

describe('handoff — the ending it records for the relay check', () => {
  it('records the step card with its tier, its render, the command that reprints it, the turn, and the text it printed', async () => {
    const dir = await paused()
    atTurn(dir, 7)
    const { stdout } = render(dir)
    expect(isCard(stdout)).toBe(true)
    expect(readRelay(dir)).toEqual({
      turn: 7,
      tier: 'decision',
      render: 'card',
      command: 'plumbbob handoff --full',
      text: stdout,
    })
  })

  it('records the reminder as a decision ending that plain handoff reprints', async () => {
    const dir = await paused()
    atTurn(dir, 7)
    render(dir)
    atTurn(dir, 8) // the human asked a question: a new turn at the same pause
    expect(render(dir).stdout).toBe(REMINDER)
    expect(readRelay(dir)).toEqual({
      turn: 8,
      tier: 'decision',
      render: 'reminder',
      command: 'plumbbob handoff',
      text: REMINDER,
    })
  })

  it('carries the step number a verify pause was named by, so the retry lands on the same pause', async () => {
    const dir = await paused()
    writeFileSync(stepPath(dir), '') // a hand-built diff: nothing in flight, the step named instead
    atTurn(dir, 3)
    const card = render(dir, ['2'])
    expect(readRelay(dir)).toMatchObject({ render: 'card', command: 'plumbbob handoff --full 2', text: card.stdout })
    render(dir, ['2'])
    expect(readRelay(dir)).toMatchObject({ render: 'reminder', command: 'plumbbob handoff 2', text: REMINDER })
  })

  it('carries a build named by flag, since the cursor may point at another', async () => {
    const dir = await paused()
    const slug = activeBuild(dir) ?? ''
    atTurn(dir, 3)
    render(dir, ['--build', slug])
    expect(readRelay(dir)?.command).toBe(`plumbbob handoff --full --build ${slug}`)
  })

  it('records the plan card as a decision ending that --plan reprints', async () => {
    const dir = await started()
    atTurn(dir, 2)
    const { stdout } = render(dir, ['--plan'])
    expect(readRelay(dir)).toEqual({
      turn: 2,
      tier: 'decision',
      render: 'plan',
      command: 'plumbbob handoff --plan',
      text: stdout,
    })
  })

  it('records the boundary, the fresh pointer, and the driver pointer with no command, since none is a pause', async () => {
    const dir = await started()
    atTurn(dir, 4)
    const pointer = render(dir).stdout
    expect(readRelay(dir)).toEqual({ turn: 4, tier: 'orientation', render: 'pointer', text: pointer })
    writeFileSync(checkpointsPath(dir), 'step 1 abc1234\n')
    const boundary = render(dir).stdout
    expect(boundary).toContain('**Verdict**')
    expect(readRelay(dir)).toEqual({ turn: 4, tier: 'orientation', render: 'boundary', text: boundary })
    const driver = render(dir, ['--driver']).stdout
    expect(readRelay(dir)).toEqual({ turn: 4, tier: 'driver', render: 'driver', text: driver })
  })

  it('keeps the last ending a turn printed, so a park after the pause is what the turn is judged by', async () => {
    const dir = await paused()
    atTurn(dir, 5)
    render(dir)
    const parked = captureIo(() => park(dir, ['should the reminder name the check?']))
    expect(parked.code).toBe(0)
    expect(parked.stdout).toContain('**Parked**: should the reminder name the check?')
    expect(readRelay(dir)).toEqual({ turn: 5, tier: 'driver', render: 'park', text: parked.stdout })
  })

  it('records a revert and an abandon as driver endings, each the text it printed', async () => {
    for (const exit of ['revert', 'abandon'] as const) {
      const dir = await paused()
      atTurn(dir, 6)
      render(dir)
      const { code, stdout } = captureIo(() => (exit === 'revert' ? revert(dir, []) : abandon(dir, [])))
      expect(code).toBe(0)
      expect(readRelay(dir)).toEqual({ turn: 6, tier: 'driver', render: exit, text: stdout })
    }
  })

  it('records nothing without a turn ledger, since there is no turn to check the ending against', async () => {
    const dir = await paused()
    expect(isCard(render(dir).stdout)).toBe(true)
    expect(existsSync(relayPath(dir))).toBe(false)
  })

  it('prints the same ending and exits 0 when the record cannot be written', async () => {
    const dir = await paused()
    atTurn(dir, 9)
    mkdirSync(relayPath(dir)) // a directory where the record goes: every write fails
    const failed = render(dir)
    expect(failed.code).toBe(0)
    expect(isCard(failed.stdout)).toBe(true)
    rmSync(relayPath(dir), { recursive: true })
    const recorded = render(dir, ['--full'])
    expect(recorded).toEqual(failed)
    expect(readRelay(dir)?.text).toBe(recorded.stdout)
    // A transition verb's ending is just as untouched by a failed record.
    rmSync(relayPath(dir))
    mkdirSync(relayPath(dir))
    const parked = captureIo(() => park(dir, ['a tangent']))
    expect(parked).toEqual({ code: 0, stdout: '**Parked**: a tangent\n\n**Next Up**: Back to Step 2 of 3 - Second\n\n', stderr: '' })
  })

  it('keeps the record out of git, so no step commit sweeps it in', async () => {
    const dir = await paused()
    atTurn(dir, 1)
    render(dir)
    expect(() => git(dir, ['check-ignore', '-q', relative(dir, relayPath(dir))])).not.toThrow()
  })

  it('reads a record whose header does not parse as no record', async () => {
    const dir = await started()
    writeFileSync(relayPath(dir), 'turn seven\ntier decision\nrender card\n\n**Next Up**: x\n\n')
    expect(readRelay(dir)).toBeNull()
    writeFileSync(relayPath(dir), 'turn 7\ntier loud\nrender card\n\n**Next Up**: x\n\n')
    expect(readRelay(dir)).toBeNull()
    writeFileSync(relayPath(dir), 'turn 7\ntier decision\nrender card') // no blank line, no text
    expect(readRelay(dir)).toBeNull()
  })
})
