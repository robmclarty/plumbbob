---
name: revert
description: "Human-triggered driver for `plumbbob revert`: git reset --hard to a checkpoint SHA (discarding the half-done step) and return to the boundary."
argument-hint: "[--to <step>]"
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob revert:*), Bash(plumbbob handoff:*)
---

# PlumbBob: revert to a checkpoint (driver)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

This is a **driver skill**: a chat-side trigger for the mechanical `plumbbob revert` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool**; it shells the verb, relays its output verbatim (including any refusal), and on a successful transition relays `plumbbob handoff`'s next-up pointer for the turn. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

## What it does

1. Read an optional target step from the way you were invoked (for example `/plumbbob:revert --to 2` → step `2`). With no target, revert goes to the last done-checkpoint.
2. Run `plumbbob revert` (or `plumbbob revert --to <n>`) via Bash. This is a `git reset --hard`; it discards the current in-progress step *and its work*. If the human wants to drop the step but keep the working-tree diff, that is `/plumbbob:abandon`, not revert. Run it exactly as the human asked; do not add or drop the `--to` on your own.
3. Report the verb's output verbatim: which checkpoint it reset to, or any refusal.
4. On a successful revert, relay `plumbbob handoff --driver`'s next-up line as the turn's pointer (the driver tier of the [turn anatomy](https://github.com/robmclarty/plumbbob/blob/main/docs/presentation.md)): with the in-flight step wound back, handoff points forward from the boundary. A refusal is not a transition; relay it and stop, with no pointer.
