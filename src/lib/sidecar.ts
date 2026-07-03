// The .plumbbob/ sidecar: control state lives in flat files so the hooks can
// read it with a grep and no markdown parsing (D7). Functional/procedural,
// node builtins only (C1/C2).
//
// STATE is a pure session sentinel: its EXISTENCE means "a session is active",
// and nothing reads its content. The phase the dashboard shows (DESIGN/BUILD/
// SPIKE) is derived, not stored — BUILD ⇔ a STEP is in flight, SPIKE ⇔ the SPIKE
// marker is present, otherwise DESIGN.

import { existsSync, readFileSync, writeFileSync, appendFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gitPath } from './git.ts'

const DIRNAME = '.plumbbob'

export function sidecarDir(root: string): string {
  return join(root, DIRNAME)
}

function statePath(root: string): string {
  return join(root, DIRNAME, 'STATE')
}

// The SPIKE marker (a single-purpose presence flag, like SEAM/STEP): written by
// `spike` on open, removed on `spike done`. Its existence is the one signal that
// the dashboard and the spike gates read to know "a spike is active".
export function spikePath(root: string): string {
  return join(root, DIRNAME, 'SPIKE')
}

// SEAM and STEP carry the in-flight step (D4/D7): a plain path list and a bare
// number, so the hooks read them with a grep and no markdown parsing.
export function seamPath(root: string): string {
  return join(root, DIRNAME, 'SEAM')
}

export function stepPath(root: string): string {
  return join(root, DIRNAME, 'STEP')
}

export function checkpointsPath(root: string): string {
  return join(root, DIRNAME, 'checkpoints')
}

export function intentPath(root: string): string {
  return join(root, DIRNAME, 'intent.md')
}

export function buildLogPath(root: string): string {
  return join(root, DIRNAME, 'build-log.md')
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

// D17: keep the sidecar untracked by appending `.plumbbob/` to the repo's
// info/exclude. `gitPath` resolves to the *common* gitdir's exclude — the only
// one git reads — so this works from a linked worktree, whose per-worktree
// gitdir has no `info/` (D1). Idempotent — a re-`start` after finish must not
// double-add.
export function excludeSidecar(root: string): void {
  const exclude = gitPath(root, 'info/exclude')
  mkdirSync(dirname(exclude), { recursive: true })
  let current = ''
  try {
    current = readFileSync(exclude, 'utf8')
  } catch {
    current = ''
  }
  if (current.split('\n').some((line) => line.trim() === `${DIRNAME}/`)) {
    return
  }
  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : ''
  appendFileSync(exclude, `${prefix}${DIRNAME}/\n`)
}
