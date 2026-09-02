---
name: abandon
description: "Human-triggered driver for `plumbbob abandon`: drop the in-flight step while keeping its work in the tree, and return to the boundary. The step stays planned."
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob abandon:*), Bash(plumbbob handoff:*)
---

# PlumbBob: abandon the in-flight step (driver)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

This is a **driver skill**: a chat-side trigger for the mechanical `plumbbob abandon` verb, so the whole workflow runs from the agent window instead of a terminal. It is `disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write tool**; it shells the verb, relays its output verbatim (including any refusal), and on a successful transition relays `plumbbob handoff`'s next-up pointer for the turn. The CLI is the source of truth: never retry a refused transition, and never edit a file to work around one.

Abandon is the third exit from an in-flight step. `/plumbbob:verify` lands the step and `/plumbbob:revert` destroys its work; abandon drops the attempt and keeps the working-tree diff exactly where it is. The step keeps its `[ ]` in the plan, re-buildable later, and the diff stays yours to keep, rework, or commit by hand.

## What it does

1. Run `plumbbob abandon` via Bash. It clears the in-flight markers (`STEP`, `SEAM`, `TICK`, and the step's agent handoff ledger), appends an abandon line to the build log, and touches neither the working tree nor git.
2. Report the verb's output verbatim: the step it dropped, or any refusal. A step exit crosses the same boundary as a checkpoint, so abandon honors the same approval latch; a "no human turn since this step began" refusal is the pause working, not an error. End the turn, and the human's next turn is what lets a re-fired abandon land.
3. On a successful abandon, relay `plumbbob handoff --driver`'s next-up line as the turn's pointer (the driver tier of the [turn anatomy](https://github.com/robmclarty/plumbbob/blob/main/docs/presentation.md)): with the step dropped back to `[ ]` and its diff left in the tree, handoff points forward from the boundary. The latch refusal above is not a transition; relay it, end the turn, and add no pointer.
