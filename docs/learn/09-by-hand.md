# The CLI Is the Whole Loop, Typed

Every card you read in lessons 2 to 8 was a verb's output pasted whole. The skills shell
out to the CLI, so in the loop you rarely type it. It is a first-class path on its own:
every verb runs from a terminal, and a few (`use`, `handoff`, `defer`, `check`, `agent`)
have no skill of their own. [`cli-only.md`](../cli-only.md) drives one build that way.
This lesson drives a smaller one: a second goal for `sift`, one step, no skill and no
model, so you know what the skills were doing and can do it from any tool. The tables (the
four `detail.md` shapes, the card's moves as verbs, the latch's rows) live there.

You need `plumbbob` on a terminal's PATH: the marketplace plugin puts it there only inside
a Claude Code session, so add the npm package, `npm i -g plumbbob` per
[`install.md`](../install.md), and skip `plumbbob init`. Or type every line after `!` inside
Claude Code, except in the latch section, which reads whether stdin is a terminal. About
thirty minutes.

## Start by Hand

```sh
cd ~/learn/sift
git status --short
plumbbob start "sift: print the file path"
```

```text
**Session**: started "sift: print the file path" (baseline b7e4c9d02)
  → frame and decide in .plumbbob/builds/2026-11-04-sift-print-the-file-path/intent.md, then build a step
```

`start` refuses a dirty tree, so the empty `git status` comes first. It wrote
`.plumbbob/STATE`, the session's one sentinel, and a build folder holding `intent.md`,
`build-log.md`, and a `checkpoints` file with one line, `baseline <sha>`; your SHA and date
differ. It left `.plumbbob/settings.json` alone, since lesson 0 committed it.

## Write the Plan by Hand

Open `intent.md` in the new folder. The CLI machine-reads a step's opener (number, box, a
title that is also the commit subject, `**done when:**`), exactly one `seam:` line of
backticked repo-relative paths, and an optional `model:` line; everything else is yours.
Delete the two placeholder steps the template ships (they parse as real steps), delete
`## Build ranges` (one step needs no range), fill the Frame, and write the step:

```markdown
**Size:** tiny
**Scope:** sift

## Frame

- **Problem:** `sift` keeps one JSON file, and nothing prints where it is.
- **Smallest thing that solves it:** a third command, `sift path`, that prints the file's path.
- **Done looks like:** `SIFT_FILE=/tmp/x.json sift path` prints `/tmp/x.json`.
- **Explicitly NOT doing:** no flag on bare `sift`; no path for the archive.

## Decisions

- <a id="d1"></a>**D1 (path-is-a-command)**: `sift path` is a third command, not a flag, *because* sift's two commands are words, and a flag would be its first.

## Constraints

- <a id="c1"></a>**C1 (no-runtime-deps)**: Node built-ins only, as the first build held.

## Steps

1. [ ] feat(cli): print the path of the list file, **done when:** `main(['path'], deps)` writes `deps.file` and a newline to stdout and returns 0, under test
   - seam: `src/cli.ts`, `src/__tests__/cli.test.ts`
```

The `**Scope:**` header is why the plan and finish commits read `chore(sift): …`; left as
the template's `<short-scope>`, the scope falls back to the slug. Read the plan as the plan
card would, then commit it alone:

```sh
plumbbob status
plumbbob status --questions
plumbbob checkpoint --plan
```

```text
PlumbBob — sift: print the file path   [DESIGN]

  steps  0/1 done
  ▸ 1  feat(cli): print the path of the list file   ← next
        done when: `main(['path'], deps)` writes `deps.file` and a newline to stdout and returns 0, under test
        seam: src/cli.ts, src/__tests__/cli.test.ts

last checkpoint  none yet
parked 0 · open questions 0

next → build step 1 — `/plumbbob:build` (or `/plumbbob:step` to revise it first)
```

