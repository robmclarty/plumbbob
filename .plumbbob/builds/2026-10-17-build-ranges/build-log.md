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

**Current step:** 7 — feat(handoff): name the range to run beneath Next Up
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. chore(turn): spike what the prompt hook gets for a background notice
- ☑ 2. fix(turn): stop a background job's notice from counting as a human turn
- ☑ 3. feat(grant): let a range list its steps, and land only those steps
- ☑ 4. docs(build): teach the skill and the docs a range that lists its steps
- ☑ 5. docs(presentation): spec the build ranges and the lines that name them
- ☑ 6. feat(orient): read the build ranges and where the build stands in them
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

- [x] abandon's refusal says a step is 'past the range you granted' when a list grant simply does not name it; reword for the list case (src/verbs/abandon.ts:109)

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

- 2026-10-17, at the step 4 boundary: one parked item, classified.
- **tangent** (deferred, a one-line follow-up after this build): `src/verbs/abandon.ts:109`
  says a step is "past the range you granted" when a list grant simply does not name it. The
  refusal itself is right, since `abandon` still refuses a step the grant does not name; only
  the wording is off, on a rare path, and no remaining step depends on it.

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

- 2026-10-17 — step 1 checkpointed · d36bd8401 — chore(turn): spike what the prompt hook gets for a background notice (33m)

  **Summary**: Nothing in the hook's payload marks a background notice, but every notice opens on `<task-notification>` or `<agent-message `, so step 2 can build the fix as planned, keyed on that prefix.

  1. Nothing in the payload marks a notice, but its first characters do.
  2. Every notice ticks the turn count, clears the grant, and gets the nudge.
  3. A notice absorbed mid-turn shares the running turn's id, so D15 needs a guard.
  4. A notice clears a range the human typed after it arrived.
  5. Claude Code updated mid-spike, and the subagent case changed with it.

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    1 of 1 honored
  constraints  9 of 9 honored
  spent        33 min · 3 turns · 315s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Say `looks good` and I will land step 1. The prefix sorted all 29 captured prompts the way the transcript does on both versions, so step 2 builds as planned, and the D15 guard is best settled at step 2's pause.

  **1.** Nothing in the payload marks a notice, but its first characters do.

  All 29 prompts across five probe sessions carried the same eight keys in the same order. Every notice opened at its first character on `<task-notification>` (a Bash job, a Monitor event, a Monitor's end, a subagent's task notice) or `<agent-message ` (a subagent's report). The transcript knows the difference through `origin.kind`, but the hook is never given it. The prefix sorted all 29 the way the transcript does, on 2.1.283 and 2.1.302. The payloads are in the report verbatim, paths trimmed, ready to be step 2's fixtures.

  **2.** Every notice ticks the turn count, clears the grant, and gets the nudge.

  All 13 notices ticked `TURN`, 9 found a `range 3` grant and cleared all 9, and all 13 got the in-flight nudge. This session did it to itself: `plumbbob build 1` stamped `TICK` at 522, two of the spike's background jobs reported back, `TURN` read 524 with no typed prompt between, and a read-only `checkLatch(root, 1)` returned `{"allow":true}`. The latch would have let step 1 land in the turn that built it. I did not land it; it waits on your approval like any step, and the spike's last four sessions ran in the foreground.

  **3.** A notice absorbed mid-turn shares the running turn's id, so D15 needs a guard.

  In phase 5 a background job finished while the model was mid-turn, and the hook fired under the typed prompt's own `prompt_id`, one second before that turn's only Stop. Clearing `RELAY` on a notice there, as D15 (notice-clears-relay) says, would drop the ending the turn had just printed and let its Stop pass unjudged. The report proposes a guard: the hook records the `prompt_id` of the last prompt it counted, and a notice carrying that same id leaves `RELAY` alone. That is step 2's call, so I left `intent.md` as it is.

  **4.** A notice clears a range the human typed after it arrived.

  In phase 6 a notice queued at 23:17:31 and a typed range at 23:17:33, while the model sat in a foreground `sleep`. The typed message fired the hook at once and minted `range 3`; the notice fired at delivery, 23:17:43, and cleared it. That is checkride's 48-57 in miniature. Each queued item fires its own hook call and the texts never merge, so a prefix test only ever sees one item.

  **5.** Claude Code updated mid-spike, and the subagent case changed with it.

  The CLI moved from 2.1.283 to 2.1.302 during the first session, so I reran the Monitor and subagent phases on the new version. On 2.1.283 a finished subagent sent two prompts (its report, then a task notice), each its own turn; on 2.1.302 only the report reaches the hook, and the task notice lands in the transcript without starting a turn. The rule names both frames. Headless `claude -p`, Cursor, a Monitor's timeout notice, and `/loop` wakeups were not probed.

- 2026-10-17 — step 2 checkpointed · 18c85b450 — fix(turn): stop a background job's notice from counting as a human turn (16m)

  **Summary**: A prompt that opens on `<task-notification>` or `<agent-message from="…">` no longer ticks `TURN`, rewrites `GRANT`, or gets the nudge, and one that starts its own turn clears `RELAY`; recorded as D90 (notice-not-turn).

  1. The spike's rule went in as written, at the top of the hook
  2. I made the absorbed-notice call the spike left for this pause
  3. The tests replay all 29 captured prompts in order

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    2 of 2 honored
  constraints  9 of 9 honored
  seam         held: 8 of 8 declared, no strays
  diff         +750 -40 across 8 files
  spent        16 min · 233s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Read highlight 2 at the range's stop. It is the one place this step went past the plan's wording, and the plan left it open on purpose.

  **1.** The spike's rule went in as written, at the top of the hook

  `applyTurn` reads the prompt and its `prompt_id`, and a prompt whose first characters are either frame skips the tick and the grant together. `turn()` emits the in-flight nudge only when `applyTurn` says the prompt counted, so the nudge skips in the same branch. The latch's two writes come first and the new record last, so a record that cannot be written never costs a typed prompt its tick.

  **2.** I made the absorbed-notice call the spike left for this pause

  A notice the harness folds into a running turn arrives under that turn's `prompt_id`, before the turn's Stop has judged the ending it printed, so clearing `RELAY` there would let a missed card through unjudged. The hook now keeps the id of the last prompt it saw, typed or not, in a new untracked `.plumbbob/PROMPT`, and a notice carrying that id leaves `RELAY` alone. I keyed it on the last prompt *seen* rather than the spike's last prompt *counted*, so a notice folded into a turn another notice started is read the same way. A notice with no id clears `RELAY`, as D15 (notice-clears-relay) reads. It touches only the relay check, never `TURN` or `GRANT`, and it is the one piece of this step to read at the range's stop.

  **3.** The tests replay all 29 captured prompts in order

  `fixtures/notice-payloads.json` holds the spike's 29 payloads, paths trimmed, each labeled by the probe's own typed text rather than by the rule. The replay checks that `TURN` ends at 16, that every notice leaves `GRANT` as it found it, and that phase 6's range survives the notice queued before it. The real hook runs once on stdin to show the nudge stays silent for a notice. Three relay tests cover a notice after a shown pause, an ending printed after it, and a notice folded into the turn that printed the card.

- 2026-10-18 — step 3 checkpointed · d860fd4cc — feat(grant): let a range list its steps, and land only those steps (1 drift, 22m)

  **Summary**: A typed range now mints `steps <list>`, the exact set it names in normal form, and the latch lands only those steps while still honoring an old `range M`; the hook, the latch, `build`, and `status --invoked` all read the one grammar in `src/lib/steplist.ts`.

  1. One pure module holds the grammar
  2. The latch lands members and names the range when it refuses
  3. A range starts at its first undone step in build order
  4. One path outside the seam: the lexicon word

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    3 of 3 honored
  constraints  9 of 9 honored
  seam         strayed: 1 path outside the seam
               → cspell.json
  diff         +540 -102 across 13 files
  spent        21 min · 310s gate · green first run
  ```

  **Verdict**: ◐ A hair off (seam strayed)

  **Recommendation**: Nothing to settle here. The range's stop is the place to read the latch as a whole, steps 2 and 3 together.

  **1.** One pure module holds the grammar

  `steplist.ts` parses a number, a span, or a comma list into spans (never expanded, so `1-100000` stays two numbers), writes steps back in the order given with each climbing run folded, normalizes a set for storage, and reads a build invocation's argument run. A comma after the run's last number is the sentence's, so `/build 2, then review` mints nothing.

  **2.** The latch lands members and names the range when it refuses

  `/build 20, 5-9` mints `steps 5-9,20`. A plain `2-4` now grants exactly 2 through 4, where the old `range 4` would land step 1 too. A range that does not parse mints nothing, even beside `--auto`, so a typo can never widen into an unbounded grant. The refusal reuses the `ceiling` reason, which keeps `abandon` (outside the seam) working; its wording there still says "past the range", which I parked.

  **3.** A range starts at its first undone step in build order

  `rangeStart` in `orient.ts` picks it, so `status --invoked "1-3"` with step 1 done and the order `3, 2` points at 3, and `plumbbob build 20,5-9` refuses with that step as its remedy. `build` names the last undone member in build order as the top, and the step before one the list does not hold as the last the range reaches.

  **4.** One path outside the seam: the lexicon word

  The plan names the module `steplist`, and cspell rejected the import path, so `cspell.json` gained the one word.

- 2026-10-18 — step 4 checkpointed · 759eff15d — docs(build): teach the skill and the docs a range that lists its steps (10m)
- 2026-10-18 — step 5 checkpointed · 65c15b2c9 — docs(presentation): spec the build ranges and the lines that name them (96m)

  **Summary**: `docs/presentation.md` now fixes every string the build ranges put on a turn: the plan's section and its placeholder, the range segment beneath Next Up in six forms at four sites, the bracket's model while a range is suggested, the `Stop` part on the one boundary that earns it, the dashboard's ranges block with its drift rows, and the rule that none of it renders without the section. `docs/decisions.md` records the build ranges as D92 to D94, with dated notes on D86 and D85, and this build's own section needed only its intro changed.

  1. The Stop part settles as `**Stop**: Range N of M landed - <stop text> (details: …)`
  2. The range segment leads the note in six forms, and the drift words are one table
  3. The dashboard block: undone ranges carry their stops, landed ones fold, and `next →` names what is left
  4. Three decisions, D92 to D94, with dated notes on D86 and D85
  5. This build's own section held: only its intro changed

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    5 of 5 honored
  constraints  9 of 9 honored
  seam         held: 2 of 3 declared, no strays
  diff         +345 -13 across 2 files
  spent        96 min · 1 turn · 95s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Approve it. The strings steps 6 to 10 render are now fixed, and the three calls I made past the plan's leans are the ones to read first: the `Stop` label with its details bracket, the drift words shared by the card and the dashboard, and a landed range folding to its row.

  **1.** The Stop part settles as `**Stop**: Range N of M landed - <stop text> (details: …)`

  The working label held. `Stop` names the thing the plan wrote (`**stop:**` is the item's own key), reads as a noun on the card the way `Checkpoint` does, and answers the question the human brings to that boundary. I considered `Range` (names the subject that moved, but says nothing about why the build stopped) and `Landed` (reads as a past tense, not a part). The line carries a `details:` bracket pointing at the range's item, the one place its `- note:` sub-line can be read, since the card does not carry notes. It rides between the advisories and Next Up, renders on exactly one boundary per range (the one where its last undone step lands, however it landed), never for a bare range, never at the plan commit, and the boundary keeps the orientation tier. The ownership table, the tiers table, and the fixed order of an ending each gained the part.

  **2.** The range segment leads the note in six forms, and the drift words are one table

  `· range 3 of 5: /plumbbob:build 6-9` leads the note ahead of the build order and the parks, the same string at the plan pause, the plan commit, a step pause, and a boundary. What is left is written in build order, with a last step as `9-9` so the command lands it. A bare range reads `· range 4 of 5: /plumbbob:build 10`. Drift takes the place of the command: `· range 3 of 5 needs a re-cut (the build order puts step 11 inside it)` and, for a step in no range, `· no range names step 12`. The four drift kinds from [D10 (drift-reported)](#d10) each got exact words, and the dashboard's rows use the same words, so a human reads one vocabulary. One call beyond the lean: a step no range names flags the plan rather than a range, since no range holds it, and the card names no range for it. The bracket's bold model is the range's while a range is suggested; a range with no `- model:` line leaves the step's in place, which [D17 (range-model)](#d17) left open.

  **3.** The dashboard block: undone ranges carry their stops, landed ones fold, and `next →` names what is left

  The block sits beneath the steps in the step list's grammar: `ranges  2 of 5 done`, then one row per range with its command as the plan wrote it and its model behind the separator, `✓` and `▸` as the steps use them, and the `← next` tail. Each undone range carries its stop on an indented line, because the stops ahead are what the human steers by; a landed range folds to its row, because its call was made. Drift rows open on `⚠` beneath the range they flag, and a step no range names, or an item that does not parse, gets a row at the block's end. The pointer reads `next → build range 3 of 5 — /plumbbob:build 8-9`, the command being what is left, and falls back to today's step move for a flagged range. The relayed dashboard strings keep their em-dash; none of my prose has one.

  **4.** Three decisions, D92 to D94, with dated notes on D86 and D85

  D92 (build-ranges) merges the model: D1 (plan-holds-ranges) through D8 (model-declared) and D18 (scaffold-range). D93 (range-on-the-card) merges the surfaces: D9 (informative-only), D10 (drift-reported), D13 (card-shape), and D17 (range-model), and names `docs/presentation.md` as the home of the exact strings. D94 (auto-and-stops) merges D14 alone, because it changes what `--auto` means and amends D56 and D85 rather than the card. D86 carries the dated note the done-when asked for; D85 got one too, since D94 adds to its halt list, and the head paragraph's range for this build now runs D90 to D94. The `refs` slot passed on the first run.

  **5.** This build's own section held: only its intro changed

  The grammar the spec settled is the one the plan was written in, so the rewrite is the intro sentence: it cites plumbbob D92 (build-ranges) as settled rather than proposing a grammar step 6 would have to read. The five items, their stops, and the `- model:` and `- note:` sub-lines are unchanged and parse under the spec's rules: every step named once, no build order to drift against.

- 2026-10-18 — step 6 checkpointed · 23c55f43d — feat(orient): read the build ranges and where the build stands in them (9m)
