// Thin git wrapper over `node:child_process` (C2: node builtins only, zero
// runtime deps). Functional/procedural, no classes (C1). Plumbline's git
// footprint is additive (C5); these helpers only read and locate.

import { execFileSync } from 'node:child_process'

function runGit(root: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

// The git toplevel for `cwd`, or null when `cwd` is not inside a git repo.
export function findRepoRoot(cwd: string): string | null {
  try {
    return runGit(cwd, ['rev-parse', '--show-toplevel'])
  } catch {
    return null
  }
}

// Absolute path to the .git directory (handles worktrees/linked git dirs).
export function gitDir(root: string): string {
  return runGit(root, ['rev-parse', '--absolute-git-dir'])
}

export function headSha(root: string): string {
  return runGit(root, ['rev-parse', 'HEAD'])
}

export function hasCommit(root: string): boolean {
  try {
    runGit(root, ['rev-parse', '--verify', 'HEAD'])
    return true
  } catch {
    return false
  }
}

// Dirty = any tracked change or non-ignored untracked file. The sidecar is
// git-excluded (D17), so an active session never reads as dirty.
export function isDirty(root: string): boolean {
  return runGit(root, ['status', '--porcelain']).length > 0
}