`status --questions` prints `no open questions in this plan`: the template's placeholder
question is uncounted until its body is filled. `checkpoint --plan` stages only the build
folder, commits `chore(sift): plan`, and runs no gate
([D36 (plan-commit)](../decisions.md#d36)); its ending opens `**Plan**: committed (<sha>)`.

## Break It Before You Build It

Open `intent.md` and change this line by hand:

```markdown
   - seam: `src/cli.ts`, `src/__tests__/cli.test.ts`
```

```markdown
   - seam: `src/*.ts`
```

```sh
plumbbob build 1
```

```text
plumbbob: step 1's seam token `src/*.ts` is a glob; seams are exact paths or `dir/` grants — D23 (no-glob-seams).
  → fix the step's seam in intent.md, then `build 1` again
```

A seam is matched by exact path or by a `dir/` prefix, never by a pattern, because the seam
row at the pause counts strays, and a glob gives it no count to hold
([D23 (no-glob-seams)](../decisions.md#d23)). Put the line back; `git status --short`
prints nothing again.

## Build, Check, Hand Off

```sh
plumbbob build 1
```

```text
plumbbob: building step 1
plumbbob: the seam is orientation, not a lock (2 paths)
  src/cli.ts
  src/__tests__/cli.test.ts
```

`build` wrote `SEAM` and `STEP` beside the build folder, stamped the step's start time, and
changed no code. Make the change yourself: in `src/cli.ts`, one branch in `main` that writes
`deps.file` and a newline when `argv[0]` is `path`; in the test file, one test that reads
it back through a fake stdout. Run the gate narrow while you iterate, then once in full:

```sh
plumbbob check --bail --only lint,struct
plumbbob check
```

```text
plumbbob: check green.
```

Then judge your diff against the done-when, the Decision, and the Constraint, and write
the verdict into `.plumbbob/detail.md`, beside the `builds/` folder, not inside it:

```markdown
# Detail · Step 1 · feat(cli): print the path of the list file

── recap · step 1 of 1 ──
done-when    met
decisions    1 of 1 honored
constraints  1 of 1 honored

## Summary

`sift path` prints the list file's path, read from the same `deps.file` the other two commands use.

## 1 One branch, no new module

The branch sits beside `add` in `main`; nothing in `src/store.ts` moved.

## Recommendation

Approve it. The gate is green, and the step touched the two files it named.
```

The parsers are exact. The header names the step; one naming another step is a leftover,
and `checkpoint` deletes it unrecorded. The recap opener is `── recap · step 1 of 1 ──`, two
U+2500 dashes and a U+00B7 dot; a hyphen there and no row is read. Its three rows are the
judged ones, each opening with a verdict word from the readout's closed set; `check` and
`seam` are measured, so a row you write for them is overwritten. The other three shapes are
in [`cli-only.md`](../cli-only.md#the-four-detailmd-shapes). Render the pause:

```sh
plumbbob handoff 1
```

````markdown
**Summary**: `sift path` prints the list file's path, read from the same `deps.file` the other two commands use.

**Readout**:

```text
check        green: 9 of 9 checks
done-when    met
decisions    1 of 1 honored
constraints  1 of 1 honored
seam         held: 2 of 2 declared, no strays
diff         +14 -0 across 2 files
             - src/__tests__/cli.test.ts +9 -0
             - src/cli.ts +5 -0
spent        6 min · 5s gate · green first run
```

**Your Call**:

- `looks good` → I checkpoint Step 1; back to the boundary
- `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back
- anything that reads as direction → I make the change and say what moved; nothing lands until you approve
- `revert` → I wind the work back to the last checkpoint

| **Verdict** | ● Plumb |
| --- | --- |
| Now | **Step 1** - feat(cli): print the path of the list file |
| Next Up | Nothing planned - /plumbbob:step or /plumbbob:finish |

**Recommendation**: Approve it. The gate is green, and the step touched the two files it named.

[more details](.plumbbob/detail.md)
````

Your counts and minutes differ; check for the measured rows (`check`, `seam`, `diff`,
`spent`) wrapped around the three you wrote, and a Now row with no model, since the step
named none. The card is worded for an agent, and at a terminal the "I" in
`looks good → I checkpoint Step 1` is you; each reply's verb is a table in
[`cli-only.md`](../cli-only.md#the-cards-moves-as-verbs).

## Feel the Latch

Land it with a commit body, the way the build skill does:

```sh
plumbbob checkpoint 1 --body <<'BODY'
One branch beside add; the path comes from deps.file, as D1 (path-is-a-command) decided.
BODY
```

```text
plumbbob: checkpoint refused — no human turn since this step began. This is the
pause: present the diff and the self-review, then end the turn. The human's approval on
their next turn is what lets this land — re-run `checkpoint` then and stop at the
boundary; `/plumbbob:build` only starts the next step, it never lands this one. (An explicit
`/plumbbob:build --auto` or a step range in the human's own prompt is the only self-approval.)
```

**The latch reads four things in order, and the first row that matches wins**: whether
stdin is a terminal, the ledger (`.plumbbob/TURN` and the build's `TICK`), and the grant
([D64 (approval-latch)](../decisions.md#d64)). Lessons 2 to 8 ran under the turn hook, so
`TURN` holds the count of prompts you typed, `finish` never clears it, and `build 1` stamped
`TICK` equal to it. The heredoc moved stdin off the terminal, so the first row did not hold;
both files exist; no grant; `TURN` equals `TICK`: refuse. (A workbench that jumped here from
lesson 0 has no ledger and passes on the dormant row instead.) The rows are a table in
[`cli-only.md`](../cli-only.md#the-latch-without-hooks). A bare `plumbbob checkpoint 1`
passes on the first row, a human at the keyboard, with `--body` ignored there. To keep your
body, record the turn the refusal asked for, then land:

```sh
plumbbob turn
plumbbob checkpoint 1 --body <<'BODY'
One branch beside add; the path comes from deps.file, as D1 (path-is-a-command) decided.
BODY
```

`plumbbob turn` at a terminal reads no stdin, adds one to `TURN`, clears any grant, and
prints one line of JSON, the nudge the hook would hand Claude Code, which nobody reads
here. It is the statement "I, the human, reviewed this", the same tick your keystroke makes
in a session, and it is yours to type. It is not a bypass, and none exists: `checkpoint`
takes `--plan`, `-m`, and `--body` only, no environment variable opens the latch, and a
settings `auto` grants nothing ([D65 (human-typed-grants)](../decisions.md#d65),
[D67 (auto-not-a-grant)](../decisions.md#d67)). Then the landing:

```text
**Checkpoint**: Step 1 complete (9b2d4e1f0, details: [build-log.md:58](.plumbbob/builds/2026-11-04-sift-print-the-file-path/build-log.md#L58))

| **Verdict** | ● Plumb |
| --- | --- |
| Next Up | Nothing planned - /plumbbob:step or /plumbbob:finish |
```

`checkpoint` ran the full gate, committed everything under the step's title, and only then
wrote its bookkeeping: the `[x]` in `intent.md`, the `step 1 <sha>` line, the Log entry
from your detail file, and `stats.json`. The tree is dirty when it returns; leave it, and
`finish` absorbs the tail ([D37 (bookkeeping-sweep)](../decisions.md#d37)).

## Finish by Hand

Write `report.md` in the build folder, five sections and no more, since `finish` appends
`## Checkpoints` and `## Stats` itself:

```markdown
# Report — sift: print the file path

## What shipped
`sift path` prints the list file's path.

## Decisions and why
- D1 (path-is-a-command): a third command, not a flag, because sift's commands are words.

## Parked & harvested
Nothing parked.

## Final status
Done. One step, green first run.

## Deferred tangents
None.
```

```sh
plumbbob finish
git log --oneline -3
```

```text
**Session**: finished (c41e7d9a2, .plumbbob/builds/2026-11-04-sift-print-the-file-path/ rides your branch into the PR)

| **Next Up** | Nothing planned - /plumbbob:plan |
| --- | --- |
```

Three commits: `chore(sift): finish`, `feat(cli): print the path of the list file`, and
`chore(sift): plan`, the shapes lesson 8 read back. Nothing in the record says whether a
model or a hand wrote the diff; `checkpoint` reads the diff, not the author.

## With Your Agent

> I typed every plumbbob verb by hand this lesson. Read the plumbbob skills you have
> loaded, build, harvest, and plan, and tell me the three things they do that no verb
> does. Just tell me.

Check that it names the self-review (the verdict words, the Summary, the Recommendation),
the harvest's proposals, and the plan's authoring. An answer that names `checkpoint` or
`order` has the layers backwards: those are verbs, and the skills call them.

## Try It

1. Before you finish, add a `## Build ranges` section with one item in the bare form,
   `` 1. `plumbbob build 1`, **stop:** read the path once ``, and run `plumbbob status`. The
   ranges block reads `⚠ item 1 under Build ranges does not parse`: the parser reads only
   `/plumbbob:build <list>` between the backticks, even by hand. Delete the section again.
2. Run `plumbbob doctor` from the terminal and read the latch line, `✓ latch: live (turn N)`:
   that count is the one `turn` added to. A machine with no plugin linked at all reads
   `not linked` and exits 1; the lines beneath still count.

## Remember

- The CLI parses four line shapes (a step's opener, its seam, a range item, a question's
  opener) and one file in four shapes, `detail.md`; the rest of `intent.md` is yours.
- The latch reads the terminal, then the ledger, then the grant, in that order; `plumbbob
  turn` is a human saying so, never a way around it.
- The skills are drivers and the verbs are the loop; by hand, every judgment is yours.

[← The Record Is the Why, Beside the Code](./08-the-record.md) · [Where PlumbBob Sits →](./10-where-plumbbob-sits.md)
