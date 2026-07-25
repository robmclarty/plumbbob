---
name: status
description: Show the orientation dashboard — where you are, what's done, what's parked, and the next move. A thin trigger for `plumbbob status`.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*)
---

# PlumbBob — orient (the where-am-I move)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

This is a **thin driver** for `plumbbob status`. The dashboard above is your
orientation — the intent, the step list, the parked/open-question counts, and the
inferred next move. Report it verbatim and point the human at that next move. This
skill carries **no Edit and no Write tool**: the CLI is the source of truth, so
**never retry**, and never edit a file to change what the orientation says.

## What it does

1. Surface the injected `status` output — the dashboard and its suggested next move.
2. If the next step's detail carries a `model:` line, point it out: it is the
   plan's recommendation of the smallest model that can carry that step, so the human
   can switch (e.g. `/model sonnet`) before firing `/build` — or ignore it. Guidance,
   never a gate.
3. If it reads `NO ACTIVE SESSION`, tell the human to `/plan` to frame a goal.
