import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { defer } from '../defer.ts'
import { park } from '../park.ts'
import { exportPlan } from '../export.ts'
import { start } from '../start.ts'
import { activeBuild, intentPath } from '../../lib/sidecar.ts'
import { ending, transition } from '../../lib/notice.ts'
import { freshPlan, planJsonPath } from '../../lib/planfile.ts'
import { parseOpenQuestionRows, questionTotals } from '../../lib/orient.ts'
import { driverPointer } from '../handoff.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Four openers: one tagged to be decided, one kept open as a log that never
// got its marker (the shape D123 (defer-records) fixes), one with no tag at
// all, and one already resolved.
const INTENT = `# Defer test

## Steps

1. [ ] First, **done when:** a works.
   - seam: \`src/a.ts\`

## Open questions

- <a id="q1"></a>**Q1 (cache-home)**: Where does the cache live?, *resolve by:* decide
  - *plain:* two homes, one cheap
  - *lean:* the sidecar
- <a id="q2"></a>**Q2 (flare-numbers)**: What are the flare numbers?, *resolve by:* the balance patches from step 22 on, kept open as their log
- <a id="q3"></a>**Q3 (bare)**: Is a bare question deferrable?
- <a id="q4"></a>**Q4 (settled)**: Was this settled? *resolved:* 2026-10-30, yes
`

const TODAY = new Date().toISOString().slice(0, 10)

async function started(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Defer test']))
  writeFileSync(intentPath(dir), INTENT)
  return dir
}

/** The opener line of the given question, as the file now holds it. */
function opener(dir: string, id: string): string {
  return readFileSync(intentPath(dir), 'utf8').split('\n').find((l) => l.includes(`**${id} (`)) ?? ''
}

