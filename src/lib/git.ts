// Thin git wrapper over `node:child_process`: the CLI stays on node builtins
// plus a small deliberate dependency allowlist, and subprocess spawning is
// centralized in files like this one. Plumbbob's git footprint is additive by
// rule: these helpers read, locate, stage, and commit forward, and reset
// `--hard` only to plumbbob's own recorded checkpoint SHAs: never a
// history-rewriting operation on anything pushed.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

/**
 * Run git in `root` and return its trimmed stdout.
 *
 * stderr is discarded and a non-zero exit throws: callers that tolerate
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
 * even from a linked worktree (whose per-worktree gitdir has no `info/` and
 * which git never reads for excludes). The result is relative to `root` unless
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
 * The number of commits on HEAD not reachable from `sha`: `git rev-list
 * --count --first-parent <sha>..HEAD`.
 *
 * `status` reads this for its receipts line: one neutral note when commits
 * landed since the last checkpoint outside plumbbob's ledger (out-of-band
 * commits are surfaced, never blocked). `--first-parent` keeps the count on
 * the branch's own line: merging upstream reads as the one merge commit, not
 * the dozens it carried; those didn't land "outside the ledger" in any sense
 * the receipt should nag about. `excluding` is a commit-message pattern whose
 * matches are left out of the count, which is how a caller drops plumbbob's own
 * commits from a tally of what landed around them.
 *
 * Best-effort and never throws: 0 when the range is empty, `sha` is unknown to
 * the repo, or HEAD is unborn: the count is informational (the human commits
 * freely), never a gate.
 */
