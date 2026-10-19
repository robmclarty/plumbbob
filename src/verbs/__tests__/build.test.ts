import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from '../build.ts'
import { notice } from '../../lib/notice.ts'
import { start } from '../start.ts'
import {
  activeBuild,
  buildDir,
  buildLogPath,
  detailPath,
  grantPath,
  intentPath,
  readStats,
  seamPath,
  stepPath,
  stopPath,
  tickPath,
  turnPath,
  writeStop,
} from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

const INTENT = `# Build test

## Steps

1. [ ] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`, \`src/c.ts\`
`

async function startedWithSteps(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Build test']))
  writeFileSync(intentPath(dir), INTENT)
  return dir
}

describe('build', () => {
  it('writes the seam + step and goes in-flight (the BUILD phase signal)', async () => {
    const dir = await startedWithSteps()
    const { code, stdout } = captureIo(() => build(dir, ['2']))
    expect(code).toBe(0)
    expect(readFileSync(seamPath(dir), 'utf8')).toBe('src/b.ts\nsrc/c.ts\n')
    expect(readFileSync(stepPath(dir), 'utf8').trim()).toBe('2')
    expect(stdout).toContain('building step 2')
    // The seam is printed indented, one path per line, as a readout under the
    // notice that frames it: a list is not a one-liner.
    expect(stdout).toContain(
      notice({ fact: 'the seam is orientation, not a lock', detail: ['2 paths'] }) + '  src/b.ts\n  src/c.ts',
    )
  })

  it('with no argument, enters the next undone step', async () => {
    const dir = await startedWithSteps() // steps 1 and 2 both undone
    const { code, stdout } = captureIo(() => build(dir, []))
    expect(code).toBe(0)
    expect(readFileSync(stepPath(dir), 'utf8').trim()).toBe('1')
    expect(readFileSync(seamPath(dir), 'utf8')).toBe('src/a.ts\n')
    expect(stdout).toContain('building step 1 (next undone)')
  })

  it('an explicit jump past undone work says what it skips', async () => {
    // A deliberate `build 2` over an undone step 1 and a confused one must
    // look different on the page; the count is the tell.
    const dir = await startedWithSteps() // steps 1 and 2 both undone
    const { stdout } = captureIo(() => build(dir, ['2']))
    expect(stdout).toContain(notice({ fact: 'building step 2', detail: ['explicitly requested', 'skips 1 undone step'] }))
  })

  it('an explicit request that skips nothing carries no note', async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), INTENT.replace('1. [ ]', '1. [x]'))
    const { stdout } = captureIo(() => build(dir, ['2']))
    expect(stdout).toContain(notice({ fact: 'building step 2' }))
  })

  it('with no argument and every step checkpointed, refuses and writes nothing', async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), INTENT.replace('1. [ ]', '1. [x]').replace('2. [ ]', '2. [x]'))
    const { code, stderr } = captureIo(() => build(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('no undone step to build')
    expect(existsSync(stepPath(dir))).toBe(false)
    expect(existsSync(seamPath(dir))).toBe(false)
  })

  it('rejects a non-numeric, mixed, or sub-1 step with the usage message', async () => {
    // Each shape trips a different validation clause: no digits, digits at the
    // wrong end (both ends), and a number below 1.
    for (const bad of ['nope', 'x2', '2x', '0']) {
      const dir = await startedWithSteps()
      const { code, stderr } = captureIo(() => build(dir, [bad]))
      expect(code).toBe(1)
      expect(stderr).toContain('build needs a step number')
    }
  })

  it('accepts a multi-digit step number as a number, not a stray token', async () => {
    // Step 12 does not exist in the intent, but it must reach seam parsing,
    // not bounce off the step-number validation.
    const dir = await startedWithSteps()
    const { code, stderr } = captureIo(() => build(dir, ['12']))
    expect(code).toBe(1)
    expect(stderr).not.toContain('build needs a step number')
    expect(stderr).toContain('`build 12` again')
  })

  it('rejects a step range, naming it a /plumbbob:build feature (not the generic usage)', async () => {
    // `1-3` looks like a step arg but is a skill-level affordance; the CLI records
    // one in-flight step at a time, so it points back at the skill and a single step.
    const dir = await startedWithSteps()
    const { code, stderr } = captureIo(() => build(dir, ['1-3']))
    expect(code).toBe(1)
    expect(stderr).not.toContain('build needs a step number')
    expect(stderr).toContain('`1-3` is a /plumbbob:build range')
    expect(stderr).toContain('plumbbob build 1')
  })

  it('rejects a list the same way, pointing at its first undone step in build order — D16 (list-reading)', async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), REORDERED.replace('1. [ ]', '1. [x]')) // order 1, 3, 2 with 1 done
    for (const args of [['2,3'], ['2,', '3'], ['1-3']]) {
      const { code, stderr } = captureIo(() => build(dir, args))
      expect(code).toBe(1)
      expect(stderr).toBe(
        notice({
          fact: 'build takes one step number',
          detail: [`\`${args[0] ?? ''}\` is a /plumbbob:build range, which auto-approves through its top and then stops`],
          remedy: 'plumbbob build 3',
        }),
      )
    }
    expect(existsSync(stepPath(dir))).toBe(false)
  })

  it('skips flag args when finding the step number', async () => {
    const dir = await startedWithSteps()
    const { code } = captureIo(() => build(dir, ['--quiet', '2']))
    expect(code).toBe(0)
    expect(readFileSync(stepPath(dir), 'utf8').trim()).toBe('2')
  })

  it('reports a step with no parseable seam, pointing at intent.md', async () => {
    const dir = await startedWithSteps()
    const { code, stderr } = captureIo(() => build(dir, ['9']))
    expect(code).toBe(1)
    expect(stderr).toContain("→ fix the step's seam in intent.md, then `build 9` again")
  })

  it('refuses with no active session — and says so', async () => {
    const { code, stderr } = captureIo(() => build(makeTempRepo(), ['1']))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })

  it('targets a non-cursor build with --build, landing SEAM/STEP in that folder', async () => {
    const dir = await startedWithSteps() // cursor build is `build-test`
    const alt = buildDir(dir, 'alt-build')
    mkdirSync(alt, { recursive: true })
    writeFileSync(join(alt, 'intent.md'), INTENT)
    writeFileSync(turnPath(dir), '6\n') // the ledger is per-worktree; the stamp follows the build

    const { code } = captureIo(() => build(dir, ['--build', 'alt-build', '2']))
    expect(code).toBe(0)
    // the slug is a bare token after --build; it must not be read as the step number
    expect(readFileSync(join(alt, 'SEAM'), 'utf8')).toBe('src/b.ts\nsrc/c.ts\n')
    expect(readFileSync(join(alt, 'STEP'), 'utf8').trim()).toBe('2')
    expect(readFileSync(join(alt, 'TICK'), 'utf8')).toBe('6\n')
    expect(existsSync(seamPath(dir))).toBe(false) // the cursor build was not touched
    expect(existsSync(tickPath(dir))).toBe(false)
  })

  it('stamps TICK = TURN at entry — the span the checkpoint latch measures — D64 (approval-latch)', async () => {
    const dir = await startedWithSteps()
    writeFileSync(turnPath(dir), '5\n')
    const { code } = captureIo(() => build(dir, ['2']))
    expect(code).toBe(0)
    expect(readFileSync(tickPath(dir), 'utf8')).toBe('5\n')
  })

  it('stamps no TICK when TURN is absent — a hookless host grows no ledger', async () => {
    const dir = await startedWithSteps()
    const { code } = captureIo(() => build(dir, ['2']))
    expect(code).toBe(0)
    expect(existsSync(tickPath(dir))).toBe(false)
  })
})

