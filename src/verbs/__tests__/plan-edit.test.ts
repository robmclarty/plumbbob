// A plan edited during a step is shown, never blocked: the mark the CLI keeps
// of the plan as last sanctioned, the `plan` row and the Plan Edit part at the
// pause, the granted checkpoint that stops for it, and what the landing leaves
// behind. D162 (plan-edit-shown), which revises nothing in D10 (pause-not-lock).

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { abandon } from '../abandon.ts'
import { build } from '../build.ts'
import { checkpoint } from '../checkpoint.ts'
import { defer } from '../defer.ts'
import { finish } from '../finish.ts'
import { handoff } from '../handoff.ts'
import { order } from '../order.ts'
import { start } from '../start.ts'
import { applyTurn } from '../turn.ts'
import {
  buildLogPath,
  bumpStepStat,
  checkpointsPath,
  detailPath,
  basePath,
  grantPath,
  intentPath,
  markPath,
  readBase,
  readMark,
  readStats,
  reportPath,
  stepPath,
  tickPath,
  turnPath,
} from '../../lib/sidecar.ts'
import { planEditHeldMessage, planEditMessage } from '../../lib/latch.ts'
import { advisory } from '../../lib/notice.ts'
import { settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Three steps, each with its own seam, and one open question for `defer`.
const INTENT = `# Plan edit test

## Steps

1. [ ] First, **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second, **done when:** b works.
   - seam: \`src/b.ts\`
3. [ ] Third, **done when:** c works.
   - seam: \`src/c.ts\`

## Open questions

- <a id="q1"></a>**Q1 (cache-home)**: Where does the cache live?, *resolve by:* decide
`

// The edit a model makes with nobody present: one step added to the plan.
const EDIT = '4. [ ] Fourth, **done when:** d works.\n   - seam: `src/d.ts`\n'

const PLAN_ROW = 'plan         edited during the step: intent.md +2 -0'

/** A pause's detail file for `step`: one judgment row, a Summary, a recommendation. */
function detailFor(step: number): string {
  return `# Detail · Step ${step}\n\n── recap · step ${step} of 3 ──\nproof        met\n\n## Summary\n\nIt works now.\n\n## Recommendation\n\nApprove it.\n`
}

function git(dir: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
}

/**
 * A hooked host with its plan landed: TURN counts, a green stub gate, and the
 * plan committed, so the mark holds the plan as approved under turn 1.
 */
async function planned(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Plan edit test', '--slug', 'plan-edit-test']))
  writeFileSync(intentPath(dir), INTENT)
  writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
  writeFileSync(turnPath(dir), '1\n')
  const landed = await captureIoAsync(() => checkpoint(dir, ['--plan']))
  expect(landed.code).toBe(0)
  return dir
}

/**
 * The human's next prompt, through the turn hook itself: TURN up by one, the
 * grant rewritten from what they typed, and the plan mark settled.
 */
function humanTurn(dir: string, prompt = 'looks good'): void {
  expect(applyTurn(dir, JSON.stringify({ prompt }))).toBe(true)
}

/** Enter `step`, build its seam, and leave a green gate and a detail file, as a build turn does before it hands off. */
function built(dir: string, step: number): void {
  expect(captureIo(() => build(dir, [String(step)])).code).toBe(0)
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'src', `${'abc'[step - 1] ?? 'z'}.ts`), `export const step = ${step}\n`)
  mkdirSync(join(dir, '.check'), { recursive: true })
  writeFileSync(join(dir, '.check', 'summary.json'), JSON.stringify({ schema_version: 1, ok: true, checks_run: 1, checks: [{ name: 'check', ok: true }] }))
  writeFileSync(detailPath(dir), detailFor(step))
}

/** Land `step` the approved way: a human turn, then the checkpoint. */
async function land(dir: string, step: number): Promise<{ code: number; stdout: string; stderr: string }> {
  humanTurn(dir)
  return captureIoAsync(() => checkpoint(dir, [String(step)]))
}

/** The pause card, whole, whatever has shown before. */
function card(dir: string): string {
  const { code, stdout } = captureIo(() => handoff(dir, ['--full']))
  expect(code).toBe(0)
  return stdout
}

