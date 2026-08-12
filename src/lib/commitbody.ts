// The `--body` stdin reader shared by `checkpoint` and `finish` — both verbs
// take a commit body on fd 0 via a single-quoted heredoc (`--body <<'BODY'`),
// never as an argument value. `evaluateCommitBody` is the pure decision over
// an already-known fd-0 shape, so every shape is a direct unit test with no
// fd tricks; `readCommitBody` gathers the real one — the mirror of latch.ts's
// evaluateLatch/checkLatch split.
//
// Four fd-0 shapes reach this in practice: a heredoc is a regular file, a
// pipe is a FIFO, an interactive terminal is a TTY, and an agent harness
// hands the CLI a socket. The first three already degrade safely — a TTY
// skips the read (it would never send EOF), a regular file/FIFO/`/dev/null`
// read to EOF and fall back to the caller's own default body when empty. A
// socket also never sends EOF on its own, so the same blind `readFileSync(0)`
// blocks forever and, worse, drops the requested body silently. Refuse
// instead: a silently dropped body reads as success.

import { fstatSync, readFileSync } from 'node:fs'

export type StdinShape = 'tty' | 'socket' | 'other'

export type CommitBodyResult = { readonly ok: true; readonly body: string | null } | { readonly ok: false; readonly message: string }

/**
 * The refusal shown when `--body` is asked to read a socket — names the form
 * that works so the retry succeeds instead of guessing again.
 */
export const SOCKET_REFUSAL =
  "plumbbob: --body refuses — stdin is a socket, and a socket never sends EOF the way a heredoc does, so the read would block forever and the body would be lost. Redirect it in with the `--body <<'BODY'` … `BODY` heredoc form instead.\n"

/**
 * Decide the `--body` outcome from an already-known fd-0 shape.
 *
 * Absent flag or a TTY both mean "don't read" — the caller's fallback body
 * applies. `other` covers a heredoc (regular file), a pipe (FIFO), and
 * `/dev/null` (character device) alike: each is read to EOF, and an empty or
 * failed read degrades to the same fallback an absent `--body` would use.
 */
export function evaluateCommitBody(hasBodyFlag: boolean, shape: StdinShape, read: () => string): CommitBodyResult {
  if (!hasBodyFlag || shape === 'tty') {
    return { ok: true, body: null }
  }
  if (shape === 'socket') {
    return { ok: false, message: SOCKET_REFUSAL }
  }
  try {
    const raw = read().trimEnd()
    return { ok: true, body: raw.length > 0 ? raw : null }
  } catch {
    return { ok: true, body: null }
  }
}

/**
 * Read the `--body` commit body from the real fd 0, or refuse when it can
 * never deliver one.
 *
 * `checkpoint` and `finish` both call this where each used to call its own
 * copy of `bodyArg` — one implementation, one refusal string, so the two
 * verbs cannot drift apart on the wording.
 */
export function readCommitBody(args: ReadonlyArray<string>): CommitBodyResult {
  return evaluateCommitBody(args.includes('--body'), stdinShape(), () => readFileSync(0, 'utf8'))
}

/**
 * The fd-0 shape the guard cares about: a TTY skips the read (never sends
 * EOF), a socket refuses (the same problem, but silent), everything else is
 * read as before. An unreadable fd (no stdin attached at all) is treated the
 * same as any other shape — the read attempt that follows fails safely.
 */
function stdinShape(): StdinShape {
  if (process.stdin.isTTY === true) {
    return 'tty'
  }
  try {
    return fstatSync(0).isSocket() ? 'socket' : 'other'
  } catch {
    return 'other'
  }
}
