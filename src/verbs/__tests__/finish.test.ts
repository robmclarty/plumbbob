import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { finish } from '../finish.ts'
import { start } from '../start.ts'
import { bumpStepStat, checkpointsPath, grantPath, hasSession, intentPath, reportPath, sidecarDir, stampStepStat, tickPath } from '../../lib/sidecar.ts'
import { localSettingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

function subject(dir: string): string {
  return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
}

describe('finish', () => {
  it('makes the final commit, keeps the folder in place, and ends the session', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Finishing up', '--slug', 'finishing-up']))
    const { code, stdout } = captureIo(() => finish(dir))
    expect(code).toBe(0)
    expect(hasSession(dir)).toBe(false)
    // the folder IS the archive (D8) — intent.md stays, and no archive/ is created.
    expect(existsSync(intentPath(dir))).toBe(true)
    expect(existsSync(join(sidecarDir(dir), 'archive'))).toBe(false)
    expect(subject(dir)).toBe('plumbbob: finish — Finishing up')
    // Short SHA (exactly 9 hex), the archive pointer, and the next-goal nudge.
    expect(stdout).toMatch(/finished — [0-9a-f]{9}\. \.plumbbob\/builds\/finishing-up\/ rides your branch/)
    expect(stdout).toContain('pb-plan')
  })

  it('drops the activeBuild cursor and leaves a clean tree', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Cursor gone']))
    captureIo(() => finish(dir))
    const local = JSON.parse(readFileSync(localSettingsPath(dir), 'utf8'))
    expect(local.activeBuild).toBeUndefined()
    expect(execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }).trim()).toBe('')
  })

  it('clears the one-turn GRANT and the entry TICK with the session (D64/D65)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Latch state gone', '--slug', 'latch-state-gone']))
    // The session's last tick minted a grant and a build stamped its entry; neither
    // may survive into the next session.
    writeFileSync(grantPath(dir), 'auto\n')
    writeFileSync(tickPath(dir, 'latch-state-gone'), '4\n')
    captureIo(() => finish(dir))
    expect(existsSync(grantPath(dir))).toBe(false)
    expect(existsSync(tickPath(dir, 'latch-state-gone'))).toBe(false)
  })

  it('appends the checkpoint SHAs to the report when one is present', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['With report']))
    writeFileSync(reportPath(dir), '# Report\n')
    captureIo(() => finish(dir))
    const report = readFileSync(reportPath(dir), 'utf8')
    // The exact section shape: blank line, heading, blank line, bullets.
    expect(report).toContain('\n## Checkpoints\n\n- baseline')
    expect(report).toMatch(/- baseline [0-9a-f]{40}/)
  })

  it('writes an empty Checkpoints section when the checkpoints file is unreadable', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['No checkpoints']))
    writeFileSync(reportPath(dir), '# Report\n')
    rmSync(checkpointsPath(dir), { force: true })
    captureIo(() => finish(dir))
    const report = readFileSync(reportPath(dir), 'utf8')
    expect(report).toContain('## Checkpoints')
    expect(report).not.toMatch(/^- /m) // best-effort: no bullets, no crash, no junk
  })

  it('notes a missing report but finishes anyway (D9)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['No report']))
    const { code, stderr } = captureIo(() => finish(dir))
    expect(code).toBe(0)
    expect(stderr).toContain('no report.md found')
  })

  it('refuses with no active session', async () => {
    const { code, stderr } = captureIo(() => finish(makeTempRepo()))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })
})

describe('finish — the Stats roll-up (research/07 2b)', () => {
  it('appends a per-step table with totals when stats accrued', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['With stats', '--slug', 'with-stats']))
    writeFileSync(reportPath(dir), '# Report\n')
    stampStepStat(dir, 'with-stats', 1, 'startedAt', '2026-07-11T10:00:00Z')
    stampStepStat(dir, 'with-stats', 1, 'landedAt', '2026-07-11T10:34:00Z')
    bumpStepStat(dir, 'with-stats', 1, 'redChecks')
    bumpStepStat(dir, 'with-stats', 1, 'redChecks')
    bumpStepStat(dir, 'with-stats', 2, 'reverts')
    captureIo(() => finish(dir))
    const report = readFileSync(reportPath(dir), 'utf8')
    expect(report).toContain('## Stats')
    expect(report).toContain('| step | red checks | drift warnings | reverts | wall-clock |')
    expect(report).toContain('| 1 | 2 | 0 | 0 | 34m |')
    expect(report).toContain('| 2 | 0 | 0 | 1 | — |') // hand-built step: no stamps, no wall
    expect(report).toContain('| **total** | 2 | 0 | 1 | 34m |')
  })

  it('appends no Stats section when nothing accrued (old builds)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['No stats']))
    writeFileSync(reportPath(dir), '# Report\n')
    captureIo(() => finish(dir))
    expect(readFileSync(reportPath(dir), 'utf8')).not.toContain('## Stats')
  })
})
