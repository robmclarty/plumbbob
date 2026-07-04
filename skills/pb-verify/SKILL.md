---
name: pb-verify
description: "The verify tick — run the check, self-review the diff against intent, validate the step's done-when, pause for your approval, then checkpoint. Executor-agnostic: it reads the diff, not who wrote it."
disable-model-invocation: true
model: opus
allowed-tools: Read, Bash(plumbbob status:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(plumbbob agent:*), Bash(git diff:*), Bash(git status:*)
---

# PlumbBob — verify a step (the tick)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

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
2. **Run any bound `after`-agents** *(optional — D45)*. If the build's `harness.json`
   binds agents to this step's `after` slot, run `plumbbob agent run --step <n> --mode
   after`. Their envelopes are **advisory input to the self-review, never a gate** —
   `plumbbob check` already gated in step 1, and an `after`-agent that could fail a step
   is the lock returning in autonomy's costume (D45). Fold a `done` envelope's
   `summary`/`body` into the review below; route a non-`done` one by its status (D52): a
   `blocked` agent couldn't finish — surface its `notes`, let the human unblock, re-run;
   a `drift` agent found the plan no longer matches reality — stop and send the human to
   `/pb-refine` to repair the plan before checkpointing. No binding, or no harness, is a
   clean no-op.
3. **Self-review** *(a single structured read, D16)*. Read `git diff` and
   `.plumbbob/intent.md`, then in one pass check the diff against:
   - the current step's **done-when** criterion — is it actually met?
   - the **Decisions** — does anything contradict a settled call?
   - the **Constraints** — are any violated?
   - any **`after`-agent findings** from step 2 — advisory, weigh them, don't defer to them.
   Surface every mismatch plainly. You are reviewing, not building — do not fix anything.
4. **Validate.** State, yes or no, whether the step's done-when is met, with the evidence.
5. **PAUSE.** Present the check result, the self-review (with any `after`-agent
   findings), and the validation, then
   **stop and wait for the human's explicit approval.** This is the convergence beat;
   the human is the clock. Never checkpoint without it.
6. **Checkpoint** *(only after approval)*. Run `plumbbob checkpoint`: it makes the WIP
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
- **`after`-agents advise; they never gate** (D45). Their output feeds the
  self-review — checkride gates, the human approves. `blocked` → unblock and re-run;
  `drift` → `/pb-refine` before checkpointing. No code path makes them blocking.
