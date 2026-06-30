---
name: pb-verify
description: "The verify tick — run the check, self-review the diff against intent, validate the step's done-when, pause for your approval, then checkpoint. Executor-agnostic: it reads the diff, not who wrote it."
disable-model-invocation: true
model: opus
allowed-tools: Read, Bash(plumbbob status:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(git diff:*), Bash(git status:*)
---

# Plumbbob — verify a step (the tick)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not found - install the dep and re-run: npm i -g plumbbob && plumbbob init"`

This is the **tick** — the one beat where the human is the clock. Whatever produced
the current diff — `/pb-build`, your own hands, a vibe session, another harness —
this skill verifies it the same way: **it reads the diff, not the author** (D3).

## What this skill does, in order

1. **Check.** Run `plumbbob check` (the heavy gate). If it comes back
   **red**, stop here: report what failed and do **not** pause for approval — there
   is nothing to approve yet. The human fixes it and re-invokes.
2. **Self-review** *(a single structured read, D16)*. Read `git diff` and
   `.plumbbob/intent.md`, then in one pass check the diff against:
   - the current step's **done-when** criterion — is it actually met?
   - the **Decisions** — does anything contradict a settled call?
   - the **Constraints** — are any violated?
   Surface every mismatch plainly. You are reviewing, not building — do not fix anything.
3. **Validate.** State, yes or no, whether the step's done-when is met, with the evidence.
4. **PAUSE.** Present the check result, the self-review, and the validation, then
   **stop and wait for the human's explicit approval.** This is the convergence beat;
   the human is the clock. Never checkpoint without it.
5. **Checkpoint** *(only after approval)*. Commit the work — the human's
   commit-with-TIL skill for a rich message, or let `checkpoint` make the WIP commit
   — then run `plumbbob checkpoint` to record the SHA, flip the step to done, append the
   step to the build-log's `## Log`, and return to DESIGN. Do **not** bump the version or
   touch the changelog — that is the human's `/version` call.

## The hard contracts

- **Never skip the pause.** Check → self-review → validate, then wait. Approval is
  the only thing that triggers the checkpoint.
- **Read the diff, not the author** (D3). Verify identically whether the code was
  built by `/pb-build`, by hand, vibed, or by another harness.
- **Red means stop, not pause.** A failing check is not an approval decision; report
  it and end your turn.
- **You review; you do not build.** If the self-review finds a problem, surface it
  and stop — fixing is a new build beat, not part of verify.
