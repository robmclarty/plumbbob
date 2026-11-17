import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { agent } from '../agent.ts'
import { checkpoint } from '../checkpoint.ts'
import { start } from '../start.ts'
import { buildFolder, buildLogPath, handoffPath, intentPath } from '../../lib/sidecar.ts'
import { localSettingsPath, settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempDir, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

const SLUG = 'agent-run-test'

const INTENT = `# Agent run test

## Frame

- **Problem:** prove the verb.

## Steps

1. [ ] First — **done when:** the verb spawns.
   - seam: \`src/a.ts\`

## Decisions

- D1: spawn like check.ts — because the contract is a subprocess boundary.

## Constraints

- C1: keep the envelope minimal.
`

// A started build whose intent carries one planned step plus Decisions/Constraints
// to scrape, ready for an agent to run against step 1.
async function startedBuild(): Promise<string> {
  const dir = makeTempRepo()
  await captureIoAsync(() => start(dir, ['Agent run test', '--slug', SLUG]))
  writeFileSync(intentPath(dir), INTENT)
  return dir
}

// Drop a bash fixture agent under .plumbbob/agents/<name>/: a run.sh speaking the
// envelope and an agent.json pointing `command` at it via PLUMBBOB_AGENT_DIR,
// so the run proves the env var and the repo-root cwd at once.
function makeAgent(
  root: string,
  name: string,
  opts: { readonly slots: ReadonlyArray<string>; readonly script: string; readonly command?: string },
): void {
  const dir = join(root, '.plumbbob', 'agents', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'run.sh'), opts.script)
  writeFileSync(
    join(dir, 'agent.json'),
    `${JSON.stringify({ contract: 1, name, command: opts.command ?? 'sh "$PLUMBBOB_AGENT_DIR/run.sh"', slots: opts.slots }, null, 2)}\n`,
  )
}

// A done agent that records what it received: the stdin StepContext and its cwd,
// so the test can assert the composed input, the repo-root cwd, and PLUMBBOB_AGENT_DIR.
const DONE_SCRIPT = `#!/bin/sh
cat > "$PLUMBBOB_AGENT_DIR/last-input.json"
pwd > "$PLUMBBOB_AGENT_DIR/cwd.txt"
echo "narrating on stderr" >&2
echo '{"contract":1,"status":"done","summary":"did the thing"}'
`

function envelopeFromStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout.trim()) as Record<string, unknown>
}

// Read back the StepContext the DONE_SCRIPT agent recorded from its stdin, so a
// test can assert what plumbbob composed and forwarded (here: settings.agent).
function recordedInput(root: string, name: string) {
  return JSON.parse(readFileSync(join(root, '.plumbbob', 'agents', name, 'last-input.json'), 'utf8'))
}

describe('agent run — happy path', () => {
  it('composes the input, spawns at repo root with PLUMBBOB_AGENT_DIR, re-emits the envelope on stdout', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })

    const { code, stdout, stderr } = await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    expect(code).toBe(0)

    // stdout carries the validated envelope and NOTHING else (stream discipline:
    // stdout is the structured result, prose rides stderr).
    const envelope = envelopeFromStdout(stdout)
    expect(envelope).toMatchObject({ contract: 1, status: 'done', summary: 'did the thing' })
    // the human summary rides stderr, not stdout.
    expect(stderr).toContain('agent "doer" reports done (build slot, did the thing)')

    // the child ran at the repo root with PLUMBBOB_AGENT_DIR pointing at its own dir.
    const agentDir = join(dir, '.plumbbob', 'agents', 'doer')
    expect(realpathSync(readFileSync(join(agentDir, 'cwd.txt'), 'utf8').trim())).toBe(realpathSync(dir))

    // the composed StepContext (inline context plus the scraped Decisions/Constraints)
    // reached the child on stdin.
    const input = JSON.parse(readFileSync(join(agentDir, 'last-input.json'), 'utf8'))
    expect(input).toMatchObject({
      contract: 1,
      mode: 'build',
      build: { slug: SLUG, title: 'Agent run test' },
      step: { n: 1, seam: ['src/a.ts'] },
    })
    expect(input.decisions[0]).toContain('D1: spawn like check.ts')
    expect(input.constraints[0]).toContain('C1: keep the envelope minimal')
    expect(input.settings).toMatchObject({ auto: false, agentTimeout: 0 })
  })

  it('defaults the mode to a single-slot agent, so --mode is optional', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'onlyafter', { slots: ['after'], script: DONE_SCRIPT })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'onlyafter', '--step', '1']))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "onlyafter" reports done (after slot')
  })
})

