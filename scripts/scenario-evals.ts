#!/usr/bin/env node
// scripts/scenario-evals.ts: the scenarios slot. keyframes.md's Scenarios name
// what must keep working, and some of them are held by an eval contract under
// test/evals/contracts/. The `intent` slot proves each pointer resolves; this
// script runs the contracts they point at, so "linked" and "passing" sit side
// by side. It costs live model turns, so the slot is opt-in: it runs only
// under `pnpm check --include scenarios`, never in the default run or the turn
// gate.
//
//   node scripts/scenario-evals.ts            build, then one latched run per contract
//   PLUMBBOB_SCENARIO_N=3 node scripts/scenario-evals.ts
//
// Exit 0 when every run passes, 1 when any run fails or comes back invalid.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// A held-by pointer at an eval contract: `file:test/evals/contracts/<name>.eval.ts`,
// backticked or not, with or without its `#"…"` anchor.
const CONTRACT_POINTER = /file:(test\/evals\/contracts\/[\w.-]+\.eval\.ts)/g

/**
 * The eval contract ids the Scenarios section points at, in the order the
 * section first names them, each once.
 *
 * `read` returns a contract file's text, or null when it is missing; a missing
 * file or one with no `id: 'cN'` is skipped here, since the `intent` slot
 * already fails a pointer that does not resolve.
 */
export function scenarioContracts(keyframes: string, read: (path: string) => string | null): string[] {
  const ids: string[] = []
  for (const path of scenarioSection(keyframes).matchAll(CONTRACT_POINTER)) {
    const id = /\bid:\s*'(c\d+)'/.exec(read(path[1] ?? '') ?? '')?.[1]
    if (id !== undefined && !ids.includes(id)) {
      ids.push(id)
    }
  }
  return ids
}

/** The text of keyframes.md's `## Scenarios` section, up to the next `## ` heading; '' when there is none. */
function scenarioSection(keyframes: string): string {
  const lines = keyframes.split('\n')
  const start = lines.findIndex((l) => l.trim() === '## Scenarios')
  if (start === -1) {
    return ''
  }
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n')
}

/** Run the contracts the Scenarios point at, once the plugin under test is built. */
function main(): number {
  const root = process.cwd()
  const keyframes = join(root, 'keyframes.md')
  if (!existsSync(keyframes)) {
    process.stdout.write('no keyframes.md, so no Scenarios to run.\n')
    return 0
  }
  const read = (path: string): string | null => {
    const full = join(root, path)
    return existsSync(full) ? readFileSync(full, 'utf8') : null
  }
  const ids = scenarioContracts(readFileSync(keyframes, 'utf8'), read)
  if (ids.length === 0) {
    process.stdout.write('no Scenario points at an eval contract.\n')
    return 0
  }
  process.stdout.write(`scenarios hold ${ids.length} eval contracts: ${ids.join(', ')}\n`)
  // The evals load the plugin from dist/, so a stale build would test the last release.
  const build = spawnSync('pnpm', ['build'], { stdio: 'inherit' })
  if (build.status !== 0) {
    return 1
  }
  const n = process.env.PLUMBBOB_SCENARIO_N ?? '1'
  const run = spawnSync('node', ['test/evals/run.ts', '--sweep', 'latched', '--contract', ids.join(','), '--n', n, '--strict'], {
    stdio: 'inherit',
  })
  return run.status ?? 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main()
}
