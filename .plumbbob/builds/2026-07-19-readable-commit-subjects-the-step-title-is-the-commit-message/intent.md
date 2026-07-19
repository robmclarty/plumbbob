<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.

One rule runs through the whole doc: compress what's settled; expand what's pending.
-->

# Readable commit subjects: the step title is the commit message

**Phase** (bookkeeping while framing): frame
**Size:** medium
**Scope:** commit-subject  <!-- the per-build default scope (D4); steps override it -->

## Frame

- **Problem:** the checkpoint commit subject reads badly in `git log`. It is assembled
  deterministically (D68) as `type(scope): description`, where `scope` is the whole
  build slug (`intent-legibility-plain-lean-open-questions-and-glossed-references`) and
  `description` is the raw step title — which today is authored as a line-item
  (`skills/pb-plan: glossed-reference + slug-at-birth house style`). The result is long,
  redundant, and hard to read. The fix can't live at checkpoint time: that's the dumb
  assembler, with no inference to draw a good scope or sentence from.
- **Smallest thing that solves it:** relocate the *editorial* judgment to plan time,
  where inference and the full frame live, by making the **step title line itself the
  Conventional-Commit subject** — one source of truth the human authors and edits once.
  Push load-bearing detail (file paths) out of the title into `seam`/`done-when`. Add a
  per-build **default scope** with per-step overrides, and a graceful, deterministic
  scope fallback chain. Checkpoint stays a deterministic assembler; the existing `-m`
  override is the drift safety-valve.
- **Done looks like:** a fresh `/pb-plan` authors step titles as clean `type(scope):
  description` subjects, sets a short build-default scope, and each checkpoint lands a
  readable subject in `git log` verbatim from the title. The scope fallback chain is
  unit-pinned, and a build with neither a title scope nor a `**Scope:**` field still
  behaves exactly as today (back-compat).
- **Explicitly NOT doing:** no new per-step `type`/`scope`/`description` fields — the
  title already carries all three; no rewrite of D68's deterministic assembly (we extend
  the fallback, not replace it); no agent-authored-by-default subjects (the `-m`
  reconcile stays an exception); no new dependency; no retro-fix of already-committed
  subjects; no change to agent envelopes.

## Architecture sketch

```
intent.md **Scope:** header ─┐
step title `type(scope): desc` ─┼─▶ parseStepMeta (title) ─▶ subjectForStep
                              │        scope: title-scope → build-default → slug → bare
                              │        type:  title-type   → feat
git diff at checkpoint ───────┘─▶ body pass may reconcile via -m on genuine drift (D5)
```

## Decisions

- D1 (title-is-subject): the step title line *is* the Conventional-Commit subject —
  `type(scope): description`, authored once — *because* a separate description field is a
  second thing to keep in sync, and the title already parses cleanly with colons/parens
  (`parseStepMeta` splits at `**done when:**`; `subjectFromTitle` honors an author prefix
  verbatim), so the plumbing already exists.
- D2 (paths-leave-the-title): load-bearing detail (file paths, module names) lives in
  `seam` and `done-when`, never the title — *because* the title must read as plain human
  English and as a clean commit subject at the same time, which a jammed-in `path:` prefix
  breaks.
- D3 (scope-fallback-chain): scope resolves title-scope → build-default → slug → bare, and
  type resolves title-type → `feat` — *because* it degrades gracefully from the most
  specific (human-authored per step) to the most deterministic, and the slug rung keeps
  field-less builds working unchanged.
- D4 (build-default-scope-header): the per-build default scope is a single `**Scope:**`
  header field in `intent.md`, authored once at plan time — *because* it is the catch-all
  (Q-answer 2): set once, and steps typically override it with their own `(scope)`.
- D5 (subject-synced-on-drift): `/pb-step` and `/pb-refine` keep the title-subject honest
  as the plan sharpens or drifts, and the checkpoint body pass (`/pb-build`, `/pb-verify`)
  may reconcile a genuinely-drifted subject via the existing `-m` override — *because* the
  subject is authored at plan time but the diff lands at build time, and that pass is
  already making a judgement call there (Q-answer 4).
