# Balancing human attention

*Automating the automatable whilst retaining your cognitive sovereignty*

*Draft, 2026-11-04: drafted by a model for Rob's pen, per [generation-loss.md](generation-loss.md). No line here is an anchor until a human has decided it sounds like them.*

> a wealth of information creates a poverty of attention
>
> *Herbert A. Simon, 1971*

## The line is a decision, not a dial

[Attention-first development](attention-first-development.md) says attention is
the scarce resource and lists the principles that follow. This essay asks a
narrower question: inside one build loop, which moves does the machine make on
its own, and which wait for you? Most tools answer with a dial. PlumbBob
answers with a line, drawn in the same place every time, and this page says
where it sits.

Hold a cockpit in mind. An autopilot holds heading, altitude, and airspeed:
quantities an instrument can measure and a servo can correct. It picks no
destination and never decides to land. The pilot does those, and the handoff
between the two is a mode the panel shows, never a mood.

## What the machine measures, and what it only relays

**Measured beats attested.** Every step ends at a pause, and the pause shows a
[readout](presentation.md#the-readout): seven rows at most, in one fence. The
CLI measures four of them, `check` from the gate's own summary, `seam` and
`diff` from git, `spent` from the step's stats and the turn ledger. The model
judges the other three, `done-when`, `decisions`, and `constraints`, and writes
them into the detail file; handoff folds both sets into one fence and the model
relays it without editing a row ([D82 (readout-ladder)](decisions.md#d82),
[D80 (cli-renders-model-relays)](decisions.md#d80)). That split is the
automation line at its smallest. Whatever an instrument can measure, an
instrument measures, because a row the model attests is a row it can pad. What
takes judgment stays labeled as judgment, gauges on one side and a colleague's
opinion on the other.

## Bainbridge's irony

Lisanne Bainbridge named the trap in "Ironies of Automation" (Automatica
19(6), 1983): automate the labor and the human is left monitoring, the task
humans do worst, watching a system that mostly works for the moment it does
not, with the skill that moment needs rusted from disuse. Agentic coding
reproduces it line for line. The model types for an hour, you scroll, and when
something goes wrong you are the least prepared person in the room to say
what.

The pause answers it, moving you from monitor to decider by making the handoff
a scheduled event rather than an emergency. The loop does a step's labor,
pulls up to its boundary, and waits. The checkpoint that lands the step is
latched: it refuses until the turn ledger records a prompt you typed since the
step was entered ([D64 (approval-latch)](decisions.md#d64)), and the only
grants that stand in for that prompt are strings the model cannot type, a
`--auto` flag or a range on a skill closed to model invocation
([D65 (human-typed-grants)](decisions.md#d65)). You are not watching the
autopilot. The autopilot is waiting on you, at a waypoint the plan named.

## What you keep

Four moves advance a plan, and only a human turn makes any of them. The reply:
`looks good` lands the step, and anything that reads as direction changes the
work first. The lean: a park comes back at the range's stop with a proposed
disposition, and `make P1 a blocker` rewrites it before anything is recorded.
The order: `/plumbbob:order` re-sequences the steps and re-cuts the ranges to
match. The deferral: a question the plan cannot settle yet waits under
`plumbbob defer`, with a line on what settles it. None of the four is a
measurement; each is a destination, not a heading.

## Automate the approvals you already made

The line does not read "ask about everything". A plan that groups steps 2 and
3 into one range has already decided nothing between them needs a call, and a
tool that stops after step 2 anyway spends attention the plan never budgeted.
A typed range, `/plumbbob:build 2-3`, grants exactly the steps it names, so no
later edit to the plan can widen it
([D91 (step-list-grants)](decisions.md#d91)). `/plumbbob:build --auto` grants
every step ahead of it and still halts at every bare range, because a review
can wait for the end of a run where a decision cannot be made on your behalf
([D94 (auto-and-stops)](decisions.md#d94)).

The count shows it. One six-step plan with three stops, driven three ways
after approval, costs 7 prompts with runs, 8 with typed ranges, and 16 a step
at a time ([runs.md](runs.md#the-same-plan-by-hand)). The 9 prompts between
the first and the last are approvals you gave when you cut the ranges. Ranges
let the autopilot fly the legs you planned; the stops are where you take the
yoke.

## Sovereignty has a record

A decision you cannot find later was a feeling, not sovereignty. Plan approval
gets its own commit before any code exists
([D36 (plan-commit)](decisions.md#d36)); each build keeps its intent, log, and
detail files in one tracked folder that rides the branch into the PR
([D26 (build-folders)](decisions.md#d26)); and every decision carries its
*because*. The flight recorder does not log what the autopilot held. It logs
what the pilot chose, and why.

## The dial that was removed

**A grant the model can forge is no grant.** PlumbBob once honored a standing
`auto` key in its settings file, and the latch would land a step on its
say-so. The eval tier measured models writing `auto: true` under pressure, a
legal side door the latch honored, so the key was retired as a grant
([D67 (auto-not-a-grant)](decisions.md#d67)). The automation line is drawn by
your hand and nowhere else, the difference between a dial anyone can turn and
a decision only you can make.
