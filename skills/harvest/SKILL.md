---
name: harvest
description: "Triage the park list at a step boundary: propose one class (blocker/tangent/pivot) for every open parked item at once, and once the human settles them in one reply, fold a confirmed blocker into intent and record the rest with plumbbob harvest. A run's stop card carries its own harvest."
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob order:*), Bash(plumbbob harvest:*)
---

# PlumbBob: harvest the park list

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/plumbbob:harvest` is the complement of `/plumbbob:park`: you parked ideas as seeds during a
build; now, at a boundary, you harvest them: decide what each one is.

## When to run it: boundary only

Harvest at a **step boundary**: after a step is checkpointed and you are back at the
DESIGN boundary, not mid-step. Read the dashboard injected above:

- `NO ACTIVE SESSION`: **refuse**; tell the human to `plumbbob start "<title>"` first.
- A step in flight (the dashboard reads `[BUILD]`, and `next →` points at finishing the
  step): **refuse** and suggest finishing it with `/plumbbob:verify` before harvesting.
  Chasing parked items mid-step is the disease parking prevents.
- At the boundary (the dashboard reads `[DESIGN]`): go ahead.

A range's stop is the boundary that matters most. No harvest runs between the steps
inside a range, so the parks it piled up wait for the stop where it lands, and a
blocker among them is caught there before the next range builds on it. A run's stop card
carries its harvest
([D100 (stop-card)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d100)):
every open park is on the card with a proposed lean, and the reply that settles the card
records them, so there is nothing left for this skill to do there. If
`.plumbbob/detail.md` opens on a `# Detail · Range <N>` header, that card is still waiting:
**refuse**, since writing this skill's detail file would overwrite the range's review, and
point the human at the card's own reply (`looks good`, or a change to a lean).

## What this skill does

Walk the **Park list** in `build-log.md` and, for every open item, **propose exactly one
class**, all of them at once:

- **blocker**: the plan was wrong or incomplete; can't proceed. Folds into `intent.md`
  and is handled now.
- **tangent**: a different path, not clearly better. **The default**: defer or kill.
- **pivot signal**: real evidence the whole approach is wrong. Stop and replan.

## The one hard contract

You **propose**; the **human calls it**. Propose a class for every open item at once,
with one line of reasoning each, and the human settles them all in one reply
([D102 (settle-in-one-reply)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d102)):
one reply per item is what made a harvest a chore, and seeing every proposal at once keeps
the call on each one theirs. The detail file you write first is the proposal; record
**only after** that reply confirms them:

- Write the proposals into `.plumbbob/detail.md` first, under a `# Detail · Harvest`
  header, one line per open item in a `## Harvest` section:
  `- P6 → tangent: <the reason, one clause>`, the class written `blocker`, `tangent`,
  or `pivot` (for a pivot signal). A park's handle is `P` and its place in the
  Park list, counting the harvested lines too (the count the note sizes as
  `parked 3 of 8 open`), and it is the one name the detail file, the turn, and the
  human's reply all use
  ([D105 (park-handles)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d105)).
  Then list the same proposals in the turn, each with its handle and the park's text, and
  end the turn there.
- A reply that changes a proposal (`make P7 a tangent`) is the human's call: rewrite
  that line, list the proposals again, and end the turn. A reply that confirms them
  (`looks good`) is what lets you write.
- On that confirmation, run `plumbbob harvest`
  ([D104 (harvest-records)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d104)).
  It flips each settled item from `- [ ]` to `- [x]` in the Park list, so
  `/plumbbob:status` stops counting it as open, and records each confirmed class under
  `build-log.md`'s `## Harvest` section. Relay its ending whole, the `**Recorded**:` line
  and the Next Up beneath it. It refuses a proposal naming a handle the list lacks (`P9`
  with eight parked) or a class other than blocker, tangent, or pivot; fix the line it
  names and run it again.
- A confirmed **blocker** also folds its decision into `intent.md`, slugged at birth
  like any Decision, anchored the same way
  (`- <a id="d5"></a>**D5 (retry-cap)**: <the call>, *because* <why>`), never a bare `D5`.
  A blocker that becomes a new step takes the next free number under `## Steps` and its
  place in the sequence through `plumbbob order 7 8 5` (the `## Build order` line, every
  undone step in the sequence to build them), never by renumbering, even when it builds
  last. When the plan carries `## Build ranges`, the verb files the new step for you: it
  re-cuts the ranges to follow the sequence it writes, so the step joins the range still
  to come that the order puts it in, the one it builds ahead of when it lands first, and
  never a range that has landed, since that range's call was made and the step would
  reopen it
  ([D109 (ranges-follow-the-order)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d109)).
  Give the step a bare range of its own instead, written before you run the verb, when it
  brings a call the human has to make before it lands. A new range takes the next free item
  number, and no item is renumbered, because the stop card's stamp, the detail file's
  header, and `plumbbob harvest` find a landed range by its number
  ([D92 (build-ranges)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d92)).
  The verb's ending names each range it re-cut, and an advisory names any it left for
  you; re-cut that one in the same confirmed edit, and `plumbbob status` afterward carries
  a `⚠` row for any range still broken.
- Fold a confirmed blocker into `intent.md` before you run `plumbbob harvest`, so the
  record and the plan agree when it lands.
- Never reclassify or resolve an item the human hasn't confirmed, and default every
  uncertain item to **tangent**, never to blocker.
