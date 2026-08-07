import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  cleanupFixtures,
  makeFixtureRepo,
  phase,
  readSidecar,
  runCli,
  sidecarExists,
  writeSidecar,
} from '../helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

// Scaffold a session, then overwrite settings (stub check) and intent so the
// verbs run against a known step list and a controllable green/red gate —
// D14 (throwaway-repo-tests).
// settings.json stays flat (project plane); intent/STEP ride the build folder.
function startWithSteps(dir: string, stepsBody: string, check = 'true'): void {
  runCli(dir, ['start', 'Verify test', '--slug', 'verify-test'])
  writeFileSync(join(dir, '.plumbbob', 'settings.json'), JSON.stringify({ check }))
  writeSidecar(dir, 'intent.md', `# Verify test\n\n## Steps\n\n${stepsBody}\n`)
}

function commitCount(dir: string): number {
  return Number(execFileSync('git', ['-C', dir, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim())
}

describe('plumbbob check', () => {
  it('refuses with no session', () => {
    expect(runCli(makeFixtureRepo(), ['check']).status).toBe(1)
  })

  it('returns green (0) when the configured check passes, no phase change', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] a — **done when:** ok', 'true')
    expect(runCli(dir, ['check']).status).toBe(0)
    expect(phase(dir)).toBe('DESIGN')
  })

  it('returns red (non-zero) when the check fails', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] a — **done when:** ok', 'false')
    expect(runCli(dir, ['check']).status).not.toBe(0)
  })
})

describe('plumbbob checkpoint — executor-agnostic, D3 (author-blind-executor)', () => {
  it('checkpoints the inferred next-undone step with no in-flight STEP file', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok\n2. [ ] second — **done when:** ok')
    writeFileSync(join(dir, 'hand.txt'), 'a change made by hand, no /plumbbob:build\n')
    const res = runCli(dir, ['checkpoint'])
    expect(res.status).toBe(0)
    expect(phase(dir)).toBe('DESIGN')
    expect(readSidecar(dir, 'checkpoints')).toMatch(/step 1 [0-9a-f]{7,}/)
    expect(readSidecar(dir, 'intent.md')).toContain('1. [x] first')
    expect(readSidecar(dir, 'intent.md')).toContain('2. [ ] second') // untouched
  })

  it('takes an explicit step number', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] a — **done when:** ok\n2. [ ] b — **done when:** ok')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    runCli(dir, ['checkpoint', '2'])
    expect(readSidecar(dir, 'checkpoints')).toMatch(/step 2 /)
    expect(readSidecar(dir, 'intent.md')).toContain('2. [x] b')
  })

  it('prefers the in-flight STEP file and clears it', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] a — **done when:** ok\n2. [ ] b — **done when:** ok')
    writeSidecar(dir, 'STEP', '2\n')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    runCli(dir, ['checkpoint'])
    expect(readSidecar(dir, 'checkpoints')).toMatch(/step 2 /)
    expect(sidecarExists(dir, 'STEP')).toBe(false)
    expect(phase(dir)).toBe('DESIGN')
  })

  it('reads a --body message body from stdin, keeping the CLI-owned subject — D34 (cli-owns-subjects)', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    const res = runCli(dir, ['checkpoint', '--body'], {}, 'Proportional prose.\n\nA second paragraph.\n')
    expect(res.status).toBe(0)
    const subject = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
    const body = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%b'], { encoding: 'utf8' })
    expect(subject).toBe('feat(verify-test): first') // Conventional subject — D68 (conventional-subjects)
    expect(body).toContain('plumbbob step 1') // marker leads the body even with --body prose
    expect(body).toContain('Proportional prose.')
    expect(body).toContain('A second paragraph.')
  })

  it('carries a deterministic body — marker, done-when, seam, diffstat — without --body, D35 (fallback-body)', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** it works\n   - seam: `x.txt`')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    expect(runCli(dir, ['checkpoint']).status).toBe(0)
    const body = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%b'], { encoding: 'utf8' })
    expect(body.startsWith('plumbbob step 1')).toBe(true)
    expect(body).toContain('done when: it works')
    expect(body).toContain('seam: x.txt')
    expect(body).toContain('x.txt') // diffstat
  })

  it('records HEAD without a new commit when the tree is already clean', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] a — **done when:** ok')
    // The tracked artifact plane is uncommitted after start (the accepted dirty
    // window); commit it so the tree is genuinely clean, as the plan-approval
    // commit — D36 (plan-commit) — or the human's own commit skill would have left it.
    execFileSync('git', ['-C', dir, 'add', '-A'])
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'commit the plan scaffold'])
    const before = commitCount(dir)
    expect(runCli(dir, ['checkpoint']).status).toBe(0)
    expect(commitCount(dir)).toBe(before) // skill already committed; just record HEAD
    expect(readSidecar(dir, 'checkpoints')).toMatch(/step 1 /)
  })

  it('refuses on a red check, recording nothing', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] a — **done when:** ok', 'false')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    expect(runCli(dir, ['checkpoint']).status).toBe(1)
    expect(readSidecar(dir, 'checkpoints')).not.toMatch(/step 1 /)
  })

  it('refuses with no session', () => {
    expect(runCli(makeFixtureRepo(), ['checkpoint']).status).toBe(1)
  })
})

describe('plumbbob checkpoint --plan — the plan-approval commit, D36 (plan-commit)', () => {
  it('commits only the build folder as `chore(scope): plan` and records `plan <sha>`', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok')
    writeFileSync(join(dir, 'code.txt'), 'not part of the plan\n') // stray dirt outside the scaffold
    const res = runCli(dir, ['checkpoint', '--plan'])
    expect(res.status).toBe(0)
    const subject = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
    expect(subject).toBe('chore(verify-test): plan')
    expect(readSidecar(dir, 'checkpoints')).toMatch(/plan [0-9a-f]{7,}/)
    const names = execFileSync('git', ['-C', dir, 'show', '--pretty=format:', '--name-only', 'HEAD'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((l) => l.length > 0)
    expect(names.every((n) => n.startsWith('.plumbbob/builds/verify-test/'))).toBe(true)
    expect(names).not.toContain('code.txt')
    expect(readSidecar(dir, 'intent.md')).toContain('1. [ ] first') // no step flipped
  })

  it('reads a --body from stdin, keeping the CLI-owned plan subject', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok')
    const res = runCli(dir, ['checkpoint', '--plan', '--body'], {}, 'Why this plan.\n\nSecond paragraph.\n')
    expect(res.status).toBe(0)
    const subject = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
    const body = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%b'], { encoding: 'utf8' })
    expect(subject).toBe('chore(verify-test): plan')
    expect(body).toContain('plumbbob plan') // marker leads the plan body — D68 (conventional-subjects)
    expect(body).toContain('Why this plan.')
    expect(body).toContain('Second paragraph.')
  })
})
