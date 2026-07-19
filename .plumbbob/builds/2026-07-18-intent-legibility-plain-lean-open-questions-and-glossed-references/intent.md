<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.
-->

# Intent legibility: plain-lean open questions and glossed references

**Phase** (bookkeeping while in DESIGN): plan approved 2026-07-18
**Size:** small

*Source: `research/08-intent-legibility.md` (the findings this build applies).*

## Frame

- **Problem:** intent.md's open questions read machine-like — pb-refine literally
  mandates one-line questions, the template has no slot for a recommendation, and
  bare numbered references (D4, C6) force doc-flipping — so the human can't judge
  questions cold and pays for it in chat round-trips.
- **Smallest thing that solves it:** change the *authoring guidance* — the template
  and the skill prose — plus one narrow parser fix (slug-aware open-question
  counting) and its regression pins. research/08 verified the *plain* expanded form
  is parser-safe, but the slugged opener form D3/R2 mandate is not, so the counter
  has to learn the slug.
- **Done looks like:** a fresh `/pb-plan` or `/pb-refine` session scaffolds and
  authors open questions in the plain/lean form with glossed references, and the
  status open-question count is test-pinned as unaffected by the sub-lines.
- **Explicitly NOT doing:** no companion "plain English" doc; no `src/` parser
  changes beyond slug-aware open-question counting; no agent-envelope changes; no
  loosening of the one-line convention for Decisions/Constraints; no retrofitting of
  existing build folders.

## Architecture sketch

```
templates/intent.md ──scaffolds──▶ .plumbbob/builds/<slug>/intent.md
skills/pb-plan, pb-refine ──author─▶   ## Open questions (opener + *plain:* + *lean:*)
src/lib/orient.ts parseOpenQuestions ◀─counts opener lines only (pinned, unchanged)
```

## Decisions

- D1 (expand-in-place): no companion doc; open questions expand in place — *because*
  a second address with a sync obligation is doc-drift by construction, and the
  expansion self-collapses on resolution.
- D2 (plain-lean-format): each real open question is an opener plus `*plain:*`
  (cold-reader explanation, stakes included) and `*lean:*` (the model's proposed
  resolution) sub-lines — *because* explanation-before-recommendation is what lets
  the human answer without round-trips (research/08 R1).
- D3 (slug-at-birth): numbered items mint a two-or-three-word slug where they are
  born — `D4 (default-waves): ...` — and reference sites copy it — *because* glosses
  stay consistent when copied, not re-invented (research/08 R2).
- D4 (settled-stays-compact): Decisions/Constraints remain one-line-with-*because* —
  *because* they are re-injected into every user-agent envelope per step
  (`agents.ts` scrape); those tokens recur, question prose does not.
- D5 (resolved-on-opener): the `*resolved:*` marker must land on the question's
  opener line — *because* `parseOpenQuestions` (orient.ts) tests opener lines only;
  the template documents this edge.
- D6 (size-to-work): a tiny build's single obvious question may stay one line —
  *because* the sub-lines earn their keep only when a question genuinely waits on a
  human decision; ceremony on a one-liner stays the failure mode.
- D7 (placeholder-uncounted): the template's scaffolded Q placeholder must never
  count as open, and the test pinning that lands BEFORE the template is touched —
  *because* a fresh build showing "open questions 1" is shipped noise, and today
  the placeholder is uncounted only by the "unresolved"-contains-"resolved"
  accident (Q1 (placeholder-count-trap), approved 2026-07-18).

## Constraints

- C1 (guidance-only): the only `src/` parser change is slug-aware open-question
  counting in `orient.ts` (step 2, pinned by tests) — every other parser behavior
  stays pinned, never modified.
- C2 (doorway-freeze): no agent-envelope changes (standing, research/07).
- C3 (pins-travel-with-prose): every SKILL.md wording change lands in the same step
  as its contract-pin update in `test/contract/skills.test.ts`.

## Steps

