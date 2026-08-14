// The .plumbbob/ sidecar: plumbbob's control directory beside the code. Control
// state lives in flat files (bare numbers, plain path lists, one-line markers) so
// shell hooks can read it with a grep and no markdown parsing. Functional and
// procedural, node builtins only.
//
// Two planes share the directory: the tracked ARTIFACT plane (settings.json and
// each build's `builds/<slug>/` folder: intent, build-log, checkpoints, report),
// which rides its branch into the PR, and the git-excluded CONTROL plane (STATE,
// the personal settings overlay, the turn ledger, and each build's in-flight
// markers), which stays per-worktree and never commits.
//
// STATE is the session sentinel AND the active-build cursor: its EXISTENCE means
// "a session is active", and its CONTENT names the build that session is on: the
// two reinforce each other (a session is always on some build; the cursor is
// meaningless without a session). Content is empty under --local / no build.
// hasSession stays existence-only; activeBuild reads the content. Homing the
// cursor here (not in settings.local.json) keeps that overlay purely
// human-owned (check/auto): the tool only ever reads it, never rewrites it. The
// phase the dashboard shows (DESIGN/BUILD/SPIKE) is derived, not stored: BUILD ⇔
// a STEP is in flight, SPIKE ⇔ the SPIKE marker is present, otherwise DESIGN.

import { existsSync, readdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gitPath } from './git.ts'

const DIRNAME = '.plumbbob' // the sidecar folder name at the repo root

/**
 * The sidecar root: `<root>/.plumbbob`.
 */
export function sidecarDir(root: string): string {
  return join(root, DIRNAME)
}

/**
 * The tracked artifact plane's root: `.plumbbob/builds/`, one folder per build.
 *
 * Each build owns a self-contained `builds/<slug>/` folder that rides its branch
 * into the PR; intent.md, build-log.md, checkpoints, and report.md live inside it
 * (the in-flight STEP/SEAM/SPIKE markers do too, but stay git-excluded).
 */
function buildsDir(root: string): string {
  return join(root, DIRNAME, 'builds')
}

/**
 * One build's folder: `.plumbbob/builds/<slug>`.
 */
export function buildDir(root: string, slug: string): string {
  return join(buildsDir(root), slug)
}

/**
 * Derive a filesystem-safe slug from a build title.
 *
 * Lowercased, every run of non-alphanumerics collapsed to a single hyphen,
 * trimmed of leading/trailing hyphens. The CLI stays dumb and explicit:
 * collision handling belongs to the caller (`start` refuses an existing slug
 * rather than silently suffixing `-2`, and prepends the `YYYY-MM-DD-` date that
 * keeps `listBuilds`' lexical sort chronological). A title with no alphanumerics
 * yields `''`, which the caller must reject or override.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The Conventional-Commit scope for a build: its slug with the `YYYY-MM-DD-`
 * date prefix `start` prepends stripped off.
 *
 * `2026-07-18-escape-hatch` yields the human-meaningful `escape-hatch`. Null
 * when no build resolves (`--local`, or a slug that is nothing but a date); the
 * caller then omits the `(scope)` segment, which Conventional Commits permit.
 */
export function buildScope(slug: string | null): string | null {
  if (slug === null) {
    return null
  }
  const stripped = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  return stripped.length > 0 ? stripped : null
}

/**
 * Existing build slugs: the directory names under `builds/`, sorted.
 *
 * Empty when `builds/` is absent (a `--local` repo, or before the first tracked
 * `start`).
 */
