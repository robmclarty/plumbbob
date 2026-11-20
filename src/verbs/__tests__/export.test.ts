import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { exportPlan } from '../export.ts'
import { start } from '../start.ts'
import { contractPaths } from '../../lib/contract.ts'
import { grainFindings, resolveGrain } from '../../lib/grain.ts'
import { settingsPath } from '../../lib/settings.ts'
import { activeBuild, buildDir, intentPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

const INTENT = `# Export test

## Decisions

- **D1 (one)**: a decision

## Steps

1. [x] First, **done when:** a works.
   - seam: \`src/a.ts\`
2. [ ] Second
   - seam: \`src/b.ts\`
   - proof: \`pnpm vitest run b\` passes
   - effort: high

## Build ranges

1. \`/plumbbob:build 1-2\`, **stop:** review
`

async function started(intent = INTENT): Promise<{ readonly dir: string; readonly slug: string }> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Export test']))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(intentPath(dir), intent)
  return { dir, slug: activeBuild(dir) ?? '' }
}

describe('export', () => {
  it("writes the active build's plan.json beside intent.md and names it", async () => {
    const { dir, slug } = await started()
    const r = captureIo(() => exportPlan(dir, []))
    expect(r.code).toBe(0)
    expect(r.stdout).toBe(`**Exported**: .plumbbob/builds/${slug}/plan.json (2 steps, runciter.plan/2)\n`)

    const text = readFileSync(join(buildDir(dir, slug), 'plan.json'), 'utf8')
    const plan = JSON.parse(text)
    expect(plan.build).toEqual({ id: slug, title: 'Export test' })
    expect(plan.source).toEqual({
      path: `.plumbbob/builds/${slug}/intent.md`,
      sha256: createHash('sha256').update(readFileSync(intentPath(dir))).digest('hex'),
    })
    expect(plan.steps.map((s: { id: string; depends_on: string[]; stop: string; effort: string | null }) => [s.id, s.depends_on, s.stop, s.effort])).toEqual([
      ['step-1', [], 'none', null],
      ['step-2', ['step-1'], 'planned', 'high'],
    ])
    expect(text.endsWith('\n')).toBe(true)
  })

  it('exports a build named by its folder', async () => {
    const { dir, slug } = await started()
    const r = captureIo(() => exportPlan(dir, [slug]))
    expect(r.code).toBe(0)
    expect(existsSync(join(buildDir(dir, slug), 'plan.json'))).toBe(true)
  })

  it('writes the same bytes twice', async () => {
    const { dir, slug } = await started()
    captureIo(() => exportPlan(dir, []))
    const first = readFileSync(join(buildDir(dir, slug), 'plan.json'), 'utf8')
    captureIo(() => exportPlan(dir, []))
    expect(readFileSync(join(buildDir(dir, slug), 'plan.json'), 'utf8')).toBe(first)
  })

  it('writes nothing and exits 1 on a failing check, naming each finding and the tally', async () => {
    const bad = INTENT.replace('   - effort: high', '   - effort: high\n   - after: 9').replace('`src/b.ts`', '`lib/new/b.ts`')
    const { dir, slug } = await started(bad)
    const r = captureIo(() => exportPlan(dir, []))
    expect(r.code).toBe(1)
    expect(r.stderr).toBe(
      [
        "plumbbob: step 2's `after:` names step 9, which the plan lacks.",
        "plumbbob: step 2's seam path `lib/new/b.ts` does not exist, nor does its folder `lib/new/`, and no part of keyframes.md's Map holds it.",
        'plumbbob: export refused, 2 findings; plan.json not written.',
        '',
      ].join('\n'),
    )
    expect(existsSync(join(buildDir(dir, slug), 'plan.json'))).toBe(false)
  })

  it('writes nothing on a line that will not read', async () => {
    const { dir, slug } = await started(INTENT.replace('effort: high', 'effort: hard'))
    const r = captureIo(() => exportPlan(dir, []))
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('export refused, 1 finding; plan.json not written.')
    expect(existsSync(join(buildDir(dir, slug), 'plan.json'))).toBe(false)
  })

  it('refuses a build folder the repo lacks, or a slug that is not a folder name', async () => {
    const { dir } = await started()
    expect(captureIo(() => exportPlan(dir, ['2026-01-01-nope'])).stderr).toContain('no build named "2026-01-01-nope"')
    expect(captureIo(() => exportPlan(dir, ['../..'])).code).toBe(1)
  })

  it('refuses with no build to name', () => {
    const r = captureIo(() => exportPlan(makeTempRepo(), []))
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('no build to export')
  })

  it('exports a step cut against the grain all the same, under fine and under coarse, since neither finding is a plan check — D165 (grain)', async () => {
    // Step 2 names 4 paths, one over what fine takes, and is proved in words, which coarse names.
    const against = INTENT.replace('`src/b.ts`', '`src/b.ts`, `src/c.ts`, `src/d.ts`, `src/e.ts`').replace('`pnpm vitest run b` passes', 'b works')
    const { dir, slug } = await started(against)
    const planPath = join(buildDir(dir, slug), 'plan.json')
    expect(captureIo(() => exportPlan(dir, [])).code).toBe(0)
    const ungrained = readFileSync(planPath, 'utf8')
    for (const [grain, kind] of [
      ['fine', 'seam-breadth'],
      ['coarse', 'proof-in-words'],
    ]) {
      writeFileSync(settingsPath(dir), JSON.stringify({ grain }))
      // The plan card would name step 2 under this grain.
      expect(grainFindings(readFileSync(intentPath(dir), 'utf8'), resolveGrain(dir)).map((f) => [f.step, f.kind])).toEqual([[2, kind]])
      rmSync(planPath)
      const r = captureIo(() => exportPlan(dir, []))
      expect(r.code).toBe(0)
      expect(r.stderr).toBe('')
      expect(readFileSync(planPath, 'utf8')).toBe(ungrained)
    }
  })

  it('exports contract_paths as [] whatever contractPaths lists — D164 (contract-paths)', async () => {
    const { dir, slug } = await started()
    writeFileSync(settingsPath(dir), JSON.stringify({ contractPaths: ['src/', 'schemas/api.json'] }))
    expect(contractPaths(dir)).toEqual(['src/', 'schemas/api.json'])
    expect(captureIo(() => exportPlan(dir, [])).code).toBe(0)
    expect(JSON.parse(readFileSync(join(buildDir(dir, slug), 'plan.json'), 'utf8')).contract_paths).toEqual([])
  })
})
