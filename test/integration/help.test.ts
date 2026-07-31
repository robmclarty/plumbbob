// Per-verb `--help` against a real repo. The point of these tests is not the
// rendering — cli-core.test.ts covers that in-process — but the guarantee that
// asking a *mutating* verb for help does not run it. `plumbbob checkpoint --help`
// used to gate, commit, and flip step 1 to done before any code existed; the
// commit had to be unwound by hand. That regression is the first test here.

import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, readSidecar, runCli, sidecarExists } from '../helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function head(dir: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

describe('--help never mutates', () => {
  it('checkpoint --help prints help instead of committing', () => {
    const dir = makeFixtureRepo({ withCheckScript: true })
    expect(runCli(dir, ['start', 'Help regression']).status).toBe(0)
    const before = head(dir)

    const { status, stdout } = runCli(dir, ['checkpoint', '--help'])

    expect(status).toBe(0)
    expect(stdout).toContain('plumbbob checkpoint')
    expect(stdout).toContain('--plan')
    // The three ways the old behavior showed itself: a new commit, a recorded
    // step SHA, and a flipped checkbox.
    expect(head(dir)).toBe(before)
    expect(readSidecar(dir, 'checkpoints')).not.toContain('step ')
    expect(readSidecar(dir, 'intent.md')).not.toContain('[x]')
  })

  it('build --help does not put a step in flight', () => {
    const dir = makeFixtureRepo()
    expect(runCli(dir, ['start', 'Help regression']).status).toBe(0)

    const { status, stdout } = runCli(dir, ['build', '--help'])

    expect(status).toBe(0)
    expect(stdout).toContain('plumbbob build')
    expect(sidecarExists(dir, 'STEP')).toBe(false)
    expect(sidecarExists(dir, 'SEAM')).toBe(false)
  })

  it('finish --help does not close the session', () => {
    const dir = makeFixtureRepo()
    expect(runCli(dir, ['start', 'Help regression']).status).toBe(0)
    const before = head(dir)

    const { status } = runCli(dir, ['finish', '--help'])

    expect(status).toBe(0)
    expect(head(dir)).toBe(before)
    expect(runCli(dir, ['status']).stdout).not.toContain('NO ACTIVE SESSION')
  })

  it('start --help does not scaffold a sidecar', () => {
    const dir = makeFixtureRepo()

    const { status, stdout } = runCli(dir, ['start', '--help'])

    expect(status).toBe(0)
    expect(stdout).toContain('plumbbob start')
    expect(runCli(dir, ['status']).stdout).toContain('NO ACTIVE SESSION')
  })
})

describe('unknown flags', () => {
  it('refuses rather than silently running the verb', () => {
    const dir = makeFixtureRepo({ withCheckScript: true })
    expect(runCli(dir, ['start', 'Typo guard']).status).toBe(0)
    const before = head(dir)

    const { status, stderr } = runCli(dir, ['checkpoint', '--drybrun'])

    expect(status).toBe(1)
    expect(stderr).toContain("unknown flag '--drybrun'")
    expect(head(dir)).toBe(before)
  })

  it('still accepts every flag the help declares', () => {
    const dir = makeFixtureRepo({ withCheckScript: true })
    expect(runCli(dir, ['start', 'Flags still work', '--slug', 'flagcheck']).status).toBe(0)
    // --plan and -m are declared, so they reach the verb and do their job.
    const { status } = runCli(dir, ['checkpoint', '--plan', '-m', 'chore(flagcheck): plan'])
    expect(status).toBe(0)
    expect(readSidecar(dir, 'checkpoints')).toContain('plan ')
  })
})