/** Output with every sha and clock reading taken out, so two runs of the same work compare. */
function settled(text: string): string {
  return text.replace(/\b[0-9a-f]{9}\b/g, '<sha>').replace(/\b\d+s\b/g, '<s>')
}

describe('the plan mark', () => {
  it('is taken when a build starts and when its plan lands, and git never sees it', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Plan edit test', '--slug', 'plan-edit-test']))
    const scaffold = readFileSync(intentPath(dir), 'utf8')
    // A host with no turn hook yet: the mark has no turn to carry.
    expect(readMark(dir)).toEqual({ turn: null, step: null, text: scaffold })
    writeFileSync(intentPath(dir), INTENT)
    writeFileSync(turnPath(dir), '1\n')
    await captureIoAsync(() => checkpoint(dir, ['--plan']))
    expect(readMark(dir)).toEqual({ turn: 1, step: null, text: INTENT })
    expect(git(dir, ['status', '--porcelain', '--ignored'])).toContain(`!! ${relative(dir, markPath(dir))}`)
    expect(git(dir, ['ls-files'])).not.toContain('MARK')
  })

  it('is cleared when the build finishes', async () => {
    const dir = await planned()
    expect(existsSync(markPath(dir))).toBe(true)
    captureIo(() => finish(dir))
    expect(existsSync(markPath(dir))).toBe(false)
  })

  it('reports nothing for a build with no mark, and gains one at the next entry', async () => {
    const dir = await planned()
    rmSync(markPath(dir)) // a build started before the mark existed
    appendFileSync(intentPath(dir), EDIT)
    built(dir, 1)
    expect(readMark(dir)).toEqual({ turn: 1, step: 1, text: INTENT + EDIT })
    const shown = card(dir)
    expect(shown).not.toContain('plan  ')
    expect(shown).not.toContain('**Plan Edit**')
  })
})

describe('a mark taken before the host counted turns', () => {
  it('is settled by the first entry, since no prompt has had the chance to', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Plan edit test', '--slug', 'plan-edit-test']))
    expect(readMark(dir)?.turn).toBeNull()
    writeFileSync(intentPath(dir), INTENT)
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    writeFileSync(turnPath(dir), '4\n') // the hook arrives, with the mark still holding the scaffold
    built(dir, 1)
    expect(readMark(dir)).toEqual({ turn: 4, step: 1, text: INTENT })
    expect(card(dir)).not.toContain('plan  ')
  })
})

describe('a pause with no plan edit', () => {
  it('prints the card it printed before there was a mark, byte for byte', async () => {
    const dir = await planned()
    built(dir, 1)
    const marked = card(dir)
    rmSync(markPath(dir)) // no mark is the code path every build ran before
    expect(card(dir)).toBe(marked)
    expect(marked).not.toContain('plan  ')
    expect(marked).not.toContain('**Plan Edit**')
    expect(marked).toContain('| **Verdict** | ● Plumb |')
  })

  it('lands with the ending, the Log entry and the stats it had before there was a mark', async () => {
    const run = async (unmarked: boolean): Promise<{ stdout: string; log: string; stats: string }> => {
      const dir = await planned()
      built(dir, 1)
      if (unmarked) rmSync(markPath(dir))
      const { code, stdout } = await land(dir, 1)
      expect(code).toBe(0)
      const stats = Object.keys(readStats(dir)['1'] ?? {}).sort().join(',')
      return { stdout: settled(stdout), log: settled(readFileSync(buildLogPath(dir), 'utf8')), stats }
    }
    const marked = await run(false)
    expect(marked).toEqual(await run(true))
    expect(marked.stdout).not.toContain('edited the plan')
    expect(marked.stats).toBe('landedAt,startedAt')
  })
})

