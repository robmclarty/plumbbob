// The step-1 spike (throwaway — deleted once its answers are recorded in the
// build log). Fires ONE real headless `claude -p` turn of `/plumbbob:pb-build`
// through fascicle's claude_cli provider against a fixture repo with this repo
// loaded as the plugin, then reads the ledgers mechanically. Its job is to
// answer the five spike unknowns, not to be pretty.
//
// Run: node test/evals/spike.ts   (assumes `pnpm build` has run — bin/plumbbob
// shells node ../dist/cli.js)

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { create_engine } from 'fascicle'
import { makeFixtureRepo, runCli } from '../helpers/fixture-repo.ts'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const MODEL = process.env.PLUMBBOB_EVAL_MODEL ?? 'sonnet'

const read = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const git = (dir: string, args: string[]): string =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

// --- fixture: 2 green steps, deterministic gate, plan committed -------------

function makeSpikeFixture(): string {
  const repo = makeFixtureRepo()
  runCli(repo, ['start', 'Spike greeting', '--slug', 'spike'])
  const build = join(repo, '.plumbbob', 'builds', 'spike')

  writeFileSync(join(repo, 'check.js'), 'process.exit(0)\n')
  writeFileSync(join(repo, '.plumbbob', 'settings.json'), `${JSON.stringify({ check: 'node check.js' }, null, 2)}\n`)
  writeFileSync(
    join(build, 'intent.md'),
    [
      '# Spike greeting',
      '',
      '## Frame',
      '',
      '- **Problem:** the repo has no greeting module.',
      '- **Done looks like:** src/greet.js exports greet().',
      '',
      '## Steps',
      '',
      '1. [ ] Create the greeting module — **done when:** src/greet.js exports greet(name) returning `Hello, <name>!`',
      '   - seam: `src/greet.js`',
      '2. [ ] Add the farewell — **done when:** src/farewell.js exports farewell(name)',
      '   - seam: `src/farewell.js`',
      '',
    ].join('\n'),
  )
  mkdirSync(join(repo, 'src'), { recursive: true })
  git(repo, ['add', '-A'])
  git(repo, ['commit', '-q', '-m', 'fixture: gate + scaffold'])
  runCli(repo, ['checkpoint', '--plan'])
  return repo
}

// --- the probe ---------------------------------------------------------------

const repo = makeSpikeFixture()
const build = join(repo, '.plumbbob', 'builds', 'spike')
const t0 = {
  checkpoints: read(join(build, 'checkpoints')) ?? '',
  head: git(repo, ['rev-parse', 'HEAD']),
  count: git(repo, ['rev-list', '--count', 'HEAD']),
}
console.log(`fixture: ${repo}`)
console.log(`t0 checkpoints:\n${t0.checkpoints}`)

// fascicle 0.8.16 BUG (found by this spike): run_cli hardcodes
// `provider_config: {}` when building the argv (dist/index.js ~line 3232), so
// the typed `plugin_dirs`/`setting_sources` provider-config fields are silently
// dropped. The workaround is to ride every plugin flag through `extra_args`,
// which does flow (call_opts). Drop this once fascicle threads the real
// provider config.
const engine = create_engine({
  providers: {
    claude_cli: {
      default_cwd: repo,
      auth_mode: 'auto',
    },
  },
})

const PLUGIN_ARGS = ['--plugin-dir', REPO_ROOT, '--setting-sources', 'project,local']

const EXTRA_ARGS = [
  ...PLUGIN_ARGS,
  '--permission-mode',
  'acceptEdits',
  '--allowedTools',
  'Read,Edit,Write,Grep,Glob,Bash(plumbbob:*),Bash(node check.js:*),Bash(git diff:*),Bash(git status:*),Bash(git log:*),Bash(git add:*),Bash(git commit:*)',
  '--max-turns',
  '50',
]

function report(label: string, value: unknown): void {
  console.log(`  ${label}: ${JSON.stringify(value)}`)
}

