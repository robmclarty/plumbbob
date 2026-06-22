---
name: park
description: Compose one tidy tagged park line, get the human's OK in-turn, then capture it by shelling `plumbbob park` — never by editing a file.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ park:*)
---

# Park

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

## Wrong-state refusal

Parking needs an **active session** to capture into. Read the state injected above: if it is `NO ACTIVE SESSION`, **refuse** and tell the human to run `plumbbob start "<title>"` first. Every active state (`DESIGN`, `BUILD`, `REVIEW`, `SPIKE`, `FINISH`) is fine — capture is always available, which is the whole point of parking.

## What this skill does

Take the idea, problem, or "ooh what if" the human just had and **compose it into one tidy, tagged line** — short, legible, self-contained, so it still reads cleanly weeks later. Then:

1. **Show the composed line to the human** and wait for **in-turn approval** — they confirm it as-is or edit the wording.
2. **Only after** that approval, capture it by running `__PLUMBBOB_BIN__ park "<the approved line>"` via Bash.

## The one hard contract

The capture itself is the **dumb CLI**, never an edit. This skill carries **no Edit and no Write tool** on purpose (D12): you may not append to `build-log.md` yourself. Compose, get approval, then shell `__PLUMBBOB_BIN__ park` — that is the only write path. If approval never comes, capture nothing.
