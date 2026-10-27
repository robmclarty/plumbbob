import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { handoff, isHarvestDetail } from '../handoff.ts'
import { harvest } from '../harvest.ts'
import { park } from '../park.ts'
import { start } from '../start.ts'
import { buildLogPath, checkpointsPath, detailPath, intentPath, readRelay, statsPath, stopPath, turnPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Steps 1 to 3 landed, range 2 (steps 2 and 3) the range the last landing
// completed, and range 3 a bare call still to come.
const INTENT = `# Harvest test

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

// Range 2's detail, proposing a lean for P1 and P3 and leaving P2 out.
const RANGE_DETAIL = `# Detail · Range 2 · review the parser before the card reads it

── recap · range 2 of 3 ──
done-when    met
decisions    none exercised
constraints  all honored

## Summary

The parser reads the plan, and the card reads the parser.

## 1 Step 2 parses the section.

The parser's story.

## Harvest

- P1 → tangent: the card renders it
- P3 → blocker: step 4 builds on it

## Recommendation

Approve it. Both steps held their seams.
`

const HARVEST_DETAIL = `# Detail · Harvest

## Harvest

- P1 → tangent: it can wait
- P2 → tangent: cosmetic
`

function git(dir: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/**
 * Range 2 landed by a run, three parks on the list, and the stop card rendered
 * at turn 4 from `detail`; the human's reply is turn 5. `card: false` leaves
 * the card unrendered.
 */
async function atStop(opts: { detail?: string; card?: boolean } = {}): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Harvest test', '--slug', 'harvest-test']))
  writeFileSync(intentPath(dir), INTENT)
  mkdirSync(join(dir, 'src'), { recursive: true })
  const shas = ['a', 'b', 'c'].map((name, i) => {
    writeFileSync(join(dir, 'src', `${name}.ts`), `export const ${name} = ${i}\n`)
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', `step ${i + 1}`])
    return git(dir, ['rev-parse', 'HEAD'])
  })
  writeFileSync(checkpointsPath(dir), shas.map((sha, i) => `step ${i + 1} ${sha}\n`).join(''))
  writeFileSync(statsPath(dir), JSON.stringify({ '2': { startedAt: '2026-10-18T10:00:00.000Z', landedAt: '2026-10-18T10:45:00.000Z' } }))
  for (const idea of ['one idea', 'another (tangent)', 'a third']) {
    captureIo(() => park(dir, [idea]))
  }
  mkdirSync(join(dir, '.check'), { recursive: true })
  writeFileSync(join(dir, '.check', 'summary.json'), JSON.stringify({ ok: true, checks: [{ name: 'test', ok: true }] }))
  writeFileSync(detailPath(dir), opts.detail ?? RANGE_DETAIL)
  writeFileSync(turnPath(dir), '4\n')
  if (opts.card !== false) {
    expect(captureIo(() => handoff(dir, ['--stop'])).code).toBe(0)
  }
  writeFileSync(turnPath(dir), '5\n')
  return dir
}

/** The build-log as it stands. */
function log(dir: string): string {
  return readFileSync(buildLogPath(dir), 'utf8')
}

describe("harvest — a stop's record — D104 (harvest-records)", () => {
  it('flips each settled park, appends the dated Harvest lines, and writes the review beneath a dated Log line', async () => {
    const dir = await atStop()
    const head = git(dir, ['rev-parse', 'HEAD'])
    const { code, stdout, stderr } = captureIo(() => harvest(dir, []))
    expect(stderr).toBe('')
    expect(code).toBe(0)
    const after = log(dir)
    expect(after).toContain('- [x] one idea\n- [ ] another (tangent)\n- [x] a third')
    const date = new Date().toISOString().slice(0, 10)
    expect(after).toContain(
      [
        `- ${date}, at range 2 of 3's stop: 2 parked ideas, classified.`,
        '- **tangent**: park 1 · one idea → the card renders it',
        '- **blocker**: park 3 · a third → step 4 builds on it',
      ].join('\n'),
    )
    expect(after).not.toContain('- (none yet)')
    // The review rides beneath the range's Log line: the card as the human settled it.
    const entry = after.slice(after.indexOf(`- ${date} — range 2 of 3's stop recorded — review the parser before the card reads it`))
    expect(entry).toContain('\n\n  **Summary**: The parser reads the plan, and the card reads the parser.')
    expect(entry).toContain('  **Verdict**: ● Plumb')
    expect(entry).toContain('  **Harvested**: 3 of 3 parked ideas open')
    expect(entry).toContain('  | Park | What it is | Why it matters | Lean |')
    expect(entry).toContain('  | P1 | one idea | not given | tangent: the card renders it |')
    expect(entry).toContain('  | P2 | another (tangent) | not given | no lean proposed |')
    expect(entry).toContain("  **1.** Step 2 parses the section.\n\n  The parser's story.")
    // Nothing committed; the detail file and the stamp are spent.
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(head)
    expect(existsSync(detailPath(dir))).toBe(false)
    expect(existsSync(stopPath(dir))).toBe(false)
    expect(stdout).toBe(
      [
        '**Stop**: Range 2 of 3 recorded (1 blocker, 1 tangent)',
        '',
        '| **Next Up** | Step 4 of 4 - Fourth (details: [intent.md:11](.plumbbob/builds/harvest-test/intent.md#L11)) |',
        '| --- | --- |',
        '| Range | 3 of 3: /plumbbob:run (step 4 to its pause) |',
        '| Parked | 1 of 3 open |',
        '',
        '',
      ].join('\n'),
    )
    expect(readRelay(dir)).toEqual({ turn: 5, tier: 'orientation', render: 'harvest', text: stdout })
  })

  it('records a stop with no park open as the review alone — D100 (stop-card)', async () => {
    const dir = await atStop({ card: false })
    writeFileSync(buildLogPath(dir), log(dir).replace(/- \[ \]/g, '- [x]'))
    writeFileSync(turnPath(dir), '4\n')
    captureIo(() => handoff(dir, ['--stop']))
    writeFileSync(turnPath(dir), '5\n')
    const { code, stdout } = captureIo(() => harvest(dir, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('**Stop**: Range 2 of 3 recorded (nothing parked)\n\n| **Next Up** |')).toBe(true)
    expect(log(dir)).toContain("range 2 of 3's stop recorded")
    expect(log(dir)).toContain('- (none yet)') // no Harvest lines to write
  })
})

