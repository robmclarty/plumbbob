import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { agent } from '../agent.ts'
import { checkpoint } from '../checkpoint.ts'
import { start } from '../start.ts'
import { buildLogPath, handoffPath, intentPath } from '../../lib/sidecar.ts'
import { settingsPath } from '../../lib/settings.ts'
import { cleanupTempRepos, makeTempRepo } from '../../../test/helpers/temp-repo.ts'
import { captureIo, captureIoAsync } from '../../../test/helpers/capture-io.ts'

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
function startedBuild(): string {
  const dir = makeTempRepo()
  captureIo(() => start(dir, ['Agent run test', '--slug', SLUG]))
  writeFileSync(intentPath(dir), INTENT)
  return dir
}

// Drop a bash fixture agent under .plumbbob/agents/<name>/ — a run.sh speaking the
// envelope and an agent.json pointing `command` at it via PLUMBBOB_AGENT_DIR (D18),
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

describe('agent run — happy path', () => {
  it('composes the input, spawns at repo root with PLUMBBOB_AGENT_DIR, re-emits the envelope on stdout', async () => {
    const dir = startedBuild()
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })

    const { code, stdout, stderr } = await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    expect(code).toBe(0)

    // stdout carries the validated envelope and NOTHING else (D8/D20 stream discipline).
    const envelope = envelopeFromStdout(stdout)
    expect(envelope).toMatchObject({ contract: 1, status: 'done', summary: 'did the thing' })
    // the human summary rides stderr, not stdout.
    expect(stderr).toContain('agent "doer" (build) — done: did the thing')

    // the child ran at the repo root (D18) with PLUMBBOB_AGENT_DIR pointing at its own dir.
    const agentDir = join(dir, '.plumbbob', 'agents', 'doer')
    expect(realpathSync(readFileSync(join(agentDir, 'cwd.txt'), 'utf8').trim())).toBe(realpathSync(dir))

    // the composed StepContext reached the child on stdin (D15/D23).
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
    const dir = startedBuild()
    makeAgent(dir, 'onlyafter', { slots: ['after'], script: DONE_SCRIPT })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'onlyafter', '--step', '1']))
    expect(code).toBe(0)
    expect(stderr).toContain('agent "onlyafter" (after) —')
  })
})

describe('agent run — status routing (D24)', () => {
  it('surfaces a blocked run and its notes on stderr, exits 0 (mechanics succeeded)', async () => {
    const dir = startedBuild()
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
    const dir = startedBuild()
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

describe('agent run — failure modes (D8/D17)', () => {
  it('reports and stops on a non-zero exit, applying no side effects', async () => {
    const dir = startedBuild()
    makeAgent(dir, 'boom', { slots: ['build'], script: `cat >/dev/null\necho oops >&2\nexit 3\n` })
    const { code, stdout, stderr } = await captureIoAsync(() => agent(dir, ['run', 'boom', '--step', '1']))
    expect(code).toBe(1)
    expect(stdout).toBe('') // no envelope re-emitted for a failed child
    expect(stderr).toContain('exited 3 — failed run, stopping')
    expect(existsSync(handoffPath(dir))).toBe(false) // no side effects
  })

  it('refuses garbage stdout as out of contract', async () => {
    const dir = startedBuild()
    makeAgent(dir, 'garbage', { slots: ['build'], script: `cat >/dev/null\necho "this is not json"\n` })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'garbage', '--step', '1']))
    expect(code).toBe(1)
    expect(stderr).toContain('out of contract')
    expect(stderr).toContain('non-JSON')
  })

  it('refuses a contract major-version mismatch with an upgrade hint', async () => {
    const dir = startedBuild()
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
    const dir = startedBuild()
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

describe('agent run — fail-loud resolution (D21)', () => {
  it('errors on an explicitly named agent that does not resolve', async () => {
    const dir = startedBuild()
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'ghost', '--step', '1']))
    expect(code).toBe(1)
    expect(stderr).toContain('no agent named "ghost"')
  })

  it('refuses a --mode the manifest does not declare', async () => {
    const dir = startedBuild()
    makeAgent(dir, 'afteronly', { slots: ['after'], script: DONE_SCRIPT })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'afteronly', '--step', '1', '--mode', 'build']))
    expect(code).toBe(1)
    expect(stderr).toContain("does not declare the 'build' slot")
  })

  it('refuses a --mode that is not a slot at all', async () => {
    const dir = startedBuild()
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1', '--mode', 'sideways']))
    expect(code).toBe(1)
    expect(stderr).toContain("unknown --mode 'sideways'")
  })
})

describe('agent run — side effects (D6/D20)', () => {
  it('lands parked[] lines through the build-log Park list', async () => {
    const dir = startedBuild()
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
    const dir = startedBuild()
    writeFileSync(settingsPath(dir), JSON.stringify({ check: 'true' }))
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })

    await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    await captureIoAsync(() => agent(dir, ['run', 'doer', '--step', '1']))
    const ledger = JSON.parse(readFileSync(handoffPath(dir), 'utf8'))
    expect(ledger).toHaveLength(2)
    expect(ledger[0]).toMatchObject({ agent: 'doer', mode: 'build', step: 1 })
    expect(ledger[0].envelope).toMatchObject({ status: 'done', summary: 'did the thing' })

    // the ledger is step-scoped: checkpointing the step clears it (D20).
    await captureIoAsync(() => checkpoint(dir, ['1']))
    expect(existsSync(handoffPath(dir))).toBe(false)
  })
})

describe('agent run — guards', () => {
  it('needs an agent name', async () => {
    const dir = startedBuild()
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', '--step', '1']))
    expect(code).toBe(1)
    expect(stderr).toContain('needs an agent name')
  })

  it('needs a step when none is in flight', async () => {
    const dir = startedBuild()
    makeAgent(dir, 'doer', { slots: ['build'], script: DONE_SCRIPT })
    const { code, stderr } = await captureIoAsync(() => agent(dir, ['run', 'doer']))
    expect(code).toBe(1)
    expect(stderr).toContain('no step to run against')
  })
})
