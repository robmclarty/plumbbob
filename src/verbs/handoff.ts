// `plumbbob handoff`: render the footer card (docs/presentation.md), the CLI-owned,
// always-last-text ending of a turn. Read-only, no state change. It derives the
// moment from the session: a step in flight ⇒ the decision-tier card (banner,
// next-up, the your-call block); a landed step with none in flight ⇒ the
// orientation-tier card (banner and next-up only); a fresh session with nothing
// yet measured ⇒ the forward pointer alone, no banner. The banner is computed,
// never composed: it folds the model's recap (read from `.plumbbob/detail.md`)
// worst-of with its own check measurement and the step's accrued stats.
//
// Every tier's ending is emitted here, so no skill has to fake the furniture in
// prose: `--plan` renders the plan-pause card and `--driver` the driver turn's
// pointer back at the open step, the two endings the session state cannot tell
// apart from the ones above.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { commitsSince, findRepoRoot } from '../lib/git.ts'
import { checkpointsPath, detailPath, hasSession, intentPath, readStats, resolveBuild, stepPath } from '../lib/sidecar.ts'
import {
  type AccruedStats,
  type RecapRow,
  type Step,
  foldBanner,
  lastLedgerSha,
  parseLastCheckpoint,
  parseRecap,
  parseSteps,
} from '../lib/orient.ts'

/**
 * Print the footer card for the resolved build; return the exit code.
 *
 * Requires an active session (the STATE sentinel under `.plumbbob/`). The step
 * tiers are derived, not passed: a step in flight yields the full
 * decision-tier card, a landed step yields the orientation-tier card (no
 * your-call block), and a fresh session with nothing to report yields only
 * the forward pointer. The two endings no session state can distinguish are
 * named by a flag: `--plan` is the plan pause (a decision turn about the plan,
 * not a diff) and `--driver` is a driver turn (a park, a spike, a `use`), which
 * interrupts a step without ending it.
 */
export function handoff(cwd: string, args: ReadonlyArray<string> = []): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug, rest } = resolveBuild(root, args)
  if (rest.includes('--plan') && rest.includes('--driver')) {
    process.stderr.write('plumbbob: handoff: --plan and --driver name different tiers; pass one.\n')
    return 1
  }
  const steps = parseSteps(readOr(intentPath(root, slug)))
  const inFlight = readStep(stepPath(root, slug))

  if (rest.includes('--plan')) {
    // The plan pause judges the plan, so nothing is measured and no banner
    // renders; the pointer and the moves both aim at the first undone step.
    const first = steps.find((s) => !s.done)
    return emit([nextUpLine(first), '', planCallBlock(first)])
  }

  const explicit = rest.find((a) => /^\d+$/.test(a))
  const lastDone = parseLastCheckpoint(readOr(checkpointsPath(root, slug)))
  // The step this hand-off is about: an explicit arg wins (the skill's override),
  // else the in-flight step (the pause), else the last checkpointed step (the
  // boundary). Null only on a fresh session the skill would not hand off from.
  const current = explicit !== undefined ? Number(explicit) : (inFlight ?? lastDone?.n ?? null)

  // Next up: the first undone step that is not the current one. At the pause the
  // current step is still `[ ]`, so excluding it by number is what makes "next"
  // mean the step *after* it; at the boundary the current step is already `[x]`,
  // so the `!== current` clause is a harmless no-op. Skipping-ahead builds still
  // land on the earliest remaining step, never a gap.
  const nextUp = steps.find((s) => !s.done && s.n !== current)

  if (rest.includes('--driver')) {
    // A driver turn interrupts a step without ending it, so its pointer aims
    // back at the step still open; with none open the ordinary pointer stands.
    return emit([driverNextUpLine(steps, inFlight) ?? nextUpLine(nextUp)])
  }

  if (current === null) {
    // Nothing measured yet (a fresh session): no banner, just the forward pointer.
    return emit([nextUpLine(nextUp)])
  }

  const measuredCheck = measuredCheckRow(root)
  const banner = renderBanner(root, slug, current, steps.length, measuredCheck)
  const lines = [banner, '', nextUpLine(nextUp)]
  if (inFlight !== null) {
    lines.push('', yourCallBlock(current, measuredCheck?.verdict === 'true'))
  }
  return emit(lines)
}

/**
 * Write a card to stdout and return handoff's exit code.
 *
 * Every card ends with a trailing blank line: the card is the turn's last text,
 * and one flush against the next output cannot read as an ending.
 */
function emit(lines: ReadonlyArray<string>): number {
  process.stdout.write(`${lines.join('\n')}\n\n`)
  return 0
}

/**
 * Render the banner line: the ladder rung folded worst-of over the recap rows
 * plus the step's accrued stats, the worst component named inline, the step
 * segment last.
 *
 * The recap comes from `.plumbbob/detail.md`; its check row is provisional as
 * written and is replaced here by handoff's own measurement when one is
 * available (measured beats attested).
 */
function renderBanner(root: string, slug: string | null, step: number, total: number, measuredCheck: RecapRow | null): string {
  const recap = parseRecap(readOr(detailPath(root)))
  const rows = { ...(recap?.rows ?? {}) }
  if (measuredCheck !== null) {
    rows.check = measuredCheck
  }
  const { ladder, worst } = foldBanner(rows, accruedStats(root, slug, step))
  const head = `${ladder.glyph} ${ladder.state}:`
  return worst === null ? `${head} Step ${step} of ${total}` : `${head} ${worst} · Step ${step} of ${total}`
}

