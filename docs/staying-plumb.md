# Staying plumb in a world that's been turned upside down

*Draft, 2026-11-04: drafted by a model for Rob's pen, per [generation-loss.md](generation-loss.md). No line here is an anchor until a human has decided it sounds like them.*

> And the LORD said unto me, Amos, what seest thou? And I said, A plumbline.
>
> *Amos 7:8, King James Version*

## The line

**A plumb line reads gravity, not the wall.** Hang a weight on a string and it points
down, whatever the world is doing around it; the bob never consults the brick it hangs
beside. A mason trusts it over the eye, since the eye reads the wall. The title is a
seventeenth-century ballad's, sung against a Parliament that had outlawed the keeping
of Christmas, and that is all the ballad lends here. A build turns its own small world
over more than once, and the question is what you hold still while it does.

## What the line is, and what it is not

In a plumbbob plan the line is three sections of `intent.md`, as the
[glossary](glossary.md#the-plan) defines them: the Frame, the Decisions, and the
Constraints. The Decisions with their *because* and the Constraints re-inject into every
step, which is why they stay one line each; the Frame is read once, when you approve the
plan. The step list is the wall: what you built against the line, and allowed to be found
out of true. [`attention-first-development.md`](attention-first-development.md) names
"capture, do not chase" as its fifth principle; this essay starts there, at the moment the
plan meets what it never covered.

## First contact

The workshop builds a list that forgets: every item carries a shelf life, written in
days, as `3d`. The plan said days, step 1 built days, and the parser refuses anything
else with a sentence the done-when quoted in advance. Then someone types `--for 2w`.
Nobody had thought about passports at plan time.

Three responses are open. Chase it: open the parser, add weeks, add months while you
are in there, and come back to a step that has lost its done-when. Ignore it, and let
the step land over a hole you have already seen. Fold it: write one line down, finish
the step, and let the plan take the surprise at the next boundary, where it costs a cold
look instead of a warm one. Chasing lays the next brick by eye; folding holds the line
to the wall at the boundary and moves what the line says to move.

## The folds, verb by verb

**Park is a flat append, and that is deliberate.** `/plumbbob:park` writes one tagged
line to the Park list in `build-log.md` and hands you back the step; a hook can read the
line with a grep ([D7 (park-then-harvest)](decisions.md#d7)). The triage waits for
`/plumbbob:harvest` at a boundary, where each park gets exactly one class: blocker,
tangent, or pivot signal. The skill proposes; you call each one, `make P1 a blocker`
for one lean and `looks good` for the rest
([techniques](techniques.md#capture-dont-chase-park-and-harvest)).

**A blocker becomes a step with the next free number.** A step keeps its number for
life, so the fold is an append, and the sequence to build the rest lives on one
`## Build order` line that `plumbbob order` writes
([D86 (build-order)](decisions.md#d86)). The ranges follow: `plumbbob order 6 4 5` files
step 6 into the range it now builds ahead of and never touches a range that has landed
([D109 (ranges-follow-the-order)](decisions.md#d109)).
`/plumbbob:step` sharpens the next step to what the build has taught; `/plumbbob:refine`
reads the whole plan cold and surfaces holes as open questions, never as decisions,
since closing a hole is your convergence ([refine](techniques.md#refine-keep-intent-true)).

**A question the work will settle is deferred, not forgotten.**
`plumbbob defer Q2 "<what settles it>"` swaps the opener's *resolve by:* for a dated
*deferred:* line; the question still counts as open, and every count says it apart from
the ones waiting on you ([D120 (deferred-questions)](decisions.md#d120),
[D123 (defer-records)](decisions.md#d123)).

**A fork the plan cannot settle on paper gets a spike.** `/plumbbob:spike <slug>` opens
a throwaway worktree and branch per option outside the repo, and `/plumbbob:spike done`
tears them down ([D18 (spike-lifecycle)](decisions.md#d18)); what survives is
`spike-NN-<slug>.md` beside `intent.md`, with its Verdict, and the call written back
into the plan ([D70 (spike-reports)](decisions.md#d70)). The experiment is
disposable; the verdict rides the branch into the pull request.

## Re-truing without losing the record

Each fold leaves a dated line, from the park to the spike's verdict. No step, revert, or
migration may lose a park line, an intent edit, or a recorded build folder; `revert`
snapshots the folder before its `reset --hard` and restores it after
([C4 (never-destroy)](decisions.md#c4)). Re-truing the wall never erases the first wall.
The record shows that the plan moved, where, and why: a plan managed, not quietly
replaced.

## When the world really is upside down

Sometimes the line itself was wrong: a decision rested on an assumption the build has
now failed. That is the harvest's third class, and a failed assumption is what earns it;
almost everything that feels like a pivot is a tangent. A true pivot is a replan, and the
record keeps the overturned decision beside the one that replaced it. When the step in
flight is the wrong step, `/plumbbob:abandon` drops the attempt, keeps its diff in the
tree, and leaves the step planned. The honest move is the one the record can show.

## The number

In [`runs.md`](runs.md#a-blocker-joins-a-range-still-to-come), one blocker arrives at
range 2's stop. The harvest folds it into step 6, the order files it ahead of steps 4
and 5, and range 3 re-cuts to `6,4-5`. The whole plan, surprise included, costs seven
typed prompts. The world turned over once; the line did not move, the wall did, and the
string still hangs straight.
