---
name: run
description: "Run what is left of the range holding the next step, or of range N: the plan's `## Build ranges` names the steps, the turn hook mints their grant from the plan, and the run walks them the way a typed range is walked, then ends on the stop card, the range's review with every open park proposed, which one reply settles. A bare range builds its one step to its pause. Reads the build skill beside it for the per-step loop."
argument-hint: "[range-number]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob build:*), Bash(plumbbob handoff:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(plumbbob park:*), Bash(plumbbob agent:*), Bash(plumbbob spike:*), Bash(git diff:*), Bash(plumbbob harvest:*), Bash(plumbbob order:*), Bash(git log:*)
---

# PlumbBob: run a range

Current session state (injected when this skill runs): !`plumbbob status --run "$ARGUMENTS" 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

A run is one range of the plan being built. `/plumbbob:run` runs what is left of the range
holding the next undone step in build order, the step in flight counted undone, and
`/plumbbob:run 3` runs range 3, by the item number the plan's `## Build ranges` gives it
([D95 (run-verb)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d95)).
The plan names the steps, so you never work them out from the chat: the run header above the
dashboard names them, and the turn hook minted their grant from the plan when the human typed
the run
([D96 (plan-names-the-grant)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d96)).

This skill carries only what is the run's own: reading the header, refusing, how a run
starts, and the stop card it ends on. The loop that builds each step belongs to the build
skill, and the classes a park settles as belong to the harvest skill; you read both rather
than recall them
([D99 (one-loop)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d99)).

## 1. Read the build skill first

Before anything else, read `../build/SKILL.md` from this skill's base directory: the path
printed above this skill as its base directory, so `<base directory>/../build/SKILL.md`.
Read the file every run, whole; a copy of it from memory drifts. The parts a run follows are
its sections **What this skill does, in order** (steps 2 to 5: entering a step, reading the
plan, implementing within the seam, parking a tangent, and the verify tick with its pause),
**`--auto`: let the agent be the clock (opt-in)** with its halt list, **A step range (`N-M`,
or a list like `20,5-9`) is a bounded `--auto`**, **Running bound agents** when the dashboard
shows a `harness bindings:` block, and **The hard contracts**.

Its rules about its own invocation are about `/plumbbob:build` and do not apply here: its
first step (picking the step from its arguments) and its rule that the invocation outranks
its injected dashboard. For a run, this skill's invocation and the run header take their
place, below. Its rule for a clean halt (relay the top step's checkpoint block and end the
turn) gives way to the stop card here, below.

At the stop card you also read `../harvest/SKILL.md` from the same base directory, for its
three classes, its default, and its rules for folding a confirmed blocker into the plan.

## 2. Read the run header

The injected state opens on the run header when the run names a range it can walk:

```text
run  range 3 of 5 · steps 6-9 · ends at step 9's boundary
     stop: review the card on a live boundary before the skills teach it
     grant: steps 6-9
```

The first line is the range, what is left of it in the order the run builds it, and where
the run ends: at the boundary after its last step for a range that lands its steps, or at
the pause of its one step for a bare range. The `stop:` line is the call the plan reserved
for the end of the range. The `grant:` line is what the turn hook minted at the keystroke,
and the dashboard beneath marks the run's first step `← requested`.

A fourth line, `waiting: range 2 of 5's stop card, recorded before the run`, means the last
range's stop card is still waiting for its reply. The run typed at it is that reply: settle
the card first (section 6, below), then walk the run.

**The typed number and the grant outrank the header.** The hook read the plan the human
typed against, so its grant is the run. When the human typed a number and the header names
another range (the host never passed the number through), or the grant line says
`unlike the run`, walk exactly the steps the grant names and say so in one line. A
`range M` grant, from a hook older than step lists, lands the steps up to M.

`grant: none` beside a range that lands its steps means the hook minted nothing, because
the plugin's hook is older than the run or the prompt was not a typed `/plumbbob:run`, so
no step could land without a pause. Report that in a sentence or two, name the range's own
command from the plan's `## Build ranges` (`/plumbbob:build 6-9`) as the way to land it by
hand, and stop without building. **Never write a grant yourself to get past it: a grant you
mint is no grant, and the latch ignores it
([D67 (auto-not-a-grant)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d67)).**

## 3. Refuse what the run cannot walk

