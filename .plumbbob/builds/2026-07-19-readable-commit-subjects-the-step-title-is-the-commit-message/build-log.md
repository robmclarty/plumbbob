<!--
build-log.md — your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time. CLI-maintained: `build`,
              `checkpoint`, and `revert` keep this mirror and the Current step line
              in sync with intent.md — you never hand-edit them.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Harvest   : the boundary ritual that keeps you on one branch.
  Log       : the build's history. `plumbbob checkpoint` appends a line per step as it
              lands; feeds the /pb-finish report, which rides the branch into the PR.
-->

# Build log — Readable commit subjects: the step title is the commit message

**Current step:** 7 — docs: record the title-is-subject rule and the D68 amendment
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status — CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint —
check green + checkpoint taken, via `/pb-verify` or `/pb-build`.)*

- ☑ 1. feat: fall back through step scope, build default, then slug
- ☑ 2. docs(intent-template): make the step title double as the commit subject
- ☑ 3. feat(pb-plan): author titles as commit subjects and set the build scope
- ☑ 4. feat(pb-step): keep the sharpened title a clean commit subject
- ☑ 5. feat(pb-refine): resync the commit subject when the plan drifts
- ☑ 6. feat(pb-verify): present a reconciled subject at the pause before it lands
- ☐ 7. docs: record the title-is-subject rule and the D68 amendment

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/pb-park` composes it). Harvest happens only at the boundary.

## Harvest  *(run `/pb-harvest` at each step boundary, after green)*

Classify each parked item as exactly ONE. Naming it before acting is what keeps you
from sprawling across branches.

| Class            | Meaning                                   | Action                          |
|------------------|-------------------------------------------|---------------------------------|
| **blocker**      | Plan was wrong/incomplete; can't proceed  | `/pb-revert`, fold into intent  |
| **tangent**      | A different path, not clearly better      | Defer or kill. Default here.    |
| **pivot signal** | Evidence the whole approach is wrong      | Stop. Replan deliberately.      |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require a
> failed assumption, not a shinier idea, before you pivot.

Harvest results this boundary:

- (none yet)

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends a dated line here
every time a step lands — via `/pb-build` or `/pb-verify` — so this
fills in as you go, not at the end. Add your own decision/event lines too: this is what
you point at to say "I did that — the LLM helped, but those were my calls."
`/pb-finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*
- 2026-07-19 — step 1 checkpointed · 6479ab667 — feat: fall back through step scope, build default, then slug (8m)
- 2026-07-19 — step 2 checkpointed · aed218390 — docs(intent-template): make the step title double as the commit subject (1m)
- 2026-07-19 — step 3 checkpointed · c3e82f789 — feat(pb-plan): author titles as commit subjects and set the build scope (6m)
- 2026-07-19 — step 4 checkpointed · 90bd34b18 — feat(pb-step): keep the sharpened title a clean commit subject (4m)
- 2026-07-19 — step 5 checkpointed · a1f5f29c3 — feat(pb-refine): resync the commit subject when the plan drifts (5m)
- 2026-07-19 — step 6 checkpointed · a3d2045cc — feat(pb-verify): present a reconciled subject at the pause before it lands (9m)
