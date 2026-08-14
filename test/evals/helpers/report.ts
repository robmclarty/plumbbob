// The sweep ledger and its renderer. Raw truth is JSONL — one line per run,
// stamped with everything needed to reproduce it (model, versions, SHA); the
// markdown report is derived, never the source. The bulky JSONL ledgers live
// under reports/evals/ (git-ignored, local raw truth); the derived receipt is
// committed under docs/evals/ so it rides the repo (plan 05's exit criterion)
// without dragging the megabyte-scale run logs along with it.
//
// The receipt directory has to be one git actually tracks — it has now been
// moved twice for that reason (out of reports/, then out of research/ when that
// was ignored too), each time after a sweep's receipt was written and silently
// never committed. docs/ is published, so a receipt landing there is visible.

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from './plugin.ts'

// JSONL ledgers: git-ignored raw truth. Derived receipts: tracked, in docs/.
export const REPORTS_DIR = join(REPO_ROOT, 'reports', 'evals')
export const RECEIPTS_DIR = join(REPO_ROOT, 'docs', 'evals')

export type Stamps = {
  readonly plumbbob: { readonly version: string; readonly sha: string }
  readonly claudeCli: string
  readonly fascicle: string
}

let cachedStamps: Stamps | null = null

export function stamps(): Stamps {
  if (cachedStamps !== null) return cachedStamps
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { version: string }
  const fascicle = JSON.parse(
    readFileSync(join(REPO_ROOT, 'node_modules', 'fascicle', 'package.json'), 'utf8'),
  ) as { version: string }
  cachedStamps = {
    plumbbob: {
      version: pkg.version,
      sha: execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    },
    claudeCli: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
    fascicle: fascicle.version,
  }
  return cachedStamps
}

function jsonlPath(date: string, sweep: string): string {
  return join(REPORTS_DIR, `runs-${date}-${sweep}.jsonl`)
}

export function appendRun(date: string, sweep: string, record: unknown): void {
  mkdirSync(REPORTS_DIR, { recursive: true })
  appendFileSync(jsonlPath(date, sweep), `${JSON.stringify(record)}\n`)
}

// --- the rendered report -------------------------------------------------------

type LedgerRun = {
  readonly contract: string
  readonly title: string
  readonly sweep: string
  readonly outcome: string
  readonly model: string
  readonly checks: ReadonlyArray<{ readonly name: string; readonly pass: boolean; readonly kind: string }>
  readonly costUsd: number
  readonly durationMs: number
  readonly infraRetries: number
  readonly error?: string
}

function readLedger(date: string, sweep: string): ReadonlyArray<LedgerRun> {
  let raw = ''
  try {
    raw = readFileSync(jsonlPath(date, sweep), 'utf8')
  } catch {
    return []
  }
  const runs: LedgerRun[] = []
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue
    runs.push(JSON.parse(line) as LedgerRun)
  }
  return runs
}

function rate(runs: ReadonlyArray<LedgerRun>): string {
  if (runs.length === 0) return '—'
  const passed = runs.filter((r) => r.outcome === 'pass').length
  const invalid = runs.filter((r) => r.outcome === 'invalid').length
  return `${passed}/${runs.length}${invalid > 0 ? ` (${invalid} invalid)` : ''}`
}

function cost(runs: ReadonlyArray<LedgerRun>): number {
  return runs.reduce((sum, r) => sum + (Number.isFinite(r.costUsd) ? r.costUsd : 0), 0)
}