/**
 * The step's accrued stats (red checks, reverts) plus commits that landed
 * since the last ledger entry outside plumbbob's checkpoints: the advisory
 * inputs to the banner's third fold rung.
 */
function accruedStats(root: string, slug: string | null, step: number): AccruedStats {
  const stats = readStats(root, slug)[String(step)] ?? {}
  const anchor = lastLedgerSha(readOr(checkpointsPath(root, slug)))
  return {
    redChecks: stats.redChecks ?? 0,
    reverts: stats.reverts ?? 0,
    outOfBand: anchor === null ? 0 : commitsSince(root, anchor),
  }
}

/**
 * handoff's own check measurement, read from the last `plumbbob check` run's
 * `.check/summary.json`, or null when it is absent or unreadable (nothing to
 * measure with; the fold then falls back to the recap's attested row, if it
 * wrote one).
 */
function measuredCheckRow(root: string): RecapRow | null {
  let summary: { readonly ok: boolean; readonly checks: ReadonlyArray<{ readonly name: string; readonly ok: boolean; readonly skipped?: boolean }> }
  try {
    summary = JSON.parse(readFileSync(join(root, '.check', 'summary.json'), 'utf8'))
  } catch {
    return null
  }
  const ran = summary.checks.filter((c) => c.skipped !== true).map((c) => c.name)
  if (summary.ok) {
    return { verdict: 'true', word: 'green', evidence: `green (checkride: ${ran.join(', ')})` }
  }
  const failing = summary.checks.find((c) => !c.ok && c.skipped !== true)
  return {
    verdict: 'failing',
    word: 'red',
    evidence: failing !== undefined ? `red (${failing.name} failing)` : 'red',
  }
}

/**
 * The your-call block: three moves, each quoting what the human says and
 * stating what happens next. `looks good` renders only while the measured
 * check is green; offering a move that would refuse teaches a false
 * ceremony. The other two always render.
 */
function yourCallBlock(step: number, checkGreen: boolean): string {
  const moves: string[] = []
  if (checkGreen) {
    moves.push(callLine('looks good', `I checkpoint step ${step}; back to the boundary`))
  }
  moves.push(callLine('needs work', 'Tell me what to change; nothing lands until you approve'))
  moves.push(callLine('revert', 'I wind the work back to the last checkpoint'))
  return ['Your Call:', ...moves].join('\n')
}

/**
 * One your-call row: the lowercase move label (it quotes what the human
 * says), padded so every arrow lands in the same column, then the outcome
 * clause opening with a capital letter.
 */
function callLine(move: string, outcome: string): string {
  return `  ${move.padEnd(10)}  → ${outcome}`
}

/**
 * The plan pause's your-call block: the same shape with the two moves that
 * apply there. Nothing is recorded yet, so `revert` has nothing to wind back
 * to and vanishes; `looks good` names the step the plan starts at, which is
 * step 1 at the plan pause and the first undone step after a mid-build refine.
 */
function planCallBlock(first: Step | undefined): string {
  const starts = first === undefined ? '' : `; /plumbbob:build starts step ${first.n}`
  return [
    'Your Call:',
    callLine('looks good', `I mark the plan decided${starts}`),
    callLine('needs work', 'Tell me what to sharpen; the plan is cheap to change now'),
  ].join('\n')
}

/**
 * The driver turn's pointer: back to the step still in flight, since a park or
 * a spike interrupts a step without ending it. No model clause rides here; the
 * step is already being built, so the `/model` call is behind us. Null when no
 * step is open, which is the caller's cue to fall back to the forward pointer.
 */
function driverNextUpLine(steps: ReadonlyArray<Step>, inFlight: number | null): string | null {
  if (inFlight === null) {
    return null
  }
  const open = steps.find((s) => s.n === inFlight)
  const title = open !== undefined && open.title.length > 0 ? ` - ${open.title}` : ''
  return `Next Up: Back to step ${inFlight}${title}`
}

/**
 * The forward pointer: the next undone step, its title, and its advisory
 * `- model:` recommendation named in parentheses. No next step ⇒ the
 * finish/step nudge instead.
 */
function nextUpLine(nextUp: Step | undefined): string {
  if (nextUp === undefined) {
    return 'Next Up: Nothing planned - /plumbbob:step or /plumbbob:finish'
  }
  const title = nextUp.title.length > 0 ? ` - ${nextUp.title}` : ''
  const token = modelToken(nextUp.model)
  const model = token === null ? '' : ` (model: ${capitalize(token)})`
  return `Next Up: Step ${nextUp.n}${title}${model}`
}

/**
 * The model token from a `- model:` recommendation: the first word, so a
 * `model: opus` line followed by an em dash and rationale yields `opus`.
 *
 * Null when there is no recommendation, or it degraded to whitespace (folding
 * the null model into the same guard keeps both branches live).
 */
function modelToken(model: string | null): string | null {
  const first = model?.trim().split(/\s+/)[0]
  return first !== undefined && first.length > 0 ? first : null
}

/**
 * Capitalize a token's first letter for the card's title-case furniture
 * (`(model: Sonnet)`); the rest rides through unchanged.
 */
function capitalize(s: string): string {
  return s.length === 0 ? s : `${s[0]?.toUpperCase()}${s.slice(1)}`
}

/**
 * Read a file as UTF-8, or return '' when it is missing or unreadable: an
 * absent sidecar file reads as empty rather than throwing.
 */
function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * The in-flight step number from the STEP marker: the flat one-line file in
 * the build folder that records which step is open. Null when no step is in
 * flight or the file holds anything but a bare number.
 */
function readStep(path: string): number | null {
  try {
    const raw = readFileSync(path, 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}
