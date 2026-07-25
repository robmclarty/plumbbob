---
name: build
description: The default engine — read the next planned step from intent, implement it (its done-when, seam, Decisions, Constraints), then verify it through to the approval pause. Swappable — build by hand/vibed/another harness and run /verify instead. `--auto` self-approves and chains to done; a step range like `1-3` self-approves through step 3, then pauses.
argument-hint: "[step-number | step-range] [--auto]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob build:*), Bash(plumbbob handoff:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(plumbbob park:*), Bash(plumbbob agent:*), Bash(plumbbob spike:*), Bash(git diff:*)
---

# PlumbBob — build a step (the default engine)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

This is the **bundled executor** — the default engine, not the only one. It is
**swappable**: you can implement any step by hand, in a vibe session, or with
another harness and go straight to `/verify` instead — plumbbob does not care how
the diff appeared. When you do run it, it reads the plan, writes the step, and
carries straight through to the verify pause.

Since `/plan` lays down the whole step list up front, the happy path is to fire
`/build` once per step until done — each run builds the next undone step and stops
at the pause for your approval. **Re-firing `/build` is itself the clock tick.**

A model note: this skill **inherits the session model** — nothing pins or switches
it. If the step you're about to build carries a `- model:` recommendation that
differs from the model you're running as, say so before implementing — the human can
`/model` and re-fire to honor it, or wave you on. Advisory, never a gate.

## What this skill does, in order

1. **Pick the step.** Use the number you were invoked with (e.g. `/build 4`) — or,
   if you were given a range like `/build 1-3`, start at the first number and treat
   the second as the auto-approve ceiling (see the range note under `--auto`). With no
   argument, don't resolve the next step yourself — the CLI does: bare `plumbbob build`
   (step 2) enters the next undone step and refuses with a `/step` nudge when every
   step is checkpointed.
2. **Enter the step.** Run `plumbbob build <n>` — or bare `plumbbob build` to enter the
   next undone step (records the in-flight STEP + SEAM so `/status` shows the step in
   flight; the seam is awareness, not a lock).
   - **Spike-as-step.** If the step's title opens with `spike:` / `Spike:`, the increment
     *is* the experiment — resolving a fork the plan couldn't settle on paper. After
     entering it, run `plumbbob spike report "<slug>"` (the CLI scaffolds a
     `spike-NN-<slug>.md` in the build folder, stamped `via: step <n>`), then work the
     experiment and record your **Findings** and **Verdict** there. A recorded verdict is
     what the step's done-when should check — the report, not just the code, is the
     deliverable. This is the same artifact `/spike` produces for a mid-build fork (D70).
3. **Read the plan.** Read the step's **done-when**, its **seam**, and the
   **Decisions** and **Constraints** in `intent.md`. Build to *that* — the deciding
   already happened, off the chat.
   - **Bound `before`-agents load context first.** If `plumbbob status` shows a
     `harness bindings:` block, this build binds agents — see **§ Running bound agents**
     and load their context in before you write. No bindings, no harness: just build.
4. **Implement** the step, and only that step, staying within the declared seam. A
   new problem or "ooh what if" that surfaces mid-build is a park, **not** an edit:
   capture it by running `plumbbob park "<one tidy line>"` — **saying "let's defer
   that" writes nothing; only the park line in the build log is a capture.** When the
   *human* hands you the tangent mid-build, their message **is** the approval to park
   it — capture it right away, say what you parked, and stay on the step. If you
   genuinely cannot finish without touching more than the seam, that is scope drift:
   surface it to the human rather than sprawling.
   - **Bound agents can shape the build.** If `plumbbob status` shows a
     `harness bindings:` block, a `build`-slot agent may author the diff, a `when`-cue may
     fire an agent mid-build, and a non-`done` envelope routes by its status — see
     **§ Running bound agents**.
