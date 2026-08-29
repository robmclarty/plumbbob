<!--
build-log.md: your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time. CLI-maintained: `build`,
              `checkpoint`, and `revert` keep this mirror and the Current step line
              in sync with intent.md; you never hand-edit them.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Harvest   : the boundary ritual that keeps you on one branch.
  Log       : the build's history. `plumbbob checkpoint` appends a line per step as it
              lands; feeds the /plumbbob:finish report, which rides the branch into the PR.
-->

# Build log: presentation

**Current step:** 5 — docs(skills): align every skill output spec to the anatomy
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. docs(presentation): author the turn anatomy spec
- ☑ 2. feat(detail): the latest-step detail file and its lifecycle
- ☑ 3. feat(handoff): render the orientation banner and footer card
- ☑ 4. feat(verify): emit the recap skeleton and gate verdict line
- ☐ 5. docs(skills): align every skill output spec to the anatomy
- ☐ 6. docs(happy-path): make every illustrated block producible
- ☐ 7. test(evals): run the eval tier against the new anatomy

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

- [ ] step 5 gap: the plan-pause your-call block and the mid-step driver next-up line are spec'd in presentation.md but not yet emitted by `plumbbob handoff` (needs a src change, outside step 5's docs seam); skills document the tier ending the CLI actually emits rather than fake the furniture.
- [ ] bug: handoff's footer card omits a trailing blank line (src/verbs/handoff.ts ends its stdout with a single \n), so the next output clobbers the last your-call line — emit a trailing blank line so the card ends the turn with visual separation. A src fix, outside step 5's docs seam.

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

*(The build's history, oldest first. `plumbbob checkpoint` appends a dated line here
every time a step lands (via `/plumbbob:build` or `/plumbbob:verify`), so this
fills in as you go, not at the end. Add your own decision/event lines too: this is what
you point at to say "I did that: the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*

- 2026-08-29 — step 1 checkpointed · e1469c7f7 — docs(presentation): author the turn anatomy spec (1 drift, 52m)
- 2026-08-29 — step 2 checkpointed · 030407ba6 — feat(detail): the latest-step detail file and its lifecycle (1 drift, 11m)
- 2026-08-29 — step 3 checkpointed · 88d0656d3 — feat(handoff): render the orientation banner and footer card (1 drift, 16m)
- 2026-08-29 — step 4 checkpointed · 65726e6f7 — feat(verify): emit the recap skeleton and gate verdict line (150m)
