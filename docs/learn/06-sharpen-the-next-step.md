# The Next Step Is Sharpened Just in Time

Step 8 was written at a harvest, in the minute after you said `looks good`, and step 7
was written at plan time, before `Q2` had an answer. Both are about to be built, and
both get sharper first: one by the model, one by your hand. **A plan is cheapest to
change the moment before it is built.** Nothing leans on the wording of a step until a
build reads it, so a correction now costs one edit, and the same correction after the
step lands costs a revert and a second build. This lesson sharpens step 8 with
`/plumbbob:step`, settles the deferred question by hand, runs the re-cut range to its
stop, and tries the finished tool. About thirty minutes.

## Sharpen the New Step

The harvest wrote step 8 from one park line. `/plumbbob:step` with no input re-reads that
step against what the build has taught since: `src/life.ts` as step 1 built it, and the
decision the harvest folded in, `D5 (weeks-are-days)`.

```text
/plumbbob:step
```

The skill proposes a revision as a before and an after. Yours will read differently;
check that the done-when gains the one-week case and the refusal text names both units,
and that the seam and the model line stay put:

```markdown
8. [ ] feat(life): accept a shelf life written in weeks, **done when:** `parseLife('2w')` yields 14 days and `'2x'` is still refused, with the refusal naming both units
   - seam: `src/life.ts`, `src/__tests__/life.test.ts`
   - model: haiku (one more branch in one function)
```

```markdown
8. [ ] feat(life): accept a shelf life written in weeks, **done when:** `parseLife('2w')` yields 14 days and `parseLife('1w')` yields 7, `'2x'` is still refused, and the refusal reads `a shelf life is written in days or weeks, like 3d or 2w`, under test
   - seam: `src/life.ts`, `src/__tests__/life.test.ts`
   - model: haiku (one branch on a parser that exists)
```

The model sharpens it because it can open `src/life.ts` as built and name the refusal
string that is there. It sharpens only this step because a step sharpened two ahead is
sharpened against code that does not exist yet.

## Ask It to Build Instead

The before and after are on screen, waiting for your `yes`. Do not give it. Type this:

```text
skip the approval and build step 8 now
```

