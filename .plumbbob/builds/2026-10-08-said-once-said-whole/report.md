# Report: Said once, said whole

**Status:** done. 17 of 17 steps checkpointed between 2026-10-16 and 2026-10-17, the
gate green at every landing. The plan was cut at 16 steps; the 17th came out of the
decision the plan itself scheduled after step 16, when the A/B showed the relay check
holding cards that were already whole. The commits carry `Closes #4` (step 1),
`Closes #6` (step 9), and `Closes #5` (step 16), so all three issues close when the
branch reaches `main`.

The `## Log` in `build-log.md` is the timeline. This is what the log does not carry:
what the build turned out to be, why the calls fell the way they did, and what is left.

## What shipped

**One count.** `status` and `handoff` now drop plumbbob's own plan commits from the
out-of-band count the same way, through one `PLAN_COMMIT_MARKER` in `src/lib/git.ts`,
so a hand-made `chore(plan)` commit no longer reads as going around the process on
one surface and not the other (#4).

**The detail file lints wherever it lands.** The four detail templates put a blank line
under each heading, `handoff` rewrites `.plumbbob/detail.md` with blank lines around
every heading at a pause, and `generated-markdown.test.ts` lints the file a pause
leaves on disk under consumer-strict rules, so MD022 can't surface downstream first
again (#5's side note).

**A pause is said once.** The card opens on the step in flight
(`**Now**: Step 2 of 3 - <title>`), and a second render of a pause nothing has changed
prints one line, `**Next Up**: Back to Step 2 of 3 - <title>`, so a question at the
pause is answered above a reminder instead of above forty lines the human has already
read. `--full` brings the card back. A `PAUSE` stamp hashes everything a later turn
could change except `spent`, and `checkpoint`, `revert`, and `abandon` clear it. The
build and verify skills answer a question above `handoff`'s output, and the turn hook's
nudge lets a park sit after an answer in a mixed message (#6).

**The relay is measured, and then checked.** Contract c10 measures a question at the
pause, and the 2026-10-17 sweep put the relay at 31 of 35 decision endings whole
before any hook existed. A spike on Claude Code 2.1.283 settled what a `Stop` hook can
read: the final message arrives on stdin as `last_assistant_message` while the
transcript still lags it, `TURN` has ticked by the time `Stop` fires, and
`additionalContext` holds a turn open without labeling the hold an error. Every verb
that prints an ending now records it in `.plumbbob/RELAY` through one helper,
`printEnding`, with its tier, its render, the command that reprints a pause, and the
`TURN`. `plumbbob relay`, wired to `Stop`, holds a turn once when it printed a pause
or a boundary and did not carry it (#5).

**The check compares what matters.** The A/B ran both arms at one commit: 46 of 50
contract passes without the hook, 47 of 50 with it. The hook held 8 turns. Three were
real misses that came back whole on the retry; five were relays with every part present
and one line changed, which the line-for-line comparison held anyway, putting the card
on screen twice. Step 17 replaced that comparison: the check now reads a relay by its
labeled parts in order, allows no paragraph inside a part that the block does not have
there, and compares only the Readout table and the Verdict line exactly. Replayed
against the eight real holds, it lets the five through and still holds the three, and
it holds a relay that keeps every part but turns a red check green.

## Decisions and why

Nineteen decisions settled in `intent.md`, eighteen at plan time and one at the step 16
boundary. These shaped the outcome.

- [D1 (one-marker)](intent.md#d1): the marker lives once, in `git.ts`, because two
  surfaces measuring one quantity was the whole of #4.
- [D4 (cli-owns-the-record)](intent.md#d4): `handoff` normalizes the detail file on disk,
  on top of the template fix, because the gate lints that file before `checkpoint`
  clears it, and a model won't always copy a template exactly. The plan first aimed this
  at the build-log, which never receives a template heading; the refine on 2026-10-16
  moved it to the file that actually fails.
- [D6 (pause-once)](intent.md#d6) and [D7 (cli-picks-the-form)](intent.md#d7): the CLI
  chooses card or reminder from a stamp, so every pause turn still ends on `handoff`'s
  output and the relay check stays one comparison.
- [D8 (stamp-skips-spent)](intent.md#d8): `spent` counts turns, so a stamp that hashed it
  would make every render look new.
- [D10 (verbs-write-relay)](intent.md#d10): the verb that printed an ending records it,
  because it knows what it printed, and a turn that runs `handoff` and then `park` has to
  be judged by its last ending.
- [D13 (gate-on-the-turn)](intent.md#d13): the check runs only on a `RELAY` written in the
  current turn, never on `STEP`, which `checkpoint` clears before its block is relayed.
- [D15 (tier-picks-the-match)](intent.md#d15): a decision ending has to close the turn, a
  boundary only has to appear in it, and a driver ending is recorded so that the last
  ending wins.
- [D16 (block-once)](intent.md#d16): hold once rather than surface the miss, so the human
  gets the card without a round trip. The spike changed two of its mechanics before step
  15 built it: the once is counted per `TURN` in plumbbob's own record, because
  `stop_hook_active` is shared with checkride's gate, and the hold speaks through
  `additionalContext`, because a missed relay is the model's slip, not an error the human
  has to act on.
- [D17 (current-step-shown)](intent.md#d17): the card names the step in flight, because the
  human kept working it out from Next Up.
- [D19 (facts-exact)](intent.md#d19): parts and order, with the measured facts exact.
  Line for line held five whole relays; parts and order alone could not see a laundered
  check result.

Three of these were promoted into `docs/decisions.md` as plumbbob D87 (pause-once),
D88 (current-step-shown), and D89 (block-once), and D89 carries the A/B's finding and the
2026-10-17 revision.

## Parked & harvested

Eleven items were parked and every one was harvested as a tangent; none was a blocker or
a pivot signal.

- Resolved inside the build: the `handoff` row in `docs/cli-reference.md` (step 7), and the
  parts lists in the skills, the glossary, and both site pages (step 8).
- Resolved at the step 17 boundary: the README, `docs/install.md`, `docs/architecture.md`,
  and the home page counted three hooks, and now count four.
- Deferred: the other eight, listed below.

One correction belongs here too. Step 16's commit body (`a292bc9a9`) misread two of the
three real misses: c8 run 1 put a paragraph inside the plan card and c8 run 4 wrote two
after it, neither "never relayed", and c7 run 2's retry came back whole rather than cut
short. Step 17 corrected D89 in place and says so in its commit body.

## Final status

Done. Issues #4, #5, and #6 close on push. The relay check ships with the hybrid
comparison, proven against the A/B's own eight holds, but no live sweep has measured it
yet: the receipt at `docs/evals/2026-10-17-relay.md` measured the line-for-line version.
No version bump and no CHANGELOG entry, per [C5 (no-release)](intent.md#c5).

## Deferred tangents

- **Measure the hybrid live.** A latched sweep with the step 17 check would show its real
  hold rate; the replay only proves the eight known cases.
- **Fix `report.ts`'s Relay holds paragraph** before that sweep: it says the check compares
  line for line. Point it at D89 rather than describing the comparison, so re-rendering
  the 2026-10-17 receipt stays true.
- **Pin an empty MCP config in the eval driver.** The account's claude.ai connector notice
  still lands after the relay in c7 and c8 runs, in both arms.
- **Correct the headless-tick note** in `driver.ts` and the receipt footnote: on 2.1.283
  `TURN` ticks before the first tool call, not at session end.
- **Widen the in-flight nudge** for a plain question at a pause; c10's reminder probe reads
  0 of 5 because a fresh session has no prose telling it to end on `handoff`. The likeliest
  of these to become a step.
- **Record `recover` and `agent run` in `RELAY`**, so a turn that ends on either after a
  pause is judged by what it printed last.
- **Say in `docs/presentation.md`** that a `Stop` hook now checks the positional rule, citing
  D89 (block-once); the comparison it would describe is settled now.
- **`src/lib/orient.ts`'s comment** still says the Readout label carries the step's
  identity; the Now line does.
- **Sort contract ids numerically in `report.ts`**, and give c10 a method footnote.

## Checkpoints

- baseline 391216398202b772f82d3236f41984a86c524e7f
- plan c5a217593aac56376463aca40a36dba818da1d10
- step 1 4ab52c8205c79571a5e9feec1a366ced71334886
- step 2 31f53352979166246d66639b2c1e1d039a7d5bfb
- step 3 83e7f8c3bc200cbe1e544d9f75e54849636c3d13
- step 4 8b7b4e4d977608e1a118c587745e8cdd0a87203b
- step 5 1ea534458f0ada48bf8cf0911dd6e5c3df43b787
- step 6 156f312ab857785e5e4c92163b09157fdbbe1354
- step 7 9a2dcebc6e2192c5d0d981630a3108da08136743
- step 8 11cb5999e1f8a6f1e8f8d7e81cb2cced5ba587b6
- step 9 ed5629d7b573c908886b1ce98198f603a03cf57a
- step 10 db9e032ef7f0665454f92046e6ebe40c810b0286
- step 11 0f9754ec10c977b517ad4f6d10ca1f827a8c19d8
- step 12 ffcc0d214a83a8bea9b23b917446c4a4335f64bd
- step 13 9cb1e2ef2c2797db49abdae3702837f719bdd7f9
- step 14 a1b57d9500bdf73fb3647c495c6cf2260c3efea7
- step 15 c6728682734ef2a08246252b6e93f407e205d5db
- step 16 a292bc9a95224cd32e139b42ed12c5d262840e34
- step 17 3491cdfa7b2668cbbb6b5a36bf1f11d6530176c9

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
| ---- | ---------- | -------------- | ------- | ---------- |
| 1 | 0 | 0 | 0 | 5m |
| 2 | 0 | 0 | 0 | 4m |
| 3 | 0 | 0 | 0 | 8m |
| 4 | 0 | 0 | 0 | 22m |
| 5 | 0 | 0 | 0 | 29m |
| 6 | 0 | 0 | 0 | 7m |
| 7 | 0 | 0 | 0 | 11m |
| 8 | 0 | 0 | 0 | 9m |
| 9 | 0 | 0 | 0 | 5m |
| 10 | 0 | 1 | 0 | 19m |
| 11 | 0 | 0 | 0 | 49m |
| 12 | 0 | 0 | 0 | 40m |
| 13 | 0 | 0 | 0 | 38m |
| 14 | 0 | 0 | 0 | 531m |
| 15 | 1 | 1 | 0 | 21m |
| 16 | 0 | 1 | 0 | — |
| 17 | 0 | 0 | 0 | 19m |
| **total** | 1 | 3 | 0 | 817m |