5. **Verify, through to the pause.** Run the verify tick exactly as `/verify`
   does: `plumbbob check` (on red, read `.check/summary.json` and the failing slot's
   raw output under `.check/` for the actual diagnostics; while iterating on a fix,
   narrow the loop with `plumbbob check --bail --only <slots>` — the checkpoint gate
   still runs everything) → self-review the diff against the done-when, the Decisions,
   and the Constraints (a single structured read) → validate → **PAUSE
   for the human's approval** → only on approval, checkpoint with
   `plumbbob checkpoint <n> --body <<'BODY' … BODY` — a commit body **proportional to the
   step** (a line for a trivial change, a short paragraph for a meatier one; no TIL scan,
   no separate commit skill). The CLI owns the subject and appends this step to the
   build-log's `## Log`, so the history writes itself — you only supply the body (or omit
   `--body` for the deterministic done-when + seam + diffstat fallback). Do **not** bump
   the version or changelog — that is the human's `/version` call.
   - **A drifted subject is reconciled at the pause, never silently (D5/D6).** The planned
     title *is* the checkpoint subject (D1). If the diff drifted from it, **present** a
     corrected subject at the pause — `planned title → proposed subject`, one line — for
     explicit approval, and only on approval land it by adding `-m "<subject>"` to the
     checkpoint. Present nothing and the deterministic title-derived subject lands
     untouched: the reconcile is the human-approved exception, not a quiet `-m` swap (which
     is the agent-authored subject D68 refuses).
   - **If `plumbbob status` shows a `harness bindings:` block**, fold any bound
     `after`-agents into that self-review as advisory input — see **§ Running bound
     agents**.

   **The latch makes this pause real.** On the default (non-`--auto`) path you
   build the step and reach the pause *in one turn* — so under plumbbob's turn hook the
   checkpoint at the end of that turn is **refused** ("no human turn since this step
   began"), and that refusal **is** the pause working as designed. Do exactly what the
   pause asks: present the diff and the self-review, emit the closing block below, and
   **end the turn**. The human's next message — their approval — is the human turn that
   lets the checkpoint land: on that turn you run `plumbbob checkpoint <n>` (now allowed)
   and **stop at the boundary**. Landing the checkpoint is its own deliberate beat — the
   thing approval triggers — never a side effect of starting the next step, and
   `/build` only ever starts the *next* step. **Never route around a refusal with a
   raw `git commit`** — the work plane stays free, but the *record* is latched on purpose.

   **End every default build turn with the standardized hand-off block.** Run `plumbbob
   handoff` and present its output — it renders the same three-part shape (the state, the
   choice, what's next) straight from the session: step N built, the looks-good /
   needs-work choice, and the next undone step with its `- model:` recommendation. Show
   your diff and self-review above it. The CLI owns the block so it can't drift from what
   `/status` reports; you supply only the judgment above it. It already drops the model
   clause when the next step has none, and says so when no planned step remains — you
   don't reproduce the template by hand.

   **Then hand off with the next model.** Once the checkpoint lands in the approval turn,
   run `plumbbob handoff` again and relay its boundary block — with the step gone from
   in-flight it renders "step N checkpointed" and points at the next undone step, carrying
   that step's `- model:` recommendation (the plan's smallest-model-that-fits call) so the
   human knows which `/model` to select before firing `/build` again. It is what
   carries the plan's suggestion across a fresh context window, which inherits the session
   model, not the plan's. No `- model:` line means any model will do. Guidance, never a
   gate.

## Running bound agents

Skip this section unless `plumbbob status` shows a `harness bindings:` block. Nearly every
build binds **no** agents — for them the default path above is the whole story. When a
harness *is* bound, this is what each affected step gains, in lifecycle order.

- **`before` — load context in (step 3).** If the build's `harness.json` binds agents to
  this step's `before` slot, run `plumbbob agent run --step <n> --mode before` first: each
  returns a validated envelope on stdout that plumbbob also appends to the step's
  `handoff.json`, and its `summary`/`body` become **context you read into the build** (that
  is the whole point of the slot — load the context in before you write). No binding, or no
  harness, is a clean no-op — just build.
- **`build` — delegate the diff (step 4).** If a `build`-slot agent is bound, run
  `plumbbob agent run --step <n> --mode build` and let that agent author the step's code
  instead of writing it yourself; its envelope reports what it did. You still own the verify
  tick — the diff is reviewed the same way whoever wrote it.
- **A manifest's `when` prose is your cue to fire an agent mid-build (step 4).** The three
  slots are the only *declarative* lifecycle points; there is no config for "a salient
  moment in the middle." That is judgment, and you are the frontier model in the room: when
  the work reaches the situation a bound agent's `when` (or a step `note`) describes, fire
  `plumbbob agent run <name> --step <n>` yourself. Prose is the orchestration language; you
  are the workflow engine.
- **Route a non-`done` envelope by its status (step 4).** An agent that returns `blocked`
  couldn't finish (missing input, failed precondition): surface its `notes`, let the human
  unblock, and re-run it — don't work around it. One that returns `drift` finished but found
  the plan no longer matches reality: **stop and send the human to `/refine`** to repair
  the plan before continuing, rather than building on a plan that's now wrong. A non-zero
  exit is a failed run: report it and stop.
- **`after` — advisory input to the verify tick (step 5).** After `plumbbob check`, run any
  bound `after`-agents (`plumbbob agent run --step <n> --mode after`) and fold their
  envelopes into the self-review as **advisory input** — they inform, they never gate
  (checkride gates, the human is the clock; an `after`-agent that could fail a step is the
  lock in autonomy's costume).

## `--auto` — let the agent be the clock (opt-in)

`/build --auto` is the explicit escape hatch when the human wants unattended
progress instead of approving each step. It does the same work, but **the agent reviews
and approves in the human's place**, and it **chains**:

- Build the next step, running its slots (see **§ Running bound agents**) in the same
  order as the default path: bound `before`-agents → implement (or the bound `build`-agent) → bound
  `after`-agents → `check` → self-review → **if the check is green AND the
  self-review finds no done-when / Decision / Constraint mismatch, checkpoint** and move
  straight on to the next planned step. Repeat. `--auto` adds no new machinery — the
  `after`-agent output simply feeds the *existing* self-review halt condition.
- **Stop and hand back to the human** the moment any of these is true: the check is red,
  the self-review finds a mismatch (surface exactly what, and do not checkpoint it), a
  bound agent returns `blocked` or `drift` (unblock-and-re-run, or `/refine` — an
  agent cannot advance the loop), a new decision is needed, no planned steps
  remain, or the top of a requested range is reached. **When `--auto` halts back to the
  human, give the same hand-off the default pause does** — run `plumbbob handoff` and
  relay its block: the step just completed, the next undone step, and that next step's
  `- model:` recommendation if it has one, so a fresh context window knows which `/model`
  to select.

`--auto` and a step range are the only paths that checkpoint without a human pause, and
only because the human asked for it by name; a range re-imposes the pause at its top.
The default — no flag, no range — always ends at the pause.

### A step range (`N-M`) is a bounded `--auto`

`/build 1-3` self-approves steps 1 through 3 exactly as `--auto` does, then **pauses
after step 3** instead of chaining to done. The range *is* the opt-in — you do not also
pass `--auto`. Run it as the `--auto` loop with one extra halt: **stop before building
any next step whose plan number is past the top of the range.** It adds no machinery —
just the one more entry already in the halt list above.

- **`N-M` with N ≤ M** — build N…M, self-approving and checkpointing each, then pause at
  M. `N-N` is just the single step `N` (which already ends at the pause).
- **N > M** (e.g. `3-1`) — that is not a range you can walk; report it and stop rather
  than guess the intent.
- **M past the last planned step** (e.g. `1-9` with three steps) — build through the
  last planned step and stop; that is the existing "no planned steps remain" halt, not
  an error.
- **A step inside the range won't build** (missing, or its seam won't parse) — `plumbbob
  build <n>` fails exactly as it always does; surface it and stop, the same as a red
  check. Do not skip past the gap.
- **N is above the next undone step** — you are jumping over earlier planned work; note
  that you are skipping the steps before N, then proceed (the same latitude as a
  single-number jump like `/build 4`).

## The hard contracts

- **Swappable, never required.** The loop works without this skill; `/verify`
  checkpoints a hand-built or vibed diff just the same.
- **Build the decided step, not a new one.** Implement what `intent.md` settled. A
  new idea mid-build is captured with `plumbbob park`, not an edit — a promise to
  defer writes nothing; the park line does.
- **Default ends at the pause.** Implement → verify → wait for approval; never
  checkpoint without it. Only an explicit `--auto` or a step range lets the agent approve
  in your place, and it still halts on a red check or any mismatch — a range also stops
  at its top.
- **Agents feed the beat; they never advance it**. `before` loads context,
  `build` writes the diff, `after` is advisory — none can checkpoint, flip a step, or
  chain. `blocked` → unblock and re-run; `drift` → `/refine`. You are still the one
  who verifies and (bar `--auto`) the human is still the clock. See **§ Running bound
  agents** for the mechanics.
- **A refused checkpoint is the pause, not an error.** Under plumbbob's turn
  hook a same-turn `checkpoint` is refused by design — present the diff and the closing
  block, **end the turn**; the human's approval on their next turn is what lets you land
  it, and landing it is a deliberate beat, not a side effect of the next `/build`.
  Never route around it with a raw `git commit`. An explicit `/build --auto` or a typed
  step range in the human's own prompt are the only self-approvals — **never write `auto`
  into a settings file yourself to unlock a checkpoint. A grant you mint is no grant (the
  latch ignores it since D67); ask the human to re-fire `/build --auto` instead.**
- **Close with the next model.** When a step lands, run `plumbbob handoff` and relay its
  block — it cites the completed step and the next undone step, and names that next step's
  `- model:` recommendation if it has one, which is what a fresh context window needs to
  pick the right `/model` before re-firing. Guidance, never a gate.