export function listBuilds(root: string): ReadonlyArray<string> {
  try {
    return readdirSync(buildsDir(root), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * Resolve which build a verb acts on: an explicit `--build <slug>` flag → the
 * cursor in STATE → the sole build in `builds/` → null (the caller then refuses
 * with a hint).
 *
 * One-active-per-worktree holds by construction: the cursor is STATE's
 * single-line content, so it can never point at two builds.
 */
export function activeBuild(root: string, flag?: string): string | null {
  if (flag !== undefined && flag.length > 0) return flag
  const cursor = readCursor(root)
  if (cursor !== null) return cursor
  const builds = listBuilds(root)
  return builds.length === 1 ? (builds[0] ?? null) : null
}

/**
 * STATE's content (the active-build cursor) or null when it names no build.
 *
 * Empty means "no build" (--local, or a session whose cursor is unset), so
 * activeBuild falls through to the sole-build rule. The literal value `active`
 * is reserved and reads as unset: a legacy STATE layout wrote it as a bare
 * sentinel (the cursor lived elsewhere then), and treating it as a cursor would
 * send the tool chasing a build named "active". No derived slug collides with it
 * (they carry a YYYY-MM-DD- prefix).
 */
function readCursor(root: string): string | null {
  let content: string
  try {
    content = readFileSync(statePath(root), 'utf8').trim()
  } catch {
    return null
  }
  return content.length > 0 && content !== 'active' ? content : null
}

/**
 * The build a verb should act on, plus its argv with the `--build <slug>` pair
 * stripped.
 *
 * Every verb resolves through this: an explicit `--build <slug>` wins, else the
 * cursor / sole-build fallback of `activeBuild`. `rest` matters because the slug
 * is a bare token: scanning positionals on the raw argv would let it masquerade
 * as a step number or a spike slug, so callers scan `rest` instead.
 */
export function resolveBuild(
  root: string,
  args: ReadonlyArray<string>,
): { readonly build: string | null; readonly rest: ReadonlyArray<string> } {
  const i = args.indexOf('--build')
  if (i === -1) return { build: activeBuild(root), rest: args }
  return { build: activeBuild(root, args[i + 1]), rest: [...args.slice(0, i), ...args.slice(i + 2)] }
}

/**
 * The STATE file: session sentinel and active-build cursor in one.
 */
function statePath(root: string): string {
  return join(root, DIRNAME, 'STATE')
}

/**
 * Where a build's artifacts and in-flight markers live: the `builds/<slug>/`
 * folder for the resolved build, else the flat sidecar root.
 *
 * `slug` is the value the verb already resolved via `resolveBuild`/`activeBuild`;
 * omit it and the dir resolves from the cursor (the default the
 * executor-agnostic path reads lean on). Either way a `null` slug falls back to
 * the flat sidecar root, which covers the `--local` layout and any
 * no-cursor/no-build repo: the path reads stay stable even before a tracked
 * build exists or when a "no active session" guard is about to fire.
 */
function artifactDir(root: string, slug?: string | null): string {
  const resolved = slug === undefined ? activeBuild(root) : slug
  return resolved === null ? sidecarDir(root) : buildDir(root, resolved)
}

/**
 * The resolved build's artifact folder: the `builds/<slug>/` dir for the active
 * build (or the flat sidecar root under `--local`/no-cursor).
 *
 * Public so the plan-approval commit can stage exactly this build's scaffold and
 * nothing else; `slug` follows the same resolution as the path helpers above.
 */
export function buildFolder(root: string, slug?: string | null): string {
  return artifactDir(root, slug)
}

/**
 * The SPIKE marker: a single-purpose presence flag, like SEAM/STEP.
 *
 * Written by `spike` on open, removed on `spike done`. Its existence is the one
 * signal the dashboard and the spike gates read to know "a spike is active".
 */
export function spikePath(root: string, slug?: string | null): string {
  return join(artifactDir(root, slug), 'SPIKE')
}

/**
 * SEAM: the in-flight step's edit grant: a plain list of the paths the step may
 * touch, one per line, so the hooks read it with a grep and no markdown parsing.
 */
export function seamPath(root: string, slug?: string | null): string {
  return join(artifactDir(root, slug), 'SEAM')
}

/**
 * Remove the SEAM marker: `abandon` drops the in-flight step's edit grant, the
 * same clear `checkpoint` and `revert` do inline. Homed here so a verb not
 * sanctioned to delete on its own can still return to the boundary; absent is a
 * no-op.
 */
export function clearSeam(root: string, slug?: string | null): void {
  rmSync(seamPath(root, slug), { force: true })
}

/**
 * STEP: the number of the step in flight, a bare number in a flat file.
 */
export function stepPath(root: string, slug?: string | null): string {
  return join(artifactDir(root, slug), 'STEP')
}

/**
 * Remove the STEP marker alongside SEAM, dropping the build back to the DESIGN
 * boundary; absent is a no-op.
 */
export function clearStep(root: string, slug?: string | null): void {
  rmSync(stepPath(root, slug), { force: true })
}

/**
 * The build's `checkpoints` ledger: the recorded SHAs of landed plan and step
 * commits, one line each.
 */
export function checkpointsPath(root: string, slug?: string | null): string {
  return join(artifactDir(root, slug), 'checkpoints')
}

/**
 * intent.md: the build's plan: steps, seams, decisions, done-when.
 */
export function intentPath(root: string, slug?: string | null): string {
  return join(artifactDir(root, slug), 'intent.md')
}

/**
 * build-log.md: the human-facing build ledger (the Steps mirror and the Log).
 */
export function buildLogPath(root: string, slug?: string | null): string {
  return join(artifactDir(root, slug), 'build-log.md')
}

/**
 * report.md: the close-out report, beside intent.md / build-log.md.
 *
 * The finish skill writes it and `finish` commits it with the folder; the
 * tracked build folder is the archive, so the report rides the branch into the
 * PR rather than living in some local-only copy.
 */
export function reportPath(root: string, slug?: string | null): string {
  return join(artifactDir(root, slug), 'report.md')
}

// --- Spike reports: `spike-NN-<slug>.md` files in the build folder, beside
// report.md. One per spike (an explicit `/plumbbob:spike` or a planned `spike:` step)
// so a build with several forks tells its decision history through the folder
// listing. NN is CLI-allocated (the human never numbers them), zero-padded for a
// stable sort. ---

/**
 * The existing spike-report filenames in the build folder, sorted.
 *
 * Empty when the folder is absent or holds none.
 */
export function listSpikeReports(root: string, slug?: string | null): ReadonlyArray<string> {
  try {
    return readdirSync(artifactDir(root, slug))
      .filter((name) => /^spike-\d\d-.+\.md$/.test(name))
      .sort()
  } catch {
    return []
  }
}

/**
 * The path for a NEW spike report: the next free zero-padded index and the
 * sanitized spike slug.
 *
 * One past the highest existing NN, so a gap never reallocates a number. Pure
 * allocation: the caller writes the stamped template there.
 */
export function nextSpikeReportPath(root: string, slug: string | null, spikeSlug: string): string {
  const used = listSpikeReports(root, slug).map((name) => Number(name.slice('spike-'.length, 'spike-'.length + 2)))
  const next = (used.length > 0 ? Math.max(...used) : 0) + 1
  const nn = String(next).padStart(2, '0')
  return join(artifactDir(root, slug), `spike-${nn}-${spikeSlug}.md`)
}

/**
 * handoff.json: the agent-run ledger.
 *
 * Each `agent run` appends its validated envelope here so a later invocation can
 * thread earlier results into the next call's `context[]`: the CLI itself is
 * memoryless between runs, and the file survives context-window compaction where
 * inline stdout does not. It is in-flight control state like STEP/SEAM:
 * untracked (excludeControl), scoped to the current step, cleared when the step
 * checkpoints (`clearHandoff`).
 */
export function handoffPath(root: string, slug?: string | null): string {
  return join(artifactDir(root, slug), 'handoff.json')
}

/**
 * One handoff entry: the agent's name, the slot it ran in, the step number, and
 * its validated envelope: enough for a reading skill to know which earlier run
 * produced which result. `envelope` is the same object `agent run` re-emits on
 * stdout; the shape is intentionally loose here (the sidecar is a single writer
 * and never re-validates its own ledger).
 */
export type HandoffEntry = {
  readonly agent: string
  readonly mode: string
  readonly step: number
  readonly envelope: unknown
}

/**
 * Append one entry to the build's handoff.json.
 *
 * Creates the file (as a JSON array) when absent and tolerates a malformed
 * existing file by starting fresh: a corrupt ledger must never wedge a run.
 * Pretty-printed so it stays readable.
 */
export function appendHandoff(root: string, slug: string | null | undefined, entry: HandoffEntry): void {
  const path = handoffPath(root, slug)
  let entries: unknown[] = []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (Array.isArray(parsed)) entries = parsed
  } catch {
    entries = []
  }
  entries.push(entry)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`)
}

/**
 * Remove the build's handoff.json: the step-scoped ledger clears when the step
 * checkpoints, the same beat that clears STEP/SEAM.
 *
 * An absent file is a no-op (`force`).
 */
export function clearHandoff(root: string, slug?: string | null): void {
  rmSync(handoffPath(root, slug), { force: true })
}

// --- Per-build stats: the build's own receipt. One tracked stats.json beside
// checkpoints: it rides the branch, because the numbers are the record's
// evidence. Keyed by step number; accrued at the beats the CLI already owns
// (build stamps startedAt, checkpoint bumps/lands, revert bumps). Single-writer
// and malformed-tolerant like handoff.json: a corrupt file starts fresh, and no
// helper here may ever wedge the verb that called it. ---

export type StepStats = {
  readonly redChecks?: number
  readonly driftWarnings?: number
  readonly reverts?: number
  readonly abandons?: number
  readonly startedAt?: string
  readonly landedAt?: string
}

export type BuildStats = Readonly<Record<string, StepStats>>

/**
 * stats.json: the per-build stats receipt, beside checkpoints.
 */
export function statsPath(root: string, slug?: string | null): string {
  return join(artifactDir(root, slug), 'stats.json')
}

/**
 * The whole stats file, or {} when absent or corrupt: malformed contributes
 * nothing.
 */
export function readStats(root: string, slug?: string | null): BuildStats {
  try {
    const parsed = JSON.parse(readFileSync(statsPath(root, slug), 'utf8')) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as BuildStats) : {}
  } catch {
    return {}
  }
}

/**
 * Increment one counter on one step.
 *
 * Best-effort by contract: a failed write is swallowed; the stats are a
 * receipt, never a gate on the verb that accrues them.
 */
export function bumpStepStat(
  root: string,
  slug: string | null | undefined,
  step: number,
  key: 'redChecks' | 'driftWarnings' | 'reverts' | 'abandons',
): void {
  patchStepStat(root, slug, step, (current) => ({ [key]: (current[key] ?? 0) + 1 }))
}

/**
 * Stamp one timestamp on one step: startedAt at `build <n>`, landedAt at
 * checkpoint.
 *
 * Same best-effort contract as bumpStepStat.
 */
export function stampStepStat(
  root: string,
  slug: string | null | undefined,
  step: number,
  key: 'startedAt' | 'landedAt',
  value: string,
): void {
  patchStepStat(root, slug, step, () => ({ [key]: value }))
}

/**
 * Read-modify-write one step's stats entry, swallowing any failure.
 *
 * The catch is deliberate: the stats are a receipt, and a failed write must
 * never wedge the build/checkpoint/revert verb that accrued it.
 */
function patchStepStat(
  root: string,
  slug: string | null | undefined,
  step: number,
  patch: (current: StepStats) => Partial<StepStats>,
): void {
  try {
    const stats = readStats(root, slug)
    const current = stats[String(step)] ?? {}
    const next = { ...stats, [String(step)]: { ...current, ...patch(current) } }
    const path = statsPath(root, slug)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`)
  } catch {
    // Best-effort receipt: never wedge build/checkpoint/revert over it.
  }
}

