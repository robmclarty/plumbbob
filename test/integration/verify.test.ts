import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, phase, readSidecar, runCli } from '../helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

// Scaffold a session, then overwrite the config (stub check) and intent so the
// verbs run against a known step list and a controllable green/red gate (D14).
function startWithSteps(dir: string, stepsBody: string, check = 'true'): void {
  runCli(dir, ['start', 'Verify test'])
  writeFileSync(join(dir, '.plumbbob', 'config'), `check=${check}\n`)
  writeFileSync(join(dir, '.plumbbob', 'intent.md'), `# Verify test\n\n## Steps\n\n${stepsBody}\n`)
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

describe('plumbbob checkpoint — executor-agnostic (D3)', () => {
  it('checkpoints the inferred next-undone step with no in-flight STEP file', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok\n2. [ ] second — **done when:** ok')
    writeFileSync(join(dir, 'hand.txt'), 'a change made by hand, no /plumbbob:pb-build\n')
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
    writeFileSync(join(dir, '.plumbbob', 'STEP'), '2\n')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    runCli(dir, ['checkpoint'])
    expect(readSidecar(dir, 'checkpoints')).toMatch(/step 2 /)
    expect(existsSync(join(dir, '.plumbbob', 'STEP'))).toBe(false)
    expect(phase(dir)).toBe('DESIGN')
  })

  it('reads a --body message body from stdin, keeping the CLI-owned subject (D5)', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** ok')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    const res = runCli(dir, ['checkpoint', '--body'], {}, 'Proportional prose.\n\nA second paragraph.\n')
    expect(res.status).toBe(0)
    const subject = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()
    const body = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%b'], { encoding: 'utf8' })
    expect(subject).toBe('plumbbob: step 1 — first')
    expect(body).toContain('Proportional prose.')
    expect(body).toContain('A second paragraph.')
  })

  it('carries a deterministic body — done-when, seam, diffstat — without --body (D6)', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] first — **done when:** it works\n   - seam: `x.txt`')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    expect(runCli(dir, ['checkpoint']).status).toBe(0)
    const body = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%b'], { encoding: 'utf8' })
    expect(body).toContain('done when: it works')
    expect(body).toContain('seam: x.txt')
    expect(body).toContain('x.txt') // diffstat
  })

  it('records HEAD without a new commit when the tree is already clean', () => {
    const dir = makeFixtureRepo()
    startWithSteps(dir, '1. [ ] a — **done when:** ok')
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
