import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { wrap } from '../wrap.ts'
import { start } from '../start.ts'
import { hasSession, intentPath, sidecarDir } from '../../lib/sidecar.ts'
import { reportPath } from '../../lib/archive.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

function archiveEntries(dir: string): string[] {
  return readdirSync(join(sidecarDir(dir), 'archive'))
}

describe('wrap', () => {
  it('archives intent + build-log, clears the sidecar, and ends the session', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['Wrapping up']))
    const { code, stdout } = captureIo(() => wrap(dir))
    expect(code).toBe(0)
    expect(hasSession(dir)).toBe(false)
    expect(existsSync(intentPath(dir))).toBe(false)
    const entries = archiveEntries(dir)
    expect(entries.length).toBe(1)
    expect(existsSync(join(sidecarDir(dir), 'archive', entries[0] ?? '', 'intent.md'))).toBe(true)
    expect(stdout).toContain('archived to')
  })

  it('includes report.md in the archive when present', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['With report']))
    writeFileSync(reportPath(dir), '# Report\n')
    captureIo(() => wrap(dir))
    const entry = archiveEntries(dir)[0] ?? ''
    expect(existsSync(join(sidecarDir(dir), 'archive', entry, 'report.md'))).toBe(true)
  })

  it('refuses with no active session', () => {
    const { code, stderr } = captureIo(() => wrap(makeTempRepo()))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})
