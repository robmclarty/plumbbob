---
name: pb-review
description: Human-triggered driver for `plumbbob review` — run the heavy check and, if green, flip to REVIEW (muzzle back on) to read the diff cold.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ review:*)
---

# Plumbbob — review a step (driver)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

This is a **driver skill** — a chat-side trigger for the mechanical `plumbbob review` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool** — its only action is to shell the verb and report the verb's output verbatim, including any refusal. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Run `__PLUMBBOB_BIN__ review` via Bash.
2. Report the verb's output verbatim. If the heavy check is red the verb stays in BUILD and prints the failures — relay them and stop; fixing them is the human's call, not an automatic retry.