describe('agent run — per-agent config', () => {
  it('forwards settings.json → agentConfig[name] as ctx.settings.agent', async () => {
    const dir = await startedBuild()
    writeFileSync(settingsPath(dir), JSON.stringify({ agentConfig: { doer: { provider: 'ollama', model: 'qwen3:8b' } } }))
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })

    const { code } = await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    expect(code).toBe(0)
    expect(recordedInput(dir, 'doer').settings.agent).toEqual({ provider: 'ollama', model: 'qwen3:8b' })
  })

  it('lets settings.local.json shadow the project rung whole — D57 (merge-ladder), no deep merge', async () => {
    const dir = await startedBuild()
    writeFileSync(settingsPath(dir), JSON.stringify({ agentConfig: { doer: { provider: 'claude_cli', model: 'sonnet' } } }))
    writeFileSync(localSettingsPath(dir), JSON.stringify({ agentConfig: { doer: { provider: 'ollama' } } }))
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })

    const { code } = await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    expect(code).toBe(0)
    // The local overlay replaces the whole agentConfig rung: `model` does NOT leak
    // through from the project rung; the agent's own `?? default` softens a partial.
    expect(recordedInput(dir, 'doer').settings.agent).toEqual({ provider: 'ollama' })
  })

  it('is {} when neither settings file defines the config for this agent', async () => {
    const dir = await startedBuild()
    writeFileSync(settingsPath(dir), JSON.stringify({ agentConfig: { someoneelse: { provider: 'ollama' } } }))
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })

    const { code } = await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    expect(code).toBe(0)
    expect(recordedInput(dir, 'doer').settings.agent).toEqual({})
  })
})

describe('agent run — status routing — D52 (blocked-vs-drift)', () => {
  it('surfaces a blocked run and its notes on stderr, exits 0 (mechanics succeeded)', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'stuck', {
      slots: ['build'],
      script: `cat >/dev/null\necho '{"contract":1,"status":"blocked","summary":"need a key","notes":"missing FOO"}'\n`,
    })
    const { code, stdout, stderr } = await captureIoAsync(() => agent(dir, ['run', 'stuck', '--step', '1']))
    expect(code).toBe(0)
    expect(envelopeFromStdout(stdout).status).toBe('blocked')
    expect(stderr).toContain("→ the agent couldn't finish, so unblock it and re-run")
    expect(stderr).toContain('need a key, missing FOO)') // the summary and the notes ride one parenthetical
  })

  it('routes a drift run to /plumbbob:refine on stderr', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'drifter', {
      slots: ['build'],
      script: `cat >/dev/null\necho '{"contract":1,"status":"drift","summary":"plan is stale"}'\n`,
    })
    const { code, stdout, stderr } = await captureIoAsync(() => agent(dir, ['run', 'drifter', '--step', '1']))
    expect(code).toBe(0)
    expect(envelopeFromStdout(stdout).status).toBe('drift')
    expect(stderr).toContain('/plumbbob:refine')
  })
})

