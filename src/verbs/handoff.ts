// `plumbbob handoff`: emit the CLI-owned ending of a turn as one contiguous
// block (docs/presentation.md). Read-only, no state change. It derives the
// moment from the session: a step in flight ⇒ the decision-tier ending (the
// assembled recap fence, the inline diff fence when the change is 20 lines or
// fewer, the footer card, the recommendation last); a landed step with none in
// flight ⇒ the orientation-tier card (banner and next-up only); a fresh
// session with nothing yet measured ⇒ the forward pointer alone, no banner.
//
// If the CLI can compute a recap row, the CLI does: the check row comes from
// the last run's summary, the seam row from the SEAM marker against the
// work-plane diff, the diff row from `git diff --numstat`. The model's part
// (`.plumbbob/detail.md`) supplies only the judgment rows and the
// `## recommendation` prose; the banner folds the same assembled rows worst-of
// with the step's accrued stats, so the fence shows exactly what the fold saw.
//
// Every tier's ending is emitted here, so no skill has to fake the furniture in
// prose: `--plan` renders the plan-pause card and `--driver` the driver turn's
// pointer back at the open step, the two endings the session state cannot tell
// apart from the ones above.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { commitsSince, diffNumstat, diffPatch, findRepoRoot } from '../lib/git.ts'
import { isArtifactPath, parseStepSeam } from '../lib/intent.ts'
import {
  checkpointsPath,
  detailPath,
  hasSession,
  intentPath,
  readStats,
  resolveBuild,
  seamPath,
  stepPath,
} from '../lib/sidecar.ts'
import {
  type AccruedStats,
  type CheckSummary,
  type Ladder,
  type RecapRow,
  type RecapRowName,
  type Step,
  countDiff,
  diffRowValue,
  foldBanner,
  lastLedgerSha,
  parseLastCheckpoint,
  parseRecap,
  parseRecommendation,
  parseSteps,
  recapLines,
  seamRowFromDiff,
  summaryCheckRow,
} from '../lib/orient.ts'

// The inline-diff threshold (docs/presentation.md): at 20 changed lines or
// fewer the patch rides the turn; at 21 it stays in the working tree behind
// the counted diff row.
const INLINE_DIFF_MAX = 20

/**
 * Print the resolved build's turn ending; return the exit code.
 *
 * Requires an active session (the STATE sentinel under `.plumbbob/`). The step
 * tiers are derived, not passed: a step in flight yields the full
 * decision-tier ending (recap fence, inline diff when small enough, card,
 * recommendation), a landed step yields the orientation-tier card (no
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
  const intent = readOr(intentPath(root, slug))
  const steps = parseSteps(intent)
  const inFlight = readStep(stepPath(root, slug))
  const detail = readOr(detailPath(root))

  if (rest.includes('--plan')) {
    // The plan pause judges the plan, so nothing is measured and no banner
    // renders; the pointer and the moves both aim at the first undone step. A
    // decision turn still ends on the model's recommendation when it wrote one.
    const first = steps.find((s) => !s.done)
    return emit(withRecommendation([nextUpLine(first), '', planCallBlock(first)], parseRecommendation(detail)))
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

  // Assemble the rows once and let the fence and the fold read the same set:
  // the model's attested rows, with the check and seam rows replaced by the
  // CLI's own measurements where one exists (measured beats attested).
  const measuredCheck = measuredCheckRow(root)
  const work = diffNumstat(root).filter((e) => !isArtifactPath(e.path))
  const rows: Partial<Record<RecapRowName, RecapRow>> = { ...(parseRecap(detail)?.rows ?? {}) }
  if (measuredCheck !== null) {
    rows.check = measuredCheck
  }
  const measuredSeam = seamRowFromDiff(
    work.map((e) => e.path),
    seamTokens(root, slug, intent, current),
  )
  if (measuredSeam !== null) {
    rows.seam = measuredSeam
  }
  const { ladder, worst } = foldBanner(rows, accruedStats(root, slug, current))
  const banner = bannerLine(ladder, worst, current, steps.length)

  if (inFlight === null) {
    // The boundary: the orientation-tier card, banner and forward pointer only.
    return emit([banner, '', nextUpLine(nextUp)])
  }

  // The pause: the whole CLI ending as one contiguous block: the assembled
  // recap fence, the inline diff fence when the change is small enough, the
  // card, and the recommendation last, plain and unfenced.
  const counts = countDiff(work)
  const changed = counts.added + counts.removed
  const inline = changed > 0 && changed <= INLINE_DIFF_MAX
  const recap = recapLines(current, steps.length, rows, diffRowValue(counts, inline))
  const lines: string[] = []
  if (recap.length > 0) {
    lines.push(...fence('text', recap), '')
  }
  if (inline) {
    const patch = diffPatch(
      root,
      work.map((e) => e.path),
    )
    if (patch.length > 0) {
      lines.push(...fence('diff', patch.split('\n')), '')
    }
  }
  lines.push(...fence('text', [banner, '', nextUpLine(nextUp), '', yourCallBlock(current, measuredCheck?.verdict === 'true')]))
  return emit(withRecommendation(lines, parseRecommendation(detail)))
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
 * Render the banner line from an already-folded result: the ladder rung, the
 * worst component when one exists, the step segment last.
 */
function bannerLine(ladder: Ladder, worst: string | null, step: number, total: number): string {
  const head = `${ladder.glyph} ${ladder.state}:`
  return worst === null ? `${head} Step ${step} of ${total}` : `${head} ${worst} · Step ${step} of ${total}`
}

/**
 * The seam tokens governing `step`: the SEAM marker `build` wrote is
 * authoritative while a build is live, else the step's declared seam parsed
 * from intent.md. Empty when neither resolves, which vanishes the measured
 * seam row rather than flagging the whole tree.
 */
function seamTokens(root: string, slug: string | null, intent: string, step: number): ReadonlyArray<string> {
  try {
    const fromFile = readFileSync(seamPath(root, slug), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (fromFile.length > 0) {
      return fromFile
    }
  } catch {
    // no SEAM marker: fall through to the declared seam.
  }
  const parsed = parseStepSeam(intent, step)
  return parsed.ok ? parsed.seam : []
}

/**
 * Wrap lines in a markdown fence whose rail outruns any backtick run inside,
 * so a patch that itself contains fence markers cannot break out of the
 * `diff` fence it rides in.
 */
function fence(lang: string, lines: ReadonlyArray<string>): string[] {
  const longest = lines.reduce((max, l) => Math.max(max, ...(l.match(/`+/g) ?? ['']).map((run) => run.length)), 0)
  const rail = '`'.repeat(Math.max(3, longest + 1))
  return [`${rail}${lang}`, ...lines, rail]
}

// The recommendation's label (docs/presentation.md): the one bold token the
// turn body spends, prepended here so the model never types it.
const RECOMMENDATION_LABEL = '**Recommendation**: '

/**
 * Append the recommendation beneath a block, blank-line separated, when the
 * model wrote one; the ending's last text is then the model's own call. The
 * label is the CLI's: it announces what the last text is before the eye
 * reads it, and a label the model typed would be one more line to drift.
 */
function withRecommendation(lines: ReadonlyArray<string>, recommendation: string | null): string[] {
  return recommendation === null ? [...lines] : [...lines, '', `${RECOMMENDATION_LABEL}${recommendation}`]
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
  try {
    const summary: CheckSummary = JSON.parse(readFileSync(join(root, '.check', 'summary.json'), 'utf8'))
    return summaryCheckRow(summary)
  } catch {
    return null
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
