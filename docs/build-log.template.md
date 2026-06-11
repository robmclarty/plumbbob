<!--
build-log.md — Plumbline live ledger for the BUILD phase. Your working memory
during execution: you append constantly, reorganize at step boundaries. The
antidote to "my plan got lost in the noise."

Four jobs:
  Steps     : where you are. One step in flight at a time.
  Park list : where ideas go so you don't chase them. CAPTURE, never act inline.
  Triage    : the boundary ritual that keeps you on one branch.
  Log        : the audit trail. Feeds /plumbline-report, then gets archived.
-->

# Build log — <change title>

**Current step:** <n> · **STATE:** BUILD | REVIEW
**Heavy check:** `pnpm check`

## Steps

*(Mirror of intent.md's Steps, with live status. Only ONE step is `▶ in flight`.
A step is `✔ done` only after `plumbline done` — check green + checkpoint taken.)*

- ✔ 1. <step> — done, checkpoint `<sha>`
- ▶ 2. <step> — done when: <criterion>
- ☐ 3. <step>

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and
> you go straight back to the step. Acting the instant an idea arrives is the
> disease. Capture is one line (`/park` composes it, or raw `plumbline park`).
> Triage happens only at the boundary.

- [ ] <parked item> — <when it occurred to you>
- [ ] <parked item>

## Triage  *(run at each step boundary, after green)*

Classify each parked item as exactly ONE. The classification *is* the work —
naming it before acting is what keeps you from sprawling across branches.

| Class            | Meaning                                       | Action                        |
|------------------|-----------------------------------------------|-------------------------------|
| **blocker**      | Plan was wrong/incomplete; can't proceed      | `revert`, fold into intent.md |
| **tangent**      | A different path, not clearly better          | Defer or kill. Default here.  |
| **pivot signal** | Real evidence the whole approach is wrong     | Stop. Replan deliberately.    |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require
> a failed assumption, not a shinier idea, before you pivot.

Triage results this boundary:

- <item> → tangent → killed
- <item> → tangent → spun out as a future Plumbline
- <item> → blocker → folded into intent.md as D<n>

## Log

*(Append-only. One decision or event per line, dated. What you point at to say
"I did that — the LLM helped, but those were my calls." `/plumbline-report` reads
this; `plumbline finish` archives it under `.plumbline/archive/`.)*

- <date> — <decision / event / what shipped this step> — checkpoint `<sha>`
- <date> — …