// Render the day's baseline-vs-latched table from the JSONL ledgers. Returns
// the markdown; the caller writes it (run.ts --report).
export function renderReport(date: string): string {
  const baseline = readLedger(date, 'baseline')
  const latched = readLedger(date, 'latched')
  const all = [...baseline, ...latched]
  if (all.length === 0) return `# Skill-eval sweep — ${date}\n\nNo runs recorded for this date.\n`

  const s = stamps()
  const models = [...new Set(all.map((r) => r.model))].join(', ')
  const contracts = [...new Map(all.map((r) => [r.contract, r.title])).entries()].sort()

  const lines = [
    `# Skill-eval sweep — ${date}`,
    '',
    `Model: ${models} · plumbbob ${s.plumbbob.version} (\`${s.plumbbob.sha.slice(0, 9)}\`) · ` +
      `claude CLI ${s.claudeCli.replace(' (Claude Code)', '')} · fascicle ${s.fascicle}`,
    '',
    'Each run is one scripted headless session sequence against a fresh fixture repo;',
    'every assertion is a mechanical read of git + sidecar state (no LLM judging).',
    '`baseline` runs the plugin with the latch hooks stripped (prose only);',
    '`latched` runs the shipped plugin. Behavioral failures are never retried.',
    '',
    '| # | Contract | baseline | latched |',
    '|---|----------|----------|---------|',
    ...contracts.map(([id, title]) => {
      const b = baseline.filter((r) => r.contract === id)
      const l = latched.filter((r) => r.contract === id)
      return `| ${id} | ${title} | ${rate(b)} | ${rate(l)} |`
    }),
    '',
    `Estimated cost: $${cost(baseline).toFixed(2)} baseline · $${cost(latched).toFixed(2)} latched · ` +
      `${all.filter((r) => r.infraRetries > 0).length} run(s) needed an infra retry.`,
    '',
    '## Non-pass runs',
    '',
    ...renderNonPasses(all),
    '',
    '## Method footnotes',
    '',
    '- Each scripted "human turn" is a fresh `claude -p` session; plumbbob\'s turn',
    '  ledger is per-worktree filesystem state, so cross-session turns are real',
    '  human turns. A warmup turn arms the ledger first (the headless',
    '  `UserPromptSubmit` tick lands at ~session end, unlike interactive mode).',
    '- For the auto/range contracts (c3, c4) the driver pre-arms the GRANT file:',
    '  interactive Claude Code mints it before the turn; headless ticks cannot.',
    '  The minting logic itself is deterministically tested in src/verbs/__tests__/turn.test.ts.',
    '- `git commit` is deliberately allowed in both sweeps: contract 2 measures',
    '  whether the *prose* routes around a refusal, not the permission system.',
    '- The driver pins PATH so sessions resolve this checkout\'s CLI — a',
    '  marketplace plumbbob install otherwise shadows the plugin under test',
    '  (verified live); a version guard aborts any run that resolves elsewhere.',
    '- Contracts 5 and 6 are prose-governed by design — [D10 (pause-not-lock)](../decisions.md#d10) and',
    '  [D13 (no-edit-guards)](../decisions.md#d13): their numbers are the honest guidance-only rates.',
    '  The latch does not reach them.',
    '- Contract 8 is prose-governed the same way: the glossed-reference style',
    '  (`D1 (in-memory-bucket):`) ships only in templates/intent.md and the plan',
    '  skill, so nothing enforces it and baseline should track latched. Its',
    '  number measures whether that guidance actually lands in authored intent.',
    '',
  ]
  return lines.join('\n')
}

function renderNonPasses(all: ReadonlyArray<LedgerRun>): string[] {
  const bad = all.filter((r) => r.outcome !== 'pass')
  if (bad.length === 0) return ['(none)']
  return bad.map((r) => {
    const failed = r.checks
      .filter((c) => !c.pass && c.kind !== 'info')
      .map((c) => c.name)
      .join('; ')
    // A run that died before any check ran carries only its error — name it, so
    // five bare "invalid" lines don't read as five unexplained model failures.
    const cause = (failed.length > 0 ? failed : (r.error ?? '').split('\n')[0]?.slice(0, 120) ?? '').replace(/[\s:]+$/, '')
    return `- ${r.contract} (${r.sweep}) — ${r.outcome}${cause.length > 0 ? `: ${cause}` : ''}`
  })
}
