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
describe('Plumbbob v2: no verb is gated by CLAUDECODE (the lock is gone)', () => {
  it('runs every verb the same in-session — start, then park, under CLAUDECODE', () => {
    const dir = makeFixtureRepo()
    expect(runCli(dir, ['start', 'In session'], { CLAUDECODE: '1' }).status).toBe(0)
    expect(readSidecar(dir, 'STATE').trim()).toBe('DESIGN')
    const parked = runCli(dir, ['park', 'a captured idea'], { CLAUDECODE: '1' })
    expect(parked.status).toBe(0)
    expect(readSidecar(dir, 'build-log.md')).toContain('- [ ] a captured idea')
  })
})
