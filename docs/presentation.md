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

A decision turn (the build/verify pause is the canonical one) is two regions
with one seam between them. The model authors the top region; the CLI emits
the bottom one as a single block, and the model relays it once:

| region | author | what it holds | how it reaches the turn |
| --- | --- | --- | --- |
| top | model | headline, numbered highlights, the detail pointer | composed fresh, under the shape rules below |
| bottom | CLI (`plumbbob handoff`) | the recap fence, the inline diff when the change is small, the footer card, the recommendation | one command's output, relayed whole and verbatim |

The bottom region carries judgment too (three recap rows and the
recommendation), but none of it is typed into the turn: the model writes it
into `.plumbbob/detail.md` first, and handoff reads it from there. The turn
is the anatomy and nothing else.

The whole turn, rendered (the running example is
[`happy-path.md`](happy-path.md)'s rate limiter, at step 2's pause):

````markdown
Step 2 built: the 6th login attempt inside a minute now gets 429.

1. `POST /login` runs the limiter before credentials are checked; over-limit
   requests return 429.
2. Misses count against the bucket and successes do not reset it, as planned.
3. `test/login.rate.test.ts` covers the 6th-request case red-to-green.

detail: 3 sections in .plumbbob/detail.md · "expand 2" shows one

```text
── recap · step 2 of 3 ──
check        green (checkride: lint, types, test)
done-when    met: the 6th request in 60s returns 429, 3 passing
decisions    honored: D1 (in-memory-bucket), D2 (five-per-minute)
constraints  all honored
seam         held: 2 files, all inside
diff         +61 -3 across 2 files
```

```text
● Plumb: Step 2 of 3

Next Up: Step 3 - Make the limit configurable via env (model: Sonnet)

Your Call:
  looks good  → I checkpoint step 2; back to the boundary
  needs work  → Tell me what to change; nothing lands until you approve
  revert      → I wind the work back to the last checkpoint
```

**Recommendation**: Approve it. The gate is green, the seam held, and the one call the step made (misses count, successes do not reset) is what the plan already decided; step 3 is mechanical, and Sonnet is enough.
````

Alignment survives only inside a fence in the renderers this has to read well
in (Claude Code, Cursor, a PR diff), so the recap and the card always ride in
`text` fences; the headline, highlights, pointer, and recommendation are plain
markdown. The recommendation is flowing text: handoff unwraps it, and the
model writes it as sentences, never hard-wrapped to a column, so it fills the
renderer's width the way the headline does. Nothing follows the
recommendation, not even a courtesy sentence: the eye lands at the end of
terminal output, so the end is where the call belongs.

### The seam between the regions

The rule at the seam is positional, not prohibitive. The detail pointer is
the last line the model writes; `plumbbob handoff`'s output follows it, and
the turn ends where that output ends. A positional rule holds where a list of
forbidden phrases does not, because it leaves the meta-narration nowhere to
live: there is no line between the pointer and the fence for "here is the
pause" or "the check came back green", and no line after the recommendation
for a closing courtesy. Three consequences, spelled out because each was a
real defect:

- The model never frames or narrates the CLI-rendered parts. It does not
  introduce the recap, read the banner back, or explain the your-call block.
- Each fact appears once, in its designated part. The gate verdict lives in
  the check row; it does not also open the headline or close the turn. (Step
  5 of the build that wrote this spec stated it three times in one pause.)
- A judgment or a flag (a stray the seam row will name, a decision the step
  had to bend, a doubt about the done-when) is a highlight: one sentence,
  with its full story in the numbered detail section behind it. It is never a
  freeform paragraph above or below the block.

## The headline and the highlights

The headline is one plain-English sentence stating the outcome, not the
activity: "Step 2 built: the 6th login attempt inside a minute now gets 429",
never "I have implemented the rate limiting functionality". No bold, no
flourish; the sentence carries it.

