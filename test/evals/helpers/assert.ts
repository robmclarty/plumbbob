// Mechanical assertion readers for the eval contracts (intent C1): every
// function here reads git or the sidecar and returns plain data — nothing is
// judged, and nothing imports src/ (a product parser bug must surface as a
// failed contract, not hide inside a shared parser). The `Check` record is the
// unit the runner aggregates.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVAL_SLUG } from './fixture.ts'

// required — decides pass/fail. validity — a failed precondition ("the model
// did no work") makes the run `invalid`, not `pass` or `fail`. info — string
// probes and latch-legal judgment calls: reported, never gating (C1).
export type CheckKind = 'required' | 'validity' | 'info'

export type Check = {
  readonly name: string
  readonly pass: boolean
  readonly kind: CheckKind
  readonly detail?: string
}

export function check(name: string, pass: boolean, detail?: string): Check {
  return { name, pass, kind: 'required', ...(detail === undefined ? {} : { detail }) }
}

export function validity(name: string, pass: boolean, detail?: string): Check {
  return { name, pass, kind: 'validity', ...(detail === undefined ? {} : { detail }) }
}

export function info(name: string, pass: boolean, detail?: string): Check {
  return { name, pass, kind: 'info', ...(detail === undefined ? {} : { detail }) }
}

// --- raw reads ---------------------------------------------------------------

function git(repo: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
}

function readOr(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function buildPath(repo: string, name: string): string {
  return join(repo, '.plumbbob', 'builds', EVAL_SLUG, name)
}

// Control files read as trimmed strings, null when absent — TURN/GRANT live at
// the worktree root, TICK/STEP inside the build folder.
function controlOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return null
  }
}

// --- the snapshot ------------------------------------------------------------

export type Snapshot = {
  readonly headSha: string
  readonly commitCount: number
  readonly checkpoints: string
  readonly intent: string
  readonly buildLog: string
  readonly fingerprint: Fingerprint
  readonly turn: string | null
  readonly grant: string | null
  readonly tick: string | null
  readonly step: string | null
}

export function snapshot(repo: string): Snapshot {
  return {
    headSha: git(repo, ['rev-parse', 'HEAD']),
    commitCount: Number(git(repo, ['rev-list', '--count', 'HEAD'])),
    checkpoints: readOr(buildPath(repo, 'checkpoints')),
    intent: readOr(buildPath(repo, 'intent.md')),
    buildLog: readOr(buildPath(repo, 'build-log.md')),
    fingerprint: worktreeFingerprint(repo),
    turn: controlOrNull(join(repo, '.plumbbob', 'TURN')),
    grant: controlOrNull(join(repo, '.plumbbob', 'GRANT')),
    tick: controlOrNull(buildPath(repo, 'TICK')),
    step: controlOrNull(buildPath(repo, 'STEP')),
  }
}

// --- ledger parsers (independent of src/lib — see header) --------------------

export type CheckpointLine = {
  readonly kind: 'baseline' | 'plan' | 'step'
  readonly step: number | null
  readonly sha: string
}

export function checkpointLines(repo: string): ReadonlyArray<CheckpointLine> {
  const lines: CheckpointLine[] = []
  for (const raw of readOr(buildPath(repo, 'checkpoints')).split('\n')) {
    const line = raw.trim()
    const step = /^step\s+(\d+)\s+(\S+)$/.exec(line)
    if (step !== null) {
      lines.push({ kind: 'step', step: Number(step[1]), sha: step[2] ?? '' })
      continue
    }
    const other = /^(baseline|plan)\s+(\S+)$/.exec(line)
    if (other !== null) {
      lines.push({ kind: other[1] as 'baseline' | 'plan', step: null, sha: other[2] ?? '' })
    }
  }
  return lines
}

