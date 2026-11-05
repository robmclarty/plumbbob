# A Range Stops Where the Plan Said

Range 2 is a span, `/plumbbob:build 2-5`: four steps that land without a pause
between them, and a run that ends on a stop card reviewing all four at once.
The plan cut it that way because the item, the store, and the two commands are
mechanical once the shelf life is settled, and four pauses for four mechanical
steps would be four interruptions nobody asked for. A mason does not hold the
line against every stone; they lay a course and hold it against the course.
About thirty minutes.

## Run the Span

The boundary's range line said `**Range 2** on Sonnet`. Select it, then type
the run:

```text
/model sonnet
```

```text
/plumbbob:run
```

The header this time names a grant:

```text
run  range 2 of 3 · steps 2-5 · ends at step 5's boundary
     stop: add three things you own and read `sift` once before the default and the fall-off build on it; settle Q2 here
     grant: steps 2-5
```

That third line is the whole difference from lesson 3. The turn hook minted
`steps 2-5` from the plan as you pressed enter, and the latch will land those
four steps and no others
([D96 (plan-names-the-grant)](../decisions.md#d96)). The grant came from the
plan, not from the agent's opinion of it and not from a flag you typed.

Each step still runs the whole tick but the pause: entered, built within its
seam, checked, reviewed against its done-when, and checkpointed on green. Open
a second terminal on the repo and watch the commits arrive:

```sh
git log --oneline
```

Four arrive over ten to fifteen minutes on sonnet, in order, each with the
step's title as its subject. As the run enters step 5 it says so:

```text
plumbbob: building step 5
plumbbob: step 5 is the top of the range you granted
  → land it on green, then stop at the boundary
```

If a check goes red or a self-review finds a mismatch along the way, the run
halts at that step's pause, on the card lesson 3 read, with the step unlanded.
Reply as you did there, then `looks good`. When that landing completes the
range, the stop card follows in the same turn; when steps remain, the range
line beneath Next Up names the run for what is left, `(steps 4-5)`, and you
type `/plumbbob:run` again ([D85 (range-top-lands)](../decisions.md#d85)). A
halt is the gate working, not the lesson failing.

## Read the Stop Card

When step 5 lands, the run ends on the stop card. Yours will differ in its
SHAs, its sentences, and what the agent parked along the way; check for the
`steps` row with four SHAs, a `Stop` row naming the plan's stop, and a
Harvested part if anything was parked. Roughly:

````markdown
**Summary**: `sift add` stores an item with a life in days in one JSON file, and bare `sift` prints what is still alive, oldest first, with the days each has left.

**Readout**:

```text
steps        4 of 4 landed
             - 2 9f3c1a0 · 3 c27d4e8 · 4 1b8e6f5 · 5 7a4d2c9
check        green: 9 of 9 checks, 4 landings
done-when    met
decisions    2 of 2 honored
constraints  4 of 4 honored
seam         held: 4 of 4 steps, no strays
diff         +318 -9 across 11 files
             - package.json +3 -0
             - src/__tests__/cli.test.ts +41 -0
             - src/__tests__/item.test.ts +27 -0
             - src/__tests__/sift.test.ts +36 -8
             - src/__tests__/store.test.ts +29 -0
             - src/bin.ts +12 -0
             - src/cli.ts +58 -0
             - and 4 more
spent        14 min · green first run at every landing
```

**Harvested**: **1** of 1 parked idea open

| Park | Why it matters | Lean |
| --- | --- | --- |
| **P1**: [empty list message](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/build-log.md#L34) | bare `sift` on an empty list prints nothing, and nothing can read like a crash | tangent: the spec's sample never shows an empty list, and a blank print is still the truth |

**Your Call**:

Approving locks in each lean above; to change one, say so first (`make P1 a blocker`).

- `looks good` → I record the review and every lean as proposed, folding a blocker into the plan; back to the boundary
- `/plumbbob:run` → I record them the same way, then run range 3 of 3 to its stop
- anything that reads as direction → I change the lean and say what moved; nothing is recorded until you approve
- `expand`, or any question → I show more of what is there; nothing changes, and `show the stop` brings all of this back

| **Verdict** | ● Plumb |
| --- | --- |
| Stop | **Range 2** landed - add three things you own and read `sift` once before the default and the fall-off build on it; settle Q2 here (details: [intent.md:60](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L60)) |
| Next Up | **Step 6** on Haiku - feat(cli): give an item the default life when --for is left off (details: [intent.md:45](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L45)) |
|  | **Range 3** on Sonnet: /plumbbob:run (steps 6-7) |

**Recommendation**: Approve it, then add three things you own and read `sift` once before range 3 builds on it. The gate was green at all four landings, the seam held at each, and the one park is a message the spec never asked for.

[more details](.plumbbob/detail.md)
````

The Summary is the range's, not step 5's, and the `steps` row names each
landing by its SHA, so `git show 9f3c1a0` opens one. The Harvested part is
the range's harvest: during step 5 the agent met something the spec never
covered and parked it rather than chasing it, and the card lists it with a
lean. Yours may hold a different row, or none, in which case
the part is absent and Your Call carries no lock-in line. A row is three
columns, the park's handle and a linked title, why it matters, and the class
the model leans toward; lesson 5 reads that table closely. The `Stop` row at
the foot is the plan's stop as you wrote it, and the recommendation speaks to
it.

## Ask for a Step While the Card Waits

Break it. With the card on screen, type:

```text
/plumbbob:build
```

```text
plumbbob: no step entered (range 2 of 3's stop card is waiting for its reply)
  → reply to the card; looks good records it, and /plumbbob:run records it, then runs range 3 of 3
```

A step entered now would write its pause over the range's review in
`.plumbbob/detail.md` before your reply recorded it, so the build refuses
before it writes anything and names the replies that record the card. Type
`! plumbbob status` and the ranges block marks whose card it is:
`✓ 2  /plumbbob:build 2-5 · sonnet   ← stop card waiting`.

## Make the Call the Stop Asked For

The stop said to add three things you own and read `sift` once. In the second
terminal:

```sh
pnpm build
alias sift='node dist/bin.js'
export SIFT_FILE=~/learn/sift.json
sift add "return library book" --for 3d
sift add "call the dentist" --for 10d
sift add "water the plants" --for 2d
sift
```

```text
return library book   3d left
call the dentist     10d left
water the plants      2d left
```

Oldest first, as `D2` decided, with the days each has left. This is the one
place the plan said a human should read the list before the default and the
fall-off build on it. The stop's last clause, settle `Q2` here, is yours to do
by hand, and lesson 6 does it once lesson 5's harvest has moved the plan;
nothing on this card waits on it. Keep the terminal, the alias, and
`SIFT_FILE`: lesson 5 starts there.

## Settle It in One Reply

```text
looks good
```

One reply settles the whole card, the review and every lean as proposed
([D102 (settle-in-one-reply)](../decisions.md#d102)). The skill records
through `plumbbob harvest`: the park flips to `[x]`, a dated Harvest line is
written, and the range's review lands beneath `range 2 of 3's stop recorded`
in the Log. It commits nothing; the record rides the next step's checkpoint.

```text
**Stop**: **Range 2** recorded (1 tangent)

| **Next Up** | **Step 6** on Haiku - feat(cli): give an item the default life when --for is left off (details: [intent.md:45](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L45)) |
| --- | --- |
|  | **Range 3** on Sonnet: /plumbbob:run (steps 6-7) |
| Parked | **0** of 1 open |
```

The record ends on Next Up with no Verdict, since nothing was measured. The
card was the run's ending by design
([D100 (stop-card)](../decisions.md#d100)): a range that lands four steps
unread owes one review, and the card puts the review, the readout, and the
parks on one screen.

## The Moves and What They Do

Every card teaches its own moves in its Your Call block. This is the set
across the three cards you have met, the plan card, the pause, and the stop:

| When you say | You mean | And you'll see |
| --- | --- | --- |
| `looks good` | land it, or record it, as it stands | `**Checkpoint**: Step 1 complete`, `**Stop**: **Range 2** recorded`, or `**Plan**: committed` |
| `expand 2` | show me section 2 of the detail file; change nothing | the section, closed by one `**Next Up**` line |
| a sentence of direction | change this before I approve | what moved and what the check found, closed by the same line; nothing lands |
| `show the pause`, `show the stop` | print the card again | the whole block, with any change you asked for in it |
| `revert` | wind the step back to the last checkpoint | a clean tree and the step open again; a stop card offers no revert, since its work is in commits |
| `yes to all leans` | at the plan card: take every lean as the answer | a Decision per question, and the questions table gone |
| `defer Q2 until <what settles it>` | leave this question to the work | the question in a Deferred table, `*deferred:*` on its opener |
| `make P1 a blocker` | change one lean before I approve | which lean moved, on one line; `show the stop` shows the row rewritten |
| `keep it local` | at the plan card: keep the build folder off the branch | the plan committed record-only |

## With Your Agent

> Read the four step entries range 2 wrote in build-log.md's Log and tell me
> which step took longest and why. Just tell me.

Check that it reads the `spent` row beneath each step's dated line and names
the step by its number, rather than guessing from the diff sizes.

## Try It

1. Find the review where it lives now:

   ```sh
   grep -n "stop recorded" .plumbbob/builds/*/build-log.md
   ```

   Open the file at that line. The Summary, the Readout, and the lean table
   beneath it are the card you approved, now in a file that rides the branch.
   Nothing to put back.
2. Check the `spent` row's arithmetic:

   ```sh
   cat .plumbbob/builds/*/stats.json
   ```

   Find the four `landedAt` stamps; the row ran from step 2's `startedAt` to
   step 5's `landedAt`. Nothing to put back.

## Remember

- A span's stop is a review and a bare range's stop is a decision, and the
  plan says which.
- The grant was minted from the plan when you pressed enter, and the latch
  lands those steps and no others.
- One reply settles a card.

[← A Step Lands Only When You Say So](./03-one-step.md) · [A Surprise Goes on the List, Then into the Plan →](./05-park-and-harvest.md)