1. [x] Pin the parser: expanded questions don't move the count — **done when:**
   `orient.test.ts` gains passing cases: `*plain:*`/`*lean:*` sub-lines under an
   opener are not counted; `*resolved:*` on the opener drops it; the word
   "resolved" on a sub-line does NOT resolve the opener; and the real
   `templates/intent.md` parses to an open-question count of 0 — the
   D7 (placeholder-uncounted) pin, landing before step 3 touches the template
   - seam: `src/lib/__tests__/orient.test.ts`
   - model: sonnet — mechanical, fully specified by the done-when
2. [ ] Slug-aware open-question counting: parseOpenQuestions counts slugged
   openers — **done when:** `parseOpenQuestions` (orient.ts) counts a slugged
   opener `- Q2 (some-slug): ...` as OPEN and still drops it when `*resolved:*`
   lands on that opener; `orient.test.ts` pins the slugged-open and
   slugged-resolved cases; the plain form and the
   real-`templates/intent.md`-parses-to-0 pin (step 1) still hold; full check green
   - seam: `src/lib/orient.ts`, `src/lib/__tests__/orient.test.ts`
   - model: sonnet — a one-line regex extension (`/^- Q\d+(?: \([^)]+\))?:/`), fully
     specified by the done-when
3. [ ] templates/intent.md: plain/lean question form, slugged Decisions, header
   principle — **done when:** the template shows the three-line Q form with its
   guidance comment (cold-reader test, D5 (resolved-on-opener) edge, D6
   (size-to-work) sizing rule), the slug-at-birth D form, and the "compress what's
   settled; expand what's pending" header sentence; the placeholder keeps a
   "resolved"-bearing token so it stays uncounted (D7 (placeholder-uncounted),
   step 1's pin proves it); full check green
   - seam: `templates/intent.md`
   - model: opus — the template prose is the product
4. [ ] skills/pb-refine: attack mode authors and presents the expanded form —
   **done when:** attack mode instructs the opener+plain+lean form (dropping
   "one-line question") and the walkthrough chat presentation (every hole listed
   with explanation then lean, inviting per-question answers); a new contract pin
   matches `*plain:*` and `*lean:*` in the body; contract suite green
   - seam: `skills/pb-refine/SKILL.md`, `test/contract/skills.test.ts`
   - model: opus — skill prose sets future authoring behavior
5. [ ] skills/pb-plan: glossed-reference + slug-at-birth house style — **done
   when:** the Decisions/Open-questions authoring steps carry the slug-at-birth
   and never-a-bare-reference sentences; a new contract pin matches them; suite
   green
   - seam: `skills/pb-plan/SKILL.md`, `test/contract/skills.test.ts`
   - model: opus — skill prose sets future authoring behavior
6. [ ] Docs sweep: techniques.md principle + pb-park one-clause why — **done
   when:** `docs/techniques.md` carries the compression principle and the
   glossed-reference style; `skills/pb-park/SKILL.md`'s compose guidance adds the
   one-clause-why; check green
   - seam: `docs/techniques.md`, `skills/pb-park/SKILL.md`
   - model: sonnet — mechanical doc sweep from settled decisions

## Open questions

*(research/08's forks arrived resolved; this one came out of the refine attack.)*

- Q1 (placeholder-count-trap): the template's question placeholder is uncounted
  only by accident — *resolved:* 2026-07-18, pin-first — became
  D7 (placeholder-uncounted); the template-count test lands in step 1, before
  step 2 touches the placeholder.

## Verdicts

- 2026-07-18 — companion "plain English" doc vs expand-in-place → chose
  expand-in-place because the sync obligation has no enforcing mechanism; rejected
  the companion doc in research/08.
- 2026-07-18 — Q1 (placeholder-count-trap) → chose pin-first (a test reads the
  real `templates/intent.md`, asserts open-question count 0, lands in step 1
  before the template rewrite) because a silent count regression would ship noise
  to every fresh build; the human approved with "unit test before fixing".
