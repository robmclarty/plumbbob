# Plumbbob

A manual, attention-first process for building software *with* an LLM instead of
being dragged behind one. The layer below Ridgeline: where Ridgeline runs
autonomously without you, Plumbbob keeps you in the driver's seat for the small-
to-medium work that doesn't justify a full autonomous build — a feature, a bug, a
refactor — while staying deliberate rather than vibing.

> Ridgeline is the line. Plumbbob establishes *true* before you build.
> The LLM is a hand, not a head.

## The one law

**Vibe to execute, never vibe to decide.**

Vibing is fine — *once every decision being carried out was already made on a
surface outside the chat.* It becomes a slot machine only when the deciding
happens inside the stream while code is flowing. The whole job of Plumbbob is to
keep decisions and execution from fusing:

- The **human** owns convergence. You decide, choose, pick the branch.
- The **LLM** owns divergence in design (finding holes, generating options) and
  convergence *only* in build (executing a decided step).
- The **boundary** between deciding and executing is held by a **pause you
  advance**, not a wall that refuses you.

If you feel tired and lost, those two activities have fused again. The fix is
never "prompt better." It's "stop, leave the chat, go decide, come back."

## Why it works: get the plan out of your head

The exhaustion is a working-memory problem. You can't *produce* intent and
*consume* the model's output at once — consuming overwrites producing. So
Plumbbob externalizes your plan onto two flat files that survive the flood:

- `intent.md` — what you decided, before any code. Your canonical intent.
- `build-log.md` — the live ledger of steps, parked ideas, and decisions.

When the model floods you, you read the page, not your memory. The chat is
ephemeral; the docs persist. **The chat is a hand; the docs are the head.**

## A clock, not a lock

Plumbbob v1 enforced the deciding/executing boundary with a hard file lock — a
pre-edit muzzle that *refused* code edits unless you were in the right state. It
provided no real security (a determined model routed around it), so its only
product was forced ritual: you had to "undo plumbbob" to make a simple edit.

v2 replaces the lock with a **clock**. Nothing blocks your edits. Instead, the
system does a step's labor and then **stops and waits for you to advance**. You
stay the decider not because a wall refuses you, but because the loop pulls up to
a line — the verify pause — and idles there until you approve. Pull, not block.
The pause *is* the product; it is the moment your judgment enters, and it cannot
be skipped.

## STATE is orientation, not a gate

The current position lives in one word in `.plumbbob/STATE` — `DESIGN`, `BUILD`,
or `SPIKE`. It no longer gates anything. It is read by `/pb-status` to tell you
where you are and what to do next; a wrong state is a mislabeled position on a
map, not a locked door. You almost never set it by hand — it is a side effect of
the moves you make.

## The eight skills

You drive the whole loop from your IDE with eight `pb-*` skills — no step numbers
to remember, no raw CLI to type. Each is `disable-model-invocation`, so *you* fire
every move; the dumb `plumbbob` CLI is the mechanism they shell out to.

| Skill | Does |
|-------|------|
| `/pb-plan` | frame a goal — scaffold the session + author intent's Frame, Decisions, Constraints |
| `/pb-step` | plan the next increment — a title, a done-when, a seam |
| `/pb-build` | *(optional)* implement the planned step, then verify it to the pause |
| `/pb-verify` | the tick — check → self-review → validate → **PAUSE** → checkpoint |
| `/pb-park` | capture an idea without chasing it |
| `/pb-status` | orient — where you are, what's parked, and the next move |
| `/pb-harvest` | triage parked ideas at a boundary (blocker / tangent / pivot) |
| `/pb-reset` | close out — write the report, archive, clear for a fresh goal |

Three optional power moves survive for when you need them: `/pb-revert` (recover
to a checkpoint), `/pb-spike` (throwaway worktree experiment), and
`/plumbbob-interrogate` (attack the frame for holes).

## The loop

### Frame and plan — `DESIGN`

1. **Frame** *(you, on paper / TextEdit, chat closed)* — the problem, the smallest
   thing that solves it, what "done" looks like, what you are explicitly NOT
   doing. The slowness is the feature: it forms your model before the LLM's can
   colonize it. `/pb-plan` scaffolds the session and helps you write this into
   `intent.md`; the deciding stays yours.
2. **Plan a step** *(`/pb-step`)* — just-in-time, plan the *next* increment: a
   title, a done-when criterion `/pb-verify` can check, and a seam (the files it
   will touch). One at a time, as you reach them — `intent.md`'s Steps grow.

### Build — one verified step at a time

