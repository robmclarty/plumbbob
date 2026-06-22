---
name: pb-revert
description: Human-triggered driver for `plumbbob revert` — git reset --hard to a checkpoint SHA (discarding the half-done step) and return to DESIGN.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ revert:*)
---

# Plumbbob — revert to a checkpoint (driver)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

This is a **driver skill** — a chat-side trigger for the mechanical `plumbbob revert` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool** — its only action is to shell the verb and report the verb's output verbatim, including any refusal. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Read an optional target step from the way you were invoked (e.g. `/pb-revert --to 2` → step `2`). With no target, revert goes to the last done-checkpoint.
2. Run `__PLUMBBOB_BIN__ revert` (or `__PLUMBBOB_BIN__ revert --to <n>`) via Bash. This is a `git reset --hard` — it discards the current in-progress step. Run it exactly as the human asked; do not add or drop the `--to` on your own.
3. Report the verb's output verbatim — which checkpoint it reset to, or any refusal.
