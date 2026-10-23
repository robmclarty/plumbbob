---
name: refine
description: "Keep intent.md true: attack the plan for holes (append as Open questions) and refine or repair the Frame, Decisions, Constraints, Steps, and build ranges to match reality (`ranges` re-cuts the whole section). Usable at any point; you propose, the human approves."
argument-hint: "[focus | ranges]"
disable-model-invocation: true
allowed-tools: Read, Edit, Bash(plumbbob status:*), Bash(plumbbob order:*)
---

# PlumbBob: refine the plan

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/plumbbob:refine` keeps `intent.md` honest. Use it at **any point**: right after `/plumbbob:plan`
to stress-test a fresh frame, or mid-build to repair a plan that drifted from what the
code is actually doing. It is the document-level complement to `/plumbbob:step` (which only
sharpens the *next* step): `/plumbbob:refine` works the *whole* plan.

## No-session refusal

This skill refines an existing plan, so it needs one. Read the state injected above: if
it is `NO ACTIVE SESSION`, **refuse** in one line and tell the human to run
`plumbbob start "<title>"` (or `/plumbbob:plan`) first, and edit nothing. Every active state
is fine; refining is always available.

## Two modes, and a re-cut

- **Attack (diverge in the problem space).** Hand the **Frame**, **Decisions**, and
  **Architecture sketch** a cold, adversarial read and surface holes: ambiguities,
  unhandled edge cases, hidden assumptions, collisions with the existing code. Append
  each under `## Open questions` in the expanded form the template shows: an opener
  line (the hole as a question, anchored and slugged at birth like any Decision,
  `- <a id="q2"></a>**Q2 (some-slug)**: …`, so a `[Q2 (some-slug)](#q2)` reference
  elsewhere in the file lands on it), a `*plain:*` sub-line (what's at stake in plain
  words, enough to judge it cold), and a `*lean:*` sub-line (your proposed resolution:
  one answer to react to, not a menu). Never
  append a hole as a Decision: resolving it is the human's convergence, not yours;
  the lean proposes; this mode surfaces, it does not decide. (A tiny, obvious question
  may stay one bare line; the sub-lines earn their keep only when a human decision
  genuinely waits on it.)

  Then walk the human through it in the chat: list every hole you appended, each as
  its explanation first and its lean second, and invite per-question answers; the
  human can settle any of them right there in one message, no doc-flipping, no extra
  round-trip per hole.
- **Repair (re-sync to reality).** When the plan has drifted (a Decision was overtaken
  by what you built, a Constraint changed, a Step no longer matches the seam, or a
  **step's title no longer describes what the diff actually does**), propose the edits
  that bring `intent.md` back in line with the truth. A step title *is* its checkpoint
  commit subject ([D68 (conventional-subjects)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d68)), so bringing a drifted one back in line
  means keeping it a plain, single-line `type(scope): description` subject, with
  load-bearing detail (file paths, module names) in `seam` and `done-when`,
  **never jammed into the title**; the checkpoint body pass then reconciles and lands
  that subject at the verify pause.
  Show the before/after for each, and **write only what the human approves**. A repair
  that inserts a step, or moves one ahead of another, keeps every number where it is and
  writes the sequence instead: shell `plumbbob order 7 8 5` with the undone steps in the
  sequence to build them, an inserted step included even when it builds last, and the
  `## Build order` line it writes is what every next-step pick follows. Never renumber,
  and never edit that line by hand.

  **A repair keeps the build ranges true.** When the plan carries `## Build ranges`,
  `plumbbob order` re-cuts them to follow the sequence it writes
  ([D109 (ranges-follow-the-order)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d109)):
  a step it places joins the range whose steps sit on both sides of it, else the one it
  builds ahead of, else the one it builds after, never a bare range, and never a range that
  has landed, since that range's call was made and the step would reopen it; its ending
  names each range it re-cut. Edit a range yourself only where the
  order cannot say it, and before you run the verb: a bare range of its own for a step
  that brings a call the human has to make before it lands, or a re-cut that moves where a
  call falls, shown in the same before/after
  ([D92 (build-ranges)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d92)).
  A new range takes the next free item number, and no item is renumbered, because the stop
  card's stamp, the detail file's header, and `plumbbob harvest` find a landed range by its
  number. A range the verb's ending names as still needing a re-cut is yours to re-cut in
  the same approved edit. Read `plumbbob status` once the edits are written: its ranges block carries a `⚠` row
  for a range naming a step the plan lacks, a step two ranges name, a step the build order
  puts inside a range that does not name it, and an undone step no range names, and none
  once the section is sound.
- **Re-cut the ranges (`/plumbbob:refine ranges`).** On request, re-cut the whole
  `## Build ranges` section against the plan as it stands, by the rule `/plumbbob:plan`
  cuts it with: a range ends where a human call is due (a decision the plan leaves open,
  a review before later steps build on what landed, or a thing only the human can do)
  and nowhere else, a bare build for a call made on a step's own work before it lands,
  every undone step in exactly one range, walked in build order, and a `- model:` line
  per range. A landed range stays as written, since its call was made. Show the section
  before and after, and write only what the human approves.

## The hard contracts

- **You propose; the human converges.** Surface holes and draft repairs, but the human
  approves every change to `intent.md`. Never guess a hole into a Decision.
- **Open questions for holes, edits for drift.** New uncertainty goes to
  `## Open questions`; settled drift gets repaired in place once the human OKs it.
- **Refine the plan, not the code.** `/plumbbob:refine` touches `intent.md` only; turning a
  decision into a diff is `/plumbbob:build` or your own hands, never this skill.
