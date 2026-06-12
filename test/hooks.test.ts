import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, runCli } from './helpers/fixture-repo.ts'
import { bashGuard, postEdit, preEdit } from './helpers/run-hook.ts'

afterAll(cleanupFixtures)

function writeIntent(dir: string, stepsBody: string): void {
  writeFileSync(join(dir, '.plumbline', 'intent.md'), `# T\n\n## Steps\n\n${stepsBody}\n`)
}
function makeDir(dir: string, rel: string): void {
  mkdirSync(join(dir, rel), { recursive: true })
}
function makeExecutable(dir: string, rel: string, script: string): void {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, script)
  chmodSync(path, 0o755)
}
function buildOnSeam(dir: string, seam: string): void {
  runCli(dir, ['start', 'Hooked'])
  writeIntent(dir, `1. [ ] Step — **done when:** ok\n   - seam: ${seam}`)
  runCli(dir, ['build', '1'])
}

describe('pre-edit muzzle: session gating', () => {
  it('is dormant (allows) when there is no session', () => {
    const dir = makeFixtureRepo()
    expect(preEdit(dir, { rel: 'src/anything.ts' }).status).toBe(0)
  })

  it('blocks a src/ write in DESIGN with a model-directed park message (exit 2)', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Designing'])
    const result = preEdit(dir, { rel: 'src/cli.ts' })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('park')
  })
})

describe('pre-edit muzzle: doc whitelist (D6/D19)', () => {
  it('allows the control docs in every state and blocks the archive', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Docs'])
    for (const state of ['DESIGN', 'REVIEW', 'FINISH']) {
      runCli(dir, ['mode', state])
      expect(preEdit(dir, { rel: '.plumbline/intent.md' }).status).toBe(0)
      expect(preEdit(dir, { rel: '.plumbline/build-log.md' }).status).toBe(0)
      expect(preEdit(dir, { rel: '.plumbline/report.md' }).status).toBe(0)
    }
    expect(preEdit(dir, { rel: '.plumbline/archive/2026-01-01-x/intent.md' }).status).toBe(2)
  })

  it('allows docs/ only in FINISH', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Docs'])
    expect(preEdit(dir, { rel: 'docs/guide.md' }).status).toBe(2) // DESIGN
    runCli(dir, ['mode', 'FINISH'])
    expect(preEdit(dir, { rel: 'docs/guide.md' }).status).toBe(0)
  })
})

describe('pre-edit seam-guard in BUILD (D23)', () => {
  it('allows an exact seam path and a dir/ grant, blocks out-of-seam', () => {
    const dir = makeFixtureRepo()
    buildOnSeam(dir, '`src/a.ts`, `lib/`')
    expect(preEdit(dir, { rel: 'src/a.ts' }).status).toBe(0)
    expect(preEdit(dir, { rel: 'lib/deep/nested.ts' }).status).toBe(0) // dir/ prefix grant
    const blocked = preEdit(dir, { rel: 'src/b.ts' })
    expect(blocked.status).toBe(2)
    expect(blocked.stderr).toContain('outside the seam')
  })

  it('resolves the absolute path correctly from a subdirectory cwd', () => {
    const dir = makeFixtureRepo()
    buildOnSeam(dir, '`src/a.ts`')
    makeDir(dir, 'src') // cwd must exist
    expect(preEdit(dir, { rel: 'src/a.ts', cwd: 'src' }).status).toBe(0)
    expect(preEdit(dir, { rel: 'src/b.ts', cwd: 'src' }).status).toBe(2)
  })

  it('matches MultiEdit and NotebookEdit too', () => {
    const dir = makeFixtureRepo()
    buildOnSeam(dir, '`src/a.ts`')
    expect(preEdit(dir, { rel: 'src/b.ts', tool: 'MultiEdit' }).status).toBe(2)
    // NotebookEdit carries notebook_path; a deny proves the path was extracted.
    expect(preEdit(dir, { rel: 'notebooks/x.ipynb', tool: 'NotebookEdit' }).status).toBe(2)
  })
})

describe('bash-guard (D21)', () => {
  it('is dormant when there is no session', () => {
    const dir = makeFixtureRepo()
    expect(bashGuard(dir, 'echo hi > out.txt').status).toBe(0)
  })

  it('blocks touching .plumbline/STATE or SEAM in any state', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Guarded'])
    expect(bashGuard(dir, 'echo BUILD > .plumbline/STATE').status).toBe(2)
    expect(bashGuard(dir, 'cat .plumbline/SEAM').status).toBe(2)
  })

  it('blocks `plumbline mode` from the shell', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Guarded'])
    expect(bashGuard(dir, 'plumbline mode BUILD').status).toBe(2)
  })

  it('blocks file-writing patterns outside BUILD/SPIKE but allows them in BUILD', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Guarded'])
    expect(bashGuard(dir, 'echo x > src/a.ts').status).toBe(2) // DESIGN
    expect(bashGuard(dir, 'sed -i "" s/a/b/ src/a.ts').status).toBe(2)
    expect(bashGuard(dir, 'ls -la').status).toBe(0) // benign

    runCli(dir, ['mode', 'BUILD'])
    expect(bashGuard(dir, 'echo x > src/a.ts').status).toBe(0) // writes allowed in BUILD
  })
})

describe('post-edit light feedback (D25)', () => {
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
})
