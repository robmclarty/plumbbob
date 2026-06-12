<!--
build-log.md — your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Triage    : the boundary ritual that keeps you on one branch.
  Log       : the audit trail. Feeds /plumbbob-report, then gets archived.
-->

# Build log — {{TITLE}}

**Current step:** none (DESIGN) · **STATE:** DESIGN
**Heavy check:** {{CHECK}}

## Steps

*(Mirror of intent.md's Steps, with live status. Only ONE step is in flight. A step
is done only after `plumbbob done` — check green + checkpoint taken.)*

- ☐ 1. <step>

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/park` composes it, or raw `plumbbob park`). Triage happens
> only at the boundary.

## Triage  *(run at each step boundary, after green)*

Classify each parked item as exactly ONE. Naming it before acting is what keeps you
from sprawling across branches.

| Class            | Meaning                                   | Action                        |
|------------------|-------------------------------------------|-------------------------------|
| **blocker**      | Plan was wrong/incomplete; can't proceed  | `revert`, fold into intent.md |
| **tangent**      | A different path, not clearly better      | Defer or kill. Default here.  |
| **pivot signal** | Evidence the whole approach is wrong      | Stop. Replan deliberately.    |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require a
> failed assumption, not a shinier idea, before you pivot.

Triage results this boundary:

- (none yet)

## Log

*(Append-only. One decision or event per line, dated. What you point at to say "I
did that — the LLM helped, but those were my calls." `/plumbbob-report` reads this;
`plumbbob finish` archives it under `.plumbbob/archive/`.)*

- <date> — <decision / event / what shipped this step>
