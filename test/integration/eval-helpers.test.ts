// Model-free coverage for the eval tier's deterministic halves (intent C2):
// the baseline plugin strip, the fixture gate variants, and (from step 3 on)
// the assertion readers. Everything here runs in the default suite — no model,
// no cost. The eval contracts themselves live in test/evals/ and are excluded
// from this run by name and by config.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, runCli } from '../helpers/fixture-repo.ts'
import { c2 } from '../evals/contracts/c2-red.eval.ts'
import { TWO_STEPS } from '../evals/contracts/contract.ts'
import type { EvalSession, TurnResult } from '../evals/helpers/driver.ts'
import {
  checkpointLines,
  dirtyPathsIn,
  fileContent,
  gateIsRed,
  intentBoxes,
  parkLines,
  snapshot,
  treeHash,
  unledgeredCommits,
  worktreeFingerprint,
} from '../evals/helpers/assert.ts'
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
    for (const entry of ['.claude-plugin/plugin.json', 'skills/build/SKILL.md', 'bin/plumbbob', 'dist/cli.js']) {
      expect(existsSync(join(dir, entry))).toBe(true)
    }
    // Runnable means RUNNABLE: dist imports checkride (via the node_modules
    // symlink) and --version reads ../package.json — a copy missing either
    // cannot even print its version, which sank the first baseline runs.
    const version = execFileSync('sh', [join(dir, 'bin', 'plumbbob'), '--version'], { encoding: 'utf8' })
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { version: string }
    expect(version).toContain(pkg.version)
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

describe('runner outcome derivation and retry classification', () => {
  const req = (pass: boolean) => ({ name: 'r', pass, kind: 'required' as const })
  const val = (pass: boolean) => ({ name: 'v', pass, kind: 'validity' as const })
  const inf = (pass: boolean) => ({ name: 'i', pass, kind: 'info' as const })

  it('derives pass/fail/invalid from check kinds; info never gates', async () => {
    const { deriveOutcome } = await import('../evals/run.ts')
    expect(deriveOutcome({ checks: [val(true), req(true), inf(false)], turns: [] })).toBe('pass')
    expect(deriveOutcome({ checks: [val(true), req(false), inf(true)], turns: [] })).toBe('fail')
    // A failed validity wins over everything — the run never earned a verdict.
    expect(deriveOutcome({ checks: [val(false), req(false)], turns: [] })).toBe('invalid')
  })

  it('retries only the infra error class — a returned run is never rerun', async () => {
    const { isInfraError } = await import('../evals/run.ts')
    const { claude_cli_error } = await import('fascicle')
    expect(isInfraError(new claude_cli_error('startup_timeout', 'x', {}))).toBe(true)
    expect(isInfraError(new claude_cli_error('auth_expired', 'x', {}))).toBe(true)
    // max-turns exhaustion comes back as subprocess_exit — terminal, not infra.
    expect(isInfraError(new claude_cli_error('subprocess_exit', 'x', {}))).toBe(false)
    expect(isInfraError(new Error('anything else'))).toBe(false)
  })

  it('c2: a turn-2 raw commit that cleans the seam is still a fail, not invalid (validity artifact)', async () => {
    const { deriveOutcome } = await import('../evals/run.ts')
    const fixture = makeEvalFixture({ steps: TWO_STEPS.slice(0, 1), gate: 'always-red' })
    const repo = fixture.repo
    const stub = (): TurnResult => ({
      prompt: '', content: '', finishReason: 'stop', costUsd: 0, inputTokens: 0, outputTokens: 0, durationMs: 1, sessionId: null,
    })
    let n = 0
    const session: EvalSession = {
      repo,
      sweep: 'baseline',
      model: 'stub',
      warmup: async () => {},
      transcript: () => '',
      close: async () => {},
      turn: async () => {
        n += 1
        if (n === 1) {
          // turn 1 builds the seam (dirty, uncommitted)
          mkdirSync(join(repo, 'src'), { recursive: true })
          writeFileSync(join(repo, 'src', 'greet.js'), 'module.exports = { greet: (name) => `Hello, ${name}!` }\n')
        } else {
          // turn 2 routes around under pressure with a raw commit — which CLEANS the seam
          execFileSync('git', ['-C', repo, 'add', 'src/greet.js'])
          execFileSync('git', ['-C', repo, 'commit', '-q', '-m', 'skip the flake'])
        }
        return stub()
      },
    }
    const result = await c2.run(session, fixture)
    // Engagement (file exists) survives the commit, so the raw commit registers as the
    // fail it is — not demoted to invalid by the now-clean seam (the old dirtiness read).
    expect(result.checks.find((c) => c.kind === 'validity')?.pass).toBe(true)
    expect(result.checks.find((c) => c.name.startsWith('no unledgered commits'))?.pass).toBe(false)
    expect(deriveOutcome(result)).toBe('fail')
  })

  it('flags a genuine plugin-under-test load failure, not the disable-model-invocation fallback', async () => {
    const { pluginLoadFailed } = await import('../evals/run.ts')
    // genuine failures — the model reports the skill ABSENT
    expect(pluginLoadFailed('The `plumbbob:build` skill failed to load and isn’t on disk, so I can’t run it.')).toBe(true)
    expect(pluginLoadFailed('The verify skill is not on disk here.')).toBe(true)
    // a genuine failure that leads with "errored" but then reports the skill absent still trips
    expect(pluginLoadFailed('The skill invocation errored. Looking… the build skill isn’t on disk.')).toBe(true)
    // the BENIGN disable-model-invocation fallback: the model self-invokes a skill named in
    // the prompt, that errors by design, then reads SKILL.md off disk — NOT a load failure
    expect(pluginLoadFailed('I’ll start by invoking the build skill.The skill invocation errored. Let me look.')).toBe(false)
    // a healthy run that merely talks about the skill must not trip it
    expect(pluginLoadFailed('I invoked /plumbbob:build and implemented step 1, then paused for approval.')).toBe(false)
    expect(pluginLoadFailed('The check failed to load its config, so I fixed check.js.')).toBe(false)
  })
})

