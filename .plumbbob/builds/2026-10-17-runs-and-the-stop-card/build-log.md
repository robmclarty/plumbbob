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

# Build log: Runs and the stop card

**Current step:** 1 — docs(presentation): spec how the card and the dashboard name the run
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☐ 1. docs(presentation): spec how the card and the dashboard name the run
- ☐ 2. feat(orient): resolve a run to the range it names and what is left
- ☐ 3. feat(turn): mint a run's grant from the range the plan names
- ☐ 4. feat(status): show the run a /plumbbob:run invocation resolves to
- ☐ 5. feat(handoff): name the run on the card in place of the range command
- ☐ 6. feat(run): add /plumbbob:run to run the range holding the next step
- ☐ 7. docs(presentation): spec the stop card that closes a run's range
- ☐ 8. feat(orient): measure a landed range for the stop card's readout
- ☐ 9. feat(handoff): render the stop card with plumbbob handoff --stop
- ☐ 10. feat(harvest): record a stop's harvest and review with plumbbob harvest
- ☐ 11. feat(skills): end a run on the stop card and settle it in one reply
- ☐ 12. feat(plan): point the plan and its template at the run
- ☐ 13. docs: describe the run as the main way to drive a plan
- ☐ 14. test(evals): hold /plumbbob:run to its range and its stop card

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

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

- 2026-10-18 — plan committed · 15f16364f

  **Recommendation**: Approve it. The cold read's three holes are settled as D16 (stop-card-held), D17 (live-run-early), and D18 (fold-then-run), the two refine found as D19 (in-flight-first) and D20 (finish-at-a-stop), and step 11 now writes a stop's summary from the record; every step and range still parses with no drift, every citation lands on its anchor, and no open question is left.

  **1.** Nothing holds a run that ends on its checkpoint block instead of the stop card (D8 (stop-card), steps 9 and 11)

  The stop card is a two-beat ending: the top step lands, then the model writes the range's detail and runs `plumbbob handoff --stop`. Only the run skill's prose asks for the second beat. A model that relays the last checkpoint's block instead passes the relay check, because that block is the last ending the CLI printed (`RELAY`), and a boundary relayed whole reads as a turn closed correctly; the review and the harvest never reach the screen. A new clean-halt shape has gone wrong under the eval tier before, in 2 of 4 runs (plumbbob D85 (range-top-lands)), and nothing in the CLI can tell a run's grant from a typed list's today, since both mint `steps 6-9`. Closing it: the hook marks a run in a `RUN` control file naming the range, beside `GRANT`, so the latch reads grants exactly as it does now, and the checkpoint that completes that range records its boundary as owing the stop card, so the relay check holds a turn that closed on the plain block. Steps 3 and 9 each gain a clause, step 10 clears the mark, and step 14 arms it the way c4 arms the grant.

  Settled at refine as D16 (stop-card-held): the `RUN` mark sits beside `GRANT` and the owing record rides `RELAY`, and, one refinement past the lean, the mark outlives a prompt while a step of its range waits at a pause, so a halt approved with `looks good` still owes the card.

  **2.** D6 (one-loop)'s read of the build skill is first measured at step 14, the build's last

  The run skill leans on the model reading `../build/SKILL.md` for the whole per-step loop: the pause, the detail file, the checkpoint body, and the halts. No step before 14 runs a live session, so a model that skips the read, or takes the build skill's own invocation rule for the run's, shows up only after steps 7 to 13 have built the stop card on top of it. Closing it: give step 6's done-when one headless session in a throwaway repo with this checkout loaded as the plugin, the grant pre-armed the way c4 arms it, that lands a two-step range through `/plumbbob:run`, and say in range 2's stop that the range spends that session. The build-ranges build ran its one live plan session inside a range the same way.

  Settled at refine as D17 (live-run-early): step 6 runs the one session, and range 2's stop reads it.

  **3.** A run typed at a waiting stop card can halt before a step its own harvest added (D10 (settle-in-one-reply))

  `/plumbbob:run` at the card records the proposals and then runs the range its grant names, but the hook minted that grant from the plan before the record ran. When a confirmed blocker folds in as a new step inside the next range, which is the harvest skill's own move for a blocker that needs one, the grant lacks the step and the walk halts before it: the early halt that D5 (run-refuses)'s *because* says ranges exist to remove. It fails safe, since nothing unapproved lands. Closing it: D10 says that when a confirmed proposal adds or moves a step in the range the run would walk, the run records the stop and ends at the boundary, where the card names the re-cut run, rather than walking a grant that no longer covers the range.

  Settled at refine as D18 (fold-then-run), with the grant check that step 4's header already prints as the trigger.