No run header above the dashboard means the run names nothing it can walk, and the hook
minted nothing for it
([D97 (run-refuses)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d97)).
The dashboard's `next →` line carries the refusal and the move that unblocks it: a plan
without ranges (`/plumbbob:refine ranges`, or `/plumbbob:build` for the next step alone), a
next step no range names or a flagged range (`/plumbbob:refine ranges`), a range that has
landed or a number the plan lacks (the run the card names instead), nothing left
(`/plumbbob:finish`), a step in flight outside the range typed (`/plumbbob:verify` or
`/plumbbob:abandon` it), or a spike open (`plumbbob spike done`). A span or a list of ranges
(`/plumbbob:run 2-4`) is a form no run defines, and it refuses the same way.

Report the refusal in a sentence or two, quoting the move from that line, and stop: enter
no step, build nothing, and run no checkpoint. `NO ACTIVE SESSION` refuses too, with
`/plumbbob:plan` as the move.

## 4. Run the range

**A step waiting at its pause.** When the dashboard's phase reads `[BUILD]`, a step is in
flight, and the header's first step is that step. A run typed there is that pause's
`looks good`: land it the way the build skill lands an approved pause, with
`plumbbob checkpoint <n> --body <<'BODY'` and a body proportional to the step, and do not
enter it again with `plumbbob build`. The checkpoint runs the check, so the step lands only
on green. When the checkpoint refuses on a red check, the step stays at its pause: write the
detail file, run `plumbbob handoff`, paste its block, and end the turn. When the step is not
finished (its done-when unmet, and no pause card for it in this conversation), finish
building it first, then verify and land it the same way. Once it lands, a bare range's run
ends there: relay the checkpoint's block whole and end the turn. A run whose landing range
that step completed ends on the stop card, below, even when the paused step was the range's
last. Otherwise carry on through what is left, below. A halt the human approves with
`looks good` lands its step the same way, and when that landing completes the run's range
(its checkpoint block carries the `**Stop**:` part for it), the run ends on the stop card
too.

**A range that lands its steps.** Walk it exactly as the build skill walks a typed range,
in its section on step ranges: start at the header's first undone step, build each step the
grant names in build order, check, self-review, and checkpoint it on green, and take the
next undone step in build order after each landing. A step the grant does not name halts the
walk before it, since the checkpoint would refuse it. The halt list is the build skill's: a
red check, a self-review mismatch, a bound agent's `blocked` or `drift`, or a new decision
ends at that step's pause card. `plumbbob build` names the top step as the top of the range
you granted when it enters it. Once that step lands, its checkpoint prints the boundary
with the Stop part (`**Stop**: Range 3 of 5 landed - <its stop>`); relay none of it, and end
the run on the stop card, below, in the same turn.

**A bare range.** `grant: none, as a bare range builds to its pause`: build the range's one
step to its pause exactly as the build skill's default path does for `/plumbbob:build <n>`:
enter it, implement it, verify it, write the detail file, run `plumbbob handoff`, paste its
block, and end the turn. The plan reserved this pause for a call, and the header's `stop:`
line names it, so your recommendation speaks to that call.

## 5. End on the stop card

A run that lands its range ends on the stop card
([D100 (stop-card)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d100)):
the review the plan's stop asked for, with every open park on it and a lean proposed for
each. The checkpoint that landed the range's last step marked its ending as owing the card,
and the turn will not close on that boundary
([D103 (stop-latched)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d103)).

*Write the range's detail file.* Overwrite `.plumbbob/detail.md` in the range's shape:

```markdown
# Detail · Range <N> · <the stop, as the plan words it>

── recap · range <N> of <M> ──
done-when    met
decisions    honored: D1 (some-slug), D2 (another-slug)
constraints  all honored

## Summary

<what the whole range built, in a sentence or a short paragraph>

## 1 <the first highlight across the range: one sentence, one move>

<the full story>

## Harvest

- P<handle> → <blocker, tangent, or pivot>: <the reason, one clause>

## Recommendation

<The move.> <The reason, one or two sentences.>
```

The header names the range by its item number, and that is how `checkpoint` and
`plumbbob harvest` tell the file from a step's. The three rows judge the whole range: every
step's done-when, the decisions any step exercised, and the constraints. The Summary and the
highlights are the range's, not its last step's, and you draw them from the range's
checkpoint bodies (`git log` over its commits) and their entries in the build-log's `## Log`,
never from recall, since a long run can compact its context partway through and lose its
early steps. A step that landed a hair off comes first among the highlights; five at most.

