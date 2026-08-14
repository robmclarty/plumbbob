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

# Build log: the leftovers: mask-aware sweep sizing, the park-nudge eval, and abandon-step

**Current step:** 2 — feat(prose): add a mask-aware counter that sizes a prose sweep
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. chore(refs): share the masking spans and mask indented blocks
- ☐ 2. feat(prose): add a mask-aware counter that sizes a prose sweep
- ☐ 3. chore(evals): re-measure c5 both arms at 0.10.0, land the receipt
- ☐ 4. fix(turn): reword the park nudge and re-measure the latched arm
- ☐ 5. feat(abandon): drop an in-flight step and keep the work
- ☐ 6. docs(abandon): add the driver skill and record the decision

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.
- [ ] prose-mask.ts's INLINE_CODE_RE doesn't match a backtick-delimited span that wraps across a line break, so an em-dash inside one (e.g. skills/verify/SKILL.md:100-101) reads as unmasked prose to count-prose.ts
- [ ] check-refs.ts's scan surface excludes scripts/**/*.ts, so a build-local D#/C# citation in a scripts/ comment (e.g. D2, D3, D14 in prose-mask.ts and count-prose.ts, all numbers already taken by unrelated decisions in docs/decisions.md) is never checked and can read as the wrong global decision

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
- 2026-08-14 — step 1 checkpointed · 38a2b8b56 — chore(refs): share the masking spans and mask indented blocks (2m)