describe('build — the last step a grant reaches — D85 (range-top-lands)', () => {
  const REMEDY = 'land it on green, then stop at the boundary'
  const TOP = notice({ fact: 'step 2 is the top of the range you granted', remedy: REMEDY })

  it('names the top step as it enters it, between the entry line and the seam', async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), INTENT.replace('1. [ ]', '1. [x]'))
    writeFileSync(grantPath(dir), 'range 2\n')
    const { code, stdout } = captureIo(() => build(dir, ['2']))
    expect(code).toBe(0)
    // The step still lands like the rest; the line only says where the range
    // ends, before the model decides whether to land the step or hold it.
    expect(stdout).toContain(
      notice({ fact: 'building step 2' }) + TOP + notice({ fact: 'the seam is orientation, not a lock', detail: ['2 paths'] }),
    )
  })

  it('names it on a bare build too, since the grant speaks to the step and not to how it was picked', async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), INTENT.replace('1. [ ]', '1. [x]'))
    writeFileSync(grantPath(dir), 'range 2\n')
    const { stdout } = captureIo(() => build(dir, []))
    expect(stdout).toContain(notice({ fact: 'building step 2', detail: ['next undone'] }) + TOP)
  })

  it('names the last undone step when a range runs past the end of the plan', async () => {
    // `1-9` over a two-step plan: the plan ends first, so step 2 is the clean
    // halt even though the range's own top is never reached.
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), INTENT.replace('1. [ ]', '1. [x]'))
    writeFileSync(grantPath(dir), 'range 9\n')
    const { stdout } = captureIo(() => build(dir, ['2']))
    expect(stdout).toContain(
      notice({ fact: 'step 2 is the last undone step in the range you granted', remedy: REMEDY }),
    )
  })

  it("names the plan's last undone step under `--auto`, the other clean halt", async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), INTENT.replace('1. [ ]', '1. [x]'))
    writeFileSync(grantPath(dir), 'auto\n')
    const { stdout } = captureIo(() => build(dir, ['2']))
    expect(stdout).toContain(notice({ fact: 'step 2 is the last undone step in the plan', remedy: REMEDY }))
  })

  it('stays quiet wherever work is left under the grant, and with no grant at all', async () => {
    const dir = await startedWithSteps() // steps 1 and 2 both undone
    const quiet = (grant: string | null, step: string): void => {
      if (grant === null) {
        rmSync(grantPath(dir), { force: true })
      } else {
        writeFileSync(grantPath(dir), `${grant}\n`)
      }
      expect(captureIo(() => build(dir, [step])).stdout).not.toContain(REMEDY)
    }
    quiet('range 2', '1') // below the top
    quiet('range 9', '1') // step 2 is still ahead inside the range
    quiet('range 1', '2') // past the top: the checkpoint refuses it, so nothing to announce
    quiet('auto', '1') // step 2 is still ahead
    quiet('auto', '2') // step 1 is still undone behind it
    quiet(null, '2')
  })
})

