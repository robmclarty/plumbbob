import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, readSidecar, runCli } from './helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function git(dir: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

// Worktrees whose checked-out branch lives under spike/ (porcelain output).
function spikeWorktreeCount(dir: string): number {
  return git(dir, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((l) => l.startsWith('branch refs/heads/spike/')).length
}
function spikeBranches(dir: string): string[] {
  const out = git(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/spike/'])
  return out.length === 0 ? [] : out.split('\n').filter((b) => b.length > 0)
}

describe('plumbline spike', () => {
  it('creates a sibling worktree + branch per option and enters SPIKE', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Spiking a fork'])
    const result = runCli(dir, ['spike', 'auth'])
    try {
      expect(result.status).toBe(0)
      expect(readSidecar(dir, 'STATE').trim()).toBe('SPIKE')
      expect(spikeBranches(dir).sort()).toEqual(['spike/auth-a', 'spike/auth-b'])
      expect(spikeWorktreeCount(dir)).toBe(2)
    } finally {
      runCli(dir, ['spike', 'done'])
    }
  })

  it('spike done removes all spike worktrees + branches and returns to DESIGN', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Spiking a fork'])
    runCli(dir, ['spike', 'cache'])

    const result = runCli(dir, ['spike', 'done'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('verdict')
    expect(readSidecar(dir, 'STATE').trim()).toBe('DESIGN')
    expect(spikeBranches(dir)).toEqual([])
    expect(spikeWorktreeCount(dir)).toBe(0)
  })

  it('accepts explicit option labels', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Spiking a fork'])
    const result = runCli(dir, ['spike', 'store', 'sql', 'kv'])
    try {
      expect(result.status).toBe(0)
      expect(spikeBranches(dir).sort()).toEqual(['spike/store-kv', 'spike/store-sql'])
    } finally {
      runCli(dir, ['spike', 'done'])
    }
  })

  it('refuses to start a spike outside DESIGN', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Spiking a fork'])
    runCli(dir, ['mode', 'BUILD'])
    const result = runCli(dir, ['spike', 'nope'])
    expect(result.status).toBe(1)
    expect(readSidecar(dir, 'STATE').trim()).toBe('BUILD')
    expect(spikeBranches(dir)).toEqual([])
  })
})
