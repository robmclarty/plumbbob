<!--
build-log.md — your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time. CLI-maintained: `build`,
              `checkpoint`, and `revert` keep this mirror and the Current step line
              in sync with intent.md — you never hand-edit them.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Harvest   : the boundary ritual that keeps you on one branch.
  Log       : the build's history. `plumbbob checkpoint` appends a line per step as it
              lands; feeds the /plumbbob:finish report, which rides the branch into the PR.
-->

# Build log — the em-dash sweep and the skills prose walk

**Current step:** 4 — feat(prose): author the em-dash rule at warning and print the queue
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status — CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint —
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. docs(skills): teach the harvest skill the anchored decision form
- ☑ 2. fix(skills): quote every SKILL.md frontmatter description
- ☑ 3. chore(gate): walk skills/ in the prose slot and burn down the findings
- ☐ 4. feat(prose): author the em-dash rule at warning and print the queue
- ☐ 5. docs(decisions): sweep the key and settle both format markers
- ☐ 6. docs(prose): sweep the guide docs
- ☐ 7. docs(prose): sweep the reference docs
- ☐ 8. docs(prose): sweep the front door and the agents guide
- ☐ 9. docs(templates): sweep the templates and land the decided marker
- ☐ 10. docs(skills): sweep the skills prose
- ☐ 11. chore(prose): sweep the src and scripts doc comments
- ☐ 12. docs(prose): sweep or exempt the hand-written essays
- ☐ 13. chore(gate): raise the em-dash rule to error and record it

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.
- [ ] docs/evals/ carries 68 EmDash findings and no step owns it: steps 5-12 never name the eval receipts, so step 13 cannot reach error-green as planned. Records under C3, or a sweep step of its own -> /plumbbob:refine
- [ ] step 11 measures 543 findings (460 production comments, 83 in test files), past D4's 150-250 band by 2x: it needs splitting before it is built -> /plumbbob:refine

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
every time a step lands — via `/plumbbob:build` or `/plumbbob:verify` — so this
fills in as you go, not at the end. Add your own decision/event lines too: this is what
you point at to say "I did that — the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*
- 2026-08-12 — step 1 checkpointed · 09f654835 — docs(skills): teach the harvest skill the anchored decision form (7m)
- 2026-08-12 — step 2 checkpointed · e3b5af42c — fix(skills): quote every SKILL.md frontmatter description (6m)
- 2026-08-12 — step 3 checkpointed · af0e781e3 — chore(gate): walk skills/ in the prose slot and burn down the findings (8m)
