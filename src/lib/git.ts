// Thin git wrapper over `node:child_process` (C2: node builtins plus the
// deliberate few). Functional/procedural, no classes (C1). Plumbbob's git
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
// for excludes (D33). The result is relative to `root` unless already absolute.
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

// The number of commits on HEAD not reachable from `sha` — `git rev-list --count
// <sha>..HEAD`. The receipts line (D66) reads this to surface commits that landed
// since the last checkpoint outside plumbbob's ledger. Best-effort and never throws:
// 0 when the range is empty, `sha` is unknown to the repo, or HEAD is unborn — the
// count is informational (the human commits freely, C5), never a gate.
export function commitsSince(root: string, sha: string): number {
  try {
    const n = Number.parseInt(runGit(root, ['rev-list', '--count', `${sha}..HEAD`]), 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

// --- mutation helpers (build-loop: done checkpoints, revert resets). Additive
// only (C5): stage/commit forward, reset --hard to a recorded checkpoint SHA. ---

export function stageAll(root: string): void {
  runGit(root, ['add', '-A'])
}

// Stage a single path (vs `stageAll`'s `-A`): the plan-approval commit stages only
// the build's artifact folder so the first step's diff can't absorb the plan
// scaffold (D36). `path` may be absolute or repo-relative — git resolves it against
// `root`. The `--` guards a path that could look like a flag.
export function stagePath(root: string, path: string): void {
  runGit(root, ['add', '--', path])
}

export function untrackedPaths(root: string): ReadonlyArray<string> {
  const out = runGit(root, ['ls-files', '--others', '--exclude-standard'])
  return out.length === 0 ? [] : out.split('\n')
}

// Commit whatever is staged as a checkpoint and return its SHA. --allow-empty so
// a step that touched only ignored files still gets a checkpoint to revert to.
// An optional `body` becomes the commit message body: git joins the two `-m`
// paragraphs with a blank line, so the subject stays the first line (D34).
export function commit(root: string, subject: string, body?: string): string {
  const message = body ? ['-m', subject, '-m', body] : ['-m', subject]
  runGit(root, ['commit', '--allow-empty', ...message])
  return headSha(root)
}

// The `--stat` summary of what is currently staged (vs HEAD) — the diffstat the
// deterministic checkpoint body carries (D35). Empty when nothing is staged.
export function stagedStat(root: string): string {
  return runGit(root, ['diff', '--cached', '--stat'])
}

// The repo-relative paths currently staged (vs HEAD) — the set `checkpoint`
// checks against the step's seam to warn about scope drift. Empty when nothing is
// staged.
export function stagedPaths(root: string): ReadonlyArray<string> {
  const out = runGit(root, ['diff', '--cached', '--name-only'])
  return out.length === 0 ? [] : out.split('\n')
}

export function resetHard(root: string, sha: string): void {
  runGit(root, ['reset', '--hard', sha])
}
