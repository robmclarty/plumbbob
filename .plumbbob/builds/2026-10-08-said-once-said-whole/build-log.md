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

# Build log: Said once, said whole

**Current step:** 3 — fix(handoff): put blank lines around the detail file's headings
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. fix(status): count out-of-band commits the way handoff does
- ☑ 2. fix(skills): put a blank line under each detail heading
- ☐ 3. fix(handoff): put blank lines around the detail file's headings
- ☐ 4. test(markdown): lint the detail file a pause leaves on disk
- ☐ 5. docs(presentation): show a pause once and name the step it is on
- ☐ 6. feat(handoff): open the pause card on the step in flight
- ☐ 7. feat(handoff): print a one-line reminder for a pause already shown
- ☐ 8. fix(skills): answer a question at the pause without re-pasting it
- ☐ 9. fix(turn): let a park sit beside an answer in a mixed message
- ☐ 10. test(evals): add a contract for a question asked at the pause
- ☐ 11. chore(evals): sweep the relay after the pause change
- ☐ 12. chore(hooks): spike what a Stop hook can read and do
- ☐ 13. docs(decisions): record the relay check and its tier
- ☐ 14. feat(handoff): remember the ending each turn has to close on
- ☐ 15. feat(hooks): check at a turn's end that it closed on its relay
- ☐ 16. chore(evals): measure the relay check with and without the hook

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

- [ ] docs/cli-reference.md:25 still calls handoff read-only; step 3 makes a pause rewrite .plumbbob/detail.md, so fix the row in step 7, whose seam holds the file (docs)

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

- 2026-10-16 — plan committed · c5a217593

  **Recommendation**: Approve it. All three findings are settled in the plan: the retry reprints the exact ending `RELAY` recorded, steps 3 and 4 now guard the detail file the gate actually lints, and Wave 2's seams leave the plan pause alone while taking every test and copy that pins today's card. The line references were re-checked against `3912163`, and no open question remains.

  **1.** Step 7's stamp records what the CLI printed, not what reached you, so the retry in D12 (retry-reruns) reprints only the reminder

  When the model paraphrases a first card, or ends on the tool result with no text (the two failures #5 saw), the stamp already marks the card as shown, so the `plumbbob handoff` the model re-runs after the block prints `**Next Up**: Back to Step 2 of 3 - <title>`. You get the paraphrase and one line, and still have to ask for the card, which is the round trip D16 (block-once) exists to remove. Two siblings share the gap: a missed plan card reprints only with `handoff --plan`, and `RELAY` as step 14 specifies it carries the tier but not which render it was; and a question asked at a paused step in a fresh conversation lands on the reminder with no card anywhere on screen. Closing it takes one call before step 7: either the stamp also carries the `TURN` it rendered in, so a card printed in the current turn counts as unseen and a same-turn re-run prints it whole, or `RELAY` records the render (card, reminder, or plan card) and the block's reason names the command that reprints it. Steps 7 and 15 each gain a test for whichever it is.

  Settled at the plan pause, the second way: `RELAY` records its render and the command that reprints it, and the block's reason names that command, `handoff --full` for a step card (with its step number for a verify pause), `handoff --plan` for the plan card, plain `handoff` for a reminder (D12 (retry-reruns), steps 14 and 15, and the new Verdict). Step 8 also sends a pause whose card is not in the current conversation to `handoff --full`.

  **2.** Steps 3 and 4, and D4 (cli-owns-the-record), rest on a record path the code does not take

  No template heading reaches the build-log. `checkpoint` records `stepRecord` and `planRecord` (`handoff.ts:270`, `:304`), which re-render each `## n <title>` as a bold `**n.** <title>` handle (`sectionBlocks`, `:332`); only the verbatim fallback (`:274`) or a heading written inside a section's body gets there. What turns a downstream checkpoint red, in #5's own words, is `.plumbbob/detail.md` itself, still on disk when the gate runs (`checkpoint.ts:95`, before `clearDetail` at `:135`). The test step 4 describes also exists already: `src/verbs/__tests__/generated-markdown.test.ts` drives start, park, a checkpoint with a detail, `checkpoint --plan` with a cold read, and finish's Stats table through markdownlint-cli2 under consumer-strict rules. So step 3 guards a path the headings never take, and step 4's done-when, failing on MD022 once step 3 comes out, cannot come true. Closing it: step 2 stays the fix; step 4 becomes a test that lints the four detail templates as the model would copy them, in the existing file; and D4 either moves to the file that fails, normalized where `handoff` reads it, or drops.

  Settled in refine (Q3 (detail-on-disk)): step 3 now has `handoff` normalize the detail file it reads, at both pauses, and step 4 adds a case to `generated-markdown.test.ts` that lints the file a pause leaves on disk; D4 (cli-owns-the-record) and D5 (lint-what-we-write) are re-worded to match.

  **3.** Wave 2's seams reach into the plan pause the Frame rules out, and miss the tests that pin today's card

  Step 5 rewrites the `expand` move in all three Your Call blocks and step 7 places it at `handoff.ts:572` and `:599`, but `presentation.md:493` and `:599` (`planCallBlock`) are the plan pause's block, which the Frame and step 7's own note leave alone. Step 6's seam lacks `test/integration/eval-helpers.test.ts`, which runs in `pnpm check` and asserts the card's labels equal the decision tier's parts exactly (`:636`, `:694`), so a `**Now**` label fails it; and `src/verbs/__tests__/checkpoint.test.ts:249`, which pins the record's `**Readout**: Step 1 - First`, built by the same `readoutLabel`. Copies of the card's expand move at `site/index.html:175` and `site/docs.html:181` sit outside every seam. Closing it: drop the plan block from steps 5 and 7, add both tests to step 6 with a call on whether the record keeps naming its step, and widen step 8's seam to the `site/` copies.

  Settled in refine (Q4 (record-readout) and the repairs): the plan pause's block is out of steps 5 and 7; the record follows the card (D18 (record-follows-card)), and step 6 takes `checkpoint.test.ts`, `eval-helpers.test.ts`, `anatomy.ts`, and `docs/cli-reference.md`; step 8 takes the `site/` pages and the three docs that carry the expand prose.

- 2026-10-16 — step 1 checkpointed · 4ab52c820 — fix(status): count out-of-band commits the way handoff does (5m)
- 2026-10-16 — step 2 checkpointed · 31f533529 — fix(skills): put a blank line under each detail heading (4m)