describe('agent run — failure modes — D46 (stream-discipline), D51 (agent-timeout)', () => {
  it('reports and stops on a non-zero exit, applying no side effects', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'boom', { slots: ['build'], script: `cat >/dev/null\necho oops >&2\nexit 3\n` })
    const { code, stdout, stderr } = await captureIoAsync(() => agent(dir, ['run', 'boom', '--step', '1']))
    expect(code).toBe(1)
    expect(stdout).toBe('') // no envelope re-emitted for a failed child
    expect(stderr).toContain('exited 3 (a failed run, stopping, no side effects applied)')
    expect(existsSync(handoffPath(dir))).toBe(false) // no side effects
  })

  it('refuses garbage stdout as out of contract', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'garbage', { slots: ['build'], script: `cat >/dev/null\necho "this is not json"\n` })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'garbage', '--step', '1']))
    expect(code).toBe(1)
    expect(stderr).toContain('out of contract')
    expect(stderr).toContain('non-JSON')
  })

  it('refuses a contract major-version mismatch with an upgrade hint', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'newer', {
      slots: ['build'],
      script: `cat >/dev/null\necho '{"contract":2,"status":"done","summary":"from the future"}'\n`,
    })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'newer', '--step', '1']))
    expect(code).toBe(1)
    expect(stderr).toContain('speaks contract 2')
    expect(stderr).toContain('Upgrade')
  })

  it('kills the child and reports on an agentTimeout expiry', async () => {
    const dir = await startedBuild()
    writeFileSync(settingsPath(dir), JSON.stringify({ agentTimeout: 1 }))
    makeAgent(dir, 'slow', {
      slots: ['build'],
      script: `cat >/dev/null\nsleep 10\necho '{"contract":1,"status":"done","summary":"too late"}'\n`,
    })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'slow', '--step', '1']))
    expect(code).toBe(1)
    // The shell and its sleep went on the SIGTERM, so nothing was killed.
    expect(stderr).toContain('agent "slow" timed out after 1s (stopped)')
    expect(stderr).not.toContain('killed')
  }, 15000)

  it('says killed, and the grace it gave, only for an agent the SIGKILL had to end', async () => {
    const dir = await startedBuild()
    writeFileSync(settingsPath(dir), JSON.stringify({ agentTimeout: 1 }))
    makeAgent(dir, 'deaf', {
      slots: ['build'],
      script: `trap '' TERM\ncat >/dev/null\nwhile :; do sleep 0.1; done\n`,
    })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'deaf', '--step', '1']))
    expect(code).toBe(1)
    expect(stderr).toContain('agent "deaf" timed out after 1s (given 5s to stop, killed)')
  }, 30000)
})

describe('agent run — fail-loud resolution — D54 (bindings-degrade-soft)', () => {
  it('errors on an explicitly named agent that does not resolve', async () => {
    const dir = await startedBuild()
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'ghost', '--step', '1']))
    expect(code).toBe(1)
    expect(stderr).toContain('no agent named "ghost"')
  })

  it('refuses a --mode the manifest does not declare', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'afteronly', { slots: ['after'], script: DONE_SCRIPT })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'afteronly', '--step', '1', '--mode', 'build']))
    expect(code).toBe(1)
    expect(stderr).toContain("does not declare the 'build' slot")
  })

  it('refuses a --mode that is not a slot at all', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1', '--mode', 'sideways']))
    expect(code).toBe(1)
    expect(stderr).toContain("unknown --mode 'sideways'")
  })
})

describe('agent run — side effects — D44 (cli-side-effects), D47 (handoff-ledger)', () => {
  it('lands parked[] lines through the build-log Park list', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'noticer', {
      slots: ['build'],
      script: `cat >/dev/null\necho '{"contract":1,"status":"done","summary":"noticed","parked":["a stray idea","another one"]}'\n`,
    })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'noticer', '--step', '1']))
    expect(code).toBe(0)
    const log = readFileSync(buildLogPath(dir), 'utf8')
    expect(log).toContain('- [ ] a stray idea')
    expect(log).toContain('- [ ] another one')
    expect(stderr).toContain('parked: a stray idea')
  })

  it('appends each run to the handoff ledger, and checkpoint clears it', async () => {
    const dir = await startedBuild()
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })

    await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    const ledger = JSON.parse(readFileSync(handoffPath(dir), 'utf8'))
    expect(ledger).toHaveLength(2)
    expect(ledger[0]).toMatchObject({ agent: 'doer', mode: 'build', step: 1 })
    expect(ledger[0].envelope).toMatchObject({ status: 'done', summary: 'did the thing' })

    // the ledger is step-scoped: checkpointing the step clears it.
    await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(existsSync(handoffPath(dir))).toBe(false)
  })
})

// The harness.json path for the started build: a sibling of intent.md.
function harnessPath(root: string): string {
  return join(buildFolder(root, SLUG), 'harness.json')
}

