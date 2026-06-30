<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.

Size to the work: a small change fills Frame + a couple of Decisions and deletes
the rest; a medium feature fills it all. Opinionated where decided, explicit where
open. If the implementor (you-later, or the LLM) has to guess, the doc failed.
-->

# {{TITLE}}

**Phase** (your own bookkeeping while framing): frame
**Size:** tiny | small | medium

## Frame

*(You, on paper first. The problem in plain words — before any solution.)*

- **Problem:** <what is wrong or missing, and why it matters>
- **Smallest thing that solves it:** <the minimal change, not the ideal system>
- **Done looks like:** <the observable, checkable outcome>
- **Explicitly NOT doing:** <scope you are refusing, so it cannot creep in>

## Architecture sketch

*(Hand-drawn is best. Photograph it in, or describe the boxes and arrows.)*

```
<ascii, or a link to the paper sketch>
```

## Decisions

*(One line each. Settled, not re-litigated in the chat. Grows as you resolve the
holes `/plumbbob:pb-refine` surfaces, and as blockers fold in during BUILD.)*

- D1: <decision> — *because* <the one reason that mattered>

## Constraints

*(Hard rules the build must honor. `/plumbbob:pb-verify` and `/plumbbob:pb-refine` read against these.)*

- C1: <e.g. functional/procedural only; no new dependencies>

## Steps

*(The build plan. `/plumbbob:pb-plan` authors the **whole list up front** — each step a small,
verifiable increment with its own **done-when** and **seam** (the paths it will touch,
which `/plumbbob:pb-build` records in `.plumbbob/SEAM` for orientation — awareness, not a lock
in v2). Then drive `/plumbbob:pb-build` until done. Later steps may be fuzzier than the first;
sharpen the next one just-in-time with `/plumbbob:pb-step` (empty input auto-syncs it), and use
`/plumbbob:pb-refine` to repair the whole plan when a blocker rewrites it.)*

1. [ ] <step> — **done when:** <criterion, ideally a test or check result>
   - seam: `<file>`, `<file>`
2. [ ] <step> — **done when:** <criterion>
   - seam: `<file>`

## Open questions

*(Holes you could NOT resolve on paper. Do not guess them into Decisions. A genuine
fork goes to a SPIKE; record the verdict below and in Decisions.)*

- Q1: <unresolved> — *resolve by:* decide | spike | ask

## Verdicts

*(Filled in as spikes and forks resolve — the audit trail of "these were my calls.")*

- <date> — <fork> → chose <option> because <reason>; deleted <the rest>
