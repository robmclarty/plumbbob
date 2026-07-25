---
name: harvest
description: Triage the park list at a step boundary — propose one class (blocker/tangent/pivot) per parked item, write only after the human confirms each, record under ## Harvest, and fold a confirmed blocker into intent.
disable-model-invocation: true
allowed-tools: Read, Edit, Bash(plumbbob status:*)
---

# PlumbBob — harvest the park list

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/harvest` is the complement of `/park`: you parked ideas as seeds during a
build; now, at a boundary, you harvest them — decide what each one is.

## When to run it — boundary only

Harvest at a **step boundary**: after a step is checkpointed and you are back at the
DESIGN boundary, not mid-step. Read the dashboard injected above:

- `NO ACTIVE SESSION` — **refuse**; tell the human to `plumbbob start "<title>"` first.
- A step in flight (the dashboard reads `[BUILD]`, and `next →` points at finishing the
  step) — **refuse** and suggest finishing it with `/verify` before harvesting.
  Chasing parked items mid-step is the disease parking prevents.
- At the boundary (the dashboard reads `[DESIGN]`) — go ahead.

## What this skill does

Walk the **Park list** in `build-log.md` item by item and, for each, **propose exactly
one class**:

- **blocker** — the plan was wrong or incomplete; can't proceed. Folds into `intent.md`
  and is handled now.
- **tangent** — a different path, not clearly better. **The default** — defer or kill.
- **pivot signal** — real evidence the whole approach is wrong. Stop and replan.

## The one hard contract

You **propose**; the **human calls it**. For each item, state your proposed class and
one line of reasoning, then **wait for the human to confirm or override**. Write
**only after** per-item confirmation:

- Record each confirmed class in `build-log.md`'s `## Harvest` section.
- **Flip the harvested item** from `- [ ]` to `- [x]` in the Park list, so `/status`
  stops counting it as open.
- A confirmed **blocker** also folds its decision into `intent.md`.
- Never reclassify or resolve an item the human hasn't confirmed, and default every
  uncertain item to **tangent**, never to blocker.
