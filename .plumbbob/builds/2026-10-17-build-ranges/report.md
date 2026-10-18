# Report: Build ranges

**Status:** done. 13 of 13 steps checkpointed between 2026-10-17 and 2026-10-18, the gate
green at every landing; one step (3) landed a hair off, with `cspell.json` outside its seam
for the lexicon word `steplist`. The build was driven by its own `## Build ranges` section,
five commands in all: `1`, `2-4`, `5`, `6-10`, and `11-13`.

The `## Log` in `build-log.md` is the timeline. This is what the log does not carry: what
the build turned out to be, why the calls fell the way they did, and what is left.

## What shipped

**A background job's notice is no longer a human turn.** The step 1 spike captured 29
prompts across five probe sessions, on Claude Code 2.1.283 and again on 2.1.302 after the
CLI updated mid-spike. Nothing in the payload marks a notice, but every one opened on
`<task-notification>` or `<agent-message `, and every one ticked `TURN`, cleared the
grant, and drew the nudge. The prompt hook now skips all three for a prompt that opens on
either frame, and clears `RELAY` when the notice starts a turn of its own. A notice the
harness folds into a running turn shares that turn's `prompt_id`, so the hook keeps the
last id it saw and leaves `RELAY` alone for one, which is the guard the spike found
[D15 (notice-clears-relay)](intent.md#d15) needed.

**A range can list its steps, and it lands only those.** `src/lib/steplist.ts` is the one
grammar the hook, the latch, `build`, `status --invoked`, and the section's parser all
read. `/plumbbob:build 20, 5-9` mints `steps 5-9,20`, a plain `2-4` grants exactly 2
through 4 (the old `range 4` would also have landed step 1), and a range that does not
parse mints nothing, even beside `--auto`. The latch still honors an old `range M`, because
this repo's own hook is the installed plugin's until a release.

**The plan says where the build stops, and the card reads it back.** Step 5 fixed every
string in `docs/presentation.md` before any code rendered one. The template ships a
`## Build ranges` section whose placeholder reads as scaffold, so a fresh dashboard shows
nothing, and the plan skill now cuts the ranges with the steps, presents them at the plan
pause, and reads them in its cold read. A live headless `/plumbbob:plan` on a three-step
spec, with this checkout loaded as the plugin, wrote a bare `1` for the spec's open call
and `2-3` for the rest, and `status` read every step in one range with no drift row. The
card names the range to type beneath Next Up (`· range 2 of 2: /plumbbob:build 3-4`), the
bracket's bold model is the range's, the boundary where a range's last step lands carries
a `**Stop**` part saying why, the dashboard lists the ranges with `✓`, `▸`, and a `⚠` row
for any the plan outgrew, and `recover` names a range that points at a step the plan lacks.

**`--auto` halts where the plan reserves a call.** Under `--auto`, a step the ranges name
as a bare range is built to its pause and held there, and `plumbbob build` says so as it
enters the step. Step, refine, harvest, and order keep the section true as the plan
changes, `/plumbbob:refine ranges` re-cuts it whole, and the docs, the README, and the
site describe it from strings this checkout's CLI rendered.

## Decisions and why

Eighteen decisions settled in `intent.md`, ten at plan time and eight at the refine that
closed the plan pause's open questions. These shaped the outcome.

- [D4 (advice-not-grant)](intent.md#d4): a range grants nothing and the human still types
  it, because a line the model can edit would be a grant the model could forge.
- [D5 (one-grammar)](intent.md#d5): the section and the hook read one parser, so the card
  can never suggest a command the hook reads another way.
- [D6 (state-is-derived)](intent.md#d6): a range's progress comes from its steps' boxes and
  is never stored, because the boxes are already the truth.
- [D7 (plan-places-stops)](intent.md#d7): the plan decides where ranges stop and the CLI
  never does, because where a call falls is judgment; the three hand-written sections all
  cut at a decision, a review, or a thing only the human can do.
- [D10 (drift-reported)](intent.md#d10): a range the plan outgrew is reported and never
  rewritten, because a suggested command that halts early is the failure the build exists
  to remove.
- [D11 (notice-not-turn)](intent.md#d11) and [D15 (notice-clears-relay)](intent.md#d15):
  two ranges lost their grant to a Stryker run's notice the week before; the fix keys on
  the prefix the spike found, and the absorbed-notice guard was settled at step 2's pause.
- [D12 (step-list-grants)](intent.md#d12) and [D16 (list-reading)](intent.md#d16): the set
  is fixed by what the human typed, so reordering the plan cannot widen a grant, and a set
  has no order of its own, so the build order supplies it.
- [D14 (auto-and-stops)](intent.md#d14): a decision cannot be made for the human by a flag
  typed for speed, while a review can wait for the end of the run.
- [D17 (range-model)](intent.md#d17): the bold model is the `/model` the human picks before
  typing the range, and a range's first step is often not its hardest.
- [D18 (scaffold-range)](intent.md#d18): the template's placeholder is neither a range nor a
  report, the rule D77 (placeholder-uncounted) set for the scaffolded question.

They were promoted into `docs/decisions.md` as plumbbob D90 (notice-not-turn), D91
(step-list-grants), D92 (build-ranges), D93 (range-on-the-card), and D94 (auto-and-stops),
with dated revision notes on D85 (range-top-lands) and D86 (build-order).

## Parked & harvested

One item was parked, at step 3, and harvested at the step 4 boundary as a tangent:
`abandon`'s refusal says a step is "past the range you granted" when a list grant simply
does not name it. The refusal is right; only the wording is off, on a rare path.

## Final status

Done, with one caveat on what this session could see. The `plumbbob` on this session's
PATH is the installed 0.12.1 plugin, so the cards it printed at this build's own
boundaries carry none of the range lines, and the notice fix and the list grants did not
protect this build's own ranges ([C8 (old-grants-land)](intent.md#c8)). Every new line was
checked through `node src/cli.ts` in a throwaway repo instead
([C6 (temp-repo-dogfood)](intent.md#c6)), and the Frame's "this build's own card names
this build's own ranges" holds once a release carries it. Step 11's live plan run spent one
headless Opus session. No version bump and no CHANGELOG entry, per
[C5 (no-release)](intent.md#c5).

## Deferred tangents

- **Reword `abandon`'s refusal for a list grant** (`src/verbs/abandon.ts:109`), the one
  harvested item.
- **Give `order`'s ending an advisory when the new sequence breaks a range.** Step 12 has
  the order skill write one line ahead of the CLI's ending, which bends the anatomy's
  nothing-around-it rule; the verb saying it itself would not.
- **A stop's markdown link prints raw on the dashboard.** The live plan run wrote
  `[Q1 (times-cap)](#q1)` into a stop, and `status` shows the brackets.
- **`looks good` could start range 1** when the plan declares one; today the human types it
  after the plan commit.
- **`finish`'s report could tabulate the ranges**: how long each ran, and where one stopped
  early.
- **A harvest that knew the ranges could propose the leans** checkride wrote ahead for each
  call a range would otherwise stop to ask.
- **An eval contract could hold `/plumbbob:plan`** to a section that parses and names every
  step once; step 11's single live run is the only measurement so far.

## Checkpoints

- baseline 4549714517faea8503c0f28c9efc59edc3d9cb67
- plan 2c2ecd6be4dbf775dd7cac6c9e986002beea738b
- step 1 d36bd8401385b8b1f7379197e915864a40139480
- step 2 18c85b450977567dc861ed70c2dc1b4b1e4eb943
- step 3 d860fd4cc914439aa85a6f36fd918c42631e944e
- step 4 759eff15ddddf8f335685ff7c37e6fac4e21a2e2
- step 5 65c15b2c91567c2ef19002312bbc4725869cb3c0
- step 6 23c55f43deead09b3529bc1901b325970ab4598f
- step 7 7d523ae9253a085bb710042e7396ac87a8077897
- step 8 5c4e9ed337fe4538164b6d1fbea03a9fe9b7710f
- step 9 5b283b5d7722e2b9ffcfe4f2e96939ca20c1b127
- step 10 89e656c4b4f8fb6842a7f87239a4e657209ac830
- step 11 735c90ebfa2eb5e33d0948d765960f4d76704464
- step 12 df7fb67b99959b5e27ccb26e9bcd8bb96be501b4
- step 13 340417c0ba8c6bbbf18f9b7c8ef90e8bc77c5abe

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
| ---- | ---------- | -------------- | ------- | ---------- |
| 1 | 0 | 0 | 0 | 33m |
| 2 | 0 | 0 | 0 | 16m |
| 3 | 0 | 1 | 0 | 22m |
| 4 | 0 | 0 | 0 | 10m |
| 5 | 0 | 0 | 0 | 96m |
| 6 | 0 | 0 | 0 | 9m |
| 7 | 0 | 0 | 0 | 8m |
| 8 | 0 | 0 | 0 | 8m |
| 9 | 0 | 0 | 0 | 11m |
| 10 | 0 | 0 | 0 | 7m |
| 11 | 0 | 0 | 0 | 18m |
| 12 | 0 | 0 | 0 | 7m |
| 13 | 0 | 0 | 0 | 13m |
| **total** | 0 | 1 | 0 | 258m |
