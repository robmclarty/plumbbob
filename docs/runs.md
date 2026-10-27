# Running a plan by its ranges

A mason does not hold the plumb line against every stone. They lay a course, hold the line
against the course, and set the next one only once it reads true; most stones need no
reading of their own, because the course gets one.

A build range is that course. The plan cuts its steps into ranges, each ending where a call
is due, and `/plumbbob:run` lays one: it lands what the range names, each step on a green
check with no pause between them, and stops where the plan said the call is yours. A range
that ends on a decision stops at its step's pause, before that step lands. A range that ends
on a review stops on the **stop card**, which holds the line against the whole course at
once: what the range built, a readout measured across its steps, and every idea parked
along the way with a class proposed for it, all settled in one reply.

This page is the guide to that one move. It walks a plan through three runs, every card as
this checkout's CLI renders it, then drives the same plan by hand with `/plumbbob:build`,
`/plumbbob:harvest`, and `/plumbbob:order`, so the two read side by side. A whole session
from plan to finish is [`happy-path.md`](happy-path.md); the shape of every card here is
specified in [`presentation.md`](presentation.md#the-build-ranges).

## What a run reads

A run reads three sections of the build, and all three live in the build's own files, never
in the chat:

| Section | File | What the run takes from it | Who writes it |
| --- | --- | --- | --- |
| `## Build ranges` | `intent.md` | the steps it may land, and where it stops | `/plumbbob:plan`, kept true by step, refine, harvest, and `plumbbob order` |
| `## Build order` | `intent.md` | the sequence it walks those steps in | `/plumbbob:order`, or a skill that adds a step to land early |
| `## Park list` | `build-log.md` | the ideas the stop card proposes a class for | `/plumbbob:park`, or the model mid-step |

**The plan names the steps; you type the run.** `/plumbbob:run` runs what is left of the
range holding the next undone step, and `/plumbbob:run 3` runs range 3 by its item number
([D95 (run-verb)](decisions.md#d95)). The turn hook reads the plan as you press enter and
mints a grant for exactly the steps that range has left, and the latch lands those and no
others ([D96 (plan-names-the-grant)](decisions.md#d96)). You never type a step number, and
the model never decides how far it may go.

## The example plan

The example is five steps to add structured request logging, cut into three ranges. Step 1
picks the field names every later step writes, so it runs alone and stops at its own pause.
Steps 2 and 3 are wiring a review can wait for, and steps 4 and 5 close the goal:

````markdown
## Steps

1. [ ] feat(log): add a JSON line logger, **done when:** `test/log.test.ts` parses every line it writes
   - seam: `src/log.ts`, `test/log.test.ts`
   - model: opus (the field names every later step leans on)
2. [ ] feat(log): redact secret fields by name, **done when:** `test/redact.test.ts` passes
   - seam: `src/redact.ts`, `test/redact.test.ts`
   - model: sonnet (fully specified by D2)
3. [ ] feat(http): log every request with its id, **done when:** a request in `test/middleware.test.ts` writes one line carrying its id
   - seam: `src/middleware.ts`, `test/middleware.test.ts`
   - model: sonnet (mechanical wiring)
4. [ ] feat(http): log how long each request took, **done when:** the line carries `ms`, set by the test's fake clock
   - seam: `src/middleware.ts`, `test/middleware.test.ts`
   - model: sonnet (mechanical wiring)
5. [ ] docs(log): document the fields a line carries, **done when:** `docs/logging.md` names every field the logger writes
   - seam: `docs/logging.md`
   - model: sonnet

## Build order

## Build ranges

Settle the field names alone, land the logger's wiring in one run, then the timing and the docs in another.

1. `/plumbbob:build 1`, **stop:** at step 1's pause, settle the field names every line will carry
   - model: opus
2. `/plumbbob:build 2-3`, **stop:** read one real request's line before the timing and the docs build on it
   - model: sonnet
3. `/plumbbob:build 4-5`, **stop:** read the docs against a real line, then `/plumbbob:finish`
   - model: sonnet
````

An item is the command that defines the range, then `**stop:**` and the call that ends it,
then the model to run it on. The command's form says which kind of stop it is
([D92 (build-ranges)](decisions.md#d92)). A bare `1` builds step 1 to its pause, so the call
is made before the step lands; a span such as `2-3` lands every step it names and stops at
the boundary after the last, so the call is a review of what landed. The `## Build order`
line is empty, so the steps build in their numbering until something moves them.

`/plumbbob:status` lists the ranges beneath the steps, and its pointer already names the run:

```text
  ranges  0 of 3 done
  ▸ 1  /plumbbob:build 1 · opus   ← next
        stop: at step 1's pause, settle the field names every line will carry
    2  /plumbbob:build 2-3 · sonnet
        stop: read one real request's line before the timing and the docs build on it
    3  /plumbbob:build 4-5 · sonnet
        stop: read the docs against a real line, then `/plumbbob:finish`

last checkpoint  none yet
parked 0 · open questions 0

next → run range 1 of 3 — `/plumbbob:run` (step 1 to its pause)
```

## Range 1: a bare range stops at its step's pause

Type `/plumbbob:run`. The skill opens on the run header `plumbbob status --run` prints above
the dashboard:

```text
run  range 1 of 3 · step 1 · ends at step 1's pause
     stop: at step 1's pause, settle the field names every line will carry
     grant: none, as a bare range builds to its pause
```

The first line is the range, what is left of it, and where the run ends. The second is the
call the plan reserved. The third is what the hook minted at the keystroke, and for a bare
range that is nothing, because the pause is the point. The run builds step 1 exactly as
`/plumbbob:build 1` would (enter it, implement it, check it, review it against the plan) and
stops on the step's pause card, whose recommendation speaks to the stop: here, the five
field names. The card itself is the one [`happy-path.md`](happy-path.md#3-run-the-first-range-plumbbobrun)
shows whole.

Say `looks good` and the step lands. The boundary's Range row names the next run and the
steps it will land:

```text
**Checkpoint**: Step 1 complete (8cae4b906, details: [build-log.md:67](.plumbbob/builds/2026-07-14-add-structured-request-logging/build-log.md#L67))

| **Verdict** | ● Plumb |
| --- | --- |
| Next Up | Step 2 of 5 - feat(log): redact secret fields by name (model: **Sonnet**, details: [intent.md:27](.plumbbob/builds/2026-07-14-add-structured-request-logging/intent.md#L27)) |
| Range | 2 of 3: /plumbbob:run (steps 2-3) |
```

The bold model is range 2's own, since the run is the range, and the range's first step is
not always its hardest ([D93 (range-on-the-card)](decisions.md#d93)).

## Range 2: a span lands its steps and ends on the stop card

Type `/plumbbob:run` again. This time the hook mints a grant, and the header says so:

```text
run  range 2 of 3 · steps 2-3 · ends at step 3's boundary
     stop: read one real request's line before the timing and the docs build on it
     grant: steps 2-3
```

Inside the run, each step still passes every beat of the tick but the pause: the check, the
self-review against the step's done-when and the plan's decisions and constraints, and a
checkpoint of its own. A wrong turn still costs one step to revert. As the run enters its
last step, `plumbbob build` says so, so the model lands it rather than holding it at a pause
([D85 (range-top-lands)](decisions.md#d85)):

```text
plumbbob: building step 3
plumbbob: step 3 is the top of the range you granted
  → land it on green, then stop at the boundary
```

Ideas that arrive mid-step are parked, not chased; the model parks what it meets with
`plumbbob park` and goes straight back to the step:

```text
**Parked**: should a request that arrives with no id get one generated? (tangent)

**Next Up**: Back to Step 3 of 5 - feat(http): log every request with its id
```

No harvest runs between the steps inside a range, so the parks wait for its stop. When step 3
lands, its checkpoint prints the boundary with a `Stop` row, but that boundary is not
where the turn ends. The hook marked the run in `.plumbbob/RUN` as it minted the grant, so
the checkpoint that completes the range owes the stop card, and the check at the turn's end
holds a turn that tries to close without it ([D103 (stop-latched)](decisions.md#d103)). The
model writes the range's review into `.plumbbob/detail.md`, drawn from the steps' commits and
their Log entries rather than from recall, and `plumbbob handoff --stop` renders the card
([D100 (stop-card)](decisions.md#d100)):

````markdown
**Summary**: Every request now writes one JSON line carrying its id, with `password`, `token`, and `authorization` redacted before it is written.

**Readout**:

```text
steps        2 of 2 landed
             - 2 2e47835 · 3 9d2de70
check        green: 1 of 1 checks, 2 landings
done-when    met
decisions    2 of 2 honored
constraints  1 of 1 honored
seam         held: 2 of 2 steps, no strays
diff         +4 -0 across 4 files
             - src/http/request-log.ts +1 -0
             - src/log/logger.ts +1 -0
             - src/log/redact.ts +1 -0
             - test/request-log.test.ts +1 -0
spent        39 min · green first run at every landing
```

**Harvested**: 2 of 2 parked ideas open

| Park | What it is | Why it matters | Lean |
| --- | --- | --- | --- |
| P1 · missing request id | should a request that arrives with no id get one generated? (tangent) | a line with no id cannot be traced to its request | tangent: an id is still logged when the client sends one, so the line stays parseable without it |
| P2 · buffered lines | the logger could buffer lines and flush them on exit (tangent) | a write per request costs a syscall under load | tangent: a buffer is a performance call this goal does not make, and D1 (json-lines) writes each line as it happens |

**Your Call**:

Approving locks in each lean above; to change one, say so first (`make P1 a blocker`).

- `looks good` → I record the review and every lean as proposed, folding a blocker into the plan; back to the boundary
- `/plumbbob:run` → I record them the same way, then run range 3 of 3 to its stop
- anything that reads as direction → I change the lean and say what moved; nothing is recorded until you approve
- `expand`, or any question → I show more of what is there; nothing changes, and `show the stop` brings all of this back

| **Verdict** | ● Plumb |
| --- | --- |
| Stop | Range 2 of 3 landed - read one real request's line before the timing and the docs build on it (details: [intent.md:48](.plumbbob/builds/2026-07-14-add-structured-request-logging/intent.md#L48)) |
| Next Up | Step 4 of 5 - feat(http): log how long each request took (model: **Sonnet**, details: [intent.md:33](.plumbbob/builds/2026-07-14-add-structured-request-logging/intent.md#L33)) |
| Range | 3 of 3: /plumbbob:run (steps 4-5) |

**Recommendation**: Approve it, then curl one request and read its line before the timing builds on it. The gate was green at both landings and both parks are future work.

[more details](.plumbbob/detail.md)
````

The Summary is the whole range's, not the last step's, and so are the numbered sections the
model wrote behind the `more details` link. The Readout is measured across the range
([D101 (range-readout)](decisions.md#d101)): the `steps` row names each landing by its
checkpoint, so `git show 2e47835` opens one; `check` counts the landings behind it; `seam`
holds each step's commit to that step's own seam; `diff` sums the commits and lists the
files they changed; `spent` runs from the first step's start to the last step's landing.
Under **Harvested**, each open park is a row of the lean table under a handle, `P` and its
place in the park list counting the harvested lines too, so `P1` is the first line ever
parked and stays `P1` for the life of the build
([D105 (park-handles)](decisions.md#d105)). The park's text is the CLI's, read from the
list; the title, why it matters, and the lean are the model's, the lean `tangent` whenever
it is unsure ([D112 (lean-table)](decisions.md#d112)). The plan's stop rides the state
table at the card's foot, under the Verdict.

## One reply settles the card

The card's proposals are settled in one reply, not one reply per park
([D102 (settle-in-one-reply)](decisions.md#d102)), and the Your Call block names the
replies:

| Your reply | What happens |
| --- | --- |
| `looks good` | every lean is locked in: a confirmed blocker folds into `intent.md` first, then `plumbbob harvest` records the parks and the range's review; back to the boundary |
| `/plumbbob:run` | the same record, then the next range's run in the same turn |
| `make P1 a blocker`, or any other change | the model rewrites that line of the detail file, says what moved, and closes on one line; nothing is recorded yet, and `show the stop` brings the card back with the change in it |
| `expand 2`, or any question | answered from the detail file, the range's commits, or the Log; nothing changes, and the answer closes on one line |
| `/plumbbob:finish` | on the plan's last range: the same record, then the report and the final commit |

You read the card and disagree about P1: a line with a null id is a line nobody can trace.
Say `make P1 a blocker` and the model rewrites that proposal, says which lean moved, and
closes on one line, since the card is already on screen
([D110 (reply-after-the-card)](decisions.md#d110)). Say `show the stop` and the card comes
back with the lean as it will be recorded, and the example in Your Call flips to name the
change you could still make:

```text
| P1 · missing request id | should a request that arrives with no id get one generated? (tangent) | a line with no id cannot be traced to its request | blocker: a line with a null id cannot be traced, and step 5 would document a field that is often empty |
| P2 · buffered lines | the logger could buffer lines and flush them on exit (tangent) | a write per request costs a syscall under load | tangent: a buffer is a performance call this goal does not make, and D1 (json-lines) writes each line as it happens |

Approving locks in each lean above; to change one, say so first (`make P1 a tangent`).
```

A change and a question both close on the reminder, and only `show the stop` brings the
card back:

```text
**Next Up**: Back to Range 2 of 3's stop - read one real request's line before the timing and the docs build on it
```

While the card waits, `/plumbbob:build` refuses to enter a step, because the step's pause
would write over the range's review in the detail file before your reply recorded it. The
refusal names the reply that records the card:

```text
plumbbob: no step entered (range 2 of 3's stop card is waiting for its reply)
  → reply to the card; looks good records it, and /plumbbob:run records it, then runs range 3 of 3
```

## A blocker joins a range still to come

Now reply `/plumbbob:run`. Before anything is recorded, the model folds the confirmed blocker
into the plan by the harvest skill's rules. The call becomes a Decision, slugged at birth
(`D3 (generate-missing-id)` in the example's own numbering). The work becomes step 6, the
next free number, since a step keeps its number for life. Step 6 goes into a range still to
come, never into range 2: that range has landed, its call is the one this card is making,
and a step added to it would reopen it. The docs in step 5 must describe a generated id, so
the model places step 6 first with `plumbbob order 6 4 5`, and the verb files the step in
the range the new order puts it in
([D109 (ranges-follow-the-order)](decisions.md#d109)). Step 6 now builds ahead of range 3's
steps, so range 3's command becomes `/plumbbob:build 6,4-5`, written in the order it builds:

```text
**Build order**: 6, 4, 5

**Build ranges**: range 3 of 3 re-cut (steps 6,4-5)

**Next Up**: Step 6 of 6 - feat(http): generate a request id when the client sends none (model: **Sonnet**, details: [intent.md:40](.plumbbob/builds/2026-07-14-add-structured-request-logging/intent.md#L40))
```

Then `plumbbob harvest` records the stop ([D104 (harvest-records)](decisions.md#d104)). It
flips both parks in the list, writes a dated Harvest line for each, and writes the range's
review beneath a dated `range 2 of 3's stop recorded` line in the build-log's Log, where it
rides the branch into the PR. It commits nothing; the record rides the next step's
checkpoint:

```text
**Stop**: Range 2 of 3 recorded (1 blocker, 1 tangent)

| **Next Up** | Step 6 of 6 - feat(http): generate a request id when the client sends none (model: **Sonnet**, details: [intent.md:40](.plumbbob/builds/2026-07-14-add-structured-request-logging/intent.md#L40)) |
| --- | --- |
| Range | 3 of 3: /plumbbob:run (steps 6,4-5) |
| Order | 6, 4, 5 |
| Parked | 0 of 2 open |
```

Here the run you typed stops, and the reason is the grant. The hook minted it when you
pressed enter, from the plan as it stood then, and the record re-cut range 3 afterward. The
run reads `plumbbob status --run` again once the record is in, and the header names the gap:

```text
run  range 3 of 3 · steps 6,4-5 · ends at step 5's boundary
     stop: read the docs against a real line, then `/plumbbob:finish`
     grant: steps 4-5, unlike the run
```

A run that walked `steps 4-5` would halt before step 6, the very step its own harvest added.
So the turn ends on the record instead, whose Range row already names the re-cut run, and you type
it. When the record changes nothing the run would walk, `/plumbbob:run` at the card records
and walks in the same turn.

## Range 3: walked in build order

Type `/plumbbob:run`. The hook reads the re-cut plan, and the grant now covers the range:

```text
run  range 3 of 3 · steps 6,4-5 · ends at step 5's boundary
     stop: read the docs against a real line, then `/plumbbob:finish`
     grant: steps 4-6
```

A range names plan numbers, and the build order says when each one builds. The plan writes
range 3 as `6,4-5` and the grant holds the same set in its normal form, `steps 4-6`; the
walk starts at the range's first undone step in build order and takes the next one after
each landing, so `plumbbob build` enters step 6, then 4, then 5
([D91 (step-list-grants)](decisions.md#d91)). The header's bracket, `steps 6,4-5`, is that
walk written down. When step 5 lands, the run ends on
range 3's stop card. On the plan's last range the card's second move is the finish:

```text
- `looks good` → I record the review; back to the boundary
- `/plumbbob:finish` → I record it the same way, then write the report and close the build
```

Nothing was parked in range 3, so the card has no Harvested part and Your Call carries no
line about leans. Read the docs against a real line, reply `/plumbbob:finish`, and the finish
skill records the card the way `looks good` would before it writes the report.

## The same plan, by hand

Everything a run does has a manual move beneath it, and the run reads the build skill for
every step it builds, so the two cannot drift apart ([D99 (one-loop)](decisions.md#d99)).
Here is the same plan, with the same three stops honored and the same blocker found, driven
three ways after the plan is approved:

| The moment | With runs | With typed ranges | A step at a time |
| --- | --- | --- | --- |
| Range 1: step 1, a call at its pause | `/plumbbob:run`, `looks good` | `/plumbbob:build 1`, `looks good` | `/plumbbob:build`, `looks good` |
| Range 2: steps 2 and 3, a review after | `/plumbbob:run` | `/plumbbob:build 2-3` | `/plumbbob:build`, `looks good`, twice |
| The parks range 2 piled up | `make P1 a blocker`, then `/plumbbob:run` | `/plumbbob:harvest`, `make P1 a blocker`, `looks good` | the same three |
| Range 3: steps 6, 4, and 5, re-cut | `/plumbbob:run` | `/plumbbob:build 6,4-5` | `/plumbbob:build`, `looks good`, three times |
| The close | `/plumbbob:finish` | `/plumbbob:finish` | `/plumbbob:finish` |
| Prompts typed | 7 | 8 | 16 |

The keystrokes are the smaller difference. Typed ranges cost one prompt more than runs; a
step at a time costs more than twice as many, because each of six steps stops at a pause the
plan never asked for. What separates the first two columns is who holds the numbers and what
the stop shows you.

A typed range ends on the last step's boundary, the same `Stop` row the run's landing
printed, as the whole ending of the turn:

```text
**Checkpoint**: Step 3 complete (a344b4314, details: [build-log.md:72](.plumbbob/builds/2026-07-14-add-structured-request-logging/build-log.md#L72))

| **Verdict** | ● Plumb |
| --- | --- |
| Stop | Range 2 of 3 landed - read one real request's line before the timing and the docs build on it (details: [intent.md:48](.plumbbob/builds/2026-07-14-add-structured-request-logging/intent.md#L48)) |
| Next Up | Step 4 of 5 - feat(http): log how long each request took (model: **Sonnet**, details: [intent.md:33](.plumbbob/builds/2026-07-14-add-structured-request-logging/intent.md#L33)) |
| Range | 3 of 3: /plumbbob:run (steps 4-5) |
| Parked | 2 of 2 open |
```

That block is an orientation turn: a Verdict for step 3 alone, no review of step 2, no
Your Call, and the two parks behind a count. The harvest is a turn of its own.
`/plumbbob:harvest` writes its proposals into the detail file under a `# Detail · Harvest`
header, renders them as the same lean table with `plumbbob handoff --harvest`, and takes the
same one reply a stop card does; on `looks good` it records through the same verb, which
says what it recorded and nothing about a range:

```text
**Recorded**: 2 parked ideas (1 blocker, 1 tangent)

| **Next Up** | Step 6 of 6 - feat(http): generate a request id when the client sends none (model: **Sonnet**, details: [intent.md:39](.plumbbob/builds/2026-07-14-add-structured-request-logging/intent.md#L39)) |
| --- | --- |
| Range | 3 of 3: /plumbbob:run (steps 6,4-5) |
| Order | 6, 4, 5 |
| Parked | 0 of 2 open |
```

Then the re-cut range is yours to type. `/plumbbob:build 4-5`, the range as you remember it,
grants steps 4 and 5 and never step 6, so the step the harvest added cannot land in it. The
range that walks the whole stretch is `/plumbbob:build 6,4-5`, which is what the card's Range
row names for the run.

Side by side, what the run changes:

| | With a run | By hand |
| --- | --- | --- |
| The step numbers | the plan's; the card names the run and brackets its steps, `(steps 6,4-5)` | yours: `2-3`, then the re-cut `6,4-5` |
| The grant | minted from the plan's range at the keystroke | minted from the numbers you typed, or none for a bare `/plumbbob:build` |
| A span's ending | the stop card: the range's review, a readout across its steps, every open park in the lean table, and Your Call | the last step's boundary with its `Stop` row, and no Your Call |
| The parks | on the card, settled by the reply that settles the review | a `/plumbbob:harvest` turn, then a reply |
| The range's review in the Log | written beneath `range 2 of 3's stop recorded` | not written; each step keeps its own dated line |
| Holding the stop | the landing owes the card, `plumbbob harvest` refuses in the turn the card printed, and `/plumbbob:build` refuses while it waits | nothing is owed; the boundary is the ending |

## When the manual moves are the right ones

A run is the default way to drive a plan with ranges, not the only one, and each manual move
has a case it fits better:

- **A plan without ranges** is driven a step at a time with `/plumbbob:build`. The run refuses
  it and names both moves: cut the ranges with `/plumbbob:refine ranges`, or build the next
  step alone.
- **A stretch you want to read step by step** takes `/plumbbob:build`, whatever the ranges
  say. It always stops at the step's pause, where a span's run would land the steps unread.
- **A diff you wrote yourself** lands through `/plumbbob:verify`, which reads the diff and not
  the author and stops at the same pause. Once it lands, the card names the run for what is
  left of the range.
- **A plugin hook older than the run** reads `grant: none` on a range that lands its steps.
  The run stops without building rather than land nothing, and the range's own command from
  the plan, `/plumbbob:build 2-3`, lands it by hand.
- **Parks outside a stop** (between steps `/plumbbob:build` landed, or after a typed range)
  are triaged with `/plumbbob:harvest`. It refuses while a stop card waits, since the card
  carries its own harvest.
- **A new sequence** is set with `/plumbbob:order`, which shells `plumbbob order`. The verb
  re-cuts the ranges to follow it, so the next run walks what the new order put in its
  range. The skills that add a step run the same verb for you.
- **`/plumbbob:build --auto`** chains to the end of the plan, halting at each bare range's
  pause, since that is a call the plan reserved ([D94 (auto-and-stops)](decisions.md#d94)). It
  ends on boundaries rather than stop cards.

## How the build order and the ranges fit

The two sections answer different questions. A range says which steps land together and
where the build stops; the build order says the sequence they build in, once it stops being
their numbering ([D86 (build-order)](decisions.md#d86)). A step keeps its number for life,
so a step added late is placed by the order line and never by renumbering.

**The order moves the steps; the plan keeps the stops.** `plumbbob order` re-cuts the ranges
to follow every sequence it writes
([D109 (ranges-follow-the-order)](decisions.md#d109)). A step no range names joins the
range whose steps sit on both sides of it, else the one it builds ahead of, else the one it
builds after, so a blocker ordered next joins the range the next run walks, as step 6 did,
and a step ordered after every range joins the last. A step the order moves out of its range
is placed by the same rule, and where the order tangles two ranges, the re-cut moves the
fewest steps between them. A landed range takes no step, a bare range keeps its one step and
takes no other, and every range keeps its longest stretch, so a re-cut moves steps and never
the bulk of a range. Only the command changes: the stop, the model, and the item's number
stay as you wrote them, and the verb's ending names each range it re-cut.

A run walks its range in build order however the plan writes it, as range 3 did, and every
surface that names the run writes what is left in that order: the card's bracket, the run
header, and the dashboard's pointer all read `steps 6,4-5`. A list range in the plan, such as
`/plumbbob:build 20,5-9`, works the same way.

What the order cannot settle stays yours, because only you know where a stop belongs then.
When two re-cuts would move as few steps, or a step sits where no range may take it (ahead
of a bare range, with nothing open before it), the ranges stay as written, and the verb names
each one beneath its ending with `/plumbbob:refine ranges` as the move. Four drifts flag a
range, each in the same words on the card and the dashboard, and the first two are ones no
sequence can settle, so the order leaves the ranges alone while either stands:

| The drift | Its words |
| --- | --- |
| a range names a step the plan lacks | `step 14 is not in the plan` |
| two ranges name one step | `step 7 is also in range 4` |
| the build order puts a step from outside a range between two of its own | `the build order puts step 11 inside it` |
| an undone step sits in no range | `no range names step 12` |

A flagged range gets a `⚠` row on the dashboard, the card names no run for it, and a run
typed at it refuses with `/plumbbob:refine ranges` as the move. Two rules keep the flags
honest as a range lands. A landed step the order line
leaves out counts as built ahead of the line, since `plumbbob order` lists undone steps
alone, so re-ordering what is left of a partly landed range moves nothing that landed. And a
range's span ends at its last undone step, since a step placed after all of them cuts nothing
short.

## When a run refuses, and when it halts

A run that names nothing it can walk prints no header and mints nothing
([D97 (run-refuses)](decisions.md#d97)). The dashboard's `next →` line carries the refusal
and the move that unblocks it, and the skill quotes that move and stops without entering a
step:

| What the run meets | The move it names |
| --- | --- |
| a plan with no ranges | `/plumbbob:refine ranges`, or `/plumbbob:build` for the next step alone |
| a next step no range names, or a flagged range | `/plumbbob:refine ranges` |
| a range that has landed, or a number the plan lacks | the run the card names in its place |
| a span or a list of ranges, such as `/plumbbob:run 2-4` | the run the card names; a run names one range |
| nothing left to build | `/plumbbob:finish`, after `/plumbbob:harvest` when parks are open |
| a step in flight outside the range typed, or in no range | `/plumbbob:verify` or `/plumbbob:abandon` it |
| an open spike | `plumbbob spike done` |
| no session | `/plumbbob:plan` |

A run typed while a step waits at its pause is not a refusal when a range holds that step: it
is that pause's `looks good`. The step lands on green and the run carries on through what is
left of the range.

A halt is the other way a run ends early, and the build skill's halt list is the run's: a red
check, a self-review that finds a mismatch, a bound agent that returns `blocked` or `drift`,
or a decision the plan did not make. Each ends at that step's pause card, the step unlanded,
and the grant ends with the turn. Say `looks good` once the step is right and it lands; when
that landing completes the range, the stop card follows in the same turn, since the run's
mark outlives the pause. Otherwise the Range row names the run for what is left
(`| Range | 2 of 3: /plumbbob:run (step 3) |`), and you type it.

## What a run never does

**It never starts itself.** `looks good` lands a step and never starts the next range, and
nothing chains one range to the next. A run ends where its range does, and the next waits
for your next prompt.

**It never writes its own grant.** The grant comes only from a prompt you typed
([D65 (human-typed-grants)](decisions.md#d65)), and a grant the model writes into a control
or settings file is no grant; the latch ignores it ([D67 (auto-not-a-grant)](decisions.md#d67)).
A refused checkpoint inside a run is a pause, never an error to route around.

**It never records its own stop.** `plumbbob harvest` refuses in the turn the card printed,
because you have not read it yet. Your reply is what records the stop, and the class of every
park stays your call.

---

*The whole session around a run is in [`happy-path.md`](happy-path.md); each skill's inputs
and effects are in [`skills-reference.md`](skills-reference.md#run); the CLI beneath it
(`status --run`, `handoff --stop`, `harvest`, `order`) is in
[`cli-reference.md`](cli-reference.md); and the card's every part is specified in
[`presentation.md`](presentation.md#the-stop-card).*
