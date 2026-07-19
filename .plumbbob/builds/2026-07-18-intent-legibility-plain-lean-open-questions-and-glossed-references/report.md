# Report — Intent legibility: plain-lean open questions and glossed references

**Size:** small · **Phase:** DESIGN → done · plan approved 2026-07-18, built 2026-07-19
**Source:** `research/08-intent-legibility.md`

## What shipped

intent.md's open questions read machine-like — a mandated one-line form, no slot for a
recommendation, and bare numbered references (D4, C6) that forced doc-flipping. This build
changed the **authoring guidance** (template + skill prose) and made the one narrow parser
change that the new form required, so a fresh `/pb-plan` or `/pb-refine` session now
scaffolds and authors questions the legible way, and the status count stays honest.

Landed across six checkpointed steps:

- **The parser learned the new form, pins first.** `parseOpenQuestions` now counts a
  slugged opener (`- Q2 (some-slug): …`) as open and drops it when `*resolved:*` lands on
  that opener, while `*plain:*`/`*lean:*` sub-lines never move the count. The
  regression pin — including "the real `templates/intent.md` parses to 0 open" — landed in
  step 1, *before* the template was touched, so no count regression could ship silently
  (D7).
- **The template + skills teach the legible house style.** `templates/intent.md` shows the
  three-line question form (opener + `*plain:*` + `*lean:*`), slug-at-birth Decisions, and
  the "compress what's settled; expand what's pending" principle. `pb-refine` attack mode
  authors and walks through the expanded form; `pb-plan` carries the slug-at-birth /
  never-a-bare-reference house style; `docs/techniques.md` states the principle and the
  glossed-reference style; `pb-park`'s compose guidance gains a one-clause-why. Every
  SKILL.md wording change traveled with its contract pin (C3).

## Decisions and why

- **D1 (expand-in-place)** — no companion "plain English" doc; questions expand in place,
  because a second address carries a sync obligation with no enforcing mechanism (it is
  doc-drift by construction), and the expansion self-collapses on resolution.
- **D2 (plain-lean-format)** — each real question is an opener + `*plain:*` (cold-reader
  explanation, stakes included) + `*lean:*` (the model's proposed resolution), because
  explanation-before-recommendation is what lets the human answer without round-trips.
- **D3 (slug-at-birth)** — numbered items mint a short slug where born and reference sites
  copy it, because glosses stay consistent when copied, not re-invented.
- **D4 (settled-stays-compact)** — Decisions/Constraints stay one-line-with-*because*
  because they are re-injected into every user-agent envelope per step; those tokens recur,
  question prose does not.
- **D5 (resolved-on-opener)** — the `*resolved:*` marker must sit on the opener line
  because the parser tests opener lines only; the template documents this edge. (This build
  hit the edge in its own dogfood folder — see below.)
- **D7 (placeholder-uncounted)** — the scaffolded Q placeholder must never count as open,
  and its pin lands before the template is touched, because a fresh build showing
  "open questions 1" is shipped noise.

## Parked & harvested

Two items parked mid-build, both triaged at the closing boundary:

- **tangent (killed)** — "slug-at-birth Q opener breaks parseOpenQuestions' regex." Real
  risk, but already closed by step 2, which taught the counter the slug and pinned it.
- **blocker (fixed now)** — this build's own `intent.md` showed `open questions 1`: Q1's
  `*resolved:*` sat on its second line, so per D5 the parser counted it as open — the exact
  D7 shipped-noise case, caught in our own dogfood folder. Moved the marker onto the Q1
  opener; status now reads `open questions 0`.

## Final status

**Done.** All six steps checkpointed, full check green at each, `parked 0 · open questions
0`. No `src/` change beyond the slug-aware count (C1 held); no agent-envelope change (C2);
every skill-prose change paired with its contract pin (C3).

One deliberate seam extension: step 6 touched `test/contract/skills.test.ts` (outside its
declared `docs/` + `skills/pb-park/` seam) to carry the pb-park contract pin, honoring C3 —
flagged at checkpoint, not silent drift.

## Deferred tangents (future work)

- **Readable commit subjects (a D68 amendment).** Surfaced at close-out, not parked: the
  Conventional-Commit subject uses the full build slug as scope and the raw step title as
  description, so it reads long and line-item-ish. The open decision is *where a short,
  meaningful scope comes from* (human-picked at `start` vs. seam-derived vs. slug-truncated).
  Its own small build, to be planned next.

## Checkpoints

- baseline 28030a2714c23ddcd155eb556be25708409f6052
- plan 0b8d9ba0acc2d51ebdde79e35564eb6360498cc0
- step 1 56330dc1497b59cb4fe784027b8eaf7ac903952a
- step 2 959c84e27863a4a015962b81be6fc14340988e44
- step 3 ecb5199143e90b5c00acee7465d034395e32c6c7
- step 4 b105b702d1972c36d686870576ddd5a857989ffd
- step 5 f04fbbc140e397651549aae15c8a4f5caca23ef0
- step 6 920b9f08227513950cc21e00faaf19243a407654

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
|------|------------|----------------|---------|------------|
| 1 | 0 | 0 | 0 | 27m |
| 2 | 0 | 0 | 0 | 7m |
| 3 | 0 | 0 | 0 | 7m |
| 4 | 0 | 0 | 0 | 4m |
| 5 | 0 | 0 | 0 | 9m |
| 6 | 0 | 1 | 0 | 11m |
| **total** | 0 | 1 | 0 | 64m |
