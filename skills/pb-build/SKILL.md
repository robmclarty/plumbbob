---
name: pb-build
description: The optional engine — read the next planned step from intent, implement it (its done-when, seam, Decisions, Constraints), then verify it through to the approval pause. Skip it to build by hand/vibed/another harness. `--auto` self-approves and chains to done.
argument-hint: "[step-number] [--auto]"
disable-model-invocation: true
model: opus
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob build:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(plumbbob agent:*), Bash(git diff:*)
---

# PlumbBob — build a step (the optional engine)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not found - install the dep and re-run: npm i -g plumbbob && plumbbob init"`

This is the **bundled executor** — one way to turn a planned step into code. It is
**optional** (D3): you can implement any step by hand, in a vibe session, or with
another harness and go straight to `/pb-verify` instead — plumbbob does not care how
the diff appeared. When you do run it, it reads the plan, writes the step, and
carries straight through to the verify pause.

Since `/pb-plan` lays down the whole step list up front, the happy path is to fire
`/pb-build` once per step until done — each run builds the next undone step and stops
at the pause for your approval. **Re-firing `/pb-build` is itself the clock tick.**

## What this skill does, in order

1. **Pick the step.** Use the number you were invoked with (e.g. `/pb-build 4`), else
   the next undone, planned step in `.plumbbob/intent.md`. If there is no planned step
   to build, stop and tell the human to `/pb-step` first.
2. **Enter the step.** Run `plumbbob build <n>` (records the in-flight STEP +
   SEAM so `/pb-status` shows the step in flight; the seam is awareness, not a
   lock).
3. **Read the plan.** Read the step's **done-when**, its **seam**, and the
   **Decisions** and **Constraints** in `intent.md`. Build to *that* — the deciding
   already happened, off the chat.
   - **Run any bound `before`-agents** *(D5/D15)*. If the build's `harness.json` binds
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
   - **If a `build`-slot agent is bound, delegate the diff to it** *(D5)*. Run
     `plumbbob agent run --step <n> --mode build` and let that agent author the step's
     code instead of writing it yourself; its envelope reports what it did. You still
     own the verify tick below — the diff is reviewed the same way whoever wrote it (D3).
   - **A manifest's `when` prose is your cue to fire an agent mid-build** *(D5/D11)*.
     The three slots are the only *declarative* lifecycle points; there is no config for
     "a salient moment in the middle." That is judgment, and you are the frontier model
     in the room: when the work reaches the situation a bound agent's `when` (or a step
     `note`) describes, fire `plumbbob agent run <name> --step <n>` yourself. Prose is
     the orchestration language; you are the workflow engine.
   - **Route a non-`done` envelope by its status** *(D24)*. An agent that returns
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
   `after`-agent that could fail a step is the lock in autonomy's costume, D7/C4) →
   self-review the diff against the done-when, the Decisions, and the Constraints (a
   single structured read, D16) → validate → **PAUSE
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

- Build the next step, running its slots in the same order as the default path
  (D12): bound `before`-agents → implement (or the bound `build`-agent) → bound
  `after`-agents → `check` → self-review → **if the check is green AND the
  self-review finds no done-when / Decision / Constraint mismatch, checkpoint** and move
  straight on to the next planned step. Repeat. `--auto` adds no new machinery — the
  `after`-agent output simply feeds the *existing* self-review halt condition.
- **Stop and hand back to the human** the moment any of these is true: the check is red,
  the self-review finds a mismatch (surface exactly what, and do not checkpoint it), a
  bound agent returns `blocked` or `drift` (unblock-and-re-run, or `/pb-refine` — an
  agent cannot advance the loop, C2), a new decision is needed, or no planned steps
  remain.

`--auto` is the only path that checkpoints without a human pause, and only because the
human asked for it by name. The default — no flag — always ends at the pause.

## The hard contracts

- **Optional, never required.** The loop works without this skill; `/pb-verify`
  checkpoints a hand-built or vibed diff just the same (D3).
- **Build the decided step, not a new one.** Implement what `intent.md` settled. A
  new idea mid-build is a `/pb-park`, not an edit.
- **Default ends at the pause.** Implement → verify → wait for approval; never
  checkpoint without it. Only an explicit `--auto` lets the agent approve in your place,
  and it still halts on a red check or any mismatch.
- **Agents feed the beat; they never advance it** (C2/C4). `before` loads context,
  `build` writes the diff, `after` is advisory — none can checkpoint, flip a step, or
  chain. `blocked` → unblock and re-run; `drift` → `/pb-refine`. You are still the one
  who verifies and (bar `--auto`) the human is still the clock.
