import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, makeNonGitDir, readSidecar, runCli } from './helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

describe('plumbbob status', () => {
  it('prints NO ACTIVE SESSION with no session', () => {
    const result = runCli(makeFixtureRepo(), ['status'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('NO ACTIVE SESSION')
  })

  it('prints NO ACTIVE SESSION outside a git repo', () => {
    const result = runCli(makeNonGitDir(), ['status'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('NO ACTIVE SESSION')
  })

  it('prints the state when a session is active', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Statey'])
    expect(runCli(dir, ['status']).stdout).toContain('STATE: DESIGN')
  })
})

describe('plumbbob mode (escape hatch)', () => {
  it('sets STATE directly', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Modey'])
    expect(runCli(dir, ['mode', 'BUILD']).status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('BUILD')
  })

  it('rejects an invalid state', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Modey'])
    const result = runCli(dir, ['mode', 'NONSENSE'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not a valid state')
  })

  it('refuses without an active session', () => {
    const result = runCli(makeFixtureRepo(), ['mode', 'BUILD'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('no active session')
  })
})

describe('plumbbob park', () => {
  it('appends raw lines under the Park list, in order, before Triage', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Parky'])
    expect(runCli(dir, ['park', 'first idea']).status).toBe(0)
    expect(runCli(dir, ['park', 'second idea']).status).toBe(0)

    const log = readSidecar(dir, 'build-log.md')
    const parkIdx = log.indexOf('## Park list')
    const triageIdx = log.indexOf('## Triage')
    const firstIdx = log.indexOf('- [ ] first idea')
    const secondIdx = log.indexOf('- [ ] second idea')

    expect(firstIdx).toBeGreaterThan(parkIdx)
    expect(secondIdx).toBeGreaterThan(parkIdx)
    expect(firstIdx).toBeLessThan(triageIdx)
    expect(secondIdx).toBeLessThan(triageIdx)
    expect(firstIdx).toBeLessThan(secondIdx)
  })

  it('refuses without an active session', () => {
    expect(runCli(makeFixtureRepo(), ['park', 'orphan idea']).status).toBe(1)
  })
})

describe('D21 (revised): transitions run in-session; mode stays human-only (CLAUDECODE)', () => {
  it('runs a transition verb (start) under CLAUDECODE — driver skills fire it from the chat', () => {
    const dir = makeFixtureRepo()
    const result = runCli(dir, ['start', 'Now allowed'], { CLAUDECODE: '1' })
    expect(result.status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('DESIGN')
  })

  it('refuses mode under CLAUDECODE, leaving STATE unchanged', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Modey'])
    const result = runCli(dir, ['mode', 'BUILD'], { CLAUDECODE: '1' })
    expect(result.status).toBe(1)
    expect(readSidecar(dir, 'STATE').trim()).toBe('DESIGN')
  })

  it('still allows park under CLAUDECODE (capture is exempt)', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Parky'])
    const result = runCli(dir, ['park', 'a captured idea'], { CLAUDECODE: '1' })
    expect(result.status).toBe(0)
    expect(readSidecar(dir, 'build-log.md')).toContain('- [ ] a captured idea')
  })
})
