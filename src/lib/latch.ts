// The approval latch — the ledger-plane predicate `checkpoint` evaluates before
// its check gate (the latch is cheap, so it runs first; the heavy gate already
// ran in the verify tick). The work plane stays guidance — no edit is ever
// blocked — but the commit tick is latched: a step may not land unless a human
// turn intervened since the step was entered, the human granted a one-turn
// self-approval from their literal prompt, or the turn ledger is dormant (a
// host with no hooks grows no ledger, and the latch stays out of the way rather
// than wedging). The ledger is a pair of flat sidecar control files: TURN
// counts human prompts (ticked by the `plumbbob turn` hook), TICK stamps that
// count when a step is entered — TURN > TICK means a human turn intervened.
// Five rows, evaluated in order, first hit wins; the refusal message *is* the
// pause affordance. A standing `auto` in a settings file is never a grant: a
// model can write that file, and a grant it can forge is no grant — the latch
// reads it only to say so at the pause, never to allow. It reads only
// TURN/TICK/GRANT and isTTY — it never sniffs the host session. Named exports,
// node builtins.

import { readFileSync } from 'node:fs'
import { grantPath, tickPath, turnPath } from './sidecar.ts'
import { resolveBoolean } from './settings.ts'

/**
 * A one-turn self-approval grant, minted by `plumbbob turn` from the human's
 * literal prompt. `auto` covers every checkpoint that turn; `range M` covers
 * steps up to its ceiling. The mirror of turn.ts's grantFromPrompt.
 */
export type Grant = { readonly kind: 'auto' } | { readonly kind: 'range'; readonly ceiling: number }

export type LatchInput = {
  readonly isTTY: boolean // row 1 — a human at the keyboard is their own approval
  readonly turn: number | null // rows 2/4 — the human-turn count; null = absent (dormant ledger)
  readonly tick: number | null // rows 2/4 — the step-entry stamp; null = absent (hand-built diff)
  readonly grant: Grant | null // row 3 — the one-turn grant from the human's prompt
  readonly step: number | null // the step landing; null for `--plan`
  readonly settingsAuto: boolean // a settings `auto` — never a grant, only decorates the refusal
}

export type LatchDecision =
  | { readonly allow: true }
  | { readonly allow: false; readonly reason: 'ceiling' | 'no-turn'; readonly message: string }

const ALLOW: LatchDecision = { allow: true }

/**
 * The refusal message is the affordance — it tells the model what the pause is,
 * how it ends (approval on the next turn lands it; `/plumbbob:build` only starts the
 * next step), and names the only legitimate grants.
 */
const NO_TURN_MESSAGE = `plumbbob: checkpoint refused — no human turn since this step began. This is the
pause: present the diff and the self-review, then end the turn. The human's approval on
their next turn is what lets this land — re-run \`checkpoint\` then and stop at the
boundary; \`/plumbbob:build\` only starts the next step, it never lands this one. (An explicit
\`/plumbbob:build --auto\` or a step range in the human's own prompt is the only self-approval.)
`

/**
 * The plan commit gets its own wording: there is no step, no diff, and no
 * self-review at plan time — what the human approves is the plan itself.
 */
const NO_TURN_PLAN_MESSAGE = `plumbbob: checkpoint refused — no human turn since \`start\` stamped this plan. This
is the plan pause: present the plan, then end the turn; the human's approving
message is the tick that lets it land on re-fire. (An explicit \`/plumbbob:build --auto\` or a
step range in the human's own prompt is the only self-approval.)
`

/**
 * A settings `auto` is never a grant — a model can write that file, and a grant
 * it can forge is no grant. When one is set, the refusal names it rather than
 * silently ignoring it, and points at the only self-approval that works.
 */
const SETTINGS_AUTO_NOTE = `note: \`auto\` is set in settings but is no longer a grant (D67) — re-fire \`/plumbbob:build --auto\` to self-approve.
`

/**
 * The refusal for a range grant whose ceiling the landing step exceeds.
 */
function ceilingMessage(ceiling: number): string {
  return `plumbbob: checkpoint refused — the range you granted ends at step ${ceiling} — pause here; re-fire to continue.\n`
}

/**
 * The five-row matrix, in order, first hit wins.
 *
 * A `range` grant speaks only to numbered steps: on a `--plan` checkpoint (step
 * null) it neither allows nor refuses, and the decision falls through to the
 * turn comparison.
 */
export function evaluateLatch(input: LatchInput): LatchDecision {
  if (input.isTTY) return ALLOW // 1 — a human at the keyboard
  if (input.turn === null || input.tick === null) return ALLOW // 2 — dormant ledger / hand-built diff
  if (input.grant?.kind === 'auto') return ALLOW // 3 — one-turn grant the human typed
  if (input.grant?.kind === 'range' && input.step !== null) {
    if (input.step <= input.grant.ceiling) return ALLOW
    return { allow: false, reason: 'ceiling', message: ceilingMessage(input.grant.ceiling) }
  }
  if (input.turn > input.tick) return ALLOW // 4 — a human turn intervened
  // 5 — the pause (plan-worded when no step is landing). A settings `auto` never
  // allows; when one is set, the refusal notes it rather than honoring it.
  const base = input.step === null ? NO_TURN_PLAN_MESSAGE : NO_TURN_MESSAGE
  return { allow: false, reason: 'no-turn', message: input.settingsAuto ? base + SETTINGS_AUTO_NOTE : base }
}

/**
 * Parse a GRANT file's content (`auto` | `range <M>`).
 *
 * Anything else — including a corrupted or hand-mangled file — contributes
 * nothing: no grant, never an error.
 */
export function parseGrant(raw: string): Grant | null {
  const trimmed = raw.trim()
  if (trimmed === 'auto') return { kind: 'auto' }
  const range = /^range (\d+)$/.exec(trimmed)
  if (range !== null) return { kind: 'range', ceiling: Number(range[1]) }
  return null
}

/**
 * Gather the latch's inputs from the worktree and evaluate.
 *
 * `step` is the step number being checkpointed, or null for the plan commit
 * (which latches on the TICK that `start` stamped).
 */
export function checkLatch(root: string, step: number | null): LatchDecision {
  return evaluateLatch({
    isTTY: process.stdin.isTTY === true,
    turn: readCount(turnPath(root)),
    tick: readCount(tickPath(root)),
    grant: readGrant(root),
    step,
    // Read from the settings ladder — but only to decorate the pause, never to allow.
    settingsAuto: resolveBoolean(root, 'auto', false),
  })
}

/**
 * The current GRANT, or null when the file is absent or unparseable.
 */
function readGrant(root: string): Grant | null {
  try {
    return parseGrant(readFileSync(grantPath(root), 'utf8'))
  } catch {
    return null
  }
}

/**
 * A ledger count, or null when the file is absent or holds garbage.
 *
 * Malformed contributes nothing, and an unreadable ledger reads as dormant
 * (row 2) rather than wedging the land.
 */
function readCount(path: string): number | null {
  try {
    const n = Number.parseInt(readFileSync(path, 'utf8').trim(), 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}