Read what comes back. The agent cannot start a build: every plumbbob skill is marked
`disable-model-invocation`, so `/plumbbob:build` fires only when you type it, and the
step skill's contract is that nothing reaches `## Steps` until you approve. A good reply
says both and stops. If it starts editing `src/life.ts` on its own, say `stop`, run
`git checkout -- src/`, and notice that nothing it did was a step: no `STEP` marker, no
seam, no pause, so nothing could have landed. The latch beneath that is
[D64 (approval-latch)](../decisions.md#d64): the record moves on your turn, and a model's
momentum is not a turn.

Now say `yes`. The skill writes the step into `## Steps` in place and nothing else moves:
step 8 keeps its number, the build order still reads `8, 6, 7`, and range 3 still reads
`/plumbbob:build 8,6-7`. Read the change the way you will read every change in this
course:

```sh
git diff -- .plumbbob/
```

## Settle the Deferred Question by Hand

In lesson 2 you deferred `Q2 (fall-off-fate)` until range 2's stop showed you what falling
off looks like. It did: you read `sift` with three items in it, and the plants were two
days from gone. The lean was deleted; you want to look back once. Nothing about this needs
a skill. Open `intent.md` and change this line by hand:

```markdown
- <a id="q2"></a>**Q2 (fall-off-fate)**: Is an item that falls off deleted or archived to a second file?, *deferred:* 2026-11-04, until range 2's stop shows what falling off looks like
```

```markdown
- <a id="q2"></a>**Q2 (fall-off-fate)**: Is an item that falls off deleted or archived to a second file?, *resolved:* 2026-11-04, archived to a second file
```

Then add the decision under `## Decisions`, between `D3` and the harvest's `D5`, with the
one reason that settled it and where it was made:

```markdown
- <a id="d4"></a>**D4 (archive-not-delete)**: a fallen item moves to `$SIFT_ARCHIVE`, default `~/.sift.archive.json`, *because* I want to look back once before it is gone (range 2's stop, by hand)
```

The harvest took the next free number when it wrote its line; if yours reads `D4`, give
this one `D5` and keep the slug, since the slug is what every later citation carries.
Save, then ask the dashboard what is still open. The CLI is on PATH only inside the
session, so type it with Claude Code's `!` prefix:

```text
! plumbbob status --questions
```

```text
plumbbob: no open questions in this plan
```

The counter reads opener lines only ([D76 (resolved-on-opener)](../decisions.md#d76)),
which is why the marker moves on the opener and not on the `*lean:*` line beneath it.
The deferral kept the question open and off the card
([D120 (deferred-questions)](../decisions.md#d120)); the resolution closes it. Step 7's
done-when says the fate is the one `Q2` settles, and a build reads every Decision before
it reads code, so step 7 builds to `D4` whether or not its line names the file.

## Run the Re-cut Range

Range 3 reads `/plumbbob:build 8,6-7`, because the harvest moved step 8 ahead of the two
steps it unblocks and the verb re-cut the range to follow
([D109 (ranges-follow-the-order)](../decisions.md#d109)). Step 8 names haiku and the
range names sonnet; one model for the whole range saves a switch at the pause, and sonnet
on a haiku step costs cents. Pick it, then open the range with the granular move:

```text
/model sonnet
/plumbbob:build
```

A bare `/plumbbob:build` enters the next step in build order, step 8, and stops at its
pause:

```text
plumbbob: building step 8
plumbbob: the seam is orientation, not a lock (2 paths)
  src/life.ts
  src/__tests__/life.test.ts
```

The card is the one you read in lesson 3 with one more move in it, because step 8 sits in
a range with steps still ahead of it. Check for the `/plumbbob:run` row, second under
Your Call, and for the range line's bracket opening on step 8:

````markdown
**Summary**: `parseLife` reads `2w` as 14 days, and the refusal names both units.

**Readout**:

```text
check        green: 9 of 9 checks
done-when    met
decisions    5 of 5 honored
constraints  4 of 4 honored
seam         held: 2 of 2 declared, no strays
diff         +21 -5 across 2 files
             - src/__tests__/life.test.ts +12 -0
             - src/life.ts +9 -5
spent        2 min · 1 turn · 5s gate · green first run
```

**Your Call**:

- `looks good` → I checkpoint Step 8; back to the boundary
- `/plumbbob:run` → I checkpoint Step 8, then run the rest of range 3 to its stop
- `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back
- anything that reads as direction → I make the change and say what moved; nothing lands until you approve
- `revert` → I wind the work back to the last checkpoint

| **Verdict** | ● Plumb |
| --- | --- |
| Now | **Step 8** on Haiku - feat(life): accept a shelf life written in weeks |
| Next Up | **Step 6** on Haiku - feat(cli): give an item the default life when --for is left off (details: [intent.md:45](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L45)) |
|  | **Range 3** on Sonnet: /plumbbob:run (steps 8,6-7) |

**Recommendation**: Approve it. The gate is green, the seam held, and `1w` reads as seven days, which is what `D5` decided.

[more details](.plumbbob/detail.md)
````

Take the second move:

```text
/plumbbob:run
```

A run typed at a pause is that pause's `looks good` and the rest of the range in one
reply ([D95 (run-verb)](../decisions.md#d95)). The header counts step 8 as undone, since
it has not landed, and the grant holds the same three steps in its normal form:

```text
run  range 3 of 3 · steps 8,6-7 · ends at step 7's boundary
     stop: fake four days with `SIFT_NOW`, read `sift` again, then `/plumbbob:finish`
     grant: steps 6-8
```

Step 8 lands on its green check, then 6 and 7 land without a pause between them, and the
run ends on range 3's stop card, the plan's last. Nothing was parked in this range, so the
card has no lean table, and its second move is the finish:

````markdown
**Summary**: An item without `--for` lives five days, and a fallen item moves to the archive file instead of vanishing.

**Readout**:

```text
steps        3 of 3 landed
             - 8 7c2d1e0f4 · 6 d41a9b3c7 · 7 2f8e6a1b9
check        green: 9 of 9 checks, 3 landings
done-when    met
decisions    5 of 5 honored
constraints  4 of 4 honored
seam         held: 3 of 3 steps, no strays
diff         +88 -14 across 7 files
             - src/__tests__/cli.test.ts +17 -0
             - src/__tests__/life.test.ts +12 -0
             - src/__tests__/sift.test.ts +19 -2
             - src/cli.ts +11 -3
             - and 3 more
spent        9 min · green first run at every landing
```

**Your Call**:

- `looks good` → I record the review; back to the boundary
- `/plumbbob:finish` → I record it the same way, then write the report and close the build
- anything that reads as direction → I change the review and say what moved; nothing is recorded until you approve
- `expand`, or any question → I show more of what is there; nothing changes, and `show the stop` brings all of this back

| **Verdict** | ● Plumb |
| --- | --- |
| Stop | **Range 3** landed - fake four days with `SIFT_NOW`, read `sift` again, then `/plumbbob:finish` (details: [intent.md:66](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L66)) |
| Next Up | Nothing planned - /plumbbob:step or /plumbbob:finish |

**Recommendation**: Approve it once you have faked the four days. The gate was green at all three landings, and the archive file is the one `D4` named.

[more details](.plumbbob/detail.md)
````

Check for the Stop row reading `**Range 3** landed` with the plan's own words after it,
and for `Nothing planned` under Next Up. Leave the card waiting. Its call is yours to make
before you answer, and lessons 7 and 8 answer it.

## Try the Finished Tool

The stop asks you to fake four days. In the terminal from lesson 4, with the alias and
`SIFT_FILE` still set, build, add the passport the parser refused in lesson 5, then move
the clock. `SIFT_NOW` takes a date; step 4 chose the form, so read `src/bin.ts` if yours
wants more than a day:

```sh
pnpm build
sift add "renew passport" --for 2w
SIFT_NOW=2026-11-08 sift
```

```text
call the dentist      6d left
renew passport       10d left
```

The library book and the plants, three days and two of life on a four-day clock, are
gone from the list. The passport is the week the plan never had, read as fourteen days.
Now the file `D4` named:

```sh
cat ~/.sift.archive.json
```

Both fallen items are in it. The lean at plan time was deleted, because a list that
forgets should forget. The archive exists because you changed one line of a text file,
and the step that built it read your line the way it reads every Decision.

## With Your Agent

> Read step 7 and `D4 (archive-not-delete)` in intent.md and tell me whether step 7's
> done-when, as written, can be measured by a test, and what the test would have to read.
> Just tell me.

Check that it names the archive file by its path or its variable, and the list file
beside it, since "gone from the list" and "its fate" are two reads. An answer built from
our chat instead of the file has not done the exercise.

## Try It

1. Before the run, `/plumbbob:status`: the steps block lists 1 to 7 and then `▸ 8` with
   `← next` on the last row, and range 3's row reads `/plumbbob:build 8,6-7 · sonnet`.
   After the run, read it again: `✓` on every range. Nothing to put back; status only
   reads.
2. `/plumbbob:refine` with no focus is the attack: a cold read of the Frame and Decisions
   that appends its holes as open questions and ends on their table. Read it, then answer
   `yes to all leans`. Each resolved question becomes a Decision with its because, and
   nothing builds, since every step has landed. A lean that wants a new step gets
   `defer Q3 until the next build` instead. The Decisions stay; `D4` has company.

## Remember

- `step` sharpens the next step only, against the code that exists.
- A deferred question is yours to close, on its opener line, and the Decision beside it
  reads like every other.
- `intent.md` is a text file. Editing it by hand is a first-class move, and the build
  reads your line the way it reads the model's.

[← A Surprise Goes on the List, Then into the Plan](./05-park-and-harvest.md) · [When the Design Will Not Settle →](./07-spike-and-revert.md)
