import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from '../build.ts'
import { checkpoint } from '../checkpoint.ts'
import { exportPlan } from '../export.ts'
import { handoff } from '../handoff.ts'
import { start } from '../start.ts'
import { status } from '../status.ts'
import { activeBuild, buildDir, checkpointsPath, intentPath } from '../../lib/sidecar.ts'
import { settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

/** A one-step plan whose step carries the like lines given, beside its seam. */
function planWith(...like: string[]): string {
  return ['# Like test', '', '## Steps', '', '1. [ ] First', '   - seam: `src/a.ts`', ...like, '   - proof: `true` passes', '', '## Build ranges', '', '1. `/plumbbob:build 1`, **stop:** review', ''].join('\n')
}

// Every way a like line can be wrong at once: a path that does not exist, a
// glob, an absolute path, a dot segment, an empty line, a line with no
// backticks, and the line doubled.
const BAD = ['   - like: `src/nowhere.ts`, `src/*.ts`, `/etc/passwd`, `../up.ts`, `~/.ssh/id_rsa`, `C:/Windows/x`', '   - like:', '   - like: src/unquoted.ts', '   - like: `src/nowhere.ts`']

async function started(intent: string): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Like test', '--slug', 'like-test']))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(intentPath(dir), intent)
  writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
  return dir
}

describe('a like line is advice', () => {
  it('refuses no export, build or checkpoint, however it is written', async () => {
    const dir = await started(planWith(...BAD))

    const exported = captureIo(() => exportPlan(dir, []))
    expect(exported.code).toBe(0)
    const plan = JSON.parse(readFileSync(join(buildDir(dir, activeBuild(dir) ?? ''), 'plan.json'), 'utf8'))
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].like).toEqual(['src/nowhere.ts']) // only the paths that read, and the missing file is no finding

    const entered = captureIo(() => build(dir, ['1']))
    expect(entered.code).toBe(0)
    expect(entered.stderr).toBe('')

    writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1\n')
    const landed = await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(landed.code).toBe(0)
    expect(readFileSync(checkpointsPath(dir), 'utf8')).toMatch(/step 1 [0-9a-f]{40}/)
    expect(readFileSync(intentPath(dir), 'utf8')).toContain('1. [x] First')
  })

  it('shows on the dashboard as a row under the seam, only the paths that read', async () => {
    const dir = await started(planWith(...BAD))
    const bad = captureIo(() => status(dir, []))
    expect(bad.code).toBe(0)
    expect(bad.stdout).toContain('        seam: src/a.ts\n        like: src/nowhere.ts\n')

    writeFileSync(intentPath(dir), planWith())
    expect(captureIo(() => status(dir, [])).stdout).not.toContain('like:')
  })

  it('draws a line on the plan card for a path that does not exist, and none for one that does', async () => {
    const dir = await started(planWith('   - like: `src/throtle.ts`, `src/gone.ts`, `src/limiter.ts`'))
    writeFileSync(join(dir, 'src', 'throttle.ts'), 'export const wait = 5\n')
    writeFileSync(join(dir, 'src', 'limiter.ts'), 'export const cap = 5\n')
    const { code, stdout } = captureIo(() => handoff(dir, ['--plan']))
    const where = relative(dir, intentPath(dir))
    expect(code).toBe(0)
    expect(stdout).toContain(
      [
        '**Seams**: 2 to look at',
        '',
        `- [Step 1](${where}#L5) likes \`src/throtle.ts\`, which does not exist; \`src/throttle.ts\` does.`,
        `- [Step 1](${where}#L5) likes \`src/gone.ts\`, which does not exist.`,
        '',
        '**Your Call**:',
      ].join('\n'),
    )
  })
})