describe('a plan edited during the step', () => {
  it('shows the plan row, the advisory rung, and the diff, and keeps looks good on the card', async () => {
    const dir = await planned()
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    const shown = card(dir)
    expect(shown).toContain(`\n${PLAN_ROW}\n`)
    expect(shown).toContain('| **Verdict** | ◐ A hair off (plan edited) |')
    expect(shown).toContain(
      [
        `**Plan Edit**: [intent.md](${relative(dir, intentPath(dir))}) +2 -0, against the plan as last approved.`,
        '',
        '```diff',
        '@@ -12,4 +12,6 @@',
        ' ## Open questions',
        ' ',
        ' - <a id="q1"></a>**Q1 (cache-home)**: Where does the cache live?, *resolve by:* decide',
        '+4. [ ] Fourth, **done when:** d works.',
        '+   - seam: `src/d.ts`',
        ' ',
        '```',
      ].join('\n'),
    )
    // The part stands under the Readout and above Your Call.
    expect(shown.indexOf('**Readout**:')).toBeLessThan(shown.indexOf('**Plan Edit**:'))
    expect(shown.indexOf('**Plan Edit**:')).toBeLessThan(shown.indexOf('**Your Call**:'))
    // The edit is the person's call, and they are looking at it.
    expect(shown).toContain('- `looks good` → I checkpoint Step 1; back to the boundary')
    // Nothing was blocked: the plan still holds the edit.
    expect(readFileSync(intentPath(dir), 'utf8')).toBe(INTENT + EDIT)
  })

  it('counts a change that is only whitespace, as lines', async () => {
    const dir = await planned()
    built(dir, 1)
    writeFileSync(intentPath(dir), INTENT.replace('# Plan edit test', '# Plan edit test ') + '\n')
    expect(card(dir)).toContain('plan         edited during the step: intent.md +2 -1')
  })

  it('never reads a plan row the model wrote into the detail file', async () => {
    const dir = await planned()
    built(dir, 1)
    writeFileSync(detailPath(dir), detailFor(1).replace('proof        met', 'proof        met\nplan         edited during the step: intent.md +9 -9'))
    expect(card(dir)).not.toContain('plan  ')
  })

  it('cuts a long diff at its cap, says how many lines it left out, and prints them all on --full', async () => {
    const dir = await planned()
    built(dir, 1)
    appendFileSync(intentPath(dir), Array.from({ length: 60 }, (_, i) => `- note ${i + 1}\n`).join(''))
    // The first render of a pause, without --full: the hunk line, three lines
    // of context, sixty added, and the trailing empty line make 65.
    const capped = captureIo(() => handoff(dir)).stdout
    expect(capped).toContain(
      '+60 -0, against the plan as last approved. The diff below stops at 40 lines, and `plumbbob handoff --full` prints the other 25.',
    )
    expect(capped).toContain('+- note 36\n```')
    expect(capped).not.toContain('+- note 37')
    const whole = card(dir)
    expect(whole).toContain('+60 -0, against the plan as last approved.\n')
    expect(whole).toContain('+- note 60\n \n```')
  })
})

describe("the CLI's own writes to the plan", () => {
  it('are never an edit: the tick, an order, and a deferral all move the mark', async () => {
    const dir = await planned()
    built(dir, 1)
    expect((await land(dir, 1)).code).toBe(0)
    // The tick wrote intent.md, and the mark was taken after it.
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x] First')
    expect(readMark(dir)?.text).toBe(readFileSync(intentPath(dir), 'utf8'))

    expect(captureIo(() => order(dir, ['3', '2'])).code).toBe(0)
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('## Build order')
    expect(readMark(dir)?.text).toBe(readFileSync(intentPath(dir), 'utf8'))

    built(dir, 3)
    expect(captureIo(() => defer(dir, ['Q1', 'step 2 picks the home'])).code).toBe(0)
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('*deferred:*')
    // The mark followed the deferral and still names the step that settled it.
    expect(readMark(dir)).toMatchObject({ step: 3, text: readFileSync(intentPath(dir), 'utf8') })
    const shown = card(dir)
    expect(shown).not.toContain('plan  ')
    expect(shown).not.toContain('**Plan Edit**')
  })

  it('do not carry a waiting edit past the person: the mark stays where the edit left it', async () => {
    const dir = await planned()
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    expect(captureIo(() => defer(dir, ['Q1', 'step 2 picks the home'])).code).toBe(0)
    expect(readMark(dir)?.text).toBe(INTENT)
    // The deferral changed one line, so it is shown with the edit: two added and one changed.
    expect(card(dir)).toContain('plan         edited during the step: intent.md +3 -1')
  })
})

