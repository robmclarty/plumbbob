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
  readonly plumbbob: { readonly version: string; readonly sha: string; readonly dirty: boolean }
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
      dirty: uncommitted(),
    },
    claudeCli: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
    fascicle: fascicle.version,
  }
  return cachedStamps
}

// Whether the checkout under test differs from its HEAD. A sweep can run before
// its code is committed, and a stamp that named HEAD alone would credit that
// commit with code it does not contain. The receipts and the raw ledgers are
// left out, because writing them is part of the sweep itself.
function uncommitted(): boolean {
  const status = execFileSync(
    'git',
    ['-C', REPO_ROOT, 'status', '--porcelain', '--', '.', ':!docs/evals', ':!reports'],
    { encoding: 'utf8' },
  )
  return status.trim().length > 0
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
  readonly run: number
  readonly sweep: string
  readonly outcome: string
  readonly model: string
  readonly checks: ReadonlyArray<{
    readonly name: string
    readonly pass: boolean
    readonly kind: string
    readonly detail?: string | null
  }>
  readonly costUsd: number
  readonly durationMs: number
  readonly infraRetries: number
  readonly error?: string
  // Absent on every ledger written before the relay check shipped.
  readonly turns?: ReadonlyArray<{
    readonly relayHolds?: ReadonlyArray<{ readonly tier: string | null; readonly whole: boolean }>
  }>
}

// The arms a receipt can compare, in the order its columns read, each with the
// clause that says what it ran.
const ARMS: ReadonlyArray<{ readonly sweep: string; readonly ran: string }> = [
  { sweep: 'baseline', ran: 'runs the plugin with the latch hooks stripped (prose only)' },
  { sweep: 'no-relay', ran: 'runs the shipped plugin with its `Stop` hook stripped (no relay check)' },
  { sweep: 'latched', ran: 'runs the shipped plugin' },
]

type Arm = { readonly sweep: string; readonly ran: string; readonly runs: ReadonlyArray<LedgerRun> }

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

