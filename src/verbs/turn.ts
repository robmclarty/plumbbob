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
//
// Only the invocation's own arguments can mint: the tokens that follow it on its
// line, up to the first token that isn't a sanctioned argument (`--auto`, a step
// number, or a range — the argument-hint sanctions nothing else). An unrecognized
// flag ends the scan, so `/pb-build --wip 2020-2024` mints nothing — the `2020-2024`
// is never reached. An incidental range elsewhere in the prompt — an issue number, a
// pasted `2020-2024` — is prose, not a grant. Trailing sentence punctuation on an
// argument (`/pb-build 1-3.`) is still the argument the human typed.
export function grantFromPrompt(prompt: string): string | null {
  const invocation = /\/(?:plumbbob:)?pb-build\b/.exec(prompt)
  if (invocation === null) return null
  const line = prompt.slice(invocation.index + invocation[0].length).split('\n', 1)[0] ?? ''
  let auto = false
  let ceiling: string | undefined
  for (const token of line.split(/\s+/)) {
    const word = token.replace(/[.,;:!?]+$/, '')
    if (word === '') continue
    if (word === '--auto') {
      auto = true
      continue
    }
    const range = /^\d+-(\d+)$/.exec(word)
    if (range !== null) {
      ceiling = range[1]
      continue
    }
    if (/^\d+$/.test(word)) continue // a bare step number — keep scanning for a range/--auto
    break // an unrecognized flag or free text — the arguments have ended
  }
  if (ceiling !== undefined) return `range ${ceiling}`
  return auto ? 'auto' : null
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
