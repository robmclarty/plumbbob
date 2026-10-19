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
| the Summary lead, the numbered highlights, the `done-when`, `decisions`, and `constraints` rows, the lean proposed for each park at a stop, the recommendation | the model | written into `.plumbbob/detail.md`, read back and rendered by handoff |
| the Now line, the Readout's other rows, the inline diff when the change is small, the Verdict, the Stop part on the boundary that earns one, the Stop lead and each park's handle and text on a stop card, every `details:` link, Next Up, Your Call | the CLI | measured from the session, the gate, the plan, the build log, and git |

The model authors nothing in the turn but the relay. Every defect the build
that wrote this spec found in a live turn sat in the region the model was
still writing (a bold token loose mid-sentence, an operational paragraph above
the anatomy), and a region the model does not own is a region it cannot
narrate into. The turn is the anatomy and nothing else.

**Every part outside the readout fence is a bold label, a colon, and text
that wraps.** A block sits beneath a label only where the block is the
content: the highlights under the Summary, the rows under the Readout, the
moves under Your Call. One blank line separates every block. The pause used
to run five visual grammars at once (a bare headline, a list, a label, two
fences) when only the columnar rows need a fence, and a label announces what
a line is before the eye reads it. The one line that wears no label of its
own is the note beneath Next Up: indented two spaces, it continues the part
above it, the way an advisory's remedy line does, and it renders only when
there is something to remind of.

The whole turn, rendered (the running example is
[`happy-path.md`](happy-path.md)'s rate limiter, at step 2's pause):

````markdown
**Now**: Step 2 of 3 - feat(login): wire the limiter into POST /login

**Summary**: The 6th login attempt inside a minute now gets 429. (details: [detail.md](.plumbbob/detail.md))

1. `POST /login` runs the limiter before credentials are checked; over-limit
   requests return 429.
2. Misses count against the bucket and successes do not reset it, as planned.
3. `test/login.rate.test.ts` covers the 6th-request case red-to-green.

**Readout**:

```text
check        green: 3 of 3 checks
done-when    met
decisions    2 of 2 honored
constraints  4 of 4 honored
seam         held: 2 of 2 declared, no strays
diff         +61 -3 across 2 files
spent        88 min · 3 turns · 63s gate · green first run
```

**Verdict**: ● Plumb

**Next Up**: Step 3 of 3 - feat(config): make the limit configurable via env (model: **Sonnet**, details: [intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41))

**Your Call**:

- `looks good` → I checkpoint Step 2; back to the boundary
- `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back
- anything that reads as direction → I take it as what to change; nothing lands until you approve
- `revert` → I wind the work back to the last checkpoint

**Recommendation**: Approve it. The gate is green, the seam held, and the one call the step made (misses count, successes do not reset) is what the plan already decided.
````

Alignment survives only inside a fence in the renderers this has to read well
in (Claude Code, Cursor, a PR diff), so the readout's columnar rows ride in a
`text` fence and nothing else does. Everything else is a labeled line that
wraps at the renderer's width, which is what the label buys back: the parts
that are prose behave like prose. Fences never nest. handoff's output is
pasted at top level, never inside a fence of the model's own, because a
butted or nested fence breaks in exactly the renderers this document exists
to survive.

### One block, relayed whole

The rule is positional, not prohibitive. The model writes the detail file,
runs `plumbbob handoff`, and pastes its output at top level; the turn begins
where that output begins and ends where it ends. A positional rule holds
where a list of forbidden phrases does not, because it leaves the
meta-narration nowhere to live: there is no line above the Summary for "here
is the pause", none between the highlights and the Readout for "the check
came back green", and none after the recommendation for a closing courtesy.
Three consequences, spelled out because each was a real defect:

- The model never frames or narrates the block. It does not introduce the
  readout, read the Verdict back, or explain the Your Call block.
- Each fact appears once, in its designated part. The gate verdict lives in
  the check row; it does not also open the Summary or close the turn. (Step
  5 of the build that wrote this spec stated it three times in one pause.)
- A judgment or a flag (a stray the seam row will name, a decision the step
  had to bend, a doubt about the done-when) is a highlight: one sentence,
  with its full story in the numbered detail section behind it. It is never a
  freeform paragraph above or below the block.

One tier still has a seam to mark. At the plan pause the model presents the
framed plan itself and then relays `plumbbob handoff --plan`, so that block
opens on a horizontal rule: a label alone under the plan read as its tail,
and a run of blank lines collapses to one in every markdown renderer, so the
rule is the one separator that renders as space in all of them. That is the
only rule in the anatomy and the only seam left in it. The step pause, the
boundary, and a driver turn carry none, because nothing of the model's
precedes their lines.

### One pause, rendered once

The block renders once per pause ([D87 (pause-once)](decisions.md#d87)). The
turn that reaches a pause is the block and nothing else; a later turn at the
same pause, with nothing about it changed, is the model's answer and then one
line:

```text
**Next Up**: Back to Step 2 of 3 - feat(login): wire the limiter into POST /login
```

That is the driver pointer, the line a park already closes on, so a question
and a tangent at the same pause end on the same line. It names the step still
waiting, with its count, and no move: the moves are on the block, one screen
up, and a lead line states its fact and leaves the move to the human
([D84 (one-liner-register)](decisions.md#d84)). The answer is what the rule
protects. A reply during a pause used to carry the whole block, about 40
lines, beneath an answer of a sentence or two, and the answer the human asked
for was pushed off the screen by a block they had already read. So the expand
turn is the one turn where the model's prose stands above the CLI's line, and
the line still closes it: the positional rule holds, because the CLI's line is
still the last text.

The CLI chooses the form, never the model. `plumbbob handoff` keeps a stamp of
what it last rendered for the step (the step number, the detail file, and its
measured `check`, `seam`, and `diff` rows; never `spent`, which counts turns
and would make every render look new) and prints the reminder while the stamp
still matches. The block comes back two ways. It comes back on its own the
moment the pause changes: a rewritten detail file, a touched file in the
seam, a check that went red or came back green. And it comes back on request:
`plumbbob handoff --full` prints the block whatever the stamp says, the
`expand` move on the Your Call block names the phrase that asks for it
(`show the pause`), and a session that no longer has the block in front of it
(a fresh window, or one after `/clear`) asks the same way. A checkpoint, a
revert, or an abandon clears the stamp, so the next pause renders whole.
The stop card that closes a run's range keeps the rule under a stamp of its
own, with a reminder naming the stop still waiting and
`plumbbob handoff --stop --full` to bring it back
([the stop card](#the-stop-card)).

## The Now line

The block opens on the step in flight: its count, then its title behind a
plain hyphen, written the way Next Up writes the step to come:

```text
**Now**: Step 2 of 3 - feat(login): wire the limiter into POST /login
```

The step used to be named once on the block, in the Readout label, mid-block
and without its count, while the one `Step N of M` the eye found was Next
Up's, a step ahead; a human who asked "which step am I on?" was answering it
by subtraction. So the identity moves to the top of the block with its count,
and the Readout label stops repeating it
([D88 (current-step-shown)](decisions.md#d88)). The label is `Now` because it
pairs with `Next Up`: the two lines bracket the block, what is on the bench
and what comes after it, and a reader who has learned one reads the other.
It states the fact and no move, the register every lead line keeps
([D84 (one-liner-register)](decisions.md#d84)). The count is the plan's own,
the step number over the total, the way Next Up counts, so the two lines
agree under a re-sequenced build order too: a step keeps its number for life
([D86 (build-order)](decisions.md#d86)).

The line renders on every step pause at the decision tier (the build and
verify pauses, and an auto halt on trouble), and the reminder a pause already
shown ends on names the same step, `Back to Step 2 of 3`. The plan pause has
no step in flight and renders none; the boundary's lead line already names
the step that landed.

## The Summary and the highlights

The turn opens on `**Summary**:`. Its lead states the outcome, not the
activity: "The 6th login attempt inside a minute now gets 429", never "I have
implemented the rate limiting functionality". One sentence when one will do,
a short paragraph when the step needs explaining. That is an aim rather than a
limit, and it is still a summary. The lead closes on a bracket naming where
the rest of the story is:

```text
**Summary**: <the lead>. (details: [detail.md](.plumbbob/detail.md))
```

The bracket takes the short linked form every `details:` bracket takes
([the Next Up line](#the-next-up-line)): the file's name as a link to the
file, with no line behind it, because the whole file is the detail.

The highlights are a numbered list beneath it, five entries at most, each one
sentence and one move. Plain English first: a path or identifier appears in
backticks only when the name itself is the news. The numbers are handles, not
decoration: "expand 2" opens the matching section of the detail file, so
every highlight has a section behind it with the full story. A step so small
that one sentence covers it has one highlight and one section; the handle
still holds.

Both come out of the detail file. The model writes the lead as that file's
`## Summary` section and each highlight as the title of the `## <n>` section
behind it; handoff prints the label, appends the bracket, and numbers the
list from the handles the model wrote. So the model never types a path, and
the handle on the card is the heading the `expand` move will open, not a
number composed a second time.

The Detail line retires with the rest of the model's typing. "5 sections in
.plumbbob/detail.md; expand 2 opens one" was plumbbob talking to itself: the
visible highlights already carry the count, and the `expand` move on the Your
Call block already carries the affordance. Hidden detail is still counted and
pointed at, because a silent cut reads as coverage; the counting is now done
by two things the reader was going to look at anyway.

## The readout

