import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { spike } from '../spike.ts'
import { start } from '../start.ts'
import { buildFolder, inSpike, listSpikeReports, stepPath } from '../../lib/sidecar.ts'
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

describe('spike reports (D70)', () => {
  const reportBody = (dir: string, name: string): string => readFileSync(join(buildFolder(dir), name), 'utf8')

  it('scaffolds spike-01-<slug>.md at open, naming it and the worktree provenance', async () => {
    const dir = await started()
    try {
      const { stdout } = captureIo(() => spike(dir, ['auth']))
      expect(listSpikeReports(dir)).toEqual(['spike-01-auth.md'])
      expect(stdout).toContain('spike-01-auth.md')
      const body = reportBody(dir, 'spike-01-auth.md')
      expect(body).toContain('# Spike — auth')
      expect(body).toContain('**Via:** /plumbbob:spike — worktrees (a, b)')
      expect(body).toContain('*(viable | not viable | partial') // the unfilled verdict placeholder
    } finally {
      captureIo(() => spike(dir, ['done']))
    }
  })

  it('`spike report` scaffolds without worktrees, stamping `step <n>` when a step is in flight', async () => {
    const dir = await started()
    writeFileSync(stepPath(dir), '3\n') // a step in flight — the spike-as-step case
    const { code, stdout } = captureIo(() => spike(dir, ['report', 'auth-store']))
    expect(code).toBe(0)
    expect(inSpike(dir)).toBe(false) // no SPIKE marker, no worktrees
    expect(spikeBranches(dir)).toEqual([])
    expect(stdout).toContain('spike-01-auth-store.md')
    expect(reportBody(dir, 'spike-01-auth-store.md')).toContain('**Via:** step 3')
  })

  it('`spike report` falls back to `/plumbbob:spike` provenance with no step in flight', async () => {
    const dir = await started()
    captureIo(() => spike(dir, ['report', 'redis']))
    expect(reportBody(dir, 'spike-01-redis.md')).toContain('**Via:** /plumbbob:spike')
  })

  it('allocates the next zero-padded index per report (gap-free increment)', async () => {
    const dir = await started()
    captureIo(() => spike(dir, ['report', 'first']))
    captureIo(() => spike(dir, ['report', 'second']))
    expect(listSpikeReports(dir)).toEqual(['spike-01-first.md', 'spike-02-second.md'])
  })

  it('needs a slug for `spike report`', async () => {
    const dir = await started()
    const { code, stderr } = captureIo(() => spike(dir, ['report']))
    expect(code).toBe(1)
    expect(stderr).toContain('spike report needs a slug')
  })

  it('`spike done` nudges (but still closes) when a verdict is unrecorded', async () => {
    const dir = await started()
    captureIo(() => spike(dir, ['auth'])) // scaffolds spike-01 with the placeholder verdict
    const { code, stderr } = captureIo(() => spike(dir, ['done']))
    expect(code).toBe(0) // guidance, not a gate — it still closes
    expect(inSpike(dir)).toBe(false)
    expect(stderr).toContain('no verdict recorded in spike-01-auth.md')
  })

  it('`spike done` stays quiet once the verdict is filled in', async () => {
    const dir = await started()
    captureIo(() => spike(dir, ['auth']))
    // Replace the placeholder line with a real call.
    const path = join(buildFolder(dir), 'spike-01-auth.md')
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^\*\*Verdict:\*\*.*$/m, '**Verdict:** viable — option a wins.'))
    const { code, stderr } = captureIo(() => spike(dir, ['done']))
    expect(code).toBe(0)
    expect(stderr).not.toContain('no verdict recorded')
  })
})
