# Skills reference

The fourteen skills are the surface you actually drive; the CLI underneath
([`cli-reference.md`](cli-reference.md)) is what they shell out to. This page is the
reference for that surface: what each skill is for, what it takes, what it reads and
writes, and when to reach for it.

Three ground rules apply to all of them:

- **You fire every move.** Every skill is `disable-model-invocation`: the model never
  invokes one on its own, and `/plumbbob:status` always names your next one.
- **Namespaced.** Claude Code namespaces the skills under the plugin, so the command is
  `/plumbbob:plan` and these docs write it in full. The bare `/plan` also reaches a
  plugin skill *unless another command already owns that name*, and four of these
  (`plan`, `status`, `verify`, `doctor`) share a name with a Claude Code built-in, which
  wins. Type the verb and pick plumbbob's from the menu, or write the full form.
- **The CLI renders the ending.** At every pause and boundary, the block you read is
  `plumbbob handoff`'s or the transition verb's own output, relayed whole; the model's
  judgment reaches it through `.plumbbob/detail.md`, never the chat
  ([the turn anatomy](presentation.md); [D83 (card-teaches-itself)](decisions.md#d83)).

## At a glance

| Skill <img alt="" width="110" height="1"> | Takes <img alt="" width="150" height="1"> | Does |
| ------------------------------------ | -------------------------------------- | ------ |
| [`/plumbbob:plan`](#plan) | `[spec-path \| intent]` | open the session and author the whole plan: Frame, Decisions, Constraints, all Steps |
| [`/plumbbob:step`](#step) | `[what-changed]` | revise/sharpen the next step (empty input auto-syncs it to reality) |
| [`/plumbbob:build`](#build) | `[step-number \| step-range] [--auto]` | implement the next planned step, then verify it to the pause |
| [`/plumbbob:verify`](#verify) | none | the tick: check → self-review → validate → **PAUSE** → checkpoint |
| [`/plumbbob:park`](#park) | `[idea]` | capture a mid-build idea without chasing it |
| [`/plumbbob:status`](#status) | none | orient: where you are, the next step, the next move |
| [`/plumbbob:harvest`](#harvest) | none | triage parked ideas at a boundary (blocker / tangent / pivot) |
| [`/plumbbob:finish`](#finish) | none | write the report, make the final commit, clear for a fresh goal |
| [`/plumbbob:refine`](#refine) | `[focus]` | attack the plan for holes, or repair a drifted one |
| [`/plumbbob:revert`](#revert) | `[--to <step>]` | rewind: `git reset --hard` to a recorded checkpoint |
| [`/plumbbob:abandon`](#abandon) | none | drop the in-flight step, keep its work in the tree; the step stays planned |
| [`/plumbbob:spike`](#spike) | `<slug> \| done` | throwaway worktree experiment for a fork the plan can't settle |
| [`/plumbbob:recover`](#recover) | `[--fix]` | reconcile the session's own state when the dashboard looks wrong |
| [`/plumbbob:doctor`](#doctor) | none | check the install from inside a session |

## The loop skills

### plan

Frames a fresh goal and authors the **complete** plan before any code. It disambiguates
its input itself: no argument runs an interview, a file path (or an `@`-mention) absorbs
an out-of-band spec, any other text is expanded as inline intent. Under the hood it runs `plumbbob start`
(recording the baseline), fills the build's `intent.md` (Frame, Decisions, Constraints,
and **all** Steps, each with a done-when, a seam, and (where the signal is clear) an
advisory `model:` recommendation naming the smallest model that can carry the step) and
commits the plan on its own
(`plumbbob checkpoint --plan`), so the first step's diff stays clean. It writes intent
only, never source. If the build will lean on user-authored agents it also offers to
author `harness.json` beside `intent.md`: the per-step [slot bindings](#the-harness-slots)
reviewed at the same plan pause. At that pause it gives the framed plan a cold read (one
adversarial pass under refine's lens, surfacing without appending) and writes the result
into `.plumbbob/detail.md` as the recommendation `plumbbob handoff --plan` prints last:
`Approve it`, or `Sharpen <the worst hole> first`, naming `/plumbbob:refine` when the read
found more than one. Reach for it whenever there is no active session and a goal worth
more than a one-liner.

> **Passing a spec:** a plain path is the surest form (`/plumbbob:plan specs/foo.md`). An
> `@`-mention works too, but only with leading text (`/plumbbob:plan absorb @specs/foo.md`):
> Claude Code doesn't recognize a slash command whose *sole* argument is an `@`-mention,
> so `/plumbbob:plan @specs/foo.md` silently drops to a plain message. Prefer the path.

### step

Revises the **next undone step** just-in-time: the steps were all planned up front, so
this is a sharpening tool, not where steps are born. Fired bare, it re-reads what the
build has already taught you and syncs the step's done-when and seam to reality; given
`<what-changed>`, it makes that directed revision (tighten, re-cut, split, or add a step).
One step at a time, written back into `## Steps` only on your approval. It can also sharpen
that step's [harness bindings](#the-harness-slots) just-in-time when the agents it wants
have drifted. Most steps need nothing; skip straight to `/plumbbob:build`.

### build

The bundled executor: the default engine, not the only one. It's **swappable**:
implement a step any other way and run `/plumbbob:verify` instead. Fired bare it picks the next undone step (a number jumps); it reads
the step's done-when, seam, Decisions, and Constraints, goes in-flight
(`plumbbob build <n>`), implements *only that step*, then carries straight through the
verify tick to the pause. When the step is [bound to agents](#the-harness-slots) it runs
the `before`-slot ones for context, delegates the diff to a `build`-slot agent if one is
bound, and fires an agent mid-build when a manifest's `when` prose calls for it. `--auto`
lets the agent self-approve and chain step after step until the plan is done, halting the
moment a check goes red, the self-review finds a mismatch, or a bound agent returns
`blocked`/`drift`. A step range like `1-3` is a bounded `--auto`: it self-approves
through step 3, then pauses. At the pause it writes its judgment into `.plumbbob/detail.md`,
runs `plumbbob handoff`, and pastes the block; you reply with one of the four moves the
block names (`looks good`, `expand`, a direction, `revert`), and on `looks good` the
checkpoint prints the boundary block for it to relay.

### verify

The tick itself, executor-agnostic: run the heavy gate (`plumbbob check`), self-review the
diff against done-when / Decisions / Constraints, validate the done-when with evidence,
**PAUSE** for your approval, and only then checkpoint (`plumbbob checkpoint`: commit,
record the SHA, flip the step to `[x]`). Any `after`-slot [agents](#the-harness-slots)
run here too, as **advisory input** to the self-review; checkride gates, they never do.
It reads the *diff, not the author*: a step you wrote by hand or vibed in another harness
verifies exactly like a `/plumbbob:build` step. The pause it reaches is the same block,
rendered the same way, and the one file it writes is the detail file, never the diff
under review.

### park

Captures a mid-build "ooh, what if" without chasing it. Give it the idea inline or fire it
bare to use the one you just raised; it composes a single tidy, tagged line, shows it for
a quick OK, then appends it via `plumbbob park`, never by editing the file itself, and
relays the verb's two lines: the capture, and the pointer back at the step in flight. The
step stays protected; the list gets triaged later by `/plumbbob:harvest`.

### status

The orientation move: a thin trigger for `plumbbob status`. Prints the dashboard (title,
phase, the step list with the next step's done-when, seam, and advisory model
recommendation, last checkpoint, parked and open-question counts) and names the single
next move. The model line is the plan's suggestion of the smallest model that can carry
the next step: switch before building, or ignore it; guidance, never a gate. Read-only;
fire it any time you lose the thread.

### harvest

Triage, at a **boundary** only, never mid-step. Walks the park list and proposes exactly
one class per item: **blocker** (the plan was wrong; fold into intent and handle now),
**tangent** (different, not clearly better: the default; defer or kill), or **pivot
signal** (the approach is wrong; stop and replan). You call each one; confirmed items are
recorded under `## Harvest` and a confirmed blocker is folded into `intent.md`.

### finish

The close-out. Writes `report.md` into the build folder (what shipped, the decisions and
why, how parked items were classified, the deferred tangents), then runs `plumbbob finish`
for the final commit and the control-state clear. Report by default, no gate; the tracked
build folder stays put and rides the branch into the PR.

## The harness slots

Four of the loop skills know about **user-authored agents**: any executable that speaks
plumbbob's subprocess envelope (the contract for authors is `docs/agents.md`). A build
opts in by carrying a `harness.json`
beside its `intent.md`, binding agents to a step's three lifecycle slots:

- **`before`**: runs at build time before you write code; its envelope is *context in*.
- **`build`**: authors the step's diff in your place (still verified the same way, [D3 (author-blind-executor)](decisions.md#d3)).
- **`after`**: runs at the verify pause as *advisory* review; it informs, it never gates.

`/plumbbob:plan` authors the bindings at plan time and `/plumbbob:step` sharpens them just-in-time;
both keep the file **bindings + prose only, never a conditional** ([C3 (bindings-not-logic)](decisions.md#c3)). The file says
*which* agent; *when* to fire one mid-build is judgment the host model makes by reading
each manifest's `when` prose and a step's `note`. `/plumbbob:build` runs the `before`/`build`
slots and `/plumbbob:verify` runs `after`; either surfaces a non-`done` envelope by its status:
`blocked` (the agent couldn't finish: surface its notes, unblock, re-run) or `drift` (the
plan no longer matches reality: repair it with `/plumbbob:refine` first). No agent can advance
the loop: checkride gates and the human is the clock, by construction. The full contract
for authors lives in `docs/agents.md`; `plumbbob status` lists a build's bindings.

## The power moves

### refine

Keeps `intent.md` honest, in two modes. **Attack**: a cold, adversarial read of the Frame
and Decisions that surfaces holes as one-line **Open questions**, never as Decisions,
because resolving a hole is your call. **Repair**: when the plan has drifted from what the
code actually does, it proposes the edits that bring it back, before/after, written only
on your approval. Where `/plumbbob:step` sharpens one step, refine works the whole plan.
The plan pause's cold read is refine's tip: it surfaces the worst hole and names refine
for the rest, so the full attack stays optional and arrives when the read says it would
pay. Refine is where the real adversary looks; the cold read is an estimate.

### revert

The undo: a human-triggered driver for `plumbbob revert`. Resets `--hard` to the last
recorded checkpoint (or `--to <step>`, or the baseline as fallback), snapshotting the
build folder across the reset so park lines and intent edits survive. Untracked files
inside the seam are removed; everything outside it is left alone. To drop the step
while keeping its work, reach for [`abandon`](#abandon) instead.

### abandon

The third exit from an in-flight step. [`verify`](#verify) lands the step and
[`revert`](#revert) destroys its work; `/plumbbob:abandon` (a driver for `plumbbob
abandon`) drops the attempt and keeps the working-tree diff exactly where it is
([D79 (abandon-keeps-work)](decisions.md#d79)). It clears only the in-flight markers and
appends an abandon line to the build log: no reset, no commit, no edit to the plan, so
the step keeps its `[ ]` and stays re-buildable, with the diff yours to keep, rework, or
commit by hand. A step exit is a boundary crossing, so it honors the same approval latch
as `checkpoint`.

### spike

For a genuine fork the plan can't settle on paper: `/plumbbob:spike <slug>` opens a throwaway
sibling worktree and branch per option (`spike/<slug>-a`, `-b` by default) outside the
repo; `/plumbbob:spike done` tears them all down. The deliverable is the **verdict** recorded
back in `intent.md`, not the spike code.

### recover

For when the dashboard and reality disagree: a driver for `plumbbob recover`. It reads the
session's own state as a set and says whether it is telling the truth: does the active-build
cursor still point at a build that exists (one that doesn't makes `status` render an *empty
dashboard* rather than refuse), is the phase readable (a spike and a step both in flight, or
a step number the plan no longer contains), and is anything left over from a step that never
finished (an orphaned agent handoff ledger, a stranded latch stamp, a self-approval grant
nothing will clear). Those are what a crash, a lost context window, or a build switched away
mid-step leave behind.

It reports by default and repairs only when you ask: `/plumbbob:recover --fix` rewrites the
stale untracked control files and nothing else: no intent, no build log, no checkpoints, no
git. Leftover spike worktrees are named with their removal commands but never deleted, since
they sit outside the repo and may hold the only copy of what the spike learned. Recovering
reconciles bookkeeping; it never restores lost work (that is [`revert`](#revert), and it is
destructive by design).

## Install

### doctor

Diagnoses the install from inside a session (a thin trigger for `plumbbob doctor`): is the
plugin linked, are the skills and hook present, is there a marketplace/skills-dir
collision, does the repo carry a legacy sidecar, and how the check gate will resolve. On a
**marketplace** install this is the only way to reach `doctor` (the CLI is on PATH only
inside a session).

---

*The narrative version of the loop is [`happy-path.md`](happy-path.md); the methods behind
each skill are in [`techniques.md`](techniques.md); the CLI verbs these skills shell out
to are in [`cli-reference.md`](cli-reference.md).*
