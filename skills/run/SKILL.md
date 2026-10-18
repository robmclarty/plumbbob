---
name: run
description: "Run what is left of the range holding the next step, or of range N: the plan's `## Build ranges` names the steps, the turn hook mints their grant from the plan, and the run walks them the way a typed range is walked, then ends where the range does. A bare range builds its one step to its pause. Reads the build skill beside it for the per-step loop."
argument-hint: "[range-number]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob build:*), Bash(plumbbob handoff:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(plumbbob park:*), Bash(plumbbob agent:*), Bash(plumbbob spike:*), Bash(git diff:*)
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

This skill carries only what is the run's own: reading the header, refusing, and how a run
starts and ends. The loop that builds each step belongs to the build skill, and you read it
rather than recall it
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
place, below.

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
ends there, and so does a run whose range that step completed: relay the checkpoint's block
whole and end the turn. Otherwise carry on through what is left, below.

**A range that lands its steps.** Walk it exactly as the build skill walks a typed range,
in its section on step ranges: start at the header's first undone step, build each step the
grant names in build order, check, self-review, and checkpoint it on green, and take the
next undone step in build order after each landing. A step the grant does not name halts the
walk before it, since the checkpoint would refuse it. The halt list is the build skill's: a
red check, a self-review mismatch, a bound agent's `blocked` or `drift`, or a new decision
ends at that step's pause card. `plumbbob build` names the top step as the top of the range
you granted when it enters it. Once that step lands, relay its checkpoint's block whole,
the Stop part included, write no detail file, run no `handoff`, and end the turn.

**A bare range.** `grant: none, as a bare range builds to its pause`: build the range's one
step to its pause exactly as the build skill's default path does for `/plumbbob:build <n>`:
enter it, implement it, verify it, write the detail file, run `plumbbob handoff`, paste its
block, and end the turn. The plan reserved this pause for a call, and the header's `stop:`
line names it, so your recommendation speaks to that call.

## The hard contracts

- **The human types the run.** You never start one: `looks good` lands a step and never
  starts the next range, and nothing chains ranges. A run ends where its range does, on the
  last checkpoint's block or at a pause, and the next run waits for the human's next prompt.
- **The plan names the steps.** Walk what the header and the grant name, never a range
  worked out from the chat, and never a step beyond the grant.
- **The latch holds the record.** A refused checkpoint is a pause, never an error to route
  around: write the detail file, run `plumbbob handoff`, paste its block, and end the turn.
  Never land a step with a raw `git commit`, and never write a grant into a settings or
  control file; ask the human to type the run again instead.
- **One loop.** Read `../build/SKILL.md` every run; the build skill is the engine both verbs
  drive, and two copies of it would drift apart.
