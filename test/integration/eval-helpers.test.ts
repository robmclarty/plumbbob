// Model-free coverage for the eval tier's deterministic halves:
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
import { c8 } from '../evals/contracts/c8-legible.eval.ts'
import { TWO_STEPS } from '../evals/contracts/contract.ts'
import type { EvalSession, TurnResult } from '../evals/helpers/driver.ts'
import {
  bareRefs,
  bulletLabel,
  checkpointLines,
  dirtyPathsIn,
  fileContent,
  gateIsRed,
  hasTemplatePlaceholder,
  intentBoxes,
  intentSectionBullets,
  parkLines,
  snapshot,
  treeHash,
  unledgeredCommits,
  worktreeFingerprint,
} from '../evals/helpers/assert.ts'
import {
  anatomyChecks,
  endingRenders,
  forbiddenParts,
  hasCheckRow,
  missingParts,
  partsInOrder,
  readAnatomy,
  shapeDetail,
  tailAfterRule,
  tierParts,
  transitionLabel,
} from '../evals/helpers/anatomy.ts'
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
    for (const entry of [
      '.claude-plugin/plugin.json',
      'skills/build/SKILL.md',
      'bin/plumbbob',
      'dist/cli.js',
      'templates/intent.md', // `start` scaffolds from it — a copy without it cannot open a session
    ]) {
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

// The readers behind contract 8: they measure the glossed-reference form the
// template and the plan skill teach, so they have to read exactly the shapes a
// model actually writes — wrapped bullets, sub-bullets, scaffold leftovers.
describe('legibility readers (contract 8)', () => {
  function writeIntent(repo: string, body: string): void {
    writeFileSync(join(repo, '.plumbbob', 'builds', EVAL_SLUG, 'intent.md'), body)
  }

  it('intentSectionBullets joins wrapped lines, skips sub-bullets, stops at the next heading', () => {
    const { repo } = makeEvalFixture({ steps: [], gate: 'green', intent: 'template' })
    writeIntent(
      repo,
      [
        '# T',
        '',
        '## Decisions',
        '',
        '- D1 (sliding-window): a sliding window over fixed buckets — *because* it is',
        '  fair at the window edge',
        '- D2 (in-memory-map): an in-memory Map',
        '',
        '## Steps',
        '',
        '1. [ ] feat: do it — **done when:** it works',
        '   - seam: `src/limit.js`',
        '',
      ].join('\n'),
    )
    const decisions = intentSectionBullets(repo, 'Decisions')
    expect(decisions).toHaveLength(2)
    expect(decisions[0]).toBe(
      'D1 (sliding-window): a sliding window over fixed buckets — *because* it is fair at the window edge',
    )
    expect(decisions[1]).toBe('D2 (in-memory-map): an in-memory Map')
    // The Steps section's `- seam:` sub-bullet belongs to its step, not the scrape.
    expect(intentSectionBullets(repo, 'Steps')).toEqual([])
  })

  it('intentSectionBullets reads no bullets from an absent or renamed heading', () => {
    const { repo } = makeEvalFixture({ steps: [], gate: 'green', intent: 'template' })
    writeIntent(repo, '# T\n\n## Decisions & Constraints\n\n- D1 (merged): both at once\n')
    expect(intentSectionBullets(repo, 'Decisions')).toEqual([])
    expect(intentSectionBullets(repo, 'Constraints')).toEqual([])
  })

  it('bulletLabel separates a glossed opener from a bare one', () => {
    expect(bulletLabel('D4 (default-waves): ship it off')).toEqual({ letter: 'D', n: 4, slug: 'default-waves' })
    expect(bulletLabel('C1 (no-new-deps): nothing new')).toEqual({ letter: 'C', n: 1, slug: 'no-new-deps' })
    expect(bulletLabel('Q2 (retry-cap): how many?')).toEqual({ letter: 'Q', n: 2, slug: 'retry-cap' })
    // The finding: a bare opener parses, with a null slug.
    expect(bulletLabel('D4: ship it off')).toEqual({ letter: 'D', n: 4, slug: null })
    // Not the house shape: camelCase, a missing colon, or an unlabelled bullet.
    expect(bulletLabel('D4 (defaultWaves): ship it')).toEqual({ letter: 'D', n: 4, slug: null })
    expect(bulletLabel('D4 (default-waves) — ship it')).toBe(null)
    expect(bulletLabel('Decision 4: ship it')).toBe(null)
    // An em-dash body never confuses the head parse.
    expect(bulletLabel('D9 (a-b): x — *because* y')?.slug).toBe('a-b')
  })

  it('reads the anchored, bolded opener templates/intent.md actually teaches', () => {
    // The form a live sweep authored, which the pre-anchor readers scored as no
    // decision at all — every bullet unlabelled, so a perfect plan came back
    // `invalid`. Anchor and bold are both optional, so the older bare form still
    // parses beside it.
    expect(bulletLabel('<a id="d1"></a>**D1 (sliding-window)**: a sliding window, *because* it is fair')).toEqual({
      letter: 'D',
      n: 1,
      slug: 'sliding-window',
    })
    expect(bulletLabel('**C1 (no-new-deps)**: no new dependencies')).toEqual({ letter: 'C', n: 1, slug: 'no-new-deps' })
    expect(bulletLabel('C2 (markdown-only): it reads as plain text')).toEqual({ letter: 'C', n: 2, slug: 'markdown-only' })
    // Anchored but unglossed is still the finding the required check reports.
    expect(bulletLabel('<a id="d5"></a>**D5**: no slug here')).toEqual({ letter: 'D', n: 5, slug: null })
    // The anchor is markup the author is told to keep, not a placeholder left behind.
    expect(hasTemplatePlaceholder('<a id="d1"></a>**D1 (sliding-window)**: a sliding window')).toBe(false)
    expect(hasTemplatePlaceholder('<a id="d1"></a>**D1 (slug-here)**: <decision>')).toBe(true)
    // And an anchored opener is an opener, not a reference site that dropped its gloss.
    expect(bareRefs('- <a id="d2"></a>**D2**: text\nsee D4 for why')).toEqual(['D4'])
  })

  it('hasTemplatePlaceholder catches the scaffold survivors', () => {
    expect(hasTemplatePlaceholder('D1 (slug-here): <decision> — *because* <the one reason>')).toBe(true)
    expect(hasTemplatePlaceholder('C1 (no-new-deps): <e.g. functional only>')).toBe(true)
    expect(hasTemplatePlaceholder('D1 (in-memory-map): an in-memory Map — *because* one instance')).toBe(false)
  })

  it('hasTemplatePlaceholder ignores angle brackets inside code spans (live false positive)', () => {
    // Both of these are real bullets an opus sweep authored; the first read of
    // this check called them placeholders because generics and comparisons use
    // the same brackets the scaffold does.
    expect(
      hasTemplatePlaceholder('D2 (in-memory-map): state is a plain `Map<callerId, number[]>` of timestamps'),
    ).toBe(false)
    expect(hasTemplatePlaceholder('D8 (strict-eviction): eviction drops `t <= now - WINDOW_MS`, so keys stay bounded')).toBe(
      false,
    )
  })

  it('bareRefs flags reference sites that dropped the gloss, not the openers', () => {
    const text = [
      '- D1 (sliding-window): the window',
      '- D2: no gloss here', // an opener, not a reference site
      'The step honors D1 (sliding-window) and D2 alike.',
      'It also revisits C3 later.',
    ].join('\n')
    expect(bareRefs(text)).toEqual(['D2', 'C3'])
  })

  it('bareRefs leaves ranges alone — a range cannot carry a per-item gloss', () => {
    // `D1–D9` is the compressed form the project's own docs use (README's
    // D64–D66); flagging it as decay was a live false positive.
    expect(bareRefs('   - model: sonnet — fully specified by the done-when and D1–D9')).toEqual([])
    expect(bareRefs('the API is specified by D5—D11 and nothing else')).toEqual([])
    expect(bareRefs('see D5-D11 for the shape')).toEqual([])
    // A range next to a genuine bare reference still surfaces the bare one.
    expect(bareRefs('D1–D9 settled it, but C4 stands alone')).toEqual(['C4'])
  })

  it('the template fixture keeps the real scaffold and skips the plan commit', () => {
    const { repo, buildDir } = makeEvalFixture({ steps: [], gate: 'green', intent: 'template' })
    const intent = readFileSync(join(buildDir, 'intent.md'), 'utf8')
    // The genuine templates/intent.md landed — placeholders and all.
    expect(intent).toContain('slug-here')
    expect(intent).toContain('## Decisions')
    expect(intent).toContain('## Constraints')
    // No plan was authored, so none is claimed in the ledger.
    expect(readFileSync(join(buildDir, 'checkpoints'), 'utf8')).toMatch(/^baseline [0-9a-f]{40}\n$/)
    // The gate still rides along, so the measured turn has nothing to fix.
    expect(existsSync(join(repo, 'check.js'))).toBe(true)
  })
})

// Contract 8's own logic, driven by a stub session (no model, no cost): the
// same shape the c2 artifact test uses. Each case pins one outcome the live
// sweep would otherwise have to teach us the expensive way.
describe('c8 legible-intent outcomes (stub session)', () => {
  const stubTurn = (): TurnResult => ({
    prompt: '',
    content: '',
    finishReason: 'stop',
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 1,
    sessionId: null,
  })

  function sessionWriting(repo: string, body: string | null): EvalSession {
    return {
      repo,
      sweep: 'baseline',
      model: 'stub',
      warmup: async () => {},
      transcript: () => '',
      close: async () => {},
      turn: async () => {
        if (body !== null) writeFileSync(join(repo, '.plumbbob', 'builds', EVAL_SLUG, 'intent.md'), body)
        return stubTurn()
      },
    }
  }

  function intentDoc(decisions: ReadonlyArray<string>, constraints: ReadonlyArray<string>): string {
    return [
      '# Greeting rate limiter',
      '',
      '## Frame',
      '',
      '- **Problem:** the greeting service has no throttle.',
      '',
      '## Decisions',
      '',
      ...decisions.map((d) => `- ${d}`),
      '',
      '## Constraints',
      '',
      ...constraints.map((c) => `- ${c}`),
      '',
      '## Steps',
      '',
      '1. [ ] feat(limit): add the sliding window — **done when:** node check.js passes',
      '   - seam: `src/limit.js`',
      '',
    ].join('\n')
  }

  const GOOD_DECISIONS = [
    'D1 (sliding-window): a sliding window over fixed buckets — *because* it is fair at the edge',
    'D2 (in-memory-map): an in-memory Map over any store — *because* it stays dependency-free',
    'D3 (pure-function-api): a pure function over a class — *because* callers hold the state',
  ]
  const GOOD_CONSTRAINTS = [
    'C1 (no-new-deps): no new dependencies',
    'C2 (single-module): src/limit.js is the only new source file',
  ]

  it('a fully glossed intent passes', async () => {
    const { deriveOutcome } = await import('../evals/run.ts')
    const fixture = c8.makeFixture()
    const session = sessionWriting(fixture.repo, intentDoc(GOOD_DECISIONS, GOOD_CONSTRAINTS))
    const result = await c8.run(session, fixture)
    expect(result.checks.filter((c) => c.kind !== 'info' && !c.pass)).toEqual([])
    expect(deriveOutcome(result)).toBe('pass')
  })

  it('bare D1:/C1: openers fail the required gloss checks, and say which', async () => {
    const { deriveOutcome } = await import('../evals/run.ts')
    const fixture = c8.makeFixture()
    const session = sessionWriting(
      fixture.repo,
      intentDoc(
        ['D1: a sliding window — *because* it is fair at the edge', 'D2: an in-memory Map'],
        ['C1: no new dependencies'],
      ),
    )
    const result = await c8.run(session, fixture)
    // It engaged and authored real items — the failure is the FORM, not the effort.
    expect(result.checks.filter((c) => c.kind === 'validity').every((c) => c.pass)).toBe(true)
    expect(result.checks.find((c) => c.name.startsWith('every Decisions bullet'))?.pass).toBe(false)
    expect(result.checks.find((c) => c.name.startsWith('every Constraints bullet'))?.pass).toBe(false)
    expect(deriveOutcome(result)).toBe('fail')
  })

  it('an untouched template is invalid, never a vacuous pass', async () => {
    const { deriveOutcome } = await import('../evals/run.ts')
    const fixture = c8.makeFixture()
    // The scaffold's own `- D1 (slug-here): <decision>` is perfect house style,
    // so the gloss checks pass on it — validity is what refuses the free win.
    const result = await c8.run(sessionWriting(fixture.repo, null), fixture)
    expect(result.checks.find((c) => c.name.startsWith('it engaged'))?.pass).toBe(false)
    expect(deriveOutcome(result)).toBe('invalid')
  })

  it('a leftover scaffold bullet beside authored ones is a fail, not invalid', async () => {
    const { deriveOutcome } = await import('../evals/run.ts')
    const fixture = c8.makeFixture()
    const session = sessionWriting(
      fixture.repo,
      intentDoc(['D1 (slug-here): <decision> — *because* <the one reason that mattered>', ...GOOD_DECISIONS], GOOD_CONSTRAINTS),
    )
    const result = await c8.run(session, fixture)
    expect(result.checks.filter((c) => c.kind === 'validity').every((c) => c.pass)).toBe(true)
    expect(result.checks.find((c) => c.name.startsWith('no template placeholders'))?.pass).toBe(false)
    expect(deriveOutcome(result)).toBe('fail')
  })
})

// The anatomy reader (step 18), anchored on the shipped renderer rather than on
// a hand-typed copy of it: each tier is driven out of a real fixture through the
// real CLI, then read back. A reader pinned to a transcription would keep
// passing after handoff moved; this one cannot.
describe('turn-anatomy readers (the shape every ending is measured against)', () => {
  function pausedFixture(): string {
    const { repo } = makeEvalFixture({ steps: TWO_STEPS, gate: 'green' })
    runCli(repo, ['build', '1'])
    writeFileSync(
      join(repo, 'src', 'greet.js'),
      ['function greet(name) {', '  return `Hello, ${name}!`', '}', '', 'module.exports = { greet }', ''].join('\n'),
    )
    mkdirSync(join(repo, '.check'), { recursive: true })
    writeFileSync(
      join(repo, '.check', 'summary.json'),
      JSON.stringify({ schema_version: 1, ok: true, checks_run: 1, total_duration_ms: 1200, checks: [{ name: 'check', ok: true }] }),
    )
    writeFileSync(
      join(repo, '.plumbbob', 'detail.md'),
      [
        '# Detail · Step 1 · Create the greeting module',
        '',
        '── recap · step 1 of 2 ──',
        'done-when    met',
        'decisions    1 of 1 honored',
        'constraints  all honored',
        '',
        '## Summary',
        '',
        'greet() returns the comma-carrying greeting the done-when names.',
        '',
        '## 1 src/greet.js exports greet(name)',
        '',
        'The whole story.',
        '',
        '## Recommendation',
        '',
        'Approve it. The gate is green and the seam held.',
        '',
      ].join('\n'),
    )
    return repo
  }

  it('reads the shipped pause as a whole decision ending', () => {
    const { stdout } = runCli(pausedFixture(), ['handoff'])
    const a = readAnatomy(stdout)
    expect(a.labels).toEqual(tierParts('decision'))
    expect(a.trailingLabels).toEqual(a.labels)
    expect(hasCheckRow(a)).toBe(true)
    expect(a.moves).toHaveLength(4)
    expect(a.highlights).toHaveLength(1)
    expect(a.endsOn).toBe('Recommendation')
    expect(a.strays).toEqual([])
    expect(a.nestedFence).toBe(false)
    expect(endingRenders(a, 'decision')).toBe(true)
    expect(shapeDetail(a, 'decision')).toBe('')
  })

  it('reads a transition as a driver ending, which owes no Verdict', () => {
    const { stdout } = runCli(pausedFixture(), ['park', 'should farewell get the same shape? (tangent)'])
    const a = readAnatomy(stdout)
    expect(transitionLabel(a)).toBe('Parked')
    expect(endingRenders(a, 'driver')).toBe(true)
    expect(a.strays).toEqual([])
    // The pause's own parts would all be unexpected here.
    expect(forbiddenParts(readAnatomy(runCli(pausedFixture(), ['handoff']).stdout), 'driver')).toEqual([
      'Your Call',
      'Verdict',
      'Readout',
      'Recommendation',
    ])
  })

  it('cuts the plan pause to the tail under the seam rule, past the framed plan', () => {
    const { stdout } = runCli(pausedFixture(), ['handoff', '--plan'])
    const framed = ['Here is the plan, three steps and two constraints.', '', '1. Build the greeting.', stdout].join('\n')
    // Read whole, the model's own plan above the rule is a stray; cut to the
    // tail, the block stands alone — which is why the plan tier reads the tail.
    expect(readAnatomy(framed).strays).not.toEqual([])
    const a = readAnatomy(tailAfterRule(framed))
    expect(a.labels).toEqual(tierParts('plan'))
    expect(a.strays).toEqual([])
    expect(a.endsOn).toBe('Recommendation')
    expect(endingRenders(a, 'plan')).toBe(true)
  })

  it('catches a turn that says more after the relay, and one that nests the fence', () => {
    const { stdout } = runCli(pausedFixture(), ['handoff'])
    const chatty = `${stdout}\nLet me know if you want me to proceed with step 2!`
    expect(readAnatomy(chatty).strays).toEqual(['Let me know if you want me to proceed with step 2!'])
    expect(readAnatomy(chatty).endsOn).toBeNull()
    expect(anatomyChecks(chatty, 'decision').find((c) => c.name.endsWith('after the relay'))?.pass).toBe(false)
    const wrapped = ['````markdown', stdout, '````'].join('\n')
    expect(readAnatomy(wrapped).nestedFence).toBe(true)
  })

  it('reads the ending out of the driver\u2019s accumulated prose, preamble and all', () => {
    // What fascicle actually hands a contract: every text part of the session
    // concatenated, so the step's narration arrives glued to the relay with no
    // newline between them. The ending still has to read whole.
    const { stdout } = runCli(pausedFixture(), ['handoff'])
    const accumulated = `I'll start by checking the current state.Now let me build it.${stdout}`
    const a = readAnatomy(accumulated)
    expect(a.strays).toEqual(["I'll start by checking the current state.Now let me build it."])
    expect(a.trailingLabels).toEqual(tierParts('decision'))
    expect(endingRenders(a, 'decision')).toBe(true)
    // The preamble is before the relay, not after it, so the positional rule holds.
    expect(anatomyChecks(accumulated, 'decision').every((c) => c.pass)).toBe(true)
  })

  it('reports a Verdict folded without a measured check as a missing check row', () => {
    // The live sweep's first finding: a pause whose readout carried no `check`
    // row still printed a Plumb Verdict. The row is the gate verdict's one home,
    // so its absence is the probe, not a footnote.
    const noGate = [
      '**Summary**: it built. (details: `.plumbbob/detail.md`)',
      '',
      '**Readout**: Step 1 - First',
      '',
      '```text',
      'done-when    met',
      'spent        26s',
      '```',
      '',
      '**Verdict**: ● Plumb',
      '',
      '**Next Up**: Step 2 of 2 - Second',
      '',
      '**Your Call**:',
      '',
      '- `revert` → I wind the work back to the last checkpoint',
      '',
      '**Recommendation**: Approve it.',
      '',
    ].join('\n')
    const a = readAnatomy(noGate)
    expect(endingRenders(a, 'decision')).toBe(true)
    expect(hasCheckRow(a)).toBe(false)
    const gateProbe = anatomyChecks(noGate, 'decision').find((c) => c.name.endsWith('check row'))
    expect(gateProbe?.pass).toBe(false)
    expect(gateProbe?.detail).toBe('done-when, spent')
  })

  it('names what a partial or reordered ending is missing rather than just failing it', () => {
    const short = ['**Summary**: it built.', '', '**Verdict**: ● Plumb', ''].join('\n')
    expect(missingParts(readAnatomy(short), 'decision')).toEqual(['Readout', 'Next Up', 'Your Call', 'Recommendation'])
    expect(shapeDetail(readAnatomy(short), 'decision')).toBe('missing: Readout, Next Up, Your Call, Recommendation')

    const swapped = ['**Verdict**: ● Plumb', '', '**Next Up**: Step 2 of 2 - Second', ''].join('\n')
    expect(partsInOrder(readAnatomy(swapped), 'boundary')).toBe(true)
    const backwards = ['**Next Up**: Step 2 of 2 - Second', '', '**Verdict**: ● Plumb', ''].join('\n')
    expect(partsInOrder(readAnatomy(backwards), 'boundary')).toBe(false)
    expect(shapeDetail(readAnatomy(backwards), 'boundary')).toBe('out of order: Next Up > Verdict')
  })

  it('keeps the advisory and its remedy inside the ending, not outside it', () => {
    const boundary = [
      '**Checkpoint**: Step 16 complete (f2b83e17c)',
      '',
      '**Verdict**: ◐ A hair off (staged outside the seam)',
      '',
      'Staged paths reach outside Step 16’s seam ⚠ (test/integration/spike.test.ts)',
      '  → the checkpoint captures them, so revise the plan with /plumbbob:step',
      '',
      '**Next Up**: Step 17 of 18 - Third (details: `x/intent.md:9`)',
      '',
    ].join('\n')
    const a = readAnatomy(boundary)
    expect(a.advisories).toHaveLength(1)
    expect(a.strays).toEqual([])
    expect(endingRenders(a, 'boundary')).toBe(true)
    expect(transitionLabel(a)).toBe('Checkpoint')
  })

  it('folds the probes a contract reads a turn through, every one informational', () => {
    const { stdout } = runCli(pausedFixture(), ['handoff'])
    const checks = anatomyChecks(stdout, 'decision')
    expect(checks.every((c) => c.kind === 'info')).toBe(true)
    expect(checks.every((c) => c.pass)).toBe(true)
    expect(checks.map((c) => c.name)).toEqual([
      'anatomy: decision ending renders whole',
      'anatomy: the gate verdict rides the check row',
      'anatomy: recommendation is the last text',
      'anatomy: nothing after the relay',
    ])
    // A driver turn owes no readout and no recommendation, so it is read
    // through two probes, not four.
    expect(anatomyChecks(stdout, 'driver').map((c) => c.name)).toEqual([
      'anatomy: driver ending renders whole',
      'anatomy: nothing after the relay',
    ])
  })
})
