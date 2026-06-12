import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, makeNonGitDir, readSidecar, runCli, sidecarExists } from './helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function headSha(dir: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

describe('plumbline start', () => {
  it('scaffolds .plumbline/ at the git root: DESIGN, baseline, config, stamped templates', () => {
    const dir = makeFixtureRepo({ withCheckScript: true })
    const result = runCli(dir, ['start', 'My change'])

    expect(result.status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('DESIGN')
    expect(readSidecar(dir, 'checkpoints').split('\n')[0]).toBe(`baseline ${headSha(dir)}`)
    expect(readSidecar(dir, 'config')).toContain('check=pnpm run check')

    const intent = readSidecar(dir, 'intent.md')
    expect(intent).toContain('# My change')
    expect(intent).not.toContain('{{TITLE}}')
    expect(readSidecar(dir, 'build-log.md')).toContain('Build log — My change')
  })

  it('excludes the sidecar from git (D17) so it never reads as dirty', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Excluded'])

    const exclude = readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8')
    expect(exclude.split('\n')).toContain('.plumbline/')

    const porcelain = execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' })
    expect(porcelain).not.toContain('.plumbline')
  })

  it('refuses on a dirty tree, but --allow-dirty records HEAD with a warning', () => {
    const dir = makeFixtureRepo({ dirty: true })

    const refused = runCli(dir, ['start', 'Nope'])
    expect(refused.status).toBe(1)
    expect(refused.stderr).toContain('dirty')
    expect(sidecarExists(dir, 'STATE')).toBe(false)

    const allowed = runCli(dir, ['start', '--allow-dirty', 'Yes'])
    expect(allowed.status).toBe(0)
    expect(allowed.stderr).toContain('--allow-dirty')
    expect(readSidecar(dir, 'STATE').trim()).toBe('DESIGN')
  })

  it('refuses when a session is already active', () => {
    const dir = makeFixtureRepo()
    expect(runCli(dir, ['start', 'First']).status).toBe(0)

    const again = runCli(dir, ['start', 'Second'])
    expect(again.status).toBe(1)
    expect(again.stderr).toContain('already active')
  })

  it('refuses outside a git repository', () => {
    const dir = makeNonGitDir()
    const result = runCli(dir, ['start', 'Orphan'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not a git repository')
  })

  it('refuses without a title', () => {
    const dir = makeFixtureRepo()
    const result = runCli(dir, ['start'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('title')
  })

  it('warns when the repo has no check script but still records the config line (D24)', () => {
    const dir = makeFixtureRepo() // no package.json
    const result = runCli(dir, ['start', 'No check'])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('check')
    expect(readSidecar(dir, 'config')).toContain('check=pnpm run check')
  })

  it('re-scaffolds after finish without touching the archive', () => {
    const dir = makeFixtureRepo()
    expect(runCli(dir, ['start', 'Round one']).status).toBe(0)

    // Simulate a finish: an archive exists; the active control files are cleared.
    const archived = join(dir, '.plumbline', 'archive', '2026-01-01-round-one')
    mkdirSync(archived, { recursive: true })
    writeFileSync(join(archived, 'report.md'), 'preserved\n')
    rmSync(join(dir, '.plumbline', 'STATE'))
    rmSync(join(dir, '.plumbline', 'intent.md'))
    rmSync(join(dir, '.plumbline', 'build-log.md'))

    const second = runCli(dir, ['start', 'Round two'])
    expect(second.status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('DESIGN')
    expect(readSidecar(dir, 'intent.md')).toContain('# Round two')
    expect(existsSync(join(archived, 'report.md'))).toBe(true)
    expect(readFileSync(join(archived, 'report.md'), 'utf8')).toBe('preserved\n')
  })
})
