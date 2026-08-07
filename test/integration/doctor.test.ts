// `plumbbob doctor` — the install diagnostic, read-only. After `plumbbob init`,
// plumbbob is a symlink at ~/.claude/skills/plumbbob pointing at the package;
// doctor verifies the link resolves to the manifest + skills + hook. The failure
// class it exists for is silent (a never-linked plugin → an empty dashboard), so
// these tests pin not-linked detection and a link that points at a non-package.
// HOME is pinned per test; subprocess-driven per D14 (throwaway-repo-tests).

import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeNonGitDir, runCli } from '../helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function doctorIn(home: string): ReturnType<typeof runCli> {
  return runCli(makeNonGitDir(), ['doctor'], { HOME: home })
}
function initIn(home: string, ...flags: string[]): void {
  runCli(makeNonGitDir(), ['init', ...flags], { HOME: home })
}
function seedMarketplace(home: string, id = 'plumbbob@robmclarty'): void {
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { [id]: [{ scope: 'user' }] } }))
}

describe('plumbbob doctor — global plugin link', () => {
  it('reports not-linked and exits 1 before init', () => {
    const { stdout, status } = doctorIn(makeNonGitDir())

    expect(status).toBe(1)
    expect(stdout).toMatch(/not linked/i)
    expect(stdout).toContain('plumbbob init') // the remedy
  })

  it('passes every check after init', () => {
    const home = makeNonGitDir()
    initIn(home)
    const { stdout, status } = doctorIn(home)

    expect(status).toBe(0)
    expect(stdout).toContain('all checks passed')
    expect(stdout).not.toContain('✗')
    expect(stdout).toMatch(/plugin manifest present/i)
    expect(stdout).toMatch(/skills present/i)
    expect(stdout).toMatch(/hook present/i)
  })

  it('flags a link that does not resolve to a plumbbob package', () => {
    const home = makeNonGitDir()
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
    symlinkSync(makeNonGitDir(), join(home, '.claude', 'skills', 'plumbbob')) // points at an empty dir
    const { stdout, status } = doctorIn(home)

    expect(status).toBe(1)
    expect(stdout).toMatch(/manifest missing|skills incomplete/i)
  })

  it('recognizes a marketplace install (no link) as a valid, passing install', () => {
    const home = makeNonGitDir()
    seedMarketplace(home)
    const { stdout, status } = doctorIn(home)

    expect(status).toBe(0)
    expect(stdout).toMatch(/installed via marketplace/i)
    expect(stdout).not.toContain('✗')
  })

  it('flags the collision when both a skills-dir link and a marketplace install exist', () => {
    const home = makeNonGitDir()
    initIn(home, '--force') // link the checkout past the guard
    seedMarketplace(home)
    const { stdout, status } = doctorIn(home)

    expect(status).toBe(1)
    expect(stdout).toMatch(/collision/i)
  })
})
