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

# Build log: move 2: make the plan schedulable

**Current step:** 1 — docs(plan): spec the step fields and the plan.json export
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☐ 1. docs(plan): spec the step fields and the plan.json export
- ☐ 2. fix(intent): refuse the seam tokens runciter refuses
- ☐ 3. feat(intent): read a step's after, stop, and effort lines
- ☐ 4. feat(plan): derive runciter.plan/1 from intent.md
- ☐ 5. feat(plan): check a plan's dependencies and seams before it exports
- ☐ 6. feat(export): write plan.json beside intent.md
- ☐ 7. feat(check): keep plan.json current, and fail the check when it drifts
- ☐ 8. docs(plan): teach the export where the plan is taught

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

- [ ] fourth plan check: an after: line naming a step later in build order, fold into step 5 (blocker)

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

- (none yet)

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends an entry here
every time a step lands (via `/plumbbob:build` or `/plumbbob:verify`): the dated line,
and beneath it the pause as you approved it, so this fills in as you go, not at the
end, and an older step's detail is a scroll away. Add your own decision/event lines too: this is what
you point at to say "I did that: the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*

- 2026-11-12 — plan committed · 1a1c3c2cc

  **Recommendation**: Approve it. The read checked that every seam in every existing build survives the tighter grammar (none uses `!`, a backslash or a `.`/`..` segment), that vitest already picks up `test/contract/`, that the three CLI writers of `intent.md` are `checkpoint`, `order` and `defer`, and that the plan parses with three ranges; the one hole worth watching is 1, and step 7 is where it gets settled.

  **1.** Step 7 leaves open how a plumbbob-side red reads on the card

  The drift check runs ahead of checkride in `runCheck`, but the recap's check row is measured from `.check/summary.json`. A red that writes no summary would leave the last green summary on disk, and the card could offer `looks good` over a stale plan. Step 7's note names the precedent (`runCommand` writes a summary for the override); closing it means the drift red writes a summary the row reads, or leaves none and the row says so.

  **2.** `pnpm check` in this repo never calls `plumbbob check`

  The brief makes drift a `plumbbob check` failure, and step 7 does that, so it also gates every checkpoint. But this repo's `pnpm check` runs checkride directly, so a drifted `plan.json` in this repo turns the checkpoint red and leaves `pnpm check` green. That holds for any repo, by design (plumbbob's check lives in plumbbob), but it means "`pnpm check` green" at the finish doesn't prove the two exported plans are current. Step 7's tests carry that proof instead.

  **3.** This build's own plan exports fully serial

  Every step here touches `src/lib/intent.ts` or builds on the step before, so no step carries an `after:` line and check 3 has nothing to fire on in either exported plan. The parallel and failing cases live only in step 4's and step 5's fixtures, so the second stop reads two serial plans. That is honest, but it isn't a demonstration of the check ridgeline never had.
