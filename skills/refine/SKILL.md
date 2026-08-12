---
name: refine
description: "Keep intent.md true — attack the plan for holes (append as Open questions) and refine or repair the Frame, Decisions, Constraints, and Steps to match reality. Usable at any point; you propose, the human approves."
argument-hint: "[focus]"
disable-model-invocation: true
allowed-tools: Read, Edit, Bash(plumbbob status:*)
---

# PlumbBob — refine the plan

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/plumbbob:refine` keeps `intent.md` honest. Use it at **any point** — right after `/plumbbob:plan`
to stress-test a fresh frame, or mid-build to repair a plan that drifted from what the
code is actually doing. It is the document-level complement to `/plumbbob:step` (which only
sharpens the *next* step): `/plumbbob:refine` works the *whole* plan.

## No-session refusal

This skill refines an existing plan, so it needs one. Read the state injected above: if
it is `NO ACTIVE SESSION`, **refuse** in one line and tell the human to run
`plumbbob start "<title>"` (or `/plumbbob:plan`) first, and edit nothing. Every active state
is fine — refining is always available.

## Two modes

- **Attack (diverge in the problem space).** Hand the **Frame**, **Decisions**, and
  **Architecture sketch** a cold, adversarial read and surface holes — ambiguities,
  unhandled edge cases, hidden assumptions, collisions with the existing code. Append
  each under `## Open questions` in the expanded form the template shows — an opener
  line (the hole as a question, anchored and slugged at birth like any Decision —
  `- <a id="q2"></a>**Q2 (some-slug)**: …` — so a `[Q2 (some-slug)](#q2)` reference
  elsewhere in the file lands on it), a `*plain:*` sub-line (what's at stake in plain
  words, enough to judge it cold), and a `*lean:*` sub-line (your proposed resolution —
  one answer to react to, not a menu). Never
  append a hole as a Decision: resolving it is the human's convergence, not yours —
  the lean proposes; this mode surfaces, it does not decide. (A tiny, obvious question
  may stay one bare line; the sub-lines earn their keep only when a human decision
  genuinely waits on it.)

  Then walk the human through it in the chat: list every hole you appended, each as
  its explanation first and its lean second, and invite per-question answers — the
  human can settle any of them right there in one message, no doc-flipping, no extra
  round-trip per hole.
- **Repair (re-sync to reality).** When the plan has drifted — a Decision was overtaken
  by what you built, a Constraint changed, a Step no longer matches the seam, or a
  **step's title no longer describes what the diff actually does** — propose the edits
  that bring `intent.md` back in line with the truth. A step title *is* its checkpoint
  commit subject — [D68 (conventional-subjects)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d68) — so bringing a drifted one back in line
  means keeping it a plain, single-line `type(scope): description` subject, with
  load-bearing detail (file paths, module names) in `seam` and `done-when`,
  **never jammed into the title** — the checkpoint body pass then reconciles and lands
  that subject at the verify pause.
  Show the before/after for each, and **write only what the human approves**.

## The hard contracts

- **You propose; the human converges.** Surface holes and draft repairs, but the human
  approves every change to `intent.md`. Never guess a hole into a Decision.
- **Open questions for holes, edits for drift.** New uncertainty goes to
  `## Open questions`; settled drift gets repaired in place once the human OKs it.
- **Refine the plan, not the code.** `/plumbbob:refine` touches `intent.md` only — turning a
  decision into a diff is `/plumbbob:build` or your own hands, never this skill.
