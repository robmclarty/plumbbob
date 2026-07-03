<!--
build-log.md — your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Harvest   : the boundary ritual that keeps you on one branch.
  Log       : the audit trail. Feeds the /plumbbob:wrap report, then gets archived.
-->

# Build log — Worktree-proof sidecar restructure

**Current step:** none (DESIGN) · **STATE:** DESIGN
**Heavy check:** pnpm run check

## Steps

*(Mirror of intent.md's Steps, with live status. Only ONE step is in flight. A step
is done only after a checkpoint — check green + checkpoint taken, via `/plumbbob:verify` or
`/plumbbob:build`.)*

- ☐ 1. <step>

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.
- [ ] Explore flattening src/lib: evaluate whether a shallower directory structure would improve codebase clarity

## Harvest  *(run `/plumbbob:harvest` at each step boundary, after green)*

Classify each parked item as exactly ONE. Naming it before acting is what keeps you
from sprawling across branches.

| Class            | Meaning                                   | Action                          |
|------------------|-------------------------------------------|---------------------------------|
| **blocker**      | Plan was wrong/incomplete; can't proceed  | `/plumbbob:revert`, fold into intent  |
| **tangent**      | A different path, not clearly better      | Defer or kill. Default here.    |
| **pivot signal** | Evidence the whole approach is wrong      | Stop. Replan deliberately.      |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require a
> failed assumption, not a shinier idea, before you pivot.

Harvest results this boundary:

- (none yet)

## Log

*(Append-only. One decision or event per line, dated. What you point at to say "I
did that — the LLM helped, but those were my calls." `/plumbbob:wrap` reads this for the
report; `plumbbob wrap` archives it under `.plumbbob/archive/`.)*

- <date> — <decision / event / what shipped this step>
- 2026-07-03 — step 1 checkpointed · 096c89d06 — Fix the linked-worktree exclude crash
- 2026-07-03 — step 2 checkpointed · 7f21628ca — Step titles in checkpoint subjects
- 2026-07-03 — step 3 checkpointed · 55e43b420 — `--body` stdin flag + deterministic fallback body
- 2026-07-03 — step 4 checkpointed · 0d0711940 — Settings ladder replaces `config`
- 2026-07-03 — step 5 checkpointed · c12e959a1 — Layout core: `builds/<slug>/` + settings cursor + narrowed excludes
- 2026-07-03 — step 6 checkpointed · 3977d0fa6 — Verbs + hook follow the layout; the switch verb lands
- 2026-07-03 — step 7 checkpointed · f1c9ba6db — Tracked-artifact safety: revert snapshot/restore + drift whitelist
- 2026-07-03 — step 8 checkpointed · a8831d175 — Plan-approval commit
- 2026-07-03 — step 9 checkpointed · 518750bdd — `wrap` → `finish`: rename, gut, retire `archive/`
- 2026-07-03 — step 10 checkpointed · 8c54d070e — Migration + docs + decision log