describe('a plan edited between steps', () => {
  it('is accepted at the next entry when a human turn stood in between', async () => {
    const dir = await planned()
    built(dir, 1)
    expect((await land(dir, 1)).code).toBe(0)
    appendFileSync(intentPath(dir), EDIT) // a refine, a new step, their own editor
    humanTurn(dir)
    built(dir, 2)
    expect(readMark(dir)).toEqual({ turn: 3, step: 2, text: readFileSync(intentPath(dir), 'utf8') })
    const shown = card(dir)
    expect(shown).not.toContain('plan  ')
    expect(shown).not.toContain('**Plan Edit**')
  })

  it('is carried into the next step when no human turn stood in between, and stays shown after one', async () => {
    const dir = await planned()
    built(dir, 1)
    expect((await land(dir, 1)).code).toBe(0)
    const approved = readFileSync(intentPath(dir), 'utf8')
    appendFileSync(intentPath(dir), EDIT) // a model, between two steps of a run
    built(dir, 2)
    // The snapshot and its turn stay; only the step the mark is settled for moves.
    expect(readMark(dir)).toEqual({ turn: 2, step: 2, text: approved })
    expect(card(dir)).toContain(`\n${PLAN_ROW}\n`)
    // The person replying at the pause does not make the edit one they made.
    humanTurn(dir)
    expect(card(dir)).toContain(`\n${PLAN_ROW}\n`)
  })

  it('is not laundered by abandoning the step and entering it again under the grant', async () => {
    const dir = await planned()
    writeFileSync(grantPath(dir), 'auto\n')
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    expect(captureIo(() => abandon(dir, [])).code).toBe(0)
    expect(existsSync(stepPath(dir))).toBe(false)
    built(dir, 1)
    expect(readMark(dir)?.text).toBe(INTENT)
    expect(card(dir)).toContain(`\n${PLAN_ROW}\n`)
  })
})

describe('a granted checkpoint over an edited plan', () => {
  it('refuses in the latch\'s voice and records nothing', async () => {
    const dir = await planned()
    writeFileSync(grantPath(dir), 'auto\n') // the human typed /plumbbob:build --auto
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    const head = git(dir, ['rev-parse', 'HEAD'])
    const log = readFileSync(buildLogPath(dir), 'utf8')
    const { code, stdout, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toBe(planEditMessage(1, 2, 0))
    expect(stderr).toContain('plumbbob: checkpoint refused — intent.md was edited during step 1 (+2 -0)')
    expect(stderr).toContain('run `plumbbob handoff`')
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(head)
    expect(readFileSync(checkpointsPath(dir), 'utf8')).not.toContain('step 1')
    expect(readFileSync(intentPath(dir), 'utf8')).toBe(INTENT + EDIT)
    expect(readFileSync(buildLogPath(dir), 'utf8')).toBe(log)
    expect(readStats(dir)['1']?.planEdits).toBeUndefined()
    expect(readFileSync(stepPath(dir), 'utf8')).toBe('1\n') // the step waits at its pause
    expect(readMark(dir)?.text).toBe(INTENT)
    // The pause the refusal sends the model to shows the row and the diff.
    expect(card(dir)).toContain(`\n${PLAN_ROW}\n`)
  })

  it('refuses under a typed range the same way, and lands the same step when the plan is as approved', async () => {
    const edited = await planned()
    writeFileSync(grantPath(edited), 'steps 1-2\n')
    built(edited, 1)
    appendFileSync(intentPath(edited), EDIT)
    expect((await captureIoAsync(() => checkpoint(edited, ['1']))).stderr).toBe(planEditMessage(1, 2, 0))

    const clean = await planned()
    writeFileSync(grantPath(clean), 'steps 1-2\n')
    built(clean, 1)
    expect((await captureIoAsync(() => checkpoint(clean, ['1']))).code).toBe(0)
  })

  it('refuses a step that carried an edit in from between two steps of the run', async () => {
    const dir = await planned()
    writeFileSync(grantPath(dir), 'auto\n')
    built(dir, 1)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).code).toBe(0)
    appendFileSync(intentPath(dir), EDIT)
    built(dir, 2)
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['2']))
    expect(code).toBe(1)
    expect(stderr).toBe(planEditMessage(2, 2, 0))
  })

  it('lands once the human has replied, and the Log, the boundary and the stats keep the edit', async () => {
    const dir = await planned()
    writeFileSync(grantPath(dir), 'auto\n')
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).code).toBe(1)
    const { code, stdout } = await land(dir, 1)
    expect(code).toBe(0)
    // The boundary says so in its advisories, and the Verdict keeps the rung.
    expect(stdout).toContain(
      advisory({
        fact: 'Step 1 edited the plan',
        detail: ['intent.md +2 -0'],
        remedy: 'the build log keeps the row, so revise the plan with /plumbbob:refine if the edit should not stand',
      }),
    )
    expect(stdout).toContain('| **Verdict** | ◐ A hair off (plan edited) |')
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toContain(PLAN_ROW)
    expect(log).toContain('**Verdict**: ◐ A hair off (plan edited)')
    expect(log).toMatch(/step 1 checkpointed.*1 plan edit/)
    expect(readStats(dir)['1']?.planEdits).toBe(1)
    // The mark was taken after the tick, so the next step starts clean.
    expect(readMark(dir)).toMatchObject({ step: null, text: readFileSync(intentPath(dir), 'utf8') })
    built(dir, 2)
    expect(card(dir)).not.toContain('plan  ')
    // A later handoff at the boundary still reads the rung off the stat.
    expect((await land(dir, 2)).stdout).toContain('| **Verdict** | ● Plumb |')
  })
})

