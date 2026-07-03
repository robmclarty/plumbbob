---
name: pb-verify
description: "The verify tick — run the check, self-review the diff against intent, validate the step's done-when, pause for your approval, then checkpoint. Executor-agnostic: it reads the diff, not who wrote it."
disable-model-invocation: true
model: opus
allowed-tools: Read, Bash(plumbbob status:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(git diff:*), Bash(git status:*)
---

# PlumbBob — verify a step (the tick)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not found - install the dep and re-run: npm i -g plumbbob && plumbbob init"`

This is the **tick** — the one beat where the human is the clock. Whatever produced
the current diff — `/pb-build`, your own hands, a vibe session, another harness —
this skill verifies it the same way: **it reads the diff, not the author** (D3).

## What this skill does, in order

1. **Check.** Run `plumbbob check` (the heavy gate — checkride unless the repo
   configures a `check` override, D32). If it comes back **red**, stop here: the gate
   names the failing slots and where each tool's raw output landed — read
   `.check/summary.json`, then the failing slot's own file (`.check/<slot>.json` or
   `.check/<slot>.stdout.txt`) for the actual diagnostics instead of scraping
   scrollback. Report what failed and do **not** pause for approval — there is
   nothing to approve yet. The human fixes it and re-invokes. (Exit 2 means the gate
   itself broke — a harness problem to surface, not a code failure.)
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
5. **Checkpoint** *(only after approval)*. Run `plumbbob checkpoint`: it makes the WIP
   commit, records the SHA, flips the step to done, appends the step to the build-log's
   `## Log`, and returns to DESIGN. The CLI owns the commit **subject**
   (`plumbbob: step N — <title>`); you own the **body**. Compose a body *proportional to
   the step* — a one-liner for a trivial change, a short paragraph on the what/why for a
   meatier one — and pass it on stdin:

   ```bash
   plumbbob checkpoint <n> --body <<'BODY'
   <your proportional body — what changed and why, no ceremony>
   BODY
   ```

   Do **not** run a TIL scan or reach for a separate commit skill — the body is yours to
   write in one breath. Omit `--body` entirely and the CLI writes a deterministic body
   (done-when + seam + diffstat) on its own. Either way, do **not** bump the version or
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