The highlights are a numbered list, five entries at most, each one sentence
and one move. Plain English first: a path or identifier appears in backticks
only when the name itself is the news. The numbers are handles, not
decoration: "expand 2" opens the matching section of the detail file, so
every highlight has a section behind it with the full story. A step so small
that one sentence covers it has one highlight and one section; the handle
still holds.

After the highlights comes the detail pointer, one line, exact shape, and the
model's final authored line of the turn:

```text
detail: <N> sections in .plumbbob/detail.md · "expand <n>" shows one
```

The count is the numbered sections, one per highlight; the recommendation is
not one of them, since it rides the block. The count is the honesty
mechanism: hidden detail is always counted and pointed at, because a silent
cut reads as coverage.

## The recap

The recap is the step's readout: labeled rows inside one fence, assembled and
emitted by `plumbbob handoff`. Ownership splits by nature. If the CLI can
measure a row, the CLI does, because every row the model attests is one it
can pad or get wrong, and determinism is what earns the readout its trust.
The `check` row comes from the last run's `.check/summary.json`, the `seam`
row from the SEAM marker against `git diff --numstat`, and the `diff` row from
the same numstat. The model writes only the three rows that take judgment
(`done-when`, `decisions`, `constraints`), into the detail file, under the
same header rule the fence opens with; handoff parses them there, folds them
with its measurements, and re-emits the whole set. The model never types the
fence into the turn.

The fence opens with a header rule and holds six rows, in this order, labels
padded with spaces so every value starts at column 14:

```text
── recap · step <N> of <M> ──
check        green (checkride: lint, types, test)
done-when    met: the 6th request in 60s returns 429, 3 passing
decisions    honored: D1 (in-memory-bucket), D2 (five-per-minute)
constraints  all honored
seam         held: 2 files, all inside
diff         +61 -3 across 2 files
```

Each measuring row opens with a verdict word from a closed set. The words are
parse-bearing; the evidence after the colon is one short clause:

| row | written by | true | failing | plan-wrong |
| --- | --- | --- | --- | --- |
| `check` | CLI | `green (checkride: <slots run>)` | `red (<slot> failing)` | never; the gate measures the work |
| `done-when` | model | `met: <evidence>` | `not met: <what is missing>` | `drift: <why no diff can meet it>` |
| `decisions` | model | `honored: <tags>`, or `none exercised` | `bent: <tag>, <how>` | `drift: <which one reality broke>` |
| `constraints` | model | `all honored` | `bent: <tag>, <how>` | `drift: <which one reality broke>` |
| `seam` | CLI | `held: <N> files, all inside` | `strayed: <path> outside the seam` | never; a seam the plan got wrong shows as a stray, and a highlight says so |

The rules the rows follow:

