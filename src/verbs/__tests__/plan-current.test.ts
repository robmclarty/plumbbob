import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { exportPlan } from '../export.ts'
import { finish } from '../finish.ts'
import { harvest } from '../harvest.ts'
import { start } from '../start.ts'
import { freshPlan, planJsonPath } from '../../lib/planfile.ts'
import { intentPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// The verbs that move a build on bring an exported plan.json up to intent.md
// before they do anything else, so a hand edit never needs a remembered export.
// `build` and `checkpoint` hold the same rule in their own test files.

const SLUG = 'plan-current'

const INTENT = `# Plan current

## Steps

1. [ ] First
   - seam: \`src/a.ts\`
   - proof: a works
`

/** A session whose build was exported once, then had intent.md edited by hand. */
async function editedAfterExport(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Plan current', '--slug', SLUG]))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(intentPath(dir), INTENT)
  expect(captureIo(() => exportPlan(dir, [])).code).toBe(0)
  writeFileSync(intentPath(dir), INTENT.replace('a works', 'a works well'))
  return dir
}

function current(dir: string): boolean {
  const fresh = freshPlan(dir, SLUG)
  return fresh.ok && fresh.text === readFileSync(planJsonPath(dir, SLUG), 'utf8')
}

describe('an exported plan.json is brought current by the next move — D146 (cli-keeps-current)', () => {
  it('harvest refreshes it as it starts, even when it then has nothing to record', async () => {
    const dir = await editedAfterExport()
    expect(current(dir)).toBe(false)
    captureIo(() => harvest(dir, []))
    expect(current(dir)).toBe(true)
    expect(readFileSync(planJsonPath(dir, SLUG), 'utf8')).toContain('a works well')
  })

  it('finish refreshes it, so the last commit carries the plan as intent.md reads', async () => {
    const dir = await editedAfterExport()
    expect(captureIo(() => finish(dir)).code).toBe(0)
    const committed = execFileSync('git', ['-C', dir, 'show', `HEAD:.plumbbob/builds/${SLUG}/plan.json`], { encoding: 'utf8' })
    expect(committed).toContain('a works well')
    expect(committed).toBe(readFileSync(planJsonPath(dir, SLUG), 'utf8'))
  })

  it('keeps the old file and says so when the edit leaves the plan failing a check', async () => {
    const dir = await editedAfterExport()
    expect(captureIo(() => exportPlan(dir, [])).code).toBe(0)
    const before = readFileSync(planJsonPath(dir, SLUG), 'utf8')
    writeFileSync(intentPath(dir), INTENT.replace('   - proof: a works', '   - after: 9\n   - proof: a works'))
    const { stderr } = captureIo(() => harvest(dir, []))
    expect(stderr).toContain('lan.json was left as it was')
    expect(readFileSync(planJsonPath(dir, SLUG), 'utf8')).toBe(before)
  })
})
