---
name: park
description: "Compose one tidy tagged park line, get the human's OK in-turn, then capture it by shelling `plumbbob park`, never by editing a file. The capture half of the park/harvest loop."
argument-hint: "[idea]"
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob park:*), Bash(plumbbob handoff:*)
---

# PlumbBob: park an idea (capture, don't chase)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/plumbbob:park` is the **capture** half of the loop; `/plumbbob:harvest` is where parked items
get triaged later. Capturing the instant an idea arrives (instead of acting on
it) is the whole point: it protects the step in flight.

## Wrong-state refusal

Parking needs an **active session** to capture into. Read the dashboard injected above: if
it is `NO ACTIVE SESSION`, **refuse** and tell the human to run `plumbbob start
"<title>"` first. Any time the session is live (at the boundary, mid-step, or in a spike)
is fine; capture is always available, which is the whole point of parking.

## What this skill does

Take the idea, problem, or "ooh what if" the human just had and **compose it into one
tidy, tagged line**: short, legible, self-contained, and carrying a **one-clause why**
(what it is *and* why it's worth revisiting), so it still reads cleanly weeks later when
harvest triages it cold. **The tag rides the tail, in brackets**, so the line spends its
one colon on the `parked:` prefix and reads the same in the chat as in the ledger:

```text
should /password-reset get the same throttle? (tangent)
```

Then:

1. **Show the composed line to the human** and wait for **in-turn approval**: they
   confirm it as-is or edit the wording.
2. **Only after** that approval, capture it by running `plumbbob park "<the
   approved line>"` via Bash.
3. **Relay the capture, then get back to the step.** `plumbbob park` prints
   `parked: <text> (tag)`; relay that line verbatim, then relay `plumbbob handoff --driver`'s
   next-up line, which points back at the step in flight ("Next Up: Back to step N"). Park
   is a driver turn (the [turn anatomy](https://github.com/robmclarty/plumbbob/blob/main/docs/presentation.md)):
   the verb's line plus that one pointer are the whole turn, and the pointer is handoff's to
   render, never yours to compose from the dashboard. The capture is a one-beat
   interruption; the step keeps its focus.

## The one hard contract

The capture itself is the **dumb CLI**, never an edit. This skill carries **no Edit and
no Write tool** on purpose: you may not append to `build-log.md` yourself. Compose, get
approval, then shell `plumbbob park`; that is the only write path. If approval
never comes, capture nothing. (When the human's **own message** states the idea, a
tangent they raise mid-build, that message **is** the approval: capture it directly
with `plumbbob park`, don't ask again. Deferring in words without the CLI line captures
nothing.)