1. **Build** *(`/pb-build`, optional)* — implement the planned step. This is the
   bundled executor, and it is *optional*: implement by hand, in a vibe session,
   or with another harness, and skip straight to verify. Plumbbob does not care
   how the diff appeared.
2. **Verify** *(`/pb-verify`, the tick)* — run the check, self-review the diff
   against the step's done-when, the Decisions, and the Constraints, then **PAUSE
   for your approval.** This is the one human-convergence beat: you read the diff
   as an editor and say "yes, this matches what I intended." On approval it
   checkpoints. It reads the **diff, not the author** — manual, vibed, and
   `/pb-build` work all checkpoint the same way.
3. **Capture, don't chase.** Every new problem or "ooh what if" mid-step goes to
   the park list with `/pb-park`, untouched, and you go straight back to the step.
   Acting on ideas the instant they arrive is the disease.
4. **Harvest at the boundary.** After a step is checkpointed, `/pb-harvest` walks
   the park list and proposes a class for each item — **blocker** (the plan was
   wrong; fold into `intent.md`, handle now), **tangent** (different, not clearly
   better; defer or kill — the default), or **pivot signal** (the whole approach
   is wrong; stop and replan). You call each; harvested items stop counting.

### Spike — genuine forks only

For a real fork the design phase couldn't settle, `/pb-spike` runs a timeboxed
throwaway in a `git worktree` per option: compare, pick one, delete the rest,
record the verdict in `intent.md`. Accidental drift becomes a bounded experiment
with a forced end.

### Close out — `/pb-reset`

When the goal is done, `/pb-reset` writes the report by default (what shipped, the
decisions and why, what was parked and how it was harvested, final status, and the
deferred tangents that become future work), archives `intent.md`, `build-log.md`,
and `report.md` under `.plumbbob/archive/<date>-<slug>/`, and clears the sidecar
for the next goal. There is **no refuse-without-report gate** — guidance offers the
artifact instead of walling the exit. "Reset for the next task" means
archive-then-clear, never destroy.

## The one hook — light feedback

v2 ships a single, session-gated Claude Code hook: `post-edit.sh`, a non-blocking
`PostToolUse` pass that runs file-scoped lint on changed files and injects any
failures into the model's context so it self-corrects in flow. It never blocks an
edit. It exists only because Claude can't see your editor's LSP — the light tier
*serves the model*. (v1's pre-edit muzzle, seam-guard, and bash-guard are gone:
they only ever defended a lock that no longer exists.) Session-gated means a repo
with no `.plumbbob/STATE` behaves exactly like plain Claude Code.

## Gates — two tiers, different jobs

- **Light** — the non-blocking `post-edit` feedback above. Per changed file. Never
  blocks. Serves the model.
- **Heavy** — the full `pnpm check` (tsc, oxlint, ast-grep, vitest, knip,
  markdownlint). Not a hook: it runs *inside* `/pb-verify`, which refuses to
  checkpoint while red. The hard gate lives on the deliberate boundary, not the
  keystroke.

## Git footprint — additive only

Plumbbob commits cheap checkpoint markers (`plumbbob: step n done`) on your
feature branch and reverts to its own recorded SHAs. It **never rewrites pushed
history**; your normal squash-merge collapses the checkpoints at PR time. `start`
records the baseline HEAD; `revert [--to n]` does `git reset --hard` to a recorded
SHA; `reset` archives plain markdown and never touches git.

## The `.plumbbob/` folder

```
.plumbbob/
  STATE          # one word: DESIGN | BUILD | SPIKE — orientation, not a gate
  SEAM           # the in-flight step's declared paths (awareness, not a lock)
  STEP           # the in-flight step number
  checkpoints    # "step N <git-sha>", one per verified step
  intent.md      # canonical intent
  build-log.md   # live ledger
  archive/
    <date>-<slug>/
      intent.md
      build-log.md
      report.md
```

## Calibration: size everything to the work

The fastest way to abandon this is ceremony on a one-liner. The discipline is
*decisions before code*, not *always produce three files*.

- **Tiny** (typo, one-liner): no session. Just fix it.
- **Small** (a contained bug/change): `/pb-plan` a frame + 2–3 decisions; one or
  two steps; build → verify → checkpoint.
- **Medium** (a feature touching a few modules): the full loop above.
- **Large / architectural**: that's Ridgeline's job, not Plumbbob's.

Calibration is the skill. When in doubt, smaller.

## The shape, in one line

The human owns convergence; the LLM owns divergence in design and convergence only
in implementation; and the boundary between deciding and executing is a **pause
you advance**, not a lock you fight — the system does the labor and waits for you
to be the clock.
