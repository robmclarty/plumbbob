---
name: plumbbob-report
description: FINISH-phase report — synthesize intent + build-log into exactly .plumbbob/report.md with the five required sections.
disable-model-invocation: true
model: opus
allowed-tools: Read, Write, Bash(plumbbob status:*)
---

# Plumbbob — write the report

Current session state (injected when this skill runs): !`plumbbob status`

## Wrong-state refusal

This skill writes the report **in FINISH only**. Read the state injected above:

- `STATE: FINISH` — proceed.
- Any other active state (`DESIGN`, `BUILD`, `REVIEW`, `SPIKE`) — **stop and tell the human to run `plumbbob wrap` first** (D28). Entering FINISH is what unlocks writing `report.md`, and this skill is the thing that tells you to wrap.
- `NO ACTIVE SESSION` — there is nothing to report; start a session with `plumbbob start "<title>"`.

## What this skill does

The first of the three Finish steps. Read `intent.md` and `build-log.md` and synthesize the conclusion — the "yeah, I did that" artifact — into **exactly one file: `.plumbbob/report.md`**. Write nothing else, and touch no other path.

## Required sections

`.plumbbob/report.md` must contain these five sections, in order:

1. **What shipped** — what this session actually built, measured against the Frame's "done looks like".
2. **The decisions and why** — the decisions taken (the `D#` ledger) and the reasoning behind each.
3. **Parked items and how each was triaged** — every Park-list item and its triage outcome (blocker / tangent / pivot signal).
4. **Final status** — done, partial, or abandoned, with the checkpoint SHAs.
5. **Deferred tangents (future Plumbbobs)** — the tangents worth their own future session.

Once `report.md` exists, the human runs `plumbbob finish` (the closing gate refuses without it) to archive and clear the session.