The readout is the step's instrument ([D82 (readout-ladder)](decisions.md#d82)):
labeled rows inside one fence, assembled
and emitted by `plumbbob handoff` under the bare label `**Readout**:`. Rows,
not a retelling. The label used to carry the step's identity; the Now line
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
| `seam` | CLI | `held: <N> of <M> declared, no strays` | `strayed: <N> paths outside the seam` | never; a seam the plan got wrong shows as a stray, and a highlight says so |

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
  <N> files`, counted against HEAD with new files included. It never folds into
  the Verdict, and it vanishes when nothing changed.
- Every fence line fits 80 columns: the 13-character label pad leaves 67 for
  the value. The CLI's rows conform by counted degradation, never a silent
  cut: a long list of deselected slots collapses to `· without 9 others`.
  The model's three rows are written to fit, which the collapsed forms make
  easy: one short clause after the verdict word, with the full story in the
  detail section behind the matching highlight.
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

The card is the ending's three closing parts
([D83 (card-teaches-itself)](decisions.md#d83)), CLI-rendered by `plumbbob
handoff` and relayed verbatim: the Verdict, the Next Up line, and the Your
Call block, one blank line between each so the eye gets rungs to land on.
Its fence is gone. Each part is a labeled line now, and a fence around three
labeled lines was furniture holding up furniture; only the readout's columns
need one. The card is human-facing, so its labels are title case and take a
colon and every clause opens with a capital letter; the readout above it is
an instrument, and its lowercase machine labels stay as they are.

### The Verdict

One line: the state word behind its glyph, then the worst component in a
trailing parenthetical when one exists. The parenthetical vanishes when
nothing is off:

```text
**Verdict**: ● Plumb
**Verdict**: ◐ A hair off (seam strayed)
**Verdict**: ○ Out of plumb (check red)
**Verdict**: ✗ Not standing (done-when drifted)
```

No step segment rides here. The identity renders once per turn: the Now line
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
advisory printed beside the Verdict. Both wear the same words, `seam
strayed`, so a stray earns the same rung whichever command rendered it.

That last rung counts only commits that are not plumbbob's own. A
`chore(plan)` harvest lands between nearly every step, and an advisory that
trips on routine housekeeping stops meaning anything within three steps, so
both surfaces, handoff's Verdict and the receipts line on `status`, drop the
commits carrying the `plumbbob plan` body marker from the count. They share the
marker, so the same history gives the same number on either.

The Verdict names one component, the hunt-saver; the readout above it holds
the rest. A fresh session with nothing measured renders no Verdict at all.

### The Next Up line

The forward pointer, one line: the step and the progress count, the title
behind a plain hyphen, and a closing bracket carrying the plan's model
recommendation when the step has one (advisory metadata,
[D62 (model-recommendation)](decisions.md#d62)) and where to read the step in
full:

```text
**Next Up**: Step 3 of 3 - feat(config): make the limit configurable via env (model: **Sonnet**, details: [intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41))

**Next Up**: Step 3 of 3 - feat(config): make the limit configurable via env (details: [intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41))

**Next Up**: Back to Step 2 of 3 - feat(login): wire the limiter into POST /login

**Next Up**: Back to Range 3 of 5's stop - review the card on a live boundary before the skills teach it

**Next Up**: Close the spike - /plumbbob:spike done, then back to Step 2

**Next Up**: Nothing planned - /plumbbob:step or /plumbbob:finish

**Next Up**: Nothing planned - /plumbbob:plan
```

The `Back to` form is the pointer a park closes on, and the reminder a pause
already shown ends on; a stop card already shown ends on the same form,
naming the range and its stop where a step's names its title
([the stop card](#the-stop-card)). The progress count rides Next Up in every tier,
because Next Up is the one line present at the pause, at the boundary, and on
a driver turn. It is dropped only where it would lie: a driver pointer back at
a step the plan no longer holds says `Back to Step 9` and no count, and an
open spike outranks the step it interrupted, so the move named is closing it
and the step to come back to rides as a trailing clause. The last shape is
`plumbbob finish`'s own: finish clears the session the pointer would be read
from, so it prints the line itself, and the only move left is a fresh plan.

The model is the second bold token the line spends, because it is the one the
human acts on (a `/model` call) before the next run. The rationale behind the
recommendation lives on the dashboard, and the choice stays the human's. A
title long enough to push the line past the width budget wraps; it is never
truncated.

The `details:` clause is a link, and its text is the file's name and line,
`intent.md:41`, where it used to be the full sidecar path in a code span
(`.plumbbob/builds/rate-limit/intent.md:41`)
([D107 (short-linked-paths)](decisions.md#d107)). The target is the path from
the repo root with the line as a `#L41` fragment,
`[intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41)`, and the same
form rides every `details:` bracket the anatomy prints: the Summary lead's,
which names the detail file with no line (`[detail.md](.plumbbob/detail.md)`),
the Stop part's and the stop card's lead, and a transition's lead, where the
sha comes first (`b4c5d6e7f, details: [build-log.md:52](.plumbbob/builds/rate-limit/build-log.md#L52)`).
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

Beneath the pointer, one indented line carries what the human would otherwise
hold in their head, and only when there is something to hold:

```text
**Next Up**: Step 7 of 10 - feat(x): title (model: **Sonnet**, details: [intent.md:22](.plumbbob/builds/x/intent.md#L22))
  · order: 7, 8, 5, 10, 6 (and 2 more) · parked 2 of 7 open
```

