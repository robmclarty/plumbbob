# Techniques — the methods behind the loop

Plumbbob is a small set of methods for building *with* an LLM while staying the one who
decides. This page is the **reference for those methods** — what each one is, the problem
it solves, and the file, command, or state that carries it. It is the middle layer of
three docs:

- [`attention-first-development.md`](attention-first-development.md) — the **why**:
  attention is the scarce resource, and the principles that follow from protecting it.
- **This page** — the **what and how**: each named technique, on its own.
- [`happy-path.md`](happy-path.md) — the **worked example**: every technique in one
  end-to-end cycle.

You drive everything from your editor with `/plumbbob:*` skills; each shells out to a small
`plumbbob` CLI you never type by hand. New here? Install from the
[README](../README.md), read [`happy-path.md`](happy-path.md) for the narrative, and keep
this page open to look up any piece by name.

## The one law

> **Vibe to execute, never vibe to decide.**

Every technique below serves this. Vibing — generating and reacting one prompt at a time —
is fine *once every decision being carried out was already made on a surface outside the
chat*. It turns into a slot machine only when deciding and executing fuse: when the design
is still being settled while code is already flowing. The methods exist to keep those two
apart.

## Externalize the plan onto two durable surfaces

The exhaustion of working with an LLM is a working-memory problem: you cannot *produce*
your own intent and *consume* the model's output in the same moment — consuming overwrites
producing. So the plan does not live in your head (the flood erases it) or in the chat
(it is ephemeral). It lives in two flat files under `.plumbbob/` that survive the flood.
**The chat is the hand; the docs are the head.**

- **`intent.md` — what you decided, before any code.** Your canonical intent: the Frame,
  the Decisions, the Constraints, the Steps, and any Open questions. When the model floods
  you, you read this page, not your memory.
- **`build-log.md` — the live ledger.** Where you are (Steps), what you parked (Park list),
  how you triaged it (Harvest), and the dated audit trail (Log).

Both are plain markdown you can edit by hand at any time. The skills author and maintain
them for you, but nothing is hidden — open the files and look.

## Decisions before code

The unit of work is a **decision, not a diff.** Progress is measured in choices resolved,
not lines generated; code is the *derived output* of settled decisions. `intent.md` is
structured to force that order:

- **Frame** — the problem in plain words: the **Problem**, the **smallest thing** that
  solves it, what **done looks like**, and what you are **explicitly NOT doing** (so scope
  cannot creep). You write this first, before any solution.
- **Decisions** — the settled calls, one line each, each with the *because* that mattered
  (`D1: in-memory bucket — because single instance today`). They are numbered so the rest
  of the plan and the verify pass can refer to them.
- **Constraints** — the hard rules the build must honor (`C1: no new dependencies`).
  `verify` and `refine` read the diff against these.
- **Open questions** — holes you could *not* settle on paper. They are never guessed into
  a Decision; an unresolved fork becomes a spike instead.

This is also what lets you look back and say the calls were yours: they were written down,
as decisions, before any code existed.

## Steps as small, verifiable increments

Under `## Steps`, the plan is a numbered list where **every step carries two things**: a
**done-when** and a **seam**.

```markdown
1. [ ] Add a token-bucket limiter — **done when:** `test/limiter.test.ts` passes
   - seam: `src/limiter.ts`, `test/limiter.test.ts`
```

- The **done-when** is a falsifiable criterion the verify pass can actually check — ideally
  a test or check result (`done when: the 6th request in 60s returns 429`).
- The **seam** is the exact set of paths the step will touch.

`/plumbbob:pb-plan` authors the **whole** list up front, so the happy path is to plan once and
build per step. Only **one step is in flight at a time.** Later steps may be fuzzier than
the first — that is fine; you sharpen the next one just-in-time with `/plumbbob:pb-step` (empty
input auto-syncs it to what the build has already taught you) right before you build it.

### The seam is awareness, not a lock

The seam is the step's declared blast radius. When you enter a step, the CLI records it in
`.plumbbob/SEAM` (and the step number in `STEP`) so the dashboard can show what is in
flight. In v1 the seam was *enforced* — edits outside it were refused. In **v2 it is
orientation only**: a label on the map, not a fence. It tells you and the model where the
step is supposed to live, so straying out of it is a visible signal rather than a silent
sprawl.

## The build loop and the verify tick

Plan once, then repeat one tick per step until the list is done. The tick — whether
`/plumbbob:pb-build` runs it or you run `/plumbbob:pb-verify` over your own edits — is always the
same five beats:

```text
check  →  self-review  →  validate  →  PAUSE  →  checkpoint
```

1. **Check** — run the heavy gate (`plumbbob check`). Red stops the tick; there is nothing
   to approve yet.
