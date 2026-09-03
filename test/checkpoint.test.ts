import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, runCli, sidecarExists, writeSidecar } from './helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

// Scaffold a session pointed at a known step list with a stub-green check, the
// same shape verify.test.ts uses — D14 (throwaway-repo-tests). settings.json
// stays flat (project plane); intent rides the build folder.
function startWithSteps(dir: string, stepsBody: string, check = 'true'): void {
  runCli(dir, ['start', 'Detail test', '--slug', 'detail-test'])
  writeFileSync(join(dir, '.plumbbob', 'settings.json'), JSON.stringify({ check }))
  writeSidecar(dir, 'intent.md', `# Detail test\n\n## Steps\n\n${stepsBody}\n`)
}

// The last commit's body (the marker + the lead prose), read straight from git.
function commitBody(dir: string): string {
  return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%b'], { encoding: 'utf8' })
}

// The build-log the ledger entry lands in: the archive now, not the commit body.
function buildLog(dir: string): string {
  return readFileSync(join(dir, '.plumbbob', 'builds', 'detail-test', 'build-log.md'), 'utf8')
}

describe('the detail-file lifecycle — D81 (detail-file)', () => {
  it('git-excludes .plumbbob/detail.md so it is untracked and never rides a step commit', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok')
    writeSidecar(dir, 'detail.md', '# detail · step 1\n\nsome detail\n')
    // The file is git-excluded, so it is not a reported untracked path...
    const others = execFileSync('git', ['-C', dir, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
    expect(others).not.toContain('.plumbbob/detail.md')
    // ...and stageAll never sweeps it into the checkpoint commit as a tracked file.
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    expect(runCli(dir, ['checkpoint']).status).toBe(0)
    const tracked = execFileSync('git', ['-C', dir, 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' })
    expect(tracked).not.toContain('.plumbbob/detail.md')
  })

  it('records detail.md beneath the Log line and truncates it; the --body lead is the whole commit body', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok')
    writeSidecar(dir, 'detail.md', '## 1 the first highlight\n\nthe full story of what moved\n')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    const res = runCli(dir, ['checkpoint', '--body'], {}, 'Proportional prose.\n')
    expect(res.status).toBe(0)
    const body = commitBody(dir)
    expect(body).toContain('plumbbob step 1') // marker leads
    expect(body).toContain('Proportional prose.') // the --body lead
    expect(body).not.toContain('the full story of what moved') // the ledger is the archive, not the body
    // The record nests under the dated line, the section's handle in bold, and
    // the lead line points at it.
    expect(buildLog(dir)).toContain('step 1 checkpointed')
    expect(buildLog(dir)).toContain('  **1.** the first highlight\n\n  the full story of what moved')
    expect(res.stdout).toContain('details: `.plumbbob/builds/detail-test/build-log.md:')
    // truncated once recorded: no stale detail carries into the next step.
    expect(sidecarExists(dir, 'detail.md')).toBe(false)
  })

  it('records an off-wire detail file verbatim, so nothing the model wrote is lost with it', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** it works\n   - seam: `x.txt`')
    writeSidecar(dir, 'detail.md', 'detail-only-content\n')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    expect(runCli(dir, ['checkpoint']).status).toBe(0)
    const body = commitBody(dir)
    expect(body).toContain('done when: it works') // the fallback lead still leads the body
    expect(body).not.toContain('detail-only-content')
    expect(buildLog(dir)).toContain('\n\n  detail-only-content')
    expect(sidecarExists(dir, 'detail.md')).toBe(false)
  })

  it('checkpoints normally when no detail file is present', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    expect(runCli(dir, ['checkpoint']).status).toBe(0)
    expect(commitBody(dir)).toContain('plumbbob step 1')
    expect(sidecarExists(dir, 'detail.md')).toBe(false)
  })

  it('folds nothing from a blank detail file, keeping just the lead body', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok')
    writeSidecar(dir, 'detail.md', '   \n')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    const res = runCli(dir, ['checkpoint', '--body'], {}, 'Just the lead.\n')
    expect(res.status).toBe(0)
    expect(commitBody(dir).trimEnd().endsWith('Just the lead.')).toBe(true)
  })

  it('records and clears detail.md even when the tree is already clean: the ledger, not the commit, is the archive', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] a — **done when:** ok')
    // Commit the scaffold so the tree is genuinely clean, as the human's own
    // commit skill would have left it before recording HEAD.
    execFileSync('git', ['-C', dir, 'add', '-A'])
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'commit the plan scaffold'])
    writeSidecar(dir, 'detail.md', 'lingering detail\n')
    expect(runCli(dir, ['checkpoint']).status).toBe(0)
    // No new commit was made, and none was needed: the step landed, its record
    // went to the Log, and the file is spent.
    expect(buildLog(dir)).toContain('\n\n  lingering detail')
    expect(sidecarExists(dir, 'detail.md')).toBe(false)
  })
})
