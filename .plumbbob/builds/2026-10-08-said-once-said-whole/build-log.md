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

**Current step:** 17 — feat(relay): hold a relay on its parts and measured facts, not every line
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. fix(status): count out-of-band commits the way handoff does
- ☑ 2. fix(skills): put a blank line under each detail heading
- ☑ 3. fix(handoff): put blank lines around the detail file's headings
- ☑ 4. test(markdown): lint the detail file a pause leaves on disk
- ☑ 5. docs(presentation): show a pause once and name the step it is on
- ☑ 6. feat(handoff): open the pause card on the step in flight
- ☑ 7. feat(handoff): print a one-line reminder for a pause already shown
- ☑ 8. fix(skills): answer a question at the pause without re-pasting it
- ☑ 9. fix(turn): let a park sit beside an answer in a mixed message
- ☑ 10. test(evals): add a contract for a question asked at the pause
- ☑ 11. chore(evals): sweep the relay after the pause change
- ☑ 12. chore(hooks): spike what a Stop hook can read and do
- ☑ 13. docs(decisions): record the relay check and its tier
- ☑ 14. feat(handoff): remember the ending each turn has to close on
- ☑ 15. feat(hooks): check at a turn's end that it closed on its relay
- ☑ 16. chore(evals): measure the relay check with and without the hook
- ☐ 17. feat(relay): hold a relay on its parts and measured facts, not every line

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

