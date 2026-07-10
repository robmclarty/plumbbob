// The eval runner (intent D1/D5): plain node, never vitest — the output unit
// is a pass RATE plus a cost ledger, and `pnpm test` must be structurally
// unable to reach this. Sequential runs (deterministic, rate-limit-friendly).
//
//   node test/evals/run.ts --sweep latched [--contract c1] [--n 5] [--model opus]
//
// Outcomes per run: pass (validity holds, every required check passes), fail
// (validity holds, a required check fails), invalid (a validity precondition
// failed — counted against the rate, itemized). Behavioral failures never
// retry; infra errors retry once (step 7 wires the full policy + JSONL).

import { cleanupFixtures } from '../helpers/fixture-repo.ts'
import { CONTRACTS } from './contracts/index.ts'
import type { Contract, ContractResult } from './contracts/contract.ts'
import { EVAL_MODEL, EVAL_N, openSession } from './helpers/driver.ts'
import type { Sweep } from './helpers/plugin.ts'

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
}

export function deriveOutcome(result: ContractResult): Outcome {
  if (result.checks.some((c) => c.kind === 'validity' && !c.pass)) return 'invalid'
  return result.checks.some((c) => c.kind === 'required' && !c.pass) ? 'fail' : 'pass'
}

export async function runOnce(contract: Contract, sweep: Sweep, model: string, run: number): Promise<RunRecord> {
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
    }
  } catch (error) {
    // A turn that never returned (spawn failure, abort, max-turns exit) is not
    // a behavioral verdict — recorded as invalid with the error; the infra
    // retry policy lands in step 7.
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
    }
  } finally {
    await session.close()
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

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const sweepArg = flagValue(argv, '--sweep') ?? process.env.PLUMBBOB_EVAL_SWEEP
  if (sweepArg !== 'baseline' && sweepArg !== 'latched') {
    process.stderr.write('usage: node test/evals/run.ts --sweep baseline|latched [--contract cN] [--n N] [--model m]\n')
    return 1
  }
  const sweep: Sweep = sweepArg
  const only = flagValue(argv, '--contract')
  const n = Number.parseInt(flagValue(argv, '--n') ?? String(EVAL_N), 10)
  const model = flagValue(argv, '--model') ?? EVAL_MODEL
  const contracts = CONTRACTS.filter((c) => only === undefined || c.id === only)
  if (contracts.length === 0) {
    process.stderr.write(`no contract matches "${only}" — known: ${CONTRACTS.map((c) => c.id).join(', ')}\n`)
    return 1
  }

  process.stdout.write(`eval sweep: ${sweep} · model ${model} · n=${n} · contracts: ${contracts.map((c) => c.id).join(', ')}\n`)
  const records: RunRecord[] = []
  for (const contract of contracts) {
    process.stdout.write(`\n${contract.id} — ${contract.title}\n`)
    for (let run = 1; run <= n; run += 1) {
      const record = await runOnce(contract, sweep, model, run)
      records.push(record)
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
  // A non-pass run's fixture is the evidence — keep every fixture when any run
  // needs inspecting; a fully-green sweep cleans up after itself.
  if (records.every((r) => r.outcome === 'pass')) {
    cleanupFixtures()
  } else {
    process.stdout.write('non-pass runs above — fixtures kept for inspection (temp dirs named plumbbob-*)\n')
  }
  return 0
}

// Entry only when invoked directly — the contracts' vitest-free import chain
// stays importable by future steps' unit coverage.
if (process.argv[1]?.endsWith('run.ts') === true) {
  process.exitCode = await main()
}
