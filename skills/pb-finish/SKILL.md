---
name: pb-finish
description: Human-triggered driver for `plumbbob finish` — refuse unless a report is archived, then archive, clear the session, and switch the muzzle off.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ finish:*)
---

# Plumbbob — finish the session (driver)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

This is a **driver skill** — a chat-side trigger for the mechanical `plumbbob finish` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool** — its only action is to shell the verb and report the verb's output verbatim, including any refusal. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Run `__PLUMBBOB_BIN__ finish` via Bash.
2. Report the verb's output verbatim. It is the closing gate — it **refuses unless `.plumbbob/report.md` exists**. If it refuses, relay that and tell the human to run `/plumbbob-report` first; do not write the report yourself from here.