describe('the ways around the halt', () => {
  it('a second plan commit under --auto does not make an edited plan the approved one', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build --auto')
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).stderr).toBe(planEditMessage(1, 2, 0))
    // The plan commit stays legal, and moves neither the mark nor the step's entry stamp.
    expect((await captureIoAsync(() => checkpoint(dir, ['--plan']))).code).toBe(0)
    expect(readMark(dir)).toMatchObject({ step: 1, text: INTENT })
    expect(existsSync(tickPath(dir))).toBe(true)
    const again = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(again.code).toBe(1)
    expect(again.stderr).toBe(planEditMessage(1, 2, 0))
    expect(card(dir)).toContain(`\n${PLAN_ROW}\n`)
  })

  it('a first plan commit by a granted run leaves the mark where the prompt put it', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Plan edit test', '--slug', 'plan-edit-test']))
    writeFileSync(intentPath(dir), INTENT)
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    humanTurn(dir, '/plumbbob:build --auto') // typed over the plan as written
    appendFileSync(intentPath(dir), EDIT) // the model, after the prompt
    expect((await captureIoAsync(() => checkpoint(dir, ['--plan']))).code).toBe(0)
    expect(readMark(dir)?.text).toBe(INTENT)
    built(dir, 1)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).stderr).toBe(planEditMessage(1, 2, 0))
  })

  it('abandoning the step and checkpointing it by hand still stops under the range', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build 1-3')
    expect(readFileSync(grantPath(dir), 'utf8')).toBe('steps 1-3\n')
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).code).toBe(1)
    expect(captureIo(() => abandon(dir, [])).code).toBe(0)
    expect(existsSync(tickPath(dir))).toBe(false) // no entry stamp: the turn latch has nothing to hold
    const head = git(dir, ['rev-parse', 'HEAD'])
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(1)
    expect(stderr).toBe(planEditMessage(1, 2, 0))
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(head)
    expect(readFileSync(checkpointsPath(dir), 'utf8')).not.toContain('step 1')
  })

  it('a step built without `build <n>` after an edit between two steps still stops under the range', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build 1-3')
    built(dir, 1)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).code).toBe(0)
    appendFileSync(intentPath(dir), EDIT)
    writeFileSync(join(dir, 'src', 'b.ts'), 'export const step = 2\n') // step 2's work, never entered
    const head = git(dir, ['rev-parse', 'HEAD'])
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['2']))
    expect(code).toBe(1)
    expect(stderr).toBe(planEditMessage(2, 2, 0))
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(head)
    // The person's reply is what lands it, and the landing keeps the edit on the record.
    const landed = await land(dir, 2)
    expect(landed.code).toBe(0)
    expect(landed.stdout).toContain('Step 2 edited the plan')
    expect(readStats(dir)['2']?.planEdits).toBe(1)
  })

  it('an edit made in the granted turn, ahead of the first entry, rides into the step and stops it', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build --auto')
    appendFileSync(intentPath(dir), EDIT) // the model, after the prompt and before `build 1`
    built(dir, 1)
    expect(readMark(dir)).toMatchObject({ step: 1, text: INTENT })
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(1)
    expect(stderr).toBe(planEditMessage(1, 2, 0))
    expect(card(dir)).toContain(`\n${PLAN_ROW}\n`)
  })

  it("the person's own edit, made before they typed the grant, is the plan the grant covers", async () => {
    const dir = await planned()
    appendFileSync(intentPath(dir), EDIT) // their editor, a refine last turn
    humanTurn(dir, '/plumbbob:build 1-3')
    expect(readMark(dir)).toMatchObject({ step: null, text: INTENT + EDIT })
    built(dir, 1)
    expect(card(dir)).not.toContain('plan  ')
    const { code, stdout } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(0)
    expect(stdout).not.toContain('edited the plan')
    expect(readStats(dir)['1']?.planEdits).toBeUndefined()
  })

  it('an edit made after the reply at a pause waits for the next one, grant or none', async () => {
    const dir = await planned()
    built(dir, 1)
    expect(card(dir)).not.toContain('plan  ')
    humanTurn(dir) // `looks good`, typed over the plan as approved
    appendFileSync(intentPath(dir), EDIT)
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(1)
    expect(stderr).toBe(planEditMessage(1, 2, 0))
    const landed = await land(dir, 1)
    expect(landed.code).toBe(0)
    expect(landed.stdout).toContain('Step 1 edited the plan')
  })

  it('an edit a dropped step never showed outlasts the next prompt and rides into the next entry', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build --auto')
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).code).toBe(1)
    expect(captureIo(() => abandon(dir, [])).code).toBe(0)
    humanTurn(dir, 'carry on')
    expect(readMark(dir)).toMatchObject({ step: 1, text: INTENT })
    built(dir, 1)
    expect(card(dir)).toContain(`\n${PLAN_ROW}\n`)
    // They typed over it, so their approval lands it, with the edit on the record.
    const landed = await land(dir, 1)
    expect(landed.code).toBe(0)
    expect(readStats(dir)['1']?.planEdits).toBe(1)
  })

  it('a job reporting back is no prompt: it settles nothing', async () => {
    const dir = await planned()
    appendFileSync(intentPath(dir), EDIT)
    expect(applyTurn(dir, JSON.stringify({ prompt: '<task-notification>done</task-notification>' }))).toBe(false)
    expect(readMark(dir)).toEqual({ turn: 1, step: null, text: INTENT })
  })
})

