// The .plumbbob/ sidecar: control state lives in flat files so the hooks can
// read it with a grep and no markdown parsing (D7). Functional/procedural,
// node builtins only (C1/C2).
//
// STATE is a pure session sentinel: its EXISTENCE means "a session is active",
// and nothing reads its content. The phase the dashboard shows (DESIGN/BUILD/
// SPIKE) is derived, not stored — BUILD ⇔ a STEP is in flight, SPIKE ⇔ the SPIKE
// marker is present, otherwise DESIGN.

import { existsSync, readdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gitPath } from './git.ts'
import { localSetting } from './settings.ts'

const DIRNAME = '.plumbbob'

export function sidecarDir(root: string): string {
  return join(root, DIRNAME)
}

// The tracked artifact plane (D2): each build owns a self-contained folder under
// `.plumbbob/builds/<slug>/` that rides its branch into the PR. `buildDir` is the
// per-build root; intent.md, build-log.md, checkpoints, and report.md live inside
// it (the in-flight STEP/SEAM/SPIKE markers do too, but stay git-excluded).
function buildsDir(root: string): string {
  return join(root, DIRNAME, 'builds')
}

export function buildDir(root: string, slug: string): string {
  return join(buildsDir(root), slug)
}

// Derive a filesystem-safe slug from a build title: lowercased, every run of
// non-alphanumerics collapsed to a single hyphen, trimmed of leading/trailing
// hyphens. The CLI stays dumb and explicit (D17) — collision handling belongs to
// the caller (`start` refuses rather than silently suffixing `-2`). A title with
// no alphanumerics yields `''`, which the caller must reject or override.
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Existing build slugs — the directory names under `builds/`, sorted. Empty when
// `builds/` is absent (a `--local` repo, or before the first tracked `start`).
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

// Resolve which build a verb acts on (D3): an explicit `--build <slug>` flag →
// the `activeBuild` cursor in settings.local.json → the sole build in `builds/`
// → null (the caller then refuses with a hint). One-active-per-worktree holds by
// construction: the cursor is a single scalar key in an untracked file, so it can
// never point at two builds (D16).
export function activeBuild(root: string, flag?: string): string | null {
  if (flag !== undefined && flag.length > 0) return flag
  const cursor = localSetting(root, 'activeBuild')
  if (typeof cursor === 'string' && cursor.length > 0) return cursor
  const builds = listBuilds(root)
  return builds.length === 1 ? (builds[0] ?? null) : null
}

function statePath(root: string): string {
  return join(root, DIRNAME, 'STATE')
}

// Where the resolved build's artifacts and in-flight markers live (D4): the
// active `builds/<slug>/` folder when a build is resolvable, else the flat
// sidecar root. The flat fallback covers the `--local` layout (D13) and any
// no-cursor/no-build repo, so the verbs' path reads stay stable even before a
// tracked build exists or when their "no active session" guard is about to fire.
function artifactDir(root: string): string {
  const slug = activeBuild(root)
  return slug === null ? sidecarDir(root) : buildDir(root, slug)
}

// The SPIKE marker (a single-purpose presence flag, like SEAM/STEP): written by
// `spike` on open, removed on `spike done`. Its existence is the one signal that
// the dashboard and the spike gates read to know "a spike is active".
export function spikePath(root: string): string {
  return join(artifactDir(root), 'SPIKE')
}

// SEAM and STEP carry the in-flight step (D4/D7): a plain path list and a bare
// number, so the hooks read them with a grep and no markdown parsing.
export function seamPath(root: string): string {
  return join(artifactDir(root), 'SEAM')
}

export function stepPath(root: string): string {
  return join(artifactDir(root), 'STEP')
}

export function checkpointsPath(root: string): string {
  return join(artifactDir(root), 'checkpoints')
}

export function intentPath(root: string): string {
  return join(artifactDir(root), 'intent.md')
}

export function buildLogPath(root: string): string {
  return join(artifactDir(root), 'build-log.md')
}

// A session exists iff STATE exists. Deleting STATE (at wrap) is what flips the
// repo back to "no session" — so it is the single source of truth for "is there
// a session". `start` calls beginSession; `wrap` removes the file.
export function hasSession(root: string): boolean {
  return existsSync(statePath(root))
}

export function beginSession(root: string): void {
  writeFileSync(statePath(root), 'active\n')
}

// SPIKE marker helpers — existence is the whole signal (content is irrelevant).
export function inSpike(root: string): boolean {
  return existsSync(spikePath(root))
}

export function markSpike(root: string): void {
  writeFileSync(spikePath(root), 'active\n')
}

export function clearSpike(root: string): void {
  rmSync(spikePath(root), { force: true })
}

// Append `patterns` to the repo's info/exclude, each at most once (idempotent —
// a re-`start` after finish must not double-add). `gitPath` resolves to the
// *common* gitdir's exclude — the only one git reads — so this works from a
// linked worktree, whose per-worktree gitdir has no `info/` (D1).
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

// The narrowed control plane (D2): with `builds/<slug>/` now tracked, only the
// per-worktree control files stay git-excluded — the local settings overlay (its
// `activeBuild` cursor), the session sentinel, and the in-flight step markers
// inside every build. Everything else under `.plumbbob/` (settings.json, and each
// build's intent/build-log/checkpoints/report) rides the branch into the PR.
export function excludeControl(root: string): void {
  addExcludes(root, [
    `${DIRNAME}/STATE`,
    `${DIRNAME}/settings.local.json`,
    `${DIRNAME}/builds/*/STEP`,
    `${DIRNAME}/builds/*/SEAM`,
    `${DIRNAME}/builds/*/SPIKE`,
  ])
}

// D13: `start --local` opts out of the tracked layout into a fully-untracked
// sidecar (today's behavior) — some team repos won't accept tool folders in-tree.
// Excludes the whole `.plumbbob/` directory.
export function excludeSidecar(root: string): void {
  addExcludes(root, [`${DIRNAME}/`])
}
