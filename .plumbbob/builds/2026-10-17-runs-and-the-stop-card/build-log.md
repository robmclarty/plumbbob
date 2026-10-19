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

**Current step:** 13 — docs: describe the run as the main way to drive a plan
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. docs(presentation): spec how the card and the dashboard name the run
- ☑ 2. feat(orient): resolve a run to the range it names and what is left
- ☑ 3. feat(turn): mint a run's grant from the range the plan names
- ☑ 4. feat(status): show the run a /plumbbob:run invocation resolves to
- ☑ 5. feat(handoff): name the run on the card in place of the range command
- ☑ 6. feat(run): add /plumbbob:run to run the range holding the next step
- ☑ 7. docs(presentation): spec the stop card that closes a run's range
- ☑ 8. feat(orient): measure a landed range for the stop card's readout
- ☑ 9. feat(handoff): render the stop card with plumbbob handoff --stop
- ☑ 10. feat(harvest): record a stop's harvest and review with plumbbob harvest
- ☑ 11. feat(skills): end a run on the stop card and settle it in one reply
- ☑ 12. feat(plan): point the plan and its template at the run
- ☐ 13. docs: describe the run as the main way to drive a plan
- ☐ 14. test(evals): hold /plumbbob:run to its range and its stop card
- ☑ 15. docs(presentation): spec the stop card's leans and handles and the cards' short links
- ☑ 16. feat(handoff): render the leans, the park handles, and the short links on every card

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

- [x] status --run words two refusal pointers docs/presentation.md does not list: a span typed reads '(steps 6-9; a run names one range)', and a numbered run while a step no range names is in flight reads '(or /plumbbob:abandon it; no range names it)'; spec them beside the eight in The run header (src/lib/orient.ts runRefusalMove)
- [x] the plain dashboard's ranges block could mark a stop card still waiting (a tail beside the landed range's row), where only status --run names it today (tangent)
- [x] docs/presentation.md's range readout examples read `spent 192 min`, where the shared duration format step 8 reuses renders `3h 12m` past two hours; align the examples or give a range its own minutes form (tangent)
- [x] the build log's dated Harvest lines still write `park 1 ·` (harvestLines in src/lib/buildlog.ts, outside step 16's seam) while the card and the Log's review say P1, so D105 (park-handles)'s one name stops short of the ledger (tangent)
- [ ] docs/faq.md's 'Fourteen skills' heading and docs/attention-first-development.md's 'fifteen skills' predate the run (sixteen now); faq's day-to-day answer should name /plumbbob:run (tangent)

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