describe('the card after it has shown', () => {
  it('comes back whole for a plan edit it did not show, then is the reminder again', async () => {
    const dir = await planned()
    built(dir, 1)
    const first = captureIo(() => handoff(dir)).stdout
    expect(first).toContain('**Readout**:')
    expect(first).not.toContain('plan  ')
    // Shown once, the pause answers with its one line.
    expect(captureIo(() => handoff(dir)).stdout).toBe('**Next Up**: Back to **Step 1** - First\n\n')

    appendFileSync(intentPath(dir), EDIT)
    const second = captureIo(() => handoff(dir)).stdout
    expect(second).toContain(`\n${PLAN_ROW}\n`)
    expect(second).toContain('**Plan Edit**:')
    expect(second).toContain('**Your Call**:')
    // That edit has shown now, so the line is enough until the plan moves again.
    expect(captureIo(() => handoff(dir)).stdout).toBe('**Next Up**: Back to **Step 1** - First\n\n')
    appendFileSync(intentPath(dir), '- one more\n')
    expect(captureIo(() => handoff(dir)).stdout).toContain('plan         edited during the step: intent.md +3 -0')
  })

  it('shows the row at the handoff a refused checkpoint sends the model to, card shown or not', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build 1-3')
    built(dir, 1)
    expect(captureIo(() => handoff(dir)).stdout).toContain('**Readout**:')
    appendFileSync(intentPath(dir), EDIT)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).stderr).toBe(planEditMessage(1, 2, 0))
    const shown = captureIo(() => handoff(dir)).stdout
    expect(shown).toContain(`\n${PLAN_ROW}\n`)
    expect(shown).toContain('**Plan Edit**:')
  })

  it('names the command that prints this same card where the diff is cut', async () => {
    const dir = await planned()
    built(dir, 1)
    appendFileSync(intentPath(dir), Array.from({ length: 60 }, (_, i) => `- note ${i + 1}\n`).join(''))
    const named = captureIo(() => handoff(dir, ['1', '--build', 'plan-edit-test'])).stdout
    expect(named).toContain('and `plumbbob handoff --full 1 --build plan-edit-test` prints the other 25.')
  })
})

