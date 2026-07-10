---
name: pb-build
description: The default engine — read the next planned step from intent, implement it (its done-when, seam, Decisions, Constraints), then verify it through to the approval pause. Swappable — build by hand/vibed/another harness and run /pb-verify instead. `--auto` self-approves and chains to done; a step range like `1-3` self-approves through step 3, then pauses.
argument-hint: "[step-number | step-range] [--auto]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob build:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(plumbbob agent:*), Bash(git diff:*)
---

# PlumbBob — build a step (the default engine)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

This is the **bundled executor** — the default engine, not the only one. It is
**swappable**: you can implement any step by hand, in a vibe session, or with
another harness and go straight to `/pb-verify` instead — plumbbob does not care how
the diff appeared. When you do run it, it reads the plan, writes the step, and
carries straight through to the verify pause.

Since `/pb-plan` lays down the whole step list up front, the happy path is to fire
`/pb-build` once per step until done — each run builds the next undone step and stops
at the pause for your approval. **Re-firing `/pb-build` is itself the clock tick.**

A model note: this skill **inherits the session model** — nothing pins or switches
it. If the step you're about to build carries a `- model:` recommendation that
differs from the model you're running as, say so before implementing — the human can
`/model` and re-fire to honor it, or wave you on. Advisory, never a gate.

## What this skill does, in order

1. **Pick the step.** Use the number you were invoked with (e.g. `/pb-build 4`) — or,
   if you were given a range like `/pb-build 1-3`, start at the first number and treat
   the second as the auto-approve ceiling (see the range note under `--auto`). With no
   argument, take the next undone, planned step in `.plumbbob/intent.md`. If there is no
   planned step to build, stop and tell the human to `/pb-step` first.
2. **Enter the step.** Run `plumbbob build <n>` (records the in-flight STEP +
   SEAM so `/pb-status` shows the step in flight; the seam is awareness, not a
   lock).
3. **Read the plan.** Read the step's **done-when**, its **seam**, and the
   **Decisions** and **Constraints** in `intent.md`. Build to *that* — the deciding
   already happened, off the chat.
   - **Run any bound `before`-agents**. If the build's `harness.json` binds
     agents to this step's `before` slot, run `plumbbob agent run --step <n> --mode
     before` first: each returns a validated envelope on stdout that plumbbob also
     appends to the step's `handoff.json`, and its `summary`/`body` become **context you
     read into the build** (that is the whole point of the slot — load the context in
     before you write). No binding, or no harness, is a clean no-op — just build.
4. **Implement** the step, and only that step, staying within the declared seam. A
   new problem or "ooh what if" that surfaces mid-build is a `/pb-park`, **not** an
   edit — capture it and stay on the step. If you genuinely cannot finish without
   touching more than the seam, that is scope drift: surface it to the human rather
   than sprawling.
   - **If a `build`-slot agent is bound, delegate the diff to it**. Run
     `plumbbob agent run --step <n> --mode build` and let that agent author the step's
     code instead of writing it yourself; its envelope reports what it did. You still
     own the verify tick below — the diff is reviewed the same way whoever wrote it.
   - **A manifest's `when` prose is your cue to fire an agent mid-build**.
     The three slots are the only *declarative* lifecycle points; there is no config for
     "a salient moment in the middle." That is judgment, and you are the frontier model
     in the room: when the work reaches the situation a bound agent's `when` (or a step
     `note`) describes, fire `plumbbob agent run <name> --step <n>` yourself. Prose is
     the orchestration language; you are the workflow engine.
   - **Route a non-`done` envelope by its status**. An agent that returns
     `blocked` couldn't finish (missing input, failed precondition): surface its `notes`,
     let the human unblock, and re-run it — don't work around it. One that returns
     `drift` finished but found the plan no longer matches reality: **stop and send the
     human to `/pb-refine`** to repair the plan before continuing, rather than building
     on a plan that's now wrong. A non-zero exit is a failed run: report it and stop.
5. **Verify, through to the pause.** Run the verify tick exactly as `/pb-verify`
   does: `plumbbob check` (on red, read `.check/summary.json` and the failing slot's
   raw output under `.check/` for the actual diagnostics; while iterating on a fix,
   narrow the loop with `plumbbob check --bail --only <slots>` — the checkpoint gate
   still runs everything) → run any bound `after`-agents (`plumbbob agent run --step
   <n> --mode after`) and fold their envelopes into the self-review as **advisory
   input** — they inform, they never gate (checkride gates, the human is the clock; an
   `after`-agent that could fail a step is the lock in autonomy's costume) →
   self-review the diff against the done-when, the Decisions, and the Constraints (a
   single structured read) → validate → **PAUSE
   for the human's approval** → only on approval, checkpoint with
   `plumbbob checkpoint <n> --body <<'BODY' … BODY` — a commit body **proportional to the
   step** (a line for a trivial change, a short paragraph for a meatier one; no TIL scan,
   no separate commit skill). The CLI owns the subject and appends this step to the
   build-log's `## Log`, so the history writes itself — you only supply the body (or omit
   `--body` for the deterministic done-when + seam + diffstat fallback). Do **not** bump
   the version or changelog — that is the human's `/version` call.

## `--auto` — let the agent be the clock (opt-in)

`/pb-build --auto` is the explicit escape hatch when the human wants unattended
progress instead of approving each step. It does the same work, but **the agent reviews
and approves in the human's place**, and it **chains**:

- Build the next step, running its slots in the same order as the default
  path: bound `before`-agents → implement (or the bound `build`-agent) → bound
  `after`-agents → `check` → self-review → **if the check is green AND the
  self-review finds no done-when / Decision / Constraint mismatch, checkpoint** and move
  straight on to the next planned step. Repeat. `--auto` adds no new machinery — the
  `after`-agent output simply feeds the *existing* self-review halt condition.
- **Stop and hand back to the human** the moment any of these is true: the check is red,
  the self-review finds a mismatch (surface exactly what, and do not checkpoint it), a
  bound agent returns `blocked` or `drift` (unblock-and-re-run, or `/pb-refine` — an
  agent cannot advance the loop), a new decision is needed, no planned steps
  remain, or the top of a requested range is reached.

`--auto` and a step range are the only paths that checkpoint without a human pause, and
only because the human asked for it by name; a range re-imposes the pause at its top.
The default — no flag, no range — always ends at the pause.

### A step range (`N-M`) is a bounded `--auto`

`/pb-build 1-3` self-approves steps 1 through 3 exactly as `--auto` does, then **pauses
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
  single-number jump like `/pb-build 4`).

## The hard contracts

- **Swappable, never required.** The loop works without this skill; `/pb-verify`
  checkpoints a hand-built or vibed diff just the same.
- **Build the decided step, not a new one.** Implement what `intent.md` settled. A
  new idea mid-build is a `/pb-park`, not an edit.
- **Default ends at the pause.** Implement → verify → wait for approval; never
  checkpoint without it. Only an explicit `--auto` or a step range lets the agent approve
  in your place, and it still halts on a red check or any mismatch — a range also stops
  at its top.
- **Agents feed the beat; they never advance it**. `before` loads context,
  `build` writes the diff, `after` is advisory — none can checkpoint, flip a step, or
  chain. `blocked` → unblock and re-run; `drift` → `/pb-refine`. You are still the one
  who verifies and (bar `--auto`) the human is still the clock.
