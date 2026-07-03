import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { check } from '../check.ts'
import { start } from '../start.ts'
import { settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Point the session's gate at a shell stub so the test never runs the real check.
function startedWithCheck(command: string): string {
  const dir = makeTempRepo()
  captureIo(() => start(dir, ['Checking']))
  writeFileSync(settingsPath(dir), JSON.stringify({ check: command }))
  return dir
}

// A session with NO `check` setting: the gate is checkride (D32), pointed at a
// custom `node -e` stub so no real adapter runs (D14).
function startedWithCheckride(exitCode: number): string {
  const dir = makeTempRepo()
  captureIo(() => start(dir, ['Checking']))
  writeFileSync(settingsPath(dir), JSON.stringify({ auto: false }))
  const config = {
    checks: { stub: { command: 'node', args: ['-e', `process.exit(${exitCode})`] } },
  }
  writeFileSync(join(dir, 'checkride.config.json'), JSON.stringify(config))
  return dir
}

describe('check', () => {
  it('returns 0 and reports green when the gate passes', async () => {
    const { code, stdout } = await captureIoAsync(() => check(startedWithCheck('true')))
    expect(code).toBe(0)
    expect(stdout).toContain('check green')
  })

  it('returns the failing exit code and reports red', async () => {
    const { code, stdout } = await captureIoAsync(() => check(startedWithCheck('false')))
    expect(code).toBe(1)
    expect(stdout).toContain('check RED')
  })

  it('runs checkride when no check setting is configured and reports green', async () => {
    const { code, stdout } = await captureIoAsync(() => check(startedWithCheckride(0)))
    expect(code).toBe(0)
    expect(stdout).toContain('check green')
  })

  it('reports red with the failing slot when checkride fails', async () => {
    const { code, stdout, stderr } = await captureIoAsync(() => check(startedWithCheckride(1)))
    expect(code).toBe(1)
    expect(stdout).toContain('check RED')
    expect(stderr).toContain('failing slots')
  })

  it('reports a broken harness distinctly (exit 2)', async () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['Checking']))
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
})
