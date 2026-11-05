# The Plan Is a File

The plan skill writes the build folder and nothing outside it, and its turn ends on a card,
because a plan nobody read is a plan the model wrote for itself. This lesson runs the
skill on your spec, reads the file it wrote, settles the two open questions two
different ways, changes one line of the plan by hand, and commits the plan on its
own. About twenty-five minutes.

## Absorb the Spec

Planning is where a strong model pays for itself, so switch to one first, then hand
the skill the spec:

```text
/model opus
/plumbbob:plan docs/spec.md
```

The skill opens a session before it writes a word, and the CLI reports it:

```text
**Session**: started "sift: a list that forgets" (baseline 1c0d3a9e2)
  → frame and decide in .plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md, then build a step
```

The baseline is your scaffold commit, and the build folder is named by the date and
the title. Then the skill writes `intent.md`, shows it, gives it a cold read, and ends
on the plan card. Read the file first, not the chat:

```sh
cat .plumbbob/builds/*/intent.md
```

Yours will read differently. Check for a Frame of four lines taken from the spec,
Decisions with a `*because*` each (`D1 (days-only-unit)` and `D2 (oldest-first)`
in the target), four Constraints from the rules, seven steps, each with a
`done when:` a test can measure and a `seam:` naming its files, three build ranges,
and two open questions in the expanded form:

```markdown
## Open questions

- <a id="q1"></a>**Q1 (default-life)**: How long does an item live when `--for` is left off?, *resolve by:* decide
  - *plain:* every `sift add` without a number needs an answer, and the number is the one most people will live with.
  - *lean:* 7 days; a week is the span most things I mean to do fall into.
- <a id="q2"></a>**Q2 (fall-off-fate)**: Is an item that falls off deleted or archived to a second file?, *resolve by:* decide
  - *plain:* deleting is one line and forgets for good; an archive is a second file and a second path to keep.
  - *lean:* deleted, because a list that forgets should forget.
```

The whole target plan is in [`workshop/sift-plan.md`](../../workshop/sift-plan.md);
the lessons check against it, never against your chat.

## Read the Plan Card

