import { writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { check } from '../check.ts'
import { start } from '../start.ts'
import { settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Point the session's gate at a shell stub so the test never runs the real check.
function startedWithCheck(command: string): string {
  const dir = makeTempRepo()
  captureIo(() => start(dir, ['Checking']))
  writeFileSync(settingsPath(dir), JSON.stringify({ check: command }))
  return dir
}

describe('check', () => {
  it('returns 0 and reports green when the gate passes', () => {
    const { code, stdout } = captureIo(() => check(startedWithCheck('true')))
    expect(code).toBe(0)
    expect(stdout).toContain('check green')
  })

  it('returns the failing exit code and reports red', () => {
    const { code, stdout } = captureIo(() => check(startedWithCheck('false')))
    expect(code).toBe(1)
    expect(stdout).toContain('check RED')
  })

  it('refuses with no active session', () => {
    const { code, stderr } = captureIo(() => check(makeTempRepo()))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})
