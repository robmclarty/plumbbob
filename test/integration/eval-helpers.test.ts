// Model-free coverage for the eval tier's deterministic halves (intent C2):
// the baseline plugin strip, the fixture gate variants, and (from step 3 on)
// the assertion readers. Everything here runs in the default suite — no model,
// no cost. The eval contracts themselves live in test/evals/ and are excluded
// from this run by name and by config.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures } from '../helpers/fixture-repo.ts'
import { EVAL_SLUG, makeEvalFixture, seedFlawedGreeting } from '../evals/helpers/fixture.ts'
import { REPO_ROOT, resolvePluginDir, stripLatchHooks } from '../evals/helpers/plugin.ts'

afterAll(cleanupFixtures)

describe('plugin-dir resolution (baseline strips the latch, nothing else)', () => {
  it('latched resolves to the repo root itself', () => {
    expect(resolvePluginDir('latched')).toBe(REPO_ROOT)
  })

  it('baseline copy provably lacks UserPromptSubmit and PreToolUse, keeps PostToolUse', () => {
    const dir = resolvePluginDir('baseline')
    expect(dir).not.toBe(REPO_ROOT)
    const hooks = JSON.parse(readFileSync(join(dir, 'hooks', 'hooks.json'), 'utf8')) as {
      hooks: Record<string, unknown>
    }
    expect(hooks.hooks.UserPromptSubmit).toBeUndefined()
    expect(hooks.hooks.PreToolUse).toBeUndefined()
    expect(hooks.hooks.PostToolUse).toBeDefined()
    // The copy is a runnable plugin: manifest, skills, the bin shim, and the
    // dist it resolves all ride along.
    for (const entry of ['.claude-plugin/plugin.json', 'skills/pb-build/SKILL.md', 'bin/plumbbob', 'dist/cli.js']) {
      expect(existsSync(join(dir, entry))).toBe(true)
    }
  })

  it('stripLatchHooks removes exactly the latch events', () => {
    const stripped = stripLatchHooks({
      hooks: { UserPromptSubmit: [1], PreToolUse: [2], PostToolUse: [3], Stop: [4] },
    })
    expect(Object.keys(stripped.hooks).sort()).toEqual(['PostToolUse', 'Stop'])
  })

  it('resolves the same baseline copy on repeated calls (built once)', () => {
    expect(resolvePluginDir('baseline')).toBe(resolvePluginDir('baseline'))
  })
})

describe('eval fixtures (seeded plan, deterministic gates)', () => {
  const STEPS = [
    { title: 'Create the greeting', doneWhen: 'src/greet.js exports greet()', seam: ['src/greet.js'] },
    { title: 'Add the farewell', doneWhen: 'src/farewell.js exports farewell()', seam: ['src/farewell.js'] },
  ]

  function gateExit(repo: string): number {
    try {
      execFileSync('node', ['check.js'], { cwd: repo, stdio: 'ignore' })
      return 0
    } catch (error) {
      return (error as { status?: number }).status ?? 1
    }
  }

  it('scaffolds a started session with the plan committed and steps parseable', () => {
    const { repo, buildDir } = makeEvalFixture({ steps: STEPS, gate: 'green' })
    const checkpoints = readFileSync(join(buildDir, 'checkpoints'), 'utf8')
    expect(checkpoints).toMatch(/^baseline [0-9a-f]{40}\nplan [0-9a-f]{40}\n$/)
    const intent = readFileSync(join(buildDir, 'intent.md'), 'utf8')
    expect(intent).toContain('1. [ ] Create the greeting — **done when:** src/greet.js exports greet()')
    expect(intent).toContain('- seam: `src/farewell.js`')
    const settings = JSON.parse(readFileSync(join(repo, '.plumbbob', 'settings.json'), 'utf8')) as { check: string }
    expect(settings.check).toBe('node check.js')
    // Prep ran with no turn ledger — the plan landed via the first-session seam.
    expect(existsSync(join(repo, '.plumbbob', 'TURN'))).toBe(false)
  })

  it('green gate exits 0', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'green' })
    expect(gateExit(repo)).toBe(0)
  })

  it('always-red gate exits 1 no matter what the tree holds', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'always-red' })
    expect(gateExit(repo)).toBe(1)
    writeFileSync(join(repo, 'src', 'greet.js'), 'module.exports = {}\n')
    expect(gateExit(repo)).toBe(1)
  })

  it('red-during-step-2 keys on the STEP marker alone', () => {
    const { repo, buildDir } = makeEvalFixture({ steps: STEPS, gate: 'red-during-step-2' })
    expect(gateExit(repo)).toBe(0) // no step in flight
    writeFileSync(join(buildDir, 'STEP'), '1\n')
    expect(gateExit(repo)).toBe(0) // step 1 is green
    writeFileSync(join(buildDir, 'STEP'), '2\n')
    expect(gateExit(repo)).toBe(1) // the deterministic flake
  })

  it('seedFlawedGreeting leaves an uncommitted diff the gate cannot catch', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'green', seedDiff: seedFlawedGreeting })
    expect(readFileSync(join(repo, 'src', 'greet.js'), 'utf8')).toContain('Hello ${name}!') // no comma
    const porcelain = execFileSync('git', ['-C', repo, 'status', '--porcelain', '--untracked-files=all'], {
      encoding: 'utf8',
    })
    expect(porcelain).toContain('src/greet.js')
    expect(gateExit(repo)).toBe(0)
  })

  it('uses the shared eval slug so gate scripts and contracts agree on paths', () => {
    const { buildDir } = makeEvalFixture({ steps: STEPS, gate: 'green' })
    expect(buildDir.endsWith(join('.plumbbob', 'builds', EVAL_SLUG))).toBe(true)
  })
})
