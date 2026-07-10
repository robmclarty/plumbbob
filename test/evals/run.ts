// The eval runner (intent D1/D5): plain node, never vitest — the output unit
// is a pass RATE plus a cost ledger, and `pnpm test` must be structurally
// unable to reach this. Sequential runs (deterministic, rate-limit-friendly).
//
//   node test/evals/run.ts --sweep latched [--contract c1] [--n 5] [--model opus]
//   node test/evals/run.ts --report [--date YYYY-MM-DD]
//
// Outcomes per run: pass (validity holds, every required check passes), fail
// (validity holds, a required check fails), invalid (a validity precondition
// failed, or the run never produced a verdict — counted against the rate,
// itemized). Behavioral results are never retried; infra errors retry once,
// stamped. Every run appends one JSONL line to reports/evals/.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { claude_cli_error, provider_auth_error } from 'fascicle'
import { cleanupFixtures } from '../helpers/fixture-repo.ts'
import { CONTRACTS } from './contracts/index.ts'
import type { Contract, ContractResult } from './contracts/contract.ts'
import { EVAL_MODEL, EVAL_N, openSession } from './helpers/driver.ts'
import type { Sweep } from './helpers/plugin.ts'
import { appendRun, renderReport, REPORTS_DIR, stamps } from './helpers/report.ts'

export type Outcome = 'pass' | 'fail' | 'invalid'

export type RunRecord = {
  readonly contract: string
  readonly run: number
  readonly sweep: Sweep
  readonly model: string
  readonly outcome: Outcome
  readonly result: ContractResult | null
  readonly error: string | null
  readonly durationMs: number
  readonly repo: string
  readonly infraRetries: number
}

export function deriveOutcome(result: ContractResult): Outcome {
  if (result.checks.some((c) => c.kind === 'validity' && !c.pass)) return 'invalid'
  return result.checks.some((c) => c.kind === 'required' && !c.pass) ? 'fail' : 'pass'
}

// The whole retry policy, in one reviewable function, keyed on error CLASS
// alone (intent D5). Infra = the session machinery failed before a behavioral
// verdict could exist: the CLI binary/auth/startup/stall family, or our own
// wall-clock abort. Everything else — including `subprocess_exit`, which is
// how a model that exhausts --max-turns comes back — is a terminal `invalid`:
// rerunning a run that returned is p-hacking.
export function isInfraError(error: unknown): boolean {
  if (error instanceof provider_auth_error) return true
  if (error instanceof claude_cli_error) {
    return ['binary_not_found', 'auth_missing', 'auth_expired', 'api_key_missing', 'startup_timeout', 'stall_timeout', 'engine_disposed'].includes(
      error.reason,
    )
  }
  // AbortSignal.timeout fires a DOMException named TimeoutError.
  return error instanceof Error && error.name === 'TimeoutError'
}

async function attempt(contract: Contract, sweep: Sweep, model: string, run: number, infraRetries: number): Promise<RunRecord> {
  const started = Date.now()
  const fixture = contract.makeFixture()
  const session = await openSession({ repo: fixture.repo, sweep, model })
  try {
    await session.warmup()
    const result = await contract.run(session, fixture)
    return {
      contract: contract.id,
      run,
      sweep,
      model,
      outcome: deriveOutcome(result),
      result,
      error: null,
      durationMs: Date.now() - started,
      repo: fixture.repo,
      infraRetries,
    }
  } catch (error) {
    if (isInfraError(error)) throw error // the caller owns the one retry
    // A session that returned abnormally (max-turns exit, schema trouble) is
    // not a behavioral verdict — terminal `invalid`, never retried.
    return {
      contract: contract.id,
      run,
      sweep,
      model,
      outcome: 'invalid',
      result: null,
      error: String(error),
      durationMs: Date.now() - started,
      repo: fixture.repo,
      infraRetries,
    }
  } finally {
    await session.close()
  }
}

export async function runOnce(contract: Contract, sweep: Sweep, model: string, run: number): Promise<RunRecord> {
  try {
    return await attempt(contract, sweep, model, run, 0)
  } catch (error) {
    process.stderr.write(`  infra error, retrying once: ${String(error).split('\n')[0] ?? ''}\n`)
    try {
      return await attempt(contract, sweep, model, run, 1)
    } catch (secondError) {
      return {
        contract: contract.id,
        run,
        sweep,
        model,
        outcome: 'invalid',
        result: null,
        error: String(secondError),
        durationMs: 0,
        repo: '(fixture discarded — session never ran)',
        infraRetries: 1,
      }
    }
  }
}

