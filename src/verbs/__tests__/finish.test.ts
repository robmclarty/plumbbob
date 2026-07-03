import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { finish } from '../finish.ts'
import { start } from '../start.ts'
import { hasSession, intentPath, reportPath, sidecarDir } from '../../lib/sidecar.ts'
import { localSettingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

function subject(dir: string): string {
  return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
}

describe('finish', () => {
  it('makes the final commit, keeps the folder in place, and ends the session', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['Finishing up']))
    const { code, stdout } = captureIo(() => finish(dir))
    expect(code).toBe(0)
    expect(hasSession(dir)).toBe(false)
    // the folder IS the archive (D8) — intent.md stays, and no archive/ is created.
    expect(existsSync(intentPath(dir))).toBe(true)
    expect(existsSync(join(sidecarDir(dir), 'archive'))).toBe(false)
    expect(subject(dir)).toBe('plumbbob: finish — Finishing up')
    expect(stdout).toContain('finished')
  })

  it('drops the activeBuild cursor and leaves a clean tree', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['Cursor gone']))
    captureIo(() => finish(dir))
    const local = JSON.parse(readFileSync(localSettingsPath(dir), 'utf8'))
    expect(local.activeBuild).toBeUndefined()
    expect(execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }).trim()).toBe('')
  })

  it('appends the checkpoint SHAs to the report when one is present', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['With report']))
    writeFileSync(reportPath(dir), '# Report\n')
    captureIo(() => finish(dir))
    const report = readFileSync(reportPath(dir), 'utf8')
    expect(report).toContain('## Checkpoints')
    expect(report).toMatch(/- baseline [0-9a-f]{40}/)
  })

  it('notes a missing report but finishes anyway (D9)', () => {
    const dir = makeTempRepo()
    captureIo(() => start(dir, ['No report']))
    const { code, stderr } = captureIo(() => finish(dir))
    expect(code).toBe(0)
    expect(stderr).toContain('no report.md found')
  })

  it('refuses with no active session', () => {
    const { code, stderr } = captureIo(() => finish(makeTempRepo()))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})
