# Everything Rob types

Twenty prompts, `P1` to `P20`, in the order the run of show in [`README.md`](README.md)
fires them. A `text` block is typed into the `claude` pane; an `sh` block is typed into
pane 2, or into pane 1 behind the `!` prefix where the line says so. Under each block is
the first line the screen should show back. When that line does not appear inside twice
the beat's budget, the switch rule in the README applies.

Two conventions run through the file. A skill is always typed in its namespaced form,
`/plumbbob:plan` and never `/plan`, because `plan`, `run`, `status`, `verify`, and `doctor`
are Claude Code built-ins and the flat name is theirs. And `looks good` always gets a
message of its own, with nothing beside it, because the first plan commit lands before the
turn ledger has ever ticked and the latch is guidance there; one clean message is what the
skill reads cleanly.

## P1: the scaffold (`B1`)

Pane 2, before `claude` is open. `init.defaultBranch` is unset on this machine, so `-b main`
keeps git's branch hint off the screen. The `{}` settings file rides the scaffold commit so
it never shows up as a stray on step 1's seam row. The `sed` line adds `.plumbbob/**` to the
scaffold's markdownlint ignores: that config globs hidden folders, PlumbBob's own templates
trip rules it keeps on, and without the line the first `plumbbob check` after `start` is red
on the `docs` slot (the 2026-11-04 dry run).

```sh
mkdir -p ~/demo/sift && cd ~/demo/sift
git init -b main
pnpm dlx checkride@0.19.3 init --shape flat --name sift
pnpm install --prefer-offline
pnpm check
sed -i '' 's/"ignores": \[/"ignores": [".plumbbob\/**", /' .markdownlint-cli2.jsonc
mkdir -p .plumbbob && printf '{}\n' > .plumbbob/settings.json
# add .claude/settings.json allow list here once rehearsal fixes the entries
git add -A && git commit -qm "chore: scaffold with checkride"
git status --short
```

Expect, in order: `checkride init: generated a flat project (32 files).`, pnpm's
`devDependencies:` list ending in `Done in …`, nine `✔` lines and
`✔ all checks passed in ~4500ms`, `[main (root-commit) …] chore: scaffold with checkride`,
and nothing at all from the last line.

## P2: open the session (`B2`)

Pane 1: `claude`, accept the folder-trust prompt, then:

```text
/plumbbob:doctor
```

Expect `plumbbob doctor — plugin install` and beneath it
`✓ installed via marketplace (…)`, then the hooks line naming all four events:
`✓ hooks present (hooks/hooks.json: PreToolUse, PostToolUse, UserPromptSubmit, Stop; auto-registers)`,
and in the latch section `○ latch: dormant — guidance only (…)`. Doctor names the
marketplace, not the version; the version is its own line:

```text
! plumbbob --version
```

Expect `plumbbob 0.13.10`. Then the model:

```text
/model opus
```

Expect the picker with Opus selected.

## P3: the spec conversation (`B3`)

Normal mode, not Claude Code's plan mode, which cannot write a file. The opening message
is a paragraph in Rob's own voice; the model is asked to interview, briefly, before it
writes. The three answers below are the ones the likely questions get. Any other question
gets a one-line answer that stays inside the spec in [`sift-spec.md`](sift-spec.md); the
vibing should land within a sentence of that file.

The opener:

```text
I want to build a small thing with you, and I want to write the spec before we touch any
code. Here is the problem. A to-do list grows until it is a list of guilt. Most of the lines
on mine are things I meant to do one week and did not, and a month later they are still
there, so the list stops being readable. I want a list where every item has a shelf life
and quietly falls off when it is past. Call it sift. It is a command-line tool in
TypeScript, Node built-ins only, and the list is one JSON file. Interview me, briefly: three
or four questions, one at a time, and then we will write docs/spec.md together.
```

Expect a first question, most often about the smallest version worth building.

The answer on the smallest thing:

```text
Two commands. sift add <text> --for <days> adds an item with a shelf life written in days,
as 3d. Bare sift prints the items still alive, oldest first, with the days each has left,
and the rest fall off. No edit, no done, no priorities. Days are the only unit; a day is
the smallest thing worth forgetting.
```

The answer on what done looks like:

