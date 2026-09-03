import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { DoctorCheck, RunOptions, RunResult, Summary, SummaryCheck } from 'checkride'
import { detectGate, gateDetectsTools, runCheck } from '../check.ts'
import type { CheckFlags } from '../check.ts'
import { sidecarDir } from '../sidecar.ts'
import { settingsPath, localSettingsPath } from '../settings.ts'
import { cleanupTempRepos, makeTempDir } from '../../../test/helpers/temp-repo.ts'
import { captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Point the check at a shell stub. A real gate would recurse into vitest,
// so these cover the spawn-override path; the checkride path below uses custom
// checks (a bare `node -e` command) so no real tool ever runs.
function writeSettings(root: string, check: string): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(settingsPath(root), JSON.stringify({ check }))
}

function writeLocalSettings(root: string, check: string): void {
  mkdirSync(sidecarDir(root), { recursive: true })
  writeFileSync(localSettingsPath(root), JSON.stringify({ check }))
}

// A checkride.config.json whose only active check is a custom `node -e` stub:
// built-in slots all skip (no tools in a bare tmp dir), so the stub alone
// decides green/red without spawning any real adapter.
function writeCheckrideStub(root: string, exitCode: number): void {
  const config = {
    checks: { stub: { command: 'node', args: ['-e', `process.exit(${exitCode})`] } },
  }
  writeFileSync(join(root, 'checkride.config.json'), JSON.stringify(config))
}

describe('runCheck (spawn override) — D24 (configurable-check)', () => {
  it('returns 0 when the settings check passes', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'true')
    expect(await runCheck(dir)).toBe(0)
  })

  it('returns non-zero when the settings check fails', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'false')
    expect(await runCheck(dir)).toBe(1)
  })

  it('propagates the check command exit code', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'exit 3')
    expect(await runCheck(dir)).toBe(3)
  })

  it('leaves a one-check summary and the captured output under .check/, so the pause can measure an override gate', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'echo hello from the gate && exit 3')
    const { code, stdout } = await captureIoAsync(() => runCheck(dir))
    expect(code).toBe(3)
    expect(stdout).toContain('hello from the gate') // still streamed to the terminal
    const summary = JSON.parse(readFileSync(join(dir, '.check', 'summary.json'), 'utf8')) as Summary
    expect(summary.ok).toBe(false)
    expect(summary.checks_run).toBe(1)
    expect(summary.checks).toHaveLength(1)
    expect(summary.checks[0]).toMatchObject({
      name: 'echo hello from the gate && exit 3',
      adapter: null,
      ok: false,
      exit_code: 3,
      output_file: 'check.stdout.txt',
    })
    expect(readFileSync(join(dir, '.check', 'check.stdout.txt'), 'utf8')).toContain('hello from the gate')
  })

  it('records a green override as one check run, so the readout reads green: 1 of 1 checks', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'true')
    expect(await runCheck(dir)).toBe(0)
    const summary = JSON.parse(readFileSync(join(dir, '.check', 'summary.json'), 'utf8')) as Summary
    expect(summary.ok).toBe(true)
    expect(summary.checks_run).toBe(1)
    expect(summary.checks[0]).toMatchObject({ name: 'true', ok: true, exit_code: 0 })
  })

  it('cuts a long command to the name budget with an ellipsis, keeping the full command in the description', async () => {
    const dir = makeTempDir()
    const long = 'true # a configured check command far longer than the forty-column name budget'
    writeSettings(dir, long)
    expect(await runCheck(dir)).toBe(0)
    const summary = JSON.parse(readFileSync(join(dir, '.check', 'summary.json'), 'utf8')) as Summary
    expect(summary.checks[0]?.name).toBe(`${long.slice(0, 39)}…`)
    expect(summary.checks[0]?.description).toContain(long)
  })

  it('lets settings.local.json override settings.json', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'false')
    writeLocalSettings(dir, 'true')
    expect(await runCheck(dir)).toBe(0)
  })

  it('lets the CLI flag override both files', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'false')
    writeLocalSettings(dir, 'false')
    expect(await runCheck(dir, {}, 'true')).toBe(0)
  })

  it('warns and ignores narrowing flags — an opaque command has no slots', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'true')
    const { code, stderr } = await captureIoAsync(() => runCheck(dir, { bail: true, only: ['types'] }))
    expect(code).toBe(0)
    expect(stderr).toContain('ignored for the configured command')
  })

  it('stays silent when no narrowing flags are passed', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'true')
    const { code, stderr } = await captureIoAsync(() => runCheck(dir))
    expect(code).toBe(0)
    expect(stderr).toBe('')
  })

  // Each narrowing flag alone must trip the warning: hasFlags is a disjunction,
  // and only one-flag-at-a-time runs pin every clause.
  const singleFlagCases: ReadonlyArray<[string, CheckFlags]> = [
    ['bail', { bail: true }],
    ['changed', { changed: true }],
    ['all', { all: true }],
    ['only', { only: ['types'] }],
    ['skip', { skip: ['lint'] }],
    ['include', { include: ['docs'] }],
  ]
  for (const [name, flags] of singleFlagCases) {
    it(`warns when ${name} alone is passed`, async () => {
      const dir = makeTempDir()
      writeSettings(dir, 'true')
      const { code, stderr } = await captureIoAsync(() => runCheck(dir, flags))
      expect(code).toBe(0)
      expect(stderr).toContain('ignored for the configured command')
    })
  }
})