describe("harvest — the stop's latch — D103 (stop-latched)", () => {
  it('refuses in the turn the stop card printed, and records on the human turn after it', async () => {
    const dir = await atStop()
    writeFileSync(turnPath(dir), '4\n')
    const before = log(dir)
    expect(captureIo(() => harvest(dir, []))).toEqual({
      code: 1,
      stdout: '',
      stderr:
        "plumbbob: range 2 of 3's stop not recorded (its card printed this turn, and no human turn has read it)\n" +
        "  → end the turn on the card; the human's reply is what records it\n",
    })
    expect(log(dir)).toBe(before)
    expect(existsSync(detailPath(dir))).toBe(true)
    writeFileSync(turnPath(dir), '5\n')
    expect(captureIo(() => harvest(dir, [])).code).toBe(0)
  })

  it('refuses a range no stop card showed, no card or another range, and records a detail a reply rewrote since — D110 (reply-after-the-card)', async () => {
    const refusal = "plumbbob: range 2 of 3's stop not recorded (no stop card showed it)\n  → plumbbob handoff --stop, then end the turn on the card\n"
    const unshown = await atStop({ card: false })
    expect(captureIo(() => harvest(unshown, [])).stderr).toBe(refusal)
    const other = await atStop()
    writeFileSync(detailPath(other), RANGE_DETAIL.replace('# Detail · Range 2', '# Detail · Range 3'))
    expect(captureIo(() => harvest(other, [])).stderr).toContain("range 3 of 3's stop not recorded (no stop card showed it)")
    // A reply that changed a lean rewrote the file without printing the card
    // again; the change is the human's own, so the record takes it as written.
    const rewritten = await atStop()
    writeFileSync(detailPath(rewritten), RANGE_DETAIL.replace('P3 → blocker', 'P3 → tangent'))
    const { code, stdout } = captureIo(() => harvest(rewritten, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('**Stop**: Range 2 of 3 recorded (2 tangents)')).toBe(true)
  })

  it('refuses a range whose landed step was cleared by hand since, as open again', async () => {
    const dir = await atStop()
    writeFileSync(intentPath(dir), INTENT.replace('3. [x] Third', '3. [ ] Third'))
    expect(captureIo(() => harvest(dir, [])).stderr).toBe(
      "plumbbob: range 2 of 3's stop not recorded (step 3 is open again)\n  → land it, then plumbbob handoff --stop --full\n",
    )
  })

  it('refuses a step folded into the range that just landed, and records in the same reply once it moves — D92 (build-ranges)', async () => {
    const dir = await atStop()
    const step5 = '5. [ ] Fix the parser P3 found — **done when:** e works.\n   - seam: `src/e.ts`\n\n## Build ranges'
    const withStep5 = INTENT.replace('## Build ranges', step5)
    writeFileSync(intentPath(dir), withStep5.replace('`/plumbbob:build 2-3`', '`/plumbbob:build 2-3,5`'))
    const before = { log: log(dir), detail: readFileSync(detailPath(dir), 'utf8'), stop: readFileSync(stopPath(dir), 'utf8') }
    expect(captureIo(() => harvest(dir, []))).toEqual({
      code: 1,
      stdout: '',
      stderr:
        "plumbbob: range 2 of 3's stop not recorded (step 5 joined it after it landed)\n" +
        '  → move step 5 to a range still to come, then plumbbob harvest\n',
    })
    expect({ log: log(dir), detail: readFileSync(detailPath(dir), 'utf8'), stop: readFileSync(stopPath(dir), 'utf8') }).toEqual(before)
    // Moved into a bare range of its own, the next free item number; the reply's turn is still 5.
    writeFileSync(intentPath(dir), `${withStep5}4. \`/plumbbob:build 5\`, **stop:** at step 5's pause, approve the fix\n`)
    const { code, stdout } = captureIo(() => harvest(dir, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('**Stop**: Range 2 of 4 recorded (1 blocker, 1 tangent)')).toBe(true)
    expect(log(dir)).toContain("range 2 of 4's stop recorded")
    expect(existsSync(detailPath(dir))).toBe(false)
    expect(existsSync(stopPath(dir))).toBe(false)
  })
})

describe('harvest — the proposals it settles', () => {
  it('refuses the whole record for a handle the list lacks, or a class outside the three, naming each by its handle — D105 (park-handles)', async () => {
    for (const [line, why] of [
      ['- P9 → tangent: x', 'P9 is not in the list; 3 parked'],
      ['- P1 → later: x', 'P1\'s class "later" is not blocker, tangent, or pivot'],
      // The `- park 6 →` wire a detail written before the handles carried still reads, and refuses the same way.
      ['- park 9 → tangent: x', 'P9 is not in the list; 3 parked'],
    ] as const) {
      const dir = await atStop({ card: false })
      writeFileSync(detailPath(dir), HARVEST_DETAIL.replace('- P2 → tangent: cosmetic', line))
      const before = log(dir)
      expect(captureIo(() => harvest(dir, [])).stderr).toBe(
        `plumbbob: harvest not recorded (${why})\n  → fix the Harvest proposals in .plumbbob/detail.md\n`,
      )
      expect(log(dir)).toBe(before)
    }
  })

  it('records a harvest outside a stop with no stamp, ends on `Recorded`, and writes no Log line — D106 (leans-harvested)', async () => {
    const dir = await atStop({ card: false, detail: HARVEST_DETAIL })
    const { code, stdout } = captureIo(() => harvest(dir, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('**Recorded**: 2 parked ideas (2 tangents)\n\n| **Next Up** | Step 4 of 4')).toBe(true)
    expect(stdout).not.toContain('**Harvested**')
    const after = log(dir)
    expect(after).toContain('- [x] one idea\n- [x] another (tangent)\n- [ ] a third')
    expect(after).toContain(`- ${new Date().toISOString().slice(0, 10)}, at the step 3 boundary: 2 parked ideas, classified.`)
    expect(after).not.toContain('stop recorded')
    // A detail written with the `- park 6 →` wire records the same parks.
    const legacy = await atStop({ card: false, detail: HARVEST_DETAIL.replace(/- P(\d) →/g, '- park $1 →') })
    expect(captureIo(() => harvest(legacy, [])).code).toBe(0)
    expect(log(legacy)).toContain('- [x] one idea\n- [x] another (tangent)\n- [ ] a third')
  })

  it('refuses a harvest that settles no open park', async () => {
    const dir = await atStop({ card: false, detail: '# Detail · Harvest\n\n## Harvest\n' })
    expect(captureIo(() => harvest(dir, [])).stderr).toBe(
      'plumbbob: harvest not recorded (the detail file settles no open park)\n  → fix the Harvest proposals in .plumbbob/detail.md\n',
    )
  })
})

describe('harvest — nothing to record', () => {
  it("refuses a step's detail, pointing at the checkpoint that records it", async () => {
    const dir = await atStop({ card: false, detail: '# Detail · Step 3 · Third\n\n## Summary\n\nC works.\n' })
    expect(captureIo(() => harvest(dir, []))).toEqual({
      code: 1,
      stdout: '',
      stderr: "plumbbob: nothing to record (the detail file is Step 3's, not a range's or a harvest's)\n  → plumbbob checkpoint 3 records a step's detail\n",
    })
  })

  it('refuses an empty detail file, and one that names no range or harvest', async () => {
    const empty = await atStop({ card: false, detail: '' })
    expect(captureIo(() => harvest(empty, [])).stderr).toContain('nothing to record (the detail file is empty)')
    const headless = await atStop({ card: false, detail: '## Harvest\n\n- P1 → tangent: x\n' })
    expect(captureIo(() => harvest(headless, [])).stderr).toContain('nothing to record (the detail file names no range or harvest)')
  })

  it("reads a boundary harvest's header, and nothing else, as a harvest", () => {
    expect(isHarvestDetail(HARVEST_DETAIL)).toBe(true)
    expect(isHarvestDetail('\n# Detail · Harvest\n')).toBe(true)
    expect(isHarvestDetail(RANGE_DETAIL)).toBe(false)
    expect(isHarvestDetail('# Detail · Harvest of the parser')).toBe(false)
  })
})