```text
I add "return library book" for 3d and "call the dentist" for 10d, I run sift, and I see
two lines with 3d left and 10d left. Four days later I run sift and I see one line, the
dentist's. The core is pure functions over a list and a clock passed in; only src/bin.ts
reads the real clock, the real file, and process, and it reads SIFT_NOW when set so I can
fake a day. The file lives at $SIFT_FILE, default ~/.sift.json. And pnpm check is green at
every step: coverage 70 percent or better, no default exports, .js extensions on imports,
unit tests under src/__tests__/, every export reachable from src/index.ts or the bin.
```

The answer on what it is not doing:

```text
No sync, no server, no sharing. No editing and no marking done: an item is alive until it
is not. No recurring items. Two things I am leaving open on purpose, and I want them in the
spec as open: how long an item lives when --for is left off (I lean 7 days), and whether an
item that falls off is deleted or archived to a second file (I lean deleted, because a list
that forgets should forget).
```

The closing, with the headings as they stand in `sift-spec.md`. They are deliberately not
the names of `intent.md`'s sections, so the `## Source` copy the plan appends never
duplicates a heading:

```text
Write it to docs/spec.md now, with these headings in this order: Problem, The smallest
thing, Done looks like, Not doing, The pieces, Rules of the build, Still open. Under The
pieces, list what the build is made of: a parser for a shelf life, a test for whether an
item is alive at a given time, a JSON file store, the add command, the bare sift command,
and the two calls the open questions decide. Every code fence carries a language, and
every list starts at 1. Keep it under a page.
```

Expect `docs/spec.md` written and shown; the AGENTS.md stanza tends to make the model run
`pnpm check` on its own, which is fine.

## P4: lint and commit the spec (`B3`)

Pane 1, behind `!`. The spec is linted like any markdown in the repo (MD040 and MD029 are
the usual catches), and `start` refuses a dirty tree, so the commit is not optional.

```sh
! pnpm check --only docs,spell,links
```

Expect `✔ all checks passed in …`. If red, `! pnpm exec checkride fix` repairs most, and
the check is run again.

```sh
! git add docs/spec.md && git commit -qm "docs: add the spec"
```

Expect nothing (the `-q`), then:

```sh
! git status --short
```

Expect nothing at all. An "always allow" click in the steps above can write
`.claude/settings.local.json`; if it shows here, commit it before `P5`.

## P5: the plan (`B4`)

```text
/plumbbob:plan docs/spec.md
```

Expect `**Session**: started "sift: a list that forgets" (baseline …)`, then the arrow line
`→ frame and decide in .plumbbob/builds/2026-11-NN-sift-a-list-that-forgets/intent.md, then build a step`,
then the whole intent, then the plan card: `---`, `**Open questions**: **2** to answer` and
its two-row table, then `**Your Call**:`, and a Next Up row with
`**Range 1** on Haiku: /plumbbob:run (step 1 to its pause)` beneath it. The turn ends
there; sixty to a hundred and eighty seconds on Opus.

## P6: refine (`B5`)

```text
/plumbbob:refine
```

Expect the attack: holes appended under `## Open questions` as `Q3` onward, each with a
plain line and a lean, then the questions table, `| Question | Why it matters | Lean |`,
pasted from `plumbbob status --questions`, and the invitation to settle them in one
message. A refine that finds nothing says so and prints the table of `Q1` and `Q2`.

## P7: defer the fate of a fallen item (`B6`)

```text
defer Q2 until range 2's stop shows what falling off looks like
```

Expect `**Deferred**: Q2 (fall-off-fate) until range 2's stop shows what falling off looks like`,
then the plan card again with `Q2` in its own Deferred table beneath the questions.

## P8: take the leans (`B6`)

```text
yes to all leans
```

Expect `Q1` and every refine hole flipped to `*resolved:* 2026-11-NN, …` on their opener
lines, `D3 (default-life)` appended under `## Decisions` with its *because*, and the card
again with no questions table, only `**Deferred**: 1 left to the work` above the Deferred
table.

## P9: the first hand edit (`B6`)

The editor pane, on `intent.md`, with the session live. Find the line `yes to all leans`
wrote and change the number and the because. Before:

```text
- <a id="d3"></a>**D3 (default-life)**: an item with no `--for` lives 7 days, *because* …
```

After:

```text
- <a id="d3"></a>**D3 (default-life)**: an item with no `--for` lives 5 days, *because* a work week is as long as I leave a thing before I stop seeing it
```

Change `Q1`'s `*resolved:*` note to match if it names the number. Save. Expect nothing on
screen yet; the next prompt reads the file back.

## P10: commit the plan, read the dashboard (`B6`)

