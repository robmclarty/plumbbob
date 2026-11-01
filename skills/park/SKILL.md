---
name: park
description: "Compose one tidy tagged park line, get the human's OK in-turn, then capture it by shelling `plumbbob park`, never by editing a file. The capture half of the park/harvest loop."
argument-hint: "[idea]"
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob park:*), Bash(plumbbob defer:*)
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
3. **Relay the block, then get back to the step.** `plumbbob park` prints its whole
   ending: `**Parked**: <text> (tag)`, a blank line, and the pointer back at the step in
   flight (`**Next Up**: Back to Step N`). Relay that output verbatim and run no second
   command. Park is a driver turn (the [turn anatomy](https://github.com/robmclarty/plumbbob/blob/main/docs/presentation.md)):
   the capture plus that one pointer are the whole turn, and both are the CLI's to render,
   never yours to compose from the dashboard. The capture is a one-beat interruption; the
   step keeps its focus.
4. **A question beside the tangent is answered after the capture.** When the human's
   message also asks something, run `plumbbob park` first, then answer the question, then
   end the turn on the park's block, typed as it printed, with no tool call after the
   answer ([D121 (reply-after-the-tools)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d121)):
   a client that folds text written before a tool call would show the block and hide the
   answer. A message that is only a tangent ends on the block alone. Either way the
   block's pointer back at the step closes the turn, so run no `plumbbob handoff` after
   it. The answer is what the human asked for; dropping it to keep the block alone,
   writing it above the capture, or stacking a second ending under the block are the ways
   this goes wrong.

## A question set aside is deferred, not parked

When the idea is an open question from the plan that the human wants picked up later,
once other work lands (`leave Q3 until the latency numbers are in`), run
`plumbbob defer Q3 "<what settles it>"` in place of the park. The question's own opener
is where it waits, and the card counts it apart from the questions to answer; a park line
beside it would leave the card counting it as a call still owed
([D123 (defer-records)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d123)).
`plumbbob defer` prints the same kind of block, `**Deferred**: Q3 (<slug>) until <what
settles it>` and the pointer, and you relay it the same way. When `plumbbob park` warns that
a question it names still counts as one to answer, relay the block as printed; whether to
defer it is the human's call.

## The one hard contract

The capture itself is the **dumb CLI**, never an edit. This skill carries **no Edit and
no Write tool** on purpose: you may not append to `build-log.md` yourself, nor mark a
question in `intent.md`. Compose, get approval, then shell `plumbbob park`, or
`plumbbob defer` for a question set aside; those are the only write paths. If approval
never comes, capture nothing. (When the human's **own message** states the idea, a
tangent they raise mid-build, that message **is** the approval: capture it directly
with `plumbbob park`, don't ask again. Deferring in words without the CLI line captures
nothing.)
