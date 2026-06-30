// `plumbbob init` — the whole install: symlink the package into
// ~/.claude/skills/plumbbob so Claude Code loads it as an in-place plugin. Global
// only; idempotent + reversible; NEVER writes settings.json. HOME is pinned to a
// throwaway dir per test so the real ~/.claude is never touched. Subprocess-driven
// (D14); init ignores cwd, so a non-git dir is fine.

import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeNonGitDir, runCli } from '../helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function initIn(home: string, ...flags: string[]): ReturnType<typeof runCli> {
  return runCli(makeNonGitDir(), ['init', ...flags], { HOME: home })
}
function link(home: string): string {
  return join(home, '.claude', 'skills', 'plumbbob')
}
// Seed Claude Code's installed_plugins.json so the home looks like it already has
// a marketplace plumbbob plugin — what the collision guard keys off.
function seedMarketplace(home: string, id = 'plumbbob@robmclarty'): void {
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
  writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { [id]: [{ scope: 'user' }] } }))
}

describe('plumbbob init — global, in-place plugin link', () => {
  it('symlinks the package into ~/.claude/skills/plumbbob, resolving to the manifest + skills + hook', () => {
    const home = makeNonGitDir()
    expect(initIn(home).status).toBe(0)

    const l = link(home)
    expect(lstatSync(l).isSymbolicLink()).toBe(true)
    expect(existsSync(join(l, '.claude-plugin', 'plugin.json'))).toBe(true) // resolves to a real plumbbob package
    expect(existsSync(join(l, 'skills', 'pb-plan', 'SKILL.md'))).toBe(true) // pb- skills reachable through the link
    expect(existsSync(join(l, 'hooks', 'hooks.json'))).toBe(true) // the auto-registering hook
  })

  it('never writes settings.json — the hook auto-registers via hooks.json', () => {
    const home = makeNonGitDir()
    initIn(home)
    expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(false)
    expect(existsSync(join(home, '.claude', 'settings.local.json'))).toBe(false)
  })

  it('is idempotent — a second run reports already-linked and exits 0', () => {
    const home = makeNonGitDir()
    expect(initIn(home).status).toBe(0)
    const second = initIn(home)
    expect(second.status).toBe(0)
    expect(second.stdout).toMatch(/already linked/i)
  })

  it('--uninstall removes the link', () => {
    const home = makeNonGitDir()
    initIn(home)
    expect(lstatSync(link(home)).isSymbolicLink()).toBe(true)

    expect(initIn(home, '--uninstall').status).toBe(0)
    expect(existsSync(link(home))).toBe(false)
  })

  it('--uninstall with nothing linked is a no-op (exit 0)', () => {
    const r = initIn(makeNonGitDir(), '--uninstall')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/nothing to uninstall/i)
  })

  it('refuses to clobber a real directory already at the link path', () => {
    const home = makeNonGitDir()
    mkdirSync(join(home, '.claude', 'skills', 'plumbbob'), { recursive: true })
    const r = initIn(home)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/not a plumbbob link/i)
  })

  it('refuses when a marketplace plumbbob plugin is already installed (collision guard)', () => {
    const home = makeNonGitDir()
    seedMarketplace(home)
    const r = initIn(home)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/marketplace plumbbob plugin is already installed/i)
    expect(existsSync(link(home))).toBe(false) // no second, colliding plugin linked
  })

  it('--force overrides the marketplace-collision guard and links anyway', () => {
    const home = makeNonGitDir()
    seedMarketplace(home)
    const r = initIn(home, '--force')
    expect(r.status).toBe(0)
    expect(lstatSync(link(home)).isSymbolicLink()).toBe(true)
  })
})