// The `N. [ ]` / `N. [x]` boxes under intent's `## Steps` — the flip is what
// checkpoint records, so an unexpected `[x]` is a landed step.
export function intentBoxes(repo: string): ReadonlyMap<number, boolean> {
  const boxes = new Map<number, boolean>()
  let inSteps = false
  for (const raw of readOr(buildPath(repo, 'intent.md')).split('\n')) {
    if (/^##\s+Steps\b/.test(raw)) {
      inSteps = true
      continue
    }
    if (inSteps && /^##\s/.test(raw)) break
    const m = /^\s*(\d+)\.\s+\[([ xX])\]/.exec(raw)
    if (inSteps && m !== null) boxes.set(Number(m[1]), m[2] !== ' ')
  }
  return boxes
}

// Bullets under the build-log's `## Park list` — a *captured* deferral. Prose
// that merely says "let's defer that" writes no line here.
export function parkLines(repo: string): ReadonlyArray<string> {
  const lines: string[] = []
  let inPark = false
  for (const raw of readOr(buildPath(repo, 'build-log.md')).split('\n')) {
    if (/^##\s+Park list\b/.test(raw)) {
      inPark = true
      continue
    }
    if (inPark && /^##\s/.test(raw)) break
    if (inPark && /^\s*-\s+\[[ xX]\]/.test(raw.trimEnd())) lines.push(raw.trim())
  }
  return lines
}

// Commits on HEAD since `sinceSha` whose SHA the checkpoints ledger does not
// record — the raw-commit detector every contract carries.
export function unledgeredCommits(repo: string, sinceSha: string): ReadonlyArray<string> {
  const listed = git(repo, ['rev-list', `${sinceSha}..HEAD`])
  if (listed.length === 0) return []
  const ledger = readOr(buildPath(repo, 'checkpoints'))
  return listed.split('\n').filter((sha) => !ledger.includes(sha))
}

// --- worktree identity --------------------------------------------------------

export type Fingerprint = {
  readonly diffHash: string // sha256 of `git diff HEAD` minus the ignored trees
  readonly porcelain: ReadonlyArray<string> // status lines, ignored trees dropped
}

const DEFAULT_IGNORE = ['.plumbbob/', '.check/'] as const

// The spine of "this turn authored nothing": identical diff hash + identical
// porcelain across the turn, ignoring plumbbob's own artifact plane (a park
// line or a status flip is a legitimate turn effect, a source edit is not).
export function worktreeFingerprint(
  repo: string,
  ignore: ReadonlyArray<string> = DEFAULT_IGNORE,
): Fingerprint {
  const excludes = ignore.map((prefix) => `:(exclude)${prefix}`)
  const diff = execFileSync('git', ['-C', repo, 'diff', 'HEAD', '--', '.', ...excludes], { encoding: 'utf8' })
  const porcelain = execFileSync(
    'git',
    ['-C', repo, 'status', '--porcelain', '--untracked-files=all', '--', '.', ...excludes],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((line) => line.length > 0)
  return { diffHash: createHash('sha256').update(diff).digest('hex'), porcelain }
}

// --- gate + seam probes --------------------------------------------------------

// Run the fixture's gate exactly as checkpoint does (`node check.js`, repo cwd).
export function gateIsRed(repo: string): boolean {
  try {
    execFileSync('node', ['check.js'], { cwd: repo, stdio: 'ignore' })
    return false
  } catch {
    return true
  }
}

// Dirty (changed or untracked) paths under the given prefixes — the validity
// probe: a run that "paused" without ever touching the step's seam did no work
// and is `invalid`, not `pass`.
export function dirtyPathsIn(repo: string, prefixes: ReadonlyArray<string>): ReadonlyArray<string> {
  const porcelain = execFileSync('git', ['-C', repo, 'status', '--porcelain', '--untracked-files=all'], {
    encoding: 'utf8',
  })
  const paths = porcelain
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).trim())
  return paths.filter((path) => prefixes.some((prefix) => path.startsWith(prefix)))
}

// File content, byte-exact, for "the gate script was not edited" checks.
export function fileContent(repo: string, rel: string): string {
  return readOr(join(repo, rel))
}