The turn ends on the card. The questions ride above the moves, a row each, the first
sentence of each line, with the model's lean in the last column
([D118 (questions-table)](../decisions.md#d118)):

````markdown
---

**Open questions**: **2** to answer

| Question | Why it matters | Lean |
| --- | --- | --- |
| **Q1**: [How long does an item live when `--for` is left off?](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L67) | every `sift add` without a number needs an answer, and the number is the one most people will live with | 7 days; a week is the span most things I mean to do fall into |
| **Q2**: [Is an item that falls off deleted or archived to a second file?](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L70) | deleting is one line and forgets for good; an archive is a second file and a second path to keep | deleted, because a list that forgets should forget |

**Your Call**:

- `looks good` → I mark the plan decided and commit it, so `.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/` rides this branch into the PR; /plumbbob:run runs range 1 from Step 1
- `yes to all leans`, or `yes to all leans except Q3: <your answer>` → I resolve each question in the table on its opener line, record the decision it settles, and show this card again
- `defer Q3 until <what settles it>` → I mark Q3 deferred on its opener line, with what will settle it, and show this card again
- `expand`, or any question → I show more of what is there; nothing changes
- anything that reads as direction → I take it as what to sharpen; the plan is cheap to change now
- `keep it local` → I run `plumbbob start --local`, so the plan commits record-only and the folder stays off the branch

| **Next Up** | **Step 1** on Haiku - feat(life): parse a shelf life written in days (details: [intent.md:30](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L30)) |
| --- | --- |
|  | **Range 1** on Haiku: /plumbbob:run (step 1 to its pause) |

**Recommendation**: Approve it. Every step carries a done-when a test can measure, the seams name files the scaffold has or the step creates, and no range runs through an open question.

[more details](.plumbbob/detail.md)
````

The `Q3` in two of the moves is a placeholder; you name the question. The CLI
measured everything on the card from the file except the why column, the lean
column, and the recommendation, which the model wrote. Nothing has landed, so
`revert` is not among the moves, and the state table is headed by Next Up: step 1,
on haiku, in range 1, which `/plumbbob:run` will run to its pause. The `looks good`
row says what approving publishes, the build folder on this branch and into the pull
request, and `keep it local` is the way out, offered as a move rather than a setting
([D117 (publish-on-the-card)](../decisions.md#d117)).

## Ask Before You Approve

A card shows once; everything you say at it is a reply, and a reply changes nothing
unless it reads as direction ([D110 (reply-after-the-card)](../decisions.md#d110)).
Try one of each:

```text
expand 1
```

The reply is the cold read's first finding, from `## 1` of `.plumbbob/detail.md`,
and it ends on one `**Next Up**` line pointing back at step 1; the card does not
print again. Now a question:

```text
why is step 3 on sonnet?
```

The answer comes from the step's own `model:` line (`fs and temp dirs`), closes on
the same one line, and `git status` shows the plan untouched. A question costs a
reply and never a change.

## Leave One Question to the Work

The second question is easier to call with a list in front of you than on paper, and
range 2's stop is where you will have one: it says to add three things you own and
read `sift` once. So leave it there:

```text
defer Q2 until range 2's stop shows what falling off looks like
```

The skill runs `plumbbob defer`, which writes the marker and prints its ending:

```text
**Deferred**: Q2 (fall-off-fate) until range 2's stop shows what falling off looks like
```

then shows the card again with `Q2` in a `Deferred` table of its own beneath the
questions table, what will settle it where the lean was. In the file, the opener
line now reads:

```markdown
- <a id="q2"></a>**Q2 (fall-off-fate)**: Is an item that falls off deleted or archived to a second file?, *deferred:* 2026-11-04, until range 2's stop shows what falling off looks like
```

A deferred question is still open and every count says so, but it is no longer a
call you owe, and `yes to all leans` never reaches it
([D120 (deferred-questions)](../decisions.md#d120),
[D123 (defer-records)](../decisions.md#d123)). Deferring is your move, never the
model's.

## Settle the Rest in One Reply

```text
yes to all leans
```

One reply resolves every question still in the table. `Q1`'s opener swaps its
`*resolve by:*` for `*resolved:* 2026-11-04, 7 days`, and a Decision is appended
with the reason the lean gave:

```markdown
- <a id="d3"></a>**D3 (default-life)**: an item left without `--for` lives 7 days, *because* a week is the span most things I mean to do fall into
```

The card comes back with no questions table, only `**Deferred**: 1 left to the work`
above the Deferred table: no call waits on you, and one waits on the work.

## Change One Line by Hand

The lean said seven days. Five is closer to how long you leave a thing before you
stop seeing it, and the plan is a text file. Open `intent.md` and change this line
by hand:

```markdown
- <a id="d3"></a>**D3 (default-life)**: an item left without `--for` lives 7 days, *because* a week is the span most things I mean to do fall into
```

to

```markdown
- <a id="d3"></a>**D3 (default-life)**: an item left without `--for` lives 5 days, *because* a work week is as long as I leave a thing before I stop seeing it
```

If `Q1`'s resolved marker names the number too, change it there as well, so the
file agrees with itself. The slug stays `default-life`: it names the question, not
the answer, so it cannot lie when the number changes. Nothing has to be told. Step 6
reads this line when it builds and its test will assert 5, because the model reads
the file before every step, and the chat is not where the plan lives.

## Approve It

```text
looks good
```

The skill runs `plumbbob checkpoint --plan`, which commits the build folder alone
and prints its own close:

```text
**Plan**: committed (7d2e94fb0, details: [build-log.md:67](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/build-log.md#L67))

| **Next Up** | **Step 1** on Haiku - feat(life): parse a shelf life written in days (details: [intent.md:30](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L30)) |
| --- | --- |
|  | **Range 1** on Haiku: /plumbbob:run (step 1 to its pause) |
```

```sh
git log --oneline -3
```

```text
7d2e94f chore(sift): plan
b31a0c2 docs: add the spec
1c0d3a9 chore: scaffold with checkride
```

The plan is committed on its own, so step 1's diff will hold step 1 and nothing
else, and history reads scaffold, spec, plan, then steps. Your hand edit went into
this commit with the rest; the file is the plan, whoever typed the line.

## Look at the Dashboard

```text
/plumbbob:status
```

```text
PlumbBob — sift: a list that forgets   [DESIGN]

  steps  0/7 done
  ▸ 1  feat(life): parse a shelf life written in days   ← next
        done when: `parseLife('3d')` yields 3 days and `'3'`, `'x'` yield the refusal `a shelf life is written in days, like 3d`, under test
        seam: src/life.ts, src/__tests__/life.test.ts
        model: haiku (one function, fully specified)
    2  feat(item): tell a live item from one past its life
    3  feat(store): keep the list in one JSON file
    4  feat(cli): add an item with sift add
    5  feat(cli): print what is still alive with bare sift
    6  feat(cli): give an item the default life when --for is left off
    7  feat(store): settle what happens to an item that falls off

  ranges  0 of 3 done
  ▸ 1  /plumbbob:build 1 · haiku   ← next
        stop: at step 1's pause, approve the shape of a shelf life (`3d`, days only, and the refusal text) before anything leans on it
    2  /plumbbob:build 2-5 · sonnet
        stop: add three things you own and read `sift` once before the default and the fall-off build on it; settle Q2 here
    3  /plumbbob:build 6-7 · sonnet
        stop: fake four days with `SIFT_NOW`, read `sift` again, then `/plumbbob:finish`

last checkpoint  none yet
parked 0 · open questions 1 deferred

next → run range 1 of 3 — `/plumbbob:run` (step 1 to its pause)
```

The ranges block is the plan's answer to where the build stops for you, and a range
ends where a human call is due and nowhere else
([D92 (build-ranges)](../decisions.md#d92)). Range 1 is bare, one step to its pause,
because the shape of a shelf life is a call to make before anything leans on it.
Range 2 is a span, four steps and then a review, with `Q2` waiting at its stop. The
`▸` sits on range 1, and the last line names the one move. You need not type a
range's command; the card names the run instead.

## With Your Agent

> Read intent.md in the build folder and tell me which step would be the worst one to get wrong, and why. Edit nothing.

Check that it names step 1, because every later step leans on the shape of a life.
An agent that offers to rewrite the step instead is drifting: the plan is yours to
change, and a plan card is where you change it.

## Try It

1. Confirm the plan commit touched nothing outside the build folder:

   ```sh
   git diff --stat HEAD~1 HEAD
   ```

   Every path listed sits under `.plumbbob/builds/`. Nothing to put back.
2. Open `build-log.md` in the build folder and read `## Log`. Its first entry is the
   plan's line with the cold read beneath it: the record opens on the read the plan
   got before anyone approved it. Nothing to put back.

## Remember

- The plan is committed alone, so step 1's diff is clean and history reads scaffold,
  spec, plan, steps.
- A question deferred still counts as open; a question resolved becomes a Decision
  with its because.
- A range ends where a human call is due and nowhere else, and the card names the
  run, never the range's command.

[← The Spec Comes Before the Plan](./01-the-spec.md) · [A Step Lands Only When You Say So →](./03-one-step.md)
