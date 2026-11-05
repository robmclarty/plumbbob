# The live demo: run of show

This folder is the playbook for a live, eighty-minute demo of plumbbob (ninety is the hard
stop). It builds **sift, a list that forgets**: a small TypeScript command-line tool where
every item carries a shelf life, bare `sift` prints what is still alive, and the rest falls
off. The room watches one plan get written, approved, built in three ranges, bumped off
plumb by a duration the plan never covered, and brought back true, with the why of every
turn left beside the code. The thesis is one sentence, and it goes on the board at minute
zero: **the plan is a file you keep true; the first plan is the easy part.**

The five files split the work. This one holds the versions, the screens, the run of show,
the lines, and the fallbacks. [`prompts.md`](prompts.md) is everything Rob types, numbered
`P1` to `P20`, each with the first line the screen should show back.
[`sift-spec.md`](sift-spec.md) is the spec the vibing should land on, and
[`sift-plan.md`](sift-plan.md) is the plan the model should converge on, before the surprise
and after it. [`rehearsal.md`](rehearsal.md) is the traps, the reset, the snapshots, the
recordings, and the tables to fill in. A reader who wants the same material as a course, at
a desk, has [`docs/learn/`](../docs/learn/README.md); the demo and the course share one
artifact, so a lesson's card is the demo's card.

## Pinned versions

Nothing in the demo floats. Every version below is checked the day before, and no release
of checkride or plumbbob ships inside the 48 hours before the room fills, because pnpm's
`minimumReleaseAge` is 2880 minutes on this machine and a fresh package is invisible to
`pnpm dlx` until it clears.

| What | Version | How it is held |
| --- | --- | --- |
| plumbbob | 0.13.10 | the marketplace plugin, updated the day before; `! plumbbob --version` prints it at `B2` |
| checkride | 0.19.3 | pinned in the `dlx` line, `pnpm dlx checkride@0.19.3 init`; published 2026-11-03T03:32Z, so it clears the 48 h window at 19:32 PST on 2026-11-04 |
| Node | v24.15.0 | `node -v` in rehearsal |
| pnpm | 11.1.2 | `pnpm -v` in rehearsal |
| Claude Code | 2.1.316 | the host; the Stop hold needs 2.1.163 or later |
| TypeScript, vitest | 7.0.2, 5.0.3 | the scaffold's own exact pins; nothing to type |

Two versions of checkride are in play and both run: the scaffold's `pnpm check` is 0.19.3, and
plumbbob's gate runs the 0.12.5 it bundles, in process, against the config 0.19.3 wrote.
`.plumbbob/settings.json` stays `{}` for the demo; the trap list in `rehearsal.md` says
when to write `{"check": "pnpm check"}` instead.

## The three screens

One plain terminal, split in two, and an editor. Not Zed's terminal and not its agent
panel: Zed folds reply text that comes before a tool call, and half the demo is reply text.

**Pane 1 is `claude`**, opened in `~/demo/sift` at `B2` and never closed. Every skill is
typed here, and every hand-typed verb goes through the `!` prefix, because `plumbbob` is on
PATH only inside the session (a marketplace install has no terminal binary).

**Pane 2 is a shell**, also in `~/demo/sift`, with the alias and the two paths exported
before the room fills:

```sh
cd ~/demo/sift
alias sift='node ~/demo/sift/dist/bin.js'
export SIFT_FILE=~/demo/sift.json
export SIFT_ARCHIVE=~/demo/sift.archive.json
```

It runs `git log --oneline` on a loop while a range lands, so the commits arrive in front
of the room, and it is where `sift` itself is typed at `B9` and `B14`.

**The editor** opens on the build folder once `B4` creates it:
`.plumbbob/builds/2026-11-NN-sift-a-list-that-forgets/intent.md` and `build-log.md`
side by side. The two hand edits (`B6` and `B13`) happen here, in front of the room, and
`B15` ends on this pane with Decisions and the Log in view.

