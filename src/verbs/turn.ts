// `plumbbob turn` — the turn-ledger hook. Wired to the harness's
// UserPromptSubmit event, it runs once per human prompt and maintains two of the
// sidecar's git-excluded control files (flat files under `.plumbbob/`): it ticks
// `TURN`, the monotonic count of human turns the checkpoint latch compares
// against a step's entry stamp to know a human turn intervened since the step
// began, and it rewrites `GRANT` from the literal prompt — minting a one-turn
// self-approval only when the human typed `/build --auto` or an `N-M` step
// range, clearing it otherwise (those strings can only come from a human
// keystroke, because `build` is disable-model-invocation — a grant the model
// could forge would be no grant). When a step is in flight it also emits ONE
// `UserPromptSubmit` additionalContext line so a fresh session (post-compaction,
// or a scripted `-p` turn where no skill prose is in context) still knows the
// beat — a tangent is parked, not chased. Guidance only: it blocks nothing. It
// ALWAYS exits 0 and any failure degrades to no output, so neither the tick nor
// the emit can ever wedge prompting.

import { readFileSync, writeFileSync } from 'node:fs'
import { findSessionRoot, setGrant, stepPath, turnPath } from '../lib/sidecar.ts'

/**
 * The hook entry point: apply the tick, then emit the in-flight-step nudge.
 *
 * Always returns 0 — a broken turn must never wedge a prompt, so any failure is
 * swallowed and degrades to no output.
 */
export function turn(cwd: string, _args: ReadonlyArray<string>): number {
  try {
    applyTurn(cwd, readStdin())
    const context = stepInFlightContext(cwd)
    if (context !== null) process.stdout.write(context)
  } catch {
    // A broken turn must never wedge a prompt — swallow and exit 0.
  }
  return 0
}

/**
 * The `UserPromptSubmit` additionalContext payload when a step is in flight, or null.
 *
 * A step is in flight when a STEP marker (the flat control file recording the
 * step between `build` and `checkpoint`) is present. Guidance only: it reminds a
 * fresh session that a tangent is a park (not an edit) and how the step lands,
 * since the build prose may not be in context after compaction or on a
 * scripted turn. Exported because an in-process test cannot read the hook's
 * real stdout.
 */
export function stepInFlightContext(cwd: string): string | null {
  const root = findSessionRoot(cwd)
  if (root === null) return null
  const step = inFlightStep(root)
  if (step === null) return null
  const text =
    `plumbbob: step ${step} is in flight — a new idea or tangent is a park, not an edit: ` +
    `capture it with \`plumbbob park "<one line>"\`, then stay on the step. ` +
    `It lands when you run \`plumbbob checkpoint ${step}\` after approval.`
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } })}\n`
}

/**
 * The in-flight step number, or null when no STEP marker is present.
 *
 * Absent means no step entered, or it already checkpointed. A garbled marker
 * reads as null — never an error, because the hook must not wedge a prompt.
 */
function inFlightStep(root: string): number | null {
  try {
    const n = Number.parseInt(readFileSync(stepPath(root), 'utf8').trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/**
 * The testable core: apply one tick given the raw hook stdin.
 *
 * Split from the fd-0 read so the unit tests can drive it directly — an
 * in-process test cannot feed fd 0 (the same constraint checkpoint's `--body`
 * lives under).
 */
export function applyTurn(cwd: string, raw: string): number {
  const root = findSessionRoot(cwd)
  if (root === null) return 0 // no active session above cwd — silent no-op.
  writeFileSync(turnPath(root), `${readTurn(root) + 1}\n`)
  setGrant(root, grantFromPrompt(extractPrompt(raw)))
  return 0
}

/**
 * Derive the GRANT content from the human's prompt, or null to clear it.
 *
 * A grant is minted only from a literal `build` invocation the human typed:
 * `build` is disable-model-invocation, so this string can only come from a
 * human keystroke, never model-authored pressure — a grant the model can forge
 * is no grant. A bounded range beats `--auto` (bounded wins); a bare
 * `/build`, or any non-invocation prompt, mints nothing. The namespaced
 * `/plumbbob:build` form is honored alongside the bare one.
 *
 * The invocation must *start* a token: a slash preceded by a word character,
 * `/`, `.`, `-`, or `~` is a path segment (`src/build`, `./build`), not a
 * command the human fired, so it mints nothing.
 *
 * Only the invocation's own arguments can mint: the tokens that follow it on
 * its line, up to the first token that isn't a sanctioned argument (`--auto`, a
 * step number, or a range — the argument-hint sanctions nothing else). An
 * unrecognized flag ends the scan, so `/build --wip 2020-2024` mints
 * nothing — the `2020-2024` is never reached. An incidental range elsewhere in
 * the prompt — an issue number, a pasted `2020-2024` — is prose, not a grant.
 * Trailing sentence punctuation on an argument (`/build 1-3.`) is still the
 * argument the human typed.
 */
export function grantFromPrompt(prompt: string): string | null {
  const invocation = /(?<![\w/.~-])\/(?:plumbbob:)?build\b/.exec(prompt)
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

/**
 * Extract the `prompt` field from the UserPromptSubmit JSON, or '' otherwise.
 *
 * Absent, unparseable, or non-string input contributes nothing rather than
 * wedging the tool: the tick still lands (a human turn did occur) and the empty
 * prompt clears any GRANT; the verb never throws over bad stdin.
 */
function extractPrompt(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { prompt?: unknown }
    return typeof parsed.prompt === 'string' ? parsed.prompt : ''
  } catch {
    return ''
  }
}

/**
 * The current TURN count, or 0 when the ledger is absent or unreadable.
 *
 * Starting from 0 means the first tick creates the file at 1.
 */
function readTurn(root: string): number {
  try {
    const n = Number.parseInt(readFileSync(turnPath(root), 'utf8').trim(), 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

/**
 * Read the hook JSON from fd 0, degrading to '' on any failure.
 *
 * An interactive TTY never sends EOF, so skip the read there rather than hang
 * (mirrors checkpoint's `--body`); a read error degrades to '' — extractPrompt
 * then clears the grant and the tick still lands.
 */
function readStdin(): string {
  if (process.stdin.isTTY === true) return ''
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}
