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
the model composes only judgment, under an exact template.** The hand-off
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
| the Summary lead, the numbered highlights, the `done-when`, `decisions`, and `constraints` rows, the recommendation | the model | written into `.plumbbob/detail.md`, read back and rendered by handoff |
| the Readout's other rows, the inline diff when the change is small, the Verdict, Next Up, Your Call | the CLI | measured from the session, the gate, and git |

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
a line is before the eye reads it.

The whole turn, rendered (the running example is
[`happy-path.md`](happy-path.md)'s rate limiter, at step 2's pause):

````markdown
**Summary**: The 6th login attempt inside a minute now gets 429. (details: `.plumbbob/detail.md`)

1. `POST /login` runs the limiter before credentials are checked; over-limit
   requests return 429.
2. Misses count against the bucket and successes do not reset it, as planned.
3. `test/login.rate.test.ts` covers the 6th-request case red-to-green.

**Readout**: Step 2 - Wire the limiter into POST /login

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

**Next Up**: Step 3 of 3 - Make the limit configurable via env (model: **Sonnet**, details: `.plumbbob/builds/rate-limit/intent.md:41`)

**Your Call**:

- `looks good` → I checkpoint step 2; back to the boundary
- `expand`, or any question → I show more of what is there; nothing changes
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

## The Summary and the highlights

The turn opens on `**Summary**:`. Its lead states the outcome, not the
activity: "The 6th login attempt inside a minute now gets 429", never "I have
implemented the rate limiting functionality". One sentence when one will do,
a short paragraph when the step needs explaining. That is an aim rather than a
limit, and it is still a summary. The lead closes on a bracket naming where
the rest of the story is:

```text
**Summary**: <the lead>. (details: `.plumbbob/detail.md`)
```

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

The readout is the step's instrument: labeled rows inside one fence, assembled
and emitted by `plumbbob handoff` under the label `**Readout**: Step <N> -
<title>`. Rows, not a retelling. The label carries the step's identity so the
fence does not have to, which is what lets the identity render once in a turn.

Ownership splits by nature. If the CLI can measure a row, the CLI does, because
every row the model attests is one it can pad or get wrong, and determinism is
what earns the readout its trust. The `check` row comes from the last run's
`.check/summary.json`, the `seam` row from the SEAM marker against `git diff
--numstat`, the `diff` row from the same numstat, and the `spent` row from
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
  <N> files`, counted as `git diff --numstat` sums them. It never folds into
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

The card is the ending's three closing parts, CLI-rendered by `plumbbob
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
**Verdict**: ◐ A hair off (2 red runs before green)
**Verdict**: ○ Out of plumb (seam strayed)
**Verdict**: ✗ Not standing (done-when drifted)
```

No step segment rides here. The identity renders once per turn: the Readout
label names the step, Next Up carries the progress count, and the Verdict is
left saying the one thing only it says. The card used to render "Step 10 of
14" twice.

The Verdict is computed, never composed: handoff folds the same assembled
rows the fence shows (its measured check and seam, the model's three judgment
rows) worst-of with the step's accrued stats, so the readout and the verdict
can never disagree. The fold, from worst down:

1. Any row saying `drift` → `✗ Not standing`, named `<row> drifted`.
2. Any row failing (`red`, `not met`, `bent`, `strayed`) →
   `○ Out of plumb`, named `<row> <verdict>`, first failing row in row order.
3. All rows true but advisories accrued → `◐ A hair off`, naming the first
   advisory in a fixed order: red check runs before green (`2 red runs before
   green`), reverts on this step (`1 revert on this step`), commits outside
   the ledger (`3 commits outside the ledger`).
4. Otherwise → `● Plumb`.

That third rung counts only commits that are not plumbbob's own. A
`chore(plan)` harvest lands between nearly every step, and an advisory that
trips on routine housekeeping stops meaning anything within three steps, so
handoff excludes commits carrying the `plumbbob plan` body marker from the
count.

The Verdict names one component, the hunt-saver; the readout above it holds
the rest. A fresh session with nothing measured renders no Verdict at all.

### The Next Up line

The forward pointer, one line: the step and the progress count, the title
behind a plain hyphen, and a closing bracket carrying the plan's model
recommendation when the step has one (advisory metadata,
[D62 (model-recommendation)](decisions.md#d62)) and where to read the step in
full:

```text
**Next Up**: Step 3 of 3 - Make the limit configurable via env (model: **Sonnet**, details: `.plumbbob/builds/rate-limit/intent.md:41`)

**Next Up**: Step 3 of 3 - Make the limit configurable via env (details: `.plumbbob/builds/rate-limit/intent.md:41`)

**Next Up**: Back to step 2 of 3 - Wire the limiter into POST /login

**Next Up**: Close the spike - /plumbbob:spike done, then back to step 2

**Next Up**: Nothing planned - /plumbbob:step or /plumbbob:finish

