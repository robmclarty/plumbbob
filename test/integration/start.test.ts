import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, makeNonGitDir, phase, readSidecar, runCli, sidecarExists } from '../helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function headSha(dir: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

// True when `rel` is git-ignored in `dir` (check-ignore exits 0 if ignored).
function isIgnored(dir: string, rel: string): boolean {
  try {
    execFileSync('git', ['-C', dir, 'check-ignore', '-q', rel])
    return true
  } catch {
    return false
  }
}

function commitAll(dir: string, message: string): void {
  execFileSync('git', ['-C', dir, 'add', '-A'])
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', message])
}

describe('plumbbob start', () => {
  it('scaffolds a tracked builds/<slug>/ folder at the git root: DESIGN, baseline, settings, stamped templates', () => {
    const dir = makeFixtureRepo({ withCheckScript: true })
    const result = runCli(dir, ['start', 'My change'])

    expect(result.status).toBe(0)
    expect(phase(dir)).toBe('DESIGN')
    expect(existsSync(join(dir, '.plumbbob', 'builds', 'my-change', 'intent.md'))).toBe(true)
    expect(readSidecar(dir, 'checkpoints').split('\n')[0]).toBe(`baseline ${headSha(dir)}`)
    expect(JSON.parse(readSidecar(dir, 'settings.json'))).toEqual({ check: 'pnpm run check', auto: false })

    const intent = readSidecar(dir, 'intent.md')
    expect(intent).toContain('# My change')
    expect(intent).not.toContain('{{TITLE}}')
    expect(readSidecar(dir, 'build-log.md')).toContain('Build log — My change')
  })

  it('narrows the git exclude to the control plane, leaving the artifact plane tracked (D2/D18)', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Excluded'])

    const exclude = readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8').split('\n')
    expect(exclude).toContain('.plumbbob/settings.local.json')
    expect(exclude).toContain('.plumbbob/builds/*/SEAM')
    expect(exclude).not.toContain('.plumbbob/') // the whole-directory exclude is gone

    // The per-worktree control files are git-ignored; the tracked artifact plane
    // is not — it rides the branch into the PR (D2), showing as ordinary
    // uncommitted work until the plan/step commits land it (D18's dirty window).
    expect(isIgnored(dir, '.plumbbob/settings.local.json')).toBe(true)
    expect(isIgnored(dir, '.plumbbob/STATE')).toBe(true)
    expect(isIgnored(dir, '.plumbbob/builds/excluded/SEAM')).toBe(true)
    expect(isIgnored(dir, '.plumbbob/builds/excluded/intent.md')).toBe(false)
    expect(isIgnored(dir, '.plumbbob/settings.json')).toBe(false)
  })

  it('runs inside a linked worktree: writes the exclude to the common gitdir (D1)', () => {
    const main = makeFixtureRepo()
    const wt = join(main, 'wt')
    execFileSync('git', ['-C', main, 'worktree', 'add', '-q', wt, '-b', 'wt-branch'])

    const result = runCli(wt, ['start', 'Worktree change'])
    expect(result.status).toBe(0)
    expect(sidecarExists(wt, 'STATE')).toBe(true)

    // The exclude line lands in the common gitdir's info/exclude — the file git
    // reads — not the per-worktree gitdir, whose absent info/ was the crash.
    const commonExclude = readFileSync(join(main, '.git', 'info', 'exclude'), 'utf8').split('\n')
    expect(commonExclude).toContain('.plumbbob/settings.local.json')

    // The control files stay ignored from inside the worktree, proving the
    // common-dir exclude took effect there.
    expect(isIgnored(wt, '.plumbbob/settings.local.json')).toBe(true)
    expect(isIgnored(wt, '.plumbbob/STATE')).toBe(true)
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
    expect(phase(dir)).toBe('DESIGN')
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

  it('warns when the repo has no check script but still records the check setting (D24)', () => {
    const dir = makeFixtureRepo() // no package.json
    const result = runCli(dir, ['start', 'No check'])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('check')
    expect(JSON.parse(readSidecar(dir, 'settings.json')).check).toBe('pnpm run check')
  })

  it('re-scaffolds a new build after finish without touching the archive', () => {
    const dir = makeFixtureRepo()
    expect(runCli(dir, ['start', 'Round one']).status).toBe(0)

    // Simulate a finish: the plan scaffold + a prior archive are committed (as the
    // plan-approval commit would leave them, clearing D18's dirty window), then
    // the session sentinel is cleared.
    const archived = join(dir, '.plumbbob', 'archive', '2026-01-01-round-one')
    mkdirSync(archived, { recursive: true })
    writeFileSync(join(archived, 'report.md'), 'preserved\n')
    commitAll(dir, 'commit round one scaffold + archive')
    rmSync(join(dir, '.plumbbob', 'STATE')) // ignored control file; removal leaves a clean tree

    const second = runCli(dir, ['start', 'Round two'])
    expect(second.status).toBe(0)
    expect(phase(dir)).toBe('DESIGN')
    // The cursor now points at round-two's folder; round-one's is left intact.
    expect(readSidecar(dir, 'intent.md')).toContain('# Round two')
    expect(existsSync(join(dir, '.plumbbob', 'builds', 'round-one', 'intent.md'))).toBe(true)
    expect(readFileSync(join(archived, 'report.md'), 'utf8')).toBe('preserved\n')
  })
})
