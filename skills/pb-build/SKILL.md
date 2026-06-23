---
name: pb-build
description: The optional engine — read the current planned step from intent, implement it (its done-when, seam, Decisions, Constraints), then verify it through to the approval pause. Skip it entirely to implement by hand, vibed, or with another harness.
disable-model-invocation: true
model: opus
allowed-tools: Read, Edit, Write, Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ build:*), Bash(__PLUMBBOB_BIN__ check:*), Bash(__PLUMBBOB_BIN__ checkpoint:*), Bash(git diff:*)
---

# Plumbbob — build a step (the optional engine)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

This is the **bundled executor** — one way to turn a planned step into code. It is
**optional** (D3): you can implement any step by hand, in a vibe session, or with
another harness and go straight to `/pb-verify` instead — plumbbob does not care how
the diff appeared. When you do run it, it reads the plan, writes the step, and
carries straight through to the verify pause.

## What this skill does, in order

1. **Pick the step.** Use the number you were invoked with (e.g. `/pb-build 4`), else
   the next undone, planned step in `.plumbbob/intent.md`. If there is no planned step
   to build, stop and tell the human to `/pb-step` first.
2. **Enter the step.** Run `__PLUMBBOB_BIN__ build <n>` (records the in-flight STEP +
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
   does: `__PLUMBBOB_BIN__ check` → self-review the diff against the done-when, the
   Decisions, and the Constraints (a single structured read, D16) → validate → **PAUSE
   for the human's approval** → only on approval, checkpoint with
   `__PLUMBBOB_BIN__ checkpoint`. Do **not** bump the version or changelog — that is
   the human's `/version` call.

## The hard contracts

- **Optional, never required.** The loop works without this skill; `/pb-verify`
  checkpoints a hand-built or vibed diff just the same (D3).
- **Build the decided step, not a new one.** Implement what `intent.md` settled. A
  new idea mid-build is a `/pb-park`, not an edit.
- **Always end at the pause.** Implement → verify → wait for approval. Never
  checkpoint without it; the human is the clock.