describe('the finish report', () => {
  it('gains a plan edits column only when a step landed with an edited plan', async () => {
    const dir = await planned()
    writeFileSync(reportPath(dir), '# Report\n')
    bumpStepStat(dir, undefined, 1, 'redChecks')
    bumpStepStat(dir, undefined, 2, 'planEdits')
    captureIo(() => finish(dir))
    const report = readFileSync(reportPath(dir), 'utf8')
    expect(report).toContain('| step | red checks | drift warnings | plan edits | reverts | wall-clock |')
    expect(report).toContain('| ---- | ---------- | -------------- | ---------- | ------- | ---------- |')
    expect(report).toContain('| 1 | 1 | 0 | 0 | 0 | — |')
    expect(report).toContain('| 2 | 0 | 0 | 1 | 0 | — |')
    expect(report).toContain('| **total** | 1 | 0 | 1 | 0 | — |')
  })
})

// A plan with the two sections a grant's allowance never reaches.
const HELD_INTENT = `# Plan edit test

## Decisions

- <a id="d1"></a>**D1 (one-thing)**: do it once, *because* twice is waste

## Constraints

- <a id="c1"></a>**C1 (no-new-deps)**: no new dependencies

## Steps

1. [ ] First, **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second, **done when:** b works.
   - seam: \`src/b.ts\`
3. [ ] Third, **done when:** c works.
   - seam: \`src/c.ts\`
`

/** A hooked host whose landed plan is `intent`, with the mark taken under turn 1. */
async function plannedWith(intent: string): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Plan edit test', '--slug', 'plan-edit-test']))
  writeFileSync(intentPath(dir), intent)
  writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
  writeFileSync(turnPath(dir), '1\n')
  expect((await captureIoAsync(() => checkpoint(dir, ['--plan']))).code).toBe(0)
  return dir
}

