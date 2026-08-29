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
This spec extends that split to the whole turn. One naming decision rides
with it: the CLI-rendered ending has collected four names (closing block,
standardized hand-off block, canonical three-part closing block, its block),
and they all retire. It is **the footer card**, the card for short, and no
other name for it appears in a skill or doc from here on.

## The shape of a turn

A decision turn (the build/verify pause is the canonical one) reads top to
bottom in four parts:

| part | author | how it reaches the turn |
| --- | --- | --- |
| headline and highlights | model | composed fresh, under the shape rules below |
| recap | model | the exact fenced template, written to the detail file first |
| verdict line | CLI (`plumbbob check`) | relayed verbatim, on its own line |
| footer card | CLI (`plumbbob handoff`) | relayed verbatim, always the last text |

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
seam         held: 2 files, both inside
diff         +61 -3 across 2 files
```

plumbbob: check green.

```text
● Plumb: Step 2 of 3

Next Up: Step 3 - Make the limit configurable via env (model: Sonnet)

Your Call:
  looks good  → I checkpoint step 2; back to the boundary
  needs work  → Tell me what to change; nothing lands until you approve
  revert      → I wind the work back to the last checkpoint
```
````

Alignment survives only inside a fence in the renderers this has to read well
in (Claude Code, Cursor, a PR diff), so the recap and the card always ride in
`text` fences; the headline, highlights, and verdict line are plain markdown.
Nothing follows the card, not even a courtesy sentence: the eye lands at the
end of terminal output, so the end is where the verdict belongs.

## The headline and the highlights

The headline is one plain-English sentence stating the outcome, not the
activity: "Step 2 built: the 6th login attempt inside a minute now gets 429",
never "I have implemented the rate limiting functionality". No bold, no
flourish; the sentence carries it.

The highlights are a numbered list, five entries at most, each one sentence
and one move. Plain English first: a path or identifier appears in backticks
only when the name itself is the news. The numbers are handles, not
decoration: "expand 2" opens the matching section of the detail file, so
every highlight must have a section behind it with the full story.

After the highlights comes the detail pointer, one line, exact shape:

```text
detail: <N> sections in .plumbbob/detail.md · "expand <n>" shows one
```

The count is the honesty mechanism: hidden detail is always counted and
pointed at, because a silent cut reads as coverage. A step so small that the
highlights already say everything writes no extra sections and drops the
pointer line entirely.

## The recap

The recap is the model's self-review compressed to labeled rows inside one
fence. The template is exact because the rows are a wire: the model writes
the same fenced block into `.plumbbob/detail.md` before calling `plumbbob
handoff`, and handoff parses the rows there to compute the banner. The turn
shows the human a copy of the same bytes.

The fence opens with a header rule and holds six rows, in this order, labels
padded with spaces so every value starts at column 14:

```text
── recap · step <N> of <M> ──
check        green (checkride: lint, types, test)
done-when    met: the 6th request in 60s returns 429, 3 passing
decisions    honored: D1 (in-memory-bucket), D2 (five-per-minute)
constraints  all honored
seam         held: 2 files, both inside
diff         +61 -3 across 2 files
```

Each measuring row opens with a verdict word from a closed set. The words are
parse-bearing; the evidence after the colon is free prose, one line:

| row | true | failing | plan-wrong |
| --- | --- | --- | --- |
| `check` | `green (<gate>: <slots run>)` | `red (<slot> failing)`, `error (the gate broke)` | never; the gate measures the work |
| `done-when` | `met: <evidence>` | `not met: <what is missing>` | `drift: <why no diff can meet it>` |
| `decisions` | `honored: <tags>`, or `none exercised` | `bent: <tag>, <how>` | `drift: <which one reality broke>` |
| `constraints` | `all honored` | `bent: <tag>, <how>` | `drift: <which one reality broke>` |
| `seam` | `held: <N> files, all inside` | `strayed: <path> outside the seam` | `drift: <it names the wrong surface>` |

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
  the banner.
- The check row is provisional as written: at the fold, handoff replaces its
  attested verdict with its own measurement. Measured beats attested, so a
  model cannot vibe the gate green.

The model may only say true, failing, or drift. It has no word for "green
with an asterisk": the softer judgment belongs to the CLI, which measures
what the road to green cost (see the banner). That asymmetry is what makes
the middle of the ladder trustworthy.

## The verdict line

The check gate's verdict is relayed verbatim, on its own line, between the
recap and the card. The three forms, exactly as the CLI prints them:

```text
plumbbob: check green.
plumbbob: check RED — fix it before checkpointing.
plumbbob: check ERROR — the gate itself broke; fix the harness before trusting green or red.
```

Never paraphrased, never folded into a sentence, never reordered. The same
slot serves every gate verdict the model relays: when the Stop-hook's
per-turn gate reports, its verdict rides here too, verbatim, and a narrowed
gate's `NOT the full check` clause rides with it. The relayed strings keep
their em-dashes; the model's own lines never use one. That boundary is
[D78 (em-dash-ban)](decisions.md#d78)'s write-versus-relay line, restated
here because this is the surface where the model works.

## The footer card

The card is CLI-rendered by `plumbbob handoff`, relayed verbatim inside a
fence, and always the turn's last text. Three parts, a blank line between
each so the eye gets rungs to land on: the banner, the next-up line, the
your-call block. The card is human-facing furniture, so its labels are
title case and take a colon (`Next Up:`, `Your Call:`) and every clause
opens with a capital letter; the recap above it is an instrument readout,
and its lowercase machine labels stay as they are.

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

The banner is computed, never composed: handoff reads the recap rows from
`.plumbbob/detail.md`, replaces the check row with its own measurement, and
folds worst-of across the five measuring rows plus the step's accrued stats.
The fold, from worst down:

1. Any row saying `drift` → `✗ Not standing`, named `<row> drifted`.
2. Any row failing (`red`, `error`, `not met`, `bent`, `strayed`) →
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

The `looks good` line renders only while the measured check is green: on red
or error the checkpoint would refuse, and offering a move that cannot happen
teaches a false ceremony. The other two lines always render. The block is
the face of the approval latch ([D64 (approval-latch)](decisions.md#d64)):
the human's next message is the tick, and the card is where they learn what
each tick does.

At the plan pause the block keeps the shape with the moves that apply there
(nothing is recorded yet, so `revert` vanishes):

```text
Your Call:
  looks good  → I mark the plan decided; /plumbbob:build starts step 1
  needs work  → Tell me what to sharpen; the plan is cheap to change now
