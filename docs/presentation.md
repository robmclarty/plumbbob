# The turn anatomy

Every plumbbob turn used to end in a different shape. The hand-off block was
the only stable text; everything around it (what was built, which decisions
held, whether the seam held) was composed fresh by whichever model was
driving, so it varied in length, order, and register from turn to turn, and
the two things the human needs (are we on track, and what is next) sank into
the flood of paths, identifiers, and unasked-for code. This document is the
spec for the shape of a turn: what renders, in what order, owned by whom. The
other build surfaces (the CLI's verbs, the skills' templates,
[`happy-path.md`](happy-path.md)'s illustrations, the eval contracts)
implement what is written here; a change to the shape is a change to this
file first.

**Whatever can be deterministic is rendered by the CLI and relayed verbatim;
the model composes only judgment, under an exact template.**
([D80 (cli-renders-model-relays)](decisions.md#d80)) The hand-off
block proved the mechanism: the CLI took it over at 0.8.5 and it has not
drifted since, while every model-composed section around it kept mutating.
This spec pushes that split to its limit. If the CLI can compute or render a
line, the CLI does, and the model is kept for what only a model can do:
judgment, and the prose that carries it. One naming decision rides with it:
the CLI-rendered ending has collected four names (closing block, standardized
hand-off block, canonical three-part closing block, its block), and they all
retire. It is **the footer card**, the card for short, and no other name for
it appears in a skill or doc from here on.

## The shape of a turn

A decision turn (the build/verify pause is the canonical one) is one block.
`plumbbob handoff` renders all of it, and the model relays it once. Judgment
still runs through it, but none of it is typed into the chat: the model writes
its judgment into `.plumbbob/detail.md` first, and handoff reads it back from
there.

| what | whose judgment | how it reaches the turn |
| --- | --- | --- |
| the Summary lead, the numbered highlights (kept in the detail file and the record), the `done-when`, `decisions`, and `constraints` rows, the title, the why, and the lean for each park at a stop, the recommendation | the model | written into `.plumbbob/detail.md`, read back and rendered by handoff |
| the Readout's other rows and the changed files beneath its `diff` row, the inline diff when the change is small, Your Call, the state table (the Verdict, Now, Stop, Next Up, and the rows beneath it), each park's handle and text on a stop card, every `details:` link, the `more details` link | the CLI | measured from the session, the gate, the plan, the build log, and git |

The model authors nothing in the turn but the relay. Every defect the build
that wrote this spec found in a live turn sat in the region the model was
still writing (a bold token loose mid-sentence, an operational paragraph above
the anatomy), and a region the model does not own is a region it cannot
narrate into. The turn is the anatomy and nothing else.

**Every part outside the readout fence is a bold label, a colon, and text
that wraps, except the state the turn ends in, which rides one table.** A
block sits beneath a label only where the block is the content: the rows
under the Readout, the lean table under Harvested, the moves under Your Call.
One blank line separates every block. The pause used to run five visual
grammars at once (a bare headline, a list, a label, two fences) when only the
columnar rows need a fence, and a label announces what a line is before the
eye reads it. The state is the exception: the Verdict, the step in flight,
Next Up, and what rides beneath Next Up are the facts the human scans for, so
they ride a two-column table at the card's foot, the one shape on the card
that is not prose ([D111 (state-table)](decisions.md#d111)).

The whole turn, rendered (the running example is
[`happy-path.md`](happy-path.md)'s rate limiter, at step 2's pause):

````markdown
**Summary**: The 6th login attempt inside a minute now gets 429.

**Readout**:

```text
check        green: 3 of 3 checks
done-when    met
decisions    2 of 2 honored
constraints  4 of 4 honored
seam         held: 2 of 2 declared, no strays
diff         +61 -3 across 2 files
             - src/routes/login.ts +40 -3
             - test/login.rate.test.ts +21 -0
spent        88 min · 3 turns · 63s gate · green first run
```

**Your Call**:

- `looks good` → I checkpoint Step 2; back to the boundary
- `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back
- anything that reads as direction → I make the change and say what moved; nothing lands until you approve
- `revert` → I wind the work back to the last checkpoint

| **Verdict** | ● Plumb |
| --- | --- |
| Now | Step 2 of 3 - feat(login): wire the limiter into POST /login |
| Next Up | Step 3 of 3 - feat(config): make the limit configurable via env (model: **Sonnet**, details: [intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41)) |

**Recommendation**: Approve it. The gate is green, the seam held, and the one call the step made (misses count, successes do not reset) is what the plan already decided.

[more details](.plumbbob/detail.md)
````

Alignment survives only inside a fence or a table in the renderers this has
to read well in (Claude Code, Cursor, Zed, a PR diff), so the readout's
columnar rows ride in a `text` fence, and the state the turn ends in rides a
markdown table, which every one of them draws and whose cells wrap where a
fence row would scroll. Everything else is a labeled line that wraps at the
renderer's width, which is what the label buys back: the parts that are
prose behave like prose. Fences never nest. handoff's output is pasted at top
level, never inside a fence of the model's own, because a butted or nested
fence breaks in exactly the renderers this document exists to survive.

### One block, relayed whole

The rule is positional, not prohibitive. The model writes the detail file,
runs `plumbbob handoff`, and pastes its output at top level; the turn begins
where that output begins and ends where it ends. A positional rule holds
where a list of forbidden phrases does not, because it leaves the
meta-narration nowhere to live: there is no line above the Summary for "here
is the pause", none between the Summary and the Readout for "the check came
back green", and none after the card's last line for a closing courtesy.
Three consequences, spelled out because each was a real defect:

- The model never frames or narrates the block. It does not introduce the
  readout, read the Verdict back, or explain the Your Call block.
- Each fact appears once, in its designated part. The gate verdict lives in
  the check row; it does not also open the Summary or close the turn. (Step
  5 of the build that wrote this spec stated it three times in one pause.)
- A judgment or a flag (a stray the seam row will name, a decision the step
  had to bend, a doubt about the done-when) is a numbered section of the
  detail file, and the card carries it where it bears on the call: a bent
  row's `→` line points at the section, and the recommendation names it when
  it changes the move. It is never a freeform paragraph above or below the
  block.

One tier still has a seam to mark. At the plan pause the model presents the
framed plan itself and then relays `plumbbob handoff --plan`, so that block
opens on a horizontal rule: a label alone under the plan read as its tail,
and a run of blank lines collapses to one in every markdown renderer, so the
rule is the one separator that renders as space in all of them. That is the
only rule in the anatomy and the only seam left in it. The step pause, the
boundary, and a driver turn carry none, because nothing of the model's
precedes their lines.

### One card, shown once

A card shows once, when the work reaches it
([D110 (reply-after-the-card)](decisions.md#d110)). Every later turn at the
same pause, stop, or boundary is the model's own reply, closed by one line,
and that holds for a question, a discussion, and a change the human asked
for alike:

```text
**Next Up**: Back to Step 2 of 3 - feat(login): wire the limiter into POST /login
```

That is the driver pointer, the line a park already closes on, so every
reply at a pause ends on the same line. It names the step still waiting,
with its count, and no move: the moves are on the card, one screen up, and a
lead line states its fact and leaves the move to the human
([D84 (one-liner-register)](decisions.md#d84)). The reply is what the rule
protects: the answer, or what changed and what the check found, in the
model's own words. A reply during a pause used to carry the whole card,
about 40 lines, beneath an answer of a sentence or two, and a change the
human asked for used to print the card again, so the reply to their feedback
sank beneath a card they had already read. So the reply is the one turn
where the model's prose stands above the CLI's line, and the line still
closes it: the positional rule holds, because the CLI's line is still the
last text.

The CLI chooses the form, never the model. `plumbbob handoff` keeps a stamp
that says which card has shown, `PAUSE` holding the step whose pause showed
or, after a checkpoint, the step whose boundary did, and nothing about what
the card said, so the reminder prints whatever changed since: a rewritten
detail file, an edit anywhere in the tree, a check that went red or came back
green. The stamp used to hash what the card showed, and checkride's per-turn
gate, which skips the test slot, rewrote the check row after nearly every
turn, so the next reply came back as the whole card. A reply that changes the
work writes the detail file again when the change moves what the card said,
so the record matches what lands, and prints no card for it. The card comes
back on request: `plumbbob handoff --full` prints it, the `expand` move names
the phrase that asks for it (`show the pause`), and a human who wants it in a
fresh window asks the same way. The model never runs `--full` to read the
card for itself, since what `handoff` prints is the turn's ending. The next
card is the next point where work is done: `looks good` lands the step, and
the checkpoint prints the boundary. A revert or an abandon clears the stamp,
so the next pause renders whole. A boundary keeps the rule too: once
`checkpoint` has printed it, a later `handoff` there prints its forward
pointer alone. The stop card that closes a run's range keeps it under a stamp
of its own, with a reminder naming the stop still waiting and
`plumbbob handoff --stop --full` to bring it back
([the stop card](#the-stop-card)).

## The Now row

The step in flight is the state table's second row, beneath the Verdict: its
count, then its title behind a plain hyphen, written the way Next Up writes
the step to come:

```text
| Now | Step 2 of 3 - feat(login): wire the limiter into POST /login |
```

The step used to be named once on the block, in the Readout label, mid-block
and without its count, while the one `Step N of M` the eye found was Next
Up's, a step ahead; a human who asked "which step am I on?" was answering it
by subtraction. So the identity moved to the top of the block with its count
([D88 (current-step-shown)](decisions.md#d88)), and then into the state
table, where the eye that looks for where the build stands finds it between
the Verdict and Next Up ([D111 (state-table)](decisions.md#d111)). The label
is `Now` because it pairs with `Next Up`: the two rows name what is on the
bench and what comes after it, and a reader who has learned one reads the
other. It states the fact and no move, the register every lead line keeps
([D84 (one-liner-register)](decisions.md#d84)). The count is the plan's own,
the step number over the total, the way Next Up counts, so the two rows agree
under a re-sequenced build order too: a step keeps its number for life
([D86 (build-order)](decisions.md#d86)).

The row renders on every step pause at the decision tier (the build and
verify pauses, and an auto halt on trouble), and the reminder a card already
shown ends on names the same step, `Back to Step 2 of 3`. The plan pause has
no step in flight and renders none; the boundary's lead line already names
the step that landed.

## The Summary

The card opens on `**Summary**:`. Its lead states the outcome, not the
activity: "The 6th login attempt inside a minute now gets 429", never "I have
implemented the rate limiting functionality". One sentence when one will do,
a short paragraph when the step needs explaining. That is an aim, not a
limit, and it is still a summary:

```text
**Summary**: <the lead>
```

The numbered highlights stay in the detail file
([D113 (short-card)](decisions.md#d113)). The model still writes them, each
the title of a `## <n>` section with the full story beneath it, five at most,
and the build-log record still lists them over the stories, but the card no
longer prints them: the card is read for the Verdict, the lead, and the call,
and a list the human reads past is a list in the way. The numbers are still
handles, so `expand 2` opens the matching section. What the card carries for
the rest of the story is one link at its foot, `[more details](.plumbbob/detail.md)`
([the recommendation](#the-recommendation)); the lead's own bracket,
`(details: [detail.md](.plumbbob/detail.md))`, retired with the list, since
the foot points at the same file once.

The lead comes out of the detail file: the model writes it as that file's
`## Summary` section, and handoff prints the label, so the model never types
a path. Hidden detail is still pointed at, because a silent cut reads as
coverage; the link and the `expand` move are where.

## The readout

The readout is the step's instrument ([D82 (readout-ladder)](decisions.md#d82)):
labeled rows inside one fence, assembled
and emitted by `plumbbob handoff` under the bare label `**Readout**:`. Rows,
not a retelling. The label used to carry the step's identity; the Now row
carries it now, with its count, and a label that repeated it would put the
step on the block twice ([D88 (current-step-shown)](decisions.md#d88)).

Ownership splits by nature. If the CLI can measure a row, the CLI does, because
every row the model attests is one it can pad or get wrong, and determinism is
what earns the readout its trust. The `check` row comes from the last run's
`.check/summary.json`, the `seam` and `diff` rows from the SEAM marker against
the step's whole product (everything changed since HEAD, staged or not, plus
each non-ignored new file counted as all-added lines), and the `spent` row from
`stats.json` and the turn ledger. The model writes only the three rows that
take judgment (`done-when`, `decisions`, `constraints`), into the detail file,
under the header rule that file's wire opens with; handoff parses them there,
folds them with its measurements, and re-emits the whole set. The model never
types the fence into the turn.

The fence holds seven rows at most, in this order, labels padded with spaces so
every value starts at column 14:

```text
check        green: 3 of 3 checks
done-when    met
decisions    2 of 2 honored
constraints  4 of 4 honored
seam         held: 2 of 2 declared, no strays
diff         +61 -3 across 2 files
             - src/routes/login.ts +40 -3
             - test/login.rate.test.ts +21 -0
spent        88 min · 3 turns · 63s gate · green first run
```

Each measuring row opens with a verdict word from a closed set. The words are
parse-bearing; what follows sizes the row when it is green and names the
offender when it is not:

| row | written by | true | failing | plan-wrong |
| --- | --- | --- | --- | --- |
| `check` | CLI | `green: <N> of <M> checks` | `red: <slot> failing` | never; the gate measures the work |
| `done-when` | model | `met` | `not met: <what is missing>` | `drift: <why no diff can meet it>` |
| `decisions` | model | `<N> of <N> honored`, or `none exercised` | `bent: <tag>, <how>` | `drift: <which one reality broke>` |
| `constraints` | model | `<N> of <N> honored` | `bent: <tag>, <how>` | `drift: <which one reality broke>` |
| `seam` | CLI | `held: <N> of <M> declared, no strays` | `strayed: <N> paths outside the seam` | never; a seam the plan got wrong shows as a stray, and the detail file says so |

The rules the rows follow:

- **Green collapses to a count; red expands to name an offender.** The
  question a reviewer brings to an instrument is "is anything off?", and a
  count that sizes its universe answers it faster than a list does:
  `green: 11 of 11 checks` says both that nothing failed and how much was
  measured. `done-when` collapses all the way to the bare word, because the
  Summary above it is already its evidence.
- The constraint count is the CLI's, read from `## Constraints` in intent.md,
  because a constraint always applies and that is what makes it one. The
  exercised-decision count stays the model's: only it knows which decisions
  the step actually touched.
- A row carrying two or more items breaks them onto indented continuation
  lines, each opening with `-`, rather than crowding the value. handoff parses those
  lines back out of the detail file, so a judgment row the model writes that
  way survives the round trip.
- A red row takes one indented `→` line pointing at its evidence: the failing
  slot's raw output under `check`, the explaining detail section under a bent
  `decisions` or `constraints`, the stray path under `seam`. A green row
  carries no arrow, so a plumb readout has none.
- The `seam` row's red word is an advisory, not a failure. The seam is
  awareness, not a lock ([D13 (no-edit-guards)](decisions.md#d13)), and a
  stray cannot say whether the work wandered or the line was drawn too tight,
  so `strayed` folds no lower than `◐ A hair off` (see the Verdict). The row
  still names its paths, the same as any red row.
- A cited tag always carries its slug, `D2 (five-per-minute)`, never a bare
  `D2`, the same gloss rule prose follows
  ([D74 (glossed-citations)](decisions.md#d74)).
- `drift` is the plan-wrong word, deliberately the same word the agent
  envelope uses ([D52 (blocked-vs-drift)](decisions.md#d52)): it says truing
  the diff will not fix this, the plan no longer matches reality.
- A row that cannot apply (a plan with no constraints) vanishes; a row whose
  good state is meaningful collapses to it. Silence and absence are different
  signals, and the readout keeps them apart.
- The `diff` row is information, not a measure: `+<added> -<removed> across
  <N> files`, counted against HEAD with new files included, and beneath it
  each changed file on a continuation line, `- <path> +<added> -<removed>`, in
  git's path order ([D113 (short-card)](decisions.md#d113)). Past eight files
  the list names seven and folds the rest to `and 5 more`, never a silent cut,
  and a path is never shortened: it is the name the human opens, so it is the
  second legal overflow of the 80 columns, beside a human-authored step title.
  The row never folds into the Verdict, and it vanishes, list and all, when
  nothing changed.
- Every fence line fits 80 columns: the 13-character label pad leaves 67 for
  the value. The CLI's rows conform by counted degradation, never a silent
  cut: a long list of deselected slots collapses to `· without 9 others`.
  The model's three rows are written to fit, which the collapsed forms make
  easy: one short clause after the verdict word, with the full story in the
  detail file.
- Measured beats attested. The model has no check or seam row to write; the
  CLI's measurement is the only one, so a model cannot vibe the gate green or
  the seam held.

The model may only say true, failing, or drift. It has no word for "green
with an asterisk": the softer judgment belongs to the CLI, which measures
what the road to green cost (see the Verdict). That asymmetry is what makes
the middle of the ladder trustworthy.

### The spent row

The last row is what the step consumed, and every number in it is already on
disk:

```text
spent        88 min · 3 turns · 63s gate · green first run
```

Elapsed runs from the step's `startedAt` to now at the pause and to its
`landedAt` at the boundary; turns is the ledger's `TURN` minus the `TICK`
stamped when the step was entered; the gate is the last run's
`total_duration_ms`; and the tail is the red runs accrued before green, or
`green first run` when there were none. Drift warnings ride last when any
accrued. A clause with nothing to say vanishes, and a fresh session with
nothing at all to count vanishes the row.

Tokens and cost stay out. The transcript is host-specific and a price table
goes stale, while a build is watched by what it consumes in time and attempts,
which stats.json and the turn ledger already hold.

## The check row

The gate verdict has one home: the readout's `check` row, measured by handoff
from the last run's summary. No standalone verdict line exists. `plumbbob
check` still prints one on the console for whoever ran it, and the model does
not carry it into the turn: one measured fact rendered twice is the
repetition this shape exists to kill. The row sizes the gate and names its
scope, so a run's narrowing discloses itself where the verdict lives:

```text
check        green: 11 of 11 checks
check        green: 10 of 11 checks · without test
check        red: types failing
             → .check/types.json
```

A run narrowed with `--only` or `--skip` records the slots it left out, and
the row names them behind the separator, collapsing to `· without 9 others`
when the names overrun the value. That named narrowing is the whole
disclosure; the phrase `NOT the full check` is retired from the anatomy. A
red row names the one failing slot and points at its raw output; two or more
collapse to a count, list the slots on continuation lines, and point at the
summary.
A run that left no summary (the gate itself broke) leaves no row, and the
Your Call block then withholds `looks good`: nothing was measured to approve
on.

The per-turn gate is not the model's to relay. checkride's Stop hook
([D75 (two-gates)](decisions.md#d75)) runs after the turn has ended and
reports as a notice the harness appends on its own line, below the block; the
trailing blank line the relay keeps is what lands that notice off the
recommendation's last sentence. The model never restates it, and the run it
reports leaves the summary the next handoff reads, so its narrowing surfaces
in the next check row as `· without test` and nowhere else.

## The footer card

The card is the ending's closing parts
([D83 (card-teaches-itself)](decisions.md#d83)), CLI-rendered by `plumbbob
handoff` and relayed verbatim: the Your Call block, the state table, and, on
a decision turn, the recommendation and the `more details` link beneath it,
one blank line between each so the eye gets rungs to land on. The state
table is the part that moved most ([D111 (state-table)](decisions.md#d111)):
the Verdict, the step in flight, Next Up, and what rides beneath Next Up were
labeled lines, and they are rows of one two-column table now, the facts the
human scans for in the one shape on the card that is not prose:

```text
| **Verdict** | ● Plumb |
| --- | --- |
| Now | Step 2 of 3 - feat(login): wire the limiter into POST /login |
| Next Up | Step 3 of 3 - feat(config): make the limit configurable via env (model: **Sonnet**, details: [intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41)) |
| Parked | 1 of 2 open |
```

Its rows, in order, each only when it says something: the Verdict, Now,
Stop, Next Up, Range, Order, Parked, and Questions. The first row present is
the header, its label bold, so the Verdict heads the table wherever one was
measured, and Next Up heads it where nothing was (the plan pause, a stop's
record, finish, a fresh session). A pipe in any cell is escaped, so a title
holding one keeps its row. The table stands beneath Your Call and above the
recommendation, so the last screenful of a card holds whether it is plumb,
where the build stands, and what the model suggests, while the moves, which a
human who has learned them reads past, stand above it. The card is
human-facing, so its labels are title case; the readout above it is an
instrument, and its lowercase machine labels stay as they are.

### The Verdict

The state table's header row: the state word behind its glyph, then the
worst component in a trailing parenthetical when one exists. The
parenthetical vanishes when nothing is off:

```text
| **Verdict** | ● Plumb |
| **Verdict** | ◐ A hair off (seam strayed) |
| **Verdict** | ○ Out of plumb (check red) |
| **Verdict** | ✗ Not standing (done-when drifted) |
```

It heads the table because it is the fact read first: whether the step is
plumb decides how closely the rest is read. The build-log record keeps it as
a labeled line, `**Verdict**: ● Plumb`, since the record is the archive and
carries no table.

No step segment rides here. The identity renders once per turn: the Now row
names the step in flight with its count, Next Up names the step to come with
its own, and the Verdict is left saying the one thing only it says. The card
used to render "Step 10 of 14" twice.

The Verdict is computed, never composed: handoff folds the same assembled
rows the fence shows (its measured check and seam, the model's three judgment
rows) worst-of with the step's accrued stats, so the readout and the verdict
can never disagree. The fold, from worst down:

1. Any row saying `drift` → `✗ Not standing`, named `<row> drifted`.
2. Any row failing (`red`, `not met`, `bent`) → `○ Out of plumb`, named
   `<row> <verdict>`, first failing row in row order.
3. No row failing but advisories accrued → `◐ A hair off`, naming the first
   advisory in a fixed order: a strayed seam (`seam strayed`), red check runs
   before green (`2 red runs before green`), reverts on this step (`1 revert
   on this step`), commits outside the ledger (`3 commits outside the
   ledger`).
4. Otherwise → `● Plumb`.

A strayed seam folds to the advisory rung, never to `○ Out of plumb`. A path
outside the seam says either that the work wandered or that the line was
drawn too tight, and the readout cannot tell those apart; truing the diff
fixes neither without undoing an edit the step may have needed. So the move a
stray asks for is the advisory rung's own: read the named path, then judge,
and widen the seam with `/plumbbob:step` if the plan was wrong. The stray
leads the advisory order because it is the one advisory that asks a question
of the plan rather than of the work, and it is the one rung that carries no
count. At the pause the measured `seam` row carries it and names the paths
itself; at the boundary the working tree is clean, the row has vanished, and
the stat the checkpoint bumped once carries it instead, the paths riding the
advisory printed above the table. Both wear the same words, `seam
strayed`, so a stray earns the same rung whichever command rendered it.

That last rung counts only commits that are not plumbbob's own. A
`chore(plan)` harvest lands between nearly every step, and an advisory that
trips on routine housekeeping stops meaning anything within three steps, so
both surfaces, handoff's Verdict and the receipts line on `status`, drop the
commits carrying the `plumbbob plan` body marker from the count. They share the
marker, so the same history gives the same number on either.

The Verdict names one component, the hunt-saver; the readout above it holds
the rest. A fresh session with nothing measured renders no Verdict at all,
and Next Up heads its table.

### The Next Up row

The forward pointer: the step and the progress count, the title behind a
plain hyphen, and a closing bracket carrying the plan's model recommendation
when the step has one (advisory metadata,
[D62 (model-recommendation)](decisions.md#d62)) and where to read the step in
full. On a card and an orientation ending it is the state table's Next Up
row; on a driver turn and a reminder it is the one labeled line the turn
closes on:

```text
| Next Up | Step 3 of 3 - feat(config): make the limit configurable via env (model: **Sonnet**, details: [intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41)) |

| Next Up | Step 3 of 3 - feat(config): make the limit configurable via env (details: [intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41)) |

| Next Up | Nothing planned - /plumbbob:step or /plumbbob:finish |

| **Next Up** | Nothing planned - /plumbbob:plan |

**Next Up**: Back to Step 2 of 3 - feat(login): wire the limiter into POST /login

**Next Up**: Back to Range 3 of 5's stop - review the card on a live boundary before the skills teach it

**Next Up**: Close the spike - /plumbbob:spike done, then back to Step 2
```

The `Back to` form is the pointer a park closes on, and the reminder a card
already shown ends on; a stop card already shown ends on the same form,
naming the range and its stop where a step's names its title
([the stop card](#the-stop-card)). The progress count rides Next Up in every
tier, because Next Up is the one fact present at the pause, at the boundary,
and on a driver turn. It is dropped only where it would lie: a driver pointer
back at a step the plan no longer holds says `Back to Step 9` and no count,
and an open spike outranks the step it interrupted, so the move named is
closing it and the step to come back to rides as a trailing clause. The
header row naming `/plumbbob:plan` is `plumbbob finish`'s own: finish clears
the session the pointer would be read from, so it prints the table itself,
its one row, and the only move left is a fresh plan.

The model is the second bold token the row spends, because it is the one the
human acts on (a `/model` call) before the next run. The rationale behind the
recommendation lives on the dashboard, and the choice stays the human's. A
title long enough to push the row past the width budget wraps in its cell;
it is never truncated.

The `details:` clause is a link, and its text is the file's name and line,
`intent.md:41`, where it used to be the full sidecar path in a code span
(`.plumbbob/builds/rate-limit/intent.md:41`)
([D107 (short-linked-paths)](decisions.md#d107)). The target is the path from
the repo root with the line as a `#L41` fragment,
`[intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41)`, and the same
form rides every `details:` bracket the anatomy prints: Next Up's, the Stop
row's, and a transition's lead, where the sha comes first
(`b4c5d6e7f, details: [build-log.md:52](.plumbbob/builds/rate-limit/build-log.md#L52)`).
The card's `more details` link to the detail file is the one link whose text
is no file name, since it closes the card rather than qualifying a fact
([D113 (short-card)](decisions.md#d113)).
The full path was noise on every card, seventeen characters of
`.plumbbob/builds/` and a slug ahead of the one word that said which file,
while the short name still says it. The target stays relative so a card
pasted anywhere carries no machine's path, and in a markdown file on GitHub
it resolves to the file at that commit with the line highlighted. The form
was chosen at step 15's pause of the runs-and-the-stop-card build
(2026-10-18), over the code-spanned `path:line` the cards printed until
then, a link to the relative path with no line, and an absolute `file://`
URL. The plan asked for the four to be clicked in Claude Code's terminal and
in Zed before the pick. That test was waived at the pause and ran instead on
the first card the code rendered, a boundary after step 16 (2026-10-19): in
Zed, `[intent.md:150](…/intent.md#L150)` opened the file at line 150, and
Rob, who drives plumbbob from Zed, called Claude Code's handling fine. A link
into the build log's Log names a line, not an entry, so it drifts when a
harvest writes above the entry: the Harvest lines sit above the Log, and after
range 8's harvest `build-log.md:277` landed five lines above step 16's entry.

#### The rows beneath Next Up

Beneath the Next Up row, the table carries what the human would otherwise
hold in their head, a row each and each only when there is something to hold
([D111 (state-table)](decisions.md#d111)):

```text
| Next Up | Step 7 of 10 - feat(x): title (model: **Sonnet**, details: [intent.md:22](.plumbbob/builds/x/intent.md#L22)) |
| Range | 3 of 5: /plumbbob:run (steps 7-9) |
| Order | 7, 8, 5, 10, 6 (and 2 more) |
| Parked | 2 of 7 open |
| Questions | 1 open |
```

The Range row names the range holding the step and the run that lands what
is left of it; its forms are under [the build ranges](#the-build-ranges). The
Order row is the remaining sequence from the step the pointer names, five
steps and then a count, and it renders only when `## Build order`
re-sequences the plan away from its numbering
([D86 (build-order)](decisions.md#d86)): a plan nobody re-sequenced already
carries its sequence in the numbers. The Parked row is the open count against
everything ever parked, whenever anything has been parked; it rides even
under `Nothing planned`, where an unharvested list is the one reminder that
matters. The Questions row counts the open questions the plan still carries,
the count the dashboard prints beside the parks, while one is open. The
first three rode one line indented beneath the pointer,
`· range 3 of 5: … · order: … · parked 2 of 7 open`, three labeled fields in
a line whose indent was all that kept it inside the part
([D108 (order-label)](decisions.md#d108)); a row each gives every fact the
label the eye looks for. A driver turn and a reminder carry none of them; a
one-line register stays one line.

### The Your Call block

The card has to teach itself; a bare "looks good / needs work" assumes the
reader already knows the ceremony. So the block quotes what the human says
and states what happens next, exactly:

```text
**Your Call**:

- `looks good` → I checkpoint Step 2; back to the boundary
- `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back
- anything that reads as direction → I make the change and say what moved; nothing lands until you approve
- `revert` → I wind the work back to the last checkpoint
```

These are the moves a human actually makes. Nobody types "needs work", and
the move made most, zeroing in on one part before approving, was not on the
card at all. So the block names the two real replies instead: a message that
asks is an expand, and a message that directs is the fix. `revert` comes
last, because a destructive move is named rather than discovered.

The moves stay lowercase, because they quote what the human says; each
outcome clause after the arrow opens with a capital letter. The block names
`expand` bare, as the label of the move: what follows it is the human's
choice, a number (`expand 2` opens that section of the detail file) or a
phrase ("explain that thing about the seam", "what does 'xyz' even mean?"),
and it is answered from the detail file, the diff, or the build-log's Log
for an older step, never from recall. An expand turn ends on the one-line
reminder, not on the card again: the answer is what the human asked for, and
about 40 lines beneath it push it off the screen. The `expand` move is where
the block says how the card comes back, so the reminder never has to.

A message that directs is the fix, and the turn that makes it is a reply
like any other ([D110 (reply-after-the-card)](decisions.md#d110)): the model
makes the change, says what moved and what the check found, writes the
detail file again when the change moved what the card said, and ends on the
reminder. It does not print the card again. The human who wants the card's
view of the change asks for it with `show the pause`, and `looks good` lands
it as it stands, the checkpoint refusing on red as always.

The `looks good` line renders only while the measured check is green: on red,
or with no run to measure, the checkpoint would refuse, and offering a move
that cannot happen teaches a false ceremony. The others always render. The
block is the face of the approval latch
([D64 (approval-latch)](decisions.md#d64)): the human's next message is the
tick, and the card is where they learn what each tick does. It teaches the
moves without saying which one to take; that is the recommendation's job,
and it closes the card beneath the state table.

When the plan declares build ranges and the step in flight sits in a range
that lands its steps, with steps still ahead of it, a fifth move rides
second, beneath `looks good`:

```text
**Your Call**:

- `looks good` → I checkpoint Step 6; back to the boundary
- `/plumbbob:run` → I checkpoint Step 6, then run the rest of range 3 to its stop
- `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back
- anything that reads as direction → I make the change and say what moved; nothing lands until you approve
- `revert` → I wind the work back to the last checkpoint
```

The run typed at a pause is that pause's `looks good` and the rest of the
range in one reply ([D95 (run-verb)](decisions.md#d95)): the step lands
only on a green check, so the row renders exactly when `looks good` does,
and what is left of the range follows, walked as a run walks it. It rides
second because it is the second approval, and it names the step and the
range because the outcome is two beats where `looks good` is one. The row
renders only where the run does more than `looks good`: inside a bare range
the run ends once its step lands, and so does one typed at the pause on a
range's last step, so at those pauses the block keeps its four moves and
the Range row says the range lands with the step
([the Range row](#the-range-row-beneath-next-up)). The stop card
that closes a run's range carries a block of its own, with the record in
place of the checkpoint ([the reply at a stop](#the-reply-at-a-stop)).

At the plan pause the block keeps the shape with the moves that apply there
(nothing is recorded yet, so `revert` has nothing to wind back to):

```text
**Your Call**:

- `looks good` → I mark the plan decided; /plumbbob:build starts Step 1
- `expand`, or any question → I show more of what is there; nothing changes
- anything that reads as direction → I take it as what to sharpen; the plan is cheap to change now
```

When the plan declares build ranges and the step the plan starts at sits in
a range that parses, the first row names the run instead, since the run is
what the human types next: `/plumbbob:run runs range 1 from Step 1`, or
`runs range 3 from Step 8` after a mid-build refine, where the first undone
step sits partway through a range. A step in no range, or in a flagged
range, keeps the build.

An auto halt on trouble renders the standard card; the Verdict's worst
component is the halt reason. A clean halt renders no card at all: its step
has landed, and nothing is left for the human to decide.

## The recommendation

A decision turn's last words are the model's recommendation, the move it
would take and then why, and beneath it the one link to the rest of the
story. The Your Call block teaches the moves; a pause that leaves the human
deciding unassisted is a defect, not a missing nicety. The model writes it
into the detail file as a `## Recommendation` section, handoff emits it after
the state table behind a bold label, and it is relayed as plain prose, never
fenced. It is the last of the labeled lines, and its label is the one they
all copied. The shape is exact:

```text
**Recommendation**: <The move.> <The reason, one or two sentences.>
```

The label is the CLI's; the model never types it. The move is a sentence of
its own, closed by a period, and the reason opens with a capital letter: a
colon after the move fused the call and its reason into one breathless
clause, and the label announces what the last text is before the eye reads
it. Written into the detail file, that is `Approve it. The gate is green and
the seam held.`; the turn shows it as
`**Recommendation**: Approve it. The gate is green and the seam held.`

Beneath it the card closes on one line, the detail file the recommendation
draws on:

```text
[more details](.plumbbob/detail.md)
```

It is the card's last line and the only place the card points at the detail
file ([D113 (short-card)](decisions.md#d113)), out of the way of the parts
the human reads to decide, and it renders only when the file holds
something, since a link to an empty file points at nothing.

It is flowing text. handoff joins each paragraph's lines into one on the way
out, so the recommendation wraps at the renderer's width however the detail
file was written; the model should write it as sentences anyway, never
hard-wrapped to 72 or 80 columns, because unfenced prose carrying a fence's
line breaks reads as machine noise. Every decision turn ends on it: the
build/verify pause, the plan pause, and an auto halt on trouble. Orientation
and driver turns carry none, since nothing is pending there. At the plan pause the
recommendation is the model's cold read of the plan it just framed: one
bounded adversarial pass under `/plumbbob:refine`'s lens, surfacing without
appending, written into the detail file as findings and a recommendation and
nothing else. It reads `Approve it.` or `Sharpen <the worst hole> first.`, and
it names refine when the read found more than one, because refine is where
the real adversary looks and the recommendation is an estimate. The plan
commit records the read beneath a `plan committed` line in the Log, the
build's first entry.

## The ladder

Four states, worst-of, the fill draining as the plumb line stops holding.
The split that earns the fourth state is "fix the work" versus "fix the
plan": each state asks a different move of the human.

| state | it means | your move |
| --- | --- | --- |
| `● Plumb` | every measure true; the diff matches the plan and the gate agrees | read the diff; approving is safe |
| `◐ A hair off` | green, with advisories accrued on the way (a strayed seam, red runs, reverts, out-of-band commits) | read the named advisory, then judge |
| `○ Out of plumb` | a measure failing now: red check, a missed done-when, a bent decision or constraint | send fixes; truing the diff fixes it |
| `✗ Not standing` | truing the diff will not fix it; a readout row says `drift` | repair the plan (`/plumbbob:refine`), or revert |

## The three tiers

The Your Call block belongs only where a decision is pending, so the anatomy
scales down with the turn:

| tier | turns | the ending renders |
| --- | --- | --- |
| decision | the build/verify pause, the plan pause, an auto halt on trouble | the whole block: the Summary, the Readout with its changed files, the inline diff when small, Your Call, the state table (the Verdict, Now, Next Up, and the rows beneath it), the recommendation, and the `more details` link, shown once per pause; a later turn at the same pause is the model's reply, closed by the one-line reminder. The plan pause judges no diff and has no step in flight, so it renders the moves, the table headed by Next Up, the recommendation, and the link |
| decision, at a stop | the stop card that closes a run's range | the whole block in the range's shape: the Summary, the Readout measured across the range, the Harvested part's lean table while a park is open, Your Call, the state table (the Verdict, Stop, Next Up, and the rows beneath it), the recommendation, and the link, shown once per stop; a later turn at the same stop is the model's reply, closed by the one-line reminder ([the stop card](#the-stop-card)) |
| orientation | the checkpoint boundary (a clean halt's included), a stop's record, finish, status | the transition's lead line, any advisories, and the state table: the Verdict where one was measured (a stop's record measures nothing and renders none), the Stop row on the boundary where a range's last step landed, Next Up, and the rows beneath it; no Your Call block, no recommendation. A boundary already shown ends on its pointer alone. `status` is the exception: it renders the dashboard and nothing else, and the dashboard's last line is its own pointer |
| driver | park, order, spike, use, recover, revert, agent runs | the transition's lead line, any advisories, and the one labeled Next Up line, no table; no Verdict, since nothing landed |

**An auto halt takes the tier of what it leaves behind**
([D85 (range-top-lands)](decisions.md#d85)). A halt on trouble (a red check,
a mismatch, a blocked agent) stops with a step still in flight and a call
pending on it, so it is a decision turn. A clean halt (the top of a typed
range, or an `--auto` run that reaches the end of the plan) lands its last
step first, and its ending is that checkpoint's block, because there is
nothing left to decide. The rule used to send every halt through `handoff`,
which renders the pause only while a step is open, and models read it as an
order to hold a range's top step open: the eval tier caught it in 2 of 4
runs. A third halt is the plan's
([D94 (auto-and-stops)](decisions.md#d94)): under `--auto`, a step the build
ranges name as a bare range is built to its pause and halts there, a decision
turn, with `plumbbob build` saying so as it enters the step, because the plan
reserved that call for the human and a flag typed for speed should not make
it. A review stop runs through, since a review can wait for the end of the
run, and a typed range stays exactly as typed. A run's clean halt lands its
top step first, as any clean halt does, and then ends on the stop card
rather than the checkpoint's block ([D100 (stop-card)](decisions.md#d100)),
because a landing range's stop is a review, and the block gave it nothing to
read ([the stop card](#the-stop-card)).

A boundary turn, whole:

```text
**Checkpoint**: Step 2 complete (b4c5d6e7f, details: [build-log.md:52](.plumbbob/builds/rate-limit/build-log.md#L52))

| **Verdict** | ● Plumb |
| --- | --- |
| Next Up | Step 3 of 3 - feat(config): make the limit configurable via env (model: **Sonnet**, details: [intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41)) |
```

A driver turn, whole (a mid-step park):

```text
**Parked**: should /password-reset get the same throttle? (tangent)

**Next Up**: Back to Step 2 of 3 - feat(login): wire the limiter into POST /login
```

**One command emits each of those, and the verb that made the transition is
that command.** `checkpoint` prints its own table, its own Verdict and
pointer in it, `park` prints the pointer back at the step it interrupted,
and a skill relays the block whole. handoff still renders both parts and still stands alone for
a turn where no verb ran (`status`, the pause, a re-read of the boundary),
but a transition no longer needs a second call to finish its sentence. The
boundary that taught this ran two commands and, between them, two grammars:
the advisory came out prefixed and butted against the lead line while the
Verdict beside it read Plumb, because the stray was a fact only the
checkpoint knew and the fold never saw it. A block one command emits cannot
be relayed out of order, and it cannot disagree with itself.

The same positional rule governs every tier: the CLI's lines are relayed
whole, and the model writes nothing around them. A boundary turn is the
checkpoint's block; a driver turn is the verb's.

### The one-liners

The register ([D84 (one-liner-register)](decisions.md#d84)) governs one-liners,
and only those: the transitions, the
captures, the advisories, and the refusals, each a single line a skill relays
into a turn. A readout keeps its own shape, glyphs and list intact (the
dashboard, `recover`'s check lines, the worktree paths under a spike's
notice), and the sentinel headers (`NO ACTIVE SESSION`, `NO ACTIVE BUILD`)
stay exactly as they are.

That exemption leaves two pointer vocabularies standing, and they stay that
way. Every ending closes on `**Next Up**: Step 1 of 3 - <title>`, which states
a fact and leaves the move to the human. The dashboard closes on `next → build
step 1 — /plumbbob:build`, which names the move in the imperative, because the
dashboard is the one surface a human reads while deciding what to type next,
and it is read inside a `text` fence where a bold label would be literal
characters. Converging them would either put markdown inside that fence or
repeat, in a Next Up line, the step title the dashboard's own step list is
already showing. So does `plumbbob check`'s console trailer, which is
never relayed: the gate verdict this register cites is checkride's Stop-hook
notice, and the check row above is where it lands. checkride's own verdict is
the reference the shape was read from:

```text
checkride green in 3.6s ✔ (10 checks, without test, slowest: spell in 1.8s)
```

A line states its fact and never the move, and where it sits picks its head.
An ending goes to stdout as one block, and its lead line wears a bold label
like every other part of it:

```text
**Checkpoint**: Step 15 complete (2d917cde7)
**Parked**: should /password-reset get the same throttle? (tangent)
```

The label names the transition: the artifact that landed (`Checkpoint`,
`Plan`, `Spike report`) or the subject that moved (`Parked`, `Reverted`,
`Session`, `Active build`). The fact reads on from the label instead of
repeating it, which is why `checkpointed` is no longer a word the CLI says;
the noun is the artifact. A capture's tag rides the tail, so the line printed
and the line written to the ledger read the same. `Step N` is a proper noun
throughout an ending, in the lead line and inside the sentences under it:
`**Abandoned**: Step 16`, `Staged paths reach outside Step 16's seam`.

An advisory belongs to the ending it qualifies, so it rides stdout with the
rest of the block, unprefixed and opening on a capital letter, as the
sentence it is:

```text
Staged paths reach outside Step 16's seam ⚠ (test/integration/spike.test.ts)
  → the checkpoint captures them, so revise the plan with /plumbbob:step
```

A refusal is not an ending. Nothing landed, there is no block for it to join,
and it goes to stderr, where the head is the prefix:

```text
plumbbob: <subject> <state> (<detail>)
```

The one colon is spent on that prefix, which earns it by naming the speaker:
a refusal is the line that lands beside checkride's output and git's in one
terminal result, and scrollback is grepped for that word. An ending has one
speaker already, so naming it again inside the block is the machine noise
this register exists to kill.

The detail is one trailing parenthetical, comma-separated, and it degrades by
count the way a readout row does: a list that overruns 80 columns drops from
the tail and says how many it left (`and 2 others`), keeping two named so the
count sizes something the reader can see. One or two items never degrade,
because a notice wraps where a fence row cannot.

No pointer rides a single line. Every ending closes on its Next Up instead,
a row of its state table or a driver's one labeled line, so a verb that carried its own tail (`Back at the boundary.`,
`` `status` to orient. ``) was a second seam in a turn that has one. The one
exception is `start`, which ends on its remedy line: the plan skill owns the
turn that follows, and there is no step yet to aim at.

An advisory is one line, one per line, the warning glyph trailing the fact,
and beneath it a single indented `→` line carrying the remedy. A refusal
spends that same line on what unblocks it. The `heads-up` and `note` labels
are retired, because the glyph table already gives `⚠` to a warning and `→`
to what happens next.

The order of an ending is fixed: the lead line, the advisories, then the
state table, or a driver's one pointer line, one blank line between each.
So a relay never has to work out which line leads, and a stray a checkpoint
alone can see lands just above the Verdict it earned a rung on:

```text
**Checkpoint**: Step 16 complete (f2b83e17c, details: [build-log.md:97](.plumbbob/builds/presentation/build-log.md#L97))

Staged paths reach outside Step 16's seam ⚠ (test/integration/spike.test.ts, test/integration/use.test.ts)
  → the checkpoint captures them, so revise the plan with /plumbbob:step if that is real scope drift

| **Verdict** | ◐ A hair off (seam strayed) |
| --- | --- |
| Next Up | Step 17 of 18 - feat(ending): every transition prints its whole ending (model: **Opus**, details: [intent.md:512](.plumbbob/builds/presentation/intent.md#L512)) |
```

Every one of these lines is rendered by one formatter in `src/lib/notice.ts`:
`transition()` for the labeled head, `advisory()` for the bare one,
`notice()` for the prefixed one, a single assembly under all three for the
fact, the detail list, and the remedy, `stateTable()` for the table, and
`ending()` for the order they stack in. A verb composes those parts and never a string, so moving the shape
is one edit here and one there rather than a sweep across the verbs, and the
tests assert through the same renderer.

## The build ranges

A plan may say where the build stops for a human call, and the card reads it
back. `## Build ranges` sits in `intent.md` right after `## Build order`
([D92 (build-ranges)](decisions.md#d92)): one numbered item per range, each
the command the human types, the stop that ends it, and the model to run it
on. **A range is advice the way a `- model:` line is, and it grants nothing
until the human types the run that names it.** `/plumbbob:run` runs what is
left of the range holding the next step, and `/plumbbob:run 3` runs range 3
([D95 (run-verb)](decisions.md#d95)); the turn hook mints the grant from the
plan as it stands at the keystroke, `steps 6-9` for a range that lands its
steps and nothing for a bare one
([D96 (plan-names-the-grant)](decisions.md#d96)), because a grant comes only
from the literal prompt ([D65 (human-typed-grants)](decisions.md#d65)), and a
line the model can edit would otherwise be a grant the model could forge
([D67 (auto-not-a-grant)](decisions.md#d67)). A run that lands its range ends
on the stop card, the review the plan's stop asked for, with every open park
on it ([the stop card](#the-stop-card)). Three sections a model wrote by
hand on 2026-10-16, one each in checkride, fascicle, and this repo, settled
the shape before any code read one, and all three cut at the same points: a
decision the plan could not make on paper, made at a step's own pause; a
review before later steps build on what landed, made at the boundary after a
range's last step; and a thing only a human can do, such as a push or a live
key. The plan places the stops and the CLI never does, because where a call
falls is judgment. When the build order moves, `plumbbob order` moves which
steps fall between the stops, and nothing more
([the re-cut](#the-re-cut-the-order-makes)).

### The plan's section

The running example for the rest of this section is a twelve-step plan cut
into five ranges:

````markdown
## Build ranges

Five commands drive the build. Two stops are calls made at a step's own pause, and three are reviews after a range lands.

1. `/plumbbob:build 1`, **stop:** at step 1's pause, approve the schema before anything writes to it
   - model: opus
2. `/plumbbob:build 2-5`, **stop:** review the parser before the renderers build on it
   - model: opus
   - note: run long jobs in the foreground while the range is live
3. `/plumbbob:build 6-9`, **stop:** review the card on a live boundary before the skills teach it
   - model: opus
4. `/plumbbob:build 10`, **stop:** at step 10's pause, pick the label the docs will name
   - model: fable
5. `/plumbbob:build 11-12`, **stop:** the final read of the docs, then `/plumbbob:finish`
   - model: opus
````

An item opens on the command in backticks, then a comma, then `**stop:**` and
the stop's text to the end of the item, wrapped lines joined with a space. The
command's steps are written as a typed range is (`1`, `2-5`, or `20,5-9`,
[D91 (step-list-grants)](decisions.md#d91)), and the command's form says where
the range stops: a bare `N` builds step N to its pause, so its stop is a call
made before the step lands, and a span lands every step it names and stops at
the boundary after the last ([D85 (range-top-lands)](decisions.md#d85)), so
its stop is a review of what landed. A `- model:` sub-line is optional and
written plain, the first word the token, as a step's is; any other sub-line (a
`- note:` on what to watch for) is the reader's, and the CLI leaves it alone.
A paragraph before the list is the human's too: the parser reads the items.
The grammar is the Steps grammar because an item wraps where a table row of
prose runs off the screen, and the item's number is the handle the card
counts by.

Nothing about a range is stored. It is done when every step it names is
`[x]`, in progress when it holds the next undone step in build order, and
what is left of it is its undone steps, written in build order
([D91 (step-list-grants)](decisions.md#d91)), the steps a run lands; a human
landing the last of them by hand types `/plumbbob:build 9-9`, which lands it
where a bare `9` would pause. The boxes are already the truth, and a second
copy of a fact is one more thing to drift.

The template ships one item, and it is scaffold until someone fills it in
([D77 (placeholder-uncounted)](decisions.md#d77)): an item whose command or
stop still holds a `<...>` fill-in is neither a range nor a report, so a fresh
build's dashboard carries no warning for it, and the coverage check below runs
only once a real range parses. The placeholder, exactly:

````markdown
1. `/plumbbob:build <N-M>`, **stop:** <the call that is the human's here: a decision the plan leaves open, a review before later steps build on what landed, or a thing only a human can do>
   - model: <the strongest model any step inside it recommends>
````

A range the plan has outgrown is reported, and the CLI rewrites one only where
the build order settles which steps it holds
([the re-cut](#the-re-cut-the-order-makes)), because only the human knows
where a stop belongs, and a suggested command that halts early is the failure
ranges exist to remove. Four things flag one, and each has its words, the same
on the card and the dashboard:

| the drift | its words |
| --- | --- |
| a range names a step the plan lacks | `step 14 is not in the plan` |
| two ranges name one step | `step 7 is also in range 4` |
| the build order puts a step from outside a range between two of its own | `the build order puts step 11 inside it` |
| an undone step sits in no range | `no range names step 12` |

The first three flag the range; the fourth flags the plan, since no range
holds the step. A flagged range gets no command on the card. A range may name
a step out of build order without drifting, because a list is walked in build
order however it is written.

Two rules say where the build order puts a range. A landed step the line
leaves out counts as built ahead of the line, because `plumbbob order` lists
undone steps alone, so a step missing from the line landed before the line was
written; re-ordering what is left of a range that has partly landed moves
nothing that landed. And a range's span ends at its last undone step, since a
step placed after every one of them cuts nothing short. The span still opens
at the range's first step, landed or not, so a range a run halted inside stays
flagged until the step that halted it lands.

### The re-cut the order makes

`plumbbob order` keeps the ranges true to every sequence it writes, `--reset`
included ([D109 (ranges-follow-the-order)](decisions.md#d109)). The order says
when each step builds and a range says where the build stops, so once the
sequence moves, a step belongs between the stops the order put it between. A
step no range names joins the range whose steps sit on both sides of it, else
the range it builds ahead of, else the range it builds after: a blocker found
at a stop and ordered next joins the range the next run walks, and a step
ordered after every range joins the last. A step the order moves out of its
range is placed by the same rule, and where the order tangles two ranges, the
re-cut moves the fewest steps between them, a step at the seam joining the
range it builds ahead of. A landed range takes no step, since its call was
made; a bare range keeps its one step and takes no other, since it builds that
step to its pause; and every range keeps its longest stretch, so a re-cut moves
steps and never the bulk of a range.

The order settles nothing when two re-cuts would move as few steps, when a step
sits where no range may take it (ahead of a bare range, with nothing open
before it), or while the section holds drift no sequence can settle: an item
that does not parse, a range naming a step the plan lacks, or one undone step
two ranges name. Those ranges stay as written, and their rows stay flagged.

A re-cut rewrites the command in each item it changes and nothing else in the
item: the steps in build order, so `/plumbbob:build 4-6` with step 10 ordered
ahead of it becomes `/plumbbob:build 10,4-6`, and a range that lands its steps,
down to one, is written `9-9` so it still lands. The verb's ending names what it
re-cut on a second lead beneath the order:

```text
**Build order**: 10, 4, 5, 6, 7, 8, 9

**Build ranges**: range 2 of 3 re-cut (steps 10,4-6)

**Next Up**: Step 10 of 10 - fix(parser): accept an empty header (details: [intent.md:24](.plumbbob/builds/x/intent.md#L24))
```

Two ranges or more read `ranges 2, 3 of 3 re-cut (range 2: steps 10,4-6,
range 3: steps 7-9)`, each range's steps as its command now writes them. A range
the order leaves for the human rides beneath the leads as an advisory, in the
words its row carries, and the last one names the move:

```text
Range 2 of 3 needs a re-cut ⚠ (the build order puts step 6 inside it)
No range names step 11 ⚠
  → /plumbbob:refine ranges
```

An order that changes no range adds neither part, so the ending reads as it
always has.

### The Range row beneath Next Up

The first row beneath Next Up names the range holding the step Next Up
names, numbered as the plan's item over the count of ranges, and the run
that lands what is left of it from that step, the steps in a bracket:

```text
| Next Up | Step 6 of 12 - feat(orient): read the ranges (model: **Opus**, details: [intent.md:30](.plumbbob/builds/x/intent.md#L30)) |
| Range | 3 of 5: /plumbbob:run (steps 6-9) |
| Parked | 2 of 7 open |
```

The row comes first beneath Next Up, ahead of the order and the parks,
because it is the one that names what to type. Its forms:

```text
| Range | 3 of 5: /plumbbob:run (steps 6-9) |
| Range | 3 of 5: /plumbbob:run (steps 8-9) |
| Range | 3 of 5: /plumbbob:run (step 9) |
| Range | 4 of 5: /plumbbob:run (step 10 to its pause) |
| Range | 3 of 5 lands with step 9 |
| Range | 3 of 5 needs a re-cut (the build order puts step 11 inside it) |
| Range | no range names step 12 |
```

The first is a range not yet started. The second and third are what is left
after steps 6 and 7 landed, and then 8: a range that stopped early (a red
check, a halt on trouble) resumes from the card, and the run lands its last
step rather than pausing on it, so one step is bracketed the way four are.
The fourth is a bare range, whose run builds its step to the pause, and the
bracket says so. The fifth is the pause on a range's last step, below. The
last two are the drift words above, in place of a run. A list range writes
what is left in build order (`20,5-9`), so the first number in the bracket
is where the run starts. The row's label says `Range`, so its fact opens on
the count; the row was a segment of the note beneath Next Up,
`· range 3 of 5: /plumbbob:run (steps 6-9)`, until the note became rows
([D111 (state-table)](decisions.md#d111)).

The verb is the same at every site, so the bracket is what changes, and it
is written as the grant the hook will mint
([D96 (plan-names-the-grant)](decisions.md#d96)): `steps 6-9` on the card
is `steps 6-9` in `GRANT` once the human types the run, and a card that
named one set while the hook minted another would be a suggestion that does
something else. The plan's item keeps `/plumbbob:build 6-9` as the range's
definition, and typing that still lands the range by hand; the card names
the run because the run is what the human types now, and the steps because
they are what it will land
([D98 (card-names-the-run)](decisions.md#d98)).

The row renders at every site the table does: the plan pause and the plan
commit, where Next Up names step 1 and the row names range 1 whole; a step
pause; and a boundary. The driver pointer and the `Back to` reminder carry no
rows, as before. At a step pause the row names the range holding the step in
flight, and the bracket opens on that step, because `/plumbbob:run` typed
there is that pause's `looks good`
([D95 (run-verb)](decisions.md#d95)): it lands the step on a green check
and runs on through what is left of the range, and the grant the hook mints
counts the step in flight as undone. So at step 6's pause, where Next Up
names step 7, the row reads `3 of 5: /plumbbob:run (steps 6-9)`, and the
Your Call block offers the run as a move
([the Your Call block](#the-your-call-block)). At the pause on a range's
last step a run would land that step and end on the range's stop rather
than start the next range, so the row names no run: it reads
`3 of 5 lands with step 9`, and Next Up's step 10 waits for the boundary,
where the Stop row and the next range's Range row render. A bare range's
pause is the same case, since its run ends once its step lands.

**While the Range row suggests a range, the bracket's bold model is the
range's.** Next Up's bracket reads `model: **Opus**` from the `- model:`
line of the range holding the step Next Up names, rather than the step's,
and the Range row names no model of its own, because the bold token is the
one the human acts on before the next run, the run is the range, and a
range's first step is often not its hardest. At the pause on a range's last
step that is the next range, the one the human picks a model for, while
the Range row names the range that is finishing. A range with no model line
leaves the step's in place, and the pointer at a step in no range, or in a
flagged range, keeps the step's, as before.

### The Stop row

The boundary where a range's last step lands says why the build stops there.
A boundary turn with it, whole:

```text
**Checkpoint**: Step 9 complete (c7d8e9f0a, details: [build-log.md:140](.plumbbob/builds/x/build-log.md#L140))

| **Verdict** | ● Plumb |
| --- | --- |
| Stop | Range 3 of 5 landed - review the card on a live boundary before the skills teach it (details: [intent.md:63](.plumbbob/builds/x/intent.md#L63)) |
| Next Up | Step 10 of 12 - feat(docs): name the label (model: **Fable**, details: [intent.md:34](.plumbbob/builds/x/intent.md#L34)) |
| Range | 4 of 5: /plumbbob:run (step 10 to its pause) |
```

The shape is one row labeled `Stop`: `Range N of M landed`, a plain hyphen,
the stop's text as the plan wrote it, and a bracket pointing at the item,
where the `- note:` the card does not carry can be read. The label is `Stop`
because it names the thing the plan wrote (`**stop:**` is the item's own
key), it reads as a noun on the card the way `Checkpoint` does, and the
question the human brings to that boundary is why the build stopped here. It
rides between the Verdict and Next Up, so the Verdict the step earned lands
first and the stop reads straight into the pointer that names the next
range. The row is the CLI's, measured from the plan and the boxes;
`checkpoint` prints it, `handoff --full` at the same boundary prints it the
same way, and the relay check reads it as a part of the block.

It renders on exactly one boundary per range: the one where the range's last
undone step lands, whichever step that is and however it landed, by the range,
by `--auto`, or by hand. A bare range never earns one, because its stop is its
own pause: the step's `plumbbob status` carries the stop text, in the ranges
block and in the run header, and the model writing that pause's
recommendation reads it there. The plan commit carries
none, since nothing landed. The boundary keeps its tier: the row is
orientation, and no Your Call block follows it. A run that lands its range
ends on the stop card instead, where the row rides the card's own state
table ([the stop card](#the-stop-card)); the boundary above is what a range
landed by `/plumbbob:build`, a typed range, `--auto`, or by hand still ends
on.

### The dashboard's ranges block

`plumbbob status` lists the ranges beneath the steps, in the step list's own
grammar:

```text
  ranges  2 of 5 done
  ✓ 1  /plumbbob:build 1 · opus
  ✓ 2  /plumbbob:build 2-5 · opus
  ▸ 3  /plumbbob:build 6-9 · opus   ← next
        stop: review the card on a live boundary before the skills teach it
    4  /plumbbob:build 10 · fable
        stop: at step 10's pause, pick the label the docs will name
    5  /plumbbob:build 11-12 · opus
        stop: the final read of the docs, then /plumbbob:finish

last checkpoint  step 5 · 1a2b3c4
parked 2 of 7 open · open questions 0

next → run range 3 of 5 — `/plumbbob:run` (steps 6-9)
```

A row is the item's number, its command as the plan wrote it, and its model
behind the separator when it has one. `✓` marks a range whose every step is
done and `▸` the one holding the next undone step, with the step list's
`← next` tail. Each undone range carries its stop on an indented line, because
the stops ahead are what the human steers by, and a landed range folds to its
row, because its call was made. The block is the reference surface, so no
stop is cut to a count. The dashboard's pointer names the run when the next
step sits in a range, `run range 3 of 5`, with the verb and the bracket the
card's Range row carries: `(steps 8-9)` once two of its steps have landed,
`(step 10 to its pause)` for a bare range. With the step in flight, or an
explicit request, the pointer reads as it does today; `--run` is the one
request that keeps it, below.

While a stop card waits for its reply, the block says whose card it is. The
landed range takes the tail `← stop card waiting` and keeps its stop line,
since its call is not made until the reply records it, and the range holding
the next step keeps its `▸` and drops `← next`, so the block carries one
arrow. The pointer names the card:

```text
  ranges  2 of 5 done
  ✓ 1  /plumbbob:build 1 · opus
  ✓ 2  /plumbbob:build 2-5 · opus   ← stop card waiting
        stop: review the parser before the renderers build on it
  ▸ 3  /plumbbob:build 6-9 · opus
        stop: review the card on a live boundary before the skills teach it
    4  /plumbbob:build 10 · fable
        stop: at step 10's pause, pick the label the docs will name
    5  /plumbbob:build 11-12 · opus
        stop: the final read of the docs, then /plumbbob:finish

last checkpoint  step 5 · 1a2b3c4
parked 2 of 7 open · open questions 0

next → reply to range 2 of 5's stop card (`/plumbbob:run` records it, then runs range 3 of 5)
```

The bracket names the reply that records the card from any session: the
next range's run, or on the plan's last range the finish,
``(`/plumbbob:finish` records it, then writes the report)``. It never names
`looks good`, which records only with the card in the conversation. When
the next run would refuse, the bracket names the way back to the card
instead, ``(`show the stop` brings it back)``. The card's pointer outranks the
run's and an explicit request, because a step entered now would write its
pause over the range's review in the detail file; a spike and a step in
flight keep their own.

A drift row rides beneath the range it flags, opening on the warning glyph
and the words from the table above, and a step no range names, or an item
that does not parse, gets a row of its own at the block's end:

```text
  ▸ 3  /plumbbob:build 6-9 · opus   ← next
        stop: review the card on a live boundary before the skills teach it
        ⚠ needs a re-cut: the build order puts step 11 inside it
    4  /plumbbob:build 10 · fable
        stop: at step 10's pause, pick the label the docs will name
  ⚠ no range names steps 11, 12
  ⚠ item 5 under Build ranges does not parse
```

A flagged range takes the pointer back to today's step move, `build step 6 —
/plumbbob:build`, unless a stop card waits, and the drift row says why no
range command is named.
`recover` reports a range naming a step the plan lacks, beside the finding it
already makes for a build order that does.

### The run header

`plumbbob status --run "<args>"` is the dashboard the `/plumbbob:run` skill
reads first, the raw text of its invocation passed through the way the build
skill passes `--invoked`. It resolves the run the text names
([D95 (run-verb)](decisions.md#d95)), the range holding the next undone step
in build order with the step in flight counted undone, or range N when the
text carries a number, and prints the dashboard beneath a header naming it,
with the run's first step marked `← requested` and the pointer naming the
run, as an explicit `/plumbbob:build 6` repoints them at a step:

```text
run  range 3 of 5 · steps 6-9 · ends at step 9's boundary
     stop: review the card on a live boundary before the skills teach it
     grant: steps 6-9

PlumbBob — Build ranges   [DESIGN]
```

The first line is the range, what is left of it (the bracket the card
carries, `steps 6-9`, `steps 20,5-9`, or `step 9`), and where the run ends:
`ends at step 9's boundary` for a range that lands its steps,
`ends at step 10's pause` for a bare one. The stop rides beneath, as the
ranges block writes it, because a bare range's pause is where the model
writes the recommendation to that call, and the stop is what it speaks to.
The third line is the grant the hook minted at the keystroke
([D96 (plan-names-the-grant)](decisions.md#d96)), and it is the line the
skill trusts over the two above it, since the hook read the plan the human
typed against. Its forms:

```text
     grant: steps 6-9
     grant: none, as a bare range builds to its pause
     grant: none
     grant: range 9, unlike the run
     grant: steps 6-9, unlike the run
```

The first is a run the hook minted as the header resolved it. The second is
a bare range's, where no step lands and the pause is the point. The third is
a landing range the hook minted nothing for (a plugin older than the run, or
a bare `/run` that reached Claude Code's own skill), so no step could land,
and the skill reports it rather than walks it. The last two name a grant
unlike the run: `range 9` from a hook before step lists, or a set that is
not the run's, because the typed number never reached the injection and the
header resolved the next range while the hook minted the typed one, or a
record at the boundary re-cut the range between the keystroke and the walk.
The header states the difference; what the skill does with it is the run
skill's to say.

A fourth line rides beneath the grant while a stop card still waits for its
reply, naming the range whose card it is:

```text
run  range 4 of 5 · step 10 · ends at step 10's pause
     stop: at step 10's pause, pick the label the docs will name
     grant: none, as a bare range builds to its pause
     waiting: range 3 of 5's stop card, recorded before the run
```

A run typed at a waiting card records it first
([D102 (settle-in-one-reply)](decisions.md#d102)), and the line is how a run
skill in a fresh session learns that a card is waiting at all. A card waits
while three things hold: a STOP stamp, a detail file whose header names the
stamp's range, and that range still reading as landed. The last keeps a
re-cut from wedging the build, since a range re-cut to take a new step no
longer reads as landed, so its card stops waiting and the step can be
entered. The line and the dashboard's marked row read the card through one
call, so they come and go together: once the record lands, or once the
range no longer reads as landed.

A run that names nothing it can walk prints no header
([D97 (run-refuses)](decisions.md#d97)). The dashboard renders as it does
without the flag, and its pointer is the refusal with the move that unblocks
it, in the dashboard's own register:

```text
next → cut the ranges — `/plumbbob:refine ranges` (the plan declares none; `/plumbbob:build` builds step 6 alone)
next → re-cut the ranges — `/plumbbob:refine ranges` (no range names step 12)
next → re-cut the ranges — `/plumbbob:refine ranges` (range 3 of 5 needs a re-cut: the build order puts step 11 inside it)
next → run range 3 of 5 — `/plumbbob:run` (steps 6-9; range 2 of 5 has landed)
next → run range 3 of 5 — `/plumbbob:run` (steps 6-9; the plan has no range 7)
next → run range 3 of 5 — `/plumbbob:run` (steps 6-9; a run names one range)
next → harvest 2 parked ideas — `/plumbbob:harvest`; then finish up — `/plumbbob:finish` (or `/plumbbob:step` to add another increment)
next → finish step 12 — `/plumbbob:verify` (or `/plumbbob:abandon` it; a run names range 5 of 5, which holds it)
next → finish step 12 — `/plumbbob:verify` (or `/plumbbob:abandon` it; no range names it)
next → close the spike — `plumbbob spike done`
```

The first three are the plan's: no ranges, a next step no range names, and
a flagged range, each pointing at the re-cut, with the build named beside
the first because a plan without ranges is still built a step at a time.
The fourth, fifth, and sixth refuse what was typed: a range that has
landed, one the plan lacks, and a span or a list of ranges (`2-4`, or
`2,4`), a form this build leaves unread
([D96 (plan-names-the-grant)](decisions.md#d96)); each names the run the
card names in its place, since that is the range to type. The seventh is the
dashboard's own ending, which a run adds nothing to. The last three are the
step in flight's and the spike's: a numbered run naming a range other than
the one holding the step in flight refuses, so does any run while the step
in flight sits in no range, since the range the run would name starts
elsewhere, and so does any run while a spike is open, each with the remedy
the dashboard already names, because a run that starts elsewhere would
sweep the half-built diff into its first commit. A bare run while a step is
in flight is not a refusal when a range holds that step: it names that
range, and the header renders.

### The stop card

A run that lands its range ends on the stop card
([D100 (stop-card)](decisions.md#d100)): the review the plan's stop asked
for, written by the model into the detail file in the range's shape and
rendered by `plumbbob handoff --stop`. It is a decision turn, at the tier of
the step pause, and it closes the run's turn in place of the last
checkpoint's block. The block used to be the whole ending of a range, and it
left the review with nothing to read: every step before the last had landed
without a pause, so a step that landed a hair off mid-range never reached the
screen, and the parks the range piled up sat behind a count at the end of the
note. The card puts both on screen, with the range's readout between them.

It renders on exactly one ending: the turn in which the checkpoint completes
a range the human typed a run for. The turn hook marks the run in a `RUN`
control file as it mints the grant ([the stop's record](#the-stops-record)),
so the checkpoint can tell a run's landing from any other, and a range landed
by `/plumbbob:build 6-9`, by `--auto`, or by hand keeps the boundary above,
Stop row and all. A run that halts on trouble mid-range ends at that step's
pause, as a typed range does; the mark outlives the pause, so a `looks good`
that lands the range's last step still owes the card, and the human who
approved the halt reads the review in the same turn. A bare range earns no
card, because its stop is its own pause and the recommendation there speaks
to it.

The card, whole, at the boundary where the running example's range 3 landed:

````markdown
**Summary**: The boundary where a range's last step lands now says why the build stops there, and the dashboard lists the ranges beneath the steps.

**Readout**:

```text
steps        4 of 4 landed
             - 6 a1b2c3d · 7 b2c3d4e · 8 c3d4e5f · 9 d4e5f6a
check        green: 11 of 11 checks, 4 landings
done-when    met
decisions    3 of 3 honored
constraints  4 of 4 honored
seam         strayed: 1 path outside step 8's seam
             → src/lib/notice.ts
diff         +412 -38 across 17 files
             - docs/presentation.md +96 -12
             - src/lib/notice.ts +14 -2
             - src/lib/orient.ts +188 -9
             - src/verbs/checkpoint.ts +22 -4
             - src/verbs/handoff.ts +61 -7
             - src/verbs/status.ts +9 -1
             - test/evals/helpers/anatomy.ts +4 -1
             - and 10 more
spent        3h 12m · 1 red run
```

**Harvested**: 3 of 8 parked ideas open

| Park | What it is | Why it matters | Lean |
| --- | --- | --- | --- |
| P6 · note on the card | the Stop row could carry the range's note too | the note says what to watch for at the stop | tangent: the bracket already points at the item, where the note is |
| P7 · second drift | recover reports a range naming a step the plan lacks, but not two ranges naming one step | step 10's done-when assumes recover flags both drifts | blocker: a step before 10 teaches recover the second one |
| P8 · raw link | a stop's markdown link prints raw on the dashboard | the dashboard is read in a fence, where the link stays text | tangent: cosmetic, and the card renders it |

**Your Call**:

Approving locks in each lean above; to change one, say so first (`make P6 a blocker`).

- `looks good` → I record the review and every lean as proposed, folding a blocker into the plan; back to the boundary
- `/plumbbob:run` → I record them the same way, then run range 4 of 5 to its stop
- anything that reads as direction → I change the lean and say what moved; nothing is recorded until you approve
- `expand`, or any question → I show more of what is there; nothing changes, and `show the stop` brings all of this back

| **Verdict** | ◐ A hair off (seam strayed) |
| --- | --- |
| Stop | Range 3 of 5 landed - review the card on a live boundary before the skills teach it (details: [intent.md:63](.plumbbob/builds/x/intent.md#L63)) |
| Next Up | Step 10 of 12 - feat(docs): name the label (model: **Fable**, details: [intent.md:34](.plumbbob/builds/x/intent.md#L34)) |
| Range | 4 of 5: /plumbbob:run (step 10 to its pause) |

**Recommendation**: Approve it, with P7 as the blocker it is. Step 8's stray is the label the Stop row needed, in a file the plan should have named, and the drift recover misses is the one step 10 builds on.

[more details](.plumbbob/detail.md)
````

Its parts, in order, and what each one is:

- **The Summary** is the whole range's, not the last step's: the lead states
  what the range built. The model writes it from the steps' checkpoint
  bodies and the build-log's Log, not from recall, because a long run can
  compact its context partway through and lose its early steps, and it
  writes the five things worth a reviewer's eye across the range as the
  detail file's numbered sections, a step that landed a hair off first among
  them, behind the `more details` link
  ([D113 (short-card)](decisions.md#d113)).
- **The Readout** is measured across the range
  ([the range readout](#the-range-readout)), the files the range's commits
  changed listed beneath its `diff` row.
- **The Harvested part** lists every open park as a row of the lean table:
  its handle and title, its text, why it matters, and the lean the model
  proposes ([the Harvested part](#the-harvested-part)). A stop with no park
  open renders the card without it ([D100 (stop-card)](decisions.md#d100)):
  the review is the stop's point, the plain block left it nothing to read,
  and the one reply the card then costs is the run the human was going to
  type anyway.
- **Your Call** says that approving locks in the leans, then names the
  replies that settle the card in one message
  ([the reply at a stop](#the-reply-at-a-stop)).
- **The state table** is the Verdict, folded from the readout's rows
  worst-of with the range's accrued stats, the same fold a step's Verdict
  runs; the Stop row, `Range N of M landed`, the stop's text as the plan
  wrote it, and the bracket pointing at the item, which used to open the
  card as its lead and moved into the table the way the Now line did
  ([D111 (state-table)](decisions.md#d111)); Next Up, naming the next
  range's first step; and the Range row, naming that range's run, as the
  boundary's would. The Parked row does not ride here, because the
  Harvested lead above carries the count. On the plan's last range the
  pointer reads `Nothing planned`, and no Range row follows it. The card has
  no Now row, since no step is in flight, and no `Checkpoint` lead, since the
  range's checkpoints are the readout's first row.
- **The recommendation** is the move on the review and the proposals
  together: `Approve it`, or `Approve it, with P7 as the blocker it is`,
  then why, and a range that landed a step the human should look at before
  the next run says so here. The `more details` link closes the card.

The card shows once per stop
([D110 (reply-after-the-card)](decisions.md#d110)), under a stamp of its
own: the range and the turn the card printed in. Every later turn at the
same stop is the model's reply, closed by the reminder naming the stop still
waiting:

```text
**Next Up**: Back to Range 3 of 5's stop - review the card on a live boundary before the skills teach it
```

The reminder prints whatever changed since: a lean the human changed, a
park, a gate run. The card comes back on request:
`plumbbob handoff --stop --full` prints it, the `expand` move names the
phrase (`show the stop`), and a human who wants it in a fresh window asks the
same way. The record clears the stamp. The card carries no inline diff: a
range's change is its commits, read by the shas on the steps row, and the
diff row sums them.

### The range readout

The readout keeps the step pause's fence, its column, and its rules, and
measures across the range ([D101 (range-readout)](decisions.md#d101)): the
CLI reads the steps' commits, the checkpoints ledger, `stats.json`, and the
last check's summary, and the model writes the three judgment rows under the
range detail's header rule. Eight rows at most, in this order:

```text
steps        4 of 4 landed
             - 6 a1b2c3d · 7 b2c3d4e · 8 c3d4e5f · 9 d4e5f6a
check        green: 11 of 11 checks, 4 landings
done-when    met
decisions    3 of 3 honored
constraints  4 of 4 honored
seam         held: 4 of 4 steps, no strays
diff         +412 -38 across 17 files
             - docs/presentation.md +96 -12
             - …
             - and 10 more
spent        3h 12m · green first run at every landing
```

| row | written by | true | failing |
| --- | --- | --- | --- |
| `steps` | CLI | `<N> of <N> landed`, the steps and their checkpoint shas on a continuation line | never; a step the ledger holds no commit for reads `no checkpoint` in its sha's place |
| `check` | CLI | `green: <N> of <M> checks, <L> landings` | `red: <slot> failing` |
| `done-when` | model | `met`, every step's | `not met: step 7, <what is missing>`, or `drift: <why no diff can meet it>` |
| `decisions` | model | `<N> of <N> honored`, the decisions the range exercised, or `none exercised` | `bent: <tag>, <how>`, or `drift` |
| `constraints` | model | `<N> of <N> honored` | `bent: <tag>, <how>`, or `drift` |
| `seam` | CLI | `held: <N> of <N> steps, no strays` | `strayed: <N> paths outside step 8's seam` |

The rules the range's rows add to the step's:

- The `steps` row is the range's identity on the readout, and its one row
  that measures nothing: it names each step the range landed with the sha
  of its checkpoint, in build order, so a reviewer can `git show` any of them.
  The shas pack onto continuation lines by width, a new line when one
  overruns the 67 columns, rather than one line per step, because each is a
  handle rather than an item to judge.
- The `check` row is the last run's summary, as at a pause, with the count
  of landings behind it: every landing passed the gate, since the checkpoint
  refuses on red, and the red runs along the way ride the `spent` row and
  the Verdict's advisory rather than this row. A narrowed gate names its
  slots here as it does at a pause.
- The `seam` row compares each step's commit against that step's own seam,
  never the range's union, because a step that wandered into another step's
  seam still wandered. Green counts the steps; red names the one step and
  its paths on the `→` line, and two or more strayed steps break onto
  continuation lines, one per step. It folds no lower than `◐ A hair off`,
  as at a pause, since a stray in a landed commit asks the same question of
  the plan.
- The `diff` row sums the commits, a file counted once however many commits
  touched it, and lists those files beneath it the way a step's does, seven
  named and the rest a count past eight
  ([D113 (short-card)](decisions.md#d113)). It never folds, and at a stop it
  never vanishes.
- The `spent` row runs from the first step's `startedAt` to the last step's
  `landedAt`, then the red runs summed across the steps, or
  `green first run at every landing` when there were none, then any drift
  warnings. No gate clause rides it: a gate is one run's wall clock, and a
  range has several, only the last of which is on disk. No turn count rides
  it either, since the ledger counts a step's turns from the tick that
  entered it, and a range has one tick per step.
- A step landed by hand, with no `build` entry to count from, contributes
  its commit to every row and nothing to `spent`.

The Verdict folds as a step's does, worst-of, and names its component the
same way: a drifted row, then the first failing row in row order, then the
first advisory in a fixed order, now counted across the range (`seam
strayed`, `2 red runs before green`, `1 revert in the range`, `3 commits
outside the ledger`, the last counting commits between the range's
checkpoints that are not plumbbob's own), then `● Plumb`.

### The Harvested part

A park is a line under `## Park list` in `build-log.md`, and the card gives
each one a handle it did not have: `P6` for the sixth line ever parked,
harvested lines counted, so the number is the park's place in that list
([D105 (park-handles)](decisions.md#d105)). That is the count the Parked row
already sizes (`3 of 8 open` counts the same lines), a line is never deleted
from the list, only flipped, so the handle is stable for the life of the
build, and the record can match a proposal to its park by the number alone,
with no guessing against the text. The handle reads `P6` on the card, in the
detail file, and in a reply, one name at every site so nothing has to be
mapped between them, and never a bare number, because the bare numbers are
the detail file's sections (`expand 2` opens one) and one reply at a stop can
carry both ([D102 (settle-in-one-reply)](decisions.md#d102)).

The part is a label, a lead that sizes the list, and the lean table, one row
per open park in list order ([D112 (lean-table)](decisions.md#d112)):

```text
**Harvested**: 3 of 8 parked ideas open

| Park | What it is | Why it matters | Lean |
| --- | --- | --- | --- |
| P6 · note on the card | the Stop row could carry the range's note too | the note says what to watch for at the stop | tangent: the bracket already points at the item, where the note is |
| P7 · second drift | recover reports a range naming a step the plan lacks, but not two ranges naming one step | step 10's done-when assumes recover flags both drifts | blocker: a step before 10 teaches recover the second one |
| P8 · raw link | a stop's markdown link prints raw on the dashboard | the dashboard is read in a fence, where the link stays text | tangent: cosmetic, and the card renders it |
```

A row is the park's handle and the short title the model gives it, the
park's text as the list holds it, why it matters, and the lean: the class
the model proposes, a colon, and its reason in one clause. The handle and the
text are the CLI's, read from the list, so the card can never misquote a
park; the title, the why, and the lean are the model's, written into the
detail file's `## Harvest` section as a proposal line with two field lines
indented beneath it, and handoff joins them into the row:

```markdown
- P6 → tangent: the bracket already points at the item, where the note is
  - title: note on the card
  - why: the note says what to watch for at the stop
```

The why is the column a reply turns on: a park's text says what it is, and
nothing on the card used to say whether it mattered, so a human settling
eight leans read eight parks cold. The parks rode bullet lines,
`- P6 · <the text> → lean: tangent, <the reason>`, the handle, the text, and
the lean run into one line, until the leans became a table. The class is the
model's suggestion and has to read as one, and `lean` is the plan's own word
for a proposed answer, the one an open question's `*lean:*` already carries,
so the column names the suggestion without a second term
([D106 (leans-harvested)](decisions.md#d106)). The part is labeled
`Harvested` because it lists what the run harvested for the human to judge.
The classes are the harvest skill's three, `blocker`, `tangent`, and
`pivot`, and the default for anything uncertain is `tangent`, as the skill
has always said. A gap reads as one: a park the section leaves out renders
`no lean proposed` in the Lean column, and the record leaves that park open;
a proposal with no field lines renders the handle alone and `not given` for
the why, which is also how a detail written before the table still reads. A
tag a park's line carries (`(tangent)` from `plumbbob park`) is the parker's
own guess and stays in the text; the Lean column is the proposal. A pipe in
a park's text is escaped, so its row keeps its four cells.

### The reply at a stop

The card's proposals are settled in one reply
([D102 (settle-in-one-reply)](decisions.md#d102)). The harvest used to ask
for a confirmation per item, and one reply per item is what made a stop's
harvest a chore the human skipped; the card puts every proposal in front of
them at once, and the classes stay the human's call, which is the harvest
skill's contract. The Your Call block opens on one line beneath its label,
ahead of the moves, saying that approving locks in each lean and that
changing one means saying so first, with an example naming a handle on the
card ([D106 (leans-harvested)](decisions.md#d106)), because the reply is a
decision on every lean at once and the human has to know that before typing
`looks good`. The example is the first open park recast as the class its
lean is not, a blocker for a tangent or a pivot and a tangent for a blocker,
so it always names a change the card could take; the direction row carries
no example of its own, since the line above it holds the one. Then the
moves:

```text
**Your Call**:

Approving locks in each lean above; to change one, say so first (`make P6 a blocker`).

- `looks good` → I record the review and every lean as proposed, folding a blocker into the plan; back to the boundary
- `/plumbbob:run` → I record them the same way, then run range 4 of 5 to its stop
- anything that reads as direction → I change the lean and say what moved; nothing is recorded until you approve
- `expand`, or any question → I show more of what is there; nothing changes, and `show the stop` brings all of this back
```

`looks good` locks in every lean: the model folds a confirmed blocker into
`intent.md` by the harvest skill's rules first, then records the stop
through `plumbbob harvest`, and relays its ending. A reply that changes a
lean is direction (`make P7 a tangent`), and the handle is how it names one:
the model rewrites the detail file's line, says which lean moved, and ends
on the reminder `plumbbob handoff --stop` prints, since the card has shown
([D110 (reply-after-the-card)](decisions.md#d110)). `show the stop` brings
the card back with the lean as it will be recorded, and `looks good`
records every lean as the detail file now reads. Nothing lands until
`looks good`. A blocker that becomes
a step goes into a range still to come, the one it builds with, or into a
bare range of its own when it brings a call; never into the range that just
landed, whose call the card is making, since the step would reopen it. A new
range takes the next free item number, and no item is renumbered, because
the stamp, the detail file's header, and the record all find the landed
range by its number. A question is answered and closed on the reminder. The block names no `revert` move: the range's
work is in its commits, the tree is clean, and a step the review finds wrong
is `/plumbbob:revert`'s own call at the boundary the record returns to.

`/plumbbob:run` typed at the card locks in every lean and runs the next
range, which is why the row names the range it will run. The record lands
first, and the hook minted the run's grant from the plan before it did, so
the run reads `status --run` again once the record is in and compares the
grant to the run it now resolves. When they agree, the run walks. When the
record left the grant unlike the run, because a confirmed blocker added or
moved a step in the range the run would walk, the run ends at the boundary
instead ([D102 (settle-in-one-reply)](decisions.md#d102)): the record's
ending already names the re-cut run beneath Next Up, and the human types it,
rather than the run walking a grant that no longer covers the range and
halting before a step its own harvest added. Nothing unapproved lands either
way.

The second row is the next range's, so it changes with it. On the plan's
last range it names the finish, since finish is the move after the last
stop ([D102 (settle-in-one-reply)](decisions.md#d102)):

```text
- `/plumbbob:finish` → I record them the same way, then write the report and close the build
```

The finish skill records a waiting stop card the way `looks good` would,
through `plumbbob harvest`, before it writes the report, so the last range's
review and its parks reach the Log and the report, where a finish that
skipped them would leave the parks open on the one stop every ranged build
has. When the next range is flagged, or no range names the next step, the
row does not render, because the run would refuse, and the Range row
carries the drift words. A stop with no park open keeps the four moves
with the record in their clauses and no line beneath the label, since no
lean is there to lock in: `looks good` records the review, `/plumbbob:run`
records it and runs the next range, and direction is a change to the review.

A step typed while the card waits is refused before anything is written
([D103 (stop-latched)](decisions.md#d103)). `/plumbbob:build`, bare or naming
a step, would enter the step, and the step's pause would write over the
range's review in `.plumbbob/detail.md` before the reply recorded it. So
`plumbbob build` writes no marker and stamps nothing, and says which card
waits and the reply that records it:

```text
plumbbob: no step entered (range 2 of 5's stop card is waiting for its reply)
  → reply to the card; looks good records it, and /plumbbob:run records it, then runs range 3 of 5
plumbbob: no step entered (range 5 of 5's stop card is waiting for its reply)
  → reply to the card; looks good records it, and /plumbbob:finish records it, then writes the report
plumbbob: no step entered (range 2 of 5's stop card is waiting for its reply)
  → reply to the card; looks good records it
```

The three forms follow the card's second row: the next range's run, the
finish on the plan's last range, and `looks good` alone when the run would
refuse. The remedy names `looks good` where the dashboard does not, because
a build typed at the card is typed with the card in the conversation. The
refusal comes ahead of the one for no undone step, so on the plan's last
range it names the finish rather than saying nothing is left to build. The
build skill relays it whole and ends the turn.

### The stop's record

The reply records through `plumbbob harvest`
([D104 (harvest-records)](decisions.md#d104)): the verb reads the detail
file's `## Harvest` section, flips each settled park from `- [ ]` to `- [x]`,
appends the dated Harvest lines under `## Harvest`, and, when the detail is a
range's, writes the range's review beneath a dated Log line for the range, as
`checkpoint` keeps a step's pause beneath the step's. The `/plumbbob:harvest`
skill records through the same verb outside a stop, with the proposals for
every open park written into the detail file under a `# Detail · Harvest`
header and no range parts, and it proposes every class at once there too, so
one reply settles a boundary harvest the way it settles a stop. The record
commits nothing: the review and the flipped parks ride the next step's
checkpoint, or the finish, as a harvest's edits always have, because a stop
commit would need a fourth kind of ledger line that `recover`, `revert`,
`status`'s out-of-band count, and the finish report would each have to
learn, while the Log already carries the review into the PR.

The record's ending is the orientation tier's: the lead line, any advisory,
and the state table, its Range row naming the next run, re-cut or not. No
Verdict rides it, since nothing was measured, so Next Up heads the table:

```text
**Stop**: Range 3 of 5 recorded (1 blocker, 2 tangents)

| **Next Up** | Step 10 of 12 - feat(docs): name the label (model: **Fable**, details: [intent.md:34](.plumbbob/builds/x/intent.md#L34)) |
| --- | --- |
| Range | 4 of 5: /plumbbob:run (step 10 to its pause) |
| Parked | 0 of 8 open |
```

The label is `Stop` again, because the artifact that landed is the stop's
record and the fact reads on from it; the parenthetical counts the classes,
and reads `(nothing parked)` when the stop had no Harvested part. Outside a
stop the lead is `**Recorded**: 2 parked ideas (2 tangents)`
([D106 (leans-harvested)](decisions.md#d106)): the label names the act, as
`Stop` names the artifact, because `Harvested` is the card's part now, and
one label over a part that proposes and an ending that records would mean
two things.

The record is latched ([D103 (stop-latched)](decisions.md#d103)). A run's
turn is long, it ends on proposals, and that is exactly where a model would
carry straight on into recording its own; the record is where plumbbob holds
the line, as the checkpoint is for a step. So `plumbbob harvest` refuses in
the turn the stop card printed, refuses a range no stop card showed, and
refuses one whose range no longer reads as landed, each with the move that
unblocks it, while a harvest outside a stop needs no stamp:

```text
plumbbob: range 3 of 5's stop not recorded (its card printed this turn, and no human turn has read it)
  → end the turn on the card; the human's reply is what records it
plumbbob: range 3 of 5's stop not recorded (no stop card showed it)
  → plumbbob handoff --stop, then end the turn on the card
plumbbob: range 3 of 5's stop not recorded (step 9 is open again)
  → land it, then plumbbob handoff --stop --full
plumbbob: range 3 of 5's stop not recorded (step 13 joined it after it landed)
  → move step 13 to a range still to come, then plumbbob harvest
plumbbob: range 3 of 5's stop not recorded (P9 is not in the list; 8 parked)
  → fix the Harvest proposals in .plumbbob/detail.md
plumbbob: range 3 of 5's stop not recorded (P7's class "later" is not blocker, tangent, or pivot)
  → fix the Harvest proposals in .plumbbob/detail.md
plumbbob: nothing to record (the detail file is Step 9's, not a range's or a harvest's)
  → plumbbob checkpoint 9 records a step's detail
```

The first is the latch itself: the card's stamp carries the turn it printed
in, and the record waits for a human turn after it, the way a step's
checkpoint waits for one after `plumbbob build`. The stamp names the range
and nothing the card said, so a detail file a reply rewrote since, a lean the
human changed, records as it now reads
([D110 (reply-after-the-card)](decisions.md#d110)); the record used to
compare the file to a digest the stamp kept, and refused the human's own
change. The ledger tells the two open steps apart. A step with a
`step 9 <sha>` line landed and was cleared by hand since, so it lands again,
and the card prints again on `--stop --full`, since the range it reviews has
changed under it. A step with no line
never landed: a blocker was folded into the range the card reviews, and the
remedy moves it out. A rerun of `plumbbob harvest` in the same reply then
records, since the stamp still names the range and the latch needs only a
turn after the card's; `handoff --stop` would refuse there, because the last
landing no longer completes the range.
A proposal naming a handle the list lacks (`P9` with eight parked), or a class outside the three,
refuses the whole record
rather than recording the rest, because a partial record would leave the
card and the ledger disagreeing about which parks are still open. A park no
proposal names stays open, and the record says nothing about it.
`checkpoint` never records a range's detail beneath a step's Log line: a
detail whose header names a range is the stop's, and a step's checkpoint
leaves it where it is.

What holds a run to the card is the same mark that tells the checkpoint a
run is landing ([D103 (stop-latched)](decisions.md#d103)). The turn hook
writes `RUN`, naming the range, beside `GRANT` as it mints a run that lands
its steps; the next typed prompt clears it, unless a step of that range
waits at a pause, and a notice leaves it as it leaves the grant. The latch
reads grants exactly as it did, since the mark is not one. The checkpoint
that completes a marked range writes its `RELAY` record as owing the stop
card, and the relay check holds a turn whose last ending still owes it,
once ([D89 (block-once)](decisions.md#d89)), with the one-line reason the
model acts on:

```text
plumbbob: the turn ended on Step 9's boundary, and range 3 of 5's stop card is still owed. Write the range's detail file, run `plumbbob handoff --stop`, and end the turn on its output, whole, with nothing after it.
```

`plumbbob handoff --stop` records the card in `RELAY` at the decision tier
in the boundary's place, with `plumbbob handoff --stop --full` as its reprint
command, so the check then reads the card by its parts as it reads a pause:
the labeled parts in order, the Readout table and the Verdict line exact, and
nothing after the recommendation. Only the run skill's prose asked for the
card's second beat before the mark existed, a boundary relayed whole passed
the check, and a new clean-halt shape has gone wrong under the eval tier
before, in 2 of 4 runs ([D85 (range-top-lands)](decisions.md#d85)).

### Without the section

None of this renders for a plan without `## Build ranges`, or with only the
template's placeholder under it: the rows beneath Next Up are the build order
and the parks, the bracket's model is the step's, the Your Call block keeps
its four moves and the plan pause's row names the build, no boundary carries
a Stop row, no run ends on a stop card, a harvest records through
`plumbbob harvest` with no range parts, the dashboard has no ranges block, its pointer reads
`build step 6`, and `status --run` prints no header, only the pointer that
says to cut the ranges.
Each line renders only when the plan declares ranges and the line says
something the card does not already hold, because a reminder that repeats what
is on screen is noise ([D93 (range-on-the-card)](decisions.md#d93), the call
[D86 (build-order)](decisions.md#d86) made for its own line), and a plan
written before the section existed keeps rendering exactly as it did.

## The glyph vocabulary

A closed set of text-presentation codepoints; adding one is a decision, not
a habit. No emoji-presentation codepoints: they force color and render at
unpredictable width across terminals. A state-bearing glyph always rides
with its word, because renderers differ, fonts drop glyphs to tofu, and
screen readers speak Unicode names; styling and glyphs are redundancy, never
the sole channel. At line start, the glyph is followed by a space.

| glyph | rides with | where it appears |
| --- | --- | --- |
| `✓` | done | the step list |
| `▸` | next, in flight | the step-list marker |
| `←` | next, requested | the step-list tail |
| `●` `◐` `○` `✗` | the ladder words | the Verdict; `✗` alone also marks a hard failure (`harness bindings: ✗`) |
| `⚠` | a named warning | binding warnings and advisories |
| `·` | (separator) | between facts on one line |
| `→` | what happens next | `next →`, the Your Call outcomes, a proposal line in the detail file's `## Harvest`, a red row's evidence line, a notice's remedy |
| `──` | (rule) | the detail file's readout header |
| `---` | (rule) | the seam: the first line of the plan pause's block, the one tier with a model region above it |

Hierarchy comes from position, shape, and whitespace. The anatomy spends one
bold token per line and no italics: the label, which every part outside the
readout fence carries, and on the state table the header's label alone, so
the Verdict is the one bold word in the table. Next Up spends a second on the
model name, because that is the token the human acts on before the next run.
One bold token a line is the budget before bold stops meaning anything, and a
fixed allocation is the next best thing to zero for policing. A link is
budgeted the same way: one a line, the `details:` bracket's, whose text is a
file's name and line ([D107 (short-linked-paths)](decisions.md#d107)), or
the card's closing `more details` link.

## The detail plane

Detail floods the picture ([D81 (detail-file)](decisions.md#d81)), so the
default turn carries none of it. Two
levels of disclosure, never more: the turn body is level one, and level two
is one file plus git.

`.plumbbob/detail.md` is the in-flight step's full detail: control-plane
ephemera, untracked via the shared gitdir's `info/exclude`
([D33 (info-exclude)](decisions.md#d33)), one file for the whole session,
overwritten at each step boundary so no pile of stale detail accumulates.
It is also the wire: the only path by which the model's judgment reaches the
turn at all. Its shape:

```markdown
# Detail · Step 2 · feat(login): wire the limiter into POST /login

── recap · step 2 of 3 ──
done-when    met
decisions    2 of 2 honored
constraints  all honored

## Summary

<the lead: the outcome, one sentence or a short paragraph>

## 1 <the first highlight>

<the full story: what moved, why, what was tried and discarded>

## 2 ...

## Recommendation

<The move.> <The reason, one or two sentences.>
```

Its headings are title case (`Detail`, `Step`, `Summary`, `Recommendation`),
the same case the labels in the turn carry; handoff reads the Summary and
recommendation headings case-insensitively, so a file written the older
lowercase way still parses.

A range's detail, the stop card's wire, keeps the shape with the range in
the step's place and one more section:

```markdown
# Detail · Range 3 · review the card on a live boundary before the skills teach it

── recap · range 3 of 5 ──
done-when    met
decisions    3 of 3 honored
constraints  all honored

## Summary

<the lead: what the whole range built>

## 1 <the first highlight>

<the full story, drawn from the step's checkpoint body and its Log entry>

## Harvest

- P6 → tangent: <the reason>
  - title: <two to five words>
  - why: <why it matters, one clause>
- P7 → blocker: <the reason>
  - title: <two to five words>
  - why: <why it matters, one clause>

## Recommendation

<The move.> <The reason, one or two sentences.>
```

The header names the range by its item number and its stop, the way a step's
names its number and title, and the recap rule counts it over the plan's
ranges. A detail file is read by its header: a header naming a range is what
tells `checkpoint` the file is not a step's and tells `handoff --stop` which
range it reviews, so a step's checkpoint records a detail that names its step
or no step at all, and leaves one naming a range, or a harvest
(`# Detail · Harvest`, the boundary harvest's wire), where it is. The
`## Harvest` section sits after the numbered sections and before the
recommendation, one proposal per open park under the handle the card prints
(`P6`, never a bare number), with the title and the why the lean table shows
on two field lines indented beneath it
([D112 (lean-table)](decisions.md#d112)), and vanishes when no park is open.
A boundary harvest's wire, `# Detail · Harvest`, carries the same section
and no range parts, and `plumbbob handoff --harvest` renders it as the same
table.
`plumbbob harvest` records the file beneath the range's dated Log line (the
Summary and the highlights the card leaves here, the Readout, the Verdict as
a line, the Harvested part's table as the human settled it, the
recommendation, then the full story behind each highlight) and truncates it,
as `checkpoint` does for a step's.

The model writes it fresh before every pause: the three judgment rows under
the header rule first (contiguous, since the first blank line ends them; no
fence is needed, the file is a wire, not a rendering), then the Summary lead,
then the numbered sections whose titles are the highlights, then the
recommendation as the last section. The lead and the recommendation are
flowing prose and handoff unwraps both, so neither is hard-wrapped to a
column; only the judgment rows are laid out to one. The rows it does not write (`check`, `seam`, `diff`, `spent`)
handoff measures for itself, and the constraints row it renders from the
count declared in intent.md, whatever the model attested. The header rule
keeps the word `recap`: it is the wire's parse anchor rather than a
rendering, and what a reader sees is the `**Readout**:` label above the
fence. At checkpoint the CLI records the file beneath the step's dated line
in the build-log's `## Log` (the Summary and the highlights the card leaves
here, the Readout, the Verdict as a line, the recommendation, then the full
story behind each highlight) and then truncates it: the tracked ledger is the
durable archive, and it rides the branch into the PR where a commit body
would not survive the squash-merge. The commit body keeps its marker and the
`--body` prose only, the diff stays in the tree and the commit, and the lead
line's bracket links the entry (`details: [build-log.md:412](…/build-log.md#L412)`).

Expansion is a lookup, never a recall. "expand 2" binds to the latest detail
file, the move the Your Call block names, and is answered by reading its
`## 2`; an older step takes its
step number and is answered from its entry in the Log. The diff itself never
rides the detail file: at the pause it is the working tree against HEAD, new
files included, and after the checkpoint it is the commit.

## The thresholds

The numeric lines, in one place:

- **Twenty lines.** A diff of 20 changed lines or fewer (added plus removed,
  counted against HEAD with new files included) rides inline at the pause, in a
  `diff` fence below the readout, and the diff row says so:
  `+14 -2 across 1 file · inline below`. At 21 the whole diff stays in the
  working tree behind the diffstat row. The `· inline below` pointer prints only
  when the fence follows it; when no patch could be produced the row keeps its
  bare counts. Code is the single largest source of
  visual flood, and the counted row already says what moved.
- **Five highlights, in the detail file.** More means the step's story has
  not been compressed. The card prints none of them; the `more details` link
  and the `expand` move are where they are read.
- **Eight lines of files.** The changed files beneath a `diff` row name
  seven and fold the rest to a count past eight, at a pause and at a stop.
- **Two levels.** The turn body, then the detail plane. Nothing hides at a
  third level, and every elision is counted and pointed at.
- **Column 14.** Readout labels pad to 13 characters so values align inside
  the fence, which leaves a value 67 characters.
- **Eighty columns.** Every readout line stays within 80, the width a
  terminal, a split pane, and a PR diff all survive; a fence preserves line
  breaks but cannot prevent wrapping, so an overlong row scrolls sideways in
  exactly the renderers this spec exists for. The CLI's rows degrade by count
  to fit and the model's are written to fit, which the collapsed forms make
  easy: 67 columns is room for a clause where the old 58 turned evidence into
  telegraph. The two legal overflows are a human-authored step title and a
  changed file's path, neither ever truncated: a wrapped name is legible
  where a cut one is wrong.
- **No hard wrap outside the fence.** The Summary, the labeled lines, the
  table cells, and the recommendation flow at the renderer's width. Only the
  readout's columns are laid out to a number, because only they are columns.
- **Zero code blocks** in the default turn body beyond the readout fence and
  the one inline-diff exception above.
- **Two tables at most.** The state table on every card and orientation
  ending, and the lean table on a stop card or a harvest's render.

## What this spec leaves alone

- The parse-bearing sentinels: `NO ACTIVE SESSION`, the `## Steps` format,
  and checkpoint subjects
  ([D68 (conventional-subjects)](decisions.md#d68)) are unchanged.
- checkride's own output: this spec places the verdict (the check row); it
  never rewords what the gate prints.
- `docs/voice/` is hand-owned and untouched.
- No color, no ANSI, no TUI, no cursor control: the anatomy is plain text
  and markdown, and has to survive a PR diff unchanged.
