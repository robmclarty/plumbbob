---
name: pb-wrap
description: Human-triggered driver for `plumbbob wrap` — set STATE=FINISH so the report and docs skills can run.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ wrap:*)
---

# Plumbbob — wrap into FINISH (driver)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

This is a **driver skill** — a chat-side trigger for the mechanical `plumbbob wrap` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool** — its only action is to shell the verb and report the verb's output verbatim, including any refusal. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Run `__PLUMBBOB_BIN__ wrap` via Bash.
2. Report the verb's output verbatim. FINISH is what unlocks `/plumbbob-report` and `/plumbbob-docs` — next, run `/plumbbob-report`.