function writeHarness(root: string, harness: Record<string, unknown>): void {
  writeFileSync(harnessPath(root), `${JSON.stringify(harness, null, 2)}\n`)
}

describe('agent run — harness bindings — D42 (harness-bindings), D57 (merge-ladder)', () => {
  it('runs a step-bound agent when no name is given, overriding the harness defaults', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'stepper', { slots: ['build'], script: DONE_SCRIPT })
    makeAgent(dir, 'defaulter', { slots: ['build'], script: DONE_SCRIPT })
    writeHarness(dir, {
      contract: 1,
      defaults: { build: ['defaulter'] },
      steps: { 1: { build: ['stepper'], note: 'use the sharper one here' } },
    })

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'build']))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "stepper" reports done (build slot')
    expect(stderr).not.toContain('defaulter')

    const ledger = JSON.parse(readFileSync(handoffPath(dir), 'utf8'))
    expect(ledger.map((entry: { agent: string }) => entry.agent)).toEqual(['stepper'])
  })

  it('falls back to the harness defaults for a step that does not override the slot', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'defaulter', { slots: ['after'], script: DONE_SCRIPT })
    writeHarness(dir, { contract: 1, defaults: { after: ['defaulter'] }, steps: {} })

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'after']))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "defaulter" reports done (after slot')
  })

  it('merges settings-level defaults under the harness — a settings default binds with no harness file — D57 (merge-ladder)', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'settingsrev', { slots: ['after'], script: DONE_SCRIPT })
    writeFileSync(settingsPath(dir), JSON.stringify({ agents: { after: ['settingsrev'] } }))

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'after']))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "settingsrev" reports done (after slot')
  })

  it('runs every agent bound to the slot, in order', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'first', { slots: ['before'], script: DONE_SCRIPT })
    makeAgent(dir, 'second', { slots: ['before'], script: DONE_SCRIPT })
    writeHarness(dir, { contract: 1, defaults: {}, steps: { 1: { before: ['first', 'second'] } } })

    const { code } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'before']))
    expect(code).toBe(0)
    const ledger = JSON.parse(readFileSync(handoffPath(dir), 'utf8'))
    expect(ledger.map((entry: { agent: string }) => entry.agent)).toEqual(['first', 'second'])
  })

  it('is a clean no-op when no harness file and no default binds the slot', async () => {
    const dir = await startedBuild()
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'build']))
    expect(code).toBe(0)
    expect(stderr).toContain("no agents bound to the 'build' slot")
    expect(existsSync(handoffPath(dir))).toBe(false)
  })

  it('downgrades a missing bound agent to a warning and carries on — D54 (bindings-degrade-soft)', async () => {
    const dir = await startedBuild()
    writeHarness(dir, { contract: 1, defaults: {}, steps: { 1: { after: ['ghostreviewer'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'after']))
    expect(code).toBe(0)
    expect(stderr).toContain('no agent named "ghostreviewer"')
    expect(stderr).toContain('→ skipping this binding')
    expect(existsSync(handoffPath(dir))).toBe(false)
  })

  it('warns and skips a bound agent that does not declare the slot it is bound to', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'afteronly', { slots: ['after'], script: DONE_SCRIPT })
    writeHarness(dir, { contract: 1, defaults: {}, steps: { 1: { build: ['afteronly'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'build']))
    expect(code).toBe(0)
    expect(stderr).toContain('does not declare')
    expect(stderr).toContain('→ skipping this binding')
  })

  it('lets an explicit name override the bindings — D57 (merge-ladder): a name sits above the harness', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'named', { slots: ['build'], script: DONE_SCRIPT })
    makeAgent(dir, 'bound', { slots: ['build'], script: DONE_SCRIPT })
    writeHarness(dir, { contract: 1, defaults: {}, steps: { 1: { build: ['bound'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'named', '--step', '1', '--mode', 'build']))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "named" reports done (build slot')
    expect(stderr).not.toContain('"bound"')
  })

  it('refuses a present-but-broken harness (bad structure) loud', async () => {
    const dir = await startedBuild()
    writeFileSync(harnessPath(dir), JSON.stringify({ contract: 1, steps: [] }))

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'build']))
    expect(code).toBe(1)
    expect(stderr).toContain('"steps" must be an object')
  })

  it('refuses a harness contract major-version mismatch with an upgrade hint — D46 (stream-discipline)', async () => {
    const dir = await startedBuild()
    writeFileSync(harnessPath(dir), JSON.stringify({ contract: 2, steps: {} }))

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'after']))
    expect(code).toBe(1)
    expect(stderr).toContain('speaks contract 2')
    expect(stderr).toContain('Upgrade')
  })
})