describe('runCheck — D32 (checkride-gate)', () => {
  it('returns 0 when the checkride run is green — and reports no failing slots', async () => {
    const dir = makeTempDir()
    writeCheckrideStub(dir, 0)
    const { code, stderr } = await captureIoAsync(() => runCheck(dir))
    expect(code).toBe(0)
    expect(stderr).not.toContain('failing slots')
  })

  it('returns 1 and names the failing slot with its raw-output pointer', async () => {
    const dir = makeTempDir()
    writeCheckrideStub(dir, 1)
    const { code, stderr } = await captureIoAsync(() => runCheck(dir))
    expect(code).toBe(1)
    expect(stderr).toContain('failing slots')
    expect(stderr).toContain('stub')
    expect(stderr).toContain('.check/summary.json')
  })

  it('returns 2 when the harness itself breaks (malformed config)', async () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'checkride.config.json'), '{not json')
    const { code, stderr } = await captureIoAsync(() => runCheck(dir))
    expect(code).toBe(2)
    expect(stderr).toContain('the check gate itself failed')
    // The remedy line: fix the config or route the gate through another command.
    expect(stderr).toContain(
      'Fix checkride.config.json, or set the "check" key in .plumbbob/settings.json to gate through another command.',
    )
  })

  it('refuses an all-slots-skipped run instead of a vacuous green', async () => {
    const dir = makeTempDir()
    const { code, stderr } = await captureIoAsync(() => runCheck(dir))
    expect(code).toBe(1)
    expect(stderr).toContain('found nothing to check')
    // The remedy lines: make checkride see something, or reroute the gate.
    expect(stderr).toContain('Add tool configs (tsconfig, vitest, …) or a checkride.config.json custom check,')
    expect(stderr).toContain('or set the "check" key in .plumbbob/settings.json to gate through another command.')
  })

  it('honors narrowing flags — --skip on the stub empties the run into a refusal', async () => {
    const dir = makeTempDir()
    writeCheckrideStub(dir, 1)
    const { code, stderr } = await captureIoAsync(() => runCheck(dir, { skip: ['stub'] }))
    expect(code).toBe(1)
    expect(stderr).toContain('found nothing to check')
  })
})

