---
name: pb-refine
description: Keep intent.md true — attack the plan for holes (append as Open questions) and refine or repair the Frame, Decisions, Constraints, and Steps to match reality. Usable at any point; you propose, the human approves.
argument-hint: "[focus]"
disable-model-invocation: true
allowed-tools: Read, Edit, Bash(plumbbob status:*)
---

# PlumbBob — refine the plan

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/pb-refine` keeps `intent.md` honest. Use it at **any point** — right after `/pb-plan`
to stress-test a fresh frame, or mid-build to repair a plan that drifted from what the
code is actually doing. It is the document-level complement to `/pb-step` (which only
sharpens the *next* step): `/pb-refine` works the *whole* plan.

## No-session refusal

This skill refines an existing plan, so it needs one. Read the state injected above: if
it is `NO ACTIVE SESSION`, **refuse** in one line and tell the human to run
`plumbbob start "<title>"` (or `/pb-plan`) first, and edit nothing. Every active state
is fine — refining is always available.

## Two modes

- **Attack (diverge in the problem space).** Hand the **Frame**, **Decisions**, and
  **Architecture sketch** a cold, adversarial read and surface holes — ambiguities,
  unhandled edge cases, hidden assumptions, collisions with the existing code. Append
  each as a one-line question under `## Open questions`, **never** as a Decision:
  resolving a hole is the human's convergence, not yours. This mode surfaces; it does
  not decide.
- **Repair (re-sync to reality).** When the plan has drifted — a Decision was overtaken
  by what you built, a Constraint changed, a Step no longer matches the seam — propose
  the edits that bring `intent.md` back in line with the truth. Show the before/after for
  each, and **write only what the human approves**.

## The hard contracts

- **You propose; the human converges.** Surface holes and draft repairs, but the human
  approves every change to `intent.md`. Never guess a hole into a Decision.
- **Open questions for holes, edits for drift.** New uncertainty goes to
  `## Open questions`; settled drift gets repaired in place once the human OKs it.
- **Refine the plan, not the code.** `/pb-refine` touches `intent.md` only — turning a
  decision into a diff is `/pb-build` or your own hands, never this skill.
