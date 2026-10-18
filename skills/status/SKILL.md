---
name: status
description: "Show the orientation dashboard: where you are, what's done, what's parked, and the next move. A thin trigger for `plumbbob status`."
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*)
---

# PlumbBob: orient (the where-am-I move)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

This is a **thin driver** for `plumbbob status`. The dashboard above is your
orientation: the intent, the step list, the build ranges when the plan has them, the
parked/open-question counts, and the inferred next move. Report it verbatim and point the human at that next move. This
skill carries **no Edit and no Write tool**: the CLI is the source of truth, so
**never retry**, and never edit a file to change what the orientation says.

Status is an orientation turn (the
[turn anatomy](https://github.com/robmclarty/plumbbob/blob/main/docs/presentation.md)):
the dashboard is the whole output, relayed verbatim. Everything the human needs is
already in those bytes: the step in flight, the next step's done-when, seam, and `model:`
recommendation, the counts, and the one next move. You relay it; you do not re-compose or
annotate it.

## What it does

1. Surface the injected `status` output verbatim: the dashboard and its suggested next move.
2. The dashboard already prints the next step's `model:` recommendation in its detail
   rows when the plan set one: the smallest model that can carry that step, so the human
   can switch (for example `/model sonnet`) before firing `/plumbbob:build`, or ignore it.
   Guidance, never a gate. You relay that line; you do not re-state it on top of the
   verbatim dashboard.
3. When the plan carries `## Build ranges`, the dashboard lists them beneath the steps:
   `ranges  2 of 5 done`, `✓` on a landed range and `▸` on the one holding the next step,
   each undone range's stop on the line beneath it, and a `⚠` row for any range the plan
   has outgrown. Its `next →` then names the range's command to type. You relay the block
   with the rest; a `⚠` row is `/plumbbob:refine`'s to fix.
4. If it reads `NO ACTIVE SESSION`, tell the human to `/plumbbob:plan` to frame a goal.
