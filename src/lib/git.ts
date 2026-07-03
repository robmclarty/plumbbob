// Thin git wrapper over `node:child_process` (C2: node builtins only, zero
// runtime deps). Functional/procedural, no classes (C1). Plumbbob's git
// footprint is additive (C5); these helpers only read and locate.

import { execFileSync } from 'node:child_process'
import { isAbsolute, join } from 'node:path'

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

// Absolute path to a file inside the repo's *common* git dir. `--git-path` maps
// common-dir entries like `info/exclude` to the shared file even from a linked
// worktree, whose per-worktree gitdir has no `info/` and which git never reads
// for excludes (D1). The result is relative to `root` unless already absolute.
export function gitPath(root: string, relative: string): string {
  const out = runGit(root, ['rev-parse', '--git-path', relative])
  return isAbsolute(out) ? out : join(root, out)
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

// Dirty = any tracked change or non-ignored untracked file.
export function isDirty(root: string): boolean {
  return runGit(root, ['status', '--porcelain']).length > 0
}

// --- mutation helpers (build-loop: done checkpoints, revert resets). Additive
// only (C5): stage/commit forward, reset --hard to a recorded checkpoint SHA. ---

export function stageAll(root: string): void {
  runGit(root, ['add', '-A'])
}

export function untrackedPaths(root: string): ReadonlyArray<string> {
  const out = runGit(root, ['ls-files', '--others', '--exclude-standard'])
  return out.length === 0 ? [] : out.split('\n')
}

// Commit whatever is staged as a checkpoint and return its SHA. --allow-empty so
// a step that touched only ignored files still gets a checkpoint to revert to.
// An optional `body` becomes the commit message body: git joins the two `-m`
// paragraphs with a blank line, so the subject stays the first line (D5).
export function commit(root: string, subject: string, body?: string): string {
  const message = body ? ['-m', subject, '-m', body] : ['-m', subject]
  runGit(root, ['commit', '--allow-empty', ...message])
  return headSha(root)
}

// The `--stat` summary of what is currently staged (vs HEAD) — the diffstat the
// deterministic checkpoint body carries (D6). Empty when nothing is staged.
export function stagedStat(root: string): string {
  return runGit(root, ['diff', '--cached', '--stat'])
}

export function resetHard(root: string, sha: string): void {
  runGit(root, ['reset', '--hard', sha])
}
