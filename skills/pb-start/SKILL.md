---
name: pb-start
description: Human-triggered driver for `plumbbob start` — scaffold a new session (.plumbbob/, STATE=DESIGN, baseline commit) without leaving the chat.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ start:*)
---

# Plumbbob — start a session (driver)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

This is a **driver skill** — a chat-side trigger for the mechanical `plumbbob start` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool** — its only action is to shell the verb and report the verb's output verbatim, including any refusal. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Read the session title from the way you were invoked (e.g. `/pb-start "fix the widget"` → title `fix the widget`). If no title is present, ask for one and run nothing.
2. Run `__PLUMBBOB_BIN__ start "<title>"` via Bash.
3. Report the verb's output verbatim. If it refuses (e.g. a session already exists), relay that and stop.
