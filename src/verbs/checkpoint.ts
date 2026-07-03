// `plumbbob checkpoint [<n>] [-m <msg>]` — the executor-agnostic commit tick (D3).
// It does NOT require a STEP file: the step is whatever you pass,
// else the in-flight STEP, else the next undone step in intent. It gates on a green
// check, then commits any pending work (or records the existing HEAD when the tree
// is already clean — the human's commit skill may have committed first), records the
// SHA, flips the intent checkbox to `[x]`, and clears any STEP/SEAM (which returns
// the dashboard to the DESIGN boundary). The diff's author is irrelevant:
// `/plumbbob:pb-build`, your hands, a vibe session, or another harness all checkpoint
// the same way.

import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { commit, findRepoRoot, headSha, isDirty, stageAll, stagePath, stagedPaths, stagedStat } from '../lib/git.ts'
import { buildFolder, buildLogPath, checkpointsPath, hasSession, intentPath, seamPath, stepPath } from '../lib/sidecar.ts'
import { runCheck } from '../lib/check.ts'
import { markStepDone, parseSteps, parseTitle } from '../lib/orient.ts'
import { parseStepSeam, scopeDrift } from '../lib/intent.ts'
import { appendToSection, checkpointLogLine } from '../lib/buildlog.ts'

export function checkpoint(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  if (args.includes('--plan')) {
    return checkpointPlan(root, args)
  }

  const step = resolveStep(root, args)
  if (step === null) {
    process.stderr.write('plumbbob: no step to checkpoint — pass a number, or plan a step in intent.md first.\n')
    return 1
  }

  if (runCheck(root) !== 0) {
    process.stderr.write('plumbbob: check failed (red) — checkpoint refuses on red. Fix it and re-run.\n')
    return 1
  }

  let sha: string
  if (isDirty(root)) {
    stageAll(root)
    warnScopeDrift(root, step)
    const body = bodyArg(args) ?? fallbackBody(root, step)
    sha = commit(root, messageArg(args) ?? subjectForStep(root, step), body)
  } else {
    sha = headSha(root)
  }

  appendFileSync(checkpointsPath(root), `step ${step} ${sha}\n`)
  flipIntent(root, step)
  logCheckpoint(root, step, sha)
  rmSync(seamPath(root), { force: true })
  rmSync(stepPath(root), { force: true })

  process.stdout.write(`plumbbob: step ${step} checkpointed — ${sha.slice(0, 9)}. Back at the boundary.\n`)
  return 0
}

// The plan-approval commit (D11): stage only the active build's artifact folder and
// commit it as `plumbbob: plan — <title>`, then record a `plan <sha>` line. Giving
// the plan its own commit keeps the first step's diff from absorbing the scaffold, so
// `git log` reads baseline → plan → steps. No check gate (there is no code work to
// verify yet), no intent flip, no step markers — the plan lives entirely in DESIGN.
// An optional `--body` (stdin heredoc, D5) rides along; the folder is whitelisted
// artifact plane, so there is no scope-drift to warn about.
function checkpointPlan(root: string, args: ReadonlyArray<string>): number {
  stagePath(root, buildFolder(root))
  const sha = commit(root, planSubject(root), bodyArg(args) ?? undefined)
  appendFileSync(checkpointsPath(root), `plan ${sha}\n`)
  process.stdout.write(`plumbbob: plan committed — ${sha.slice(0, 9)}. Baseline → plan → steps.\n`)
  return 0
}

// The plan commit's CLI-owned subject: the intent's `# <title>`, else a bare
// `plumbbob: plan` when the title can't be read (mirrors `subjectForStep`'s fallback).
function planSubject(root: string): string {
  let title: string | null = null
  try {
    title = parseTitle(readFileSync(intentPath(root), 'utf8'))
  } catch {
    title = null
  }
  return title ? `plumbbob: plan — ${title}` : 'plumbbob: plan'
}

// Step resolution (D3): explicit arg > in-flight STEP file > first undone step in
// intent.md. Returns null when none can be determined.
function resolveStep(root: string, args: ReadonlyArray<string>): number | null {
  const explicit = args.find((a) => /^\d+$/.test(a))
  if (explicit !== undefined) {
    return Number(explicit)
  }
  const inFlight = readStep(root)
  if (inFlight !== null) {
    return inFlight
  }
  try {
    return parseSteps(readFileSync(intentPath(root), 'utf8')).find((s) => !s.done)?.n ?? null
  } catch {
    return null
  }
}