// Render the day's arms side by side from the JSONL ledgers. Returns the
// markdown; the caller writes it (run.ts --report). A receipt shows baseline
// beside latched, as every one before the relay check did, unless the
// no-relay arm ran: then it shows the arms that ran, and nothing else.
export function renderReport(date: string): string {
  const arms: ReadonlyArray<Arm> = ARMS.map((arm) => ({ ...arm, runs: readLedger(date, arm.sweep) }))
  const relayed = arms.some((a) => a.sweep === 'no-relay' && a.runs.length > 0)
  const shown = relayed ? arms.filter((a) => a.runs.length > 0) : arms.filter((a) => a.sweep !== 'no-relay')
  const all = shown.flatMap((a) => a.runs)
  if (all.length === 0) return `# Skill-eval sweep — ${date}\n\nNo runs recorded for this date.\n`

  const s = stamps()
  const models = [...new Set(all.map((r) => r.model))].join(', ')
  const contracts = [...new Map(all.map((r) => [r.contract, r.title])).entries()].sort()

  const lines = [
    `# Skill-eval sweep — ${date}`,
    '',
    `Model: ${models} · plumbbob ${s.plumbbob.version} ` +
      `(\`${s.plumbbob.sha.slice(0, 9)}\`${s.plumbbob.dirty ? ' with uncommitted changes' : ''}) · ` +
      `claude CLI ${s.claudeCli.replace(' (Claude Code)', '')} · fascicle ${s.fascicle}`,
    '',
    'Each run is one scripted headless session sequence against a fresh fixture repo;',
    'every assertion is a mechanical read of git + sidecar state (no LLM judging).',
    ...shown.map((a, i) => `\`${a.sweep}\` ${a.ran}${i < shown.length - 1 ? ';' : '. Behavioral failures are never retried.'}`),
    '',
    `| # | Contract | ${shown.map((a) => a.sweep).join(' | ')} |`,
    `| - | -------- | ${shown.map((a) => '-'.repeat(a.sweep.length)).join(' | ')} |`,
    ...contracts.map(([id, title]) => {
      const rates = shown.map((a) => rate(a.runs.filter((r) => r.contract === id)))
      return `| ${id} | ${title} | ${rates.join(' | ')} |`
    }),
    '',
    `Estimated cost: ${shown.map((a) => `$${cost(a.runs).toFixed(2)} ${a.sweep}`).join(' · ')} · ` +
      `${all.filter((r) => r.infraRetries > 0).length} run(s) needed an infra retry.`,
    '',
    ...renderOneSided(shown),
    '## Non-pass runs',
    '',
    ...renderNonPasses(all),
    '',
    ...renderAnatomy(shown),
    ...renderHolds(shown),
    '## Method footnotes',
    '',
    '- Each scripted "human turn" is a fresh `claude -p` session; plumbbob\'s turn',
    '  ledger is per-worktree filesystem state, so cross-session turns are real',
    '  human turns. A warmup turn ticks the ledger and checks which CLI the session',
    '  resolves before the first measured turn.',
    '- For the auto/range/run contracts (c3, c4, c9, c11) the driver pre-arms the GRANT file,',
    '  and for the run contract (c11) the RUN mark beside it, writing what the turn hook',
    '  writes for the contract\'s prompt. The hook mints both itself as the turn starts,',
    '  headless as interactive (checked live on Claude Code 2.1.302, 2026-10-19); the',
    '  pre-arm stays for parity with the receipts before that check. The minting and the',
    '  marking are deterministically tested in src/verbs/__tests__/turn.test.ts.',
    '- `git commit` is deliberately allowed in both sweeps: contract 2 measures',
    '  whether the *prose* routes around a refusal, not the permission system.',
    '- The driver pins PATH so sessions resolve this checkout\'s CLI — a',
    '  marketplace plumbbob install otherwise shadows the plugin under test',
    '  (verified live); a version guard aborts any run that resolves elsewhere.',
    '- Contracts 5 and 6 are prose-governed by design — [D10 (pause-not-lock)](../decisions.md#d10) and',
    '  [D13 (no-edit-guards)](../decisions.md#d13): their numbers are the honest guidance-only rates.',
    '  The latch does not reach them.',
    '- The `check` row renders in these fixtures as of 0.11.1, which writes the',
    '  `.check/summary.json` that row reads for a configured `check` command and',
    '  not only for the checkride path. Every receipt before 2026-09-05 read this',
    '  probe as 0 by construction rather than by anything the model did, so its',
    '  numbers are not comparable across that line. The rate tracks the',
    '  decision-ending rate exactly, because the row rides the fence and the fence',
    '  rides the ending: where the check row is missing, the whole readout is.',
    '- Contract 4 reads its last turn as a boundary ending. A range lands its',
    '  top step ([D85 (range-top-lands)](../decisions.md#d85)), so that turn ends',
    '  on the step\'s own checkpoint block rather than a pause. Receipts through',
    '  2026-09-05 read the same turn against the decision tier, so contract 4\'s',
    '  anatomy rows are not comparable across that line. Contract 9 reads the',
    '  other clean halt, an `--auto` run reaching the end of the plan, the same',
    '  way, and no receipt before 0.12.0 measured it.',
    '- The turn-anatomy probes never gate a contract. A run that paused exactly',
    '  as its contract demands, in a shape a hair off the spec, is still a pass of',
    '  that contract; folding the two together would make one rate answer two',
    '  questions and break comparability with every receipt already written.',
    '- Contract 8 is prose-governed the same way: the glossed-reference style',
    '  (`D1 (in-memory-bucket):`) ships only in templates/intent.md and the plan',
    '  skill, so nothing enforces it and baseline should track latched. Its',
    '  number measures whether that guidance actually lands in authored intent.',
    ...(relayed
      ? [
          '- `no-relay` and `latched` ran at one commit and differ in one hook: the',
          '  `no-relay` copy strips the `Stop` entry from hooks.json and keeps the',
          '  latch, so the product grows no switch and the gap between the two',
          '  columns is the relay check\'s ([D89 (block-once)](../decisions.md#d89)).',
        ]
      : []),
    '',
  ]
  return lines.join('\n')
}

// The relay check's holds, per arm, read from the ledger's per-turn record of
// each session's transcript. Rendered only where an arm's ledger carries that
// record, so a receipt from before the check re-renders as it was written.
export function renderHolds(arms: ReadonlyArray<Arm>): string[] {
  const measured = arms.filter((a) => a.runs.some((r) => r.turns?.some((t) => t.relayHolds !== undefined) === true))
  if (measured.length === 0) return []
  const heldIn = (a: Arm): ReadonlyArray<{ run: LedgerRun; tier: string | null; whole: boolean }> =>
    a.runs.flatMap((run) => (run.turns ?? []).flatMap((t) => (t.relayHolds ?? []).map((h) => ({ run, ...h }))))
  const lines = [
    '## Relay holds',
    '',
    'The turns the relay check held open ([D89 (block-once)](../decisions.md#d89)),',
    'read from each session\'s transcript. A hold fell on an ending that was already',
    'whole when the text before it already carried that ending whole by the probes',
    'above: a false hold, and the one result that reopens the decision. Those probes',
    'read the parts an ending owes and their order, while the check compares the',
    'relay with the block line for line, so a relay that moved or restyled one line',
    'inside a part reads as whole here and is still held.',
    '',
    '| arm | holds | on an ending already whole |',
    '| --- | ----- | -------------------------- |',
    ...measured.map((a) => {
      const holds = heldIn(a)
      return `| ${a.sweep} | ${holds.length} | ${holds.filter((h) => h.whole).length} |`
    }),
    '',
  ]
  const listed = measured.flatMap((a) =>
    heldIn(a).map(
      (h) =>
        `- ${h.run.contract} run ${h.run.run} (${a.sweep}): held over ${HELD_ENDING[h.tier ?? ''] ?? 'an ending'} ` +
        `${h.whole ? 'the turn had already carried whole' : 'the turn had not carried whole'}`,
    ),
  )
  return listed.length === 0 ? lines : [...lines, ...listed, '']
}