/**
 * A session exists iff STATE exists.
 *
 * Deleting STATE (at finish) is what flips the repo back to "no session": the
 * file is the single source of truth for "is there a session". `start` calls
 * beginSession; `finish` removes the file. Existence is the whole session
 * signal; STATE's content is a separate axis (the cursor).
 */
export function hasSession(root: string): boolean {
  return existsSync(statePath(root))
}

/**
 * Open the session and point its cursor at `slug`.
 *
 * Null under --local / no build, which leaves STATE present but empty so
 * activeBuild falls through to the sole-build rule. `finish` removes the file,
 * closing the session and clearing the cursor in one delete.
 */
export function beginSession(root: string, slug: string | null = null): void {
  writeCursor(root, slug)
}

/**
 * Re-point the cursor at an existing build (`use`): a plain content rewrite
 * that leaves the session sentinel (STATE's existence) intact.
 *
 * Callers guard hasSession first, so this never resurrects a finished session.
 */
export function setActiveBuild(root: string, slug: string): void {
  writeCursor(root, slug)
}

/**
 * Write STATE's content: empty for no build, else the slug plus newline.
 */
function writeCursor(root: string, slug: string | null): void {
  writeFileSync(statePath(root), slug === null ? '' : `${slug}\n`)
}

/**
 * True while a spike is open: the SPIKE marker exists (content is irrelevant).
 */
