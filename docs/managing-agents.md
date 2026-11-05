# Manage agents like you manage your life

*Set boundaries, reward meaningful feedback, keep your eye on the ball, and never trust
what comes out of the internet*

*Draft, 2026-11-04: drafted by a model for Rob's pen, per
[generation-loss.md](generation-loss.md). No line here is an anchor until a human has
decided it sounds like them.*

> Trust, but verify.
>
> *A Russian proverb, by way of Reagan, 1987*

[attention-first-development.md](attention-first-development.md) says attention is the
scarce resource. It says nothing about trust: how far to let a crew run, and on what
evidence. This essay is that model: four rules, the same four that keep a person sane,
each backed by a mechanism that holds when you are not looking.

The picture is a site foreman and a crew. The foreman does not lay every block. The
foreman marks the wall, posts the rules, listens at the end of the shift, and signs
nothing off on the crew's word alone.

## Set boundaries

**A boundary is a line the crew can see, not a fence they cannot cross.** Every step
declares a seam: the exact paths it will touch, as literal paths or `dir/` grants, never a
glob ([D23 (no-glob-seams)](decisions.md#d23)). Entering the step writes that seam to the
build folder, and the dashboard shows it. Nothing stops an edit outside it; straying is
visible rather than silent, as with a chalk line on a floor
([the seam is awareness, not a lock](techniques.md#the-seam-is-awareness-not-a-lock)).

The site rules are the Constraints, and the ones that matter are checked rather than
recited. This repo has seven. Five are each enforced by a rule under `rules/` (14 files),
which the `struct` slot runs on every check: [C1 (functional-only)](decisions.md#c1),
[C2 (few-deliberate-deps)](decisions.md#c2), [C4 (never-destroy)](decisions.md#c4),
[C5 (additive-git)](decisions.md#c5), and [C6 (no-advance-verb)](decisions.md#c6). The
other two, [C3 (bindings-not-logic)](decisions.md#c3) and
[C7 (minimal-envelope)](decisions.md#c7), govern the agent doorway and are held by its
parser, which reads bindings and notes and drops any field it does not know. A constraint
the gate cannot read is a wish.

Two lines sit where the crew cannot reach them. Every one of the 16 skills is
`disable-model-invocation`, so the model never fires a move; you do. And a user-authored
agent speaks an envelope with no verb to advance the loop
([C6 (no-advance-verb)](decisions.md#c6)): it can return concerns, never a checkpoint
([the three invariants](agents.md#the-three-invariants)). Where a boundary does meet the
model mid-thought, it asks rather than denies: the PreToolUse hook on a raw `git commit`
during a step returns `ask`, since a denial leaves no legal move and a pause leaves one
([D66 (oob-commits-surfaced)](decisions.md#d66), under
[D10 (pause-not-lock)](decisions.md#d10)).

## Reward meaningful feedback

**Ask for the reason with the claim, once.** A foreman wants "done, and here is why",
not the day narrated twice. The card at a pause shows once, when the work reaches it;
every later turn at that pause is the model's own reply, closed by the one line that
points back ([D110 (reply-after-the-card)](decisions.md#d110)). The card keeps what you
read to decide (the Summary lead, the Readout with its changed files, the diff, the
moves) and points at the detail file once, from its foot
([D113 (short-card)](decisions.md#d113)).

The reason travels with the claim. The recommendation is a move and one or two sentences
of why, never the move alone. A Decision in `intent.md` is one line with its *because*,
and it re-injects into every build step, so the reason that settled it is in front of the
crew each time. Feedback that carries its reason can be argued with; feedback that does
not can only be obeyed.

## Keep your eye on the ball

**The drawing on the wall is the job; everything else is weather.** The Frame names the
problem, the smallest thing that solves it, what done looks like, and what you are
refusing to do. Each step carries a done-when a check can read. `status` infers one next
move and prints the full list beneath it so you can overrule it
([D15 (one-next-move)](decisions.md#d15)); one move, because the foreman who gives five
directions at once gets none of them.

A new idea mid-step goes to `/plumbbob:park`; the foreman reads the note at the end of
the shift, not mid-pour ([techniques](techniques.md#capture-dont-chase-park-and-harvest)).

## Never trust what comes out of the internet

**A model's output is the internet re-encoded through its priors, and you would not merge
a forum post unread.** [generation-loss.md](generation-loss.md) makes the longer argument.
The practical form is the proverb: the crew's word that the wall is level is not the
level.

So the sign-off is instrumented. `checkpoint` refuses a red check; the gate is checkride,
called through its API, and a run with every slot skipped is a refusal, not a green
([D32 (checkride-gate)](decisions.md#d32)). The verify tick runs that full gate and then
one structured self-review of the diff against the done-when, the Decisions, and the
Constraints ([D16 (check-plus-self-review)](decisions.md#d16)). The self-review is
advisory, and so is any after-slot agent you add: it informs the pause and cannot fail or
pass a step ([D45 (advisory-review)](decisions.md#d45)). The measured rows decide; the
judged rows are read.

And the latch: `checkpoint` refuses to land a step until the harness's ledger records a
human turn since the step began ([D64 (approval-latch)](decisions.md#d64)). The model's
own "looks good" is not a turn. Yours is.

## What this is not

It is not surveillance. No edit is blocked, no transcript is watched, and the work plane
stays guidance from start to finish. The controls live on the record: the seam you can
see, the rules the gate reads, the card that shows once, and the tick only a human can
give. When something slips anyway, a raw commit or a step that landed wrong, `status` says
so and `revert` restores only recorded SHAs. Cheap recovery, not a cage.