- A cited tag always carries its slug, `D2 (five-per-minute)`, never a bare
  `D2`, the same gloss rule prose follows
  ([D74 (glossed-citations)](decisions.md#d74)).
- `drift` is the plan-wrong word, deliberately the same word the agent
  envelope uses ([D52 (blocked-vs-drift)](decisions.md#d52)): it says truing
  the diff will not fix this, the plan no longer matches reality.
- A row that cannot apply (a plan with no constraints) vanishes; a row whose
  good state is meaningful collapses to it (`constraints  all honored`).
  Silence and absence are different signals, and the recap keeps them apart.
- The `diff` row is information, not a measure: `+<added> -<removed> across
  <N> files`, counted as `git diff --numstat` sums them. It never folds into
  the banner, and it vanishes when nothing changed.
- Every row fits 72 columns: the 13-character label pad leaves 58 for the
  value. The CLI's rows conform by counted degradation, never a silent cut: a
  slot list too long for the row collapses to its count (`green (checkride:
  11 checks)`), and a list of strays degrades to the first path plus a count,
  then to the bare count. The model's three rows are written to fit: one
  short clause after the verdict word, with the full story in the detail
  section behind the matching highlight.
- Measured beats attested. The model has no check or seam row to write; the
  CLI's measurement is the only one, so a model cannot vibe the gate green or
  the seam held.

The model may only say true, failing, or drift. It has no word for "green
with an asterisk": the softer judgment belongs to the CLI, which measures
what the road to green cost (see the banner). That asymmetry is what makes
the middle of the ladder trustworthy.

## The check row

The gate verdict has one home: the recap's `check` row, measured by handoff
from the last run's summary. No standalone verdict line exists. `plumbbob
check` still prints one on the console for whoever ran it, and the model does
not carry it into the turn: one measured fact rendered twice is the
repetition this shape exists to kill. The row names the gate and its scope,
so a run's narrowing discloses itself where the verdict lives:

```text
check        green (checkride: lint, types, test)
check        green (checkride: 10 of 11 checks · without test)
check        red (types failing)
```

A run narrowed with `--only` or `--skip` records the slots it left out, and
the row names them behind the separator. That named narrowing is the whole
disclosure; the phrase `NOT the full check` is retired from the anatomy. A
run that left no summary (the gate itself broke) leaves no row, and the card
then withholds `looks good`: nothing was measured to approve on.

The per-turn gate is not the model's to relay. checkride's Stop hook
([D75 (two-gates)](decisions.md#d75)) runs after the turn has ended and
reports as a notice the harness appends on its own line, below the block; the
trailing blank line the relay keeps is what lands that notice off the
recommendation's last sentence. The model never restates it, and the run it
reports leaves the summary the next handoff reads, so its narrowing surfaces
in the next check row as `· without test` and nowhere else.

The relayed CLI strings keep their em-dashes (a boundary line, a notice); the
model's own lines never use one. That boundary is
[D78 (em-dash-ban)](decisions.md#d78)'s write-versus-relay line, restated
here because this is the surface where the model works.

## The footer card

The card is CLI-rendered by `plumbbob handoff`, relayed verbatim inside a
fence, and always the turn's last rendered block; only the recommendation's
plain sentences follow it. Three parts, a blank line between each so the eye
gets rungs to land on: the banner, the next-up line, the your-call block. The
card is human-facing furniture, so its labels are title case and take a colon
(`Next Up:`, `Your Call:`) and every clause opens with a capital letter; the
recap above it is an instrument readout, and its lowercase machine labels
stay as they are.

### The banner

One line: the state word behind its glyph, first letter capitalized and
followed by a colon, then the worst component when one exists, then the
step segment. The worst component vanishes when nothing is off:

```text
<glyph> <State>: <worst component> · Step <N> of <M>
```

```text
● Plumb: Step 2 of 3
◐ A hair off: 2 red runs before green · Step 3 of 7
○ Out of plumb: seam strayed · Step 3 of 7
✗ Not standing: done-when drifted · Step 3 of 7
```

The banner is computed, never composed: handoff folds the same assembled rows
the fence shows (its measured check and seam, the model's three judgment
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

The banner names one component, the hunt-saver; the recap above it holds the
rest. The step segment names the step the turn is about: the in-flight step
at a pause, the step that landed at a boundary. A fresh session with nothing
measured renders no banner.

### The next-up line

The forward pointer, one line: the step number, the title behind a plain
hyphen, and the plan's model recommendation in parentheses when the next
step carries one (advisory metadata,
[D62 (model-recommendation)](decisions.md#d62)):

```text
Next Up: Step 3 - Make the limit configurable via env (model: Sonnet)

Next Up: Step 3 - Make the limit configurable via env

Next Up: Nothing planned - /plumbbob:step or /plumbbob:finish
```

The parenthetical is the whole hint: the rationale for the recommendation
lives on the dashboard, and the `/model` call is the human's to make. A
title long enough to push the line past the width budget wraps; it is
never truncated.

### The your-call block

The card has to teach itself; a bare "looks good / needs work" assumes the
reader already knows the ceremony. So the block quotes what the human says
and states what happens next, exactly:

```text
Your Call:
  looks good  → I checkpoint step 2; back to the boundary
  needs work  → Tell me what to change; nothing lands until you approve
  revert      → I wind the work back to the last checkpoint
```

The moves stay lowercase, because they quote what the human says; each
outcome clause after the arrow opens with a capital letter.

The `looks good` line renders only while the measured check is green: on red,
or with no run to measure, the checkpoint would refuse, and offering a move
that cannot happen teaches a false ceremony. The other two lines always
render. The block is the face of the approval latch
([D64 (approval-latch)](decisions.md#d64)): the human's next message is the
tick, and the card is where they learn what each tick does. The block teaches
the moves without saying which one to take; that is the recommendation's
job, and it follows.

At the plan pause the block keeps the shape with the moves that apply there
(nothing is recorded yet, so `revert` vanishes):

```text
Your Call:
  looks good  → I mark the plan decided; /plumbbob:build starts step 1
  needs work  → Tell me what to sharpen; the plan is cheap to change now
```

An auto halt renders the standard card; the banner's worst component is the
halt reason.

## The recommendation

A decision turn's last words are the model's recommendation: the move it
would take, then why. The your-call block teaches the moves; a pause that
leaves the human deciding unassisted is a defect, not a missing nicety. The
model writes it into the detail file as a `## recommendation` section,
handoff emits it after the card behind a bold label, and it is relayed as
plain prose, never fenced, so the card stays the last rendered block and the
recommendation is the last text. The shape is exact:

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
| `✗ Not standing` | truing the diff will not fix it; a recap row says `drift` | repair the plan (`/plumbbob:refine`), or revert |

## The three tiers

The your-call block belongs only where a decision is pending, so the anatomy
scales down with the turn:

| tier | turns | the ending renders |
| --- | --- | --- |
| decision | the build/verify pause, the plan pause, an auto halt | the two regions: headline, highlights, and pointer above; recap, the inline diff when small, the card with its your-call block, and the recommendation below |
| orientation | status, the checkpoint boundary, finish | the verb's own output, then banner and next-up line; no your-call block, no recommendation |
| driver | park, spike, use, recover, revert, agent runs | the CLI's line verbatim, then the next-up line; nothing else |

A boundary turn, whole:

```text
plumbbob: step 2 checkpointed — b4c5d6e7f. Back at the boundary.

● Plumb: Step 2 of 3

Next Up: Step 3 - Make the limit configurable via env (model: Sonnet)
```

A driver turn, whole (a mid-step park):

```text
parked: tangent: should /password-reset get the same throttle?

Next Up: Back to step 2 - Wire the limiter into POST /login
```

The same positional rule governs every tier: the CLI's lines are relayed
whole, and the model writes nothing around them. A boundary turn is the
checkpoint's line and the card; a driver turn is the verb's line and the
pointer.

### The one-liners

A CLI notice (a boundary line, a driver line, a gate verdict) reads as one
sentence with one colon. Its detail rides in a single parenthetical,
comma-separated, and a glyph, when one rides at all, trails the clause
rather than leading it. No chained labels, no dash pile-ups: a line that
lands behind a harness prefix such as `Notice:` is already one colon deep,
and a second chain of them reads as machine noise where a sentence would do.
checkride's gate verdict is the reference shape:

```text
checkride green in 3.6s ✔ (10 checks, without test, slowest: spell in 1.8s)
```

plumbbob's own boundary and driver lines predate the rule and still carry a
second colon or a dash (`parked: tangent: …`, `checkpointed — <sha>. Back at
the boundary.`). That is a parked sweep, not an exemption.

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
| `●` `◐` `○` `✗` | the ladder words | the banner; `✗` alone also marks a hard failure (`harness bindings: ✗`) |
| `⚠` | a named warning | binding warnings and advisories |
| `·` | (separator) | between facts on one line |
| `→` | what happens next | `next →`, the your-call outcomes |
| `──` | (rule) | the recap header |

Hierarchy comes from position, shape, and whitespace. The anatomy spends one
bold token in the turn body, the recommendation's label, and no italics; the
budget is roughly one bold token per line before bold stops meaning anything,
and a single fixed allocation is the next best thing to zero for policing.

## The detail plane

Detail floods the picture, so the default turn carries none of it. Two
levels of disclosure, never more: the turn body is level one, and level two
is one file plus git.

`.plumbbob/detail.md` is the in-flight step's full detail: control-plane
ephemera, untracked via the shared gitdir's `info/exclude`
([D33 (info-exclude)](decisions.md#d33)), one file for the whole session,
overwritten at each step boundary so no pile of stale detail accumulates.
It is also the wire: the only path by which the model's judgment reaches the
bottom region. Its shape:

```markdown
# detail · step 2 · Wire the limiter into POST /login

── recap · step 2 of 3 ──
done-when    met: the 6th request in 60s returns 429, 3 passing
decisions    honored: D1 (in-memory-bucket), D2 (five-per-minute)
constraints  all honored

## 1 <the first highlight, restated>
<the full story: what moved, why, what was tried and discarded>

## 2 ...

## recommendation

<The move.> <The reason, one or two sentences.>
```

The model writes it fresh before every pause: the three judgment rows under
the header rule first (contiguous, since the first blank line ends them; no
fence is needed, the file is a wire, not a rendering), then the numbered
sections matching the highlight numbers, then the recommendation as the last
section. The rows it does not write (`check`, `seam`, `diff`) handoff
measures for itself. At checkpoint the CLI folds the file into the commit
body (the explicit `--body` text leads, the detail follows) and then
truncates it: the checkpoint commit is the durable archive, commentary in the
body, the diff in the tree.

Expansion is a lookup, never a recall. "expand 2" binds to the latest card
and is answered by reading the detail file's `## 2`; an older step takes its
step number or sha and is answered from `git show`. The diff itself never
rides the detail file: at the pause it is the working tree (`git diff`), and
after the checkpoint it is the commit.

## The thresholds

The numeric lines, in one place:

- **Twenty lines.** A diff of 20 changed lines or fewer (added plus removed,
  as `git diff --numstat` sums them) rides inline at the pause, in a `diff`
  fence between the recap and the card, and the diff row says so:
  `+14 -2 across 1 file · inline below`. At 21 the whole diff stays in the
  working tree behind the diffstat row. Code is the single largest source of
  visual flood, and the counted row already says what moved.
- **Five highlights.** More means the step's story has not been compressed;
  the overflow belongs in the detail file, counted by the pointer line.
- **Two levels.** The turn body, then the detail plane. Nothing hides at a
  third level, and every elision is counted and pointed at.
- **Column 14.** Recap labels pad to 13 characters so values align inside
  the fence, which leaves a value 58 characters.
- **Seventy-two columns.** Every card line and recap row stays within 72
  columns, the one width terminals, split panes, and PR diffs all survive;
  a fence preserves line breaks but cannot prevent wrapping. CLI rows
  degrade by count to fit; the model's rows are written to fit. The one
  legal overflow is a human-authored step title, which is never truncated:
  a wrapped title is legible where a cut one is wrong. Unfenced prose (the
  headline, the highlights, the recommendation) is exempt the other way: it
  is never hard-wrapped, and flows at the renderer's width.
- **Zero code blocks** in the default turn body beyond the recap fence, the
  card fence, and the one inline-diff exception above.

## What this spec leaves alone

- The parse-bearing sentinels: `NO ACTIVE SESSION`, the `## Steps` format,
  and checkpoint subjects
  ([D68 (conventional-subjects)](decisions.md#d68)) are unchanged.
- checkride's own output: this spec places the verdict (the check row); it
  never rewords what the gate prints.
- `docs/voice/` is hand-owned and untouched.
- No color, no ANSI, no TUI, no cursor control: the anatomy is plain text
  and markdown, and has to survive a PR diff unchanged.