try {
  // Turn 1 — the real contract-1 probe.
  const started = Date.now()
  const result = await engine.generate({
    model: MODEL,
    provider: 'claude_cli',
    prompt: '/plumbbob:pb-build',
    provider_options: { claude_cli: { extra_args: EXTRA_ARGS } },
  })
  const durationMs = Date.now() - started

  console.log('\n=== turn 1 (/plumbbob:pb-build) ===')
  report('finish_reason', result.finish_reason)
  report('duration_ms', durationMs)
  report('usage', result.usage)
  report('cost', result.cost ?? null)
  report('provider_reported keys', Object.keys(result.provider_reported ?? {}))
  console.log(`--- final content (first 800 chars) ---\n${String(result.content).slice(0, 800)}\n---`)

  // Mechanical reads.
  const turn = read(join(repo, '.plumbbob', 'TURN'))?.trim() ?? null
  const grant = read(join(repo, '.plumbbob', 'GRANT'))?.trim() ?? null
  const tick = read(join(build, 'TICK'))?.trim() ?? null
  const step = read(join(build, 'STEP'))?.trim() ?? null
  const checkpoints = read(join(build, 'checkpoints')) ?? ''
  const intent = read(join(build, 'intent.md')) ?? ''
  const porcelain = git(repo, ['status', '--porcelain'])
  const count = git(repo, ['rev-list', '--count', 'HEAD'])

  console.log('\n=== spike answers ===')
  report('1. hook fired (TURN, expect "1")', turn)
  report('1b. GRANT after bare pb-build (expect null)', grant)
  report('2. skill expanded (STEP written by build, expect "1" or null-if-checkpoint-refused-then-cleared)', step)
  report('2b. TICK stamped (expect same as TURN)', tick)
  report('3. plumbbob on PATH (STEP/TICK existing implies yes)', step !== null || tick !== null)
  report('4. seam edits landed (porcelain)', porcelain.split('\n').filter(Boolean))
  report('contract-1: checkpoints unchanged', checkpoints === t0.checkpoints)
  report('contract-1: commit count unchanged', count === t0.count)
  report('contract-1: box 1 still [ ]', /1\. \[ \]/.test(intent))

  const pass =
    checkpoints === t0.checkpoints && count === t0.count && /1\. \[ \]/.test(intent) && porcelain.length > 0
  console.log(`\nSPIKE CONTRACT-1 VERDICT: ${pass ? 'PASS (paused)' : 'FAIL or INVALID — inspect above'}`)

  // Turn 2 — cheap control probe for grant minting via the typed range form.
  // --max-turns 1 cuts the agentic loop after one model step; the hook still
  // ticks by session end, which is all this probe needs. Exhausting max-turns
  // makes the CLI exit 1 (a spike finding), so the generate() throw is expected
  // — the ledger reads after it are the actual probe.
  console.log('\n=== turn 2 control (/plumbbob:pb-build 1-2, --max-turns 1) ===')
  try {
    const control = await engine.generate({
      model: MODEL,
      provider: 'claude_cli',
      prompt: '/plumbbob:pb-build 1-2',
      provider_options: {
        claude_cli: {
          extra_args: [
            ...PLUGIN_ARGS,
            '--permission-mode',
            'acceptEdits',
            '--allowedTools',
            'Read',
            '--max-turns',
            '1',
          ],
        },
      },
    })
    report('finish_reason', control.finish_reason)
  } catch {
    report('control turn threw (expected: max-turns exhaustion exits 1)', true)
  }
  report('TURN after control (expect "2")', read(join(repo, '.plumbbob', 'TURN'))?.trim() ?? null)
  report('GRANT after control (expect "range 2")', read(join(repo, '.plumbbob', 'GRANT'))?.trim() ?? null)
} catch (error) {
  console.error('\n=== claude_cli error (this shape defines the retry predicate) ===')
  console.error(error)
  process.exitCode = 1
} finally {
  await engine.dispose?.()
}