describe('defer', () => {
  it('swaps the *resolve by:* tag for a dated *deferred:* marker and prints the deferral and the pointer', async () => {
    const dir = await started()
    const { code, stdout } = captureIo(() => defer(dir, ['Q2', "the balance patches from step 22 on"]))
    expect(code).toBe(0)
    expect(opener(dir, 'Q2')).toBe(
      `- <a id="q2"></a>**Q2 (flare-numbers)**: What are the flare numbers?, *deferred:* ${TODAY}, until the balance patches from step 22 on`,
    )
    expect(stdout).toBe(
      ending({
        lead: transition({ label: 'Deferred', fact: 'Q2 (flare-numbers) until the balance patches from step 22 on' }),
        pointer: driverPointer(dir, activeBuild(dir)),
      }),
    )
  })

  it('moves the question out of the count to answer, leaving it open', async () => {
    const dir = await started()
    expect(questionTotals(parseOpenQuestionRows(readFileSync(intentPath(dir), 'utf8')))).toEqual({ toAnswer: 3, deferred: 0 })
    captureIo(() => defer(dir, ['Q2', 'step 22']))
    expect(questionTotals(parseOpenQuestionRows(readFileSync(intentPath(dir), 'utf8')))).toEqual({ toAnswer: 2, deferred: 1 })
  })

  it('leaves the sub-lines beneath the opener as they were', async () => {
    const dir = await started()
    captureIo(() => defer(dir, ['Q1', 'step 3 measures both']))
    const intent = readFileSync(intentPath(dir), 'utf8')
    expect(intent).toContain('  - *plain:* two homes, one cheap\n  - *lean:* the sidecar\n')
    expect(intent.split('\n').length).toBe(INTENT.split('\n').length)
  })

  it('drops a leading "until", reads a lowercase handle, and folds a multi-line clause onto the opener', async () => {
    const dir = await started()
    expect(captureIo(() => defer(dir, ['q2', 'until step 22\n  lands']))).toMatchObject({ code: 0 })
    expect(opener(dir, 'Q2')).toMatch(new RegExp(`\\*deferred:\\* ${TODAY}, until step 22 lands$`))
  })

  it('joins the end of an opener with no tag', async () => {
    const dir = await started()
    captureIo(() => defer(dir, ['Q3', 'the spike']))
    expect(opener(dir, 'Q3')).toBe(`- <a id="q3"></a>**Q3 (bare)**: Is a bare question deferrable?, *deferred:* ${TODAY}, until the spike`)
  })

  it('replaces an earlier deferral rather than stacking a second marker', async () => {
    const dir = await started()
    captureIo(() => defer(dir, ['Q2', 'step 22']))
    captureIo(() => defer(dir, ['Q2', 'step 30']))
    expect(opener(dir, 'Q2')).toMatch(new RegExp(`flare numbers\\?, \\*deferred:\\* ${TODAY}, until step 30$`))
    expect(opener(dir, 'Q2').match(/\*deferred:\*/g)).toHaveLength(1)
  })

  it('refuses a resolved question, a handle the plan lacks, and missing arguments, writing nothing', async () => {
    const dir = await started()
    const resolved = captureIo(() => defer(dir, ['Q4', 'later']))
    expect(resolved.code).toBe(1)
    expect(resolved.stderr).toContain('Q4 is already resolved')
    const missing = captureIo(() => defer(dir, ['Q9', 'later']))
    expect(missing.code).toBe(1)
    expect(missing.stderr).toContain('no open Q9 in the plan (open: Q1, Q2, Q3)')
    const noUntil = captureIo(() => defer(dir, ['Q2']))
    expect(noUntil.code).toBe(1)
    expect(noUntil.stderr).toContain('defer needs what settles it')
    expect(noUntil.stderr).toContain('plumbbob defer Q2 "<what settles it>"')
    const noHandle = captureIo(() => defer(dir, ['later']))
    expect(noHandle.code).toBe(1)
    expect(noHandle.stderr).toContain('defer needs a question')
    expect(readFileSync(intentPath(dir), 'utf8')).toBe(INTENT)
  })

  it('refuses with no active session', () => {
    const { code, stderr } = captureIo(() => defer(makeTempRepo(), ['Q1', 'x']))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})

describe('park beside an open question (D123 (defer-records))', () => {
  it('warns that a question it names still counts as to answer, with the deferral beneath', async () => {
    const dir = await started()
    const { code, stdout } = captureIo(() => park(dir, ['Q2 waits on the balance patches (tangent)']))
    expect(code).toBe(0)
    expect(stdout).toContain(
      'Q2 (flare-numbers) still counts as a question to answer ⚠\n  → plumbbob defer Q2 "<what settles it>", if the work will settle it\n',
    )
    // The park list never moves the count; only the marker does.
    expect(questionTotals(parseOpenQuestionRows(readFileSync(intentPath(dir), 'utf8')))).toEqual({ toAnswer: 3, deferred: 0 })
  })

  it('says nothing of a question already deferred, resolved, or not named', async () => {
    const dir = await started()
    captureIo(() => defer(dir, ['Q2', 'step 22']))
    const { stdout } = captureIo(() => park(dir, ['Q2 and Q4 and the Q-ball (tangent)']))
    expect(stdout).not.toContain('⚠')
  })
})

describe('defer with an exported plan.json — D14 (cli-keeps-current)', () => {
  it('re-exports after writing the marker, so the next check stays green', async () => {
    const dir = await started()
    mkdirSync(join(dir, 'src'), { recursive: true })
    expect(captureIo(() => exportPlan(dir, [])).code).toBe(0)
    const slug = activeBuild(dir) ?? ''
    const before = readFileSync(planJsonPath(dir, slug), 'utf8')
    expect(captureIo(() => defer(dir, ['Q1', 'the cache spike'])).code).toBe(0)
    const after = readFileSync(planJsonPath(dir, slug), 'utf8')
    expect(after).not.toBe(before)
    const fresh = freshPlan(dir, slug)
    expect(fresh.ok && fresh.text).toBe(after)
  })

  it('writes no plan.json for a build that was never exported', async () => {
    const dir = await started()
    expect(captureIo(() => defer(dir, ['Q1', 'the cache spike'])).code).toBe(0)
    expect(existsSync(planJsonPath(dir, activeBuild(dir) ?? ''))).toBe(false)
  })
})