export function commitsSince(root: string, sha: string, excluding?: string): number {
  try {
    const skip = excluding === undefined ? [] : ['--grep', excluding, '--invert-grep']
    const n = Number.parseInt(runGit(root, ['rev-list', '--count', '--first-parent', ...skip, `${sha}..HEAD`]), 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/**
 * One changed file in the step's product: its added/removed line counts, its
 * path, and whether git has never seen it before.
 */
export type NumstatEntry = {
  readonly added: number
  readonly removed: number
  readonly path: string
  readonly untracked: boolean
}

/**
 * The step's whole product, one entry per file: everything changed since HEAD,
 * staged or not, plus every non-ignored untracked file counted as all-added
 * lines.
 *
 * That universe is the one `checkpoint`'s drift warning already uses after it
 * stages, so the pause and the boundary measure the same thing. `diff HEAD`
 * (rather than a working-tree diff merged with a cached one) nets a file
 * staged and then edited again into a single row; `--no-renames` keeps a
 * staged `git mv` as two plain paths instead of one `{old => new}` arrow,
 * which is also the shape the seam row wants.
 *
 * This feeds the recap's `diff` and `seam` rows at the pause: information,
 * never a gate, so it is best-effort and never throws ([] on any failure).
 */
export function diffNumstat(root: string): ReadonlyArray<NumstatEntry> {
  return [...trackedNumstat(root), ...untrackedNumstat(root)]
}

/**
 * The tracked half of `diffNumstat`: what differs from HEAD, index included.
 */
function trackedNumstat(root: string): ReadonlyArray<NumstatEntry> {
  let out: string
  try {
    out = runGit(root, ['diff', '--numstat', '--no-renames', 'HEAD'])
  } catch {
    return []
  }
  if (out.length === 0) {
    return []
  }
  return out.split('\n').map((line) => {
    const [added, removed, ...path] = line.split('\t')
    return { added: toCount(added), removed: toCount(removed), path: path.join('\t'), untracked: false }
  })
}

/**
 * The untracked half of `diffNumstat`: every non-ignored new file, counted as
 * all-added lines.
 *
 * The count is read in node rather than spawned per file: the alternative
 * (`git diff --no-index --numstat /dev/null <path>`) exits 1 by design and
 * prints the path in rename shape, so it needs an exit-1 catch and an arrow
 * parser for every file. The trade-off, accepted: gitattributes are not
 * consulted for a file git has never seen.
 */
function untrackedNumstat(root: string): ReadonlyArray<NumstatEntry> {
  let paths: ReadonlyArray<string>
  try {
    paths = untrackedPaths(root)
  } catch {
    return []
  }
  return paths.map((path) => ({ added: addedLines(join(root, path)), removed: 0, path, untracked: true }))
}

/**
 * The line count a numstat row would carry for a whole new file: newlines, plus
 * one for an unterminated last line, the way git counts it.
 *
 * A NUL byte in the first 8000 bytes means binary, which numstat prints as `-`
 * and `toCount` reads as 0. An unreadable file counts 0 as well, and the caller
 * keeps its path either way: the seam row still has to see it.
 */
function addedLines(absolute: string): number {
  let buffer: Buffer
  try {
    buffer = readFileSync(absolute)
  } catch {
    return 0
  }
  if (buffer.subarray(0, 8000).includes(0)) {
    return 0
  }
  if (buffer.length === 0) {
    return 0
  }
  let lines = 0
  for (const byte of buffer) {
    if (byte === 0x0a) {
      lines += 1
    }
  }
  return buffer[buffer.length - 1] === 0x0a ? lines : lines + 1
}

/**
 * A numstat count field as a number: `-` (a binary file) and anything else
 * unparseable read as 0.
 */
function toCount(field: string | undefined): number {
  const n = Number.parseInt(field ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * The raw patch for `entries` (everything since HEAD, new files included), or
 * '' when nothing differs or git refuses.
 *
 * Tracked paths come through one `git diff HEAD`; an untracked file has no
 * blob to diff, so each goes through `git diff --no-index` against /dev/null,
 * which prints the same `new file mode` header a staged new file gets. That
 * form implies `--exit-code`, so a patch arrives as a thrown status 1 with the
 * text on `stdout`. Entries counted at 0 added lines are skipped: they would
 * produce nothing, and skipping them caps the spawns at the inline threshold.
 *
 * Only the pause's inline-diff fence reads this, and only after the numstat
 * count came in at 20 changed lines or fewer, so the patch is always small.
 * Best-effort like diffNumstat: information, never a gate.
 */
export function diffPatch(root: string, entries: ReadonlyArray<NumstatEntry>): string {
  const tracked = entries.filter((e) => !e.untracked).map((e) => e.path)
  const pieces: string[] = []
  if (tracked.length > 0) {
    try {
      pieces.push(runGit(root, ['diff', '--no-renames', 'HEAD', '--', ...tracked]))
    } catch {
      // best-effort: a path git refuses drops out of the fence, the rest stays.
    }
  }
  for (const entry of entries) {
    if (!entry.untracked || entry.added === 0) {
      continue
    }
    pieces.push(noIndexPatch(root, entry.path))
  }
  return pieces.filter((piece) => piece.length > 0).join('\n')
}

/**
 * One untracked file's patch, `git diff --no-index` against /dev/null.
 *
 * The path stays repo-relative so the header reads `+++ b/src/new.ts`, the same
 * shape `diff HEAD` prints for a staged new file. `--no-index` implies
 * `--exit-code`: status 1 is the success case, and `encoding` is set on the
 * spawn, so git's output arrives as a string on the error.
 */
function noIndexPatch(root: string, path: string): string {
  try {
    return runGit(root, ['diff', '--no-index', '--', '/dev/null', path])
  } catch (error) {
    const failure = error as { status?: number; stdout?: string }
    return failure.status === 1 && typeof failure.stdout === 'string' ? failure.stdout.trim() : ''
  }
}

// --- mutation helpers (build-loop: done checkpoints, revert resets). Additive
// only: stage/commit forward, reset --hard to a recorded checkpoint SHA. ---

/**
 * Stage everything (`git add -A`): the checkpoint sweep that carries the work
 * plus plumbbob's own bookkeeping into one commit.
 */
export function stageAll(root: string): void {
  runGit(root, ['add', '-A'])
}

/**
 * Stage a single path (vs `stageAll`'s `-A`), returning whether it staged.
 *
 * The plan-approval commit stages only the build's artifact folder so the
 * first step's diff can't absorb the plan scaffold: plan approval gets its
 * own commit. `path` may be absolute or repo-relative; git resolves it
 * against `root`. The `--` guards a path that could look like a flag.
 *
 * A repo that gitignores the sidecar has decided not to track it, and git
 * hard-refuses an explicit `git add` of an ignored path, so probe
 * `check-ignore` first: an ignored path is skipped and returns false (the
 * caller's commit is then record-only), a tracked one stages and returns true.
 * Never `git add -f`: honoring the repo's exclusion is the whole point.
 */
export function stagePath(root: string, path: string): boolean {
  if (isIgnored(root, path)) {
    return false
  }
  runGit(root, ['add', '--', path])
  return true
}

/**
 * Whether git ignores `path`: a `git check-ignore -q` probe.
 *
 * Exit 0 means ignored; exit 1 means not (execFileSync throws on the non-zero,
 * caught and read as false); any other status (128, a genuine failure)
 * propagates. `path` may be absolute or repo-relative.
 */
export function isIgnored(root: string, path: string): boolean {
  try {
    runGit(root, ['check-ignore', '-q', '--', path])
    return true
  } catch (error) {
    if ((error as { status?: number }).status === 1) {
      return false
    }
    throw error
  }
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
 * The `--stat` summary of what is currently staged (vs HEAD): the diffstat
 * the deterministic checkpoint body carries when no `--body` prose arrives.
 * Empty when nothing is staged.
 */
export function stagedStat(root: string): string {
  return runGit(root, ['diff', '--cached', '--stat'])
}

/**
 * The repo-relative paths currently staged (vs HEAD): the set `checkpoint`
 * checks against the step's seam (its granted edit paths) to warn about scope
 * drift. Empty when nothing is staged.
 */
export function stagedPaths(root: string): ReadonlyArray<string> {
  const out = runGit(root, ['diff', '--cached', '--name-only'])
  return out.length === 0 ? [] : out.split('\n')
}

/**
 * Reset the worktree hard to `sha`: only ever one of plumbbob's own recorded
 * checkpoint SHAs, and only `revert` imports this (an ast-grep rule pins that
 * single importer).
 */
export function resetHard(root: string, sha: string): void {
  runGit(root, ['reset', '--hard', sha])
}
