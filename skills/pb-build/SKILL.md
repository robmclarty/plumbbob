---
name: pb-build
description: The optional engine — read the next planned step from intent, implement it (its done-when, seam, Decisions, Constraints), then verify it through to the approval pause. Skip it to build by hand/vibed/another harness. `--auto` self-approves and chains to done.
disable-model-invocation: true
model: opus
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob build:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(git diff:*)
---

# Plumbbob — build a step (the optional engine)

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
   SEAM so `/pb-status` shows the step in flight; in v2 the seam is awareness, not a
   lock).
3. **Read the plan.** Read the step's **done-when**, its **seam**, and the
   **Decisions** and **Constraints** in `intent.md`. Build to *that* — the deciding
   already happened, off the chat.
4. **Implement** the step, and only that step, staying within the declared seam. A
   new problem or "ooh what if" that surfaces mid-build is a `/pb-park`, **not** an
   edit — capture it and stay on the step. If you genuinely cannot finish without
   touching more than the seam, that is scope drift: surface it to the human rather
   than sprawling.
5. **Verify, through to the pause.** Run the verify tick exactly as `/pb-verify`
   does: `plumbbob check` → self-review the diff against the done-when, the
   Decisions, and the Constraints (a single structured read, D16) → validate → **PAUSE
   for the human's approval** → only on approval, checkpoint with
   `plumbbob checkpoint`. Do **not** bump the version or changelog — that is
   the human's `/version` call.

## `--auto` — let the agent be the clock (opt-in)

`/pb-build --auto` is the explicit escape hatch when the human wants unattended
progress instead of approving each step. It does the same work, but **the agent reviews
and approves in the human's place**, and it **chains**:

- Build the next step → `check` → self-review → **if the check is green AND the
  self-review finds no done-when / Decision / Constraint mismatch, checkpoint** and move
  straight on to the next planned step. Repeat.
- **Stop and hand back to the human** the moment any of these is true: the check is red,
  the self-review finds a mismatch (surface exactly what, and do not checkpoint it), a
  new decision is needed, or no planned steps remain.

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
