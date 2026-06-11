<!--
intent.md — Plumbline canonical intent. Written in DESIGN, before any code. This
is the head. The chat is the hand. When the model floods you, read this, not your
memory.

SIZE TO THE WORK. A small change fills Frame + a couple Decisions and deletes the
rest. A medium feature fills it all. Ceremony on a one-liner is how you quit —
keep it mostly DECISIONS and CONSTRAINTS, not prose. Opinionated where decided,
explicit where open. If the implementor (you-later, or the LLM) has to guess, the
doc failed.
-->

# <one-line title of the change>

**STATE:** DESIGN | BUILD | REVIEW | SPIKE | FINISH
**Phase** (bookkeeping while in DESIGN): frame | interrogate | decide | triage
**Size:** tiny | small | medium

## Frame

*(You, on paper first. The problem in plain words — before any solution.)*

- **Problem:** <what's actually wrong / missing, and why it matters>
- **Smallest thing that solves it:** <the minimal change, not the ideal system>
- **Done looks like:** <the observable, checkable outcome>
- **Explicitly NOT doing:** <scope you are refusing, so it can't creep in>

## Architecture sketch

*(Hand-drawn is best. Photograph it in, or describe the boxes and arrows. The
point was forcing your model to form — this is just the residue.)*

```
<ascii, or a link to the paper sketch>
```

## Decisions

*(One line each. Settled, not re-litigated in the chat. Grows as INTERROGATE
surfaces holes and you resolve them, and as blockers fold in during BUILD.)*

- D1: <decision> — *because* <the one reason that mattered>
- D2: …
- D3: …

## Constraints

*(Hard rules the build must honor. The triage/review reads against these.)*

- C1: <e.g. functional/procedural only — no class/this/extends/inherits>
- C2: <e.g. no cross-package relative imports; no new dependencies>
- C3: <privacy / data-locality / perf budget>

## Steps

*(The build plan. Each step carries its own SEAM — the paths `plumbline build <n>`
writes into `.plumbline/SEAM` and the seam-guard enforces. Keep each step small
enough to verify in one review pass. A blocker may rewrite a step's seam: that's
expected — fold the new decision, revise the seam here, then `build <n>` again.)*

1. [ ] <step> — **done when:** <criterion, ideally a test or check result>
   - seam: `<file>`, `<file>`
2. [ ] <step> — **done when:** …
   - seam: `<file>`
3. [ ] <step> — **done when:** …
   - seam: `<file>`, `<file>`

## Open questions

*(Holes you could NOT resolve on paper. Do not guess them into Decisions. A
genuine fork goes to a SPIKE; record the verdict below and in Decisions.)*

- Q1: <unresolved> — *resolve by:* decide | spike | ask
- Q2: …

## Verdicts

*(Filled in as spikes and forks resolve — the audit trail of "these were my
calls.")*

- <date> — <fork> → chose <option> because <reason>; deleted <the rest>
