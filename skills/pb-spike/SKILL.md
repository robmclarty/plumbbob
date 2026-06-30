---
name: pb-spike
description: Human-triggered driver for `plumbbob spike` — open a throwaway worktree experiment for a genuine fork, or tear it down with `spike done`.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob spike:*)
---

# Plumbbob — spike an experiment (driver)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not found - install the dep and re-run: npm i -g plumbbob && plumbbob init"`

This is a **driver skill** — a chat-side trigger for the mechanical `plumbbob spike` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool** — its only action is to shell the verb and report the verb's output verbatim, including any refusal. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Read the spike target from the way you were invoked: a slug to open one (e.g. `/plumbbob:pb-spike redis-cache`), or the literal `done` to tear the current spike down (`/plumbbob:pb-spike done`). If neither is present, ask which and run nothing.
2. Run `plumbbob spike "<slug>"` or `plumbbob spike done` via Bash.
3. Report the verb's output verbatim — the worktree it created or removed, or any refusal.
