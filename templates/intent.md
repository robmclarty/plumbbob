<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.

Size to the work: a small change fills Frame + a couple of Decisions and deletes
the rest; a medium feature fills it all. Opinionated where decided, explicit where
open. If the implementor (you-later, or the LLM) has to guess, the doc failed.

One rule runs through the whole doc: compress what's settled; expand what's pending.
Decisions and Constraints stay one line each — they re-inject into every build step,
so their tokens recur. Open questions expand into plain-then-lean prose — a human
reads them once, to decide, and that legibility buys back a chat round-trip.
-->

# {{TITLE}}

**Phase** (your own bookkeeping while framing): frame
**Size:** tiny | small | medium
**Scope:** <short-scope>  <!-- the build's default commit scope (D4): a short feature-level name each step's own `(scope)` overrides. Leave the `<…>` placeholder (or blank) and it parses as absent — commits fall through to the build slug (D7). -->

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

*(One line each — settled, not re-litigated in the chat. Grows as you resolve the
holes `/plumbbob:refine` surfaces, and as blockers fold in during BUILD. Mint a two- or
three-word slug where each item is born — `D1 (slug-here)` — and copy that slug at
every reference site, so a later `D4 (default-waves)` never decays into a bare `D4`
a cold reader has to hunt down.)*

- D1 (slug-here): <decision> — *because* <the one reason that mattered>

## Constraints

*(Hard rules the build must honor. `/plumbbob:verify` and `/plumbbob:refine` read against these.
Slug and gloss them at birth too — `C1 (no-new-deps)` — same one line, same rule.)*

- C1 (no-new-deps): <e.g. functional/procedural only; no new dependencies>

## Steps

*(The build plan. `/plumbbob:plan` authors the **whole list up front** — each step a small,
verifiable increment with its own **done-when** and **seam** (the paths it will touch,
which `/plumbbob:build` records in the build folder's `SEAM` for orientation — awareness, not a lock).
An optional **model** line recommends the smallest model that can carry the step —
mechanical work runs fine on a small model; subtle or creative work earns a frontier
one. Advisory for the human, never a gate; write it plain, no backticks (D62).
The step title *is* the checkpoint's commit subject: write it as one plain line,
`type(scope): description` — load-bearing paths live in `seam`, never jammed into the
title (D2) — aiming for ≤72 characters (GitHub's subject convention: soft, no gate, D9).
The `(scope)` names the primary code area the step touches (`plan`, `commitmsg`); the
build's `**Scope:**` header is the feature-level catch-all a step overrides (D8). Scope
resolves title-scope → `**Scope:**` default → build slug → bare, and type resolves
title-type → `feat` (D3/D68). Then drive `/plumbbob:build` until done. Later steps may be
fuzzier than the first; sharpen the next one just-in-time with `/plumbbob:step` (empty input
auto-syncs it), and use `/plumbbob:refine` to repair the whole plan when a blocker rewrites it.)*

1. [ ] feat: <step> — **done when:** <criterion, ideally a test or check result>
   - seam: `<file>`, `<file>`
   - model: <smallest that can carry it, e.g. sonnet — mechanical, fully specified>
2. [ ] <step> — **done when:** <criterion>
   - seam: `<file>`

## Open questions

*(Holes you could NOT resolve on paper — the one section that expands rather than
compresses. Do not guess them into Decisions; a genuine fork goes to a SPIKE, with
the verdict recorded below and in Decisions.)*

<!--
Write each open question so a cold reader could answer it without flipping back to
the code or the chat — that cold-reader test is the whole point of expanding it.
Three lines:

  · the opener — the hole as a question, slugged at birth, tagged
    *resolve by:* decide | spike | ask
  · *plain:* — what's at stake, in plain words: the context and the cost of getting
    it wrong, enough to judge it cold
  · *lean:* — the model's proposed resolution: one answer to react to, not a menu

The human reads *plain* to understand, then *lean* to approve or redirect — one
pass, no round-trip.

When a question resolves, swap *resolve by:* for *resolved:* <date, the call> ON THE
OPENER LINE, e.g.

  - Q3 (default-waves): *resolved:* 2026-07-18, default off

The status counter reads opener lines only, so a *resolved:* left on a *plain:* or
*lean:* sub-line leaves the question still counted as open.

Size to the work: a tiny build's single, obvious question may stay one bare line —
the *plain:*/*lean:* pair earns its keep only when a human decision genuinely waits
on it.
-->

- Q1 (slug-here): <the unresolved hole, framed as a question> — *resolve by:* decide | spike | ask
  - *plain:* <what's at stake, in plain words — enough to judge it cold>
  - *lean:* <the model's proposed resolution — the answer to react to>

## Verdicts

*(Filled in as spikes and forks resolve — the audit trail of "these were my calls.")*

- <date> — <fork> → chose <option> because <reason>; deleted <the rest>