- D6 (determinism-preserved): the deterministic title-derived subject stays the default;
  the `-m` reconcile is an exception for real drift, human-approved — *because* D68's
  CLI-owned, unit-testable assembly is the guarantee we keep, not agent-authored subjects.
- D7 (scope-placeholder-absent): an unfilled `**Scope:**` — angle-bracket placeholder or
  empty — parses as *absent* and falls through to the slug rung, and that pin lands in
  step 1 BEFORE step 2 gives the template the placeholder — *because* a scaffolded-but-
  unfilled scope must never land commits scoped `(<scope>)` (the legibility build's D7
  placeholder trap, one field over).
- D8 (scope-names-code-area): a step's `(scope)` names the primary code area/module it
  touches (`pb-plan`, `commitmsg`, `docs`); the build-default `**Scope:**` names the
  feature as the catch-all — *because* a code-area scope stays consistent and greppable
  across builds, where a per-author feature label drifts.
- D9 (subject-length-soft): step titles aim for ≤72 characters (GitHub's subject
  convention), soft guidance with no lint or gate — *because* the human reads the title at
  plan time and again at the pause, so a checkride rule is ceremony a soft convention
  doesn't need.

## Constraints

- C1 (pins-travel-with-prose): every SKILL.md / template wording change lands in the same
  step as its contract-pin update in `test/contract/skills.test.ts` (carried forward from
  the legibility build's C3).
- C2 (back-compat): a build with no `**Scope:**` field and scopeless titles keeps today's
  behavior — slug-derived scope, `feat` default — so no existing or in-flight build breaks.
- C3 (no-new-deps): functional/procedural, node-builtins-only; no new dependency.

## Steps

1. [ ] feat: fall back through step scope, build default, then slug —
   **done when:** `subjectForStep` resolves the scope as title-scope → `**Scope:**`
   default → build slug → bare, and the type as title-type → `feat`; a new
   `parseBuildScope` reads the header field; unit tests pin all four scope rungs, the
   type default, back-compat (no `**Scope:**` ⇒ today's slug behavior, unchanged), and the
   unfilled-placeholder case (an angle-bracket or empty `**Scope:**` ⇒ absent → slug, D7 —
   pinned HERE, before step 2 adds the placeholder); the `chore(scope): plan` and
   `chore(scope): finish` subjects use the same default; full check green
   - seam: `src/lib/intent.ts`, `src/verbs/checkpoint.ts`, `src/verbs/finish.ts`,
     `src/verbs/__tests__/checkpoint.test.ts`, `src/lib/__tests__/intent.test.ts`
   - model: sonnet — a bounded parser + fallback chain, fully specified by the done-when
2. [ ] docs(intent-template): make the step title double as the commit subject —
   **done when:** `templates/intent.md` carries the `**Scope:**` header field with its
   guidance, and the `## Steps` guidance states that the title *is* the commit subject
   (plain single line, `type(scope): description`), that paths live in `seam` not the
   title, how the scope fallback resolves (D3), that a `(scope)` names the code area with
   the `**Scope:**` default as the feature catch-all (D8), and the soft ≤72-char aim (D9);
   full check green
   - seam: `templates/intent.md`
   - model: opus — the template prose is the product
3. [ ] feat(pb-plan): author titles as commit subjects and set the build scope —
   **done when:** the Steps-authoring guidance instructs a plain `type(scope):
   description` title with paths kept in `seam`, directs setting the `**Scope:**` default
   plus per-step overrides that name the code area (D8), and notes the soft ≤72-char aim
   (D9); a contract pin matches the new guidance; suite green
   - seam: `skills/pb-plan/SKILL.md`, `test/contract/skills.test.ts`
   - model: opus — skill prose sets future authoring behavior
4. [ ] feat(pb-step): keep the sharpened title a clean commit subject —
   **done when:** the sharpen guidance keeps the next step's title a plain `type(scope):`
   subject (paths to `seam`) and lets it override the build scope; a contract pin matches;
   suite green
   - seam: `skills/pb-step/SKILL.md`, `test/contract/skills.test.ts`
   - model: opus — skill prose sets future authoring behavior
5. [ ] feat(pb-refine): resync the commit subject when the plan drifts —
   **done when:** repair mode's guidance names the title-subject as something to bring back
   in line when the plan drifts from the diff (D5); a contract pin matches; suite green
   - seam: `skills/pb-refine/SKILL.md`, `test/contract/skills.test.ts`
   - model: opus — skill prose sets future authoring behavior
6. [ ] feat(pb-verify): present a reconciled subject at the pause before it lands —
   **done when:** `/pb-verify` and `/pb-build` document that when the diff has drifted from
   the planned title, the body pass PRESENTS a reconciled subject at the verify pause
   (planned title → proposed subject) for explicit approval and lands it via `-m`; with
   nothing presented, the deterministic title-derived subject lands (D5/D6/Q5); contract
   pins for both match; suite green
   - seam: `skills/pb-verify/SKILL.md`, `skills/pb-build/SKILL.md`,
     `test/contract/skills.test.ts`
   - model: opus — skill prose sets future authoring behavior
7. [ ] docs: record the title-is-subject rule and the D68 amendment —
   **done when:** `docs/techniques.md` states the step-title-is-the-subject rule and the
   scope fallback chain, and `docs/decisions.md`'s D68 entry is amended to note the
   title-carries-the-subject shape and the default-scope fallback; check green
   - seam: `docs/techniques.md`, `docs/decisions.md`
   - model: sonnet — a mechanical doc sweep from settled decisions

## Open questions

*(Both forks came out of the plan review and resolved to their leans, 2026-07-19.)*

- Q1 (focus-field-need): *resolved:* 2026-07-19 — skip a `focus` field; treat `seam`'s
  first entry as the step's primary file.
- Q2 (slug-rung-keep-or-drop): *resolved:* 2026-07-19 — keep the slug rung as the
  penultimate deterministic fallback (bare last), for back-compat (C2).
- Q3 (scope-placeholder-trap): *resolved:* 2026-07-19 — parse an unfilled `**Scope:**`
  placeholder as absent; pin it in step 1 before step 2 adds the placeholder (→ D7).
- Q4 (subject-length-target): *resolved:* 2026-07-19 — soft aim ≤72 chars (GitHub
  convention), guidance only, no lint (→ D9).
- Q5 (reconcile-visibility): *resolved:* 2026-07-19 — present any reconciled subject at the
  verify pause for explicit approval; else the title-derived subject lands (→ step 6).
- Q6 (what-a-scope-names): *resolved:* 2026-07-19 — a `(scope)` names the primary code area;
  the build-default names the feature as catch-all (→ D8).

## Verdicts

*(Filled in as forks resolve — the audit trail of "these were my calls.")*

- 2026-07-19 — Q1 (focus-field-need) → chose seam's-first-entry-as-primary over a new
  `focus` field, because `seam` already carries every path and a duplicate field adds the
  sync cost this build is cutting.
- 2026-07-19 — Q2 (slug-rung-keep-or-drop) → chose keep-the-slug-rung (penultimate, bare
  last), because dropping it would change behavior for every field-less or in-flight build
  (C2 back-compat).
- 2026-07-19 — Q3 (scope-placeholder-trap) → chose parse-placeholder-as-absent, pinned in
  step 1 before the template gains it (→ D7), because an unfilled scope must never land a
  commit scoped `(<scope>)` (the legibility build's D7, one field over).
- 2026-07-19 — Q4 (subject-length-target) → chose a soft ≤72-char aim (GitHub convention),
  no lint (→ D9), because the human reviews the title at plan time and again at the pause.
- 2026-07-19 — Q5 (reconcile-visibility) → chose present-at-the-pause (→ step 6), because a
  silent `-m` swap would reopen the agent-authored subjects D6/D68 refuse.
- 2026-07-19 — Q6 (what-a-scope-names) → chose scope-names-the-code-area with the
  build-default as the feature catch-all (→ D8), for consistent, greppable scopes.