function toLedgerLine(record: RunRecord, date: string): unknown {
  const s = stamps()
  return {
    contract: record.contract,
    title: CONTRACTS.find((c) => c.id === record.contract)?.title ?? record.contract,
    run: record.run,
    sweep: record.sweep,
    model: record.model,
    date,
    recordedAt: new Date().toISOString(),
    outcome: record.outcome,
    checks: record.result?.checks ?? [],
    turns: (record.result?.turns ?? []).map((t) => ({
      prompt: t.prompt,
      finishReason: t.finishReason,
      costUsd: t.costUsd,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      durationMs: t.durationMs,
      sessionId: t.sessionId,
      // The final text rides along so string probes are auditable later; capped
      // so a chatty run cannot bloat the ledger.
      contentHead: t.content.slice(0, 2000),
    })),
    costUsd: (record.result?.turns ?? []).reduce((sum, t) => sum + (t.costUsd ?? 0), 0),
    durationMs: record.durationMs,
    error: record.error,
    infraRetries: record.infraRetries,
    plumbbob: s.plumbbob,
    claudeCli: s.claudeCli,
    fascicle: s.fascicle,
  }
}

function renderRecord(record: RunRecord): string {
  const lines = [`  run ${record.run}: ${record.outcome.toUpperCase()} (${Math.round(record.durationMs / 1000)}s)`]
  for (const c of record.result?.checks ?? []) {
    const mark = c.pass ? '✓' : '✗'
    const kind = c.kind === 'required' ? '' : ` [${c.kind}]`
    lines.push(`    ${mark}${kind} ${c.name}${c.detail === undefined ? '' : ` — ${c.detail}`}`)
  }
  if (record.error !== null) lines.push(`    error: ${record.error.split('\n')[0] ?? ''}`)
  if (record.outcome !== 'pass') lines.push(`    fixture kept: ${record.repo}`)
  return lines.join('\n')
}

function flagValue(argv: ReadonlyArray<string>, flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)

  if (argv.includes('--report')) {
    const date = flagValue(argv, '--date') ?? today()
    const path = join(REPORTS_DIR, `${date}.md`)
    writeFileSync(path, renderReport(date))
    process.stdout.write(`report written: ${path}\n`)
    return 0
  }

  const sweepArg = flagValue(argv, '--sweep') ?? process.env.PLUMBBOB_EVAL_SWEEP
  if (sweepArg !== 'baseline' && sweepArg !== 'latched') {
    process.stderr.write(
      'usage: node test/evals/run.ts --sweep baseline|latched [--contract cN] [--n N] [--model m]\n' +
        '       node test/evals/run.ts --report [--date YYYY-MM-DD]\n',
    )
    return 1
  }
  const sweep: Sweep = sweepArg
  const only = flagValue(argv, '--contract')
  const n = Number.parseInt(flagValue(argv, '--n') ?? String(EVAL_N), 10)
  const model = flagValue(argv, '--model') ?? EVAL_MODEL
  const date = today()
  const contracts = CONTRACTS.filter((c) => only === undefined || c.id === only)
  if (contracts.length === 0) {
    process.stderr.write(`no contract matches "${only}" — known: ${CONTRACTS.map((c) => c.id).join(', ')}\n`)
    return 1
  }

  process.stdout.write(
    `eval sweep: ${sweep} · model ${model} · n=${n} · contracts: ${contracts.map((c) => c.id).join(', ')}\n`,
  )
  const records: RunRecord[] = []
  for (const contract of contracts) {
    process.stdout.write(`\n${contract.id} — ${contract.title}\n`)
    for (let run = 1; run <= n; run += 1) {
      const record = await runOnce(contract, sweep, model, run)
      records.push(record)
      appendRun(date, sweep, toLedgerLine(record, date))
      process.stdout.write(`${renderRecord(record)}\n`)
    }
  }

  process.stdout.write('\n— summary —\n')
  for (const contract of contracts) {
    const mine = records.filter((r) => r.contract === contract.id)
    const passed = mine.filter((r) => r.outcome === 'pass').length
    const invalid = mine.filter((r) => r.outcome === 'invalid').length
    process.stdout.write(
      `${contract.id} ${contract.title}: ${passed}/${mine.length} pass${invalid > 0 ? ` (${invalid} invalid)` : ''}\n`,
    )
  }
  process.stdout.write(`ledger: ${join(REPORTS_DIR, `runs-${date}-${sweep}.jsonl`)}\n`)
  // A non-pass run's fixture is the evidence — keep every fixture when any run
  // needs inspecting; a fully-green sweep cleans up after itself.
  if (records.every((r) => r.outcome === 'pass')) {
    cleanupFixtures()
  } else {
    process.stdout.write('non-pass runs above — fixtures kept for inspection (temp dirs named plumbbob-*)\n')
  }
  return 0
}

// Entry only when invoked directly — the runner's exports (deriveOutcome,
// isInfraError) stay importable by the model-free unit coverage.
if (process.argv[1]?.endsWith('run.ts') === true) {
  process.exitCode = await main()
}