describe('build — the last step a step-list grant reaches — D12 (step-list-grants)', () => {
  const REMEDY = 'land it on green, then stop at the boundary'

  it('names the last undone step the list holds as its top, in build order', async () => {
    // `steps 2-3` over the order 1, 3, 2: the walk runs 3 then 2, so 2 is the top.
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), REORDERED.replace('1. [ ]', '1. [x]'))
    writeFileSync(grantPath(dir), 'steps 2-3\n')
    expect(captureIo(() => build(dir, ['3'])).stdout).not.toContain(REMEDY)
    rmSync(stepPath(dir), { force: true })
    expect(captureIo(() => build(dir, ['2'])).stdout).toContain(
      notice({ fact: 'step 2 is the top of the range you granted', remedy: REMEDY }),
    )
  })

  it('names the step before one the list does not hold, where the walk halts', async () => {
    // `steps 1-2` over the order 1, 3, 2: step 3 comes next and is not named.
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), REORDERED)
    writeFileSync(grantPath(dir), 'steps 1-2\n')
    expect(captureIo(() => build(dir, ['1'])).stdout).toContain(
      notice({ fact: 'step 1 is the last undone step in the range you granted', remedy: REMEDY }),
    )
  })

  it('reaches past a step the plan ends on, and stays quiet for a step the list does not hold', async () => {
    const dir = await startedWithSteps() // two steps, both undone
    writeFileSync(grantPath(dir), 'steps 1-9\n')
    expect(captureIo(() => build(dir, ['1'])).stdout).not.toContain(REMEDY)
    rmSync(stepPath(dir), { force: true })
    expect(captureIo(() => build(dir, ['2'])).stdout).toContain(
      notice({ fact: 'step 2 is the top of the range you granted', remedy: REMEDY }),
    )
    rmSync(stepPath(dir), { force: true })
    writeFileSync(grantPath(dir), 'steps 2\n')
    expect(captureIo(() => build(dir, ['1'])).stdout).not.toContain(REMEDY)
  })
})