**Next Up**: Nothing planned - /plumbbob:plan
```

The progress count rides Next Up in every tier, because Next Up is the one
line present at the pause, at the boundary, and on a driver turn. It is
dropped only where it would lie: a driver pointer back at a step the plan no
longer holds says `Back to step 9` and no count, and an open spike outranks
the step it interrupted, so the move named is closing it and the step to come
back to rides as a trailing clause. The last shape is `plumbbob finish`'s own:
finish clears the session the pointer would be read from, so it prints the
line itself, and the only move left is a fresh plan.

The model is the second bold token the line spends, because it is the one the
human acts on (a `/model` call) before the next run. The rationale behind the
recommendation lives on the dashboard, and the choice stays the human's. A
title long enough to push the line past the width budget wraps; it is never
truncated.

### The Your Call block

The card has to teach itself; a bare "looks good / needs work" assumes the
reader already knows the ceremony. So the block quotes what the human says
and states what happens next, exactly:

```text
**Your Call**:

- `looks good` → I checkpoint step 2; back to the boundary
- `expand`, or any question → I show more of what is there; nothing changes
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
is answered from the detail file, the diff, or `git show`, never from
recall. An expand turn ends on the Your Call block again, so the
pause stays legible however many questions it takes.

The `looks good` line renders only while the measured check is green: on red,
or with no run to measure, the checkpoint would refuse, and offering a move
that cannot happen teaches a false ceremony. The others always render. The
block is the face of the approval latch
([D64 (approval-latch)](decisions.md#d64)): the human's next message is the
tick, and the card is where they learn what each tick does. It teaches the
moves without saying which one to take; that is the recommendation's job, and
it follows.

At the plan pause the block keeps the shape with the moves that apply there
(nothing is recorded yet, so `revert` has nothing to wind back to):

```text
**Your Call**:

- `looks good` → I mark the plan decided; /plumbbob:build starts step 1
- `expand`, or any question → I show more of what is there; nothing changes
- anything that reads as direction → I take it as what to sharpen; the plan is cheap to change now
```

An auto halt renders the standard card; the Verdict's worst component is the
halt reason.

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
build/verify pause, the plan pause, and an auto halt. Orientation and driver
turns carry none, since nothing is pending there.

## The ladder

Four states, worst-of, the fill draining as the plumb line stops holding.
The split that earns the fourth state is "fix the work" versus "fix the
plan": each state asks a different move of the human.

| state | it means | your move |
| --- | --- | --- |
| `● Plumb` | every measure true; the diff matches the plan and the gate agrees | read the diff; approving is safe |
| `◐ A hair off` | green, with advisories accrued on the way (red runs, reverts, out-of-band commits) | read the named advisory, then judge |
| `○ Out of plumb` | a measure failing now: red check, a missed done-when, a bent decision or constraint, a strayed seam | send fixes; truing the diff fixes it |
| `✗ Not standing` | truing the diff will not fix it; a readout row says `drift` | repair the plan (`/plumbbob:refine`), or revert |

## The three tiers

The Your Call block belongs only where a decision is pending, so the anatomy
scales down with the turn:

| tier | turns | the ending renders |
| --- | --- | --- |
| decision | the build/verify pause, the plan pause, an auto halt | the whole block: the Summary and its highlights, the Readout, the inline diff when small, the Verdict, Next Up, Your Call, and the recommendation. The plan pause judges no diff, so it renders the pointer, the moves, and the recommendation alone |
| orientation | status, the checkpoint boundary, finish | the verb's own output, then the Verdict and Next Up; no Your Call block, no recommendation |
| driver | park, spike, use, recover, revert, agent runs | the CLI's line verbatim, then Next Up; nothing else |

A boundary turn, whole:

```text
**Checkpoint**: Step 2 complete (b4c5d6e7f)

**Verdict**: ● Plumb

**Next Up**: Step 3 of 3 - Make the limit configurable via env (model: **Sonnet**, details: `.plumbbob/builds/rate-limit/intent.md:41`)
```

A driver turn, whole (a mid-step park):

```text
**Parked**: should /password-reset get the same throttle? (tangent)

**Next Up**: Back to step 2 of 3 - Wire the limiter into POST /login
```

The same positional rule governs every tier: the CLI's lines are relayed
whole, and the model writes nothing around them. A boundary turn is the
checkpoint's line and the card; a driver turn is the verb's line and the
pointer.

### The one-liners

The register governs one-liners, and only those: the transitions, the
captures, the advisories, and the refusals, each a single line a skill relays
into a turn. A readout keeps its own shape, glyphs and list intact (the
dashboard, `recover`'s check lines, the worktree paths under a spike's
notice), and the sentinel headers (`NO ACTIVE SESSION`, `NO ACTIVE BUILD`)
stay exactly as they are. So does `plumbbob check`'s console trailer, which is
never relayed: the gate verdict this register cites is checkride's Stop-hook
notice, and the check row above is where it lands. checkride's own verdict is
the reference the shape was read from:

```text
checkride green in 3.6s ✔ (10 checks, without test, slowest: spell in 1.8s)
```

A line states its fact and never the move, and the stream it is written to
picks its head. An ending's own lead line goes to stdout, where it wears a
bold label like every other part of the ending:

```text
**Checkpoint**: Step 15 complete (2d917cde7)
**Parked**: should /password-reset get the same throttle? (tangent)
```

The label names the transition: the artifact that landed (`Checkpoint`,
`Plan`, `Spike report`) or the subject that moved (`Parked`, `Reverted`,
`Session`, `Active build`). The fact reads on from the label instead of
repeating it, which is why `checkpointed` is no longer a word the CLI says;
the noun is the artifact. A capture's tag rides the tail, so the line printed
and the line written to the ledger read the same.

An advisory or a refusal goes to stderr, and there the head is the prefix:

```text
plumbbob: <subject> <state> (<detail>)
```

The one colon is spent on that prefix, which earns it by naming the speaker:
those are the lines that land beside checkride's output and git's in one
terminal result, and scrollback is grepped for that word. The split falls
exactly on the stream, so nothing has to judge which head a line wants.

The detail is one trailing parenthetical, comma-separated, and it degrades by
count the way a readout row does: a list that overruns 80 columns drops from
the tail and says how many it left (`and 2 others`), keeping two named so the
count sizes something the reader can see. One or two items never degrade,
because a notice wraps where a fence row cannot.

No pointer rides a notice. Every ending closes on the card's Next Up line, so
a verb that carried its own tail (`Back at the boundary.`, `` `status` to
orient. ``) was a second seam in a turn that has one.

An advisory is one line, printed after the primary line it qualifies, one per
line, the warning glyph trailing the fact:

```text
plumbbob: this repo gitignores .plumbbob/ ⚠ (the build folder cannot ride the branch)
  → unignore .plumbbob/builds/ before the first checkpoint
```

That `→` line is the remedy, indented and singular, and a refusal spends the
same line on what unblocks it. The `heads-up` and `note` labels are retired: a
chained label is the machine noise this register exists to kill, and the glyph
table already gives `⚠` to a warning and `→` to what happens next. The order
of an ending is fixed, labeled line, then advisories, then a blank line, then
the card, so a relay never has to work out which line leads.

Every one of these lines is rendered by one formatter in `src/lib/notice.ts`:
`transition()` for the labeled head, `notice()` for the prefixed one, and a
single assembly under both for the fact, the detail list, and the remedy. A
verb composes those parts and never a string, so moving the shape is one edit
here and one there rather than a sweep across the verbs, and the tests assert
through the same renderer.

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
| `→` | what happens next | `next →`, the Your Call outcomes, a red row's evidence line, a notice's remedy |
| `──` | (rule) | the detail file's readout header |
| `---` | (rule) | the seam: the first line of the plan pause's block, the one tier with a model region above it |

Hierarchy comes from position, shape, and whitespace. The anatomy spends one
bold token per line and no italics: the label, which every part outside the
readout fence carries. Next Up spends a second on the model name, because
that is the token the human acts on before the next run. One bold token a
line is the budget before bold stops meaning anything, and a fixed allocation
is the next best thing to zero for policing.

## The detail plane

Detail floods the picture, so the default turn carries none of it. Two
levels of disclosure, never more: the turn body is level one, and level two
is one file plus git.

`.plumbbob/detail.md` is the in-flight step's full detail: control-plane
ephemera, untracked via the shared gitdir's `info/exclude`
([D33 (info-exclude)](decisions.md#d33)), one file for the whole session,
overwritten at each step boundary so no pile of stale detail accumulates.
It is also the wire: the only path by which the model's judgment reaches the
turn at all. Its shape:

```markdown
# Detail · Step 2 · Wire the limiter into POST /login

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
fence. At checkpoint the CLI folds the file into the commit
body (the explicit `--body` text leads, the detail follows) and then
truncates it: the checkpoint commit is the durable archive, commentary in the
body, the diff in the tree.

Expansion is a lookup, never a recall. "expand 2" binds to the latest card,
the move the Your Call block names, and is answered by reading the detail
file's `## 2`; an older step takes its
step number or sha and is answered from `git show`. The diff itself never
rides the detail file: at the pause it is the working tree (`git diff`), and
after the checkpoint it is the commit.

## The thresholds

The numeric lines, in one place:

- **Twenty lines.** A diff of 20 changed lines or fewer (added plus removed,
  as `git diff --numstat` sums them) rides inline at the pause, in a `diff`
  fence below the readout, and the diff row says so:
  `+14 -2 across 1 file · inline below`. At 21 the whole diff stays in the
  working tree behind the diffstat row. Code is the single largest source of
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
