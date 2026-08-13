---
name: recover
description: "Human-triggered driver for `plumbbob recover`; reconcile the control plane when the session looks wrong: a cursor pointing at a build that is gone, a step marked in flight that the plan no longer has, leftovers from an interrupted spike. Reports by default; `--fix` repairs the stale files it can."
argument-hint: "[--fix]"
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob recover:*)
---

# PlumbBob: reconcile the control plane (driver)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

This is a **driver skill**: a chat-side trigger for the mechanical `plumbbob recover` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool**; its only action is to shell the verb and report the verb's output verbatim, including any refusal. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

Reach for it when the dashboard and reality disagree: `status` shows a build you thought you finished, or an empty plan for a build you know you wrote, or a step in flight you have no memory of starting. Those are the shapes a crashed session, a lost context window, or a mid-step build switch leaves behind. `/plumbbob:doctor` answers "is plumbbob installed correctly"; this answers "is this session's own state telling the truth".

## What it does

1. Run `plumbbob recover` via Bash. It reads the control plane (the active-build cursor, the step and spike markers, the latch's stamp, the agent handoff ledger, and any leftover spike worktrees) and prints one line per check.
2. Report that output verbatim, `✓` and `✗` lines alike. Every problem carries a `→` line naming the fix; relay those as written rather than paraphrasing them into your own advice.
3. **Only if the human asks for the repair**, run `plumbbob recover --fix`. It clears stale untracked control files and re-points a cursor when exactly one build survives. It never touches intent.md, the build log, the checkpoints ledger, a report, or git history, and it never lands or advances a step.

## What it will not do for you

- **Spike leftovers are reported, never removed.** Those worktrees sit outside the repo and may hold the only copy of what a spike learned, so the verb prints the exact `git worktree remove` / `git branch -D` commands and stops. Relay them; do not run them yourself.
- **A contradictory phase is yours to settle.** A spike and a step both marked in flight, or a step number the plan no longer contains, need a decision about which one is real; `--fix` deliberately leaves them alone.
- **It is not a rewind.** Recovering reconciles bookkeeping; it never restores lost work. Discarding a half-done step is `/plumbbob:revert`, and that is a different, destructive move the human asks for by name.