describe('build — the build-log mirror — D69 (cli-owned-buildlog)', () => {
  it('sets Current step to `<n> — <title>` and marks the mirror', async () => {
    const dir = await startedWithSteps()
    captureIo(() => build(dir, ['2']))
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toContain('**Current step:** 2 — Second')
    expect(log).toContain('- ☐ 1. First')
    expect(log).toContain('- ☐ 2. Second')
    expect(log).not.toContain('- ☐ 1. <step>')
  })

  it('reflects an already-checkpointed step as ☑ in the mirror', async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), INTENT.replace('1. [ ]', '1. [x]'))
    captureIo(() => build(dir, ['2']))
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toContain('- ☑ 1. First')
    expect(log).toContain('- ☐ 2. Second')
  })
})

describe('build — the wall-clock receipt (research/07 2b)', () => {
  it('stamps startedAt for the step on entry', async () => {
    const dir = await startedWithSteps()
    captureIo(() => build(dir, ['1']))
    const started = readStats(dir)['1']?.startedAt
    expect(started).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// Three undone steps and a build order putting 3 ahead of 2: what the plan
// reads once `plumbbob order 1 3 2` has run against it.
const REORDERED = `# Build order test

## Steps

1. [ ] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second — **done when:** b works.
   - seam: \`src/b.ts\`
3. [ ] Third — **done when:** c works.
   - seam: \`src/c.ts\`

## Build order

1, 3, 2
`

describe('build — the build order', () => {
  it('with no argument, enters the first undone step in build order', async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), REORDERED.replace('1. [ ]', '1. [x]'))
    const { code, stdout } = captureIo(() => build(dir, []))
    expect(code).toBe(0)
    expect(readFileSync(stepPath(dir), 'utf8').trim()).toBe('3')
    expect(stdout).toContain('building step 3 (next undone)')
  })

  it('counts what an explicit jump skips by build order, not by number', async () => {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), REORDERED.replace('1. [ ]', '1. [x]'))
    // Step 2 sits behind step 3 in the order, so building 2 skips one; building
    // 3 skips nothing, though its number is the higher.
    expect(captureIo(() => build(dir, ['2'])).stdout).toContain(
      notice({ fact: 'building step 2', detail: ['explicitly requested', 'skips 1 undone step'] }),
    )
    rmSync(stepPath(dir), { force: true })
    expect(captureIo(() => build(dir, ['3'])).stdout).toContain(notice({ fact: 'building step 3' }))
  })

  it('names the last step a range reaches by build order — D85 (range-top-lands)', async () => {
    // Range 1-2 over the order 1, 3, 2: step 3 comes next and is past the top,
    // so step 1 is the last the range reaches, though step 2 is undone.
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), REORDERED)
    writeFileSync(grantPath(dir), 'range 2\n')
    const { stdout } = captureIo(() => build(dir, ['1']))
    expect(stdout).toContain(
      notice({ fact: 'step 1 is the last undone step in the range you granted', remedy: 'land it on green, then stop at the boundary' }),
    )
  })
})

