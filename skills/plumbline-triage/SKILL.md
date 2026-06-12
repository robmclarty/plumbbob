---
name: plumbline-triage
description: DESIGN-phase, step-boundary triage — propose one class per parked item, write only after the human confirms each.
disable-model-invocation: true
model: opus
allowed-tools: Read, Edit, Bash(plumbline status:*)
---

# Plumbline — triage the park list

Current session state (injected when this skill runs): !`plumbline status`

## Wrong-state refusal

This skill runs in **DESIGN only**, at a **step boundary** (after the step's check has gone green). Read the state injected above and **stop before writing anything** if it is not `DESIGN`:

- `STATE: BUILD` or `STATE: REVIEW` — finish the step first with `plumbline done`, which returns you to DESIGN; then triage.
- `STATE: SPIKE` — close the experiment with `plumbline spike done` first.
- `STATE: FINISH` — too late to triage; the report skill folds the park list in instead.
- `NO ACTIVE SESSION` — start one with `plumbline start "<title>"`.

When the state is wrong, refuse in one line naming the verb above.

## What this skill does

Walk the **Park list** in `build-log.md` item by item and, for each, **propose exactly one class**:

- **blocker** — the plan was wrong or incomplete; can't proceed. Folds into `intent.md` and is handled now.
- **tangent** — a different path, not clearly better. **The default** — defer or kill.
- **pivot signal** — real evidence the whole approach is wrong. Stop and replan deliberately.

## The one hard contract

You **propose**; the **human calls it** (D13). For each item, state your proposed class and one line of reasoning, then **wait for the human to confirm or override**. Write **only after** per-item confirmation:

- Record each confirmed class in `build-log.md`'s `## Triage` section.
- A confirmed **blocker** also folds its decision into `intent.md`.
- Never reclassify or resolve an item the human hasn't confirmed, and default every uncertain item to **tangent**, never to blocker.
