import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
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

// The last commit's body (the marker + folded prose), read straight from git.
function commitBody(dir: string): string {
  return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%b'], { encoding: 'utf8' })
}

describe('the detail-file lifecycle — D9 (latest-detail-file)', () => {
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

  it('folds detail.md into the commit body beneath the --body lead, then truncates it', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok')
    writeSidecar(dir, 'detail.md', '## 1 the first highlight\n\nthe full story of what moved\n')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    const res = runCli(dir, ['checkpoint', '--body'], {}, 'Proportional prose.\n')
    expect(res.status).toBe(0)
    const body = commitBody(dir)
    expect(body).toContain('plumbbob step 1') // marker leads
    expect(body).toContain('Proportional prose.') // the --body lead
    expect(body).toContain('the full story of what moved') // detail folded in beneath it
    expect(body.indexOf('Proportional prose.')).toBeLessThan(body.indexOf('the full story'))
    // truncated once folded: no stale detail carries into the next step.
    expect(sidecarExists(dir, 'detail.md')).toBe(false)
  })

  it('folds detail beneath the deterministic fallback body when no --body arrives', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** it works\n   - seam: `x.txt`')
    writeSidecar(dir, 'detail.md', 'detail-only-content\n')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    expect(runCli(dir, ['checkpoint']).status).toBe(0)
    const body = commitBody(dir)
    expect(body).toContain('done when: it works') // the fallback lead
    expect(body).toContain('detail-only-content') // detail folded after it
    expect(body.indexOf('done when: it works')).toBeLessThan(body.indexOf('detail-only-content'))
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

  it('leaves detail.md alone when the tree is already clean (no commit to fold into)', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] a — **done when:** ok')
    // Commit the scaffold so the tree is genuinely clean, as the human's own
    // commit skill would have left it before recording HEAD.
    execFileSync('git', ['-C', dir, 'add', '-A'])
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'commit the plan scaffold'])
    writeSidecar(dir, 'detail.md', 'lingering detail\n')
    expect(runCli(dir, ['checkpoint']).status).toBe(0)
    // No new commit was made, so there was no body to fold into; the file is
    // left for the next step's overwrite rather than dropped without an archive.
    expect(sidecarExists(dir, 'detail.md')).toBe(true)
  })
})
