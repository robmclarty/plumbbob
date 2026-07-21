// Thin git wrapper over `node:child_process` — the CLI stays on node builtins
// plus a small deliberate dependency allowlist, and subprocess spawning is
// centralized in files like this one. Plumbbob's git footprint is additive by
// rule: these helpers read, locate, stage, and commit forward, and reset
// `--hard` only to plumbbob's own recorded checkpoint SHAs — never a
// history-rewriting operation on anything pushed.

import { execFileSync } from 'node:child_process'
import { isAbsolute, join } from 'node:path'

/**
 * Run git in `root` and return its trimmed stdout.
 *
 * stderr is discarded and a non-zero exit throws — callers that tolerate
 * failure wrap the call in their own try/catch.
 */
function runGit(root: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

/**
 * The git toplevel for `cwd`, or null when `cwd` is not inside a git repo.
 */
export function findRepoRoot(cwd: string): string | null {
  try {
    return runGit(cwd, ['rev-parse', '--show-toplevel'])
  } catch {
    return null
  }
}

/**
 * Absolute path to a file inside the repo's *common* git dir.
 *
 * Plumbbob writes its control-plane excludes to the shared gitdir's
 * `info/exclude` (personal machinery, never the repo's `.gitignore`), and
 * `--git-path` maps common-dir entries like `info/exclude` to the shared file
 * even from a linked worktree — whose per-worktree gitdir has no `info/` and
 * which git never reads for excludes. The result is relative to `root` unless
 * already absolute.
 */
export function gitPath(root: string, relative: string): string {
  const out = runGit(root, ['rev-parse', '--git-path', relative])
  return isAbsolute(out) ? out : join(root, out)
}

/**
 * The SHA of the current HEAD commit.
 */
export function headSha(root: string): string {
  return runGit(root, ['rev-parse', 'HEAD'])
}

/**
 * True when the repo has at least one commit (HEAD resolves).
 */
export function hasCommit(root: string): boolean {
  try {
    runGit(root, ['rev-parse', '--verify', 'HEAD'])
    return true
  } catch {
    return false
  }
}

/**
 * Dirty = any tracked change or non-ignored untracked file.
 */
export function isDirty(root: string): boolean {
  return runGit(root, ['status', '--porcelain']).length > 0
}

/**
 * The number of commits on HEAD not reachable from `sha` — `git rev-list
 * --count --first-parent <sha>..HEAD`.
 *
 * `status` reads this for its receipts line: one neutral note when commits
 * landed since the last checkpoint outside plumbbob's ledger (out-of-band
 * commits are surfaced, never blocked). `--first-parent` keeps the count on
 * the branch's own line: merging upstream reads as the one merge commit, not
 * the dozens it carried — those didn't land "outside the ledger" in any sense
 * the receipt should nag about. Best-effort and never throws: 0 when the range
 * is empty, `sha` is unknown to the repo, or HEAD is unborn — the count is
 * informational (the human commits freely), never a gate.
 */
export function commitsSince(root: string, sha: string): number {
  try {
    const n = Number.parseInt(runGit(root, ['rev-list', '--count', '--first-parent', `${sha}..HEAD`]), 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

// --- mutation helpers (build-loop: done checkpoints, revert resets). Additive
// only: stage/commit forward, reset --hard to a recorded checkpoint SHA. ---

/**
 * Stage everything (`git add -A`) — the checkpoint sweep that carries the work
 * plus plumbbob's own bookkeeping into one commit.
 */
export function stageAll(root: string): void {
  runGit(root, ['add', '-A'])
}

/**
 * Stage a single path (vs `stageAll`'s `-A`).
 *
 * The plan-approval commit stages only the build's artifact folder so the
 * first step's diff can't absorb the plan scaffold — plan approval gets its
 * own commit. `path` may be absolute or repo-relative — git resolves it
 * against `root`. The `--` guards a path that could look like a flag.
 */
export function stagePath(root: string, path: string): void {
  runGit(root, ['add', '--', path])
}

/**
 * The repo-relative paths of non-ignored untracked files.
 */
export function untrackedPaths(root: string): ReadonlyArray<string> {
  const out = runGit(root, ['ls-files', '--others', '--exclude-standard'])
  return out.length === 0 ? [] : out.split('\n')
}

/**
 * Commit whatever is staged as a checkpoint and return its SHA.
 *
 * `--allow-empty` so a step that touched only ignored files still gets a
 * checkpoint to revert to. An optional `body` becomes the commit message body:
 * git joins the two `-m` paragraphs with a blank line, so the CLI-owned
 * subject stays the first line and the body rides beneath it.
 */
export function commit(root: string, subject: string, body?: string): string {
  const message = body ? ['-m', subject, '-m', body] : ['-m', subject]
  runGit(root, ['commit', '--allow-empty', ...message])
  return headSha(root)
}

/**
 * The `--stat` summary of what is currently staged (vs HEAD) — the diffstat
 * the deterministic checkpoint body carries when no `--body` prose arrives.
 * Empty when nothing is staged.
 */
export function stagedStat(root: string): string {
  return runGit(root, ['diff', '--cached', '--stat'])
}

/**
 * The repo-relative paths currently staged (vs HEAD) — the set `checkpoint`
 * checks against the step's seam (its granted edit paths) to warn about scope
 * drift. Empty when nothing is staged.
 */
export function stagedPaths(root: string): ReadonlyArray<string> {
  const out = runGit(root, ['diff', '--cached', '--name-only'])
  return out.length === 0 ? [] : out.split('\n')
}

/**
 * Reset the worktree hard to `sha` — only ever one of plumbbob's own recorded
 * checkpoint SHAs, and only `revert` imports this (an ast-grep rule pins that
 * single importer).
 */
export function resetHard(root: string, sha: string): void {
  runGit(root, ['reset', '--hard', sha])
}
