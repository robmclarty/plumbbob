import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { spike } from '../spike.ts'
import { start } from '../start.ts'
import { inSpike, stepPath } from '../../lib/sidecar.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

function gitOut(dir: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}
function spikeBranches(dir: string): string[] {
  const out = gitOut(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/spike/'])
  return out.length === 0 ? [] : out.split('\n').filter((b) => b.length > 0)
}

async function started(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Spiking']))
  return dir
}

describe('spike', () => {
  it('creates a worktree + branch per option (default a/b) and marks the spike', async () => {
    const dir = await started()
    try {
      const { code } = captureIo(() => spike(dir, ['auth']))
      expect(code).toBe(0)
      expect(inSpike(dir)).toBe(true)
      expect(spikeBranches(dir).sort()).toEqual(['spike/auth-a', 'spike/auth-b'])
    } finally {
      captureIo(() => spike(dir, ['done'])) // remove the sibling worktrees
    }
  })

  it('honors explicit option names', async () => {
    const dir = await started()
    try {
      captureIo(() => spike(dir, ['cache', 'map', 'lru']))
      expect(spikeBranches(dir).sort()).toEqual(['spike/cache-lru', 'spike/cache-map'])
    } finally {
      captureIo(() => spike(dir, ['done']))
    }
  })

  it('spike done removes every spike worktree + branch and clears the marker', async () => {
    const dir = await started()
    captureIo(() => spike(dir, ['auth']))
    const { code } = captureIo(() => spike(dir, ['done']))
    expect(code).toBe(0)
    expect(inSpike(dir)).toBe(false)
    expect(spikeBranches(dir)).toEqual([])
  })

  it('refuses a second spike while one is open', async () => {
    const dir = await started()
    captureIo(() => spike(dir, ['auth']))
    try {
      const { code, stderr } = captureIo(() => spike(dir, ['other']))
      expect(code).toBe(1)
      expect(stderr).toContain('already in a spike')
    } finally {
      captureIo(() => spike(dir, ['done']))
    }
  })

  it('refuses to start while a step is in flight', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '1\n')
    const { code, stderr } = captureIo(() => spike(dir, ['auth']))
    expect(code).toBe(1)
    expect(stderr).toContain('a step is in flight')
  })

  it('needs a slug', async () => {
    const dir = await started()
    const { code, stderr } = captureIo(() => spike(dir, []))
    expect(code).toBe(1)
    expect(stderr).toContain('needs a slug')
  })

  it('refuses `spike done` with no active spike', async () => {
    const dir = await started()
    const { code, stderr } = captureIo(() => spike(dir, ['done']))
    expect(code).toBe(1)
    expect(stderr).toContain('no active spike')
  })

  it('refuses with no active session', async () => {
    expect(captureIo(() => spike(makeTempRepo(), ['auth'])).code).toBe(1)
  })
})