export function inSpike(root: string, slug?: string | null): boolean {
  return existsSync(spikePath(root, slug))
}

/**
 * Drop the SPIKE marker: existence is the whole signal.
 */
export function markSpike(root: string, slug?: string | null): void {
  writeFileSync(spikePath(root, slug), 'active\n')
}

/**
 * Remove the SPIKE marker (`spike done`); absent is a no-op.
 */
export function clearSpike(root: string, slug?: string | null): void {
  rmSync(spikePath(root, slug), { force: true })
}

// --- The turn ledger: the checkpoint latch's inputs. `.plumbbob/TURN` is a count
// of human prompts the model never writes, with a one-turn `.plumbbob/GRANT`
// beside it: both flat, per-worktree control (never per-build, never committed).
// `plumbbob turn` (the UserPromptSubmit hook) ticks TURN once per human prompt
// and rewrites GRANT from the literal prompt; the checkpoint latch reads them to
// refuse a land until a human turn has intervened since the step was entered.
// Kept in the sidecar so the lone GRANT `rmSync` stays where deletions of control
// state are allowed. ---

/**
 * TURN: the human-turn count the UserPromptSubmit hook maintains.
 */
export function turnPath(root: string): string {
  return join(root, DIRNAME, 'TURN')
}

/**
 * GRANT: the one-turn self-approval minted from the human's literal prompt.
 */