2. **Self-review** — read the diff against the step's done-when, the Decisions, and the
   Constraints in one structured pass. Surface every mismatch; fix nothing here.
3. **Validate** — state, yes or no, whether the done-when is met, with the evidence.
4. **Pause** — present all of it and **stop**, waiting for your explicit approval.
5. **Checkpoint** — *only after you approve* — commit the work, record the SHA, flip the
   step to `[x]`, and return to DESIGN.

### The pause is a clock, not a lock

The pause is the whole product. v1 enforced the deciding/executing boundary with a hard
file lock that *refused* edits in the wrong state; a determined model routed around it, so
its only product was forced ritual. v2 replaces that lock with a **clock**: nothing blocks
your edits, but the loop does a step's labor and then *pulls up to a line* — the verify
pause — and idles there until you approve. **Pull, not block.** You stay the decider not
because a wall refuses you, but because the system stops and waits for you to be the clock.
Re-firing the next build *is* the clock tick.

> **Unattended option — `--auto`.** `/plumbbob:pb-build --auto` lets the agent self-review and
> approve in your place, then chain to the next step until done. It halts the moment the
> check goes red or the self-review finds a mismatch. It is the one path that checkpoints
> without a human pause, and only because you asked for it by name.

### The pluggable executor reads the diff, not the author

`/plumbbob:pb-build` is *one* way to turn a planned step into code, and it is **optional**.
Implement a step by hand, in a vibe session, or with another harness, and run
`/plumbbob:pb-verify` instead — it runs the identical tick and **reads the diff, not who wrote
it.** Plumbbob is the harness-agnostic spine; how the diff appears is a slot you fill
however you like.

## Checkpoints and reverts as the safety net

A **checkpoint** is one commit per verified step. `plumbbob start` records the baseline
HEAD, and each checkpoint appends `step N <git-sha>` to `.plumbbob/checkpoints`. The git
footprint is **additive only**: cheap markers (`plumbbob: step n done`) on your feature
branch that your normal squash-merge collapses at PR time. Plumbbob never rewrites pushed
history.

**Revert** is the undo. `/plumbbob:pb-revert` does a `git reset --hard` to the last checkpoint
(or `--to <n>` for a specific step, with the baseline as the fallback), discarding the
half-done step. It is careful about two things:

- **Your plan survives.** The `.plumbbob/` sidecar is git-excluded and explicitly preserved
  across the reset, so park lines and intent edits made during the step are not lost.
- **Only the step's work is removed.** Untracked files *inside the seam* are cleaned up;
  files outside it are left alone.

## Capture, don't chase — park and harvest

Attention has momentum, and breaking focus to chase a new idea costs far more than the idea
is worth in the moment. So mid-step ideas are **captured, not acted on.**

- **Park** (`/plumbbob:pb-park`) composes one tidy, tagged line and appends it to the Park
  list in `build-log.md` — then you go straight back to the step. Capture is the only thing
  that happens; the idea is out of your head and the step in flight stays protected.
- **Harvest** (`/plumbbob:pb-harvest`) runs at a **step boundary** — back in DESIGN, never
  mid-step — and triages the list. Each item gets exactly one class:

| Class | Meaning | Action |
|-------|---------|--------|
| **blocker** | the plan was wrong or incomplete; cannot proceed | fold into `intent.md`, handle now |
| **tangent** | a different path, not clearly better — the default | defer or kill |
| **pivot signal** | real evidence the whole approach is wrong | stop and replan |

You call each one; the skill only proposes. Almost everything that *feels* like a pivot is
a tangent — require a failed assumption, not a shinier idea, before you pivot.

## Spikes — when the design will not settle

Some forks cannot be decided on paper. A **spike** is a throwaway experiment for exactly
that. `/plumbbob:pb-spike <slug>` creates a sibling git worktree and branch per option
(`spike/<slug>-a`, `spike/<slug>-b` by default) *outside* the repo, where you try each fork
in isolation while the main tree stays put; `/plumbbob:pb-spike done` removes every spike
worktree and branch and returns you to DESIGN. The point is not the code you write in there
— it is the **verdict**: which option won and why, recorded back in `intent.md` before you
build for real.

## Refine — keep intent true

`intent.md` is only useful while it is honest. `/plumbbob:pb-refine` keeps it that way, in two
modes:

- **Attack** — give the Frame and Decisions a cold, adversarial read and surface holes:
  ambiguities, unhandled edge cases, hidden assumptions, collisions with existing code.
  Each becomes a one-line **Open question** — never a Decision, because resolving a hole is
  your convergence, not the model's.
- **Repair** — when the plan has drifted from what the code actually does, propose the edits
  that bring it back in line, shown before/after and written only on your approval.

