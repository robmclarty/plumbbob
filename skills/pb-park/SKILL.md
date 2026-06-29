---
name: pb-park
description: Compose one tidy tagged park line, get the human's OK in-turn, then capture it by shelling `plumbbob park` — never by editing a file. The capture half of the park/harvest loop.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob park:*)
---

# Plumbbob — park an idea (capture, don't chase)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not found - install the dep and re-run: npm i -g plumbbob && plumbbob init"`

`/pb-park` is the **capture** half of the loop; `/pb-harvest` is where parked items
get triaged later (D7). Capturing the instant an idea arrives — instead of acting on
it — is the whole point: it protects the step in flight.

## Wrong-state refusal

Parking needs an **active session** to capture into. Read the state injected above: if
it is `NO ACTIVE SESSION`, **refuse** and tell the human to run `plumbbob start
"<title>"` first. Every active state (`DESIGN`, `BUILD`, `SPIKE`, `FINISH`) is fine —
capture is always available, which is the whole point of parking.

## What this skill does

Take the idea, problem, or "ooh what if" the human just had and **compose it into one
tidy, tagged line** — short, legible, self-contained, so it still reads cleanly weeks
later. Then:

1. **Show the composed line to the human** and wait for **in-turn approval** — they
   confirm it as-is or edit the wording.
2. **Only after** that approval, capture it by running `plumbbob park "<the
   approved line>"` via Bash.

## The one hard contract

The capture itself is the **dumb CLI**, never an edit. This skill carries **no Edit and
no Write tool** on purpose: you may not append to `build-log.md` yourself. Compose, get
approval, then shell `plumbbob park` — that is the only write path. If approval
never comes, capture nothing.
