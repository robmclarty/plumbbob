import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { park } from '../park.ts'
import { start } from '../start.ts'
import { buildLogPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

async function startedSession(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Parking']))
  return dir
}

describe('park', () => {
  it('appends a raw line under the build-log Park list', async () => {
    const dir = await startedSession()
    const { code, stdout } = captureIo(() => park(dir, ['chase', 'this', 'later']))
    expect(code).toBe(0)
    expect(stdout).toContain('**Parked**: chase this later')
    expect(readFileSync(buildLogPath(dir), 'utf8')).toContain('- [ ] chase this later')
  })

  it('rejects empty text', async () => {
    const dir = await startedSession()
    const { code, stderr } = captureIo(() => park(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('needs text')
  })

  it('refuses with no active session', async () => {
    const { code, stderr } = captureIo(() => park(makeTempRepo(), ['x']))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})