Where `/plumbbob:pb-step` sharpens the *next step*, `refine` works the *whole plan*. Reach for
it right after planning to stress-test a fresh frame, or mid-build when a blocker rewrites
the design.

## Position is derived, not stored

There is no stored state machine. The phase the dashboard shows is *derived* from what is
on disk:

- **DESIGN** — at a boundary: planning, reviewing, or between steps (no step in flight).
- **BUILD** — a `STEP` file is present, so a step is in flight.
- **SPIKE** — the `SPIKE` marker is present: experimenting in throwaway worktrees.

The phase **gates nothing.** It is computed by `/plumbbob:pb-status` to tell you where you
are and what to do next; it is a position on a map, not a locked door. `.plumbbob/STATE`
itself is just the session sentinel — its presence means a session is live. `status` is the
move you fire any time you are unsure — it prints the dashboard (the intent, the step list,
the parked and open-question counts) and names the single next move.

## Two tiers of checks

The checks come in two tiers with different jobs:

- **Light** — the `post-edit` hook: a non-blocking, file-scoped lint pass that runs after
  each edit and injects any findings into the model's context so it self-corrects in flow.
  It never blocks an edit, and it exists because the model cannot see your editor's LSP — so
  the light tier *serves the model*. It is session-gated: a repo with no `.plumbbob/STATE`
  behaves like plain Claude Code.
- **Heavy** — the full project check (in this repo, `pnpm check`: tsc, oxlint, ast-grep,
  vitest, knip, markdownlint), configurable per repo in `.plumbbob/config`. It is **not** a
  hook; it runs *inside* the verify tick, which refuses to checkpoint while it is red. The
  hard gate lives on the deliberate boundary, not on every keystroke.

## Calibration — size the process to the work

Ceremony destroys attention too, so the amount of process scales with the work. Knowing how
much a task deserves is itself the skill; when in doubt, smaller.

- **Tiny** (a typo, a one-liner) — no session. Just fix it.
- **Small** (a contained bug or change) — a short Frame, two or three decisions, one or two
  steps; build, verify, checkpoint.
- **Medium** (a feature touching a few modules) — the full loop above.
- **Large or architectural** — out of scope for Plumbbob; that is a job for a fully
  autonomous build.

## Wrap — close out without ceremony

When the goal is done, `/plumbbob:pb-wrap` ends the build. It writes a `report.md` **by
default** — what shipped, the decisions and why, what was parked and how it was classified,
the final status, and the deferred tangents that become future work — but there is **no
refuse-without-report gate**; guidance offers the artifact, it does not wall the exit. Then
`plumbbob wrap` archives `intent.md`, `build-log.md`, and `report.md` into a dated folder
under `.plumbbob/archive/` and clears the sidecar for the next goal. **Archive-then-clear,
never destroy** — and git is never touched.

## Where each technique lives

Every method maps to a skill you fire, the mechanical verb it shells (if any), and the
artifact it reads or writes. The skills are all `disable-model-invocation`, so *you* fire
every move and `/plumbbob:pb-status` always names the next one.

| Technique | Skill | CLI verb | Artifact / state |
|-----------|-------|----------|------------------|
| Frame and plan the goal | `/plumbbob:pb-plan` | `plumbbob start` | `intent.md`, session opened |
| Sharpen the next step | `/plumbbob:pb-step` | — (edits markdown) | `intent.md` `## Steps` |
| Stress-test or repair the plan | `/plumbbob:pb-refine` | — (edits markdown) | `intent.md` |
| Build a step | `/plumbbob:pb-build` | `plumbbob build` | `SEAM`, `STEP` (in-flight) |
| Verify and checkpoint | `/plumbbob:pb-verify` | `plumbbob check`, `plumbbob checkpoint` | `checkpoints` |
| Orient | `/plumbbob:pb-status` | `plumbbob status` | reads everything |
| Capture an idea | `/plumbbob:pb-park` | `plumbbob park` | `build-log.md` Park list |
| Triage parked ideas | `/plumbbob:pb-harvest` | — (edits markdown) | `build-log.md` Harvest |
| Experiment on a fork | `/plumbbob:pb-spike` | `plumbbob spike` | worktrees, `SPIKE` marker |
| Undo a step | `/plumbbob:pb-revert` | `plumbbob revert` | `git reset`, `checkpoints` |
| Close out the goal | `/plumbbob:pb-wrap` | `plumbbob wrap` | `.plumbbob/archive/` |

---

*New to Plumbbob? Install from the [README](../README.md), read
[`happy-path.md`](happy-path.md) to see one full cycle, and keep this page as the reference
for any piece you want to understand. The philosophy underneath — attention as the scarce
resource — is in [`attention-first-development.md`](attention-first-development.md).*