// The CheckFlags → RunFlags mapping and the failing-slots report are contracts
// with checkride, so here `runChecks` itself is swapped for a recorder: the
// exact RunFlags object passed and the report rendered from a crafted Summary
// are the assertions. `vi.doMock` + a fresh dynamic import keeps the mock out
// of the real-checkride describes above.
describe('runCheck (checkride seam, mocked runChecks)', () => {
  afterEach(() => {
    vi.doUnmock('checkride')
    vi.resetModules()
  })

  function summaryCheck(overrides: Partial<SummaryCheck> & { name: string }): SummaryCheck {
    return {
      adapter: null,
      description: '',
      ok: true,
      exit_code: 0,
      duration_ms: 0,
      output_file: null,
      ...overrides,
    }
  }

  function summaryOf(checks: SummaryCheck[]): Summary {
    return {
      schema_version: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      ok: checks.every((c) => c.ok),
      checks_run: checks.filter((c) => c.skipped !== true).length, // skipped entries excluded, per the contract
      total_duration_ms: 0,
      checks,
    }
  }

  async function loadWithRunChecksReturning(
    result: RunResult,
  ): Promise<{ runCheck: typeof runCheck; calls: RunOptions[] }> {
    vi.resetModules()
    const calls: RunOptions[] = []
    vi.doMock('checkride', () => ({
      runChecks: async (options: RunOptions): Promise<RunResult> => {
        calls.push(options)
        return result
      },
    }))
    const mod = await import('../check.ts')
    return { runCheck: mod.runCheck, calls }
  }

  const greenResult = (): RunResult => {
    const summary = summaryOf([summaryCheck({ name: 'stub' })])
    return { ok: true, summary, exitCode: 0, runs: [] }
  }

  it('maps absent flags to checkride defaults: false booleans, null slot lists', async () => {
    const dir = makeTempDir()
    const { runCheck: run, calls } = await loadWithRunChecksReturning(greenResult())
    expect(await run(dir)).toBe(0)
    expect(calls).toEqual([
      { cwd: dir, bail: false, changed: false, all: false, only: null, skip: null, include: null, strict: true },
    ])
  })

  it('maps every populated flag through 1:1', async () => {
    const dir = makeTempDir()
    const { runCheck: run, calls } = await loadWithRunChecksReturning(greenResult())
    const flags: CheckFlags = {
      bail: true,
      changed: true,
      all: true,
      only: ['types'],
      skip: ['lint'],
      include: ['docs'],
    }
    expect(await run(dir, flags)).toBe(0)
    expect(calls).toEqual([
      { cwd: dir, bail: true, changed: true, all: true, only: ['types'], skip: ['lint'], include: ['docs'], strict: true },
    ])
  })

  // `strict` is not a CheckFlag; it is plumbbob's standing posture on the
  // gate, so no flag combination may turn it off.
  it('always runs strict — the vacuous green is refused however the run was narrowed', async () => {
    const dir = makeTempDir()
    const { runCheck: run, calls } = await loadWithRunChecksReturning(greenResult())
    expect(await run(dir, { skip: ['test'] })).toBe(0)
    expect(calls[0]?.strict).toBe(true)
  })

  it('reports only the failing slots, with adapter names and raw-output pointers', async () => {
    const dir = makeTempDir()
    const summary = summaryOf([
      // Failing with an adapter and a preferred output file → both rendered.
      summaryCheck({ name: 'types', adapter: 'tsc', ok: false, exit_code: 2, output_file: 'types.tsc.json' }),
      // Failing custom check → no adapter suffix, stdout-capture fallback.
      summaryCheck({ name: 'stub', ok: false, exit_code: 1 }),
      // Passing and skipped slots must stay out of the report.
      summaryCheck({ name: 'lint', adapter: 'eslint' }),
      summaryCheck({ name: 'docs', skipped: true }),
    ])
    const { runCheck: run } = await loadWithRunChecksReturning({ ok: false, summary, exitCode: 1, runs: [] })
    const { code, stderr } = await captureIoAsync(() => run(dir))
    expect(code).toBe(1)
    expect(stderr).toContain(
      'plumbbob: failing slots:\n' +
        '  ✘ types (tsc) — raw output: .check/types.tsc.json\n' +
        '  ✘ stub — raw output: .check/stub.stdout.txt\n' +
        '  Full report: .check/summary.json\n',
    )
    expect(stderr).not.toContain('✘ lint')
    expect(stderr).not.toContain('✘ docs')
  })
})

describe('detectGate (the plan-time probe, research/07 Build 2a)', () => {
  // Synthetic DoctorCheck rows: only the fields the rule reads matter.
  const row = (partial: Partial<DoctorCheck>): DoctorCheck =>
    ({ category: 'tool', name: 'types', adapter: null, status: 'skip', required: false, ...partial }) as DoctorCheck

  it('gateDetectsTools: a code-slot adapter counts; the always-on family alone does not', () => {
    expect(gateDetectsTools([row({ name: 'types', adapter: 'tsc' })])).toBe(true)
    // The always-on repo checks (present even for an empty directory) prove
    // nothing about the code; a gate of only these is the silent version of
    // the week-1 bounce.
    expect(
      gateDetectsTools([
        row({ name: 'links (links)', adapter: 'links' }),
        row({ name: 'pnpm-audit (security)', adapter: 'pnpm-audit' }),
        row({ name: 'publint (publint)', adapter: 'publint' }),
        row({ name: 'attw (attw)', adapter: 'attw' }),
        // checkride 0.10.2's additions: `build` resolves off scripts.build, and
        // the snippets slot gained a second adapter an explicit `use` can pick.
        row({ name: 'build (build)', adapter: 'build' }),
        row({ name: 'pack (pack)', adapter: 'pack' }),
        row({ name: 'smoke (smoke)', adapter: 'smoke' }),
        row({ name: 'snippets (snippets)', adapter: 'snippets' }),
        row({ name: 'snippets (snippets-dist)', adapter: 'snippets-dist' }),
      ]),
    ).toBe(false)
    expect(gateDetectsTools([row({ name: 'types', adapter: null })])).toBe(false)
    // Non-tool categories (env checks) never count as a gate.
    expect(gateDetectsTools([row({ category: 'env', name: 'node', adapter: 'node' })])).toBe(false)
    expect(gateDetectsTools([])).toBe(false)
  })

  it('a configured check answers without running detection', async () => {
    const dir = makeTempDir()
    writeSettings(dir, 'npm test')
    expect(await detectGate(dir)).toEqual({ configured: 'npm test', detected: true })
  })

  it('a bare repo detects nothing', async () => {
    const dir = makeTempDir()
    expect(await detectGate(dir)).toEqual({ configured: null, detected: false })
  })

  it('a repo with a detectable tool config reads as detected, tool installed or not', async () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'tsconfig.json'), '{}\n')
    expect(await detectGate(dir)).toEqual({ configured: null, detected: true })
  })
})