- 2026-10-18, at range 2's stop (the step 6 boundary): one parked item, classified.
- **blocker** (folded into step 7's done-when): `status --run` words two refusal pointers
  `docs/presentation.md` does not list, a span typed and a numbered run while a step no range
  names is in flight (`runRefusalMove` in `src/lib/orient.ts`). The code is right; the spec is
  behind it, and step 7 already rewrites the run header's section, so it specs both beside the
  eight.
- 2026-10-18, at range 3's stop (the step 7 boundary): one parked item, classified.
- **tangent** (deferred to the plan's Noticed list): the plain dashboard's ranges block could mark a
  stop card still waiting, a tail beside the landed range's row, where only `status --run` names it
  (step 10's waiting line). No step depends on it, and step 7's spec leaves the plain dashboard as it is.
- 2026-10-18, at range 4's stop (the step 11 boundary): one parked item, classified.
- **blocker** (folded into step 13's done-when and seam): the range readout examples in
  `docs/presentation.md` read `spent 192 min`, where the duration format step 8 reuses from a step's
  `spent` row prints `3h 12m` past two hours. The code is consistent with the step's row; the spec's
  two examples are what is off, and C4 (spec-first) makes the spec the card's source of truth, so
  step 13 aligns them alongside the rest of the docs.
- 2026-10-18, at range 8's stop (the step 16 boundary): one parked item, classified.
- **tangent** (deferred to the plan's Noticed list): the build log's dated Harvest lines still
  write `park 1 ·` (`harvestLines` in `src/lib/buildlog.ts`) where the card and the Log's review
  say `P1`. `plumbbob harvest` matches a park by its number, never by that text, and no step left
  reads the lines, so the wording can wait.

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
- 2026-10-18 — step 4 checkpointed · 0129d3519 — feat(status): show the run a /plumbbob:run invocation resolves to (1 red, 1 drift, 11m)
- 2026-10-18 — step 5 checkpointed · de0185e58 — feat(handoff): name the run on the card in place of the range command (8m)
- 2026-10-18 — step 6 checkpointed · ea3968808 — feat(run): add /plumbbob:run to run the range holding the next step (10m)
- 2026-10-18 — step 7 checkpointed · 5080ad6f0 — docs(presentation): spec the stop card that closes a run's range (25m)

  **Summary**: The spec now says what a run's range ends on: a stop card whose Stop lead stands where the Now line and the checkpoint block stood, a readout measured across the range's commits, a Harvest part listing every open park under a handle the record can match without guessing, and a Your Call that settles the proposals in one reply; it specifies the range detail's shape, the reminder, the record's ending and six refusals, the `RUN` mark and the owing `RELAY` hold, the run header's waiting line and two missing refusals, and records D100 (stop-card) through D104 (harvest-records) with revision notes on D85, D87, and D89.

  1. The card's shape: a Stop lead, the range's review, the Harvest part between the Verdict and Next Up, and no revert or inline diff
  2. A park's handle is its place in the Park list, counting harvested lines, written `park 6` and never a bare number
  3. The range readout promises only what is on disk: a `steps` row with shas, landings counted on `check`, each step held to its own seam, and a `spent` row with no gate or turn clause
  4. The record: `plumbbob harvest` ends on `**Stop**: Range 3 of 5 recorded (1 blocker, 2 tangents)` at the orientation tier, and the `RUN` mark with an owing `RELAY` holds a run to its card
  5. Decisions D100 to D104 merge the ten locals, with revision notes on D85, D87, and D89, and the run header gains its waiting line and the two refusals step 4 worded

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    10 of 10 honored
               - D8 (stop-card), D9 (range-readout), D10 (settle-in-one-reply)
               - D11 (stop-latched), D12 (harvest-records), D14 (stop-record)
               - D15 (empty-stop), D16 (stop-card-held), D18 (fold-then-run)
               - D20 (finish-at-a-stop)
  constraints  10 of 10 honored
  seam         held: 2 of 2 declared, no strays
  diff         +611 -22 across 2 files
  spent        25 min · 1 turn · 147s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Approve the anatomy and the record as specified. The two calls the plan left to this pause are settled on the page in a form steps 8 to 11 can render as written: a park's handle is its place in the list, which the record matches by number, and the readout names only what the commits and `stats.json` already hold. The one line worth a second look before the code copies it is the handle's grammar, `park 6`, because every reply at a stop will use it.

  **1.** The card's shape: a Stop lead, the range's review, the Harvest part between the Verdict and Next Up, and no revert or inline diff

  The stop card is a decision turn at the step pause's tier, rendered by `plumbbob handoff --stop` from the range detail. Its lead is the boundary's Stop part moved to the top of the card (`**Stop**: Range 3 of 5 landed - <stop> (details: intent.md:63)`), and it has no Now line and no Checkpoint lead: no step is in flight, and the range's checkpoints are the readout's first row. The checkpoint block the last step printed is not relayed; the card replaces it, which is what D8 (stop-card)'s amendment to D85 says. The Harvest part sits between the Verdict and Next Up so the review reads first and the proposals lead into the moves. Two things the step pause has were dropped on purpose: the `revert` move, because the tree is clean and a wrong step is a boundary revert the record returns to, and the inline diff, because a range's change is its commits, read by sha. The parks segment is dropped from the note beneath Next Up on the card alone, since the Harvest lead carries the count. The empty stop renders the same card without the Harvest part, with the record folded into the four moves' clauses.

  The tiers table gains a `decision, at a stop` row rather than a fourth tier, and the orientation row gains the stop's record. The pause-once rule, the Next Up forms, the Your Call section, the build ranges intro, the Stop part, and the Without-the-section rule each gained one sentence pointing at the new sections.

  **2.** A park's handle is its place in the Park list, counting harvested lines, written `park 6` and never a bare number

  This is the first of the two collisions the step note named. A park has no identity today beyond its text. The handle is its line's position under `## Park list` counting every line ever parked, harvested ones included: that is the count the note already sizes (`parked 3 of 8 open`), park lines are never deleted, only flipped, so the number is stable for the life of the build, and `plumbbob harvest` can match a proposal to its park by number alone. It reads `park 6` on the card and in a reply because the bare numbers belong to the highlights (`expand 2` opens a section) and one reply at a stop can carry both. The CLI prints the handle and the park's text from the list, the model writes only `- park 6 → tangent: <reason>` into the detail file's `## Harvest` section, and a park the section leaves out renders `→ no class proposed` so an omission is visible and the record leaves it open. I considered letters (`a`, `b`) and a `p6` form; letters need a second mapping and run out, and `p6` reads as machine noise where the house already says park.

  **3.** The range readout promises only what is on disk: a `steps` row with shas, landings counted on `check`, each step held to its own seam, and a `spent` row with no gate or turn clause

  Eight rows at most. The `steps` row is new and measures nothing: `4 of 4 landed` with the shas packed onto continuation lines by width (one line per step would make a ten-step range an eleven-line row), and `no checkpoint` in a sha's slot when the ledger lacks one. The `check` row is the last run's summary with the landing count behind it (`green: 11 of 11 checks, 4 landings`), since every landing passed the gate by construction and the red runs along the way ride `spent` and the Verdict's advisory. The `seam` row compares each step's commit against that step's own seam, never the union. The `spent` row runs from the first `startedAt` to the last `landedAt` with the red runs summed, and I left out the gate and the turns deliberately: `stats.json` holds only `redChecks`, `driftWarnings`, `reverts`, `abandons`, and the two stamps per step, the gate's wall clock is the last run's summary only, and the ledger counts turns from the tick that entered a step. Promising a summed gate would have made step 8 invent a number. The Verdict's advisories are reworded across the range (`1 revert in the range`, commits outside the ledger between the range's checkpoints).

  **4.** The record: `plumbbob harvest` ends on `**Stop**: Range 3 of 5 recorded (1 blocker, 2 tangents)` at the orientation tier, and the `RUN` mark with an owing `RELAY` holds a run to its card

  The record's ending is orientation tier with no Verdict (nothing measured) and Next Up with its note, which is what makes D18 (fold-then-run) work: when the record re-cuts the range the run would walk, that ending's note already names the re-cut run, and the run skill ends there after `status --run` reports the grant unlike the run. The label is `Stop` again because the artifact that landed is the stop's record; outside a stop the lead is `**Harvested**: 2 parked ideas (2 tangents)`. Six refusals are worded in the notice register, the first being the latch itself (the card's stamp carries the turn it printed in); a proposal naming a park the list lacks or a class outside the three refuses the whole record so the card and the ledger never disagree. The hold's reason line names the step whose boundary the turn ended on, the range whose card is owed, and `plumbbob handoff --stop`; the card's render then takes the record's place at the decision tier with `--stop --full` as its reprint. The second collision the note named is settled in the detail plane: the range detail's header is `# Detail · Range 3 · <stop>`, a header naming a range is what tells `checkpoint` the file is not a step's, and a boundary harvest writes `# Detail · Harvest`.

  **5.** Decisions D100 to D104 merge the ten locals, with revision notes on D85, D87, and D89, and the run header gains its waiting line and the two refusals step 4 worded

  D100 (stop-card) merges D8 and D15, D101 (range-readout) is D9, D102 (settle-in-one-reply) merges D10, D18, and D20, D103 (stop-latched) merges D11 and D16, and D104 (harvest-records) merges D12 and D14, each carrying its *because* and its `Promoted from` line, wrapped to the file's width with links kept whole; the header's promoted range now reads D95 to D104. The run header's fourth line, `waiting: range 3 of 5's stop card, recorded before the run`, is how a fresh session learns a card is waiting, and the two refusals from the range 2 harvest's blocker (`a run names one range`; `no range names it`) now sit in the fence with their prose. One flag: the four files under `.plumbbob/builds/2026-10-17-runs-and-the-stop-card/` were already modified when this step began (range 2's harvest, and the CLI's own records), and they ride this checkpoint by D14 (stop-record)'s rule; the seam row names them if it counts them. One park: the plain dashboard could mark a waiting stop card beside the landed range's row, where only `status --run` names it (tangent).

- 2026-10-18 — step 8 checkpointed · 163a6b025 — feat(orient): measure a landed range for the stop card's readout (4m)
- 2026-10-18 — step 9 checkpointed · 921dc85c7 — feat(handoff): render the stop card with plumbbob handoff --stop (1 drift, 22m)
- 2026-10-18 — step 10 checkpointed · df2a0c000 — feat(harvest): record a stop's harvest and review with plumbbob harvest (1 drift, 13m)
- 2026-10-18 — step 11 checkpointed · 38112dea2 — feat(skills): end a run on the stop card and settle it in one reply (10m)
- 2026-10-19 — step 15 checkpointed · ed4cbe200 — docs(presentation): spec the stop card's leans and handles and the cards' short links (632m)

  **Summary**: The spec now names each open park on the stop card `P6` on a bullet line with `→ lean: <class>, <reason>` behind it under a `Harvested` label, opens the Your Call block on a line saying approval locks in each lean, ends `plumbbob harvest` outside a stop on `**Recorded**:`, writes the note's build order as `order: 7, 8, 5`, and gives every `details:` bracket a short link, `[intent.md:41](.plumbbob/builds/x/intent.md#L41)`, the relative form Rob chose at this pause.

  1. The `Harvested` part names each park `P6` on a bullet line and proposes `→ lean: <class>, <reason>`, with `- P6 → <class>: <reason>` as the wire and `P9` in the refusals
  2. The Your Call block opens on "Approving locks in each lean above" with `make P6 a blocker` as its example, the direction row drops its own, and `plumbbob harvest` ends outside a stop on `**Recorded**:`
  3. Every `details:` bracket is specified as `[intent.md:41](.plumbbob/builds/x/intent.md#L41)`, the relative link Rob chose at this pause; the click test was waived, and the spec says so beside the form
  4. The note beneath Next Up writes `order: 7, 8, 5, 10, 6 (and 2 more)` as a labeled field
  5. `docs/decisions.md` gains D105 (park-handles) through D108 (order-label), with revision notes on D81, D102, and D104

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    5 of 5 honored
               - D21 (park-handles), D22 (leans-harvested), D23 (leans-lock-in)
               - D24 (short-linked-paths), D25 (order-label)
  constraints  10 of 10 honored
  seam         held: 2 of 2 declared, no strays
  diff         +220 -92 across 2 files
  spent        10h 32m · 6 turns · 425s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Approve it. The five calls from range 4's stop are on the page in a form step 16 can render as written, and the one the plan left to this pause, the link form, is recorded as chosen, with the click test's absence stated where a reader would look for its result.

  **1.** The `Harvested` part names each park `P6` on a bullet line and proposes `→ lean: <class>, <reason>`, with `- P6 → <class>: <reason>` as the wire and `P9` in the refusals

  The section is renamed `### The Harvested part` (its anchor moved with it, and the one reference in the file follows). The handle is `P6` for the sixth line ever parked, harvested lines counted, the same count the note sizes, so the record still matches a proposal by number alone. Each park rides a bullet line because a numbered list renumbers: open parks 6 and 8 would render as 6 and 7. The item reads `- P6 · <text> → lean: tangent, <reason>`; the detail wire keeps the colon form, `- P6 → tangent: <the reason>`, and handoff writes the lean's punctuation. The omission string is now `→ no lean proposed`. `plumbbob harvest`'s two proposal refusals read `(P9 is not in the list; 8 parked)` and `(P7's class "later" is not blocker, tangent, or pivot)`. The word `lean` is the plan's own (an open question's `*lean:*`), which is why `suggested:` was dropped; the spec says so where the item is defined.

  **2.** The Your Call block opens on "Approving locks in each lean above" with `make P6 a blocker` as its example, the direction row drops its own, and `plumbbob harvest` ends outside a stop on `**Recorded**:`

  The line sits beneath the label and ahead of the moves, blank lines either side, so no renderer folds it into the label's paragraph: `Approving locks in each lean above; to change one, say so first (`make P6 a blocker`).` The example's rule, for step 16 to render: the first open park, recast as the class its lean is not (a blocker for a tangent or a pivot, a tangent for a blocker), so it always names a change the card could take. The direction row is now bare, `anything that reads as direction → I re-render the card with the lean changed`, and the moves say `every lean` where they said `every class`. A stop with no park open renders no lean line. Outside a stop the record's ending is `**Recorded**: 2 parked ideas (2 tangents)`, because `Harvested` is the card's part now and one label over a part that proposes and an ending that records would mean two things; the stop's own ending keeps `**Stop**: Range 3 of 5 recorded (…)`.

  **3.** Every `details:` bracket is specified as `[intent.md:41](.plumbbob/builds/x/intent.md#L41)`, the relative link Rob chose at this pause; the click test was waived, and the spec says so beside the form

  The rule lives in `### The Next Up line`, and the Summary section points at it. The text is the file's name and line (`detail.md` alone for the Summary lead, since the whole file is the detail), the target the path from the repo root with a `#L41` fragment, on the Summary lead, Next Up, the Stop part and the stop card's lead, and a transition's lead alike. All 19 example brackets in the file are converted, including the detail plane's `…/build-log.md:412`. The plan asked for four candidates to be clicked in Claude Code's terminal and in Zed before the pick (the code-spanned `path:line` the cards print today, a link to the relative path, the same with `#L1275`, and an absolute `file://` URL); the pause offered them twice, and Rob chose the relative link with the fragment on its reasons: the short name says which file, a relative target keeps a machine's path out of any pasted card and resolves on GitHub with the line highlighted, and `file://` would stamp one machine's absolute path on every card. The spec and D107 (short-linked-paths) both record that the test was not run and leave what each host opens to the first card the code renders. Two things checked for the choice: the links check walks every `*.md` under the repo, `.plumbbob/` included, and skips links inside code spans and fences, so the spec's examples are safe where they sit; and the record of a Summary lead drops its bracket, so no live link lands in the build log.

  **4.** The note beneath Next Up writes `order: 7, 8, 5, 10, 6 (and 2 more)` as a labeled field

  In place of `build order 7, 8, 5, 10, 6 (and 2 more)`. The reason is on the page: the note's other segments read as labeled fields (`range 3 of 5:` names its range, `parked 2 of 7 open` its count), and a label is how the eye finds one in a line of three. D86 (build-order) in `docs/decisions.md` does not quote the phrase, so it needs no revision note; D108 (order-label) says it revises the phrase D86 gave the line.

  **5.** `docs/decisions.md` gains D105 (park-handles) through D108 (order-label), with revision notes on D81, D102, and D104

  D105 (park-handles) is D21; D106 (leans-harvested) merges D22 and D23, since the label, the lean, the lock-in line, and the `Recorded` ending are one call about how a proposal reads; D107 (short-linked-paths) is D24, with the waived test on record; D108 (order-label) is D25. Each keeps its *because*, cites by slug, names what it revises, and carries its `Promoted from` line. D81's note records the link form, D102's the `P6` handle and the leans, D104's the `Recorded` ending and the `P9` refusal. The header's promoted range now runs D95 to D108. The full gate ran green across all 11 slots at the pause; the `--only` narrowing asked for was not applied, so the green was the whole gate.

- 2026-10-19 — step 16 checkpointed · 3a93b6355 — feat(handoff): render the leans, the park handles, and the short links on every card (59m)

  **Summary**: Every card now renders what step 15 specified: the stop card lists each open park as `P1` with its lean under a `Harvested` label and says above the moves that approving locks the leans in, every `details:` bracket is a short link to the file and line, the note beneath Next Up writes `order:`, and `plumbbob harvest` reads the `P6` wire, refuses a missing handle as `P9`, and ends outside a stop on `Recorded`.

  1. The stop card names each open park `P1` under a `Harvested` label with its lean, and opens Your Call on the lock-in line.
  2. Every `details:` bracket is now the short link, built by one helper, on every card and every lead.
  3. The `P6` handle is the wire in handoff, harvest, and both skills, while a detail written as `- park 6 →` still reads.
  4. The note beneath Next Up writes `order: 4, 3`.
  5. The build log's dated Harvest lines still say `park 1 ·`, outside the seam, so I parked it.

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    honored
               - D21 (park-handles), D22 (leans-harvested), D23 (leans-lock-in)
               - D24 (short-linked-paths), D25 (order-label)
  constraints  10 of 10 honored
  seam         held: 18 of 18 declared, no strays
  diff         +331 -226 across 18 files
  spent        59 min · 1 turn · 323s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Approve it, then click this card's two `details:` links in Claude Code and in Zed before range 5 runs. Step 15 waived that test and left what each host opens to the first card the code renders, which is this one, and steps 12 and 13 should describe a link whose behavior is known.

  **1.** The stop card names each open park `P1` under a `Harvested` label with its lean, and opens Your Call on the lock-in line.

  `harvestPart` prints `- P1 · <text> → lean: tangent, <reason>`, or `→ lean: pivot` when the detail gave no reason, or `→ no lean proposed` when it left the park out. `stopCallBlock` puts `Approving locks in each lean above; to change one, say so first (...)` beneath the label while a park is open, and the direction row is bare. The example comes from `leanExample`, which replaces `directionExample`: the first open park recast as the class its lean is not, so a tangent, a pivot, or a park with no lean reads `make P1 a blocker`, and a blocker reads `make P1 a tangent`. With no park open the line does not render. The anatomy reader had to learn that line: a flush, unlabeled line under Your Call counted as a stray, which would have failed the stop tier on every card with a park open. It now matches that one sentence under that one label, and the test pins that any other flush line there, or this one under another label, is still a stray. `TIER_PARTS` and `OPTIONAL_PARTS` name `Harvested`. The relay check needed no change, as the plan's note said.

  The stop card, rendered by `node src/cli.ts handoff --stop` in a `mktemp -d` repo (four steps, build order `1, 2, 4, 3`, range 1 `1-2` landed, two parks):

  ````markdown
  **Stop**: Range 1 of 2 landed - review both modules before the CLI reads them (details: [intent.md:34](.plumbbob/builds/greeter/intent.md#L34))

  **Summary**: Both greeting modules exist and export a plain string each. (details: [detail.md](.plumbbob/detail.md))

  1. Step 1 adds `hello`.
  2. Step 2 adds `bye`.

  **Readout**:

  ```text
  steps        2 of 2 landed
               - 1 e30b5b7 · 2 ad63d36
  check        green: 1 of 1 checks, 2 landings
  done-when    met
  decisions    1 of 1 honored
  constraints  1 of 1 honored
  seam         held: 2 of 2 steps, no strays
  diff         +2 -0 across 2 files
  spent        3s · green first run at every landing
  ```

  **Verdict**: ● Plumb

  **Harvested**: 2 of 2 parked ideas open

  - P1 · should the greeting carry punctuation? (tangent) → lean: tangent, punctuation is the CLI's call, at step 3
  - P2 · bye could reuse hello's shape → lean: blocker, step 3 prints both, so the shapes should match first

  **Next Up**: Step 4 of 4 - feat(name): greet by name (model: **Opus**, details: [intent.md:24](.plumbbob/builds/greeter/intent.md#L24))
    · range 2 of 2: /plumbbob:run (steps 4,3) · order: 4, 3

  **Your Call**:

  Approving locks in each lean above; to change one, say so first (`make P1 a blocker`).

  - `looks good` → I record the review and every lean as proposed, folding a blocker into the plan; back to the boundary
  - `/plumbbob:run` → I record them the same way, then run range 2 of 2 to its stop
  - anything that reads as direction → I re-render the card with the lean changed; nothing is recorded until you approve
  - `expand`, or any question → I show more of what is there; nothing changes, and `show the stop` brings all of this back

  **Recommendation**: Approve it, with P2 as the blocker it is. Step 3 reads both modules, and matching their shapes first saves it a branch.
  ````

  **2.** Every `details:` bracket is now the short link, built by one helper, on every card and every lead.

  `detailsLink(path, line)` in `src/verbs/handoff.ts` writes `details: [intent.md:24](.plumbbob/builds/greeter/intent.md#L24)`, or `[detail.md](.plumbbob/detail.md)` with no line for the Summary lead. `summaryBlock`, `nextUpLine`, and `stopLead` call it, and so does the checkpoint's `leadDetail`, which now gets a `{ path, line }` pointer from `appendLog` rather than a `path:line` string it would have to split again. The record of a Summary lead still drops its bracket, so no live link lands in the build log. The same repo's boundary where range 1 landed, and then a pause on step 4:

  ````markdown
  **Checkpoint**: Step 2 complete (ad63d3672, details: [build-log.md:70](.plumbbob/builds/greeter/build-log.md#L70))

  **Verdict**: ● Plumb

  **Stop**: Range 1 of 2 landed - review both modules before the CLI reads them (details: [intent.md:34](.plumbbob/builds/greeter/intent.md#L34))

  **Next Up**: Step 4 of 4 - feat(name): greet by name (model: **Opus**, details: [intent.md:24](.plumbbob/builds/greeter/intent.md#L24))
    · range 2 of 2: /plumbbob:run (steps 4,3) · order: 4, 3 · parked 2 of 2 open
  ````

  ````markdown
  **Now**: Step 4 of 4 - feat(name): greet by name

  **Summary**: `greet` takes a name and returns a plain greeting. (details: [detail.md](.plumbbob/detail.md))

  1. `src/name.ts` exports `greet`, built from the same plain string `hello` holds.

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    1 of 1 honored
  constraints  1 of 1 honored
  seam         held: 1 of 1 declared, no strays
  diff         +1 -0 across 1 file · inline below
  spent        2s · 0s gate · green first run
  ```

  ```diff
  diff --git a/src/name.ts b/src/name.ts
  new file mode 100644
  index 0000000..daa0696
  --- /dev/null
  +++ b/src/name.ts
  @@ -0,0 +1 @@
  +export const greet = (name: string): string => 'hello, ' + name
  ```

  **Verdict**: ● Plumb

  **Next Up**: Step 3 of 4 - feat(cli): print both greetings (model: **Opus**, details: [intent.md:21](.plumbbob/builds/greeter/intent.md#L21))
    · range 2 of 2: /plumbbob:run (steps 4,3) · parked 0 of 3 open

  **Your Call**:

  - `looks good` → I checkpoint Step 4; back to the boundary
  - `/plumbbob:run` → I checkpoint Step 4, then run the rest of range 2 to its stop
  - `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back
  - anything that reads as direction → I take it as what to change; nothing lands until you approve
  - `revert` → I wind the work back to the last checkpoint

  **Recommendation**: Approve it. The function is the done-when, word for word.
  ````

  **3.** The `P6` handle is the wire in handoff, harvest, and both skills, while a detail written as `- park 6 →` still reads.

  `harvestProposals` matches `- P6 →` and `- park 6 →` alike, and a test renders a stop card from the old wire and gets the same card. `plumbbob harvest`'s refusals read `P9 is not in the list; 3 parked` and `P1's class "later" is not blocker, tangent, or pivot`, and outside a stop it ends on `**Recorded**:`. The run skill's detail template writes `- P<handle> →`, its handle text says the third park ever is `P3`, a change reads `make P7 a tangent`, and an omission reads `no lean proposed`; the harvest skill writes `- P6 →`, names the `**Recorded**:` ending, and names the `P9` refusal. The contract tests hold both. From the same repo, a harvest outside a stop:

  ````text
  plumbbob: harvest not recorded (P9 is not in the list; 3 parked)
    → fix the Harvest proposals in .plumbbob/detail.md
  ````

  ````markdown
  **Recorded**: 1 parked idea (1 tangent)

  **Next Up**: Step 4 of 4 - feat(name): greet by name (model: **Opus**, details: [intent.md:24](.plumbbob/builds/greeter/intent.md#L24))
    · range 2 of 2: /plumbbob:run (steps 4,3) · order: 4, 3 · parked 0 of 3 open
  ````

  **4.** The note beneath Next Up writes `order: 4, 3`.

  `buildOrderPhrase` returns `order: 7, 8, 5, 10, 6 (and 2 more)`. The dashboard keeps its own `build order` row, which D25 (order-label) does not touch, and its doc comment no longer claims the phrase is that row.

  **5.** The build log's dated Harvest lines still say `park 1 ·`, outside the seam, so I parked it.

  `harvestLines` in `src/lib/buildlog.ts` writes `- **tangent**: park 1 · <text> → <reason>` under `## Harvest`, while the review beneath the stop's Log line now reads `P1`. The spec does not give those lines a form and the file is outside step 16's seam, so I left them and parked the one-line fix as a tangent; the demo repo's record shows both forms one above the other.

- 2026-10-19 — step 12 checkpointed · 5fe5d3a9e — feat(plan): point the plan and its template at the run (12m)
