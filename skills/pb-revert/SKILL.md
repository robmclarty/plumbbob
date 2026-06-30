---
name: pb-revert
description: Human-triggered driver for `plumbbob revert` — git reset --hard to a checkpoint SHA (discarding the half-done step) and return to the boundary.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob revert:*)
---

# Plumbbob — revert to a checkpoint (driver)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not found - install the dep and re-run: npm i -g plumbbob && plumbbob init"`

This is a **driver skill** — a chat-side trigger for the mechanical `plumbbob revert` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool** — its only action is to shell the verb and report the verb's output verbatim, including any refusal. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Read an optional target step from the way you were invoked (e.g. `/plumbbob:pb-revert --to 2` → step `2`). With no target, revert goes to the last done-checkpoint.
2. Run `plumbbob revert` (or `plumbbob revert --to <n>`) via Bash. This is a `git reset --hard` — it discards the current in-progress step. Run it exactly as the human asked; do not add or drop the `--to` on your own.
3. Report the verb's output verbatim — which checkpoint it reset to, or any refusal.
