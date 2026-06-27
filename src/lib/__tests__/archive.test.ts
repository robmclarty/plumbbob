import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { archiveSession, reportPath } from '../archive.ts'
import { buildLogPath, intentPath, sidecarDir } from '../sidecar.ts'
import { cleanupTempRepos, makeTempDir } from '../../../test/helpers/temp-repo.ts'

afterAll(cleanupTempRepos)

// An active session always has intent.md + build-log.md in the sidecar.
function seedSession(root: string, title: string): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(intentPath(root), `# ${title}\n\nbody\n`)
  writeFileSync(buildLogPath(root), 'log\n')
}

describe('reportPath', () => {
  it('sits beside intent.md in the sidecar', () => {
    const dir = makeTempDir()
    expect(reportPath(dir)).toBe(join(sidecarDir(dir), 'report.md'))
  })
})

describe('archiveSession', () => {
  it('copies intent + build-log into archive/<date>-<slug>/', () => {
    const dir = makeTempDir()
    seedSession(dir, 'My Feature!')
    const out = archiveSession(dir)
    expect(existsSync(join(out, 'intent.md'))).toBe(true)
    expect(existsSync(join(out, 'build-log.md'))).toBe(true)
    expect(existsSync(join(out, 'report.md'))).toBe(false)
    expect(basename(out)).toMatch(/^\d{4}-\d{2}-\d{2}-my-feature$/)
  })

  it('includes report.md when present', () => {
    const dir = makeTempDir()
    seedSession(dir, 'With Report')
    writeFileSync(reportPath(dir), 'report\n')
    const out = archiveSession(dir)
    expect(existsSync(join(out, 'report.md'))).toBe(true)
  })

  it('disambiguates a same-day, same-title session instead of overwriting', () => {
    const dir = makeTempDir()
    seedSession(dir, 'Dup')
    const first = archiveSession(dir)
    const second = archiveSession(dir)
    expect(second).not.toBe(first)
    expect(basename(second)).toMatch(/-2$/)
    expect(existsSync(first)).toBe(true)
  })

  it('falls back to the "session" slug when intent has no title', () => {
    const dir = makeTempDir()
    mkdirSync(sidecarDir(dir), { recursive: true })
    writeFileSync(intentPath(dir), 'no heading here\n')
    writeFileSync(buildLogPath(dir), 'log\n')
    const out = archiveSession(dir)
    expect(basename(out)).toMatch(/-session$/)
  })
})
