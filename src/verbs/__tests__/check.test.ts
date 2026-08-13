import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { check } from '../check.ts'
import { start } from '../start.ts'
import { settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Point the session's gate at a shell stub so the test never runs the real check.
async function startedWithCheck(command: string): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Checking']))
  writeFileSync(settingsPath(dir), JSON.stringify({ check: command }))
  return dir
}

// A session with NO `check` setting: the gate is checkride (absence of the
// setting means checkride runs), pointed at a custom `node -e` stub so no real
// adapter runs inside the test.
async function startedWithCheckride(exitCode: number): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Checking']))
  writeFileSync(settingsPath(dir), JSON.stringify({ auto: false }))
  const config = {
    checks: { stub: { command: 'node', args: ['-e', `process.exit(${exitCode})`] } },
  }
  writeFileSync(join(dir, 'checkride.config.json'), JSON.stringify(config))
  return dir
}

describe('check', () => {
  it('returns 0 and reports green when the gate passes', async () => {
    const dir = await startedWithCheck('true')
    const { code, stdout } = await captureIoAsync(() => check(dir))
    expect(code).toBe(0)
    expect(stdout).toContain('check green')
  })

  it('returns the failing exit code and reports red', async () => {
    const dir = await startedWithCheck('false')
    const { code, stdout } = await captureIoAsync(() => check(dir))
    expect(code).toBe(1)
    expect(stdout).toContain('check RED')
  })

  it('runs checkride when no check setting is configured and reports green', async () => {
    const dir = await startedWithCheckride(0)
    const { code, stdout } = await captureIoAsync(() => check(dir))
    expect(code).toBe(0)
    expect(stdout).toContain('check green')
  })

  it('reports red with the failing slot when checkride fails', async () => {
    const dir = await startedWithCheckride(1)
    const { code, stdout, stderr } = await captureIoAsync(() => check(dir))
    expect(code).toBe(1)
    expect(stdout).toContain('check RED')
    expect(stderr).toContain('failing slots')
  })

  it('reports a broken harness distinctly (exit 2)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Checking']))
    writeFileSync(settingsPath(dir), JSON.stringify({ auto: false }))
    writeFileSync(join(dir, 'checkride.config.json'), '{not json')
    const { code, stdout } = await captureIoAsync(() => check(dir))
    expect(code).toBe(2)
    expect(stdout).toContain('check ERROR')
  })

  it('refuses with no active session', async () => {
    const { code, stderr } = await captureIoAsync(() => check(makeTempRepo()))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })

  // The narrowing flags map onto checkride's RunFlags end-to-end: a red
  // custom check disappears from the run under `--only <the green one>`.
  it('narrows the checkride run with --only', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Checking']))
    writeFileSync(settingsPath(dir), JSON.stringify({ auto: false }))
    const config = {
      checks: {
        good: { command: 'node', args: ['-e', 'process.exit(0)'] },
        bad: { command: 'node', args: ['-e', 'process.exit(1)'] },
      },
    }
    writeFileSync(join(dir, 'checkride.config.json'), JSON.stringify(config))
    expect((await captureIoAsync(() => check(dir))).code).toBe(1) // full run is red
    const { code, stdout } = await captureIoAsync(() => check(dir, ['--only', 'good']))
    expect(code).toBe(0)
    expect(stdout).toContain('check green')
  })

  // checkride 0.9.3 made an empty slot selection a usage error: `runChecks({only:
  // []})` throws rather than filtering every check out and exiting 0. A value that
  // trims to nothing must therefore never reach it as a list: parseFlags drops the
  // flag entirely, so the run stays full-fat and reports the code, not the harness.
  it.each([',', ' ', ''])('drops an empty --only %j rather than selecting nothing', async (value) => {
    const dir = await startedWithCheckride(1)
    const { code, stdout } = await captureIoAsync(() => check(dir, ['--only', value]))
    expect(code).toBe(1) // the full run's red (not 2, which is what the throw would render)
    expect(stdout).toContain('check RED')
    expect(stdout).not.toContain('check ERROR')
  })

  it('warns and ignores narrowing flags on the spawn-override path', async () => {
    const dir = await startedWithCheck('true')
    const { code, stderr } = await captureIoAsync(() => check(dir, ['--bail', '--only', 'types']))
    expect(code).toBe(0)
    expect(stderr).toContain('ignored for the configured command')
  })
})
