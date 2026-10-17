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

# Build log: Build ranges

**Current step:** 1 — chore(turn): spike what the prompt hook gets for a background notice
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☐ 1. chore(turn): spike what the prompt hook gets for a background notice
- ☐ 2. fix(turn): stop a background job's notice from counting as a human turn
- ☐ 3. feat(grant): let a range list its steps, and land only those steps
- ☐ 4. docs(build): teach the skill and the docs a range that lists its steps
- ☐ 5. docs(presentation): spec the build ranges and the lines that name them
- ☐ 6. feat(orient): read the build ranges and where the build stands in them
- ☐ 7. feat(handoff): name the range to run beneath Next Up
- ☐ 8. feat(checkpoint): say why the build stops when a range's last step lands
- ☐ 9. feat(status): show the ranges and flag one the plan outgrew
- ☐ 10. feat(build): halt --auto where the plan reserves a call for the human
- ☐ 11. feat(plan): author the build ranges with the steps
- ☐ 12. feat(skills): keep the build ranges true as the plan changes
- ☐ 13. docs: describe the build ranges where the card and plan are described

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

- 2026-10-17 — plan committed · 2c2ecd6be

  **Recommendation**: Approve it. The cold read's three holes are settled as D15 (notice-clears-relay), D16 (list-reading), and D17 (range-model), the gap refine found in the template's placeholder as D18 (scaffold-range), and the two repairs put a background subagent's notice and a real plan run under a done-when; every seam still parses, every citation lands on its anchor, and no open question is left.

  **1.** Step 2 collides with the relay check, which keys its once on `TURN`

  `plumbbob relay` judges a turn only while the `RELAY` it reads was printed in the current `TURN` (`src/verbs/relay.ts:71`), and that is what keeps it quiet today on the turn a background notice starts: the notice ticks `TURN`, so the last pause's `RELAY` reads as stale. Once step 2 stops the tick, the notice's turn shares the pause's `TURN`. Its final message does not close on the card (`closesOn`, `:109`), so the check holds the turn open once, and its reason sends the model to `plumbbob handoff --full`, which reprints a card the human has already read. A boundary fares the same, because the notice's own `prompt_id` scopes the turn's earlier text to after the notice (`turnText`, `:256`). Closing it means step 2 also lets a notice's turn end unjudged: either `turn` records the notice's `prompt_id` for `relay` to skip, or `relay` reads the prompt entry the payload's `prompt_id` names and skips a notice. Step 1's spike should capture whether the Stop payload after a notice carries that `prompt_id`, and step 2's seam gains `src/verbs/relay.ts` and `src/verbs/__tests__/relay.test.ts`.

  Settled at refine as D15 (notice-clears-relay): a notice clears `RELAY` instead, which needs nothing from the Stop payload, since a hold mark would carry forward within the `TURN` and wave through any ending printed after the notice. Step 2's seam gained `src/lib/sidecar.ts` and `src/verbs/__tests__/relay.test.ts`.

  **2.** Step 3 leaves `/plumbbob:build 20, 5-9`, with a space after the comma, unsettled

  The hook splits the arguments on whitespace and strips trailing punctuation from each token (`src/verbs/turn.ts:125` to `:126`), so today `20, 5-9` reads as a bare `20`, skipped, then the span `5-9`, and mints `range 9`, which refuses step 20, the first step the range builds. Step 3's done-when defines an expression as numbers and spans joined by commas, and says nothing about one that a space splits into two tokens, so a builder who keeps the token scan grants `5-9` alone. A human copying the card will usually paste `20,5-9` whole, but one typing it by hand will write the space. Closing it takes one clause in step 3: once any token in the argument run carries a comma or a dash, every number and span in the run joins one set, and a bare number on its own still mints nothing.

  Settled at refine as D16 (list-reading), which also starts a range at its first undone step in build order, however it is written, and has the card write a list in build order.

  **3.** Q3's lean puts the louder model token on the wrong model for a range

  Next Up's bracket carries the next step's model in bold (`(model: **Sonnet**, ...)`, `src/verbs/handoff.ts:816`), the one token the card spends on what the human does before the next run. Q3's lean adds the range's model to the note beneath it as a plain `on Opus` when the two differ. A range's first step is often not its hardest (said-once's 6-11 ran on Opus while step 6 was Sonnet), so the human about to type the range reads the bold Sonnet first and the plain Opus second, and the louder of the two is the wrong one for the command they are about to type. Closing it is a call for step 5's pause: when the note suggests a range, the bracket either names the range's model, or the note leads with it in the same weight.

  Settled at refine as D17 (range-model): while the note suggests a range, the bracket's bold model is the range's, and the note names none.