// Guidance, not a gate (the enforce→guide pivot): warn when the staged tree reaches
// beyond the step's seam, then commit anyway. The seam comes from the in-flight SEAM
// file when a build is live, else the step's declared seam in intent.md. Plumbbob's
// own artifact plane is whitelisted (`scopeDrift`), so the `[x]` flip and build-log
// line this very checkpoint stages never read as drift. No seam ⇒ no warning.
function warnScopeDrift(root: string, step: number): void {
  const seam = seamTokens(root, step)
  const outside = scopeDrift(stagedPaths(root), seam)
  if (outside.length > 0) {
    process.stderr.write(
      `plumbbob: heads-up — staged paths outside step ${step}'s seam: ${outside.join(', ')}. ` +
        `The checkpoint captures them; if that's real scope drift, the plan may need a \`/plumbbob:pb-step\` revision.\n`,
    )
  }
}

// The seam tokens for the in-flight step: the normalized SEAM file `build` wrote
// (authoritative while a build is live), falling back to the step's declared seam
// parsed from intent.md. Empty when neither resolves — the caller then skips the
// warning rather than flagging the whole tree.
function seamTokens(root: string, step: number): ReadonlyArray<string> {
  try {
    const fromFile = readFileSync(seamPath(root), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (fromFile.length > 0) {
      return fromFile
    }
  } catch {
    // no SEAM file — fall through to the declared seam.
  }
  return seamForStep(root, step)
}

function flipIntent(root: string, step: number): void {
  try {
    writeFileSync(intentPath(root), markStepDone(readFileSync(intentPath(root), 'utf8'), step))
  } catch {
    // best-effort bookkeeping; the checkpoint SHA is the source of truth.
  }
}

// Append a dated line to the build-log's `## Log` so the build's history accrues at
// each checkpoint instead of being reconstructed at wrap. The step's title is lifted
// from intent.md when still present. Best-effort: a missing/odd build-log never blocks
// a checkpoint — the `checkpoints` SHA is the source of truth.
function logCheckpoint(root: string, step: number, sha: string): void {
  try {
    const path = buildLogPath(root)
    const date = new Date().toISOString().slice(0, 10)
    const line = checkpointLogLine(date, step, sha, titleForStep(root, step))
    const updated = appendToSection(readFileSync(path, 'utf8'), 'Log', line)
    if (updated !== null) {
      writeFileSync(path, updated)
    }
  } catch {
    // best-effort ledger; never fail a checkpoint over the build-log.
  }
}

// The CLI-owned, deterministic commit subject: the step's title when intent.md still
// carries one, else the bare `plumbbob: step N done` fallback (D5 — the CLI owns the
// subject; a `-m` override or `--body` prose is a separate concern).
function subjectForStep(root: string, step: number): string {
  const title = titleForStep(root, step)
  return title ? `plumbbob: step ${step} — ${title}` : `plumbbob: step ${step} done`
}

function titleForStep(root: string, step: number): string | null {
  try {
    return parseSteps(readFileSync(intentPath(root), 'utf8')).find((s) => s.n === step)?.title ?? null
  } catch {
    return null
  }
}

function messageArg(args: ReadonlyArray<string>): string | null {
  const i = args.indexOf('-m')
  return i !== -1 && i + 1 < args.length ? (args[i + 1] ?? null) : null
}

// `--body` reads the commit body from stdin (the single-quoted heredoc of D5),
// so the skill can compose proportional prose the CLI never could. Returns null
// when the flag is absent or stdin is empty — either way the deterministic
// fallback body takes over. Reading fd 0 blocks until EOF, which the heredoc
// supplies; a read error (no stdin attached) degrades to the fallback.
function bodyArg(args: ReadonlyArray<string>): string | null {
  if (!args.includes('--body')) {
    return null
  }
  try {
    const raw = readFileSync(0, 'utf8').trimEnd()
    return raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

// The deterministic checkpoint body (D6): the step's done-when, its seam, and the
// staged diffstat — so a hand-built or vibed checkpoint still gets informative
// history without a model turn. Each part is best-effort; a missing piece is
// simply omitted, and an empty result leaves the commit body blank.
function fallbackBody(root: string, step: number): string | undefined {
  const parts: string[] = []
  const doneWhen = doneWhenForStep(root, step)
  if (doneWhen !== null) {
    parts.push(`done when: ${doneWhen}`)
  }
  const seam = seamForStep(root, step)
  if (seam.length > 0) {
    parts.push(`seam: ${seam.join(', ')}`)
  }
  const stat = safeStagedStat(root)
  if (stat.length > 0) {
    parts.push(stat)
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

function doneWhenForStep(root: string, step: number): string | null {
  try {
    return parseSteps(readFileSync(intentPath(root), 'utf8')).find((s) => s.n === step)?.doneWhen ?? null
  } catch {
    return null
  }
}

function seamForStep(root: string, step: number): ReadonlyArray<string> {
  try {
    const parsed = parseStepSeam(readFileSync(intentPath(root), 'utf8'), step)
    return parsed.ok ? parsed.seam : []
  } catch {
    return []
  }
}

function safeStagedStat(root: string): string {
  try {
    return stagedStat(root)
  } catch {
    return ''
  }
}

function readStep(root: string): number | null {
  try {
    const raw = readFileSync(stepPath(root), 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}
