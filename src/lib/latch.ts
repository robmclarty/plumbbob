// The approval latch (D64) — the ledger-plane predicate `checkpoint` evaluates
// before its check gate (C4: cheap first; the gate already ran in the verify
// tick). The work plane stays guidance (D10/D13 untouched); only the commit tick
// is latched: a step may not land unless a human turn intervened since entry, the
// human granted self-approval (D65 one-turn grant, D27 standing `auto`), or the
// ledger is dormant. Six rows, evaluated in order, first hit wins; the refusal
// message *is* the pause affordance. Reads TURN/TICK/GRANT/isTTY only — never the
// host (C5). Functional, named exports, node builtins (C1/C2).

import { readFileSync } from 'node:fs'
import { grantPath, tickPath, turnPath } from './sidecar.ts'
import { resolveBoolean } from './settings.ts'

// A one-turn self-approval grant, minted by `plumbbob turn` from the human's
// literal prompt (D65). `auto` covers every checkpoint that turn; `range M`
// covers steps up to its ceiling. The mirror of turn.ts's grantFromPrompt.
export type Grant = { readonly kind: 'auto' } | { readonly kind: 'range'; readonly ceiling: number }

export type LatchInput = {
  readonly isTTY: boolean // row 1 — a human at the keyboard is their own approval
  readonly turn: number | null // rows 2/5 — the ledger count; null = absent (dormant)
  readonly tick: number | null // rows 2/5 — the entry stamp; null = absent (hand-built)
  readonly auto: boolean // row 3 — the standing settings grant (D27)
  readonly grant: Grant | null // row 4 — the one-turn prompt grant (D65)
  readonly step: number | null // the step landing; null for `--plan`
}

export type LatchDecision =
  | { readonly allow: true }
  | { readonly allow: false; readonly reason: 'ceiling' | 'no-turn'; readonly message: string }

const ALLOW: LatchDecision = { allow: true }

// The exact refusal (the spec pins this prose): the message is the affordance —
// it tells the model what the pause is and names the only legitimate grants. The
// plan commit gets its own wording: there is no step, no diff, and no self-review
// at plan time — what the human approves is the plan itself.
const NO_TURN_MESSAGE = `plumbbob: checkpoint refused — no human turn since this step began. This is the
pause: present the diff and the self-review, then end the turn; the human's next
message is the tick. (An explicit \`/pb-build --auto\` or a step range in the human's
own prompt grants self-approval; \`auto: true\` in settings.local.json is the standing
grant.)
`

const NO_TURN_PLAN_MESSAGE = `plumbbob: checkpoint refused — no human turn since \`start\` stamped this plan. This
is the plan pause: present the plan, then end the turn; the human's approving
message is the tick that lets it land on re-fire. (\`auto: true\` in
settings.local.json is the standing grant.)
`

function ceilingMessage(ceiling: number): string {
  return `plumbbob: checkpoint refused — the range you granted ends at step ${ceiling} — pause here; re-fire to continue.\n`
}

// The six-row matrix, in order, first hit wins. A `range` grant speaks only to
// numbered steps: on a `--plan` checkpoint (step null) it neither allows nor
// refuses, and the decision falls through to the turn comparison.
export function evaluateLatch(input: LatchInput): LatchDecision {
  if (input.isTTY) return ALLOW // 1 — a human at the keyboard
  if (input.turn === null || input.tick === null) return ALLOW // 2 — dormant / hand-built
  if (input.auto) return ALLOW // 3 — standing personal grant (D27)
  if (input.grant?.kind === 'auto') return ALLOW // 4 — one-turn grant
  if (input.grant?.kind === 'range' && input.step !== null) {
    if (input.step <= input.grant.ceiling) return ALLOW
    return { allow: false, reason: 'ceiling', message: ceilingMessage(input.grant.ceiling) }
  }
  if (input.turn > input.tick) return ALLOW // 5 — a human turn intervened
  // 6 — the pause (plan-worded when no step is landing)
  return { allow: false, reason: 'no-turn', message: input.step === null ? NO_TURN_PLAN_MESSAGE : NO_TURN_MESSAGE }
}

// Parse a GRANT file's content (`auto` | `range <M>`). Anything else — including
// a corrupted or hand-mangled file — contributes nothing (D27): no grant, never
// an error.
export function parseGrant(raw: string): Grant | null {
  const trimmed = raw.trim()
  if (trimmed === 'auto') return { kind: 'auto' }
  const range = /^range (\d+)$/.exec(trimmed)
  if (range !== null) return { kind: 'range', ceiling: Number(range[1]) }
  return null
}

// Gather the latch's inputs from the worktree and evaluate. `step` is the step
// number being checkpointed, or null for the plan commit (which latches on the
// TICK that `start` stamped).
export function checkLatch(root: string, step: number | null): LatchDecision {
  return evaluateLatch({
    isTTY: process.stdin.isTTY === true,
    turn: readCount(turnPath(root)),
    tick: readCount(tickPath(root)),
    auto: resolveBoolean(root, 'auto', false),
    grant: readGrant(root),
    step,
  })
}

function readGrant(root: string): Grant | null {
  try {
    return parseGrant(readFileSync(grantPath(root), 'utf8'))
  } catch {
    return null
  }
}

// A ledger count, or null when the file is absent or holds garbage — malformed
// contributes nothing, and an unreadable ledger reads as dormant (row 2) rather
// than wedging the land.
function readCount(path: string): number | null {
  try {
    const n = Number.parseInt(readFileSync(path, 'utf8').trim(), 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}
