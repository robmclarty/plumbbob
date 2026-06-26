---
name: status
description: Show the orientation dashboard — where you are, what's done, what's parked, and the next move. A thin trigger for `plumbbob status`.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*)
---

# Plumbbob — orient (the where-am-I move)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not found - install the dep and re-run: npm i -g plumbbob && plumbbob init"`

This is a **thin driver** for `plumbbob status`. The dashboard above is your
orientation — the intent, the step list, the parked/open-question counts, and the
inferred next move. Report it verbatim and point the human at that next move. This
skill carries **no Edit and no Write tool**: the CLI is the source of truth, so
**never retry**, and never edit a file to change what the orientation says.

## What it does

1. Surface the injected `status` output — the dashboard and its suggested next move.
2. If it reads `NO ACTIVE SESSION`, tell the human to `/plumbbob:plan` to frame a goal.