describe('build — a call the plan reserves halts --auto — D94 (auto-and-stops)', () => {
  // Steps 1 and 2 land as one range; step 3 is a call made at its own pause.
  const RANGED = `${INTENT}3. [ ] Third — **done when:** c works.
   - seam: \`src/d.ts\`

## Build ranges

1. \`/plumbbob:build 1-2\`, **stop:** review the parser
2. \`/plumbbob:build 3\`, **stop:** at step 3's pause, pick the label
`
  const RESERVED = notice({
    fact: 'step 3 ends at its pause, where the plan reserves the call for the human',
    detail: ['range 2 of 2'],
    remedy: 'hold it there for their approval, --auto or not',
  })
  const LANDS = 'land it on green, then stop at the boundary'

  async function rangedAt(done: ReadonlyArray<number>, grant: string | null, intent = RANGED): Promise<string> {
    const dir = await startedWithSteps()
    writeFileSync(intentPath(dir), done.reduce((text, n) => text.replace(`${n}. [ ]`, `${n}. [x]`), intent))
    if (grant !== null) writeFileSync(grantPath(dir), `${grant}\n`)
    return dir
  }

  it('says a bare range ends at its pause under --auto, in place of the last-step line', async () => {
    const dir = await rangedAt([1, 2], 'auto')
    const { code, stdout } = captureIo(() => build(dir, ['3']))
    expect(code).toBe(0)
    expect(stdout).toContain(notice({ fact: 'building step 3' }) + RESERVED + notice({ fact: 'the seam is orientation, not a lock', detail: ['1 path'] }))
    expect(stdout).not.toContain(LANDS)
  })

  it('runs a range that lands its steps through under --auto', async () => {
    const dir = await rangedAt([], 'auto')
    expect(captureIo(() => build(dir, ['1'])).stdout).not.toContain('ends at its pause')
  })

  it('leaves a typed range as typed, a run with no grant as before, and --auto on a plan without ranges unchanged', async () => {
    const listed = await rangedAt([1, 2], 'steps 1-3')
    expect(captureIo(() => build(listed, ['3'])).stdout).toContain(notice({ fact: 'step 3 is the top of the range you granted', remedy: LANDS }))
    const ceiling = await rangedAt([1, 2], 'range 3')
    expect(captureIo(() => build(ceiling, ['3'])).stdout).toContain(notice({ fact: 'step 3 is the top of the range you granted', remedy: LANDS }))
    const none = await rangedAt([1, 2], null)
    expect(captureIo(() => build(none, ['3'])).stdout).not.toContain('ends at its pause')
    const plain = await rangedAt([1, 2], 'auto', RANGED.replace(/## Build ranges[\s\S]*$/, ''))
    expect(captureIo(() => build(plain, ['3'])).stdout).toContain(notice({ fact: 'step 3 is the last undone step in the plan', remedy: LANDS }))
  })
})

describe('build — a stop card waiting for its reply — D103 (stop-latched)', () => {
  // Steps 1 to 3 landed, range 2 (steps 2 and 3) the range the last landing
  // completed, and range 3 a bare call still to come.
  const RANGED = `# Build test

## Steps

1. [x] First — **done when:** a works.
   - seam: \`src/a.ts\`
2. [x] Second — **done when:** b works.
   - seam: \`src/b.ts\`
3. [x] Third — **done when:** c works.
   - seam: \`src/c.ts\`
4. [ ] Fourth — **done when:** d works.
   - seam: \`src/d.ts\`

## Build ranges

1. \`/plumbbob:build 1\`, **stop:** at step 1's pause, approve the schema
2. \`/plumbbob:build 2-3\`, **stop:** review the parser before the card reads it
3. \`/plumbbob:build 4\`, **stop:** at step 4's pause, pick the label
`

  const RANGE_DETAIL = '# Detail · Range 2 · review the parser before the card reads it\n\n## Summary\n\nIt parses.\n'

  /** The refusal for range `item` of `count`'s card, its remedy adding `also` to `looks good`. */
  const refusal = (item: number, count: number, also: string): string =>
    `plumbbob: no step entered (range ${item} of ${count}'s stop card is waiting for its reply)\n` +
    `  → reply to the card; looks good records it${also}\n`

  const RUN_3 = ', and /plumbbob:run records it, then runs range 3 of 3'

  /**
   * A build whose plan is `intent`, with range `range`'s stop card stamped at
   * turn 4 over a detail file for range 2, and the human's reply as turn 5.
   */
  async function atCard(intent = RANGED, range = 2): Promise<string> {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Build test']))
    writeFileSync(intentPath(dir), intent)
    // The stamp keeps the detail file's digest, and writes nothing without one.
    writeFileSync(detailPath(dir), RANGE_DETAIL)
    writeStop(dir, undefined, { range, turn: 4, hash: 'card' })
    writeFileSync(turnPath(dir), '5\n')
    return dir
  }

  it('refuses a bare build and a named one, writing no marker and stamping nothing', async () => {
    const dir = await atCard()
    for (const args of [[], ['4'], ['2']]) {
      expect(captureIo(() => build(dir, args)), args.join(' ')).toEqual({ code: 1, stdout: '', stderr: refusal(2, 3, RUN_3) })
    }
    expect([existsSync(stepPath(dir)), existsSync(seamPath(dir)), existsSync(tickPath(dir))]).toEqual([false, false, false])
    expect(readStats(dir)['4']?.startedAt).toBeUndefined()
    expect(readFileSync(detailPath(dir), 'utf8')).toBe(RANGE_DETAIL)
  })

  it("names the finish on the plan's last range, ahead of the refusal for no undone step", async () => {
    const dir = await atCard(RANGED.replace('4. [ ] Fourth', '4. [x] Fourth').replace('3. `/plumbbob:build 4`', '3. `/plumbbob:build 4-4`'), 3)
    writeFileSync(detailPath(dir), RANGE_DETAIL.replace('Range 2', 'Range 3'))
    writeStop(dir, undefined, { range: 3, turn: 4, hash: 'card' })
    expect(captureIo(() => build(dir, [])).stderr).toBe(refusal(3, 3, ', and /plumbbob:finish records it, then writes the report'))
  })

  it('names looks good alone when the next run would refuse', async () => {
    const dir = await atCard(RANGED.replace(/^3\. `\/plumbbob:build 4`.*$/m, ''))
    expect(captureIo(() => build(dir, ['4'])).stderr).toBe(refusal(2, 2, ''))
  })

  it('still refuses once the detail file is rewritten after the card, since the digest is the record latch', async () => {
    const dir = await atCard()
    writeFileSync(detailPath(dir), `${RANGE_DETAIL}\n## Recommendation\n\nApprove it.\n`)
    expect(captureIo(() => build(dir, ['4'])).stderr).toBe(refusal(2, 3, RUN_3))
  })

  it('enters once nothing waits: the card recorded, a step or harvest detail, a stamp for another range, or a range re-cut', async () => {
    const recorded = await atCard()
    rmSync(detailPath(recorded), { force: true })
    rmSync(stopPath(recorded), { force: true })
    const stepDetail = await atCard()
    writeFileSync(detailPath(stepDetail), '# Detail · Step 3 · Third\n\n## Summary\n\nC works.\n')
    const harvestDetail = await atCard()
    writeFileSync(detailPath(harvestDetail), '# Detail · Harvest\n\n## Harvest\n\n- P1 → tangent: x\n')
    const otherRange = await atCard(RANGED, 1)
    // A blocker went into range 2 as step 4, so the range no longer reads as landed.
    const recut = await atCard(RANGED.replace('`/plumbbob:build 2-3`', '`/plumbbob:build 2-4`').replace(/^3\. `\/plumbbob:build 4`.*$/m, ''))
    for (const dir of [recorded, stepDetail, harvestDetail, otherRange, recut]) {
      const { code, stdout } = captureIo(() => build(dir, ['4']))
      expect(code).toBe(0)
      expect(stdout).toContain('building step 4')
    }
  })

  it('reads the card per build under --build', async () => {
    const dir = await atCard()
    const alt = buildDir(dir, 'alt-build')
    mkdirSync(alt, { recursive: true })
    writeFileSync(join(alt, 'intent.md'), INTENT)
    expect(captureIo(() => build(dir, ['--build', 'alt-build', '2'])).code).toBe(0)
    expect(captureIo(() => build(dir, ['--build', String(activeBuild(dir)), '4'])).stderr).toBe(refusal(2, 3, RUN_3))
  })
})