export function grantPath(root: string): string {
  return join(root, DIRNAME, 'GRANT')
}

/**
 * Rewrite (or clear) the one-turn GRANT: a non-null value is the minted grant
 * (`auto` | `range M`), null clears it.
 *
 * The turn hook calls this on every human prompt (minted on a match, cleared
 * otherwise) so a grant lives exactly one turn by construction. Pairing the
 * write with its delete here means a grant can never half-persist, and the
 * delete lives where deletions belong.
 */
export function setGrant(root: string, grant: string | null): void {
  if (grant === null) {
    rmSync(grantPath(root), { force: true })
  } else {
    writeFileSync(grantPath(root), `${grant}\n`)
  }
}

/**
 * TICK: the per-build entry stamp: the TURN value recorded when work was
 * entered (`build <n>` for a step, `start` for the plan), cleared when
 * `checkpoint` lands.
 *
 * The checkpoint latch compares TURN against it to know whether a human turn
 * intervened across the entry→checkpoint span.
 */
export function tickPath(root: string, slug?: string | null): string {
  return join(artifactDir(root, slug), 'TICK')
}

/**
 * Stamp TICK with the current TURN.
 *
 * Stamped only when TURN holds a readable count: a host with no hooks never
 * grows a ledger, so the latch stays dormant there instead of wedging.
 */
export function stampTick(root: string, slug?: string | null): void {
  const turn = readTurn(root)
  if (turn === null) return
  writeFileSync(tickPath(root, slug), `${turn}\n`)
}

/**
 * Consume the entry stamp: `checkpoint` clears it when a step (or the plan)
 * lands, the same beat that clears STEP/SEAM/handoff.
 *
 * Absent is a no-op; the rmSync lives here with the sidecar's other deletions.
 */
export function clearTick(root: string, slug?: string | null): void {
  rmSync(tickPath(root, slug), { force: true })
}

/**
 * The TURN count, or null when the ledger is absent or unreadable.
 *
 * Absence is the "dormant" signal stampTick keys off and the doctor latch probe
 * reports: never an error.
 */
