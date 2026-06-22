---
name: pb-build
description: Human-triggered driver for `plumbbob build <n>` — write the SEAM for a step and enter BUILD (edits unlocked to those paths only), from the chat.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ build:*)
---

# Plumbbob — build a step (driver)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

This is a **driver skill** — a chat-side trigger for the mechanical `plumbbob build` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool** — its only action is to shell the verb and report the verb's output verbatim, including any refusal. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Read the step number from the way you were invoked (e.g. `/pb-build 3` → step `3`). If no number is present, ask for one and run nothing.
2. Run `__PLUMBBOB_BIN__ build <n>` via Bash.
3. Report the verb's output verbatim — the SEAM it wrote and the new state, or any refusal.