- [x] docs/cli-reference.md:25 still calls handoff read-only; step 3 makes a pause rewrite .plumbbob/detail.md, so fix the row in step 7, whose seam holds the file (docs)
- [x] src/lib/orient.ts:1044 still says the Readout label carries the step's identity; step 6 moved it to the Now line (comment)
- [x] skills/build/SKILL.md:187, skills/verify/SKILL.md:123, docs/glossary.md:91, and site/docs.html and site/index.html list the card's parts without the Now line; fold into step 8, whose seam holds them (docs)
- [x] the in-flight nudge carries no rule for a plain question at a pause, so a fresh session (c10's turns 2 and 3, or a host after compaction) has no prose telling it to end on handoff or to reach for --full; widen the nudge if c10 reads low (turn.ts)
- [x] report.ts sorts contract ids as strings, so c10 lands between c1 and c2 in the receipt table, and its method footnotes say nothing of c10's fresh-session question turns (evals)
- [x] eval sessions inherit the account's claude.ai connectors, and 3 of 5 c7 runs in the 2026-10-17 sweep mentioned them after the relay; the driver could pin an empty MCP config so the account's environment stays out of the anatomy rates (evals)
- [x] driver.ts and every receipt's method footnote say the headless UserPromptSubmit tick lands at about session end, but on Claude Code 2.1.283 it ticks before the first tool call (spike-01), so armGrant and the warmup's stated reason may be stale (evals)
- [x] recover and agent run print driver-tier output without recording RELAY, so a turn that ends on either after a pause is judged by the pause; step 14's seam held them out (relay)
- [x] README, docs/install.md, and docs/architecture.md still count three hooks; the Stop relay check makes four, so name it beside the turn ledger (relay)
- [x] docs/presentation.md states the positional rule but not that a Stop hook now checks it; one sentence beside 'relayed whole' citing D89 (block-once) would close the spec gap (relay)
- [ ] report.ts's Relay holds paragraph says the check compares line for line; since step 17 it reads parts and facts, so the next receipt would print a stale method sentence (evals)

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

- 2026-10-16, at the step 4 boundary: one parked item, classified.
- **tangent** (deferred to step 7): `docs/cli-reference.md:25` still calls `handoff`
  read-only. It blocks nothing in steps 5 and 6, and step 7 rewrites that same row (it gains
  `--full`, and the `PAUSE` stamp makes "read-only" wrong a second time) with the file
  already in its seam.
- 2026-10-17, at the step 11 boundary: five parked items, all classified tangent.
- **tangent** (deferred, its own commit): `src/lib/orient.ts:1044` still says the Readout
  label carries the step's identity. One stale comment, and no remaining step holds the
  file in its seam; worth a one-line fix, since a comment that misstates where a thing
  lives is what D3 (say-the-mechanism) warns about.
- **tangent** (resolved in step 8, `11cb599`): the skills' parts lists, the glossary, and
  both site pages now name the Now line.
- **tangent** (deferred, the likeliest to become a step): the in-flight nudge carries no
  rule for a plain question at a pause. It does not block Wave 4: a fresh-session question
  turn that never runs `handoff` writes no `RELAY`, so D13 (gate-on-the-turn) never
  checks it, and step 16's A/B cannot move c10's 0/5 reminder rate. A step that widens
  the nudge has a call to make first: step 8 sends a session without the card in
  context to `--full`, while c10's probe expects the reminder, and c10's probes follow
  whichever form it picks.
- **tangent** (deferred): `report.ts` sorts contract ids as strings and has no c10
  footnote. Cosmetic; receipts are derived, so a fix changes only future ones.
- **tangent** (deferred to before step 16): eval sessions inherit the account's claude.ai
  connectors, and 3 of 5 c7 runs mentioned them after the relay. The noise lands in both
  of step 16's arms and blurs the nothing-after-the-relay comparison; the fix lives in
  `driver.ts`, outside step 16's seam, so it needs `/plumbbob:step` or a small harness
  commit first.
- 2026-10-17, at the step 12 boundary: one parked item, classified tangent.
- **tangent** (deferred to before step 16, with the MCP-config fix): `driver.ts` and every
  receipt's method footnote say the headless tick lands at about session end, and on
  2.1.283 it lands before the first tool call (spike-01). It blocks nothing: D13
  (gate-on-the-turn) holds on the spike's evidence, and step 11's sweep ran c3, c4, and
  c9 cleanly with `armGrant` in place. What it costs is a false method note, which
  `report.ts:162` would print into step 16's receipt from outside that step's seam. The
  warmup stays either way, since it also runs the version guard.
- 2026-10-17, at the step 16 boundary: three parked items, all classified tangent.
- **tangent** (deferred to the build that settles D89 (block-once)): `recover` and `agent
  run` print driver-tier output without recording `RELAY`. Nothing in the normal flow
  ends a turn on either after a pause: bound `after`-agents run before `handoff`, and
  `recover` is a start-of-session readout. The fix is cheap, but the check may change
  shape once the reopened decision is called.
- **tangent** (deferred, its own commit before `/version`): the README,
  `docs/install.md`, and `docs/architecture.md` still count three hooks. The release
  that ships the Stop hook would otherwise ship docs saying it doesn't exist.
  `architecture.md` also calls the hooks beside the light tier "neither a gate", and the
  relay check holds a turn open, so that sentence needs care rather than a fourth item.
- **tangent** (deferred until D89 (block-once) is settled): `docs/presentation.md` does
  not say a Stop hook checks the positional rule. The sentence would describe how
  strictly the check compares a relay, which is what the A/B reopened.

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
- 2026-10-16 — step 3 checkpointed · 83e7f8c3b — fix(handoff): put blank lines around the detail file's headings (8m)
- 2026-10-17 — step 4 checkpointed · 8b7b4e4d9 — test(markdown): lint the detail file a pause leaves on disk (22m)

  **Summary**: The generated-markdown test now lints the `.plumbbob/detail.md` a real `handoff` pause leaves behind, and fails on MD022 if step 3's normalization is taken out.

  1. The new case drives the real pause and lints what it leaves.
  2. I checked that it fails without step 3.
  3. The range's self-approval lapsed, so this last step waits on you.

  **Readout**: Step 4 - test(markdown): lint the detail file a pause leaves on disk

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    1 of 1 honored
  constraints  7 of 7 honored
  seam         held: 1 of 1 declared, no strays
  diff         +32 -1 across 1 file
  spent        22 min · 2 turns · 183s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Say `looks good` and I will land step 4, which closes Wave 1. The new case fails without step 3's normalization and passes with it, and the full gate is green.

  **1.** The new case drives the real pause and lints what it leaves.

  It writes a detail file whose headings run into their bodies, and first lints that file to prove the fixture is tight (it fails MD022). It then runs a real `handoff` pause and lints the file again under the test's consumer-strict rules, which come back clean. It reuses the file's existing `RULES` and `lintFindings`, so nothing new was added to the harness.

  **2.** I checked that it fails without step 3.

  I swapped `handoff`'s normalization for a pass-through, ran the file, and saw MD022 at every heading in `.plumbbob/detail.md`. I then restored `handoff.ts`; nothing under `src/verbs/handoff.ts` differs from step 3's commit.

  **3.** The range's self-approval lapsed, so this last step waits on you.

  Steps 1 to 3 landed under your typed `1-4`. The checkpoint for step 4 was refused as "no human turn since this step began", which is the latch working as designed, so I wrote this detail and stopped here rather than route around it. My guess is that the background-task notifications that arrived while step 3's gate ran counted as turns and cleared the one-turn grant. I have not verified that.

- 2026-10-17 — step 5 checkpointed · 1ea534458 — docs(presentation): show a pause once and name the step it is on (29m)

  **Summary**: `docs/presentation.md` now says a pause renders its block once and that a later turn at it ends on the `Back to Step N of M` reminder, opens every step pause on a `**Now**` line with the step and its count, and names `show the pause` as the way the block comes back; `docs/decisions.md` records the two rules as D87 (pause-once) and D88 (current-step-shown) and dates D83 (card-teaches-itself) for them.

  1. The pause renders once, and a later turn at it ends on the reminder
  2. The block opens on the step in flight, and the Readout label goes bare
  3. The expand move names the way back
  4. D87 and D88 join the key, and D83 carries a dated note
  5. Two words were this step's to settle

  **Readout**: Step 5 - docs(presentation): show a pause once and name the step it is on

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    5 of 5 honored
  constraints  7 of 7 honored
  seam         held: 2 of 2 declared, no strays
  diff         +136 -24 across 2 files
  spent        29 min · 1 turn · 226s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Approve it. The gate is green, the seam held, and the two words this step had to settle, `Now` for the label and `show the pause` for the way back, are the ones steps 6 through 8 will render and teach.

  **1.** The pause renders once, and a later turn at it ends on the reminder

  A new `### One pause, rendered once` section sits under the shape of a turn, right after the positional rule it qualifies. It states the rule of D6 (pause-once), renders the reminder as Q2 (reminder-shape) settled it (the driver pointer `**Next Up**: Back to Step 2 of 3 - <title>`, the line a park already closes on), and says the CLI picks the form from a stamp of its last render (the step, the detail file, and the measured `check`, `seam`, and `diff` rows; never `spent`), per D7 (cli-picks-the-form) and D8 (stamp-skips-spent). The block comes back when the pause changes, on `plumbbob handoff --full`, and in a session that no longer has it in front of it. The sentence at `:474` ("An expand turn ends on the Your Call block again...") is replaced with the new rule, and the tiers table and the Next Up section each carry one sentence pointing at it.

  **2.** The block opens on the step in flight, and the Readout label goes bare

  `Now` is settled as the label: it pairs with `Next Up`, the two lines bracket the block, and it states the fact and no move. A new `## The Now line` section precedes the Summary's, in block order, and records why (the step was named only mid-block and without its count, so the human was subtracting one from Next Up). The running example opens on `**Now**: Step 2 of 3 - feat(login): ...` and its Readout label collapses to `**Readout**:`; the ownership table, the readout's label rule, the Verdict's identity paragraph, and the decision tier's row in the tiers table all follow. The count is the plan's own (step number over the total), the way Next Up counts, so the two lines agree under a re-sequenced build order.

  **3.** The expand move names the way back

  Both copies of the step pause's Your Call block (the running example and the Your Call section) now read: `` `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back ``. The plan pause's copy stays as it was, per the step note. `show the pause` is the phrase step 8 teaches the skills to answer with `plumbbob handoff --full`, and the Q2 lean put the way back on the expand move so the reminder never has to carry it.

  **4.** D87 and D88 join the key, and D83 carries a dated note

  D87 (pause-once) merges the intent's D6, D7, and D8; D88 (current-step-shown) merges D17 and D18, naming the record's bare Readout label and the plan pause's missing line. D83 (card-teaches-itself) gets a "(Revised 2026-10-16 by D87 and D88: ...)" note in the house pattern, and the key's own index of promoted ranges gains the pair. Both are tagged only in `docs/presentation.md`, which is the one place citing them until steps 6 through 8 land.

  **5.** Two words were this step's to settle

  The plan left the label as a working name and the way back unspecified. `Now` and `show the pause` are the calls made here; steps 6, 7, and 8 render and teach them, so a different word is cheapest to change now.

- 2026-10-17 — step 6 checkpointed · 156f312ab — feat(handoff): open the pause card on the step in flight (7m)
- 2026-10-17 — step 7 checkpointed · 9a2dcebc6 — feat(handoff): print a one-line reminder for a pause already shown (11m)
- 2026-10-17 — step 8 checkpointed · 11cb5999e — fix(skills): answer a question at the pause without re-pasting it (9m)
- 2026-10-17 — step 9 checkpointed · ed5629d7b — fix(turn): let a park sit beside an answer in a mixed message (5m)
- 2026-10-17 — step 10 checkpointed · db9e032ef — test(evals): add a contract for a question asked at the pause (1 drift, 19m)
- 2026-10-17 — step 11 checkpointed · 0f9754ec1 — chore(evals): sweep the relay after the pause change (49m)
- 2026-10-17 — step 12 checkpointed · ffcc0d214 — chore(hooks): spike what a Stop hook can read and do (40m)

  **Summary**: All six questions have answers, backed by hook payloads captured on Claude Code 2.1.283 in throwaway repos and written up in `spike-01-stop-hook.md`. The Stop check is viable: the final text is readable at Stop and `TURN` has ticked by then. But checkride's gate shares the `stop_hook_active` flag that D16 (block-once) relies on, so step 13 has two calls to make before step 15 builds anything.

  1. Stop's stdin carries the turn's final text, so the check should read that field instead of the transcript, which lags behind it
  2. Stop accepts `additionalContext` and continues the turn on it, just as it does on a block
  3. A block puts a "Stop hook error" row, with the full reason, between the text that already streamed and the retry
  4. checkride re-blocks while red and sets the same `stop_hook_active` flag, so the guard D16 (block-once) describes would silence the relay check
  5. `TURN` has ticked before Stop under `claude -p`, so D13 (gate-on-the-turn) holds, and I parked the receipts' note saying otherwise

  **Readout**: Step 12 - chore(hooks): spike what a Stop hook can read and do

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    2 of 2 honored
  constraints  7 of 7 honored
  spent        40 min · 1 turn · 171s gate · green first run
  ```

  **Verdict**: ● Plumb

  **Recommendation**: Run the repro in the report's finding 3 to watch a block land in your own terminal, then approve. How the "Stop hook error" label reads to you is what step 13 needs in order to choose between a block and `additionalContext`, and the spike could only capture it as text.

  **1.** Stop's stdin carries the turn's final text, so the check should read that field instead of the transcript, which lags behind it

  The payload has `last_assistant_message`, which holds the final message's raw markdown, both interactively and under `-p`. When the hook fires, the transcript has every entry except that final message: run A's snapshot had no assistant entry even though the entry is stamped 65 ms before the hook started, and it was on disk 1.5 s later. The hooks reference now says the same thing and recommends the field. The field covers only the last message, so D15 (tier-picks-the-match)'s boundary tier still reads earlier messages from the transcript, scoped by `prompt_id`. Separately, the harness now turns a silent ending into a forced reply before Stop fires (run N-opus), so a missed relay shows up as some text, never as none.

  **2.** Stop accepts `additionalContext` and continues the turn on it, just as it does on a block

  `decision: "block"`, exit 2, and `additionalContext` all keep the turn going, all set `stop_hook_active` on the next Stop, and all count toward the harness cap. The cap is eight continuations in a row, which run F hit when it returned context every time. `systemMessage` shows `Stop says:` and continues nothing. `continue: false` does nothing to its own turn, but it cancels a sibling hook's block.

  **3.** A block puts a "Stop hook error" row, with the full reason, between the text that already streamed and the retry

  The interactive capture (run I2) shows the first reply, then `Ran 1 stop hook`, then `⎿ Stop hook error: <reason>`, then the retry, and a footer reading `Stop hook error occurred · ctrl+o to see` while it runs. With `additionalContext` the row says `Stop hook feedback:` and the footer never appears. In the transcript, the reason is a `user` entry with `isMeta: true` that carries the turn's `promptId`. This is a flattened pty log, not a rendering, and Zed's agent panel was not probed, so the plan's note that only you can answer question 3 still holds. The report's finding 3 has a three-line repro that runs in a workspace kept in `/tmp`.

  **4.** checkride re-blocks while red and sets the same `stop_hook_active` flag, so the guard D16 (block-once) describes would silence the relay check

  The payload never says which hook blocked. When the real gate was red (run R1), it blocked twice, because its script honors the flag only when it could not run. Round two closed on a question instead of the relay, and the plumbbob-shaped hook let it through because the flag was set. The fix keeps D16's tier and moves its "once" into plumbbob's own record: stamp `RELAY` with the `TURN` the check blocked in, and block at most once per `TURN`. When both hooks block in the same round, the harness runs a single continuation that carries both reasons (run P2).

  **5.** `TURN` has ticked before Stop under `claude -p`, so D13 (gate-on-the-turn) holds, and I parked the receipts' note saying otherwise

  Four sessions in a row read `TURN` at their first tool call and at Stop, and both readings were always already ticked. That held with the prompt sent as an argument and with it sent on stdin, the way the driver sends it. UserPromptSubmit does not fire again on a block's continuation. The verbs can't see `prompt_id`, so `TURN` stays the key `RELAY` stamps. `driver.ts` and every receipt's footnote say the tick lands at about session end, which is now stale on 2.1.283; that note is outside this seam, so it is parked.

- 2026-10-17 — step 13 checkpointed · 9cb1e2ef2 — docs(decisions): record the relay check and its tier (38m)

  **Summary**: `docs/decisions.md` now records the relay check as D89 (block-once). It holds a turn that missed its relay open once, it is the first plumbbob hook to hold a turn open at all, and the spike's evidence changed two of the plan's mechanics on the way in. One of those changes picks a channel you didn't get to weigh in on, so it is the call this pause is for.

  1. The relay check speaks through `additionalContext`, not `decision: "block"`, and that is your call to confirm
  2. "Once" is counted per `TURN` in plumbbob's own record, not by `stop_hook_active`
  3. Beside the latch, the commit hook, and checkride's gate, the relay check holds a fourth thing, the ending
  4. The entry's rate comes from the 2026-10-17 sweep, and the key's provenance line now runs to D89 (block-once)

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    bent: D16 (block-once)
               → once counted per TURN, sent as additionalContext
  constraints  7 of 7 honored
  seam         held: 1 of 1 declared, no strays
  diff         +42 -1 across 1 file
  spent        38 min · 1 turn · 113s gate · green first run
  ```

  **Verdict**: ○ Out of plumb (decisions bent)

  **Recommendation**: Approve with `additionalContext` as the channel. A missed relay is not something the human has to fix, so the screen shouldn't label it an error, and nothing downstream depends on the choice until step 15 writes the hook's output line.

  **1.** The relay check speaks through `additionalContext`, not `decision: "block"`, and that is your call to confirm

  You approved step 12 without saying how the `Stop hook error` label read to you, so I picked a channel and recorded it. Both channels hold the turn open, set `stop_hook_active`, and count toward the harness's cap of eight continuations. What differs is the screen: a block prints `Stop hook error` and an error footer, while `additionalContext` prints `Stop hook feedback` and no footer. A missed relay is the model's slip, and the human has nothing to fix, so calling it an error tells the human the wrong thing. It is also the channel plumbbob's other two model-facing hooks already use (`turn`'s nudge, and the light tier in `post-edit.sh`). The case for a block is that the plan's D16 (block-once) named it and checkride's gate uses it. The slug `block-once` fits either way, because the harness itself calls an `additionalContext` continuation a block (run F's cap message: "A hook blocked the turn from ending 9 consecutive times"). Switching to a block is one clause in D89 (block-once) and no change to any later step's seam.

  **2.** "Once" is counted per `TURN` in plumbbob's own record, not by `stop_hook_active`

  The plan's D16 (block-once) let `stop_hook_active` mark the retry. The spike showed the flag is shared and names nobody: checkride's gate re-blocks on every Stop while red (run R1), and a check that trusted the flag went quiet for the rest of that turn and let a retry ending on a question through. So D89 (block-once) stamps the `TURN` it held and holds at most once per `TURN`. That works because `TURN` has ticked before Stop under `claude -p`, and no UserPromptSubmit fires on a continuation, so it holds still across a retry. This is the `bent` row on D16 (block-once), and it is what step 15 builds.

  **3.** Beside the latch, the commit hook, and checkride's gate, the relay check holds a fourth thing, the ending

  The work plane stays guidance (D10 (pause-not-lock), D13 (no-edit-guards)). The record is latched (D64 (approval-latch)). A raw commit gets a question (D66 (oob-commits-surfaced)). checkride's gate holds a red turn open until the code is green (D75 (two-gates)). The relay check lets go after one try, because a second miss is already on the human's screen and in the eval tier's count, and a check that kept holding would make the hook the clock. It owes the gate it runs beside two things: never cancel its block (so no `continue: false`, which ended the turn over a sibling's block in run P5), and never fall silent under it (so it keeps its own count).

  **4.** The entry's rate comes from the 2026-10-17 sweep, and the key's provenance line now runs to D89 (block-once)

  D89 (block-once) cites step 11's numbers (31 of 35 decision endings whole, 10 of 10 boundaries, 51 of 55 with nothing after the relay), which still come to about one ending in ten, as 2026-09-17 did. The key's opening paragraph now credits this build with D87 (pause-once) through D89 (block-once). The entry cites no plan-local tag, because the refs slot would read `D16` as this key's D16 (check-plus-self-review), so the plan's locals appear only as the backticked slug `block-once`. Its last line points at the spike report rather than a code file, since the hook lands in steps 14 and 15. Step 16 adds the receipt citation its done-when asks for.

- 2026-10-17 — step 14 checkpointed · a1b57d950 — feat(handoff): remember the ending each turn has to close on (531m)
- 2026-10-17 — step 15 checkpointed · c67286827 — feat(hooks): check at a turn's end that it closed on its relay (1 red, 1 drift, 21m)
- 2026-10-17 — step 16 checkpointed · a292bc9a9 — chore(evals): measure the relay check with and without the hook (1 drift)
