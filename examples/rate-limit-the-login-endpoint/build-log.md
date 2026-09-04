<!--
build-log.md — your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."
-->

# Build log — Rate-limit the login endpoint

**Current step:** none (at the boundary)
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status. Only ONE step is in flight. A step
is done only after a checkpoint — check green + checkpoint taken, via `/plumbbob:verify` or
`/plumbbob:build`.)*

- ☒ 1. feat(limiter): add a token-bucket limiter
- ☒ 2. feat(login): wire the limiter into POST /login
- ☒ 3. feat(config): make the limit configurable via env

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

- [x] tangent: should /password-reset get the same throttle?

## Harvest  *(run `/plumbbob:harvest` at each step boundary, after green)*

Classify each parked item as exactly ONE. Naming it before acting is what keeps you
from sprawling across branches.

| Class            | Meaning                                   | Action                               |
| ---------------- | ----------------------------------------- | ------------------------------------ |
| **blocker**      | Plan was wrong/incomplete; can't proceed  | `/plumbbob:revert`, fold into intent |
| **tangent**      | A different path, not clearly better      | Defer or kill. Default here.         |
| **pivot signal** | Evidence the whole approach is wrong      | Stop. Replan deliberately.           |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require a
> failed assumption, not a shinier idea, before you pivot.

Harvest results this boundary:

- tangent → **defer**: `/password-reset` throttle — a separate route and a separate
  decision, not a blocker for this goal; resurfaces in the finish report as future work.

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends a dated line here
every time a step lands — via `/plumbbob:build` or `/plumbbob:verify` — so this
fills in as you go, not at the end. Add your own decision/event lines too: this is what
you point at to say "I did that — the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*

- 2026-07-03 — step 1 checkpointed · a1b2c3d4e — feat(limiter): add a token-bucket limiter
- 2026-07-03 — parked mid-step-2: /password-reset throttle (captured, not chased)
- 2026-07-03 — step 2 checkpointed · 5b8f31da2 — feat(login): wire the limiter into POST /login
- 2026-07-03 — step 3 checkpointed · 9c4d02e11 — feat(config): make the limit configurable via env
- 2026-07-03 — harvest: 1 parked → tangent/defer (see Harvest above)