// What a hold's ending is called in its line, by the tier the reason named.
const HELD_ENDING: Readonly<Record<string, string>> = {
  decision: 'a pause card',
  reminder: 'a pause reminder',
  plan: 'a plan card',
  boundary: 'a boundary block',
  stop: 'a stop card',
}

// The turn shapes docs/presentation.md specifies, tallied off the anatomy
// probes each contract folds into its checks. They are informational by design,
// so they never move a contract's rate and never appear beside a failure above:
// whether a turn paused is the contract's verdict, and whether it paused in the
// right shape is the separate question this table answers. The unit is a probe,
// not a run, because a contract that reads two turns contributes two.
function renderAnatomy(arms: ReadonlyArray<Arm>): string[] {
  const names = [
    ...new Set(
      arms.flatMap((a) => a.runs).flatMap((r) =>
        r.checks.filter((c) => c.name.startsWith(ANATOMY_PREFIX)).map((c) => c.name),
      ),
    ),
  ].sort(byProbeOrder)
  if (names.length === 0) return []
  return [
    '## Turn anatomy',
    '',
    'Every ending in this sweep, read against the shape it owes',
    '([the turn anatomy](../presentation.md)): the parts it rendered, the order they',
    'stood in, whether the gate verdict rode the readout fence, and whether the relay',
    'was the last thing the turn said. A driver session accumulates every text part,',
    'so the ending is read from the tail: prose before the relay is the model working,',
    'prose after it is the defect the positional rule exists to catch.',
    '',
    `| probe | ${arms.map((a) => a.sweep).join(' | ')} |`,
    `| ----- | ${arms.map((a) => '-'.repeat(a.sweep.length)).join(' | ')} |`,
    ...names.map((name) => {
      const label = name.slice(ANATOMY_PREFIX.length)
      return `| ${label} | ${arms.map((a) => probeRate(a.runs, name)).join(' | ')} |`
    }),
    '',
  ]
}

const ANATOMY_PREFIX = 'anatomy: '

// The table reads in the spec's own order — the tiers first, then the probes
// that cut across all of them — rather than alphabetically, which files
// "nothing outside the block" between two tiers that have nothing to do with it.
const PROBE_ORDER: ReadonlyArray<string> = [
  'decision ending renders whole',
  'plan ending renders whole',
  'boundary ending renders whole',
  'driver ending renders whole',
  'the gate verdict rides the check row',
  'recommendation is the last text',
  'nothing after the relay',
]

function byProbeOrder(a: string, b: string): number {
  const rank = (name: string): number => {
    const i = PROBE_ORDER.indexOf(name.slice(ANATOMY_PREFIX.length))
    return i < 0 ? PROBE_ORDER.length : i
  }
  return rank(a) - rank(b) || a.localeCompare(b)
}

// A check's detail can quote what the model wrote (a plan bullet, say), and the
// receipt is committed prose that the markdown and prose slots both read. Inside
// a code span none of it reads as markdown and the prose rules skip it; a
// backtick of its own would close the span early, so it becomes a quote mark.
function codeSpan(text: string): string {
  return `\`${text.replace(/`/g, "'").replace(/\s+/g, ' ').trim()}\``
}

// A sweep that ran one arm says so. An empty column is a measurement nobody
// took, and a dash alone cannot tell that apart from a run that found nothing.
function renderOneSided(arms: ReadonlyArray<Arm>): string[] {
  const missing = arms.find((a) => a.runs.length === 0)
  if (missing === undefined) return []
  return [`The \`${missing.sweep}\` arm was not run on this date, so its column is empty.`, '']
}

function probeRate(runs: ReadonlyArray<LedgerRun>, name: string): string {
  const probes = runs.flatMap((r) => r.checks.filter((c) => c.name === name))
  if (probes.length === 0) return '—'
  return `${probes.filter((c) => c.pass).length}/${probes.length}`
}

function renderNonPasses(all: ReadonlyArray<LedgerRun>): string[] {
  const bad = all.filter((r) => r.outcome !== 'pass')
  if (bad.length === 0) return ['(none)']
  return bad.map((r) => {
    // A failed check carries its detail beside its name: the value it compared
    // is what says why the run fell short, and a bare name only says that it did.
    const failed = r.checks
      .filter((c) => !c.pass && c.kind !== 'info')
      .map((c) => (c.detail === undefined || c.detail === null || c.detail.trim() === '' ? c.name : `${c.name} (${codeSpan(c.detail)})`))
      .join('; ')
    // A run that died before any check ran carries only its error — name it, so
    // five bare "invalid" lines don't read as five unexplained model failures.
    const cause = (failed.length > 0 ? failed : (r.error ?? '').split('\n')[0]?.slice(0, 120) ?? '').replace(/[\s:]+$/, '')
    return `- ${r.contract} (${r.sweep}) — ${r.outcome}${cause.length > 0 ? `: ${cause}` : ''}`
  })
}
