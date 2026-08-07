// Mechanical assertion readers for the eval contracts (intent C1): every
// function here reads git or the sidecar and returns plain data — nothing is
// judged, and nothing imports src/ (a product parser bug must surface as a
// failed contract, not hide inside a shared parser). The `Check` record is the
// unit the runner aggregates.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
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

// Top-level `- ` bullets under intent's `## <section>`, the shape the glossed
// reference style is authored in. Wrapped continuation lines join with a space
// (a Decision may run past one line); indented sub-bullets (`- seam:`,
// `*plain:*`) belong to their parent and are skipped; a blank line ends the
// current bullet; the next `## ` heading ends the section.
//
// The heading must match exactly — the same rule the product's own scrape
// follows, so a merged `## Decisions & Constraints` reads as neither section
// and the run lands on validity (nothing authored where the loop looks) rather
// than passing on a heading plumbbob itself would not have found.
export function intentSectionBullets(repo: string, section: string): ReadonlyArray<string> {
  const bullets: string[] = []
  let inSection = false
  let current: string | null = null
  const flush = (): void => {
    if (current !== null) bullets.push(current.trim())
    current = null
  }
  for (const raw of readOr(buildPath(repo, 'intent.md')).split('\n')) {
    if (raw.trim() === `## ${section}`) {
      inSection = true
      continue
    }
    if (!inSection) continue
    if (/^##\s/.test(raw)) break
    if (raw.trim().length === 0) {
      flush()
      continue
    }
    const bullet = /^-\s+(.*)$/.exec(raw)
    if (bullet !== null) {
      flush()
      current = bullet[1] ?? ''
      continue
    }
    if (current !== null && /^\s+\S/.test(raw) && !/^\s+-\s/.test(raw)) current = `${current} ${raw.trim()}`
    else flush()
  }
  flush()
  return bullets
}

// The head of one authored bullet: `D1 (in-memory-bucket): …` parses with its
// slug, a bare `D1: …` parses with `slug: null` (that null IS the finding), and
// an unlabelled bullet parses as null. Kebab means lowercase words joined by
// hyphens — the shape templates/intent.md models.
export type BulletLabel = {
  readonly letter: 'D' | 'C' | 'Q'
  readonly n: number
  readonly slug: string | null
}

// Labelling and gloss are parsed separately on purpose: the opener match takes
// ANY parenthetical, then the kebab test decides whether it counts as a slug.
// Folding the shape into one regex would make `D4 (defaultWaves):` read as an
// unlabelled bullet — losing the distinction between "not a decision" and
// "a decision glossed the wrong way", which is the finding worth reporting.
const BULLET_LABEL = /^([DCQ])(\d+)(?:\s*\(([^)]*)\))?:\s/
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function bulletLabel(bullet: string): BulletLabel | null {
  const m = BULLET_LABEL.exec(bullet.trim())
  if (m === null) return null
  const gloss = m[3]
  return {
    letter: m[1] as 'D' | 'C' | 'Q',
    n: Number(m[2]),
    slug: gloss !== undefined && KEBAB.test(gloss) ? gloss : null,
  }
}

// Scaffold survivors from templates/intent.md: the literal `slug-here` example
// or a `<…>` angle-bracket placeholder. A bullet carrying one was never
// authored, so it must not count as house style.
//
// Code spans are stripped before the angle-bracket test, because authored prose
// legitimately writes `Map<string, number[]>` and `t <= now` inside backticks —
// a live sweep flagged exactly that as a false placeholder. A placeholder is
// prose the human was meant to replace, never code.
export function hasTemplatePlaceholder(bullet: string): boolean {
  const prose = bullet.replace(/`[^`]*`/g, '')
  return bullet.includes('slug-here') || /<[^>`]+>/.test(prose)
}

// The decay probe: `D4`/`C6`/`Q2` tokens that are NOT followed by their gloss,
// anywhere in the text — a reference site where the slug was dropped. Two
// deliberate exclusions: bullet openers (`D1 (slug): …` and bare `D1: …` alike,
// which the required checks already judge), and RANGES like `D1–D9`, where a
// per-item gloss is impossible and the compressed form is the house style.
export function bareRefs(text: string): ReadonlyArray<string> {
  const found: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/[DCQ]\d+\s*[–—-]\s*[DCQ]?\d+/g, '')
    if (/^-\s*[DCQ]\d+\b/.test(line)) continue
    for (const m of line.matchAll(/\b([DCQ]\d+)\b(?!\s*\()/g)) found.push(m[1] ?? '')
  }
  return found
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

// A commit-independent identity for a source tree: sha256 over sorted
// path+content pairs of every file under `prefix`, straight from the
// filesystem. `worktreeFingerprint` reads *uncommitted* state and so shifts
// when a turn legitimately checkpoints already-authored work; this does not —
// it changes only when file CONTENTS change, which is what "this turn authored
// nothing new" actually means.
export function treeHash(repo: string, prefix: string): string {
  const hash = createHash('sha256')
  for (const rel of listFiles(join(repo, prefix), prefix)) {
    hash.update(rel)
    hash.update('\0')
    hash.update(readOr(join(repo, rel)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function listFiles(dir: string, rel: string): ReadonlyArray<string> {
  let entries: ReadonlyArray<{ name: string; isDirectory(): boolean }>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name)
    const relPath = `${rel}/${entry.name}`
    if (entry.isDirectory()) files.push(...listFiles(path, relPath))
    else files.push(relPath)
  }
  return files
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