export function readTurn(root: string): number | null {
  try {
    const n = Number.parseInt(readFileSync(turnPath(root), 'utf8').trim(), 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

/**
 * Walk up from `cwd` to the nearest ancestor with an active session (a
 * `.plumbbob/STATE` file), or null when there is none.
 *
 * The turn hook runs on every human prompt in every repo; this is the cheap,
 * git-free probe that keeps it a silent no-op outside a live plumbbob session:
 * filesystem only, never a host sniff.
 */
export function findSessionRoot(cwd: string): string | null {
  let dir = cwd
  let parent = dirname(dir)
  while (dir !== parent) {
    if (hasSession(dir)) return dir
    dir = parent
    parent = dirname(dir)
  }
  return hasSession(dir) ? dir : null
}

/**
 * Append `patterns` to the repo's info/exclude, each at most once.
 *
 * Idempotent: a re-`start` after finish must not double-add. `gitPath` resolves
 * to the *common* gitdir's exclude (the only one git reads) so this works from
 * a linked worktree, whose per-worktree gitdir has no `info/`. info/exclude
 * keeps the exclusion personal machinery, never something imposed on the repo's
 * own tracked ignore file.
 */
function addExcludes(root: string, patterns: ReadonlyArray<string>): void {
  const exclude = gitPath(root, 'info/exclude')
  mkdirSync(dirname(exclude), { recursive: true })
  let current = ''
  try {
    current = readFileSync(exclude, 'utf8')
  } catch {
    current = ''
  }
  const present = new Set(current.split('\n').map((line) => line.trim()))
  const missing = patterns.filter((pattern) => !present.has(pattern))
  if (missing.length === 0) return
  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : ''
  appendFileSync(exclude, `${prefix}${missing.join('\n')}\n`)
}

/**
 * Git-exclude the control plane while the artifact plane stays tracked.
 *
 * With `builds/<slug>/` tracked, only the per-worktree control files are
 * excluded: the session sentinel STATE (whose content is the active-build
 * cursor), the personal settings overlay, the turn ledger, and the in-flight
 * markers inside every build. Everything else under `.plumbbob/` (settings.json,
 * and each build's intent/build-log/checkpoints/report) rides the branch into
 * the PR.
 */
export function excludeControl(root: string): void {
  addExcludes(root, [
    `${DIRNAME}/STATE`,
    `${DIRNAME}/settings.local.json`,
    // The turn ledger and its one-turn grant: per-worktree control the model
    // never writes, and never commits.
    `${DIRNAME}/TURN`,
    `${DIRNAME}/GRANT`,
    `${DIRNAME}/builds/*/STEP`,
    `${DIRNAME}/builds/*/SEAM`,
    `${DIRNAME}/builds/*/SPIKE`,
    // The entry stamp is in-flight control like STEP/SEAM: checkpoint's
    // stageAll must never sweep it into a step commit.
    `${DIRNAME}/builds/*/TICK`,
    // The agent-run handoff ledger is step-scoped in-flight state, not a
    // tracked artifact: it must never ride a step commit into the PR.
    `${DIRNAME}/builds/*/handoff.json`,
    // The checkride gate writes raw tool output to `.check/`; checkpoint's
    // stageAll must never sweep it into a step commit.
    '.check/',
  ])
}

/**
 * `start --local`: opt out of the tracked layout into a fully untracked sidecar:
 * some team repos won't accept tool folders in-tree.
 *
 * Excludes the whole `.plumbbob/` directory.
 */
export function excludeSidecar(root: string): void {
  addExcludes(root, [`${DIRNAME}/`, '.check/'])
}

/**
 * Whether info/exclude already carries `pattern` verbatim.
 *
 * Absent or unreadable reads as "no": the caller's job is to write it, not to
 * fail on a repo that has never been excluded.
 */
function hasExclude(root: string, pattern: string): boolean {
  try {
    return readFileSync(gitPath(root, 'info/exclude'), 'utf8')
      .split('\n')
      .some((line) => line.trim() === pattern)
  } catch {
    return false
  }
}

/**
 * Re-apply the control-plane excludes on the way into a `git add -A`.
 *
 * `start` writes them once, but a plumbbob upgraded mid-build can add a control
 * file the running session's exclude never learned (TICK, GRANT and
 * handoff.json all arrived that way) and checkpoint/finish stage with `-A`,
 * which would sweep the unexcluded file into the commit and ride it into the PR.
 * Idempotent, so the common path is one read and no write.
 *
 * A fully untracked sidecar is already covered by its blanket `.plumbbob/` line;
 * layering the narrow patterns underneath would only add noise, so skip it. That
 * check reads info/exclude rather than the cursor because a null cursor means
 * "`--local` OR no build named", and calling excludeSidecar on the tracked
 * layout would untrack the whole artifact plane.
 */
export function refreshExcludes(root: string): void {
  if (hasExclude(root, `${DIRNAME}/`)) return
  excludeControl(root)
}
