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

**Current step:** 4 — feat(status): show the run a /plumbbob:run invocation resolves to
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. docs(presentation): spec how the card and the dashboard name the run
- ☑ 2. feat(orient): resolve a run to the range it names and what is left
- ☑ 3. feat(turn): mint a run's grant from the range the plan names
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

- [ ] status --run words two refusal pointers docs/presentation.md does not list: a span typed reads '(steps 6-9; a run names one range)', and a numbered run while a step no range names is in flight reads '(or /plumbbob:abandon it; no range names it)'; spec them beside the eight in The run header (src/lib/orient.ts runRefusalMove)

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

- 2026-10-18 — step 1 checkpointed · a720041d1 — docs(presentation): spec how the card and the dashboard name the run (21m)

  **Summary**: The spec now names `/plumbbob:run` everywhere the card and the dashboard named a range's build command, with the steps the run lands in a bracket written as the grant the hook will mint, adds the run as a second approval on a step pause's Your Call block, gives `status --run` a three-line header and eight refusal pointers, and records the run as D95 (run-verb) through D99 (one-loop) with dated revision notes on D92 (build-ranges) and D93 (range-on-the-card).

  1. The segment names the run as its grant will read, so the bracket is the only thing that changes between sites
  2. At a step pause the segment counts the step in flight, and the pause on a range's last step names no run at all
  3. The Your Call block gains `/plumbbob:run` as a second approval inside a landing range, and the plan pause's row names the run
  4. `status --run` prints a run header above the dashboard, and a refusal prints no header, only the pointer with its remedy
  5. `docs/decisions.md` gains D95 (run-verb) through D99 (one-loop), five entries merging the nine locals, with revision notes on D92 and D93

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    9 of 9 honored
               - D1 (run-verb), D2 (run-names-a-range), D3 (plan-names-the-grant)
               - D4 (namespaced-run), D5 (run-refuses), D6 (one-loop)
               - D7 (card-names-the-run), D13 (run-at-a-pause), D19 (in-flight-first)
  constraints  10 of 10 honored
  seam         held: 2 of 2 declared, no strays
  diff         +310 -50 across 2 files
  spent        21 min · 1 turn · 112s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Approve the strings and the five decisions. The one rule underneath them, that the bracket on the card is the grant the hook mints, is what keeps the card, the hook, and the run header reading one plan, and the only shape left open, the run row at a range's last-step pause, is step 7's to extend once the stop card gives the run something more than `looks good` to do there.

  **1.** The segment names the run as its grant will read, so the bracket is the only thing that changes between sites

  The forms are `· range 3 of 5: /plumbbob:run (steps 6-9)`, `(steps 8-9)` once two steps landed, `(step 9)` for a range down to one, and `(step 10 to its pause)` for a bare range. The bracket is written in the step list's normal form, which is the text the hook puts in `GRANT` once the human types the run (D3 (plan-names-the-grant)): a card that named one set while the hook minted another would be a suggestion that does something else. The old `9-9` trick, which existed so `/plumbbob:build` would land a range's last step rather than pause on it, drops out of the card, because the run knows the range lands; the `9-9` form stays in the plan's section as what a human types to land that step by hand. The dashboard's `next →` reads `run range 3 of 5` with the verb and the same bracket. Flagged ranges, a step no range names, and a plan without ranges render exactly as today.

  **2.** At a step pause the segment counts the step in flight, and the pause on a range's last step names no run at all

  Today's rule was "what is left once the step in flight lands", written for a `/plumbbob:build 7-9` typed after `looks good`. D13 (run-at-a-pause) makes the run that pause's `looks good`, and D2 (run-names-a-range) counts the step in flight as undone, so the hook mints `steps 6-9` at step 6's pause. The segment therefore reads `range 3 of 5: /plumbbob:run (steps 6-9)` there, matching the grant, while Next Up still names step 7. At the pause on a range's last step a run would land step 9 and end on range 3's stop rather than start range 4, so the card must not say `range 4 of 5: /plumbbob:run (step 10 to its pause)`: it reads `range 3 of 5 lands with step 9`, a new form with no command, and range 4's segment waits for the boundary beneath the Stop part. A bare range's pause is the same case. The bracket's bold model stays that of the range holding the step Next Up names, which is the range the human picks a model for; at a last-step pause that is the next range, not the one finishing.

  **3.** The Your Call block gains `/plumbbob:run` as a second approval inside a landing range, and the plan pause's row names the run

  The row rides second, beneath `looks good`: `/plumbbob:run → I checkpoint Step 6, then run the rest of range 3 to its stop`. It renders exactly when `looks good` does (green only, since the step lands only on a green check) and only where it does more than `looks good`: inside a landing range with steps still ahead. A bare range's pause and a range's last-step pause keep the four moves. One shape is left for step 7: once the stop card exists, a run typed at a range's last-step pause closes the range on the card where `looks good` from a hand-built pause does not, so step 7 may extend the row to that pause. At the plan pause the first row reads `/plumbbob:run runs range 1 from Step 1` when the plan declares ranges, `runs range 3 from Step 8` after a mid-build refine; a step in no range or in a flagged range keeps `/plumbbob:build starts Step 1`.

  **4.** `status --run` prints a run header above the dashboard, and a refusal prints no header, only the pointer with its remedy

  The header is three lines in the dashboard's grammar: `run  range 3 of 5 · steps 6-9 · ends at step 9's boundary` (or `ends at step 10's pause` for a bare range), `stop:` with the plan's text, and `grant:` in one of five forms: `steps 6-9`; `none, as a bare range builds to its pause`; a bare `none` for a landing range the hook minted nothing for; `range 9, unlike the run`; and `steps 6-9, unlike the run`. The grant line is the one the skill trusts over the two above it, since the hook read the plan the human typed against; the spec states the difference and leaves what to do with it to the run skill (step 6, and D18 (fold-then-run) at step 11). The dashboard beneath marks the run's first step `← requested`. A run that names nothing it can walk (D5 (run-refuses), D19 (in-flight-first)) prints no header; its pointer is one of eight strings: `cut the ranges`, two `re-cut the ranges` forms carrying the drift words, two `run range 3 of 5` forms that refuse a landed or missing number and name the range the card names, the dashboard's own finish ending, `finish step 12` with the in-flight remedy, and `close the spike`. A bare run while a step is in flight is not a refusal: it names that step's range, and the header renders.

  **5.** `docs/decisions.md` gains D95 (run-verb) through D99 (one-loop), five entries merging the nine locals, with revision notes on D92 and D93

  The split: D95 (run-verb) merges D1, D2, D13, and D19 (the verb, what it names, the run at a pause, the step in flight deciding it); D96 (plan-names-the-grant) merges D3 and D4; D97 (run-refuses) carries D5 and the two refusals D19 added; D98 (card-names-the-run) carries D7 with the exact strings; D99 (one-loop) carries D6. Each keeps its *because*, cites by slug, and names what it amends (D83, D92, D65, D93). D92's note says a range grants nothing until the human types the run that names it, and D93's says the segment and the pointer name the run and the last-step pause names none. The header paragraph lists D95 to D99 as promoted from this build. The full check is green across all 11 slots, test included; the `--only` narrowing I asked for was not applied, so the green is the whole gate.

- 2026-10-18 — step 2 checkpointed · d2bd150d9 — feat(orient): resolve a run to the range it names and what is left (11m)
- 2026-10-18 — step 3 checkpointed · aee679a7a — feat(turn): mint a run's grant from the range the plan names (6m)
