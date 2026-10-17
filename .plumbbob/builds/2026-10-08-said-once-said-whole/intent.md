# Said once, said whole

**Phase** (your own bookkeeping while framing): plan authored, sixteen steps carried from the spec, refined at the plan pause (Q3 and Q4 settled); awaiting review
**Size:** medium
**Scope:** relay

*Source: `research/10-said-once-said-whole.md` (2026-10-08), the spec for GitHub issues [#4](https://github.com/robmclarty/plumbbob/issues/4), [#5](https://github.com/robmclarty/plumbbob/issues/5), and [#6](https://github.com/robmclarty/plumbbob/issues/6), written from the issues as filed and the triage that followed them. research/ is gitignored, so this file is the spec's only tracked copy: the plan is distilled below, and the spec's full text, with the triage that shaped every Decision here, is kept whole under [Source](#source). Every claim about the code was read on `main` at 0.12.1 (`3912163`), the baseline this build starts from, and the line numbers are from that commit. The plan's cold read and a refine pass corrected the spec where the code disagreed with it (see Verdicts), so where the two differ, the plan above the Source wins.*

## Frame

- **Problem:** plumbbob speaks at the edge of a turn, and it says four things wrong there. `status` counts a plan commit as out-of-band where `handoff` does not ([#4](https://github.com/robmclarty/plumbbob/issues/4)). A question at a pause gets its answer stacked above a card the human has already read ([#6](https://github.com/robmclarty/plumbbob/issues/6)). The relay that carries every ending to the screen fails about one turn in ten, and nothing can see it fail ([#5](https://github.com/robmclarty/plumbbob/issues/5)). The detail file the model writes fails MD022 wherever `.plumbbob/` is linted, which turns a downstream checkpoint red (#5's side note).
- **Smallest thing that solves it:** one shared marker for the count; a blank line in four templates, backed by `handoff` normalizing the detail file it reads and a test that lints the file a pause leaves on disk; a stamp that lets `handoff` print one line for a pause it already showed; and a Stop check that compares the turn's last text with the ending plumbbob last printed, measured before and after it ships.
- **Done looks like:** `status` and `handoff` report the same count for the same history; a detail file written without blank lines lints clean once a pause has read it, under a test that drives the real emitters; the pause card opens on the step in flight; a question at an unchanged pause is answered above one reminder line, and `handoff --full` brings the card back; a turn that printed a pause or a boundary and closed on something else is caught at Stop and blocked once, and its retry brings the missed ending back whole; two receipts in `docs/evals/` measure the relay before and after the hook; #4, #5, and #6 are closed.
- **Explicitly NOT doing:** the "N plan commits, M other" split; editing any existing build record; a product switch that turns the relay check off; any change to how the plan pause renders or answers a question; a relay check on the `status` dashboard or on driver endings; Cursor parity for the new hook; a version bump or CHANGELOG entry.

## Architecture sketch

```text
human prompt ─► UserPromptSubmit ─► plumbbob turn ─► tick TURN; nudge while a step is in flight
                                                     (wave 2: a mixed message answers, then parks)

model works ──► plumbbob handoff ─► stdout: the whole card, or one reminder line   (wave 2)
                      │               └─► builds/<slug>/PAUSE: step + hash of what it showed
                      │
handoff, or a transition verb ─► .plumbbob/RELAY: tier + render + TURN + the text it printed  (wave 4)

model relays ─► Stop ─► plumbbob relay: did the turn close on RELAY?               (wave 4)
                          yes ─► the turn ends
                          no  ─► block once, D16 (block-once); stop_hook_active lets the retry end
```

## Waves

| Wave | Steps | What lands | Closes |
| ---- | ----- | ---------- | ------ |
| 1. Fix what is wrong today | 1 to 4 | the shared count, the templates, the CLI's normalization, a lint guard on the detail file | #4 |
| 2. Say the pause once | 5 to 9 | the spec, the step on the card, the CLI stamp, the skills, the nudge | #6 |
| 3. Measure the relay | 10 to 11 | a contract for the question turn, and a sweep with Wave 2 in place | |
| 4. Check the relay | 12 to 16 | a spike, the decision, `RELAY`, the Stop check, the A/B | #5 |

**The order is load-bearing.** Wave 1 is bug fixes with no design in them, and any of its steps could ship alone. Wave 2 lands before the hook because it changes what a question turn ends on: a check written against today's rule would enforce the repetition #6 removes, and then need rewriting. Wave 3 measures with Wave 2 in place, so the numbers describe the turn the hook will actually check. Wave 4 opens on a spike because three of the proposal's assumptions about Stop are unverified: whether the final text is readable at Stop, whether Stop accepts `additionalContext` at all, and whether `TURN` has ticked by then under `claude -p`. The numbering is the build order, so `## Build order` stays empty.

## Build runs

How to drive the build with as few stops as possible (suggested 2026-10-16). Three stops are real decisions: at step 5, after step 12, and after step 16. A range self-approves through its last step, so the only pauses are the two single-step builds and the end of each range. Each run takes the strongest model any step inside it recommends.

| Run | Model | Where it stops, and why |
| --- | ----- | ----------------------- |
| `/plumbbob:build 1-4` | Sonnet | After step 4. Wave 1 is bug fixes with no design in them, and step 1's commit closes #4. The stop is only because step 5 needs another model and your call. |
| `/plumbbob:build 5` | Fable | Pauses on the card. **Decision:** the `**Now**` label, how the reminder renders, and the `expand` move's new wording. Steps 6 to 9 all render what this settles. |
| `/plumbbob:build 6-11` | Opus | After step 11. These steps carry out step 5's spec, close #6 at step 9, then add the c10 contract and run the sweep. Nothing downstream branches on the sweep's numbers. |
| `/plumbbob:build 12` | Opus | Pauses on the card. **Decision:** the spike's evidence can reopen [D16 (block-once)](#d16), move the final-text read to a stdin field, or break [D13 (gate-on-the-turn)](#d13) under `claude -p`. Be at the keyboard: question (3) asks what you see when a block lands, and only you can answer it. |
| `/plumbbob:build 13-16` | Fable | After step 16, then `/plumbbob:finish`. Records step 12's decision, builds `RELAY` and the Stop check, runs the A/B, and closes #5 at step 16. **Decision:** a block on an ending that was already whole reopens [D16 (block-once)](#d16). |

Two optional splits. `6-11` includes the ten-contract latched sweep, a full set of real `claude -p` sessions that takes a while and costs money, so run `6-10` and then `11` to check that c10 reads turns correctly before paying for it. `13-16` takes Fable only because step 13 writes the decision entry, so run `13` on Fable and then `14-16` on Opus if you'd rather not pay Fable rates for the mechanical steps.

## Decisions

- <a id="d1"></a>**D1 (one-marker)**: `PLAN_COMMIT_MARKER` moves to `src/lib/git.ts` beside `commitsSince`, exported, and `status` passes it, *because* both surfaces have to measure one quantity, and a module-local const is why they could not.
- <a id="d2"></a>**D2 (one-count)**: the receipts line keeps a single count with plan commits left out, never "2 plan commits, 1 other", *because* a plan commit is the process running, and a card line renders only when it says something new.
- <a id="d3"></a>**D3 (say-the-mechanism)**: the comments name both mechanisms (a commit any plumbbob verb makes starts the range; the marker drops a hand-made plan commit), *because* the issue's draft comment credited the marker with both, and a comment that misstates its mechanism is how #4 passed for a design split.
- <a id="d4"></a>**D4 (cli-owns-the-record)**: `handoff` rewrites `.plumbbob/detail.md` with a blank line around every heading, fences left alone, at both pauses and before it hashes or renders anything, on top of the template fix, *because* the gate lints that file on disk before `checkpoint` clears it, the record re-renders each heading as a bold handle so the build-log never sees one, and a model will not always copy a template exactly (settles [Q3 (detail-on-disk)](#q3)).
- <a id="d5"></a>**D5 (lint-what-we-write)**: `src/verbs/__tests__/generated-markdown.test.ts`, which already lints what the CLI writes into a build record under consumer-strict rules, also lints the detail file a pause leaves on disk, *because* the repo's config ignores `.plumbbob/**`, which is why #1, #2, and this MD022 all surfaced downstream first (settles [Q3 (detail-on-disk)](#q3)).
- <a id="d6"></a>**D6 (pause-once)**: a step pause renders its whole card once; while it is unchanged `handoff` prints one reminder line, and the card returns on `--full` or when the pause changes, *because* the answer is what the human asked for, and 40 lines beneath it push it off the screen.
- <a id="d7"></a>**D7 (cli-picks-the-form)**: the CLI chooses card or reminder from a stamp of its last render, and the skills keep ending every pause turn on `handoff`'s output, *because* a deterministic line is the CLI's to render (plumbbob [D80 (cli-renders-model-relays)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d80)), and one rule for every pause turn keeps the relay check a single comparison.
- <a id="d8"></a>**D8 (stamp-skips-spent)**: the stamp hashes the step number, the detail file, and the rendered `check`, `seam`, and `diff` rows, never `spent`, *because* `spent` counts turns, so it changes on every turn and would make every render look new.
- <a id="d9"></a>**D9 (answer-then-park)**: a message that is only a tangent still ends on the park's block; a message that also asks something gets its answer first and the park's block after it, *because* the two failures were a dropped answer and a stack of blocks, and the tangent-only rule `df9b393` set was right.
- <a id="d10"></a>**D10 (verbs-write-relay)**: `handoff` and every transition verb record the ending they print in `.plumbbob/RELAY`, with its tier, its render, and the `TURN` it printed in, through one shared helper, instead of a PostToolUse hook scraping stdout, *because* the verb knows exactly what it printed, a command-string match misses `pb handoff` and `node src/cli.ts handoff`, and a turn that runs `handoff` and then `park` has to be judged by its last ending.
- <a id="d11"></a>**D11 (check-in-the-cli)**: the Stop check is a CLI verb in TypeScript, registered beside `turn` as hook machinery (help lists it as not a user verb), not a shell script and not a branch of `turn`, *because* reading the JSONL transcript in POSIX sh is fragile, and `turn` promises in its header that it blocks nothing.
- <a id="d12"></a>**D12 (retry-reruns)**: a failed check after a decision ending has the model re-run the command that reprints it, which `RELAY` records beside the render and the block's reason names (`plumbbob handoff --full` for a step card, carrying the step number for a verify pause; `plumbbob handoff --plan` for the plan card; plain `plumbbob handoff` for a reminder), never the stored `RELAY`, while a boundary's stored block is pasted as it stands, *because* a decision's stored block goes stale when the model kept working after it rendered, plain `handoff` reprints neither a card step 7's stamp has already marked shown nor the plan card, and a boundary reports a commit already landed.
- <a id="d13"></a>**D13 (gate-on-the-turn)**: the check runs only when `RELAY` was written in the current turn, never on the presence of `STEP`, *because* `checkpoint` clears `STEP` before its block is relayed, so a `STEP` condition would skip every boundary.
- <a id="d14"></a>**D14 (closes-in-body)**: when the step that finishes an issue is checkpointed (on the human's `looks good`, like every step), its commit body ends with `Closes #N`, *because* GitHub then closes the issue when that commit is pushed to `main`, linked to the commit that fixed it.
- <a id="d15"></a>**D15 (tier-picks-the-match)**: a decision ending (the pause in either form, or the plan card) must close the turn, with text allowed before it; a boundary ending must appear in the turn; a driver ending is recorded so the last ending wins, but not checked in this build, *because* a question turn answers first, an approving message can carry a question the model answers after the boundary, and #5 scoped the check to the pause and the boundary.
- <a id="d16"></a>**D16 (block-once)**: a turn that printed a pause or a boundary and did not close on it is blocked once, with a reason naming the fix, and `stop_hook_active` lets the retried turn end whatever it holds, *because* the block puts the card in front of the human without a round trip, and once Wave 2 shrinks a repeat to one line it costs one stray paragraph at most (settles [Q1 (relay-check-tier)](#q1)).
- <a id="d17"></a>**D17 (current-step-shown)**: every step card at the decision tier opens on the step in flight with its count (`**Now**: Step 2 of 3 - <title>`), the Readout label stops repeating it, and the reminder's `Back to Step 2 of 3` names it too, *because* the human kept asking which step they were on and working it out from Next Up, the only `Step N of M` on the card (settles [Q2 (reminder-shape)](#q2), with the human's addition).
- <a id="d18"></a>**D18 (record-follows-card)**: the build-log record's Readout label drops the step along with the card's, and the anatomy reader counts `Now` among the decision tier's parts in the same step that renders it, *because* the record's dated Log line already names the step, one `readoutLabel` stays one function, and the default suite pins the card's labels exactly (settles [Q4 (record-readout)](#q4)).

## Constraints

- <a id="c1"></a>**C1 (no-new-deps)**: no new dependency of any kind; markdownlint-cli2 is already a devDependency.
- <a id="c2"></a>**C2 (hooks-never-wedge)**: every hook path exits 0 and degrades to no output on any internal failure, so a broken check can never wedge a prompt or a turn's end.
- <a id="c3"></a>**C3 (records-stay-put)**: no existing file under `.plumbbob/builds/` is edited; the fixes govern what the CLI writes from here on.
- <a id="c4"></a>**C4 (spec-first)**: a change to a turn's shape lands in `docs/presentation.md` before the code that renders it, per plumbbob [D80 (cli-renders-model-relays)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d80).
- <a id="c5"></a>**C5 (no-release)**: no version bump and no CHANGELOG entry; the release is cut by hand with `/version`.
- <a id="c6"></a>**C6 (dogfood-in-a-temp-repo)**: hand-run dogfood checks use `node src/cli.ts` in a `mktemp -d` repo, never a stale `dist/` build and never this repo's live session.
- <a id="c7"></a>**C7 (house-voice)**: authored prose follows `docs/voice/` with no em-dash (plumbbob [D78 (em-dash-ban)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d78)), relayed CLI strings keep theirs, and every citation carries its slug (plumbbob [D74 (glossed-citations)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d74)).

## Steps

The steps run in the four waves above, numbered straight through so each keeps its number for life: 1 to 4 fix what is wrong today, 5 to 9 say the pause once, 10 and 11 measure the relay, and 12 to 16 check it. (The waves stay out of this list as headings, because a heading splits a numbered list, and a list that restarts at 5 fails MD029 in exactly the downstream repos this build is for.)

1. [x] fix(status): count out-of-band commits the way handoff does, **done when:** with two commits since the last checkpoint, one carrying a `plumbbob plan` body line and one plain, `plumbbob status` prints `1 commit since the last checkpoint landed outside plumbbob's ledger.` and `handoff`'s Verdict counts the same one; the marker is defined once, in `src/lib/git.ts`; the comments at `src/lib/orient.ts:58`, `:79`, and `:1238` and `src/lib/git.ts:81` state both mechanisms of [D3 (say-the-mechanism)](#d3); `docs/presentation.md` says both surfaces drop the marker; and plumbbob [D66 (oob-commits-surfaced)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d66) carries a dated revision note
   - seam: `src/lib/git.ts`, `src/verbs/handoff.ts`, `src/verbs/status.ts`, `src/lib/orient.ts`, `src/verbs/__tests__/status.test.ts`, `docs/decisions.md`, `docs/state-and-git.md`, `docs/presentation.md`
   - model: sonnet (mechanical, fully specified by the issue)
   - note: `docs/state-and-git.md` gains one sentence saying a hand-made plan commit declares itself with a `plumbbob plan` line in its body, and `docs/presentation.md:381` to `:385`, which says only handoff drops the marker, names both surfaces. The comment above the constant (`handoff.ts:90`) moves with it. The commit body ends `Closes #4` ([D14 (closes-in-body)](#d14)).
2. [x] fix(skills): put a blank line under each detail heading, **done when:** in `skills/build/SKILL.md`, `skills/verify/SKILL.md`, `skills/plan/SKILL.md` (the cold read), and `docs/presentation.md`, every `## <n> <…>` template heading is followed by a blank line, and `pnpm check` is green
   - seam: `skills/build/SKILL.md`, `skills/verify/SKILL.md`, `skills/plan/SKILL.md`, `docs/presentation.md`
   - model: haiku (four blank lines)
3. [x] fix(handoff): put blank lines around the detail file's headings, **done when:** a unit test gives the normalizer a detail whose `## 1 <title>` runs straight into its body and gets back a blank line between them and before the next heading; a detail that already has them comes back unchanged; a `##` line inside a fenced block is left alone; `handoff`, at a step pause and under `--plan`, leaves `.plumbbob/detail.md` normalized on disk before it renders; a failed write changes neither stdout nor the exit code; and handoff's existing tests pass
   - seam: `src/lib/orient.ts`, `src/lib/__tests__/orient.test.ts`, `src/verbs/handoff.ts`, `src/verbs/__tests__/handoff.test.ts`
   - model: sonnet (a small pure function with its tests spelled out)
   - note: the normalizer is a pure function beside `parseSections` (`src/lib/orient.ts:1155`). `handoff` reads the file at `handoff.ts:139`; it writes the normalized text back only when it differs, then parses it, so step 7's stamp later hashes the normalized file. The build-log needs nothing: `checkpoint` re-renders the record from the parsed sections, each heading as a bold `**n.**` handle ([D4 (cli-owns-the-record)](#d4)).
4. [x] test(markdown): lint the detail file a pause leaves on disk, **done when:** `src/verbs/__tests__/generated-markdown.test.ts` gains a case that renders a pause from a detail whose headings have no blank lines and lints the `.plumbbob/detail.md` it leaves under the test's consumer-strict rules, and passes; and taking step 3's normalization out makes the case fail on MD022
   - seam: `src/verbs/__tests__/generated-markdown.test.ts`
   - model: sonnet (one case in a harness that already drives the emitters)
   - note: the file already lints a checkpoint with a detail, a plan with a cold read, a park, and finish's Stats table through markdownlint-cli2's programmatic `main`; the new case reuses its `RULES` and its fixture helpers ([D5 (lint-what-we-write)](#d5)).
5. [x] docs(presentation): show a pause once and name the step it is on, **done when:** `docs/presentation.md` states the rule of [D6 (pause-once)](#d6), shows the reminder rendered as [Q2 (reminder-shape)](#q2) settled it, replaces the sentence at `:474`, says how the card comes back, and opens the card on the step in flight per [D17 (current-step-shown)](#d17); `docs/decisions.md` records [D6 (pause-once)](#d6) and [D17 (current-step-shown)](#d17) as the next free numbers with their *because*, and plumbbob [D83 (card-teaches-itself)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d83) carries a dated revision note; and `pnpm check` is green
   - seam: `docs/presentation.md`, `docs/decisions.md`
   - model: fable (the anatomy is judgment and voice)
   - note: the card appears whole at `:61` to `:93`, its Readout label at `:69` carrying the step it stops repeating; the label's rule sits at `:173`, and the identity paragraph at `:347` ("the Readout label names the step") changes with it. The step pause's Your Call block appears twice (around `:88` and `:457`), and its `expand` move changes to say how the card comes back: those two here, the renderer in step 7, and the copies outside this file in step 8. The plan pause's block at `:493` stays as it is. `**Now**` is the working label for the new line; settle it here.
6. [x] feat(handoff): open the pause card on the step in flight, **done when:** every decision-tier step card (the build and verify pauses, and an auto halt) opens on the line step 5 specified, naming the step in flight with its count the way Next Up counts; the Readout label no longer repeats it, on the card or in the build-log record ([D18 (record-follows-card)](#d18)); handoff's and checkpoint's tests pin both; `anatomy.ts` counts the new line among the decision tier's parts, and `eval-helpers.test.ts` passes against the live renderer; every copy of the card in `README.md`, `docs/happy-path.md`, and `docs/cli-reference.md` matches; and `pnpm check` is green
   - seam: `src/verbs/handoff.ts`, `src/verbs/__tests__/handoff.test.ts`, `src/verbs/__tests__/checkpoint.test.ts`, `test/evals/helpers/anatomy.ts`, `test/integration/eval-helpers.test.ts`, `README.md`, `docs/happy-path.md`, `docs/cli-reference.md`
   - model: sonnet (a renderer change pinned by tests)
   - note: the Readout label renders at `handoff.ts:452` and the record builds it at `:293`; `checkpoint.test.ts:249` pins the record's label and `eval-helpers.test.ts:636` and `:694` pin the card's labels exactly. The card's copies sit at `README.md:148` and `docs/happy-path.md:201`, and `docs/cli-reference.md:147` describes the label. Under a re-sequenced build order the count follows whatever Next Up already does, so the two lines never disagree.
7. [x] feat(handoff): print a one-line reminder for a pause already shown, **done when:** handoff's tests show that the first render of a pause prints the whole card; a second with nothing changed prints the reminder; a changed detail file, a changed file in the seam, or a changed check row each bring the card back; a change in `spent` alone does not; `--full` always prints the card; `checkpoint`, `revert`, and `abandon` clear the stamp; the stamp is git-excluded; and `node src/cli.ts handoff` run twice in a temp repo prints the card and then the reminder
   - seam: `src/verbs/handoff.ts`, `src/lib/sidecar.ts`, `src/cli-core.ts`, `src/verbs/checkpoint.ts`, `src/verbs/revert.ts`, `src/verbs/abandon.ts`, `src/verbs/__tests__/handoff.test.ts`, `docs/cli-reference.md`, `docs/state-and-git.md`, `site/api.html`
   - model: opus (stateful rendering with several edge cases)
   - note: the stamp lives beside `STEP` as `builds/<slug>/PAUSE`, and it joins `excludeControl` (`src/lib/sidecar.ts:684`) and the exclude list in `docs/state-and-git.md`; while there, fix the stale comment above `detail.md` (`sidecar.ts:692`), which still calls the commit the detail's archive, though since `8549026` it is the build-log. `--plan` and `--driver` are untouched. The step pause's Your Call moves render at `handoff.ts:572`, which is where the `expand` move takes step 5's new wording; `planCallBlock` at `:599` stays as it is. `site/api.html:327` mirrors handoff's reference entry. Confirm the turn gate leaves `.check/summary.json` alone on a conversation-only turn (checkride's `.check/.dirty` marker, read by `--if-dirty`, says it does); if it rewrites the file, the check row would flap and bring the card back on every question. A stale stamp needs nothing from `recover`, since the most it can cost is one full card.
8. [x] fix(skills): answer a question at the pause without re-pasting it, **done when:** neither `skills/build/SKILL.md` nor `skills/verify/SKILL.md` tells the model to paste the whole card after a question; both say a question turn is the answer followed by `handoff`'s output, that a request to see the pause runs `plumbbob handoff --full`, and that a pause whose card is not in the current conversation (a fresh session, or after `/clear`) runs `plumbbob handoff --full` too; every copy of the Your Call block and of the expand prose in `README.md`, `docs/happy-path.md`, `docs/skills-reference.md`, `docs/faq.md`, `docs/glossary.md`, `docs/techniques.md`, `site/index.html`, and `site/docs.html` matches what the CLI renders; and `pnpm check` is green
   - seam: `skills/build/SKILL.md`, `skills/verify/SKILL.md`, `README.md`, `docs/happy-path.md`, `docs/skills-reference.md`, `docs/faq.md`, `docs/glossary.md`, `docs/techniques.md`, `site/index.html`, `site/docs.html`
   - model: opus (model-facing instructions, where one loose word is a behavior)
   - note: the positional rule (build `:119`, verify `:56`) stays as it is for the first render of a pause; what changes is the expand paragraph (build `:197`, verify `:134`). The other copies sit at `docs/faq.md:56`, `docs/glossary.md:102`, `docs/techniques.md:166`, `site/index.html:175`, and `site/docs.html:127` and `:181`; the plan pause's copy at `docs/happy-path.md:96` stays as it is.
9. [x] fix(turn): let a park sit beside an answer in a mixed message, **done when:** the in-flight nudge in `src/verbs/turn.ts` states both halves of [D9 (answer-then-park)](#d9); `turn.test.ts` asserts both and still asserts the relay clause `df9b393` added (`relay the block it prints whole, with nothing written around it`); `skills/park/SKILL.md` carries the same carve-out; and `pnpm check` is green
   - seam: `src/verbs/turn.ts`, `src/verbs/__tests__/turn.test.ts`, `skills/park/SKILL.md`
   - model: sonnet (a wording change pinned by tests)
   - note: the commit body ends `Closes #6`.
10. [x] test(evals): add a contract for a question asked at the pause, **done when:** a new contract builds to the pause, asks a plain question in a second human turn, and asks to see the pause in a third; its probes report whether the second turn ends on the answer and the reminder with no card, and whether the third renders the whole card; `anatomy.ts` recognizes the reminder; the contract is registered in `contracts/index.ts`; and `pnpm eval:latched --contract c10` completes
    - seam: `test/evals/contracts/c10-question.eval.ts`, `test/evals/contracts/index.ts`, `test/evals/helpers/anatomy.ts`
    - model: opus (an eval that has to read the tail of a whole session's text)
    - note: the driver joins every text part of a session into one string, so the tail rule in `anatomy.ts` is what separates the answer from the reminder. Each scripted turn is a fresh `claude -p` session, armed by a warmup turn. The anatomy probes stay `info`, never gating.
11. [x] chore(evals): sweep the relay after the pause change, **done when:** a latched sweep of all ten contracts lands a receipt in `docs/evals/` whose turn-anatomy table includes the new contract's probes and reads beside the 2026-09-17 numbers (27/30 decision, 9/10 boundary, 44/50 nothing after the relay); `pnpm eval:report` renders it; and `pnpm check` is green
    - seam: `docs/evals/`
    - model: sonnet (runs the driver)
    - note: the receipt belongs in `docs/evals/`, never `reports/` or `research/`, both of which are ignored. It records Wave 2 in real turns and fixes the relay's numbers before any hook exists; step 16 runs its own two arms at one commit, so its comparison does not lean on this one.
12. [x] chore(hooks): spike what a Stop hook can read and do, **done when:** a spike report answers, with captured hook payloads as evidence: (1) whether Stop's stdin carries the turn's final text or only `transcript_path`, and whether that text is in the transcript when Stop fires, interactively and under `claude -p`; (2) which outputs Stop honors (`decision: "block"` with a `reason`, `systemMessage`, `continue: false`) and whether it accepts `additionalContext` at all; (3) what the human sees when a block lands after text has streamed, and where the block's reason shows up in the transcript; (4) how a plumbbob Stop hook and checkride's interact when both fire and when both block; (5) whether `TURN` has ticked when Stop fires under `claude -p`; and (6) that `stop_hook_active` is set on the continuation after a block
    - seam: `.plumbbob/builds/2026-10-08-said-once-said-whole/spike-01-stop-hook.md`
    - model: opus (hands-on probing of the harness)
    - note: [D16 (block-once)](#d16) is settled; if the spike finds the final text unreadable at Stop, that reopens it rather than letting the check soften quietly. The 2026-09-17 receipt records that the headless UserPromptSubmit tick lands at about session end, which would make a fresh `RELAY` look stale under [D13 (gate-on-the-turn)](#d13). Probe in a throwaway repo ([C6 (dogfood-in-a-temp-repo)](#c6)), and find where this machine wires checkride's Stop hook before testing the pair.
13. [x] docs(decisions): record the relay check and its tier, **done when:** `docs/decisions.md` records the relay check as the next free number: its tier ([D16 (block-once)](#d16)), its *because* with the spike's evidence, and where it sits beside plumbbob [D64 (approval-latch)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d64), [D66 (oob-commits-surfaced)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d66), and [D75 (two-gates)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d75); and `pnpm check` is green
    - seam: `docs/decisions.md`
    - model: fable (a tier decision weighed against the project's own history)
14. [x] feat(handoff): remember the ending each turn has to close on, **done when:** `handoff` (step card, reminder, and plan card) and every transition verb record what they printed in `.plumbbob/RELAY`, with its tier, its render, the command that reprints a decision ending, and the current `TURN`, through one helper; a failed write never changes stdout or the exit code; `RELAY` is git-excluded and listed in `docs/state-and-git.md`; and tests cover each of `handoff`'s renders (a verify pause's command carrying its step number), `checkpoint`, `park`, and the failed write
    - seam: `src/lib/sidecar.ts`, `src/lib/notice.ts`, `src/verbs/handoff.ts`, `src/verbs/checkpoint.ts`, `src/verbs/park.ts`, `src/verbs/revert.ts`, `src/verbs/abandon.ts`, `src/verbs/spike.ts`, `src/verbs/use.ts`, `src/verbs/finish.ts`, `src/verbs/order.ts`, `src/verbs/start.ts`, `src/verbs/__tests__/handoff.test.ts`, `src/verbs/__tests__/checkpoint.test.ts`, `docs/state-and-git.md`
    - model: sonnet (one helper and its callers)
    - note: the formatters in `notice.ts` return strings and stay pure; the new helper is what prints and records, so each verb swaps its `process.stdout.write` for it (`start`'s `**Session**: started` ending among them). The tier field is what [D15 (tier-picks-the-match)](#d15) reads, and the render and its command are what the block's reason names under [D12 (retry-reruns)](#d12).
15. [x] feat(hooks): check at a turn's end that it closed on its relay, **done when:** `hooks/hooks.json` wires Stop to a new verb registered beside `turn` as hook machinery; its tests cover a whole relay at the end (passes), a paraphrased step card (fails, and the reason names `plumbbob handoff --full`), a missed plan card (fails, and the reason names `plumbbob handoff --plan`), a turn with no text (fails), text after a pause's relay (fails), an answer followed by the reminder (passes), a boundary block followed by an answer (passes), a `park` after a `handoff` in one turn (passes on the park), a `RELAY` from an earlier turn (ignored), `stop_hook_active` set (no second block), and an unreadable transcript (exit 0, no output); a failed check blocks once ([D16 (block-once)](#d16)) with a reason naming the command `RELAY` recorded; doctor's hooks line names every wired event; and `docs/cli-reference.md` documents the verb beside `turn`
    - seam: `src/verbs/relay.ts`, `src/verbs/__tests__/relay.test.ts`, `src/cli-core.ts`, `hooks/hooks.json`, `src/verbs/doctor.ts`, `docs/cli-reference.md`
    - model: opus (hook machinery, where a false positive doubles the card)
    - note: [D11 (check-in-the-cli)](#d11), [D12 (retry-reruns)](#d12), [D13 (gate-on-the-turn)](#d13), and [D15 (tier-picks-the-match)](#d15) govern it. `relay` is a working name: it reads `RELAY` the way `turn` ticks `TURN`. Normalize whitespace on both sides before comparing, and let the spike move the read from the transcript to a stdin field if one exists. `plumbbob init` links the package as a plugin, so `hooks.json` covers both install paths.
16. [ ] chore(evals): measure the relay check with and without the hook, **done when:** two sweeps at one commit, one with the Stop hook and one with it removed, land in one receipt in `docs/evals/`, compared on every ending-renders-whole probe, nothing after the relay, and the recommendation as the last text, with a count of the blocks the hook issued and how many fell on an ending that was already whole; the decision from step 13 cites the receipt; and `pnpm check` is green
    - seam: `test/evals/helpers/plugin.ts`, `docs/evals/`, `docs/decisions.md`
    - model: sonnet (runs the driver and reads the tables)
    - note: the "without" arm loads a copy of the plugin with the Stop entry dropped from `hooks.json`, so the product grows no switch. A false block in this sweep reopens [D16 (block-once)](#d16). The commit body ends `Closes #5`.

## Build order

*(Optional. The sequence to build the steps in once it stops being their numbering: one
line of comma-separated step numbers, such as `7, 8, 5, 10, 6`; empty means document
order. `plumbbob order 7 8 5 10 6` (`/plumbbob:order`) writes it, and `status`, `build`,
`checkpoint`, and `handoff` all read it, so the dashboard's `← next`, a bare
`/plumbbob:build`, and the card's Next Up agree. A step keeps its number for life; this
line is where the sequence lives.)*

## Open questions

- <a id="q1"></a>**Q1 (relay-check-tier)**: *resolved:* 2026-10-08, block once, recorded as [D16 (block-once)](#d16); the question was whether the Stop check blocks a turn that did not close on its relay, or only surfaces the miss
  - *plain:* A block makes the model redo the ending, so the human gets the card without asking for it; the text the model already wrote stays on screen above it, since Stop fires after the turn has streamed. It would be the first time plumbbob stops the model's turn: the latch refuses a verb (plumbbob [D64 (approval-latch)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d64)), the commit hook asks (plumbbob [D66 (oob-commits-surfaced)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d66)), and the only blocking Stop hook in reach is checkride's gate on the code (plumbbob [D75 (two-gates)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d75)). Surfacing (a `systemMessage` the human sees) adds no wall, but it leaves the human to ask for the card: one round trip per miss, at the measured rate about one ending in ten.
  - *lean:* block once, guarded by `stop_hook_active`, then let the turn end. Once Wave 2 shrinks a repeat to one line, a block costs one stray paragraph at most, both failures #5 saw are fixed without a round trip, and the wall stands at the turn's ending rather than on the work, so plumbbob [D10 (pause-not-lock)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d10) and plumbbob [D13 (no-edit-guards)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d13) hold. Fall back to surfacing if the spike finds the final text unreadable at Stop, or the A/B in step 16 shows a false block.
- <a id="q2"></a>**Q2 (reminder-shape)**: *resolved:* 2026-10-08, the lean, with the step in flight added to the card, recorded as [D17 (current-step-shown)](#d17); the question was what the reminder line says, and under which label
  - *plain:* It is a new line plumbbob says out loud, so plumbbob [D84 (one-liner-register)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d84) governs it: a bold label, then the fact, never the move. It has to tell the human the step is still waiting on them without repeating the card, and the eval's anatomy reader has to recognize it, or every question turn scores as a stray (step 10).
  - *lean:* reuse the driver pointer `handoff` already renders, `**Next Up**: Back to Step 2 of 3 - <title>`, which `presentation.md` already specifies and which a park's ending also closes on, so a plain question and a mixed message end on the same line; and let the full card's `expand` move say how to bring the card back, so the reminder never has to.
- <a id="q3"></a>**Q3 (detail-on-disk)**: *resolved:* 2026-10-16, the lean, recorded as [D4 (cli-owns-the-record)](#d4) and [D5 (lint-what-we-write)](#d5) and as the new steps 3 and 4; the question was what should back up step 2's template fix, once steps 3 and 4 turned out to guard a record path no template heading takes
  - *plain:* `checkpoint` never copies the detail into the build-log as written. `stepRecord` and `planRecord` (`src/verbs/handoff.ts:270`, `:304`) re-render each `## n <title>` as a bold `**n.** <title>` handle (`:332`), so a template heading reaches the Log only through the verbatim fallback (`:274`) or inside a section's body. What turns a downstream checkpoint red, in #5's own words, is `.plumbbob/detail.md` itself: the gate runs at `src/verbs/checkpoint.ts:95`, before `clearDetail` at `:135`, and the file sits on disk for every gate run while a pause is open. The lint test step 4 described exists already, too: `src/verbs/__tests__/generated-markdown.test.ts` drives start, park, a checkpoint with a detail, `checkpoint --plan` with a cold read, and finish's Stats table through markdownlint-cli2 under consumer-strict rules. As first written, step 3 normalized text that never arrives, step 4 duplicated that test, and step 4's done-when could not come true. Step 2's blank line is what fixes #5's side note; the open part was what backs it up for a model that skips the template.
  - *lean:* aim both steps at the file that fails. Step 3 becomes `fix(handoff): put blank lines around the detail file's headings`: `handoff` rewrites `.plumbbob/detail.md` in place at both pauses, a blank line around each heading and fences left alone, before it hashes or renders anything, so every later gate lints a clean file whatever the model wrote. Step 4 becomes a case in `generated-markdown.test.ts`: a pause rendered from a heading-tight detail leaves a file that lints clean, and fails on MD022 with step 3 taken out. [D4 (cli-owns-the-record)](#d4) and [D5 (lint-what-we-write)](#d5) are re-worded to match, and `record-markdown.test.ts` is never created.
- <a id="q4"></a>**Q4 (record-readout)**: *resolved:* 2026-10-16, the lean, recorded as [D18 (record-follows-card)](#d18) and in step 6; the question was whether the build-log record stops naming the step in its Readout label once the card does
  - *plain:* step 6 changes `readoutLabel` (rendered at `src/verbs/handoff.ts:452`), and `stepRecord` builds the build-log record with the same function (`:293`), so the record's `**Readout**: Step 1 - First` changes with the card unless step 6 splits them; `src/verbs/__tests__/checkpoint.test.ts:249` pins today's label. Beside it, `test/integration/eval-helpers.test.ts` runs in `pnpm check` and asserts the card's labels equal the decision tier's parts exactly (`:636`, `:694`), so a `**Now**` line fails it the moment step 6 lands, while step 10 was where `test/evals/helpers/anatomy.ts` learned the line. Step 6's seam held none of the three.
  - *lean:* the record follows the card: its dated Log line (`step 1 checkpointed · <sha> — First`) already names the step, and one `readoutLabel` stays one function. Step 6's seam gains `src/verbs/__tests__/checkpoint.test.ts`, `test/integration/eval-helpers.test.ts`, and `test/evals/helpers/anatomy.ts`, with `Now` joining the decision tier's parts there; step 10 keeps only the reminder, and its note about malformed endings goes, since the reader's whole-ending probe skips a label it does not know and only the exact-label tests ever broke.

## Verdicts

- 2026-10-08: the relay check's tier → chose block once, because it puts the card in front of the human without a round trip; dropped surfacing the miss
- 2026-10-08: the reminder's shape → chose the driver pointer the lean proposed, and added the step in flight to the top of the card, because the human kept working out the current step from Next Up
- 2026-10-08 (plan cold read): the retry after a missed decision ending → chose `RELAY` recording its render and the command that reprints it, named in the block's reason, because plain `handoff` reprints neither a card step 7's stamp has marked shown nor the plan card; dropped keying step 7's stamp to `TURN`, which covers only a rare double run in one turn and would tie the pause's form to when `TURN` ticks
- 2026-10-16 (refine): what backs up the template fix → chose `handoff` normalizing the detail file it reads, with the existing generated-markdown test linting what a pause leaves on disk, because the build-log never receives a template heading and the file on disk is what the gate lints; deleted the `logEntry` normalization and the new `record-markdown.test.ts`
- 2026-10-16 (refine): the record's Readout label → chose to follow the card, because the dated Log line already names the step; moved the anatomy reader's `Now` into step 6, where the default suite first sees it
- 2026-10-16 (refine): repairs to match the code at `3912163` → left the plan pause's Your Call block out of steps 5 and 7, widened seams to the copies that would drift (steps 1, 6, 7, 8, and 14), corrected the line numbers that were a line or two off, and re-worded D11 (check-in-the-cli), step 9, and step 7's note where they misdescribed the code

## Issue map

| Issue | What it asked for | Lands in | Closes at |
| ----- | ----------------- | -------- | --------- |
| #4 | one count for `status` and `handoff` | step 1 | step 1 |
| #5, side note | a blank line in the detail template | steps 2 to 4 | with #5 |
| #5 | a Stop hook that checks the relay | steps 10 to 16 | step 16 |
| #6 | the pause shown once, plain answers, a park beside the answer | steps 5 to 9 | step 9 |
| settling Q2 | the step in flight named on the card | steps 5 and 6 | with #6 |

## Noticed, not in this build

- The turn hook's nudge has the model capture a chat tangent with `plumbbob park` directly, while the park skill shows the composed line and waits for the human's approval first. The two disagree about whether a tangent that arrives as chat needs approval.
- No skill tells the model how to land a plan edit between steps. After step 1, a hand-made plan commit that carries the marker drops out of the count and one that does not still counts; teaching harvest and refine to write the marker would close the gap.
- The driver skills already say one command is the whole turn, so the relay check can extend to driver endings once step 16 shows it makes no false blocks.
- Cursor has no plumbbob plugin yet; when it gets one, the Stop check needs a Cursor equivalent.

## Source

The spec this build was planned from, `research/10-said-once-said-whole.md` as written on 2026-10-08, kept whole because research/ is gitignored and this is the only tracked copy. It is quoted rather than fenced so the step parser, which reads any line that is exactly `## Steps`, never mistakes the spec's own step list for this plan's.

> <!--
> research/10: the spec for one plumbbob build covering GitHub issues #4, #5, and #6,
> written 2026-10-08 from the issues as filed and the triage that followed them.
>
> Absorb it with `/plumbbob:plan research/10-said-once-said-whole.md`. The plan skill
> distills it into the build's intent.md and keeps this text whole in that file's
> `## Source` appendix. Until then this file is untracked, because research/ is
> gitignored. Seams that name `<slug>` take the build's slug once `start` mints it.
> -->
>
> # Said once, said whole
>
> **Title** (for `plumbbob start`): Said once, said whole
> **Size:** medium (four waves, sixteen steps)
> **Scope:** relay
>
> Three issues filed from real builds share one subject: what plumbbob says at the edge
> of a turn. `status` and `handoff` state one fact two ways
> ([#4](https://github.com/robmclarty/plumbbob/issues/4)). The pause card repeats under
> every follow-up question until the answers scroll out of sight
> ([#6](https://github.com/robmclarty/plumbbob/issues/6)). The relay the whole turn
> anatomy rests on is a rule the model is asked to remember, and nothing checks it
> ([#5](https://github.com/robmclarty/plumbbob/issues/5)). A side note on #5 adds a
> fourth: the detail template the model copies writes markdown into the tracked
> build-log that fails markdownlint wherever that folder is linted.
>
> `docs/presentation.md` already states the rule this build extends: **each fact appears
> once, in its part.** The count gets one definition, the pause gets one rendering, the
> record gets markdown that holds up downstream, and the relay gets a check at the turn's
> end. Every claim below about the code was read on `main` at 0.12.1 (`3912163`), and
> the line numbers are from that commit.
>
> ## What the issues found, and what triage changed
>
> ### #4: one count, two definitions
>
> `handoff` leaves plumbbob's own plan commits out of its out-of-band count, and `status`
> cannot, because the pattern that recognizes them is a module-local const:
> `PLAN_COMMIT_MARKER = '^plumbbob plan$'` at `src/verbs/handoff.ts:94`, passed at
> `:537`, while `src/verbs/status.ts:106` calls `commitsSince(root, anchor)` with no
> exclusion. On 0.11.3, two hand-made `chore(plan)` commits read in `status` as "2
> commits since the last checkpoint landed outside plumbbob's ledger" and in `handoff`
> as zero. The sentence tells the human they went around the process, about a commit
> that *is* the process.
>
> Triage kept the issue's four-edit fix and corrected one thing in it. The draft comment
> credits the marker with excluding checkpoint commits as well, but those never reach the
> count by another route: every commit a plumbbob verb makes writes a ledger line
> (`checkpoint --plan` appends `plan <sha>` on every run, `src/verbs/checkpoint.ts:202`),
> and the count starts at the last ledger line of any kind (`src/lib/orient.ts:460`). The
> marker's only job is the hand-made plan commit (a harvest fold, a plan re-sync) that
> carries `plumbbob plan` in its body, and no skill tells the model to write that line
> today. The issue's alternative, "2 plan commits, 1 other", stays out
> ([D2 (one-count)](#d2)).
>
> ### #5: the relay nothing checks
>
> The build skill ends a pause with "paste `plumbbob handoff`'s output whole, verbatim,
> and write nothing before or after it", and the boundary with the same rule for
> `checkpoint`'s block. Both are prose. `hooks/hooks.json` wires PreToolUse (the commit
> ask-hook), PostToolUse on edits (the light tier), and UserPromptSubmit
> (`plumbbob turn`); none of them fires after the assistant's last text exists, and only
> Stop does. The issue saw both failures on one step: a paraphrase in place of the card,
> then a turn that ended on the tool result with no visible text at all.
>
> The rate is measured. The 2026-09-17 sweep found the decision ending whole in 27 of 30
> turns, the boundary ending in 9 of 10, and nothing after the relay in 44 of 50: the
> relay slips about one ending in ten.
>
> Triage changed five things in the proposal:
>
> - **A block cannot hide the broken text.** Stop fires after the turn has streamed, so
>   the paraphrase stays on screen above the corrected relay, and the issue's "the human
>   never sees the broken one" does not hold. A block still fixes both failures without
>   a round trip, which is why [Q1 (relay-check-tier)](#q1) settled on it.
> - **The verbs write `RELAY` themselves**, rather than a PostToolUse hook scraping
>   stdout ([D10 (verbs-write-relay)](#d10)).
> - **The check keys on the turn, not on `STEP`.** `checkpoint` clears `STEP` before its
>   block is relayed, so the issue's "when a step is in flight" condition would skip
>   every boundary ([D13 (gate-on-the-turn)](#d13)).
> - **A failed check re-runs `handoff`** instead of pasting the stored block, which goes
>   stale when the model kept working after it rendered ([D12 (retry-reruns)](#d12)).
> - **Three assumptions wait on a spike** (step 12): whether the final text is readable
>   at Stop, whether Stop accepts `additionalContext` at all (the issue's fallback), and
>   whether `TURN` has ticked by then under `claude -p`.
>
> ### #5, side note: the record's markdown
>
> The detail template puts no blank line between `## 1 <highlight>` and its body, and it
> does so in four places: `skills/build/SKILL.md:146`, `skills/verify/SKILL.md:78`, the
> plan skill's cold read at `skills/plan/SKILL.md:209`, and `docs/presentation.md:772`.
> `checkpoint` copies the detail file as written into the tracked build-log's `## Log`
> (`logEntry`, `src/lib/buildlog.ts:152`), so a repo that lints `.plumbbob/builds/` fails
> MD022 at the next checkpoint. This is the third of its family after #1 (MD060, the
> Stats table) and #2 (MD032, the Park list). All three surfaced downstream first for one
> reason: this repo's `.markdownlint-cli2.jsonc` ignores `.plumbbob/**`, because those
> records may never be rewritten. The handoff parser reads headings one line at a time
> (`src/lib/orient.ts:1137`) and ends a section at the next `##` heading, so the blank
> line is safe to add.
>
> ### #6: the pause that repeats
>
> The expand rule at `skills/build/SKILL.md:197` and `skills/verify/SKILL.md:134` tells
> the model to answer a question, then run `plumbbob handoff` again and paste it, so every
> reply during a pause carries the whole card (about 40 lines) under an answer of a
> sentence or two. The rule was deliberate: `docs/presentation.md:474` says "An expand
> turn ends on the Your Call block again, so the pause stays legible however many
> questions it takes." Changing it is a change to the spec, and so to `presentation.md`
> first ([C4 (spec-first)](#c4)). The plan pause already behaves the way #6 asks: its
> skill answers a question "from the detail file or `intent.md`" and changes nothing,
> with no re-render (`skills/plan/SKILL.md:157`).
>
> Triage took all three of the issue's suggestions and joined the first two. The CLI
> chooses between the card and a one-line reminder from a stamp of what it last showed
> ([D7 (cli-picks-the-form)](#d7)), so the skills keep one rule for every pause turn, and
> the answer sits one line from the bottom instead of forty. The stamp has to leave
> `spent` out, because that row counts turns and changes on every one
> (`src/lib/orient.ts:959`). The nudge rewrite keeps what `df9b393` (2026-09-22) fixed: a
> message that is only a tangent still ends on the park's block
> ([D9 (answer-then-park)](#d9)).
>
> Settling [Q2 (reminder-shape)](#q2) added one more piece. The card names the step it is
> pausing on only in the Readout label, mid-card and without its count
> (`**Readout**: Step 2 - <title>`, rendered at `src/verbs/handoff.ts:452`), while the
> one `Step N of M` the eye finds is Next Up's, a step ahead. A human who asks "which step
> am I on?" has been answering it by subtraction, so the card now opens on the step in
> flight ([D17 (current-step-shown)](#d17)).
>
> ## Frame
>
> - **Problem:** plumbbob speaks at the edge of a turn, and it says four things wrong
>   there. `status` counts a plan commit as out-of-band where `handoff` does not. A
>   question at a pause gets its answer stacked above a card the human has already read.
>   The relay that carries every ending to the screen fails about one turn in ten, and
>   nothing can see it fail. The detail the model writes lands in the tracked build-log
>   as markdown that fails MD022 downstream.
> - **Smallest thing that solves it:** one shared marker for the count; a blank line in
>   four templates, backed by a CLI normalization and a test that lints what the CLI
>   writes; a stamp that lets `handoff` print one line for a pause it already showed; and
>   a Stop check that compares the turn's last text with the ending plumbbob last
>   printed, measured before and after it ships.
> - **Done looks like:** `status` and `handoff` report the same count for the same
>   history; a detail recorded without blank lines still lints clean in the build-log,
>   under a test that drives the real emitters; the pause card opens on the step in
>   flight; a question at an unchanged pause is answered above one reminder line, and
>   `handoff --full` brings the card back; a turn that printed a pause or a boundary and
>   closed on something else is caught at Stop and blocked once; two receipts in
>   `docs/evals/` measure the relay before and after the hook; #4, #5, and #6 are closed.
> - **Explicitly NOT doing:** the "N plan commits, M other" split; editing any existing
>   build record; a product switch that turns the relay check off; any change to the plan
>   pause; a relay check on the `status` dashboard or on driver endings; Cursor parity
>   for the new hook; a version bump or CHANGELOG entry.
>
> ## Architecture sketch
>
> ```text
> human prompt ─► UserPromptSubmit ─► plumbbob turn ─► tick TURN; nudge while a step is in flight
>                                                      (wave 2: a mixed message answers, then parks)
>
> model works ──► plumbbob handoff ─► stdout: the whole card, or one reminder line   (wave 2)
>                       │               └─► builds/<slug>/PAUSE: step + hash of what it showed
>                       │
> handoff, or a transition verb ─► .plumbbob/RELAY: tier + TURN + the text it printed  (wave 4)
>
> model relays ─► Stop ─► plumbbob relay: did the turn close on RELAY?               (wave 4)
>                           yes ─► the turn ends
>                           no  ─► block once (D16); stop_hook_active lets the retry end
> ```
>
> ## Waves
>
> | Wave | Steps | What lands | Closes |
> | ---- | ----- | ---------- | ------ |
> | 1. Fix what is wrong today | 1 to 4 | the shared count, the templates, the CLI's normalization, a lint guard on the record | #4 |
> | 2. Say the pause once | 5 to 9 | the spec, the step on the card, the CLI stamp, the skills, the nudge | #6 |
> | 3. Measure the relay | 10 to 11 | a contract for the question turn, and a sweep with Wave 2 in place | |
> | 4. Check the relay | 12 to 16 | a spike, the decision, `RELAY`, the Stop check, the A/B | #5 |
>
> **The order is load-bearing.** Wave 1 is bug fixes with no design in them, and any of
> its steps could ship alone. Wave 2 lands before the hook because it changes what a
> question turn ends on: a check written against today's rule would enforce the
> repetition #6 removes, and then need rewriting. Wave 3 measures with Wave 2 in place,
> so the numbers describe the turn the hook will actually check. Wave 4 opens on a spike
> because three of the proposal's assumptions about Stop are unverified. The numbering is
> the build order, so `## Build order` stays empty.
>
> ## Decisions
>
> - <a id="d1"></a>**D1 (one-marker)**: `PLAN_COMMIT_MARKER` moves to `src/lib/git.ts` beside `commitsSince`, exported, and `status` passes it, *because* both surfaces have to measure one quantity, and a module-local const is why they could not.
> - <a id="d2"></a>**D2 (one-count)**: the receipts line keeps a single count with plan commits left out, never "2 plan commits, 1 other", *because* a plan commit is the process running, and a card line renders only when it says something new.
> - <a id="d3"></a>**D3 (say-the-mechanism)**: the comments name both mechanisms (a commit any plumbbob verb makes starts the range; the marker drops a hand-made plan commit), *because* the issue's draft comment credited the marker with both, and a comment that misstates its mechanism is how #4 passed for a design split.
> - <a id="d4"></a>**D4 (cli-owns-the-record)**: `logEntry` puts a blank line around every heading in a recorded detail, on top of the template fix, *because* the CLI owns what it writes into the record, and a model will not always copy a template exactly.
> - <a id="d5"></a>**D5 (lint-what-we-write)**: a test lints the markdown the CLI writes into a build record, with markdownlint-cli2 and the repo's own rules, *because* the repo's config ignores `.plumbbob/**`, which is why #1, #2, and this MD022 all surfaced downstream first.
> - <a id="d6"></a>**D6 (pause-once)**: a step pause renders its whole card once; while it is unchanged `handoff` prints one reminder line, and the card returns on `--full` or when the pause changes, *because* the answer is what the human asked for, and 40 lines beneath it push it off the screen.
> - <a id="d7"></a>**D7 (cli-picks-the-form)**: the CLI chooses card or reminder from a stamp of its last render, and the skills keep ending every pause turn on `handoff`'s output, *because* a deterministic line is the CLI's to render (plumbbob [D80 (cli-renders-model-relays)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d80)), and one rule for every pause turn keeps the relay check a single comparison.
> - <a id="d8"></a>**D8 (stamp-skips-spent)**: the stamp hashes the step number, the detail file, and the rendered `check`, `seam`, and `diff` rows, never `spent`, *because* `spent` counts turns, so it changes on every turn and would make every render look new.
> - <a id="d9"></a>**D9 (answer-then-park)**: a message that is only a tangent still ends on the park's block; a message that also asks something gets its answer first and the park's block after it, *because* the two failures were a dropped answer and a stack of blocks, and the tangent-only rule `df9b393` set was right.
> - <a id="d10"></a>**D10 (verbs-write-relay)**: `handoff` and every transition verb record the ending they print in `.plumbbob/RELAY`, with its tier and the `TURN` it printed in, through one shared helper, instead of a PostToolUse hook scraping stdout, *because* the verb knows exactly what it printed, a command-string match misses `pb handoff` and `node src/cli.ts handoff`, and a turn that runs `handoff` and then `park` has to be judged by its last ending.
> - <a id="d11"></a>**D11 (check-in-the-cli)**: the Stop check is a hidden CLI verb in TypeScript beside `turn`, not a shell script and not a branch of `turn`, *because* reading the JSONL transcript in POSIX sh is fragile, and `turn` promises in its header that it blocks nothing.
> - <a id="d12"></a>**D12 (retry-reruns)**: a failed check after a pause tells the model to run `plumbbob handoff` again and paste that, never the stored `RELAY`, *because* a pause's stored block goes stale when the model kept working after it rendered; a boundary reports a commit already landed, so its stored block can be pasted as it stands.
> - <a id="d13"></a>**D13 (gate-on-the-turn)**: the check runs only when `RELAY` was written in the current turn, never on the presence of `STEP`, *because* `checkpoint` clears `STEP` before its block is relayed, so a `STEP` condition would skip every boundary.
> - <a id="d14"></a>**D14 (closes-in-body)**: when the step that finishes an issue is checkpointed (on the human's `looks good`, like every step), its commit body ends with `Closes #N`, *because* GitHub then closes the issue when that commit is pushed to `main`, linked to the commit that fixed it.
> - <a id="d15"></a>**D15 (tier-picks-the-match)**: a decision ending (the pause in either form, or the plan card) must close the turn, with text allowed before it; a boundary ending must appear in the turn; a driver ending is recorded so the last ending wins, but not checked in this build, *because* a question turn answers first, an approving message can carry a question the model answers after the boundary, and #5 scoped the check to the pause and the boundary.
> - <a id="d16"></a>**D16 (block-once)**: a turn that printed a pause or a boundary and did not close on it is blocked once, with a reason naming the fix, and `stop_hook_active` lets the retried turn end whatever it holds, *because* the block puts the card in front of the human without a round trip, and once Wave 2 shrinks a repeat to one line it costs one stray paragraph at most (settles [Q1 (relay-check-tier)](#q1)).
> - <a id="d17"></a>**D17 (current-step-shown)**: every step card at the decision tier opens on the step in flight with its count (`**Now**: Step 2 of 3 - <title>`), the Readout label stops repeating it, and the reminder's `Back to Step 2 of 3` names it too, *because* the human kept asking which step they were on and working it out from Next Up, the only `Step N of M` on the card (settles [Q2 (reminder-shape)](#q2), with the human's addition).
>
> ## Constraints
>
> - <a id="c1"></a>**C1 (no-new-deps)**: no new dependency of any kind; markdownlint-cli2 is already a devDependency.
> - <a id="c2"></a>**C2 (hooks-never-wedge)**: every hook path exits 0 and degrades to no output on any internal failure, so a broken check can never wedge a prompt or a turn's end.
> - <a id="c3"></a>**C3 (records-stay-put)**: no existing file under `.plumbbob/builds/` is edited; the fixes govern what the CLI writes from here on.
> - <a id="c4"></a>**C4 (spec-first)**: a change to a turn's shape lands in `docs/presentation.md` before the code that renders it, per plumbbob [D80 (cli-renders-model-relays)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d80).
> - <a id="c5"></a>**C5 (no-release)**: no version bump and no CHANGELOG entry; the release is cut by hand with `/version`.
> - <a id="c6"></a>**C6 (dogfood-in-a-temp-repo)**: hand-run dogfood checks use `node src/cli.ts` in a `mktemp -d` repo, never a stale `dist/` build and never this repo's live session.
> - <a id="c7"></a>**C7 (house-voice)**: authored prose follows `docs/voice/` with no em-dash (plumbbob [D78 (em-dash-ban)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d78)), relayed CLI strings keep theirs, and every citation carries its slug (plumbbob [D74 (glossed-citations)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d74)).
>
> ## Open questions
>
> - <a id="q1"></a>**Q1 (relay-check-tier)**: *resolved:* 2026-10-08, block once, recorded as [D16 (block-once)](#d16); the question was whether the Stop check blocks a turn that did not close on its relay, or only surfaces the miss
>   - *plain:* A block makes the model redo the ending, so the human gets the card without asking for it; the text the model already wrote stays on screen above it, since Stop fires after the turn has streamed. It would be the first time plumbbob stops the model's turn: the latch refuses a verb (plumbbob [D64 (approval-latch)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d64)), the commit hook asks (plumbbob [D66 (oob-commits-surfaced)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d66)), and the only blocking Stop hook in reach is checkride's gate on the code (plumbbob [D75 (two-gates)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d75)). Surfacing (a `systemMessage` the human sees) adds no wall, but it leaves the human to ask for the card: one round trip per miss, at the measured rate about one ending in ten.
>   - *lean:* block once, guarded by `stop_hook_active`, then let the turn end. Once Wave 2 shrinks a repeat to one line, a block costs one stray paragraph at most, both failures #5 saw are fixed without a round trip, and the wall stands at the turn's ending rather than on the work, so plumbbob [D10 (pause-not-lock)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d10) and plumbbob [D13 (no-edit-guards)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d13) hold. Fall back to surfacing if the spike finds the final text unreadable at Stop, or the A/B in step 16 shows a false block.
> - <a id="q2"></a>**Q2 (reminder-shape)**: *resolved:* 2026-10-08, the lean, with the step in flight added to the card, recorded as [D17 (current-step-shown)](#d17); the question was what the reminder line says, and under which label
>   - *plain:* It is a new line plumbbob says out loud, so plumbbob [D84 (one-liner-register)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d84) governs it: a bold label, then the fact, never the move. It has to tell the human the step is still waiting on them without repeating the card, and the eval's anatomy reader has to recognize it, or every question turn scores as a stray (step 10).
>   - *lean:* reuse the driver pointer `handoff` already renders, `**Next Up**: Back to Step 2 of 3 - <title>`, which `presentation.md` already specifies and which a park's ending also closes on, so a plain question and a mixed message end on the same line; and let the full card's `expand` move say how to bring the card back, so the reminder never has to.
>
> ## Verdicts
>
> - 2026-10-08: the relay check's tier → chose block once, because it puts the card in front of the human without a round trip; dropped surfacing the miss
> - 2026-10-08: the reminder's shape → chose the driver pointer the lean proposed, and added the step in flight to the top of the card, because the human kept working out the current step from Next Up
>
> ## Steps
>
> The steps run in the four waves above, numbered straight through so each keeps its
> number for life: 1 to 4 fix what is wrong today, 5 to 9 say the pause once, 10 and 11
> measure the relay, and 12 to 16 check it. (The waves stay out of this list as headings,
> because a heading splits a numbered list, and a list that restarts at 5 fails MD029 in
> exactly the downstream repos this build is for.)
>
> 1. [ ] fix(status): count out-of-band commits the way handoff does, **done when:** with two commits since the last checkpoint, one carrying a `plumbbob plan` body line and one plain, `plumbbob status` prints `1 commit since the last checkpoint landed outside plumbbob's ledger.` and `handoff`'s Verdict counts the same one; the marker is defined once, in `src/lib/git.ts`; the comments at `src/lib/orient.ts:58`, `:79`, and `:1239` and `src/lib/git.ts:80` state both mechanisms of [D3 (say-the-mechanism)](#d3); and plumbbob D66 (oob-commits-surfaced) carries a dated revision note
>    - seam: `src/lib/git.ts`, `src/verbs/handoff.ts`, `src/verbs/status.ts`, `src/lib/orient.ts`, `src/verbs/__tests__/status.test.ts`, `docs/decisions.md`, `docs/state-and-git.md`
>    - model: sonnet (mechanical, fully specified by the issue)
>    - note: `docs/state-and-git.md` gains one sentence saying a hand-made plan commit declares itself with a `plumbbob plan` line in its body. The commit body ends `Closes #4` ([D14 (closes-in-body)](#d14)).
> 2. [ ] fix(skills): put a blank line under each detail heading, **done when:** in `skills/build/SKILL.md`, `skills/verify/SKILL.md`, `skills/plan/SKILL.md` (the cold read), and `docs/presentation.md`, every `## <n> <…>` template heading is followed by a blank line, and `pnpm check` is green
>    - seam: `skills/build/SKILL.md`, `skills/verify/SKILL.md`, `skills/plan/SKILL.md`, `docs/presentation.md`
>    - model: haiku (four blank lines)
> 3. [ ] fix(buildlog): record a detail with blank lines around its headings, **done when:** a unit test gives `logEntry` a record whose `## 1 <title>` runs straight into its body and gets back a blank line between them and before the next heading; a record that already has them comes back unchanged; a `##` line inside a fenced block is left alone; and the existing buildlog tests pass
>    - seam: `src/lib/buildlog.ts`, `src/lib/__tests__/buildlog.test.ts`
>    - model: sonnet (a small pure function with its tests spelled out)
>    - note: the record is nested two spaces under its Log list item, and the normalization has to hold in that indented form, which is the one markdownlint reads. One fix covers the step's detail and the plan's cold read, since both reach the Log through `logEntry`.
> 4. [ ] test(buildlog): lint the markdown the CLI writes into a build record, **done when:** a test drives the emitters in a fixture repo (a step checkpoint recording a detail whose headings have no blank lines, a park, and finish's Stats table), lints the resulting build-log with markdownlint-cli2 under the repo's own rules minus the `.plumbbob/**` ignore, and passes; and taking step 3's normalization out makes it fail on MD022
>    - seam: `src/lib/__tests__/record-markdown.test.ts`
>    - model: opus (a test that has to drive the real emitters)
>    - note: call markdownlint-cli2's programmatic `main` (confirm its shape in 0.23.2) rather than shelling out; if driving whole verbs proves too heavy, call the formatters they write through.
> 5. [ ] docs(presentation): show a pause once and name the step it is on, **done when:** `docs/presentation.md` states the rule of [D6 (pause-once)](#d6), shows the reminder rendered as [Q2 (reminder-shape)](#q2) settled it, replaces the sentence at `:474`, says how the card comes back, and opens the card on the step in flight per [D17 (current-step-shown)](#d17); `docs/decisions.md` records D6 and D17 as the next free numbers with their *because*, and plumbbob D83 (card-teaches-itself) carries a dated revision note; and `pnpm check` is green
>    - seam: `docs/presentation.md`, `docs/decisions.md`
>    - model: fable (the anatomy is judgment and voice)
>    - note: the card appears whole at `:69`, carrying the Readout label that stops repeating the step, and the label's rule sits at `:173`. The Your Call block appears three times (around `:88`, `:457`, and `:493`), and its `expand` move changes to say how the card comes back: those three here, the renderer in step 7, and the copies outside this file in step 8. `**Now**` is the working label for the new line; settle it here.
> 6. [ ] feat(handoff): open the pause card on the step in flight, **done when:** every decision-tier step card (the build and verify pauses, and an auto halt) opens on the line step 5 specified, naming the step in flight with its count the way Next Up counts; the Readout label no longer repeats it; handoff's tests pin both; every copy of the card in `README.md` and `docs/happy-path.md` matches; and `pnpm check` is green
>    - seam: `src/verbs/handoff.ts`, `src/verbs/__tests__/handoff.test.ts`, `README.md`, `docs/happy-path.md`
>    - model: sonnet (a renderer change pinned by tests)
>    - note: the Readout label renders at `handoff.ts:452`, and the card's copies sit at `README.md:148` and `docs/happy-path.md:201`. Under a re-sequenced build order the count follows whatever Next Up already does, so the two lines never disagree.
> 7. [ ] feat(handoff): print a one-line reminder for a pause already shown, **done when:** handoff's tests show that the first render of a pause prints the whole card; a second with nothing changed prints the reminder; a changed detail file, a changed file in the seam, or a changed check row each bring the card back; a change in `spent` alone does not; `--full` always prints the card; `checkpoint`, `revert`, and `abandon` clear the stamp; the stamp is git-excluded; and `node src/cli.ts handoff` run twice in a temp repo prints the card and then the reminder
>    - seam: `src/verbs/handoff.ts`, `src/lib/sidecar.ts`, `src/cli-core.ts`, `src/verbs/checkpoint.ts`, `src/verbs/revert.ts`, `src/verbs/abandon.ts`, `src/verbs/__tests__/handoff.test.ts`, `docs/cli-reference.md`, `docs/state-and-git.md`
>    - model: opus (stateful rendering with several edge cases)
>    - note: the stamp lives beside `STEP` as `builds/<slug>/PAUSE`, and it joins `excludeControl` (`src/lib/sidecar.ts:684`) and the exclude list in `docs/state-and-git.md`. `--plan` and `--driver` are untouched. The Your Call moves render at `handoff.ts:572` and `:599`, which is where the `expand` move takes step 5's new wording. Confirm the turn gate leaves `.check/summary.json` alone on a conversation-only turn (its `dirty` marker says it does); if it rewrites the file, the check row would flap and bring the card back on every question. A stale stamp needs nothing from `recover`, since the most it can cost is one full card.
> 8. [ ] fix(skills): answer a question at the pause without re-pasting it, **done when:** neither `skills/build/SKILL.md` nor `skills/verify/SKILL.md` tells the model to paste the whole card after a question; both say a question turn is the answer followed by `handoff`'s output, and that a request to see the pause runs `plumbbob handoff --full`; every copy of the Your Call block and of the expand prose in `README.md`, `docs/happy-path.md`, and `docs/skills-reference.md` matches what the CLI renders; and `pnpm check` is green
>    - seam: `skills/build/SKILL.md`, `skills/verify/SKILL.md`, `README.md`, `docs/happy-path.md`, `docs/skills-reference.md`
>    - model: opus (model-facing instructions, where one loose word is a behavior)
>    - note: the positional rule (build `:118`, verify `:56`) stays as it is for the first render of a pause; what changes is the expand paragraph (build `:197`, verify `:134`).
> 9. [ ] fix(turn): let a park sit beside an answer in a mixed message, **done when:** the in-flight nudge in `src/verbs/turn.ts` states both halves of [D9 (answer-then-park)](#d9); `turn.test.ts` asserts both and still asserts the tangent-only clause `df9b393` added; `skills/park/SKILL.md` carries the same carve-out; and `pnpm check` is green
>    - seam: `src/verbs/turn.ts`, `src/verbs/__tests__/turn.test.ts`, `skills/park/SKILL.md`
>    - model: sonnet (a wording change pinned by tests)
>    - note: the commit body ends `Closes #6`.
> 10. [ ] test(evals): add a contract for a question asked at the pause, **done when:** a new contract builds to the pause, asks a plain question in a second human turn, and asks to see the pause in a third; its probes report whether the second turn ends on the answer and the reminder with no card, and whether the third renders the whole card; `anatomy.ts` recognizes the reminder and the card's new opening line; the contract is registered in `contracts/index.ts`; and `pnpm eval:latched --contract c10` completes
>     - seam: `test/evals/contracts/c10-question.eval.ts`, `test/evals/contracts/index.ts`, `test/evals/helpers/anatomy.ts`
>     - model: opus (an eval that has to read the tail of a whole session's text)
>     - note: the reader checks which labels stand in which order, so until it learns step 6's opening line every decision ending scores as malformed. The driver joins every text part of a session into one string, so the tail rule in `anatomy.ts` is what separates the answer from the reminder. Each scripted turn is a fresh `claude -p` session, armed by a warmup turn. The anatomy probes stay `info`, never gating.
> 11. [ ] chore(evals): sweep the relay after the pause change, **done when:** a latched sweep of all ten contracts lands a receipt in `docs/evals/` whose turn-anatomy table includes the new contract's probes and reads beside the 2026-09-17 numbers (27/30 decision, 9/10 boundary, 44/50 nothing after the relay); `pnpm eval:report` renders it; and `pnpm check` is green
>     - seam: `docs/evals/`
>     - model: sonnet (runs the driver)
>     - note: the receipt belongs in `docs/evals/`, never `reports/` or `research/`, both of which are ignored. It records Wave 2 in real turns and fixes the relay's numbers before any hook exists; step 16 runs its own two arms at one commit, so its comparison does not lean on this one.
> 12. [ ] chore(hooks): spike what a Stop hook can read and do, **done when:** a spike report answers, with captured hook payloads as evidence: (1) whether Stop's stdin carries the turn's final text or only `transcript_path`, and whether that text is in the transcript when Stop fires, interactively and under `claude -p`; (2) which outputs Stop honors (`decision: "block"` with a `reason`, `systemMessage`, `continue: false`) and whether it accepts `additionalContext` at all; (3) what the human sees when a block lands after text has streamed, and where the block's reason shows up in the transcript; (4) how a plumbbob Stop hook and checkride's interact when both fire and when both block; (5) whether `TURN` has ticked when Stop fires under `claude -p`; and (6) that `stop_hook_active` is set on the continuation after a block
>     - seam: `.plumbbob/builds/<slug>/spike-01-stop-hook.md`
>     - model: opus (hands-on probing of the harness)
>     - note: [D16 (block-once)](#d16) is settled; if the spike finds the final text unreadable at Stop, that reopens it rather than letting the check soften quietly. The 2026-09-17 receipt records that the headless UserPromptSubmit tick lands at about session end, which would make a fresh `RELAY` look stale under [D13 (gate-on-the-turn)](#d13). Probe in a throwaway repo ([C6 (dogfood-in-a-temp-repo)](#c6)), and find where this machine wires checkride's Stop hook before testing the pair.
> 13. [ ] docs(decisions): record the relay check and its tier, **done when:** `docs/decisions.md` records the relay check as the next free number: its tier ([D16 (block-once)](#d16)), its *because* with the spike's evidence, and where it sits beside plumbbob D64 (approval-latch), D66 (oob-commits-surfaced), and D75 (two-gates); and `pnpm check` is green
>     - seam: `docs/decisions.md`
>     - model: fable (a tier decision weighed against the project's own history)
> 14. [ ] feat(handoff): remember the ending each turn has to close on, **done when:** `handoff` (card and reminder) and every transition verb record what they printed in `.plumbbob/RELAY`, with its tier and the current `TURN`, through one helper; a failed write never changes stdout or the exit code; `RELAY` is git-excluded and listed in `docs/state-and-git.md`; and tests cover `handoff`, `checkpoint`, `park`, and the failed write
>     - seam: `src/lib/sidecar.ts`, `src/lib/notice.ts`, `src/verbs/handoff.ts`, `src/verbs/checkpoint.ts`, `src/verbs/park.ts`, `src/verbs/revert.ts`, `src/verbs/abandon.ts`, `src/verbs/spike.ts`, `src/verbs/use.ts`, `src/verbs/finish.ts`, `src/verbs/order.ts`, `src/verbs/__tests__/handoff.test.ts`, `src/verbs/__tests__/checkpoint.test.ts`, `docs/state-and-git.md`
>     - model: sonnet (one helper and its callers)
>     - note: the formatters in `notice.ts` return strings and stay pure; the new helper is what prints and records, so each verb swaps its `process.stdout.write` for it. The tier field is what [D15 (tier-picks-the-match)](#d15) reads.
> 15. [ ] feat(hooks): check at a turn's end that it closed on its relay, **done when:** `hooks/hooks.json` wires Stop to a new hidden verb; its tests cover a whole relay at the end (passes), a paraphrase (fails), a turn with no text (fails), text after a pause's relay (fails), an answer followed by the reminder (passes), a boundary block followed by an answer (passes), a `park` after a `handoff` in one turn (passes on the park), a `RELAY` from an earlier turn (ignored), `stop_hook_active` set (no second block), and an unreadable transcript (exit 0, no output); a failed check blocks once ([D16 (block-once)](#d16)) with a reason naming the fix; doctor's hooks line names every wired event; and `docs/cli-reference.md` documents the verb beside `turn`
>     - seam: `src/verbs/relay.ts`, `src/verbs/__tests__/relay.test.ts`, `src/cli-core.ts`, `hooks/hooks.json`, `src/verbs/doctor.ts`, `docs/cli-reference.md`
>     - model: opus (hook machinery, where a false positive doubles the card)
>     - note: [D11 (check-in-the-cli)](#d11), [D12 (retry-reruns)](#d12), [D13 (gate-on-the-turn)](#d13), and [D15 (tier-picks-the-match)](#d15) govern it. `relay` is a working name: it reads `RELAY` the way `turn` ticks `TURN`. Normalize whitespace on both sides before comparing, and let the spike move the read from the transcript to a stdin field if one exists. `plumbbob init` links the package as a plugin, so `hooks.json` covers both install paths.
> 16. [ ] chore(evals): measure the relay check with and without the hook, **done when:** two sweeps at one commit, one with the Stop hook and one with it removed, land in one receipt in `docs/evals/`, compared on every ending-renders-whole probe, nothing after the relay, and the recommendation as the last text, with a count of the blocks the hook issued and how many fell on an ending that was already whole; the decision from step 13 cites the receipt; and `pnpm check` is green
>     - seam: `test/evals/helpers/plugin.ts`, `docs/evals/`, `docs/decisions.md`
>     - model: sonnet (runs the driver and reads the tables)
>     - note: the "without" arm loads a copy of the plugin with the Stop entry dropped from `hooks.json`, so the product grows no switch. A false block in this sweep reopens [D16 (block-once)](#d16). The commit body ends `Closes #5`.
>
> ## Issue map
>
> | Issue | What it asked for | Lands in | Closes at |
> | ----- | ----------------- | -------- | --------- |
> | #4 | one count for `status` and `handoff` | step 1 | step 1 |
> | #5, side note | a blank line in the detail template | steps 2 to 4 | with #5 |
> | #5 | a Stop hook that checks the relay | steps 10 to 16 | step 16 |
> | #6 | the pause shown once, plain answers, a park beside the answer | steps 5 to 9 | step 9 |
> | settling Q2 | the step in flight named on the card | steps 5 and 6 | with #6 |
>
> ## Noticed, not in this build
>
> - The turn hook's nudge has the model capture a chat tangent with `plumbbob park`
>   directly, while the park skill shows the composed line and waits for the human's
>   approval first. The two disagree about whether a tangent that arrives as chat needs
>   approval.
> - No skill tells the model how to land a plan edit between steps. After step 1, a
>   hand-made plan commit that carries the marker drops out of the count and one that
>   does not still counts; teaching harvest and refine to write the marker would close
>   the gap.
> - The driver skills already say one command is the whole turn, so the relay check can
>   extend to driver endings once step 16 shows it makes no false blocks.
> - Cursor has no plumbbob plugin yet; when it gets one, the Stop check needs a Cursor
>   equivalent.