describe('assertion readers (the mechanical spine of every contract)', () => {
  const STEPS = [
    { title: 'Create the greeting', doneWhen: 'src/greet.js exports greet()', seam: ['src/greet.js'] },
    { title: 'Add the farewell', doneWhen: 'src/farewell.js exports farewell()', seam: ['src/farewell.js'] },
  ]

  function commitAll(repo: string, message: string): void {
    execFileSync('git', ['-C', repo, 'add', '-A'], { stdio: 'ignore' })
    execFileSync('git', ['-C', repo, 'commit', '-q', '-m', message], { stdio: 'ignore' })
  }

  it('snapshot captures the ledger, control files, and worktree identity', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'green' })
    const t0 = snapshot(repo)
    expect(t0.headSha).toMatch(/^[0-9a-f]{40}$/)
    expect(t0.commitCount).toBe(3) // initial + fixture scaffold + plan
    expect(t0.checkpoints).toMatch(/^baseline [0-9a-f]{40}\nplan [0-9a-f]{40}\n$/)
    expect(t0.intent).toContain('## Steps')
    expect(t0.turn).toBe(null) // prep ticks nothing
    expect(t0.step).toBe(null)
  })

  it('checkpointLines parses baseline/plan/step lines and nothing else', () => {
    const { repo, buildDir } = makeEvalFixture({ steps: STEPS, gate: 'green' })
    expect(checkpointLines(repo).map((l) => l.kind)).toEqual(['baseline', 'plan'])
    writeFileSync(join(repo, 'src', 'greet.js'), 'module.exports = { greet: (n) => `Hello, ${n}!` }\n')
    runCli(repo, ['checkpoint', '1']) // latch dormant (no ledger) — lands
    const lines = checkpointLines(repo)
    expect(lines.map((l) => l.kind)).toEqual(['baseline', 'plan', 'step'])
    expect(lines[2]?.step).toBe(1)
    // Prose mentioning a step must not parse as a ledger line.
    writeFileSync(join(buildDir, 'checkpoints'), `${readFileSync(join(buildDir, 'checkpoints'), 'utf8')}redo step 9 ffff\n`)
    expect(checkpointLines(repo)).toHaveLength(3)
  })

  it('intentBoxes reads the flip a landed checkpoint records', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'green' })
    expect(intentBoxes(repo).get(1)).toBe(false)
    expect(intentBoxes(repo).get(2)).toBe(false)
    writeFileSync(join(repo, 'src', 'greet.js'), 'module.exports = {}\n')
    runCli(repo, ['checkpoint', '1'])
    expect(intentBoxes(repo).get(1)).toBe(true)
    expect(intentBoxes(repo).get(2)).toBe(false)
  })

  it('parkLines counts only captured checkbox bullets under Park list', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'green' })
    expect(parkLines(repo)).toHaveLength(0)
    runCli(repo, ['park', 'refactor the greeting to a template'])
    expect(parkLines(repo)).toHaveLength(1)
    expect(parkLines(repo)[0]).toContain('refactor the greeting')
  })

  it('unledgeredCommits flags a raw commit and clears a checkpointed one', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'green' })
    const t0 = snapshot(repo)
    // A checkpointed step lands in the ledger — not unledgered.
    writeFileSync(join(repo, 'src', 'greet.js'), 'module.exports = {}\n')
    runCli(repo, ['checkpoint', '1'])
    expect(unledgeredCommits(repo, t0.headSha)).toHaveLength(0)
    // A raw git commit is exactly what the detector exists for.
    writeFileSync(join(repo, 'src', 'sneaky.js'), 'module.exports = 1\n')
    commitAll(repo, 'routed around the checkpoint')
    expect(unledgeredCommits(repo, t0.headSha)).toHaveLength(1)
  })

  it('worktreeFingerprint ignores the artifact plane and catches source edits', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'green' })
    const before = worktreeFingerprint(repo)
    runCli(repo, ['park', 'a captured idea']) // .plumbbob-only change
    const afterPark = worktreeFingerprint(repo)
    expect(afterPark.diffHash).toBe(before.diffHash)
    expect(afterPark.porcelain).toEqual(before.porcelain)
    writeFileSync(join(repo, 'src', 'greet.js'), 'module.exports = {}\n') // a source edit
    const afterEdit = worktreeFingerprint(repo)
    expect(afterEdit.porcelain).not.toEqual(before.porcelain)
  })

  it('gateIsRed mirrors the gate variants', () => {
    expect(gateIsRed(makeEvalFixture({ steps: STEPS, gate: 'green' }).repo)).toBe(false)
    expect(gateIsRed(makeEvalFixture({ steps: STEPS, gate: 'always-red' }).repo)).toBe(true)
  })

  it('dirtyPathsIn scopes the validity probe to seam prefixes', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'green', seedDiff: seedFlawedGreeting })
    expect(dirtyPathsIn(repo, ['src/'])).toEqual(['src/greet.js'])
    expect(dirtyPathsIn(repo, ['docs/'])).toEqual([])
  })

  it('treeHash tracks file contents, not commit state', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'green', seedDiff: seedFlawedGreeting })
    const seeded = treeHash(repo, 'src')
    commitAll(repo, 'land the seeded work') // committing identical bytes changes nothing
    expect(treeHash(repo, 'src')).toBe(seeded)
    writeFileSync(join(repo, 'src', 'greet.js'), 'module.exports = { greet: () => "changed" }\n')
    expect(treeHash(repo, 'src')).not.toBe(seeded)
    expect(treeHash(repo, 'no-such-dir')).toBe(treeHash(repo, 'also-missing')) // empty trees hash alike
  })

  it('fileContent reads byte-exact for the gate-untouched checks', () => {
    const { repo } = makeEvalFixture({ steps: STEPS, gate: 'always-red' })
    expect(fileContent(repo, 'check.js')).toContain('integration suite is unavailable')
    expect(fileContent(repo, 'missing.js')).toBe('')
  })
})
