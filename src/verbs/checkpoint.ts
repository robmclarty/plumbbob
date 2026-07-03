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
import { commit, findRepoRoot, headSha, isDirty, stageAll, stagedStat } from '../lib/git.ts'
import { buildLogPath, checkpointsPath, hasSession, intentPath, seamPath, stepPath } from '../lib/sidecar.ts'
import { runCheck } from '../lib/check.ts'
import { markStepDone, parseSteps } from '../lib/orient.ts'
import { parseStepSeam } from '../lib/intent.ts'
import { appendToSection, checkpointLogLine } from '../lib/buildlog.ts'

export function checkpoint(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
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
