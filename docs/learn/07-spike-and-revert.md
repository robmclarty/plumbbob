# When the Design Will Not Settle

Range 3 has landed and its stop card is waiting. Before you answer it, two moves that
belong at a boundary and nowhere else. **Some forks do not resolve on paper.** `sift`
prints days left; you have wondered whether the date an item falls off would read
better, and no amount of staring at `intent.md` will tell you, because the question is
what the output looks like in a terminal with real items in it. That is a spike: a
throwaway tree per option, a verdict that stays, and the main tree untouched. The second
move is the undo, `revert`, and what it never loses. About fifteen minutes, and no model
until the With Your Agent prompt.

## Open a Spike

```text
/plumbbob:spike days-or-date
```

```text
**Spike**: opened (the main tree stays put, 2 throwaway worktrees)
  /Users/you/learn/sift-spike-days-or-date-a
  /Users/you/learn/sift-spike-days-or-date-b

**Spike report**: scaffolded (.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/spike-01-days-or-date.md)
  → record findings and the Verdict there, then run plumbbob spike done

**Next Up**: Close the spike - /plumbbob:spike done
```

Two worktrees, siblings of `~/learn/sift`, each on its own branch (`spike/days-or-date-a`
and `-b`) cut from `HEAD`, which is step 7's commit. The hooks are dormant in both: the
control files under `.plumbbob/` are untracked, so a fresh checkout has no `STATE`, and
the latch has nothing to read ([D18 (spike-lifecycle)](../decisions.md#d18)). The report
is scaffolded now rather than at the close, so the findings land while the trees are live
([D70 (spike-reports)](../decisions.md#d70)).

## Try Both by Hand

Leave `-a` as it is. In `-b`, open `src/sift.ts` and change `render` to print the date an
item falls off in place of the days it has left, by hand, with no skill and no model. A
worktree starts without `node_modules`, so install before you run, in the terminal from
lesson 4 so `SIFT_FILE` still names your list:

```sh
cd ~/learn/sift-spike-days-or-date-b
pnpm install --prefer-offline
pnpm test
pnpm build && SIFT_NOW=2026-11-08 node dist/bin.js
```

```text
call the dentist      Nov 14
renew passport        Nov 18
```

One test goes red in `-b`: the `5d left` assertion step 5 wrote. That is a finding, not a
failure. The spike's question is whether a date reads better, and the red test says what
changing it would cost. Read the two outputs side by side, then come home:

```sh
cd ~/learn/sift
```

## Write the Verdict

Open `spike-01-days-or-date.md` in the build folder. It has five headings; fill the last
three in your own words, the Verdict on its bold line:

```markdown
## Findings

- Days left answers "how long do I have?" with no arithmetic; a date answers "when?" and needs a calendar.
- Changing `render` fails one test in `src/__tests__/sift.test.ts`, the `5d left` assertion from step 5.

## Verdict

**Verdict:** not viable; days stay. A list that forgets is read for urgency, and days are urgency.

## What this decides

Nothing in `intent.md` changes. `D2 (oldest-first)` already prints days left; this spike confirms it against a real list.
```

Then close it:

```text
/plumbbob:spike done
```

```text
**Spike**: closed (worktrees and branches removed)

**Next Up**: Nothing planned - /plumbbob:step or /plumbbob:finish
```

The trees and branches are gone; the report stays in the build folder and rides into the
pull request beside `intent.md`. Close a spike with the Verdict line still the template's
placeholder and the ending carries a `No verdict recorded ⚠` advisory naming the file.
Guidance, not a gate: the spike still closes.

## Wind One Back

Now the undo. Make a junk edit to the main tree, the kind a model makes when it keeps
going after a card:

```sh
echo "// scratch" >> src/sift.ts
git status --short
```

```text
 M .plumbbob/builds/2026-11-04-sift-a-list-that-forgets/build-log.md
 M .plumbbob/builds/2026-11-04-sift-a-list-that-forgets/checkpoints
 M .plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md
 M .plumbbob/builds/2026-11-04-sift-a-list-that-forgets/stats.json
 M src/sift.ts
?? .plumbbob/builds/2026-11-04-sift-a-list-that-forgets/spike-01-days-or-date.md
```

The `src` line is the junk. The rest is the build folder's own tail: step 7's bookkeeping
(its `[x]`, its ledger line, its Log entry, and its receipts), which its commit could not
carry, and the spike report, all of which the finish commits.
Wind the junk back:

```text
/plumbbob:revert
```

```text
**Reverted**: to 2f8e6a1b9 (park lines and intent edits preserved)

**Next Up**: Nothing planned - /plumbbob:step or /plumbbob:finish
```

Run `git status --short` again: the `src/sift.ts` line is gone and the build folder's
lines are exactly as they were. The SHA is step 7's checkpoint, the last line of the
ledger (yours is the full forty characters):

```sh
tail -1 .plumbbob/builds/2026-11-04-sift-a-list-that-forgets/checkpoints
```

```text
step 7 2f8e6a1b9
```

Revert is `git reset --hard` with two exceptions, and the exceptions are the lesson.
Before the reset it copies the build folder aside and restores it after, so park lines,
the intent you edited by hand, the log, and this spike's report survive a reset to any
checkpoint, even the baseline, which predates the folder
([C4 (never-destroy)](../decisions.md#c4)). And it removes untracked files inside the
step's seam only, so a stray file outside the declared paths is left for you to judge.
Revert resets code; it never resets the record. With a step in flight it also clears the
markers, so the step goes back to `[ ]` with its work gone, which is why the card lists
the move last.

## The Three Exits

Had you typed `/plumbbob:spike days-or-date` at step 8's pause in lesson 6, the verb would
have refused, and the driver skill would have relayed the refusal and stopped:

```text
plumbbob: a step is in flight (a spike is a deliberate fork from a settled boundary)
  → checkpoint, abandon, or revert the current step first
```

A step in flight has three exits, and the remedy names them. `checkpoint` lands it, which
is `looks good`. `revert` drops it and its work, as above. `/plumbbob:abandon`, which you
will not run here since nothing is in flight, drops the step and keeps the work: it
clears the in-flight markers, writes one line to the Log, and touches neither the tree
nor git, so the step keeps its `[ ]` and the diff stays yours to rework or commit by hand
([D79 (abandon-keeps-work)](../decisions.md#d79)). It honors the same latch as
`checkpoint`, because a step exit is a boundary crossing, and a model that could abandon
in the turn it built would have a side door out of the pause.

## With Your Agent

> Read spike-01-days-or-date.md in the build folder and tell me what it decided and what
> it did not. Just tell me.

Check that it reads the Verdict line and "What this decides" back to you, and says that
`intent.md` did not change. An answer that offers to change `render` in the main tree has
missed what a spike is.

## Try It

1. Open a second spike with three options, `/plumbbob:spike render-width a b c`, run
   `git worktree list`, and count four trees. Type `/plumbbob:spike again` while it is
   open and read the refusal, `already in a spike`. Then `/plumbbob:spike done` before
   you write a verdict, and read the advisory. Put it back: delete the
   `spike-02-render-width.md` the open scaffolded, since a report with no verdict is noise
   in the pull request.
2. Open `## Verdicts` in `intent.md`. The template keeps one line per fork that resolved,
   and no verb writes it, so copy the verdict there as its placeholder shows. It stays.

## Remember

- A spike is a worktree you throw away and a report you keep.
- `revert` resets code, never the record: the build folder is carried across the reset.
- `abandon` drops the step and keeps the diff; `revert` drops both; `checkpoint` lands it.

[← The Next Step Is Sharpened Just in Time](./06-sharpen-the-next-step.md) · [The Record Is the Why, Beside the Code →](./08-the-record.md)