// An agent in any directory, for a tier outside the repo or a binding written as
// a path. Its manifest `name` is set apart from the directory's, so a test can
// tell which one a run was labelled by.
function makeAgentAt(dir: string, name: string, slots: ReadonlyArray<string> = ['after']): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'run.sh'), DONE_SCRIPT)
  writeFileSync(
    join(dir, 'agent.json'),
    `${JSON.stringify({ contract: 1, name, command: 'sh "$PLUMBBOB_AGENT_DIR/run.sh"', slots })}\n`,
  )
}

function ledgerAgents(root: string): ReadonlyArray<string> {
  return JSON.parse(readFileSync(handoffPath(root), 'utf8')).map((entry: { agent: string }) => entry.agent)
}

const runAfter = ['run', '--step', '1', '--mode', 'after']

// plumbbob being stopped is a signal to the process itself, so this runs the
// real CLI in a process of its own and signals that.
const CLI = fileURLToPath(new URL('../../cli.ts', import.meta.url))

describe('agent run — an interrupt ends the batch — D161 (graceful-agent-stop)', () => {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    it(`starts no later binding once ${signal} has stopped the first`, async () => {
      const dir = await startedBuild()
      makeAgent(dir, 'first', {
        slots: ['after'],
        script: `exec 2>/dev/null\ncat >/dev/null\necho up > "$PLUMBBOB_AGENT_DIR/up"\nwhile :; do sleep 0.1; done\n`,
      })
      makeAgent(dir, 'second', {
        slots: ['after'],
        script: `cat >/dev/null\necho started > "$PLUMBBOB_AGENT_DIR/started"\necho '{"contract":1,"status":"done","summary":"ran anyway"}'\n`,
      })
      makeAgent(dir, 'third', { slots: ['after'], script: DONE_SCRIPT })
      writeHarness(dir, { contract: 1, defaults: { after: ['first', 'second', 'third'] }, steps: {} })

      const cli = spawn(process.execPath, [CLI, 'agent', 'run', '--mode', 'after', '--step', '1'], {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      cli.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
      cli.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
      const closed = new Promise<number | null>((done) => cli.on('close', done))

      const up = join(dir, '.plumbbob', 'agents', 'first', 'up')
      const deadline = Date.now() + 20_000
      while (!existsSync(up) && Date.now() < deadline) {
        await new Promise((tick) => setTimeout(tick, 50))
      }
      expect(existsSync(up)).toBe(true)
      cli.kill(signal)

      expect(await closed).toBe(1)
      expect(stderr).toContain('agent "first" killed (interrupted)')
      expect(stderr).toContain('plumbbob: interrupted, so not running second, third')
      expect(stderr).not.toContain('agent "second"')
      expect(existsSync(join(dir, '.plumbbob', 'agents', 'second', 'started'))).toBe(false)
      expect(existsSync(join(dir, '.plumbbob', 'agents', 'third', 'last-input.json'))).toBe(false)
      expect(stdout).toBe('')
      expect(existsSync(handoffPath(dir))).toBe(false)
    }, 40_000)
  }

  it('says nothing more when the interrupted agent was the last one bound', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'only', {
      slots: ['after'],
      script: `exec 2>/dev/null\ncat >/dev/null\necho up > "$PLUMBBOB_AGENT_DIR/up"\nwhile :; do sleep 0.1; done\n`,
    })
    writeHarness(dir, { contract: 1, defaults: { after: ['only'] }, steps: {} })
    const cli = spawn(process.execPath, [CLI, 'agent', 'run', '--mode', 'after', '--step', '1'], {
      cwd: dir,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    cli.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    const closed = new Promise<number | null>((done) => cli.on('close', done))
    const up = join(dir, '.plumbbob', 'agents', 'only', 'up')
    const deadline = Date.now() + 20_000
    while (!existsSync(up) && Date.now() < deadline) {
      await new Promise((tick) => setTimeout(tick, 50))
    }
    expect(existsSync(up)).toBe(true)
    cli.kill('SIGTERM')

    expect(await closed).toBe(1)
    expect(stderr).toContain('agent "only" killed (interrupted)')
    expect(stderr).not.toContain('not running')
  }, 40_000)
})

describe('agent — the built-in tier — D159 (builtin-tier)', () => {
  it('agent list shows a built-in with its origin, under the project and personal ones', async () => {
    const dir = await startedBuild()
    const home = makeTempDir()
    const builtinDir = makeTempDir()
    makeAgent(dir, 'mine', { slots: ['build'], script: DONE_SCRIPT })
    makeAgentAt(join(builtinDir, 'walkthrough'), 'walkthrough')
    makeAgentAt(join(builtinDir, 'mine'), 'mine')
    writeFileSync(join(builtinDir, 'README.md'), '# Built-in agents\n')

    const { code, stdout } = await captureIoAsync(() => agent(dir, ['list'], { home, builtinDir }))
    expect(code).toBe(0)
    expect(stdout).toBe('plumbbob agents:\n  mine (project) [build]\n  walkthrough (builtin) [after]\n')
  })

  it('agent list says nothing of an empty tier', async () => {
    const dir = await startedBuild()
    const { stdout } = await captureIoAsync(() => agent(dir, ['list'], { home: makeTempDir(), builtinDir: makeTempDir() }))
    expect(stdout).toBe('plumbbob: no agents. Add one under .plumbbob/agents/<name>/ or ~/.plumbbob/agents/<name>/.\n')
  })

  it('runs a built-in by name, and by a binding, when nothing shadows it', async () => {
    const dir = await startedBuild()
    const tiers = { home: makeTempDir(), builtinDir: makeTempDir() }
    makeAgentAt(join(tiers.builtinDir, 'walkthrough'), 'walkthrough')
    writeHarness(dir, { contract: 1, defaults: { after: ['walkthrough'] } })

    const named = await captureIoAsync(() => agent(dir, ['run', 'walkthrough', '--step', '1'], tiers))
    expect(named.code).toBe(0)
    expect(named.stderr).toContain('agent "walkthrough" reports done (after slot')
    const bound = await captureIoAsync(() => agent(dir, runAfter, tiers))
    expect(bound.code).toBe(0)
    expect(ledgerAgents(dir)).toEqual(['walkthrough', 'walkthrough'])
    expect(existsSync(join(tiers.builtinDir, 'walkthrough', 'last-input.json'))).toBe(true)
  })

  it('runs the project agent in place of a built-in of the same name', async () => {
    const dir = await startedBuild()
    const tiers = { home: makeTempDir(), builtinDir: makeTempDir() }
    makeAgent(dir, 'walkthrough', { slots: ['after'], script: DONE_SCRIPT })
    makeAgentAt(join(tiers.builtinDir, 'walkthrough'), 'walkthrough')

    const { code } = await captureIoAsync(() => agent(dir, ['run', 'walkthrough', '--step', '1'], tiers))
    expect(code).toBe(0)
    expect(existsSync(join(dir, '.plumbbob', 'agents', 'walkthrough', 'last-input.json'))).toBe(true)
    expect(existsSync(join(tiers.builtinDir, 'walkthrough', 'last-input.json'))).toBe(false)
  })
})

describe('agent run — path bindings — D160 (path-bindings)', () => {
  it('runs a ./ binding from the repo root, labelled and configured by the manifest name', async () => {
    const dir = await startedBuild()
    makeAgentAt(join(dir, 'tools', 'walk'), 'walker')
    writeHarness(dir, { contract: 1, steps: { 1: { after: ['./tools/walk'] } } })
    writeFileSync(
      settingsPath(dir),
      JSON.stringify({ agentConfig: { walker: { url: 'http://localhost:3000' }, './tools/walk': { wrong: true } } }),
    )

    const { code, stdout, stderr } = await captureIoAsync(() => agent(dir, runAfter, { home: makeTempDir() }))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "walker" reports done (after slot, did the thing)')
    expect(envelopeFromStdout(stdout)).toMatchObject({ status: 'done' })
    expect(ledgerAgents(dir)).toEqual(['walker'])
    const input = JSON.parse(readFileSync(join(dir, 'tools', 'walk', 'last-input.json'), 'utf8'))
    expect(input.settings.agent).toEqual({ url: 'http://localhost:3000' })
    // cwd is still the repo root, and the agent's own directory is the path's.
    expect(realpathSync(readFileSync(join(dir, 'tools', 'walk', 'cwd.txt'), 'utf8').trim())).toBe(realpathSync(dir))
  })

  it('reads a path in the harness defaults and in the settings-level defaults alike', async () => {
    const viaHarness = await startedBuild()
    makeAgentAt(join(viaHarness, 'tools', 'walk'), 'walker')
    writeHarness(viaHarness, { contract: 1, defaults: { after: './tools/walk' } })
    expect((await captureIoAsync(() => agent(viaHarness, runAfter, { home: makeTempDir() }))).code).toBe(0)
    expect(ledgerAgents(viaHarness)).toEqual(['walker'])

    const viaSettings = await startedBuild()
    makeAgentAt(join(viaSettings, 'tools', 'walk'), 'walker')
    writeFileSync(settingsPath(viaSettings), JSON.stringify({ agents: { after: ['./tools/walk'] } }))
    expect((await captureIoAsync(() => agent(viaSettings, runAfter, { home: makeTempDir() }))).code).toBe(0)
    expect(ledgerAgents(viaSettings)).toEqual(['walker'])
  })

  it('fails loud on a missing ./ path, and still runs the bindings beside it', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'reviewer', { slots: ['after'], script: DONE_SCRIPT })
    writeHarness(dir, { contract: 1, steps: { 1: { after: ['./tools/walk', 'reviewer'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, runAfter, { home: makeTempDir() }))
    expect(code).toBe(1)
    expect(stderr).toContain('plumbbob: no agent.json at binding path ./tools/walk\n')
    expect(stderr).not.toContain('skipping this binding')
    expect(ledgerAgents(dir)).toEqual(['reviewer'])
  })

  it('fails loud on a broken ./ path', async () => {
    const dir = await startedBuild()
    mkdirSync(join(dir, 'tools', 'walk'), { recursive: true })
    writeFileSync(join(dir, 'tools', 'walk', 'agent.json'), JSON.stringify({ contract: 1, name: 'walker' }))
    writeHarness(dir, { contract: 1, steps: { 1: { after: ['./tools/walk'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, runAfter, { home: makeTempDir() }))
    expect(code).toBe(1)
    expect(stderr).toContain('needs a non-empty "command" string')
    expect(stderr).not.toContain('skipping this binding')
    expect(existsSync(handoffPath(dir))).toBe(false)
  })

  it('refuses a ../ path and a ./ path that climbs out, without running what is there', async () => {
    const dir = await startedBuild()
    // A sibling of the repo, so `..` reaches it; removed here since the temp-repo
    // sweep does not know it.
    const outside = join(dirname(dir), `${basename(dir)}-outside`)
    try {
      makeAgentAt(outside, 'walker')
      const name = basename(outside)
      for (const binding of [`../${name}`, `./tools/../../${name}`]) {
        writeHarness(dir, { contract: 1, steps: { 1: { after: [binding] } } })
        const { code, stderr } = await captureIoAsync(() => agent(dir, runAfter, { home: makeTempDir() }))
        expect(code).toBe(1)
        expect(stderr).toContain(`binding path ${binding} leaves the repo, and a relative binding must stay inside it`)
        expect(stderr).not.toContain('skipping this binding')
      }
      expect(existsSync(join(outside, 'last-input.json'))).toBe(false)
      expect(existsSync(handoffPath(dir))).toBe(false)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('refuses a ./ path a symlink carries out of the repo, without running what is there', async () => {
    const dir = await startedBuild()
    const outside = makeTempDir()
    makeAgentAt(join(outside, 'walk'), 'walker')
    symlinkSync(join(outside, 'walk'), join(dir, 'linked'))
    writeHarness(dir, { contract: 1, steps: { 1: { after: ['./linked'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, runAfter, { home: makeTempDir() }))
    expect(code).toBe(1)
    expect(stderr).toContain('binding path ./linked resolves outside the repo, and a relative binding must stay inside it')
    expect(existsSync(join(outside, 'walk', 'last-input.json'))).toBe(false)
  })

  it('runs a ~/ binding from the home directory', async () => {
    const dir = await startedBuild()
    const home = makeTempDir()
    makeAgentAt(join(home, 'agents', 'walk'), 'walker')
    writeHarness(dir, { contract: 1, steps: { 1: { after: ['~/agents/walk'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, runAfter, { home }))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "walker" reports done (after slot')
    expect(existsSync(join(home, 'agents', 'walk', 'last-input.json'))).toBe(true)
  })

  it('runs an absolute binding as written', async () => {
    const dir = await startedBuild()
    const elsewhere = makeTempDir()
    makeAgentAt(join(elsewhere, 'walk'), 'walker')
    writeHarness(dir, { contract: 1, steps: { 1: { after: [join(elsewhere, 'walk')] } } })

    const { code } = await captureIoAsync(() => agent(dir, runAfter, { home: makeTempDir() }))
    expect(code).toBe(0)
    expect(ledgerAgents(dir)).toEqual(['walker'])
  })

  it('degrades soft on a missing ~/ path and a missing absolute one — D54 (bindings-degrade-soft)', async () => {
    const dir = await startedBuild()
    const gone = join(makeTempDir(), 'walk')
    makeAgent(dir, 'reviewer', { slots: ['after'], script: DONE_SCRIPT })
    writeHarness(dir, { contract: 1, steps: { 1: { after: ['~/agents/walk', gone, 'reviewer'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, runAfter, { home: makeTempDir() }))
    expect(code).toBe(0)
    expect(stderr).toContain('no agent.json at binding path ~/agents/walk')
    expect(stderr).toContain(`no agent.json at binding path ${gone}`)
    expect(stderr.match(/→ skipping this binding/g)).toHaveLength(2)
    expect(ledgerAgents(dir)).toEqual(['reviewer'])
  })

  it('degrades soft on a broken ~/ path, as a broken ambient name does', async () => {
    const dir = await startedBuild()
    const home = makeTempDir()
    mkdirSync(join(home, 'agents', 'walk'), { recursive: true })
    writeFileSync(join(home, 'agents', 'walk', 'agent.json'), '{ not json')
    writeHarness(dir, { contract: 1, steps: { 1: { after: ['~/agents/walk'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, runAfter, { home }))
    expect(code).toBe(0)
    expect(stderr).toContain('is not valid JSON')
    expect(stderr).toContain('→ skipping this binding')
  })

  it('still warns and skips a path binding whose manifest does not declare the slot', async () => {
    const dir = await startedBuild()
    makeAgentAt(join(dir, 'tools', 'walk'), 'walker', ['build'])
    writeHarness(dir, { contract: 1, steps: { 1: { after: ['./tools/walk'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, runAfter, { home: makeTempDir() }))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "walker" does not declare the \'after\' slot')
    expect(stderr).toContain('→ skipping this binding')
  })

  it('reads a path given as an explicit name as a name, which is what --agent is for', async () => {
    const dir = await startedBuild()
    makeAgentAt(join(dir, 'tools', 'walk'), 'walker')
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', './tools/walk', '--step', '1'], { home: makeTempDir() }))
    expect(code).toBe(1)
    expect(stderr).toContain('no agent named "./tools/walk"')
  })
})

describe('agent run — guards', () => {
  it('needs an agent name', async () => {
    const dir = await startedBuild()
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1']))
    expect(code).toBe(1)
    expect(stderr).toContain('needs an agent name')
  })

  it('needs a step when none is in flight', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'doer']))
    expect(code).toBe(1)
    expect(stderr).toContain('no step to run against')
  })
})
