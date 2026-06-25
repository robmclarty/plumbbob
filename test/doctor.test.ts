// `plumbbob doctor` — the install diagnostic. It is read-only and inspects the
// repo-scoped (self-contained) install: skills under <repo>/.claude, the CLI +
// hook under <repo>/node_modules, the registration in either settings file. The
// failure class it exists for is silent (a skill bin that resolves to empty), so
// these tests pin the broken-bin detection in particular. Subprocess-driven (D14);
// a fixture repo with no real dep install, so the "healthy" case stubs the files
// setup can't create.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, makeNonGitDir, runCli } from './helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

function doctorIn(repo: string, home: string): ReturnType<typeof runCli> {
  return runCli(repo, ['doctor'], { HOME: home })
}
function setupLocal(repo: string, home: string): void {
  runCli(repo, ['setup', '--local'], { HOME: home })
}
// Stub the artifacts a real `pnpm add -D plumbbob` would create but a fixture
// repo lacks: the package dir, the hook script, and the .bin shim.
function stubInstall(repo: string): void {
  mkdirSync(join(repo, 'node_modules', 'plumbbob', 'hooks'), { recursive: true })
  writeFileSync(join(repo, 'node_modules', 'plumbbob', 'hooks', 'post-edit.sh'), '#!/bin/sh\n')
  mkdirSync(join(repo, 'node_modules', '.bin'), { recursive: true })
  writeFileSync(join(repo, 'node_modules', '.bin', 'plumbbob'), '#!/bin/sh\n')
}
function skillFile(repo: string, name: string): string {
  return join(repo, '.claude', 'skills', name, 'SKILL.md')
}

describe('plumbbob doctor', () => {
  it('reports "none detected" and exits 1 when no skills are installed', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    const { stdout, status } = doctorIn(repo, home)

    expect(status).toBe(1)
    expect(stdout).toContain('install shape: none detected')
    expect(stdout).toContain('pnpm add -D plumbbob') // the project-install remedy
  })

  it('after --local but with no dep installed, flags the missing dep + bin + hook script', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupLocal(repo, home)
    const { stdout, status } = doctorIn(repo, home)

    expect(status).toBe(1)
    expect(stdout).toContain('install shape: self-contained')
    expect(stdout).toContain('✓ skills installed')
    expect(stdout).toContain('✓ post-edit hook registered (settings.local.json)') // registration landed
    expect(stdout).toContain('plumbbob is not a project dependency') // dep missing
    expect(stdout).toContain('hook script missing') // node_modules/plumbbob absent
  })

  it('passes every check once the install artifacts exist', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupLocal(repo, home)
    stubInstall(repo)
    const { stdout, status } = doctorIn(repo, home)

    expect(status).toBe(0)
    expect(stdout).toContain('all checks passed')
    expect(stdout).not.toContain('✗')
  })

  it('detects the legacy $CLAUDE_PROJECT_DIR bin a pre-0.3 install left in a skill', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupLocal(repo, home)
    stubInstall(repo)
    // Regress one skill to the broken pre-0.3 injection form.
    const f = skillFile(repo, 'pb-status')
    const body = readFileSync(f, 'utf8').replace(/!`[^`]*`/, '!`$CLAUDE_PROJECT_DIR/node_modules/.bin/plumbbob status`')
    writeFileSync(f, body)
    const { stdout, status } = doctorIn(repo, home)

    expect(status).toBe(1)
    expect(stdout).toContain('skill bin broken')
    expect(stdout).toContain('legacy $CLAUDE_PROJECT_DIR')
  })

  it('detects the unresolved placeholder when setup never substituted', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupLocal(repo, home)
    stubInstall(repo)
    const f = skillFile(repo, 'pb-status')
    const body = readFileSync(f, 'utf8').replace(/!`[^`]*`/, '!`__PLUMBBOB_BIN__ status`')
    writeFileSync(f, body)
    const { stdout, status } = doctorIn(repo, home)

    expect(status).toBe(1)
    expect(stdout).toContain('placeholder not substituted')
  })

  it('falls back to the global shape when only ~/.claude has skills', () => {
    const home = makeNonGitDir()
    const repo = makeNonGitDir() // not a git repo → no self-contained scope
    runCli(repo, ['setup', '--global'], { HOME: home })
    const { stdout } = doctorIn(repo, home)

    expect(stdout).toContain('install shape: global')
    expect(stdout).toContain('~/.claude/skills')
  })
})