The `## Harvest` section carries one line for every open park in the build-log's
`## Park list`. A park's handle is `P` and its place in that list, counting the harvested
lines too, which is the count the note sizes as `parked 3 of 8 open`: the third line ever
parked is `P3` whether or not the two above it are flipped, and the card, the detail file,
and the human's reply all name it `P3`
([D105 (park-handles)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d105)).
Propose one class per park by the harvest skill's rules, `tangent` for anything uncertain,
with the reason in one clause; the card prints it as the park's lean
(`→ lean: tangent, <the reason>`), so write the class and the reason alone and leave the
punctuation to handoff. A park you leave out reads `no lean proposed` on the card and stays
open. The section vanishes when no park is open, and so does the card's Harvested part
([D100 (stop-card)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d100)).
The recommendation speaks to the plan's stop, the header's `stop:` line, and to the
proposals: the move you would take on both, then why.

*Render it and stop.* Run `plumbbob handoff --stop` and paste its output whole, verbatim, at
top level, trailing blank line included, then end the turn. Write nothing before it or after
it, and record nothing in this turn: `plumbbob harvest` refuses in the turn the card printed,
because the human has not read it yet. If the turn is held with a reason saying the stop card
is still owed, do exactly what the reason says.

## 6. The reply at a stop

The card's proposals are settled in one reply
([D102 (settle-in-one-reply)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d102)),
and the Your Call block names the replies. Read the human's message as one of them:

- **`looks good`** confirms the review and locks in every lean as proposed, as the line
  beneath the card's Your Call label says. Fold each confirmed blocker into `intent.md` by
  the harvest skill's rules first, then run `plumbbob harvest`, which flips the parks,
  writes the Harvest lines, and writes the range's review beneath a dated line in the Log.
  A blocker that becomes a step goes into a range still to come, or a bare range of its
  own, never into the range this card reviews: that range has landed, its call is the one
  being made, and the step would reopen it. Relay the record's ending whole and end the
  turn. It commits nothing; the record rides the next step's checkpoint.
- **A change** (`make P7 a tangent`, or a change to the review) is direction. Rewrite the
  detail file's line or section, run `plumbbob handoff --stop`, paste the whole card it
  prints, and end the turn. Nothing is recorded until `looks good`.
- **A question**, or `expand 2`, is answered from the detail file, the range's commits, or
  the Log, never from recall; then run `plumbbob handoff --stop` and paste what it prints
  beneath your answer, which is the one-line reminder while the stop is unchanged.
  `show the stop`, or a session without the card in front of it, takes
  `plumbbob handoff --stop --full`.
- **`/plumbbob:run`** typed at the card confirms everything the way `looks good` does, and
  runs the next range. Record first: fold the blockers and run `plumbbob harvest`, then read
  `plumbbob status --run "<the same argument>"` again. When its grant line says
  `unlike the run`, the record re-cut the range the run would walk (a blocker added or moved a
  step in it), and the grant the hook minted before the record no longer covers it: relay
  the record's ending whole and end the turn there, where its note names the re-cut run for
  the human to type
  ([D102 (settle-in-one-reply)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d102)).
  Otherwise relay the record's ending and walk the run from section 4.
- **`/plumbbob:finish`** at the plan's last range is the finish skill's to settle: it
  records the card the way `looks good` would before it writes the report.

`plumbbob harvest` refuses a proposal naming a handle the list lacks (`P9` with eight
parked) and a class outside the three, and it refuses a detail file no card showed; fix what the refusal names, run
`plumbbob handoff --stop` again, and end the turn on the card. One refusal takes another
path: `step 13 joined it after it landed` means a blocker went into the range the card
reviews. Move that step to a range still to come, or a bare range of its own, leave
`.plumbbob/detail.md` as it is, fold nothing again, and run `plumbbob harvest` once more in
the same turn, which records; `plumbbob handoff --stop` would refuse there.

## The hard contracts

- **The human types the run.** You never start one: `looks good` lands a step and never
  starts the next range, and nothing chains ranges. A run ends where its range does, on the
  stop card, or at a pause for a bare range or a halt, and the next run waits for the human's
  next prompt.
- **The plan names the steps.** Walk what the header and the grant name, never a range
  worked out from the chat, and never a step beyond the grant.
- **The latch holds the record.** A refused checkpoint is a pause, never an error to route
  around: write the detail file, run `plumbbob handoff`, paste its block, and end the turn.
  Never land a step with a raw `git commit`, and never write a grant into a settings or
  control file; ask the human to type the run again instead.
- **The reply records the stop.** Never run `plumbbob harvest` in the turn the stop card
  printed; the human's reply to the card is what records it, and the classes stay their call.
- **One loop.** Read `../build/SKILL.md` every run; the build skill is the engine both verbs
  drive, and two copies of it would drift apart.
