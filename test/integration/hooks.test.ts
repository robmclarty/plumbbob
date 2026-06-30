import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, runCli } from '../helpers/fixture-repo.ts'
import { postEdit } from '../helpers/run-hook.ts'

afterAll(cleanupFixtures)

function makeExecutable(dir: string, rel: string, script: string): void {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, script)
  chmodSync(path, 0o755)
}

// PlumbBob has no muzzle, no seam-guard, and no bash-guard (D1/D13). The
// only edit-time hook is the PostToolUse light feedback: it never blocks and
// exists solely to give the model the diagnostics it cannot otherwise see (D25).
describe('post-edit light feedback (D25 — the only edit-time hook)', () => {
  it('no-ops (exit 0, no context) when the tools are absent', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Lint'])
    makeExecutable(dir, 'src/a.ts', 'export const a = 1\n')
    const result = postEdit(dir, { rel: 'src/a.ts' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('reports file-scoped failures via additionalContext, still exits 0', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Lint'])
    makeExecutable(dir, 'src/a.ts', 'export const a = 1\n')
    makeExecutable(dir, 'node_modules/.bin/oxlint', '#!/bin/sh\necho "a.ts:1 no-explicit-any" >&2\nexit 1\n')
    const result = postEdit(dir, { rel: 'src/a.ts' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('additionalContext')
    expect(result.stdout).toContain('no-explicit-any')
  })

  it('stays silent when the file-scoped check passes', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Lint'])
    makeExecutable(dir, 'src/a.ts', 'export const a = 1\n')
    makeExecutable(dir, 'node_modules/.bin/oxlint', '#!/bin/sh\nexit 0\n')
    const result = postEdit(dir, { rel: 'src/a.ts' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('no-ops when there is no active session (no .plumbbob/STATE)', () => {
    const dir = makeFixtureRepo() // note: no `start`, so find_root fails
    const result = postEdit(dir, { rel: 'src/a.ts' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('no-ops for a non-source file extension', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Lint'])
    const result = postEdit(dir, { rel: 'notes.md' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('no-ops when the edited path no longer exists', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Lint'])
    const result = postEdit(dir, { rel: 'src/ghost.ts' }) // never created
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })
})
