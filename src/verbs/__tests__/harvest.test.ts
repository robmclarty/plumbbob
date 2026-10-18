import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { handoff } from '../handoff.ts'
import { harvest, isHarvestDetail } from '../harvest.ts'
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

// Range 2's detail, proposing a class for parks 1 and 3 and leaving park 2 out.
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

- park 1 → tangent: the card renders it
- park 3 → blocker: step 4 builds on it

## Recommendation

Approve it. Both steps held their seams.
`

const HARVEST_DETAIL = `# Detail · Harvest

## Harvest

- park 1 → tangent: it can wait
- park 2 → tangent: cosmetic
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
    expect(entry).toContain('  - park 1 · one idea → tangent: the card renders it')
    expect(entry).toContain('  - park 2 · another (tangent) → no class proposed')
    expect(entry).toContain("  **1.** Step 2 parses the section.\n\n  The parser's story.")
    // Nothing committed; the detail file and the stamp are spent.
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(head)
    expect(existsSync(detailPath(dir))).toBe(false)
    expect(existsSync(stopPath(dir))).toBe(false)
    expect(stdout).toBe(
      [
        '**Stop**: Range 2 of 3 recorded (1 blocker, 1 tangent)',
        '',
        '**Next Up**: Step 4 of 4 - Fourth (details: `.plumbbob/builds/harvest-test/intent.md:11`)',
        '  · range 3 of 3: /plumbbob:run (step 4 to its pause) · parked 1 of 3 open',
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
    expect(stdout.startsWith('**Stop**: Range 2 of 3 recorded (nothing parked)\n\n**Next Up**')).toBe(true)
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

  it('refuses a range detail no stop card showed: no card, another range, or a detail rewritten after it', async () => {
    const refusal =
      "plumbbob: range 2 of 3's stop not recorded (no stop card showed its detail)\n  → plumbbob handoff --stop, then end the turn on the card\n"
    const unshown = await atStop({ card: false })
    expect(captureIo(() => harvest(unshown, [])).stderr).toBe(refusal)
    const rewritten = await atStop()
    writeFileSync(detailPath(rewritten), RANGE_DETAIL.replace('park 3 → blocker', 'park 3 → tangent'))
    expect(captureIo(() => harvest(rewritten, [])).stderr).toBe(refusal)
    const other = await atStop()
    writeFileSync(detailPath(other), RANGE_DETAIL.replace('# Detail · Range 2', '# Detail · Range 3'))
    expect(captureIo(() => harvest(other, [])).stderr).toContain("range 3 of 3's stop not recorded (no stop card showed its detail)")
  })

  it('refuses a range that no longer reads as landed', async () => {
    const dir = await atStop()
    writeFileSync(intentPath(dir), INTENT.replace('3. [x] Third', '3. [ ] Third'))
    expect(captureIo(() => harvest(dir, [])).stderr).toBe(
      "plumbbob: range 2 of 3's stop not recorded (step 3 is open again)\n  → land it, then plumbbob handoff --stop\n",
    )
  })
})

describe('harvest — the proposals it settles', () => {
  it('refuses the whole record for a park the list lacks, or a class outside the three', async () => {
    for (const [line, why] of [
      ['- park 9 → tangent: x', 'park 9 is not in the list; 3 parked'],
      ['- park 1 → later: x', 'park 1\'s class "later" is not blocker, tangent, or pivot'],
    ] as const) {
      const dir = await atStop({ card: false })
      writeFileSync(detailPath(dir), HARVEST_DETAIL.replace('- park 2 → tangent: cosmetic', line))
      const before = log(dir)
      expect(captureIo(() => harvest(dir, [])).stderr).toBe(
        `plumbbob: harvest not recorded (${why})\n  → fix the Harvest proposals in .plumbbob/detail.md\n`,
      )
      expect(log(dir)).toBe(before)
    }
  })

  it('records a harvest outside a stop with no stamp, and writes no Log line', async () => {
    const dir = await atStop({ card: false, detail: HARVEST_DETAIL })
    const { code, stdout } = captureIo(() => harvest(dir, []))
    expect(code).toBe(0)
    expect(stdout.startsWith('**Harvested**: 2 parked ideas (2 tangents)\n\n**Next Up**: Step 4 of 4')).toBe(true)
    const after = log(dir)
    expect(after).toContain('- [x] one idea\n- [x] another (tangent)\n- [ ] a third')
    expect(after).toContain(`- ${new Date().toISOString().slice(0, 10)}, at the step 3 boundary: 2 parked ideas, classified.`)
    expect(after).not.toContain('stop recorded')
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
    const headless = await atStop({ card: false, detail: '## Harvest\n\n- park 1 → tangent: x\n' })
    expect(captureIo(() => harvest(headless, [])).stderr).toContain('nothing to record (the detail file names no range or harvest)')
  })

  it("reads a boundary harvest's header, and nothing else, as a harvest", () => {
    expect(isHarvestDetail(HARVEST_DETAIL)).toBe(true)
    expect(isHarvestDetail('\n# Detail · Harvest\n')).toBe(true)
    expect(isHarvestDetail(RANGE_DETAIL)).toBe(false)
    expect(isHarvestDetail('# Detail · Harvest of the parser')).toBe(false)
  })
})
