import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { finish } from '../finish.ts'
import { transition } from '../../lib/notice.ts'
import { start } from '../start.ts'
import { bumpStepStat, checkpointsPath, grantPath, hasSession, intentPath, reportPath, sidecarDir, stampStepStat, tickPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'
import { cleanupFixtures, makeFixtureRepo, runCli } from '../../../test/helpers/fixture-repo.ts'
import { runCliWithSocketStdin } from '../../../test/helpers/socket-stdin.ts'

afterAll(cleanupTempRepos)
afterAll(cleanupFixtures)

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
    // the tracked build folder itself is the archive: intent.md stays, and no archive/ is created.
    expect(existsSync(intentPath(dir))).toBe(true)
    expect(existsSync(join(sidecarDir(dir), 'archive'))).toBe(false)
    expect(subject(dir)).toBe('chore(finishing-up): finish') // Conventional Commits subject; the `plumbbob finish` marker rides in the body
    const body = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%b'], { encoding: 'utf8' })
    expect(body).toContain('plumbbob finish')
    // Short SHA (exactly 9 hex) and the archive pointer, then the forward pointer
    // finish prints itself: the line states its fact and the pointer states the move.
    const sha = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().slice(0, 9)
    const line = transition({
      label: 'Session',
      fact: 'finished',
      detail: [sha, '.plumbbob/builds/finishing-up/ rides your branch into the PR'],
    })
    expect(stdout).toBe(`${line}\n**Next Up**: Nothing planned - /plumbbob:plan\n\n`)
  })

  it('clears the cursor by removing STATE and leaves a clean tree', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Cursor gone']))
    captureIo(() => finish(dir))
    // Cursor and session share the STATE file, so one delete both closes the session
    // and clears the cursor: there is no separate settings.local.json write to undo.
    expect(hasSession(dir)).toBe(false)
    expect(existsSync(join(sidecarDir(dir), 'STATE'))).toBe(false)
    expect(execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }).trim()).toBe('')
  })

  it('clears the one-turn GRANT and the entry TICK with the session — D64 (approval-latch), D65 (human-typed-grants)', async () => {
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

  it('notes a missing report but finishes anyway — D9 (finish-no-gate)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['No report']))
    const { code, stderr } = captureIo(() => finish(dir))
    expect(code).toBe(0)
    expect(stderr).toContain('no report.md found')
  })

  it('points past the finished session itself — D32 (handoff-owns-every-pointer)', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Nothing after this']))
    const { code, stdout } = captureIo(() => finish(dir))
    expect(code).toBe(0)
    // The one ending handoff cannot render: finish has just deleted the session
    // it would read, so the pointer is printed here, last, and blank-line separated.
    expect(stdout.endsWith('\n\n**Next Up**: Nothing planned - /plumbbob:plan\n\n')).toBe(true)
  })

  it('refuses with no active session', async () => {
    const { code, stderr } = captureIo(() => finish(makeTempRepo()))
    expect(code).toBe(1)
    expect(stderr).toContain('no active session')
  })

  it('--body on an interactive TTY finishes subject-only instead of blocking', async () => {
    const dir = makeTempRepo()
    await captureIoAsync(() => start(dir, ['Tty body', '--slug', 'tty-body']))
    const stdin = process.stdin as unknown as { isTTY?: boolean }
    const hadTty = stdin.isTTY
    stdin.isTTY = true // a terminal never sends EOF: the read must be skipped, not hung
    try {
      const { code } = captureIo(() => finish(dir, ['--body']))
      expect(code).toBe(0)
    } finally {
      stdin.isTTY = hadTty
    }
    const body = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%b'], { encoding: 'utf8' })
    expect(body).toContain('plumbbob finish') // the marker still lands; no extra body, no hang
  })
})

// Twin of checkpoint.test.ts's socket-stdin suite: `finish --body` reads fd 0
// through the same commitbody.ts guard, so it must refuse rather than block
// on the same fd-0 shape an agent harness hands it.
describe('finish (subprocess) — --body on a socket stdin', () => {
  it('refuses before any write — no duplicated report sections on retry', async () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Socket body', '--slug', 'socket-body'])

    const { status, stderr } = await runCliWithSocketStdin(dir, ['finish', '--body'])

    expect(status).toBe(1)
    expect(stderr).toContain('--body refuses')
    expect(stderr).toContain("<<'BODY'")
    // The session never closed: STATE (the session sentinel finish clears last) is still there.
    expect(existsSync(join(sidecarDir(dir), 'STATE'))).toBe(true)
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
    // spaced pipes on the delimiter row too, so the table lints clean (MD060)
    expect(report).toContain('| ---- | ---------- | -------------- | ------- | ---------- |')
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
