---
name: pb-step
description: Plan the next increment — propose one small step with a done-when criterion and a seam, get the human's OK, and append it to intent's ## Steps. One by default; several only if the human already knows them.
disable-model-invocation: true
model: opus
allowed-tools: Read, Edit, Bash(__PLUMBBOB_BIN__ status:*)
---

# Plumbbob — plan the next step (the single-increment move)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

`/pb-step` plans the **next increment** just-in-time (D6) — the smallest verifiable
piece of the framed goal, planned only when you reach it. (Framing the whole goal is
the separate `/pb-plan` move.)

## What this skill does

1. **Read the plan.** Read `intent.md`'s Frame, Decisions, Constraints, and the steps
   already done, to see what the *next* increment should be.
2. **Propose one step.** Draft a single step:
   - a one-line **title**,
   - a **done-when** criterion — ideally a test or check result, something
     `/pb-verify` can actually validate,
   - a **seam**: the specific files it should touch (exact paths, or a `dir/` grant).
   Keep it small enough to verify in one review pass.
3. **Get the human's OK**, then **append** it to `## Steps` in the standard format —
   `N. [ ] <title> — **done when:** <criterion>` with a `- seam:` sub-line. Default
   to **one** step; plan several only when the human already knows them.

## The hard contracts

- **One verifiable increment.** Each step carries a done-when `/pb-verify` can check
  and a seam small enough to review in one pass.
- **Append to `## Steps` only**, in the standard format `status` and `build` parse —
  never the Roadmap, never loose prose.
- **The human approves the step** before it lands. You propose; they decide.
