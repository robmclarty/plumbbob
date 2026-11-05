# A Step Lands Only When You Say So

Range 1 of the plan is bare: one step, `/plumbbob:build 1`, and a stop at that
step's pause. Lesson 2's plan cut it that way because everything after it leans
on the shape of a shelf life, so the run stops before step 1 lands and the shape
gets a human read first. A mason holds the plumb line against the first stone
before setting anything on it, and that reading is this lesson. About twenty
minutes.

## Run the Range

The boundary that closed lesson 2 ended on a Next Up row reading
`**Step 1** on Haiku`, with a range line beneath it,
`**Range 1** on Haiku: /plumbbob:run (step 1 to its pause)`. The plan chose
haiku because step 1 is one function, specified down to its refusal text. The
card carries that choice; the session does not act on it. Select it yourself:

```text
/model haiku
```

Guidance, never a gate: a fresh window inherits the session's model rather
than the plan's, which is why every card names the model again. Now type the
run:

```text
/plumbbob:run
```

You type no step number. The plan holds the numbers, and the turn hook reads
the plan as you press enter. The skill opens on the run header, three lines,
and yours should match these word for word except the stop's text:

```text
run  range 1 of 3 · step 1 · ends at step 1's pause
     stop: at step 1's pause, approve the shape of a shelf life (`3d`, days only, and the refusal text) before anything leans on it
     grant: none, as a bare range builds to its pause
```

The first line is the range and where the run ends. The second is the call the
plan reserved. The third is what the hook minted at your keystroke, and for a
bare range that is nothing: no step may land in this turn, because the pause
is the point. Then the step is entered:

```text
plumbbob: building step 1
plumbbob: the seam is orientation, not a lock (2 paths)
  src/life.ts
  src/__tests__/life.test.ts
```

The agent writes the parser and its test, runs the gate (the nine slots from
lesson 0), reviews its own diff against the step's done-when and the plan's
Decisions and Constraints, and stops. Nothing is committed.

## Read the Pause

The turn ends on one block. Yours will differ in its numbers and its
sentences; check for the seven readout rows, the four moves, and a `Now` row
naming step 1. Roughly:

````markdown
**Summary**: `parseLife` reads `3d` as three days and refuses anything else with the sentence the plan fixed.

**Readout**:

```text
check        green: 9 of 9 checks
done-when    met
decisions    1 of 1 honored
constraints  4 of 4 honored
seam         held: 2 of 2 declared, no strays
diff         +54 -0 across 2 files
             - src/__tests__/life.test.ts +33 -0
             - src/life.ts +21 -0
spent        3 min · 1 turn · 5s gate · green first run
```

**Your Call**:

- `looks good` → I checkpoint Step 1; back to the boundary
- `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back
- anything that reads as direction → I make the change and say what moved; nothing lands until you approve
- `revert` → I wind the work back to the last checkpoint

| **Verdict** | ● Plumb |
| --- | --- |
| Now | **Step 1** on Haiku - feat(life): parse a shelf life written in days |
| Next Up | **Step 2** on Haiku - feat(item): tell a live item from one past its life (details: [intent.md:33](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L33)) |
|  | **Range 2** on Sonnet: /plumbbob:run once step 1 lands |

**Recommendation**: Approve it. `'3d'` yields three days, `'3'` and `'x'` are refused with `a shelf life is written in days, like 3d`, and the parser is one function with one unit.

[more details](.plumbbob/detail.md)
````

**Four of the rows are measured and three are judged.** `check` comes from
the gate's own summary file, `seam` from the declared seam held against
`git diff`, `diff` and the files beneath it from git, and `spent` from the
step's receipts; the Verdict at the head of the table is the worst of them.
`done-when`, `decisions`, and `constraints` are the agent's, written into
`.plumbbob/detail.md` beside the Summary and the recommendation, and
`plumbbob handoff` reads them back and renders the whole block. The agent
types none of it into the chat. When the recommendation says the refusal
text is right, that is a claim; when the check row says green, that is a
measurement; and the card keeps the two apart so you know which you are
reading.

The recommendation speaks to the stop: `3d`, one unit, and the sentence a bad
input gets. Hold the card to that sentence,
`a shelf life is written in days, like 3d`. Lesson 5 depends on it word for
word.

## Ask Before You Approve

Say `expand 1`. The agent opens the first numbered section of the detail file,
answers from it, and closes on one line rather than on the card again:

```text
**Next Up**: Back to **Step 1** on Haiku - feat(life): parse a shelf life written in days
```

The card shows once; every later turn at the same pause is a reply closed by
that line, because forty lines beneath an answer push the answer off the
screen. `show the pause` brings the block back whenever you want it.

Direction is a reply too. Say "add `'10d'` to the accepted cases in the test".
The agent makes the edit, runs the check, says what moved and what the check
found, and closes on the same line. Nothing landed: the newest commit is still
the plan's.

## Look at the Diff Yourself

The card is the reading; the diff is the stone. Look at it before you approve:

```sh
git diff --stat
cat src/life.ts
```

Check for one exported function, no class, no default export, and the refusal
sentence as a string literal. The check row already says the gate is green, so
running the tests again tells you nothing new.

## Ask It to Commit

Now break it on purpose. At the pause, type:

```text
just commit this with git
```

The agent reaches for `git commit`, and Claude Code stops to ask you, with
plumbbob's reason in the prompt. Roughly:

```text
Bash command

  git add -A && git commit -m "feat(life): parse a shelf life written in days"

