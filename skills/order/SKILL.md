---
name: order
description: "Set the build order: turn the human's sequence (or a relative one, such as 7 and 8 before 5) into the full list of undone steps and write it by shelling `plumbbob order`, never by editing intent.md. A step keeps its number; the sequence moves."
argument-hint: "[steps in the sequence to build them]"
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob status:*), Bash(plumbbob order:*)
---

# PlumbBob: set the build order (the sequence, not the numbering)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

A step keeps its number for life, so once `/plumbbob:step` or `/plumbbob:refine` appends a step
that has to land before an existing one, the sequence to build them stops being the
numbering (`4, 7, 8, 5, 10, 6`). This skill writes that sequence down where every other move
reads it: the `## Build order` line in `intent.md`, which `plumbbob status`, a bare
`/plumbbob:build`, `plumbbob checkpoint`, and the card's Next Up all follow.

## Wrong-state refusal

Ordering needs an **active session** with a plan. Read the dashboard injected above: if it
is `NO ACTIVE SESSION`, **refuse** and tell the human to run `plumbbob start "<title>"` (or
`/plumbbob:plan`) first. Any live state is fine, mid-step included: re-sequencing what comes
after the step in flight is the usual reason to run it.

## What this skill does

1. **Compose the full sequence.** Read the step list and the `build order` row on the
   dashboard. Take the human's instruction, whether a full list (`7 8 5 10 6`) or a relative
   one ("7 and 8 before 5", "10 last"), and turn it into **every undone step, in the sequence
   to build them**. Never renumber a step and never move one inside `## Steps`; the sequence
   lives in this one line.
2. **Show the sequence and get the human's OK in-turn.** When the human's own message states
   the full sequence, that message **is** the approval: run the verb directly.
3. **Write it by shelling `plumbbob order 7 8 5 10 6`** via Bash. `plumbbob order --reset`
   drops the line, and the plan reads in document order again.
4. **Relay the ending verbatim, then stop.** The verb prints its whole ending: the
   `**Build order**: 7, 8, 5, 10, 6` line, a blank line, and the `**Next Up**` pointer (back
   at the step in flight, or forward to the first step in the new sequence). Run no second
   command. A refusal (a number the plan lacks, a repeat, a step already checkpointed) is the
   CLI's call: report it verbatim, never retry or work around it, and ask the human which
   number they meant.

## The one hard contract

The line is written by the **dumb CLI**, never by an edit. This skill carries **no Edit and
no Write tool** on purpose: you may not touch `intent.md` yourself. Compose, get approval,
then shell `plumbbob order`; that is the only write path, and it is the one that validates
every number against the plan.
