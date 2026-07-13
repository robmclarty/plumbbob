import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { agent } from '../agent.ts'
import { checkpoint } from '../checkpoint.ts'
import { start } from '../start.ts'
import { buildFolder, buildLogPath, handoffPath, intentPath } from '../../lib/sidecar.ts'
import { localSettingsPath, settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
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

// Drop a bash fixture agent under .plumbbob/agents/<name>/ — a run.sh speaking the
// envelope and an agent.json pointing `command` at it via PLUMBBOB_AGENT_DIR (D49),
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

    // stdout carries the validated envelope and NOTHING else (D46/D47 stream discipline).
    const envelope = envelopeFromStdout(stdout)
    expect(envelope).toMatchObject({ contract: 1, status: 'done', summary: 'did the thing' })
    // the human summary rides stderr, not stdout.
    expect(stderr).toContain('agent "doer" (build) — done: did the thing')

    // the child ran at the repo root (D49) with PLUMBBOB_AGENT_DIR pointing at its own dir.
    const agentDir = join(dir, '.plumbbob', 'agents', 'doer')
    expect(realpathSync(readFileSync(join(agentDir, 'cwd.txt'), 'utf8').trim())).toBe(realpathSync(dir))

    // the composed StepContext reached the child on stdin (D59/D61).
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
    expect(stderr).toContain('agent "onlyafter" (after) —')
  })
})

describe('agent run — per-agent config (D5/D6/D7)', () => {
  it('forwards settings.json → agentConfig[name] as ctx.settings.agent', async () => {
    const dir = await startedBuild()
    writeFileSync(settingsPath(dir), JSON.stringify({ agentConfig: { doer: { provider: 'ollama', model: 'qwen3:8b' } } }))
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })

    const { code } = await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    expect(code).toBe(0)
    expect(recordedInput(dir, 'doer').settings.agent).toEqual({ provider: 'ollama', model: 'qwen3:8b' })
  })

  it('lets settings.local.json shadow the project rung whole (D7 — no deep merge)', async () => {
    const dir = await startedBuild()
    writeFileSync(settingsPath(dir), JSON.stringify({ agentConfig: { doer: { provider: 'claude_cli', model: 'sonnet' } } }))
    writeFileSync(localSettingsPath(dir), JSON.stringify({ agentConfig: { doer: { provider: 'ollama' } } }))
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })

    const { code } = await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    expect(code).toBe(0)
    // The local overlay replaces the whole agentConfig rung — `model` does NOT leak
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

describe('agent run — status routing (D52)', () => {
  it('surfaces a blocked run and its notes on stderr, exits 0 (mechanics succeeded)', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'stuck', {
      slots: ['build'],
      script: `cat >/dev/null\necho '{"contract":1,"status":"blocked","summary":"need a key","notes":"missing FOO"}'\n`,
    })
    const { code, stdout, stderr } = await captureIoAsync(() => agent(dir, ['run', 'stuck', '--step', '1']))
    expect(code).toBe(0)
    expect(envelopeFromStdout(stdout).status).toBe('blocked')
    expect(stderr).toContain('blocked — the agent')
    expect(stderr).toContain('notes: missing FOO')
  })

  it('routes a drift run to /pb-refine on stderr', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'drifter', {
      slots: ['build'],
      script: `cat >/dev/null\necho '{"contract":1,"status":"drift","summary":"plan is stale"}'\n`,
    })
    const { code, stdout, stderr } = await captureIoAsync(() => agent(dir, ['run', 'drifter', '--step', '1']))
    expect(code).toBe(0)
    expect(envelopeFromStdout(stdout).status).toBe('drift')
    expect(stderr).toContain('/pb-refine')
  })
})

describe('agent run — failure modes (D46/D51)', () => {
  it('reports and stops on a non-zero exit, applying no side effects', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'boom', { slots: ['build'], script: `cat >/dev/null\necho oops >&2\nexit 3\n` })
    const { code, stdout, stderr } = await captureIoAsync(() => agent(dir, ['run', 'boom', '--step', '1']))
    expect(code).toBe(1)
    expect(stdout).toBe('') // no envelope re-emitted for a failed child
    expect(stderr).toContain('exited 3 — failed run, stopping')
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
    expect(stderr).toContain('timed out after 1s')
  }, 15000)
})

describe('agent run — fail-loud resolution (D54)', () => {
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

describe('agent run — side effects (D44/D47)', () => {
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
    expect(stderr).toContain('parked — a stray idea')
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

    // the ledger is step-scoped: checkpointing the step clears it (D47).
    await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(existsSync(handoffPath(dir))).toBe(false)
  })
})

// The harness.json path for the started build — a sibling of intent.md.
function harnessPath(root: string): string {
  return join(buildFolder(root, SLUG), 'harness.json')
}

function writeHarness(root: string, harness: Record<string, unknown>): void {
  writeFileSync(harnessPath(root), `${JSON.stringify(harness, null, 2)}\n`)
}

describe('agent run — harness bindings (D42/D57)', () => {
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
    expect(stderr).toContain('agent "stepper" (build)')
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
    expect(stderr).toContain('agent "defaulter" (after)')
  })

  it('merges settings-level defaults under the harness — a settings default binds with no harness file (D57)', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'settingsrev', { slots: ['after'], script: DONE_SCRIPT })
    writeFileSync(settingsPath(dir), JSON.stringify({ agents: { after: ['settingsrev'] } }))

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'after']))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "settingsrev" (after)')
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

  it('downgrades a missing bound agent to a warning and carries on (D54)', async () => {
    const dir = await startedBuild()
    writeHarness(dir, { contract: 1, defaults: {}, steps: { 1: { after: ['ghostreviewer'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'after']))
    expect(code).toBe(0)
    expect(stderr).toContain('bound agent "ghostreviewer" did not resolve')
    expect(stderr).toContain('Skipping')
    expect(existsSync(handoffPath(dir))).toBe(false)
  })

  it('warns and skips a bound agent that does not declare the slot it is bound to', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'afteronly', { slots: ['after'], script: DONE_SCRIPT })
    writeHarness(dir, { contract: 1, defaults: {}, steps: { 1: { build: ['afteronly'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'build']))
    expect(code).toBe(0)
    expect(stderr).toContain('does not declare')
    expect(stderr).toContain('Skipping')
  })

  it('lets an explicit name override the bindings (D57: a name sits above the harness)', async () => {
    const dir = await startedBuild()
    makeAgent(dir, 'named', { slots: ['build'], script: DONE_SCRIPT })
    makeAgent(dir, 'bound', { slots: ['build'], script: DONE_SCRIPT })
    writeHarness(dir, { contract: 1, defaults: {}, steps: { 1: { build: ['bound'] } } })

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'named', '--step', '1', '--mode', 'build']))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "named" (build)')
    expect(stderr).not.toContain('"bound"')
  })

  it('refuses a present-but-broken harness (bad structure) loud', async () => {
    const dir = await startedBuild()
    writeFileSync(harnessPath(dir), JSON.stringify({ contract: 1, steps: [] }))

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'build']))
    expect(code).toBe(1)
    expect(stderr).toContain('"steps" must be an object')
  })

  it('refuses a harness contract major-version mismatch with an upgrade hint (D46)', async () => {
    const dir = await startedBuild()
    writeFileSync(harnessPath(dir), JSON.stringify({ contract: 2, steps: {} }))

    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1', '--mode', 'after']))
    expect(code).toBe(1)
    expect(stderr).toContain('speaks contract 2')
    expect(stderr).toContain('Upgrade')
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