The build-order segment is the remaining sequence from the step the pointer
names, five steps and then a count, and it renders only when `## Build order`
re-sequences the plan away from its numbering
([D86 (build-order)](decisions.md#d86)): a plan nobody re-sequenced already
carries its sequence in the numbers. It is written as a labeled field,
`order:`, where it read `build order 7, 8, 5`
([D108 (order-label)](decisions.md#d108)), because the note's other segments
read as labeled fields (`range 3 of 5:` names its range, `parked 2 of 7 open`
its count) and a label is how the eye finds one in a line of three. The parks
segment is the open count
against everything ever parked, whenever anything has been parked; it rides
even under `Nothing planned`, where an unharvested list is the one reminder
that matters. When the plan declares build ranges, a third segment leads the
line and names the range holding the step and the run that lands what is
left of it, `· range 3 of 5: /plumbbob:run (steps 6-9)`; its forms are under
[the build ranges](#the-build-ranges). With none of the three, the line
vanishes. The indent is what keeps it inside the part: a reader of the anatomy
files an indented line under the label above it and a flush one as a stray.
The driver pointer carries no note; a one-line register stays one line.

### The Your Call block

The card has to teach itself; a bare "looks good / needs work" assumes the
reader already knows the ceremony. So the block quotes what the human says
and states what happens next, exactly:

```text
**Your Call**:

- `looks good` → I checkpoint Step 2; back to the boundary
- `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back
- anything that reads as direction → I take it as what to change; nothing lands until you approve
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
choice, a number (`expand 2` opens that highlight's section) or a phrase
("explain that thing about the seam", "what does 'xyz' even mean?"), and it
is answered from the detail file, the diff, or the build-log's Log for an
older step, never from recall. An expand turn ends on the one-line reminder,
not on the Your Call block again ([D87 (pause-once)](decisions.md#d87)): the
answer is what the human asked for, and about 40 lines beneath it push it off
the screen. The `expand` move is where the block says how it comes back, so
the reminder never has to.

The `looks good` line renders only while the measured check is green: on red,
or with no run to measure, the checkpoint would refuse, and offering a move
that cannot happen teaches a false ceremony. The others always render. The
block is the face of the approval latch
([D64 (approval-latch)](decisions.md#d64)): the human's next message is the
tick, and the card is where they learn what each tick does. It teaches the
moves without saying which one to take; that is the recommendation's job, and
it follows.

When the plan declares build ranges and the step in flight sits in a range
that lands its steps, with steps still ahead of it, a fifth move rides
second, beneath `looks good`:

```text
**Your Call**:

- `looks good` → I checkpoint Step 6; back to the boundary
- `/plumbbob:run` → I checkpoint Step 6, then run the rest of range 3 to its stop
- `expand`, or any question → I show more of what is there; nothing changes, and `show the pause` brings all of this back
- anything that reads as direction → I take it as what to change; nothing lands until you approve
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
the segment beneath Next Up says the range lands with the step
([the range segment](#the-range-segment-beneath-next-up)). The stop card
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

A decision turn's last words are the model's recommendation: the move it
would take, then why. The Your Call block teaches the moves; a pause that
leaves the human deciding unassisted is a defect, not a missing nicety. The
model writes it into the detail file as a `## Recommendation` section,
handoff emits it after the card behind a bold label, and it is relayed as
plain prose, never fenced, so the card stays the last rendered block and the
recommendation is the last text. It is the last of the labeled lines, and its
label is the one they all copied. The shape is exact:

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
| decision | the build/verify pause, the plan pause, an auto halt on trouble | the whole block: the Now line, the Summary and its highlights, the Readout, the inline diff when small, the Verdict, Next Up, Your Call, and the recommendation, rendered once per pause; a later turn at the same pause ends on the one-line reminder. The plan pause judges no diff and has no step in flight, so it renders the pointer, the moves, and the recommendation alone |
| decision, at a stop | the stop card that closes a run's range | the whole block in the range's shape: the Stop lead, the Summary and its highlights, the Readout measured across the range, the Verdict, the Harvested part while a park is open, Next Up, Your Call, and the recommendation, rendered once per stop; a later turn at the same stop ends on the one-line reminder ([the stop card](#the-stop-card)) |
| orientation | the checkpoint boundary (a clean halt's included), a stop's record, finish, status | the transition's lead line, the Verdict where one was measured (a stop's record measures nothing and renders none), any advisories, the Stop part on the boundary where a range's last step landed, and Next Up with its note; no Your Call block, no recommendation. `status` is the exception: it renders the dashboard and nothing else, and the dashboard's last line is its own pointer |
| driver | park, order, spike, use, recover, revert, agent runs | the transition's lead line, any advisories, and Next Up alone, no note beneath it; no Verdict, since nothing landed |

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

**Verdict**: ● Plumb

**Next Up**: Step 3 of 3 - feat(config): make the limit configurable via env (model: **Sonnet**, details: [intent.md:41](.plumbbob/builds/rate-limit/intent.md#L41))
```

A driver turn, whole (a mid-step park):

```text
**Parked**: should /password-reset get the same throttle? (tangent)

**Next Up**: Back to Step 2 of 3 - feat(login): wire the limiter into POST /login
```

**One command emits each of those, and the verb that made the transition is
that command.** `checkpoint` prints its own Verdict and its own pointer,
`park` prints the pointer back at the step it interrupted, and a skill relays
the block whole. handoff still renders both parts and still stands alone for
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

No pointer rides a single line. Every ending closes on its Next Up line
instead, so a verb that carried its own tail (`Back at the boundary.`,
`` `status` to orient. ``) was a second seam in a turn that has one. The one
exception is `start`, which ends on its remedy line: the plan skill owns the
turn that follows, and there is no step yet to aim at.

An advisory is one line, one per line, the warning glyph trailing the fact,
and beneath it a single indented `→` line carrying the remedy. A refusal
spends that same line on what unblocks it. The `heads-up` and `note` labels
are retired, because the glyph table already gives `⚠` to a warning and `→`
to what happens next.

The order of an ending is fixed: the lead line, the Verdict where one was
measured, the advisories, the Stop part on the one boundary that earns it, and
the pointer, one blank line between each. So a relay never has to work out
which line leads, and a stray a checkpoint alone can see lands under the
Verdict it just earned a rung on:

```text
**Checkpoint**: Step 16 complete (f2b83e17c, details: [build-log.md:97](.plumbbob/builds/presentation/build-log.md#L97))

**Verdict**: ◐ A hair off (seam strayed)

Staged paths reach outside Step 16's seam ⚠ (test/integration/spike.test.ts, test/integration/use.test.ts)
  → the checkpoint captures them, so revise the plan with /plumbbob:step if that is real scope drift

**Next Up**: Step 17 of 18 - feat(ending): every transition prints its whole ending (model: **Opus**, details: [intent.md:512](.plumbbob/builds/presentation/intent.md#L512))
```

Every one of these lines is rendered by one formatter in `src/lib/notice.ts`:
`transition()` for the labeled head, `advisory()` for the bare one,
`notice()` for the prefixed one, a single assembly under all three for the
fact, the detail list, and the remedy, and `ending()` for the order they
stack in. A verb composes those parts and never a string, so moving the shape
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
falls is judgment.

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

A range the plan has outgrown is reported and never rewritten by the CLI,
because only the human knows where the stop belongs now, and a suggested
command that halts early is the failure ranges exist to remove. Four things
flag one, and each has its words, the same on the card and the dashboard:

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

### The range segment beneath Next Up

The note beneath the pointer opens on the range holding the step Next Up
names, numbered as the plan's item over the count of ranges, and the run
that lands what is left of it from that step, the steps in a bracket:

```text
**Next Up**: Step 6 of 12 - feat(orient): read the ranges (model: **Opus**, details: [intent.md:30](.plumbbob/builds/x/intent.md#L30))
  · range 3 of 5: /plumbbob:run (steps 6-9) · parked 2 of 7 open
```

The segment leads the note, ahead of the build order and the parks, because
it is the one segment that names what to type. Its forms:

```text
  · range 3 of 5: /plumbbob:run (steps 6-9)
  · range 3 of 5: /plumbbob:run (steps 8-9)
  · range 3 of 5: /plumbbob:run (step 9)
  · range 4 of 5: /plumbbob:run (step 10 to its pause)
  · range 3 of 5 lands with step 9
  · range 3 of 5 needs a re-cut (the build order puts step 11 inside it)
  · no range names step 12
```

The first is a range not yet started. The second and third are what is left
after steps 6 and 7 landed, and then 8: a range that stopped early (a red
check, a halt on trouble) resumes from the card, and the run lands its last
step rather than pausing on it, so one step is bracketed the way four are.
The fourth is a bare range, whose run builds its step to the pause, and the
bracket says so. The fifth is the pause on a range's last step, below. The
last two are the drift words above, in place of a run. A list range writes
what is left in build order (`20,5-9`), so the first number in the bracket
is where the run starts.

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

The segment renders at every site the note does: the plan pause and the
plan commit, where Next Up names step 1 and the segment names range 1
whole; a step pause; and a boundary. The driver pointer and the `Back to`
reminder carry no note, as before. At a step pause the segment names the
range holding the step in flight, and the bracket opens on that step,
because `/plumbbob:run` typed there is that pause's `looks good`
([D95 (run-verb)](decisions.md#d95)): it lands the step on a green check
and runs on through what is left of the range, and the grant the hook mints
counts the step in flight as undone. So at step 6's pause, where Next Up
names step 7, the segment reads `range 3 of 5: /plumbbob:run (steps 6-9)`,
and the Your Call block offers the run as a move
([the Your Call block](#the-your-call-block)). At the pause on a range's
last step a run would land that step and end on the range's stop rather
than start the next range, so the segment names no run: it reads
`range 3 of 5 lands with step 9`, and Next Up's step 10 waits for the
boundary, where the Stop part and the next range's segment render. A bare
range's pause is the same case, since its run ends once its step lands.

**While the segment suggests a range, the bracket's bold model is the
range's.** Next Up's bracket reads `model: **Opus**` from the `- model:`
line of the range holding the step Next Up names, rather than the step's,
and the segment names no model of its own, because the bold token is the
one the human acts on before the next run, the run is the range, and a
range's first step is often not its hardest. At the pause on a range's last
step that is the next range, the one the human picks a model for, while
the segment names the range that is finishing. A range with no model line
leaves the step's in place, and the pointer at a step in no range, or in a
flagged range, keeps the step's, as today.

### The Stop part

The boundary where a range's last step lands says why the build stops there.
A boundary turn with it, whole:

```text
**Checkpoint**: Step 9 complete (c7d8e9f0a, details: [build-log.md:140](.plumbbob/builds/x/build-log.md#L140))

**Verdict**: ● Plumb

**Stop**: Range 3 of 5 landed - review the card on a live boundary before the skills teach it (details: [intent.md:63](.plumbbob/builds/x/intent.md#L63))

**Next Up**: Step 10 of 12 - feat(docs): name the label (model: **Fable**, details: [intent.md:34](.plumbbob/builds/x/intent.md#L34))
  · range 4 of 5: /plumbbob:run (step 10 to its pause)
```

The shape is one labeled line: `Range N of M landed`, a plain hyphen, the
stop's text as the plan wrote it, and a bracket pointing at the item, where
the `- note:` the card does not carry can be read. The label is `Stop` because
it names the thing the plan wrote (`**stop:**` is the item's own key), it
reads as a noun on the card the way `Checkpoint` does, and the question the
human brings to that boundary is why the build stopped here. It rides between
the advisories and Next Up, so the Verdict the step earned and any stray land
first and the stop reads straight into the pointer that names the next range.
The part is the CLI's, measured from the plan and the boxes;
`checkpoint` prints it and a later `handoff` at the same boundary prints it
the same way, and the relay check reads it as a part of the block.

It renders on exactly one boundary per range: the one where the range's last
undone step lands, whichever step that is and however it landed, by the range,
by `--auto`, or by hand. A bare range never earns one, because its stop is its
own pause: the step's `plumbbob status` carries the stop text, in the ranges
block and in the run header, and the model writing that pause's
recommendation reads it there. The plan commit carries
none, since nothing landed. The boundary keeps its tier: the part is
orientation, and no Your Call block follows it. A run that lands its range
ends on the stop card instead, where the part is the card's lead
([the stop card](#the-stop-card)); the boundary above is what a range landed
by `/plumbbob:build`, a typed range, `--auto`, or by hand still ends on.

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
card's segment carries: `(steps 8-9)` once two of its steps have landed,
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
Stop part and all. A run that halts on trouble mid-range ends at that step's
pause, as a typed range does; the mark outlives the pause, so a `looks good`
that lands the range's last step still owes the card, and the human who
approved the halt reads the review in the same turn. A bare range earns no
card, because its stop is its own pause and the recommendation there speaks
to it.

The card, whole, at the boundary where the running example's range 3 landed:

````markdown
**Stop**: Range 3 of 5 landed - review the card on a live boundary before the skills teach it (details: [intent.md:63](.plumbbob/builds/x/intent.md#L63))

**Summary**: The boundary where a range's last step lands now says why the build stops there, and the dashboard lists the ranges beneath the steps. (details: [detail.md](.plumbbob/detail.md))

1. Steps 6 and 7 read the section and flag its four drifts in one parser the card and the dashboard share.
2. Step 8 landed a hair off: its commit reached `src/lib/notice.ts`, outside its seam, for the Stop part's label.
3. Step 9's ranges block folds a landed range to its row, as the spec says, and the eval's anatomy reader needed no change.

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
spent        3h 12m · 1 red run
```

**Verdict**: ◐ A hair off (seam strayed)

**Harvested**: 3 of 8 parked ideas open

- P6 · the Stop part could carry the range's note too → lean: tangent, the bracket already points at the item, where the note is
- P7 · recover reports a range naming a step the plan lacks, but not two ranges naming one step → lean: blocker, step 10's done-when assumes recover flags it, so a step before 10 teaches it the second drift
- P8 · a stop's markdown link prints raw on the dashboard → lean: tangent, cosmetic, and the card renders it

**Next Up**: Step 10 of 12 - feat(docs): name the label (model: **Fable**, details: [intent.md:34](.plumbbob/builds/x/intent.md#L34))
  · range 4 of 5: /plumbbob:run (step 10 to its pause)

**Your Call**:

Approving locks in each lean above; to change one, say so first (`make P6 a blocker`).

- `looks good` → I record the review and every lean as proposed, folding a blocker into the plan; back to the boundary
- `/plumbbob:run` → I record them the same way, then run range 4 of 5 to its stop
- anything that reads as direction → I re-render the card with the lean changed; nothing is recorded until you approve
- `expand`, or any question → I show more of what is there; nothing changes, and `show the stop` brings all of this back

**Recommendation**: Approve it, with P7 as the blocker it is. Step 8's stray is the label the Stop part needed, in a file the plan should have named, and the drift recover misses is the one step 10 builds on.
````

Its parts, in order, and what each one is:

- **The Stop lead** opens the card where the Now line opens a pause: the
  Stop part of the boundary above, moved to the top of the card, with the
  range's count, the stop's text as the plan wrote it, and the bracket
  pointing at the item. The card has no Now line, since no step is in
  flight, and no `Checkpoint` lead, since the range's checkpoints are the
  readout's first row. The label is `Stop` because the question the human
  brings to a landed range is why the build stopped here, and the plan's own
  words answer it.
- **The Summary and the highlights** are the whole range's, not the last
  step's: the lead states what the range built, and the highlights are the
  five things worth a reviewer's eye across its steps, a step that landed a
  hair off first among them. The model writes them from the steps' checkpoint
  bodies and the build-log's Log, not from recall, because a long run can
  compact its context partway through and lose its early steps.
- **The Readout** is measured across the range
  ([the range readout](#the-range-readout)).
- **The Verdict** folds the readout's rows worst-of with the range's accrued
  stats, the same fold a step's Verdict runs.
- **The Harvested part** lists every open park under its handle with the
  lean the model proposes for it, a class and one clause of reason
  ([the Harvested part](#the-harvested-part)). A stop with no park open renders
  the card without it ([D100 (stop-card)](decisions.md#d100)): the review is
  the stop's point, the plain block left it nothing to read, and the one
  reply the card then costs is the run the human was going to type anyway.
- **Next Up** names the next range's first step, with the segment beneath it
  naming that range's run, as the boundary's would. The parks segment does
  not ride the note here, because the Harvested lead above carries the count.
  On the plan's last range the pointer reads `Nothing planned`, and the note
  vanishes.
- **Your Call** says that approving locks in the leans, then names the
  replies that settle the card in one message
  ([the reply at a stop](#the-reply-at-a-stop)).
- **The recommendation** is the move on the review and the proposals
  together: `Approve it`, or `Approve it, with P7 as the blocker it is`,
  then why, and a range that landed a step the human should look at before
  the next run says so here.

The card renders once per stop ([D87 (pause-once)](decisions.md#d87)), under
a stamp of its own: the range number, the detail file, and the measured rows.
A later turn at the same stop, with nothing about it changed, is the model's
answer and then the reminder, naming the stop still waiting:

```text
**Next Up**: Back to Range 3 of 5's stop - review the card on a live boundary before the skills teach it
```

The card comes back when the stop changes (a rewritten detail file, so a
proposal the human changed re-renders the whole card with the change in it)
and on request: `plumbbob handoff --stop --full` prints it whatever the stamp
says, the `expand` move names the phrase (`show the stop`), and a session
without the card in front of it asks the same way. The record clears the
stamp. The card carries no inline diff: a range's change is its commits, read by the shas on
the steps row, and the diff row sums them.

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
  touched it. It never folds, and at a stop it never vanishes.
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
([D105 (park-handles)](decisions.md#d105)). That is the count the note
already sizes (`parked 3 of 8 open` counts the same lines), a line is never
deleted from the list, only flipped, so the handle is stable for the life of
the build, and the record can match a proposal to its park by the number
alone, with no guessing against the text. The handle reads `P6` on the card,
in the detail file, and in a reply, one name at every site so nothing has to
be mapped between them, and never a bare number, because the bare numbers are
the highlights' (`expand 2` opens a section) and one reply at a stop can
carry both ([D102 (settle-in-one-reply)](decisions.md#d102)). Each park
rides a bullet line, not a numbered one, because a markdown list renumbers
its items: open parks 6 and 8 on a numbered list render as 6 and 7, and the
number the human reads would not be the one the record matches.

The part is a label, a lead that sizes the list, and one item per open park
in list order:

```text
**Harvested**: 3 of 8 parked ideas open

- P6 · the Stop part could carry the range's note too → lean: tangent, the bracket already points at the item, where the note is
- P7 · recover reports a range naming a step the plan lacks, but not two ranges naming one step → lean: blocker, step 10's done-when assumes recover flags it, so a step before 10 teaches it the second drift
- P8 · a stop's markdown link prints raw on the dashboard → lean: tangent, cosmetic, and the card renders it
```

An item is the handle, the park's text as the list holds it, and behind the
arrow the lean: the word `lean:`, the class the model proposes, a comma, and
its reason in one clause. The class is the model's suggestion and has to
read as one, and `lean` is the plan's own word for a proposed answer, the
one an open question's `*lean:*` already carries, so it names the suggestion
without a second term (`suggested:` was dropped for that reason). The part
is labeled `Harvested` because it lists what the run harvested for the human
to judge ([D106 (leans-harvested)](decisions.md#d106)). The handle and the
text are the CLI's, read from the list, so the card can never misquote a
park; the class and the reason are the model's, written into the detail
file's `## Harvest` section as `- P6 → tangent: <the reason>`, one line per
open park, and handoff joins the two and writes the lean's punctuation. The
classes are the harvest skill's three, `blocker`, `tangent`, and `pivot`,
and the default for anything uncertain is `tangent`, as the skill has always
said; a park the section leaves out renders with `→ no lean proposed` in its
place, so a silent omission reads as one on the card, and the record leaves
that park open. A tag a park's line carries (`(tangent)` from
`plumbbob park`) is the parker's own guess and stays in the text; the lean
behind the arrow is the proposal.

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
- anything that reads as direction → I re-render the card with the lean changed; nothing is recorded until you approve
- `expand`, or any question → I show more of what is there; nothing changes, and `show the stop` brings all of this back
```

`looks good` locks in every lean: the model folds a confirmed blocker into
`intent.md` by the harvest skill's rules first, then records the stop
through `plumbbob harvest`, and relays its ending. A reply that changes a
lean is direction (`make P7 a tangent`), and the handle is how it names one:
the model rewrites the detail file's line and runs `plumbbob handoff --stop`,
the stamp sees the change, and the whole card comes back with the lean as it
will be recorded. Nothing lands until `looks good`. A blocker that becomes
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
row does not render, because the run would refuse, and the note beneath Next
Up carries the drift words. A stop with no park open keeps the four moves
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
and Next Up with its note, which names the next run, re-cut or not. No
Verdict rides it, since nothing was measured:

```text
**Stop**: Range 3 of 5 recorded (1 blocker, 2 tangents)

**Next Up**: Step 10 of 12 - feat(docs): name the label (model: **Fable**, details: [intent.md:34](.plumbbob/builds/x/intent.md#L34))
  · range 4 of 5: /plumbbob:run (step 10 to its pause) · parked 0 of 8 open
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
the turn the stop card printed, refuses a range's detail that no stop card
showed, and refuses one whose range no longer reads as landed, each with the
move that unblocks it, while a harvest outside a stop needs no stamp:

```text
plumbbob: range 3 of 5's stop not recorded (its card printed this turn, and no human turn has read it)
  → end the turn on the card; the human's reply is what records it
plumbbob: range 3 of 5's stop not recorded (no stop card showed its detail)
  → plumbbob handoff --stop, then end the turn on the card
plumbbob: range 3 of 5's stop not recorded (step 9 is open again)
  → land it, then plumbbob handoff --stop
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
checkpoint waits for one after `plumbbob build`. The ledger tells the two
open steps apart. A step with a `step 9 <sha>` line landed and was cleared by
hand since, so it lands again and the card re-renders. A step with no line
never landed: a blocker was folded into the range the card reviews, and the
remedy moves it out. A rerun of `plumbbob harvest` in the same reply then
records, since the stamp's digest covers the detail file, which nothing
rewrote, and the latch needs only a turn after the card's; `handoff --stop`
would refuse there, because the last landing no longer completes the range.
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
template's placeholder under it: the note beneath Next Up is today's build
order and parks, the bracket's model is the step's, the Your Call block keeps
its four moves and the plan pause's row names the build, no boundary carries
a Stop part, no run ends on a stop card, a harvest records through
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
| `→` | what happens next | `next →`, the Your Call outcomes, a park's lean on the stop card, a red row's evidence line, a notice's remedy |
| `──` | (rule) | the detail file's readout header |
| `---` | (rule) | the seam: the first line of the plan pause's block, the one tier with a model region above it |

Hierarchy comes from position, shape, and whitespace. The anatomy spends one
bold token per line and no italics: the label, which every part outside the
readout fence carries. Next Up spends a second on the model name, because
that is the token the human acts on before the next run. One bold token a
line is the budget before bold stops meaning anything, and a fixed allocation
is the next best thing to zero for policing. A link is budgeted the same way:
one a line, the `details:` bracket's, whose text is a file's name and line
([D107 (short-linked-paths)](decisions.md#d107)).

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
- P7 → blocker: <the reason>

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
recommendation, one line per open park under the handle the card prints
(`P6`, never a bare number), and vanishes when no park is open.
`plumbbob harvest` records the file beneath the range's dated Log line (the
Summary and highlights, the Readout, the Verdict, the Harvested part as the
human settled it, the recommendation, then the full story behind each
highlight) and truncates it, as `checkpoint` does for a step's.

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
in the build-log's `## Log` (the Summary and highlights, the Readout, the
Verdict, the recommendation, then the full story behind each highlight, as
the pause showed them) and then truncates it: the tracked ledger is the
durable archive, and it rides the branch into the PR where a commit body
would not survive the squash-merge. The commit body keeps its marker and the
`--body` prose only, the diff stays in the tree and the commit, and the lead
line's bracket links the entry (`details: [build-log.md:412](…/build-log.md#L412)`).

Expansion is a lookup, never a recall. "expand 2" binds to the latest card,
the move the Your Call block names, and is answered by reading the detail
file's `## 2`; an older step takes its
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
- **Five highlights.** More means the step's story has not been compressed;
  the overflow belongs in the detail file, behind the `expand` move.
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
  telegraph. The one legal overflow is a human-authored step title, which is
  never truncated: a wrapped title is legible where a cut one is wrong.
- **No hard wrap outside the fence.** The Summary, the highlights, the
  labeled lines, and the recommendation flow at the renderer's width. Only
  the readout's columns are laid out to a number, because only they are
  columns.
- **Zero code blocks** in the default turn body beyond the readout fence and
  the one inline-diff exception above.

## What this spec leaves alone

- The parse-bearing sentinels: `NO ACTIVE SESSION`, the `## Steps` format,
  and checkpoint subjects
  ([D68 (conventional-subjects)](decisions.md#d68)) are unchanged.
- checkride's own output: this spec places the verdict (the check row); it
  never rewords what the gate prints.
- `docs/voice/` is hand-owned and untouched.
- No color, no ANSI, no TUI, no cursor control: the anatomy is plain text
  and markdown, and has to survive a PR diff unchanged.
