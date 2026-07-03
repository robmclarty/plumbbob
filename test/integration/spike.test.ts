import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, phase, runCli, writeSidecar } from '../helpers/fixture-repo.ts'

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

describe('plumbbob spike', () => {
  it('creates a sibling worktree + branch per option and marks the spike', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Spiking a fork'])
    const result = runCli(dir, ['spike', 'auth'])
    try {
      expect(result.status).toBe(0)
      expect(phase(dir)).toBe('SPIKE')
      expect(spikeBranches(dir).sort()).toEqual(['spike/auth-a', 'spike/auth-b'])
      expect(spikeWorktreeCount(dir)).toBe(2)
    } finally {
      runCli(dir, ['spike', 'done'])
    }
  })

  it('spike done removes all spike worktrees + branches and clears the marker', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Spiking a fork'])
    runCli(dir, ['spike', 'cache'])

    const result = runCli(dir, ['spike', 'done'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('verdict')
    expect(phase(dir)).toBe('DESIGN')
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

  it('refuses to start a spike while a step is in flight', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Spiking a fork'])
    writeSidecar(dir, 'STEP', '1\n') // in-flight
    const result = runCli(dir, ['spike', 'nope'])
    expect(result.status).toBe(1)
    expect(phase(dir)).toBe('BUILD') // still in-flight, no spike opened
    expect(spikeBranches(dir)).toEqual([])
  })
})
