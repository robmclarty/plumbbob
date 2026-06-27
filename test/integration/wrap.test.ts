import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, runCli, sidecarExists } from '../helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function writeReport(dir: string): void {
  writeFileSync(join(dir, '.plumbbob', 'report.md'), '# Report — Wrap demo\n\n## What shipped\n\nThe thing.\n')
}
function archiveDirs(dir: string): string[] {
  return readdirSync(join(dir, '.plumbbob', 'archive'))
}

describe('plumbbob wrap (the v2 close-out, D9)', () => {
  it('refuses with no session', () => {
    expect(runCli(makeFixtureRepo(), ['wrap']).status).toBe(1)
  })

  it('archives intent + build-log + report and clears the sidecar', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Wrap demo'])
    writeReport(dir)
    expect(runCli(dir, ['wrap']).status).toBe(0)

    const archives = archiveDirs(dir)
    expect(archives).toHaveLength(1)
    const adir = join(dir, '.plumbbob', 'archive', archives[0] ?? '')
    expect(existsSync(join(adir, 'intent.md'))).toBe(true)
    expect(existsSync(join(adir, 'build-log.md'))).toBe(true)
    expect(existsSync(join(adir, 'report.md'))).toBe(true)

    // sidecar cleared; no active session
    expect(sidecarExists(dir, 'STATE')).toBe(false)
    expect(sidecarExists(dir, 'intent.md')).toBe(false)
    expect(runCli(dir, ['status']).stdout).toContain('NO ACTIVE SESSION')
  })

  it('does NOT gate on a missing report — archives intent + build-log anyway (D9)', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'No report here'])
    const res = runCli(dir, ['wrap'])
    expect(res.status).toBe(0) // the key difference from v1 finish: no gate
    const adir = join(dir, '.plumbbob', 'archive', archiveDirs(dir)[0] ?? '')
    expect(existsSync(join(adir, 'intent.md'))).toBe(true)
    expect(existsSync(join(adir, 'report.md'))).toBe(false) // none written, none archived
  })

  it('appends the checkpoint SHAs to the archived report', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Shas'])
    writeReport(dir)
    writeFileSync(join(dir, '.plumbbob', 'checkpoints'), 'baseline abc1234\nstep 1 def5678\n')
    runCli(dir, ['wrap'])
    const report = readFileSync(join(dir, '.plumbbob', 'archive', archiveDirs(dir)[0] ?? '', 'report.md'), 'utf8')
    expect(report).toContain('## Checkpoints')
    expect(report).toMatch(/- step 1 def5678/)
  })
})
