---
name: revert
description: "Human-triggered driver for `plumbbob revert`: git reset --hard to a checkpoint SHA (discarding the half-done step) and return to the boundary."
argument-hint: "[--to <step>]"
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob revert:*)
---

# PlumbBob: revert to a checkpoint (driver)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

This is a **driver skill**: a chat-side trigger for the mechanical `plumbbob revert` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool**; it shells the verb and relays its output verbatim, refusal included. A successful transition prints its whole ending, pointer and all, so one command is the whole turn. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Read an optional target step from the way you were invoked (for example `/plumbbob:revert --to 2` → step `2`). With no target, revert goes to the last done-checkpoint.
2. Run `plumbbob revert` (or `plumbbob revert --to <n>`) via Bash. This is a `git reset --hard`; it discards the current in-progress step *and its work*. If the human wants to drop the step but keep the working-tree diff, that is `/plumbbob:abandon`, not revert. Run it exactly as the human asked; do not add or drop the `--to` on your own.
3. Report the verb's output verbatim: which checkpoint it reset to, or any refusal.
4. A successful revert prints its own ending (the driver tier of the [turn anatomy](https://github.com/robmclarty/plumbbob/blob/main/docs/presentation.md)): the lead line, a blank line, and the pointer forward from the boundary, since the in-flight step is wound back. Relay that block whole and run no second command. A refusal is not a transition; it carries no pointer, so relay it and stop.