```text
looks good
```

Expect `**Plan**: committed (…, details: [build-log.md:…](…))` and the Next Up table
beneath it. Then:

```text
/plumbbob:status
```

Expect `PlumbBob — sift: a list that forgets   [DESIGN]`, `steps  0/7 done` with step 1 as
`← next` and `model: haiku`, `ranges  0 of 3 done` with `▸ 1  /plumbbob:build 1 · haiku`,
`parked 0 · open questions 1 deferred`, and the pointer:

```text
next → run range 1 of 3 — `/plumbbob:run` (step 1 to its pause)
```

## P11: range 1 (`B7`)

```text
/model haiku
```

Expect the picker with Haiku selected. Then:

```text
/plumbbob:run
```

Expect the three-line header, `run  range 1 of 3 · step 1 · ends at step 1's pause`, then
`stop: at step 1's pause, approve the shape of a shelf life …`, then
`grant: none, as a bare range builds to its pause`; then `plumbbob: building step 1` and
the seam; then, a minute or two later, the pause card opening on `**Summary**:`.

## P12: read the pause, land step 1 (`B7`)

```text
expand 1
```

Expect the first section of the detail file, closing on one line:
`**Next Up**: Back to **Step 1** on Haiku - feat(life): parse a shelf life written in days`.
Check that the refusal text in the done-when reads `a shelf life is written in days, like 3d`;
if it drifted, the direction `make the refusal read: a shelf life is written in days, like 3d`
goes here, before anything lands. Then:

```text
show the pause
```

Expect the whole card again. Then, alone in its message:

```text
looks good
```

Expect `**Checkpoint**: Step 1 complete (…, details: [build-log.md:…](…))`, the Verdict
table, Next Up naming `**Step 2** on Haiku`, and beneath it
`**Range 2** on Sonnet: /plumbbob:run (steps 2-5)`.

## P13: range 2 (`B8`)

```text
/model sonnet
```

Expect the picker with Sonnet selected. Then:

```text
/plumbbob:run
```

Expect `run  range 2 of 3 · steps 2-5 · ends at step 5's boundary`, the stop line, and
`grant: steps 2-5`. In pane 2, while it runs:

```sh
while true; do clear; git log --oneline; sleep 5; done
```

Expect four commits to arrive one by one, `feat(item)`, `feat(store)`, `feat(cli)`,
`feat(cli)`, under the plan commit and step 1's. When step 5 lands the pane 1 turn ends on
the stop card: `**Summary**:`, a Readout with `steps  4 of 4 landed`, a Harvested part if
the run parked anything, Your Call, and a state table whose Stop row reads
`**Range 2** landed - add three things you own and read sift once …`. Stop the loop
with `ctrl-c` before `P14`.

## P14: try it, meet `2w` (`B9`)

Pane 2. The alias and the two exports from the README are already in place.

```sh
pnpm build
sift add "return library book" --for 3d
sift add "call the dentist" --for 10d
sift add "water the plants" --for 2d
sift
```

Expect three lines, `return library book   3d left`, `call the dentist     10d left`, and
`water the plants      2d left`, in that order. Then the fourth thing Rob owns:

```sh
sift add "renew passport" --for 2w
echo "exit $?"
```

Expect `sift: a shelf life is written in days, like 3d (got "2w")` and `exit 1`.

## P15: park it, record the stop (`B10`)

Pane 1, while the stop card still waits for its reply. Rehearsal picks the order (park
then `looks good`, or the reverse) and keeps the one the model handles cleanly; this is the
park-first order.

```text
/plumbbob:park 2w is refused: the parser knows days, and weeks are how I think about passports
```

Expect the composed line shown back for approval, tag on the tail:
`2w is refused by the parser, and weeks are how I think about passports (tangent)`. Then:

```text
ok
```

Expect `**Parked**: 2w is refused by the parser, and weeks are how I think about passports (tangent)`,
the composed line and not the typed one, and the pointer
`**Next Up**: Back to **Range 2**'s stop - …`. Then, alone:

```text
looks good
```

Expect `**Stop**: **Range 2** recorded (…)` and a state table with Next Up naming
`**Step 6** on Haiku` and a Parked row reading `**1** of … open: /plumbbob:harvest`.

## P16: harvest (`B11`)

```text
/plumbbob:harvest
```

