// The .plumbline/ sidecar: control state lives in flat files so the hooks can
// read it with a grep and no markdown parsing (D7). Functional/procedural,
// node builtins only (C1/C2).

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { gitDir } from './git.ts'

const DIRNAME = '.plumbline'

// The five legal control states (README mode machine). `mode` validates against
// this; the muzzle allows edits iff STATE is BUILD or SPIKE.
export const VALID_STATES: ReadonlyArray<string> = ['DESIGN', 'BUILD', 'REVIEW', 'SPIKE', 'FINISH']

export function sidecarDir(root: string): string {
  return join(root, DIRNAME)
}

function statePath(root: string): string {
  return join(root, DIRNAME, 'STATE')
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

export function configPath(root: string): string {
  return join(root, DIRNAME, 'config')
}

export function intentPath(root: string): string {
  return join(root, DIRNAME, 'intent.md')
}

export function buildLogPath(root: string): string {
  return join(root, DIRNAME, 'build-log.md')
}

// A session exists iff STATE exists. Deleting STATE (at finish) is what switches
// the muzzle off — so it is the single source of truth for "is there a session".
export function hasSession(root: string): boolean {
  return existsSync(statePath(root))
}

export function readState(root: string): string | null {
  try {
    return readFileSync(statePath(root), 'utf8').trim()
  } catch {
    return null
  }
}

export function writeState(root: string, state: string): void {
  writeFileSync(statePath(root), `${state}\n`)
}

// D17: keep the sidecar untracked by appending `.plumbline/` to the repo's
// git/info/exclude. Idempotent — a re-`start` after finish must not double-add.
export function excludeSidecar(root: string): void {
  const exclude = join(gitDir(root), 'info', 'exclude')
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
