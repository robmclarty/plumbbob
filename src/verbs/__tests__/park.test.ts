import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { park } from '../park.ts'
import { start } from '../start.ts'
import { buildLogPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

function startedSession(): string {
  const dir = makeTempRepo()
  captureIo(() => start(dir, ['Parking']))
  return dir
}

describe('park', () => {
  it('appends a raw line under the build-log Park list', () => {
    const dir = startedSession()
    const { code, stdout } = captureIo(() => park(dir, ['chase', 'this', 'later']))
    expect(code).toBe(0)
    expect(stdout).toContain('parked: chase this later')
    expect(readFileSync(buildLogPath(dir), 'utf8')).toContain('- [ ] chase this later')
  })

  it('rejects empty text', () => {
    const { code, stderr } = captureIo(() => park(startedSession(), []))
    expect(code).toBe(1)
    expect(stderr).toContain('needs text')
  })

  it('refuses with no active session', () => {
    const { code, stderr } = captureIo(() => park(makeTempRepo(), ['x']))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})