Font at a size the back row reads; the cards are tables, and a wrapped table is a wall.

## Run of show

Eighty minutes designed, ninety hard stop. The time column is the beat's start. The
"Rob types" column names the prompt in [`prompts.md`](prompts.md) and the words that
matter; the screen column names the first line to look for; the model column is the
`/model` the beat runs on, with the effort settings beside each in `rehearsal.md`.

| Time | Beat | Rob types | Screen | Proves | Model |
| --- | --- | --- | --- | --- | --- |
| 0:00 | `B0` Thesis | nothing | one sentence on the board: the plan is a file you keep true | the talk is about the plan at minute forty, not the first one | |
| 0:04 | `B1` Scaffold | `P1`: `git init -b main`, the pinned `dlx` init, `pnpm install --prefer-offline`, `pnpm check`, the `.plumbbob/**` markdownlint ignore, `{}` into `.plumbbob/settings.json`, one commit | `checkride init: generated a flat project (32 files)`, nine `✔` lines, `✔ all checks passed in ~4500ms`, one commit, an empty `git status --short` | exit 0 is the definition of done the pause will measure | |
| 0:08 | `B2` Open | `claude`, trust the folder, `P2`: `/plumbbob:doctor`, `! plumbbob --version`, `/model opus` | the `hooks present` line naming all four events, `latch: dormant`, `plumbbob 0.13.10` | the plugin is hooks plus a CLI; nothing lives in the model | opus |
| 0:10 | `B3` Vibe the spec | `P3`: the conversation, ending in "write it to docs/spec.md"; `P4`: `! pnpm check --only docs,spell,links`, the spec commit, `! git status --short` | `docs/spec.md` on screen; `✔ all checks passed`; one commit; nothing untracked | deciding happens in a file, before any code | opus |
| 0:16 | `B4` Plan | `P5`: `/plumbbob:plan docs/spec.md` | `**Session**: started "sift: a list that forgets"`, the whole intent, the plan card with the two-question table and `**Range 1**` beneath Next Up | the plan is a file; the card ends the turn | opus |
| 0:21 | `B5` Refine | `P6`: `/plumbbob:refine` | the holes it found appended as open questions, then the questions table `status --questions` prints | the plan is attacked before anything leans on it | opus |
| 0:25 | `B6` Settle and edit by hand | `P7`: `defer Q2 until …`; `P8`: `yes to all leans`; `P9`: the editor, 7 days to 5; `P10`: `looks good`, then `/plumbbob:status` | `**Deferred**: Q2 (fall-off-fate) until …`; `D3` appended; the 7 becomes a 5 in the editor and the because is typed by hand; `**Plan**: committed`; the dashboard with three ranges and `open questions 1 deferred` | a question can wait for the work; one reply settles the rest; the plan is a text file | opus |
| 0:30 | `B7` Range 1 | `P11`: `/model haiku`, `/plumbbob:run`; `P12`: `expand 1`, `show the pause`, `looks good` | the header with `grant: none, as a bare range builds to its pause`; the pause card; `**Checkpoint**: Step 1 complete` | a step lands only when you say so, and a bare range stops before it lands | haiku |
| 0:36 | `B8` Range 2 | `P13`: `/model sonnet`, `/plumbbob:run`; pane 2 loops `git log --oneline` | the header with `grant: steps 2-5`; four commits arrive in pane 2; the stop card with `**Range 2** landed` in its Stop row | one word minted the grant for exactly four steps, from the plan | sonnet |
| 0:50 | `B9` Try it, meet 2w | `P14` in pane 2: `pnpm build`, three `sift add`, bare `sift`, then `--for 2w` | three lines with days left, then `sift: a shelf life is written in days, like 3d (got "2w")`, exit 1 | the stop is where a human looks, and the human found what the plan never covered | |
| 0:53 | `B10` Park, record | `P15`: `/plumbbob:park 2w is refused: …`, `ok`, `looks good` | `**Parked**: 2w is refused by the parser, and weeks are how I think about passports (tangent)`, the composed line with the tag on its tail; `**Stop**: **Range 2** recorded (…)`; a Parked row with one open | capture, do not chase; the card's record and the new park are separate | sonnet |
| 0:56 | `B11` Harvest | `P16`: `/plumbbob:harvest`, `make Pn a blocker` if the lean says tangent, `looks good`, `/plumbbob:status` | the lean table; a Decision slugged `weeks-are-days` at the next free D, and step 8, appended; `**Build order**: 8, 6, 7`; `**Build ranges**: range 3 of 3 re-cut (steps 8,6-7)`; `**Recorded**`; the dashboard's `build order  8, 6, 7` | the surprise is now a step with a number, a reason, and a place in a range still to come | sonnet |
| 1:01 | `B12` Sharpen | `P17`: `/plumbbob:step`, `yes` | the before and after of step 8 | the next step is sharpened the moment before it is built | sonnet |
| 1:03 | `B13` Mid-build hand edit | `P18`: the editor, `Q2` resolved and a Decision slugged `archive-not-delete` inserted after `D3`; `! plumbbob status --questions` | `plumbbob: no open questions in this plan` | a human overrules the lean with a pen | |
| 1:05 | `B14` Build, then run | `P19`: `/plumbbob:build`, then `/plumbbob:run` at step 8's pause; pane 2: `SIFT_NOW=… sift`, `cat $SIFT_ARCHIVE` | step 8's pause card; the run lands 8, then 6, then 7; range 3's stop card; pane 2 prints one line and then the archive with the library book and the plants in it | the re-cut range ran as re-cut, and the hand edit shows up as a file | sonnet |
| 1:15 | `B15` Finish, the record | `P20`: `/plumbbob:finish`; pane 2: `git log --oneline`; the editor on Decisions and the Log | `**Session**: finished`; twelve commits; the last three Decisions with three origins | the history of why is beside the code, written by the verbs | sonnet |
| 1:18 | `B16` Where it sits | one slide, then keyframes Move 1 live in pane 2: `cd ~/Projects/plumbbob/code/plumbbob`, shorten the title `mid-step park lines survive a revert` in `test/e2e/build-loop.test.ts`, `pnpm exec keyframes check --strict`, `git checkout test/e2e/build-loop.test.ts` | the order of [the sits page](../docs/learn/10-where-plumbbob-sits.md): storyboard, keyframes, plumbbob, runciter, fascicle and penfield, checkride, atis; then `broken-pointer`, `1 error`, exit 1, and green after the checkout | plumbbob is the middle of a line of hand-offs, each signed by a person | |
| 1:20 | Q&A | | | | |

