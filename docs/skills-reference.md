# Skills reference

The twelve `/pb-*` skills are the surface you actually drive — the CLI underneath
([`cli-reference.md`](cli-reference.md)) is what they shell out to. This page is the
reference for that surface: what each skill is for, what it takes, what it reads and
writes, and when to reach for it.

Two ground rules apply to all of them:

- **You fire every move.** Every skill is `disable-model-invocation` — the model never
  invokes one on its own, and `/pb-status` always names your next one.
- **Short form.** Claude Code namespaces the skills under the plugin, so the real command
  is `/plumbbob:pb-plan`; these docs write `/pb-plan` for readability.

## At a glance

| Skill | Takes | Does |
|-------|-------|------|
| [`/pb-plan`](#pb-plan) | `[spec-path \| intent]` | open the session and author the whole plan — Frame, Decisions, Constraints, all Steps |
| [`/pb-step`](#pb-step) | `[what-changed]` | revise/sharpen the next step (empty input auto-syncs it to reality) |
| [`/pb-build`](#pb-build) | `[step-number] [--auto]` | *(optional)* implement the next planned step, then verify it to the pause |
| [`/pb-verify`](#pb-verify) | — | the tick — check → self-review → validate → **PAUSE** → checkpoint |
| [`/pb-park`](#pb-park) | `[idea]` | capture a mid-build idea without chasing it |
| [`/pb-status`](#pb-status) | — | orient — where you are, the next step, the next move |
| [`/pb-harvest`](#pb-harvest) | — | triage parked ideas at a boundary (blocker / tangent / pivot) |
| [`/pb-finish`](#pb-finish) | — | write the report, make the final commit, clear for a fresh goal |
| [`/pb-refine`](#pb-refine) | `[focus]` | attack the plan for holes, or repair a drifted one |
| [`/pb-revert`](#pb-revert) | `[--to <step>]` | recover — `git reset --hard` to a recorded checkpoint |
| [`/pb-spike`](#pb-spike) | `<slug> \| done` | throwaway worktree experiment for a fork the plan can't settle |
| [`/pb-doctor`](#pb-doctor) | — | check the install from inside a session |

## The loop skills

### pb-plan

Frames a fresh goal and authors the **complete** plan before any code. It disambiguates
its input itself: no argument runs an interview, a file path absorbs an out-of-band spec,
any other text is expanded as inline intent. Under the hood it runs `plumbbob start`
(recording the baseline), fills the build's `intent.md` — Frame, Decisions, Constraints,
and **all** Steps, each with a done-when and a seam — and commits the plan on its own
(`plumbbob checkpoint --plan`), so the first step's diff stays clean. It writes intent
only, never source. If the build will lean on user-authored agents it also offers to
author `harness.json` beside `intent.md` — the per-step [slot bindings](#the-harness-slots)
reviewed at the same plan pause. Reach for it whenever there is no active session and a
goal worth more than a one-liner.

### pb-step

Revises the **next undone step** just-in-time — the steps were all planned up front, so
this is a sharpening tool, not where steps are born. Fired bare, it re-reads what the
build has already taught you and syncs the step's done-when and seam to reality; given
`<what-changed>`, it makes that directed revision (tighten, re-cut, split, or add a step).
One step at a time, written back into `## Steps` only on your approval. It can also sharpen
that step's [harness bindings](#the-harness-slots) just-in-time when the agents it wants
have drifted. Most steps need nothing — skip straight to `/pb-build`.

### pb-build

The bundled executor, and **optional** — implement a step any other way and run
`/pb-verify` instead. Fired bare it picks the next undone step (a number jumps); it reads
the step's done-when, seam, Decisions, and Constraints, goes in-flight
(`plumbbob build <n>`), implements *only that step*, then carries straight through the
verify tick to the pause. When the step is [bound to agents](#the-harness-slots) it runs
the `before`-slot ones for context, delegates the diff to a `build`-slot agent if one is
bound, and fires an agent mid-build when a manifest's `when` prose calls for it. `--auto`
lets the agent self-approve and chain step after step until the plan is done, halting the
moment a check goes red, the self-review finds a mismatch, or a bound agent returns
`blocked`/`drift`.

### pb-verify

The tick itself, executor-agnostic: run the heavy gate (`plumbbob check`), self-review the
diff against done-when / Decisions / Constraints, validate the done-when with evidence,
**PAUSE** for your approval, and only then checkpoint (`plumbbob checkpoint` — commit,
record the SHA, flip the step to `[x]`). Any `after`-slot [agents](#the-harness-slots)
run here too, as **advisory input** to the self-review — checkride gates, they never do.
It reads the *diff, not the author* — a step you wrote by hand or vibed in another harness
verifies exactly like a `/pb-build` step.

### pb-park

Captures a mid-build "ooh, what if" without chasing it. Give it the idea inline or fire it
bare to use the one you just raised; it composes a single tidy, tagged line, shows it for
a quick OK, then appends it via `plumbbob park` — never by editing the file itself. The
step in flight stays protected; the list gets triaged later by `/pb-harvest`.

### pb-status

The orientation move — a thin trigger for `plumbbob status`. Prints the dashboard (title,
phase, the step list with the next step's done-when and seam, last checkpoint, parked and
open-question counts) and names the single next move. Read-only; fire it any time you lose
the thread.

### pb-harvest

Triage, at a **boundary** only — never mid-step. Walks the park list and proposes exactly
one class per item: **blocker** (the plan was wrong; fold into intent and handle now),
**tangent** (different, not clearly better — the default; defer or kill), or **pivot
signal** (the approach is wrong; stop and replan). You call each one; confirmed items are
recorded under `## Harvest` and a confirmed blocker is folded into `intent.md`.

### pb-finish

The close-out. Writes `report.md` into the build folder — what shipped, the decisions and
why, how parked items were classified, the deferred tangents — then runs `plumbbob finish`
for the final commit and the control-state clear. Report by default, no gate; the tracked
build folder stays put and rides the branch into the PR.

## The harness slots

Four of the loop skills know about **user-authored agents** — any executable that speaks
plumbbob's subprocess envelope (the contract for authors is `docs/agents.md`). A build
opts in by carrying a `harness.json`
beside its `intent.md`, binding agents to a step's three lifecycle slots:

- **`before`** — runs at build time before you write code; its envelope is *context in*.
- **`build`** — authors the step's diff in your place (still verified the same way, [D3](decisions.md#d3)).
- **`after`** — runs at the verify pause as *advisory* review; it informs, it never gates.

`/pb-plan` authors the bindings at plan time and `/pb-step` sharpens them just-in-time —
both keep the file **bindings + prose only, never a conditional** ([C3](decisions.md#c3)). The file says
*which* agent; *when* to fire one mid-build is judgment the host model makes by reading
each manifest's `when` prose and a step's `note`. `/pb-build` runs the `before`/`build`
slots and `/pb-verify` runs `after`; either surfaces a non-`done` envelope by its status —
`blocked` (the agent couldn't finish: surface its notes, unblock, re-run) or `drift` (the
plan no longer matches reality: repair it with `/pb-refine` first). No agent can advance
the loop — checkride gates and the human is the clock, by construction. The full contract
for authors lives in `docs/agents.md`; `plumbbob status` lists a build's bindings.

## The power moves

### pb-refine

Keeps `intent.md` honest, in two modes. **Attack**: a cold, adversarial read of the Frame
and Decisions that surfaces holes as one-line **Open questions** — never as Decisions,
because resolving a hole is your call. **Repair**: when the plan has drifted from what the
code actually does, it proposes the edits that bring it back, before/after, written only
on your approval. Where `/pb-step` sharpens one step, refine works the whole plan.

### pb-revert

The undo — a human-triggered driver for `plumbbob revert`. Resets `--hard` to the last
recorded checkpoint (or `--to <step>`, or the baseline as fallback), snapshotting the
build folder across the reset so park lines and intent edits survive. Untracked files
inside the seam are removed; everything outside it is left alone.

### pb-spike

For a genuine fork the plan can't settle on paper: `/pb-spike <slug>` opens a throwaway
sibling worktree and branch per option (`spike/<slug>-a`, `-b` by default) outside the
repo; `/pb-spike done` tears them all down. The deliverable is the **verdict** recorded
back in `intent.md`, not the spike code.

## Install

### pb-doctor

Diagnoses the install from inside a session — a thin trigger for `plumbbob doctor`: is the
plugin linked, are the skills and hook present, is there a marketplace/skills-dir
collision, does the repo carry a legacy sidecar, and how the check gate will resolve. On a
**marketplace** install this is the only way to reach `doctor` (the CLI is on PATH only
inside a session).

---

*The narrative version of the loop is [`happy-path.md`](happy-path.md); the methods behind
each skill are in [`techniques.md`](techniques.md); the CLI verbs these skills shell out
to are in [`cli-reference.md`](cli-reference.md).*