plumbbob: a step is in flight — checkpoint owns the landing. Approve only if you asked for this commit.

Do you want to proceed?
  1. Yes
  2. No
```

Say no. This is one of the four hooks lesson 0 listed, a `PreToolUse` ask on
a raw commit while a step is in flight. It asks and never denies: you commit
freely, and a commit the agent reaches for mid-step becomes a question rather
than a wall ([D66 (oob-commits-surfaced)](../decisions.md#d66)). The landing
itself is latched one layer down: `plumbbob checkpoint` refuses to land a
step until the turn ledger records a human message since the step was
entered, so the agent cannot approve its own work however it is asked
([D64 (approval-latch)](../decisions.md#d64)). Nothing blocks an edit; the
record is what is held. The step is still at its pause.

## Approve It

```text
looks good
```

Your message is the tick. The checkpoint runs the check once more, commits
the step, records its SHA, flips the step to `[x]`, and prints the boundary:

```text
**Checkpoint**: Step 1 complete (4b1e9c2d7, details: [build-log.md:76](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/build-log.md#L76))

| **Verdict** | ● Plumb |
| --- | --- |
| Next Up | **Step 2** on Haiku - feat(item): tell a live item from one past its life (details: [intent.md:33](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L33)) |
|  | **Range 2** on Sonnet: /plumbbob:run (steps 2-5) |
```

No Your Call block, because nothing is pending. Three things changed on disk,
and you can read each of them:

```sh
git log --oneline -4
grep -n "\[x\]" .plumbbob/builds/*/intent.md
```

```text
4b1e9c2 feat(life): parse a shelf life written in days
7d2e94f chore(sift): plan
b31a0c2 docs: add the spec
1c0d3a9 chore: scaffold with checkride
30:1. [x] feat(life): parse a shelf life written in days, **done when:** `parseLife('3d')` yields 3 days and `'3'`, `'x'` yield the refusal `a shelf life is written in days, like 3d`, under test
```

The commit's subject is the step's title, so history reads scaffold, spec,
plan, step. The third change is the Log: open `build-log.md` at the
`details:` line the checkpoint printed, and the block you approved sits
beneath step 1's dated line, Readout and recommendation included. The pause
is gone from the chat and kept in the record, where it rides the branch.

The range line names the next run and its four steps. Leave it; lesson 4 is
that run.

## With Your Agent

> Open build-log.md at the line step 1's checkpoint printed and tell me which
> Readout rows you measured and which you wrote. Change nothing.

Check that it says it measured none of them: `check`, `seam`, `diff`, and
`spent` are the CLI's, and `done-when`, `decisions`, and `constraints` are its
own. An agent that claims the check row is its work has not read the file.

## Try It

1. Read the ledger the latch reads:

   ```sh
   cat .plumbbob/builds/*/checkpoints
   ```

   Three lines: `baseline`, `plan`, then `step 1` and the SHA the boundary
   printed. Then type `! plumbbob status` in the chat and find
   `last checkpoint  step 1` and `ranges  1 of 3 done`. Nothing to put back.
2. Prove the sentence is pinned. Open `src/life.ts`, change `days` to `weeks`
   in the refusal, and run the gate:

   ```sh
   pnpm check --only test
   ```

   Exit 1, and the life test names the sentence it expected. Put it back:

   ```sh
   git checkout -- src/life.ts
   ```

## Remember

- The pause is a clock, not a lock: nothing stops the edit, and the record
  waits for your message.
- Four readout rows are measured and three are judged, and the card keeps
  them apart.
- `looks good` is the only thing that lands a step.

[← The Plan Is a File](./02-the-plan.md) · [A Range Stops Where the Plan Said →](./04-a-range.md)