The table keys on places in the plan, never on a number the model picks. The first run is
"the range holding step 1", whatever the plan numbered it. The second stop is "range 2's
stop", and the surprise is found there by Rob's own hand, which is the honest version of an
unknown unknown: the stop's call is "add three things you own", and the fourth thing he
owns is a passport. The park's handle is read off the lean table at `B11`; it is `P` plus
its place in the park list, counting everything the run parked before it, so it is `P3`
only if the run parked two. The Decisions after `D3` are numbered the same way: the harvest
at `B11` takes the next free D, the pen at `B13` takes the one after, and each is known by
its slug.

Two moves in that table deserve a word, because they are the thesis made visible. At `B14`
`/plumbbob:build` enters step 8 and stops at its pause; `/plumbbob:run` typed there is that
pause's `looks good`, and the run carries on through steps 6 and 7 because the harvest
re-cut range 3 to `8,6-7` ([D109 (ranges-follow-the-order)](../docs/decisions.md#d109)).
At `B6` and `B13` Rob edits `intent.md` in the editor pane with the session live, and the
CLI reads the edit back a second later; nothing about the file is the model's.

## The lines

One sentence per beat, rehearsed so it comes out the same way twice. Each is said while the
screen shows the thing it names, not before.

| Beat | Say |
| --- | --- |
| `B0` | The first plan is the easy part; every tool makes one. What I care about is the plan at minute forty, after the build has taught you something. |
| `B4` | Nothing here is code. The model wrote a plan and stopped, because its turn ends on the card and the card is the only thing it can end on. |
| `B6` | The plan is a text file; nothing about it is the model's. |
| `B7` | The readout is measured. The model wrote three rows; the CLI wrote the rest from git and the gate. |
| `B8` | I typed one word and it minted the grant for exactly these four steps, from the plan, not from the model's opinion of the plan. |
| `B9` | This is the unknown unknown. Not a bug: a thing none of us thought of, found at the one place the plan said a human should look. |
| `B11` | It is now step 8, with a Decision that says why, dated, and a range that re-cut itself to build it first. The plan is still plumb. |
| `B13` | The lean said delete. I disagree. It is a text file. |
| `B15` | Three decisions, three origins: the card, my pen, a harvest. A teammate reading this next month gets the why without me. |

## Fallbacks

**Directory snapshots, not git tags.** After each beat in rehearsal, copy the whole
folder, control files included:

```sh
cp -R ~/demo/sift ~/demo/snap/B7
cp ~/demo/sift.json ~/demo/snap/B7.sift.json 2>/dev/null || true
```

A tag cannot do this job. The plan commit and each checkpoint land one commit behind the
control state they describe, since `checkpoint` sweeps its own bookkeeping into the next
commit ([D37 (bookkeeping-sweep)](../docs/decisions.md#d37)), and `recover --fix` cannot
rebuild a cursor once `finish` has cleared it. A copied folder carries `STATE`, `TURN`,
`TICK`, the grant, and the build folder exactly as they stood. Restoring is the reverse
copy and then `! plumbbob status` in pane 1 to prove the cursor reads; the procedure is in
[`rehearsal.md`](rehearsal.md#the-snapshot-procedure).

**Recordings.** Every beat from the last full rehearsal is recorded to
`~/demo/recordings/beat-NN.mov`, outside the repo. The three that matter most are `B8`
(the long one), `B11` (the harvest), and `B14` (the re-cut run), because each is a model
turn that can go long or go wrong, and a recording of a card is a card.

**The paste-in plan.** If the live plan is malformed past a cheap direction at the card,
the first fence of [`sift-plan.md`](sift-plan.md) is pasted over `intent.md` whole, the
dates fixed, and `! plumbbob status` proves it parses. The second fence is the same
fallback for the plan after the harvest. A plan that is merely different (six steps, a
different scope word) is not malformed: the beats key on the range holding step 1 and on
range 2's stop, and both survive a different plan.

**The switch rule.** A beat that has not produced its expected first line after twice its
budget is abandoned. Say one sentence to the room ("that is a model turn going long, and
this is the same state from this morning"), restore this beat's snapshot, and go on to the
next beat. Never debug in front of the room; a halt the gate caused is narrated as the gate
working, settled on its pause card, and then the switch rule applies.

## The cut list

If the clock reads 0:50 and range 2 has not landed, switch to the `B8` snapshot and run the
try-it beat from there. If the clock reads 0:50 and range 2 has landed, cut in this order:

1. `B13`, the mid-build hand edit, folds into `B10`'s reply as direction: `Q2: archive to a
   second file, and add the Decision`, and the skill writes it. The line for `B13` moves to
   that reply.
2. `B12`, the sharpen, goes next; step 8 builds as the harvest wrote it.
3. `B16` keeps its two minutes; Q&A absorbs whatever is left.

Nothing before `B9` is cut, because the surprise needs range 2 landed and tried, and
nothing after `B14` is cut, because the finish is the proof.
