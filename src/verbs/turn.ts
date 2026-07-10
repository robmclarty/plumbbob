// `plumbbob turn` — the turn-ledger hook (D64). Wired to Claude Code's
// UserPromptSubmit, it runs once per human prompt: it ticks `.plumbbob/TURN` (the
// monotonic count of human turns the checkpoint latch reads to know a human turn
// intervened since a step began) and rewrites `.plumbbob/GRANT` from the literal
// prompt — minting a one-turn self-approval only when the human typed
// `/pb-build --auto` or a `N-M` range (D65), clearing it otherwise. Pure machinery,
// not a user verb: it writes nothing to stdout and ALWAYS exits 0, so a broken tick
// can never wedge prompting (C3).

import { readFileSync, writeFileSync } from 'node:fs'
import { findSessionRoot, setGrant, turnPath } from '../lib/sidecar.ts'

export function turn(cwd: string, _args: ReadonlyArray<string>): number {
  try {
    applyTurn(cwd, readStdin())
  } catch {
    // C3: a broken turn must never wedge a prompt — swallow and exit 0.
  }
  return 0
}

// The testable core: apply one tick given the raw hook stdin. Split from the fd-0
// read so the unit tests can drive it directly — an in-process test cannot feed fd 0
// (the same constraint checkpoint's `--body` lives under).
export function applyTurn(cwd: string, raw: string): number {
  const root = findSessionRoot(cwd)
  if (root === null) return 0 // no active session above cwd — silent no-op.
  writeFileSync(turnPath(root), `${readTurn(root) + 1}\n`)
  setGrant(root, grantFromPrompt(extractPrompt(raw)))
  return 0
}

// GRANT is minted only from a literal `pb-build` invocation the human typed:
// `pb-build` is disable-model-invocation, so this string can only come from a human
// keystroke, never model-authored pressure (D65). A bounded range beats `--auto`
// (bounded wins); a bare `/pb-build`, or any non-invocation prompt, mints nothing.
// The namespaced `/plumbbob:pb-build` form is honored alongside the bare one.
export function grantFromPrompt(prompt: string): string | null {
  if (!/\/(?:plumbbob:)?pb-build\b/.test(prompt)) return null
  const ceiling = prompt.match(/(?:^|\s)\d+-(\d+)(?=\s|$)/)?.[1]
  if (ceiling !== undefined) return `range ${ceiling}`
  if (/(?:^|\s)--auto\b/.test(prompt)) return 'auto'
  return null
}

// Extract the `prompt` field from the UserPromptSubmit JSON, or '' when the input is
// absent, unparseable, or carries no string prompt. Malformed input contributes
// nothing (D27): the tick still lands (a human turn did occur) and the empty prompt
// clears any GRANT; the verb never throws over bad stdin.
function extractPrompt(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { prompt?: unknown }
    return typeof parsed.prompt === 'string' ? parsed.prompt : ''
  } catch {
    return ''
  }
}

// The current TURN as a non-negative integer, or 0 when the ledger is absent or
// unreadable — so the first tick creates it at 1.
function readTurn(root: string): number {
  try {
    const n = Number.parseInt(readFileSync(turnPath(root), 'utf8').trim(), 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

// Read the hook JSON from fd 0. An interactive TTY never sends EOF, so skip the read
// there rather than hang (mirrors checkpoint's `--body`); a read error degrades to
// '' — extractPrompt then clears the grant and the tick still lands.
function readStdin(): string {
  if (process.stdin.isTTY === true) return ''
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}