Expect the lean table, `| Park | Why it matters | Lean |`, one row per open park, the
`2w` park last with its handle in bold. Read the handle off the table; it is `P3` only
if the run parked two before it. If its lean reads `blocker`, skip to `looks good`. If it
reads `tangent`:

```text
make P3 a blocker
```

Expect one line saying which lean moved, and nothing else. Then, alone:

```text
looks good
```

Expect, in order, a Decision slugged `weeks-are-days` appended under Decisions at the next
free number (read it off the card; it is `D4` when refine added nothing), step 8 appended
under Steps, `**Build order**: 8, 6, 7`, `**Build ranges**: range 3 of 3 re-cut (steps 8,6-7)`,
then `**Recorded**: 1 parked idea (1 blocker)` (or the count the run's parks make) and a
state table with `**Step 8** on Haiku` in Next Up, `**Range 3** on Sonnet: /plumbbob:run (steps 8,6-7)`
beneath it, and `| Order | 8, 6, 7 |`. Then:

```text
/plumbbob:status
```

Expect `steps  5/8 done` with `▸ 8` as `← next` and listed last, since the steps keep
document order, `ranges  2 of 3 done` with `▸ 3  /plumbbob:build 8,6-7 · sonnet`, and
`build order  8, 6, 7`.

## P17: sharpen step 8 (`B12`)

```text
/plumbbob:step
```

Expect a before and after of step 8: the done-when gains `parseLife('1w')` yields 7 days
and the refusal reads `like 3d or 2w`; the seam adds nothing; the model stays haiku. Then:

```text
yes
```

Expect the step rewritten in place under `## Steps` and a one-line close naming step 8
as next.

## P18: the second hand edit (`B13`)

The editor pane, on `intent.md`. Two edits, then one line in pane 1. The opener of `Q2`,
before:

```text
- <a id="q2"></a>**Q2 (fall-off-fate)**: Is an item that falls off deleted or archived to a second file?, *deferred:* 2026-11-NN, until range 2's stop shows what falling off looks like
```

After:

```text
- <a id="q2"></a>**Q2 (fall-off-fate)**: Is an item that falls off deleted or archived to a second file?, *resolved:* 2026-11-NN, archived to a second file
```

And one line inserted after `D3` under `## Decisions`. The harvest took the next free
number at `B11`; if it took `D4`, this one is `D5`, the `d4` in its anchor changed to match,
and the slug is what every later citation carries:

```text
- <a id="d4"></a>**D4 (archive-not-delete)**: a fallen item moves to `$SIFT_ARCHIVE`, default `~/.sift.archive.json`, *because* I want to look back once before it is gone (range 2's stop, by hand)
```

Save, then in pane 1:

```sh
! plumbbob status --questions
```

Expect `plumbbob: no open questions in this plan`.

## P19: build step 8, then run the rest of range 3 (`B14`)

```text
/plumbbob:build
```

Expect `plumbbob: building step 8`, the seam, and step 8's pause card a minute later, its
Now row reading `**Step 8** on Haiku` and the range line beneath Next Up naming range 3.
Then, at the pause:

```text
/plumbbob:run
```

Expect the header `run  range 3 of 3 · steps 8,6-7 · ends at step 7's boundary` with
`grant: steps 6-8`; step 8 lands as that pause's `looks good`, then 6, then 7, and the turn
ends on range 3's stop card, whose second move is `/plumbbob:finish`. In pane 2, with the
date four or more days after the day the items were added (move it with the workshop):

```sh
pnpm build
SIFT_NOW=2026-11-12T12:00:00Z sift
cat $SIFT_ARCHIVE
```

Expect one line, `call the dentist   6d left` (the number is ten minus the days faked),
then a JSON file with the library book and the plants in it.

## P20: finish, read the record (`B15`)

Pane 1, as the reply to range 3's stop card:

```text
/plumbbob:finish
```

Expect the stop recorded first, then `report.md` written, then
`**Session**: finished (…, .plumbbob/builds/2026-11-NN-sift-a-list-that-forgets/ rides your branch into the PR)`
and `| **Next Up** | Nothing planned - /plumbbob:plan |`. In pane 2:

```sh
git log --oneline
```

Expect twelve lines: the finish, eight steps, the plan, the spec, the scaffold. Then the
editor pane, scrolled to `## Decisions` in `intent.md` and `## Log` in `build-log.md`: `D3`
from the card and the pen, then the harvest's `weeks-are-days` and the pen's
`archive-not-delete` at the numbers they took, each with its date and its because.
