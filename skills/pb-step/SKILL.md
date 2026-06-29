---
name: pb-step
description: Revise the next increment just-in-time — sharpen the next undone step against what's now true, or (with input) re-cut, split, or add a step. Empty input runs an automatic sharpen. One at a time; the human approves.
disable-model-invocation: true
model: opus
allowed-tools: Read, Edit, Bash(plumbbob status:*)
---

# Plumbbob — revise the next step (the single-increment move)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not found - install the dep and re-run: npm i -g plumbbob && plumbbob init"`

`/pb-plan` authors the **whole** step list up front, so `/pb-step` is the
**just-in-time revision** move: it keeps the *next* undone step honest against what the
build has actually taught you, right before you `/pb-build` it. (Framing the whole goal
is the separate `/pb-plan` move.) It can also add or re-cut a step when scope genuinely
grew — but its everyday job is to sharpen, not to invent.

## Two ways to fire it

- **`/pb-step` (no input) → automatic sharpen.** Re-examine the next undone step
  against the completed code, the Decisions, the Constraints, and the build-log, then
  make the obvious revisions to its **done-when** and **seam** so it matches reality —
  e.g. a file moved, a decision narrowed the scope, an earlier step already did part of
  it. This is the zero-effort "keep my next step in sync" move: if the human does
  nothing else, the next step stays current.
- **`/pb-step <what changed>` → directed revision.** Take the human's input and propose
  the matching change: tighten the done-when, adjust the seam, split the step in two, or
  add a new increment the plan was missing.

## What this skill does

1. **Read the plan and the reality.** Read `intent.md`'s Frame, Decisions, Constraints,
   and the steps already done, plus the next undone step, to see what it *should* now be.
2. **Propose the revision** (or the new/split step): a one-line **title**, a **done-when**
   `/pb-verify` can validate, and a **seam** (exact paths, or a `dir/` grant). Keep it
   small enough to verify in one review pass. Show the before/after so the human can see
   what you changed and why.
3. **Get the human's OK**, then write it into `## Steps` in the standard format —
   `N. [ ] <title> — **done when:** <criterion>` with a `- seam:` sub-line. Revise the
   existing step in place; only append when you are genuinely adding an increment.

## The hard contracts

- **One verifiable increment.** Each step carries a done-when `/pb-verify` can check
  and a seam small enough to review in one pass.
- **Edit `## Steps` only**, in the standard format `status` and `build` parse — never
  the Roadmap, never loose prose. A done step (`[x]`) is history; do not rewrite it.
- **The human approves the revision** before it lands. You propose; they decide.
