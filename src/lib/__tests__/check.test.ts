import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { RunOptions, RunResult, Summary, SummaryCheck } from 'checkride'
import { runCheck } from '../check.ts'
import type { CheckFlags } from '../check.ts'
import { sidecarDir } from '../sidecar.ts'
import { settingsPath, localSettingsPath } from '../settings.ts'
import { cleanupTempRepos, makeTempDir } from '../../../test/helpers/temp-repo.ts'
import { captureIoAsync } from '../../../test/helpers/capture-io.ts'

afterAll(cleanupTempRepos)

// Point the check at a shell stub. A real gate would recurse into vitest (D14),
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

// A checkride.config.json whose only active check is a custom `node -e` stub —
// built-in slots all skip (no tools in a bare tmp dir), so the stub alone
// decides green/red without spawning any real adapter (D14).
function writeCheckrideStub(root: string, exitCode: number): void {
  const config = {
    checks: { stub: { command: 'node', args: ['-e', `process.exit(${exitCode})`] } },
  }
  writeFileSync(join(root, 'checkride.config.json'), JSON.stringify(config))
}

describe('runCheck (spawn override, D24)', () => {
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

  // Each narrowing flag alone must trip the warning — hasFlags is a disjunction,
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

describe('runCheck (checkride, D32)', () => {
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
    return { ok: true, summary, exitCode: 0 }
  }

  it('maps absent flags to checkride defaults: false booleans, null slot lists', async () => {
    const dir = makeTempDir()
    const { runCheck: run, calls } = await loadWithRunChecksReturning(greenResult())
    expect(await run(dir)).toBe(0)
    expect(calls).toEqual([
      { cwd: dir, bail: false, changed: false, all: false, only: null, skip: null, include: null },
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
      { cwd: dir, bail: true, changed: true, all: true, only: ['types'], skip: ['lint'], include: ['docs'] },
    ])
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
    const { runCheck: run } = await loadWithRunChecksReturning({ ok: false, summary, exitCode: 1 })
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