describe('a grant typed with --plan-edits — D163 (plan-edits-grant)', () => {
  it('lands a step whose plan was edited, and keeps the row, the advisory and the stat', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build 1-2 --plan-edits')
    expect(readFileSync(grantPath(dir), 'utf8').trim()).toBe('steps 1-2')
    expect(readBase(dir)).toMatchObject({ turn: 2, steps: [], shown: false, text: readFileSync(intentPath(dir), 'utf8') })
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    const { code, stdout, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(stdout).toContain('Step 1 edited the plan')
    expect(readStats(dir)['1']?.planEdits).toBe(1)
    expect(readBase(dir)?.steps).toEqual([1])
    expect(readFileSync(buildLogPath(dir), 'utf8')).toContain(PLAN_ROW)
    // The mark moved with the landing, so step 2 answers only for its own edits.
    built(dir, 2)
    expect((await captureIoAsync(() => checkpoint(dir, ['2']))).code).toBe(0)
    expect(readStats(dir)['2']?.planEdits).toBeUndefined()
  })

  it('is the human\'s typed word alone: the flag with no grant takes no base, and neither does a job reporting back', async () => {
    const dir = await planned()
    humanTurn(dir, 'go on, --plan-edits is fine by me')
    expect(existsSync(basePath(dir))).toBe(false)
    expect(applyTurn(dir, JSON.stringify({ prompt: '<task-notification>/plumbbob:build 1-2 --plan-edits</task-notification>' }))).toBe(false)
    expect(existsSync(basePath(dir))).toBe(false)
    writeFileSync(grantPath(dir), 'steps 1-2\n') // a grant with no base beside it stays strict
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).stderr).toBe(planEditMessage(1, 2, 0))
  })

  it('lasts one turn: the next prompt without the flag is strict again', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build 1 --auto --plan-edits')
    built(dir, 1)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).code).toBe(0)
    humanTurn(dir, '/plumbbob:build 2-3')
    expect(existsSync(basePath(dir))).toBe(false) // nothing was edited, so there is nothing to keep for a card
    built(dir, 2)
    appendFileSync(intentPath(dir), EDIT)
    expect((await captureIoAsync(() => checkpoint(dir, ['2']))).stderr).toBe(planEditMessage(2, 2, 0))
  })

  it.each([
    ['a Decision', (t: string) => t.replace('do it once', 'do it twice')],
    ['a Decision', (t: string) => t.replace('## Decisions', '## Notes')],
    ['a Constraint', (t: string) => t.replace('no new dependencies', 'one new dependency')],
  ])('still stops for an edit that changes %s', async (held, change) => {
    const dir = await plannedWith(HELD_INTENT)
    humanTurn(dir, '/plumbbob:build 1-2 --plan-edits')
    built(dir, 1)
    writeFileSync(intentPath(dir), change(readFileSync(intentPath(dir), 'utf8')))
    const head = git(dir, ['rev-parse', 'HEAD'])
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(code).toBe(1)
    expect(stderr).toBe(planEditHeldMessage(1, 1, 1, held))
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(head)
    expect(readBase(dir)?.steps).toEqual([])
  })

  it('still stops for an edit to a step that has landed, and lets a later step be sharpened', async () => {
    const dir = await plannedWith(HELD_INTENT)
    humanTurn(dir, '/plumbbob:build 1-3 --plan-edits')
    built(dir, 1)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).code).toBe(0)
    built(dir, 2)
    const ticked = readFileSync(intentPath(dir), 'utf8')
    writeFileSync(intentPath(dir), ticked.replace('c works.', 'c works, and its test passes.'))
    expect((await captureIoAsync(() => checkpoint(dir, ['2']))).code).toBe(0)
    built(dir, 3)
    writeFileSync(intentPath(dir), readFileSync(intentPath(dir), 'utf8').replace('a works.', 'a works well.'))
    const { code, stderr } = await captureIoAsync(() => checkpoint(dir, ['3']))
    expect(code).toBe(1)
    expect(stderr).toBe(planEditHeldMessage(3, 1, 1, 'a landed step'))
  })

  it('lists what the run did to the plan on the next card, once, with the ticks left out', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build 1-2 --plan-edits')
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).code).toBe(0)
    built(dir, 2)
    const shown = card(dir)
    expect(shown).toContain('**Plan Edits**: [intent.md](.plumbbob/builds/plan-edit-test/intent.md) +2 -0 since the grant was typed with `--plan-edits`, by step 1;')
    expect(shown).toContain('+4. [ ] Fourth, **done when:** d works.')
    expect(shown).not.toContain('-1. [ ] First')
    expect(shown).not.toContain('**Plan Edit**:') // step 2 edited nothing itself
    expect(readBase(dir)?.shown).toBe(true)
    expect(card(dir)).toContain('**Plan Edits**:') // a reprint in the same turn still carries it
    humanTurn(dir)
    expect(existsSync(basePath(dir))).toBe(false)
    expect(card(dir)).not.toContain('**Plan Edits**:')
  })

  it('keeps the base past a prompt until a card has shown the run\'s edits, and allows nothing by it', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build 1 --auto --plan-edits')
    built(dir, 1)
    appendFileSync(intentPath(dir), EDIT)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).code).toBe(0)
    humanTurn(dir, '/plumbbob:build 2-3')
    expect(readBase(dir)?.steps).toEqual([1]) // not shown yet, so kept for the next card
    built(dir, 2)
    appendFileSync(intentPath(dir), '5. [ ] Fifth, **done when:** e works.\n   - seam: `src/e.ts`\n')
    expect((await captureIoAsync(() => checkpoint(dir, ['2']))).stderr).toBe(planEditMessage(2, 2, 0))
    expect(card(dir)).toContain('**Plan Edits**:')
  })

  it('prints no Plan Edits part for a flagged run that edited nothing, and the base never reaches git', async () => {
    const dir = await planned()
    humanTurn(dir, '/plumbbob:build 1-2 --plan-edits')
    built(dir, 1)
    expect((await captureIoAsync(() => checkpoint(dir, ['1']))).code).toBe(0)
    built(dir, 2)
    expect(card(dir)).not.toContain('**Plan Edits**:')
    expect(git(dir, ['status', '--porcelain', '--ignored'])).toContain('BASE')
    expect(git(dir, ['ls-files'])).not.toContain('BASE')
  })
})