```

An auto halt renders the standard card; the banner's worst component is the
halt reason.

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
| decision | the build/verify pause, the plan pause, an auto halt | the full anatomy: headline and highlights, recap, verdict line, card with the your-call block |
| orientation | status, the checkpoint boundary, finish | the verb's own output, then banner and next-up line; no your-call block |
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

Hierarchy comes from position, shape, and whitespace. The anatomy spends no
bold and no italics in the turn body; the budget is roughly one bold token
per line before bold stops meaning anything, and spending zero is the one
allocation nobody has to police.

## The detail plane

Detail floods the picture, so the default turn carries none of it. Two
levels of disclosure, never more: the turn body is level one, and level two
is one file plus git.

`.plumbbob/detail.md` is the in-flight step's full detail: control-plane
ephemera, untracked via the shared gitdir's `info/exclude`
([D33 (info-exclude)](decisions.md#d33)), one file for the whole session,
overwritten at each step boundary so no pile of stale detail accumulates.
Its shape:

```markdown
# detail · step 2 · Wire the limiter into POST /login

── recap · step 2 of 3 ──
(the fenced recap, byte-identical to the turn's copy)

## 1 <the first highlight, restated>
<the full story: what moved, why, what was tried and discarded>

## 2 ...
```

The model writes it fresh before every pause, recap first (it is the wire
handoff parses), numbered sections matching the highlight numbers. At
checkpoint the CLI folds the file into the commit body (the explicit
`--body` text leads, the detail follows) and then truncates it: the
checkpoint commit is the durable archive, commentary in the body, the diff
in the tree.

Expansion is a lookup, never a recall. "expand 2" binds to the latest card
and is answered by reading the detail file's `## 2`; an older step takes its
step number or sha and is answered from `git show`. The diff itself never
rides the detail file: at the pause it is the working tree (`git diff`), and
after the checkpoint it is the commit.

## The thresholds

The numeric lines, in one place:

- **Twenty lines.** A diff of 20 changed lines or fewer (added plus removed,
  as `git diff --numstat` sums them) may ride inline at the pause, in a
  `diff` fence between the recap and the verdict line, and the diff row says
  so: `+14 -2 across 1 file · inline below`. At 21 the whole diff stays in
  the working tree behind the diffstat row. Code is the single largest
  source of visual flood, and the counted row already says what moved.
- **Five highlights.** More means the step's story has not been compressed;
  the overflow belongs in the detail file, counted by the pointer line.
- **Two levels.** The turn body, then the detail plane. Nothing hides at a
  third level, and every elision is counted and pointed at.
- **Column 14.** Recap labels pad to 13 characters so values align inside
  the fence.
- **Seventy-two columns.** Every card line and recap row stays within 72
  columns, the one width terminals, split panes, and PR diffs all survive;
  a fence preserves line breaks but cannot prevent wrapping. Outcome
  clauses and hints are cut to fit. The one legal overflow is a
  human-authored step title, which is never truncated: a wrapped title is
  legible where a cut one is wrong.
- **Zero code blocks** in the default turn body beyond the recap fence, the
  card fence, and the one inline-diff exception above.

## What this spec leaves alone

- The parse-bearing sentinels: `NO ACTIVE SESSION`, the `## Steps` format,
  and checkpoint subjects
  ([D68 (conventional-subjects)](decisions.md#d68)) are unchanged.
- checkride's own output: this spec places the relay (the verdict line); it
  never rewords what the gate prints.
- `docs/voice/` is hand-owned and untouched.
- No color, no ANSI, no TUI, no cursor control: the anatomy is plain text
  and markdown, and has to survive a PR diff unchanged.
