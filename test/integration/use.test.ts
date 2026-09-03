// D30 (use-to-switch)/D28 (state-cursor) — the `use` switch verb and the layout's
// per-worktree cursor, driven as real subprocesses per D14 (throwaway-repo-tests),
// including one run inside a `git worktree add` linked
// worktree so the per-worktree cursor + hook root-detection are exercised where
// they broke before (the worktree-proofing this whole build is named for).

import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, runCli } from '../helpers/fixture-repo.ts'
import { postEdit } from '../helpers/run-hook.ts'

afterAll(cleanupFixtures)

function git(dir: string, args: ReadonlyArray<string>): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
}

// Plant a second, resumable build folder (in the real flow a prior build finish
// leaves one behind); `use` only needs the folder + its intent.md to resolve.
function seedBuild(dir: string, slug: string, title: string): void {
  const d = join(dir, '.plumbbob', 'builds', slug)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'intent.md'), `# ${title}\n\n## Steps\n\n1. [ ] Go — **done when:** ok\n   - seam: \`src/\`\n`)
  writeFileSync(join(d, 'checkpoints'), 'baseline deadbeef\n')
}

describe('plumbbob use', () => {
  it('re-points the cursor so status orients on the chosen build', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'First Build'])
    seedBuild(dir, 'second-build', 'Second Feature')

    const used = runCli(dir, ['use', 'second-build'])
    expect(used.status).toBe(0)
    expect(used.stdout).toContain('**Active build**: second-build')
    expect(runCli(dir, ['status']).stdout).toContain('Second Feature')
  })

  it('refuses an unknown slug and leaves the cursor put', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'First Build'])
    const used = runCli(dir, ['use', 'ghost'])
    expect(used.status).toBe(1)
    expect(used.stderr).toContain('no build named "ghost"')
    expect(runCli(dir, ['status']).stdout).toContain('First Build') // cursor unchanged
  })

  it('status lists the builds when the cursor resolves to none', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'First Build', '--slug', 'first-build'])
    seedBuild(dir, 'second-build', 'Second Feature')
    writeFileSync(join(dir, '.plumbbob', 'STATE'), '') // empty the cursor; two builds → resolves to none

    const out = runCli(dir, ['status']).stdout
    expect(out).toContain('NO ACTIVE BUILD')
    expect(out).toContain('first-build')
    expect(out).toContain('second-build')
  })
})

describe('post-edit hook in a linked worktree — D33 (info-exclude)/D28 (state-cursor), the cursor is per-worktree', () => {
  it('finds the root via the worktree-local STATE cursor', () => {
    const main = makeFixtureRepo()
    runCli(main, ['start', 'Feature', '--slug', 'feature'])

    const wt = join(dirname(main), `${basename(main)}-linked`)
    git(main, ['worktree', 'add', '-q', wt, 'HEAD'])
    try {
      // The worktree's own untracked STATE (git-excluded, so the linked worktree
      // carries its own cursor — non-empty content = a tracked build is live here).
      mkdirSync(join(wt, '.plumbbob'), { recursive: true })
      writeFileSync(join(wt, '.plumbbob', 'STATE'), 'feature\n')
      const bin = join(wt, 'node_modules', '.bin')
      mkdirSync(bin, { recursive: true })
      const oxlint = join(bin, 'oxlint')
      writeFileSync(oxlint, '#!/bin/sh\necho "a.ts:1 no-explicit-any" >&2\nexit 1\n')
      chmodSync(oxlint, 0o755)
      const src = join(wt, 'src')
      mkdirSync(src, { recursive: true })
      writeFileSync(join(src, 'a.ts'), 'export const a = 1\n')

      const result = postEdit(wt, { rel: 'src/a.ts' })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('additionalContext')
      expect(result.stdout).toContain('no-explicit-any')
    } finally {
      git(main, ['worktree', 'remove', '--force', wt])
    }
  })
})
