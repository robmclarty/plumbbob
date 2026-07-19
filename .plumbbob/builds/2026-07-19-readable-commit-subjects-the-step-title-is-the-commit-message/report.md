# Report — Readable commit subjects: the step title is the commit message

**Status:** done — 7/7 steps checkpointed, full check green.

## What shipped

The checkpoint commit subject was reading badly in `git log`: D68 assembled it as
`type(scope): description`, but the `scope` was the whole build slug and the
`description` was the raw step title authored as a line-item — long, redundant, hard to
scan. The fix could not live at checkpoint time (the dumb assembler has no inference to
draw a good scope or sentence from), so this build relocated the *editorial* judgment to
plan time, where the full frame and inference live.

The **step title line itself is now the Conventional-Commit subject** — one source of
truth the human authors and edits once — and a per-build **default scope** with a
graceful fallback chain backs it. Concretely:

- **The scope fallback chain and parser** (step 1) — `subjectForStep` resolves scope as
  title-scope → `**Scope:**` build default → build slug → bare, and type as title-type →
  `feat`; a new `parseBuildScope` reads the header field. Unit-pinned across all four
  scope rungs, the type default, back-compat, and the unfilled-placeholder trap.
- **The intent template** (step 2) — gained the `**Scope:**` header field and the
  `## Steps` guidance that the title *is* the subject, paths live in the seam, and how the
  fallback resolves.
- **The authoring skills** (steps 3–5) — `pb-plan` authors titles as subjects and sets
  the build scope; `pb-step` keeps a sharpened title a clean subject; `pb-refine` resyncs
  the subject when the plan drifts. Each with a matching contract pin.
- **The verify pause** (step 6) — `pb-verify`/`pb-build` present a *reconciled* subject at
  the pause for explicit approval when the diff drifts from the planned title, landing it
  via `-m`; otherwise the deterministic title-derived subject lands.
- **The docs** (step 7) — `techniques.md` records the title-is-the-subject rule and the
  fallback chain; `decisions.md`'s D68 is amended to note the new shape.

## Decisions and why

- **D1 (title-is-subject)** — the title line *is* the subject, authored once, because a
  separate description field is a second thing to keep in sync and the title already
  parses cleanly with the existing plumbing.
- **D2 (paths-leave-the-title)** — file paths live in `seam`/`done-when`, never the
  title, so the title reads as plain English and a clean subject at once.
- **D3 (scope-fallback-chain)** — title-scope → build-default → slug → bare degrades
  gracefully from most-specific to most-deterministic; the slug rung keeps field-less
  builds working (C2 back-compat).
- **D5/D6 (subject-synced-on-drift, determinism-preserved)** — the deterministic
  title-derived subject stays the default; the `-m` reconcile is a human-approved
  exception for genuine drift, keeping D68's CLI-owned, unit-testable assembly rather than
  agent-authored subjects.
- **D7 (scope-placeholder-absent)** — an unfilled `**Scope:**` parses as absent and falls
  through to the slug rung, pinned in step 1 *before* step 2 gave the template the
  placeholder, so a scaffolded-but-unfilled scope never lands `(<scope>)` commits.
- **D8 (scope-names-code-area)** — a step's `(scope)` names the code area/module; the
  build-default names the feature as catch-all, for consistent, greppable scopes.
- **D9 (subject-length-soft)** — a soft ≤72-char aim (GitHub convention), guidance only,
  no lint — the human reads the title at plan time and again at the pause.

## Parked & harvested

None — no ideas were parked; the plan held from frame through finish.

## Open questions

All six (Q1–Q6) were raised in plan review and resolved to their leans on 2026-07-19,
each recorded in the Verdicts trail. None remained open at build time.

## Deferred tangents

None.

## Checkpoints

- baseline efc16bfed2a80f1672b154fafbf4e4fbfd41c6a1
- plan 5d3e2eaf80967aa9ef43829a3e185a69c58bb77c
- plan d894742ee101515c1f9be9c692fe38d39c1abeac
- step 1 6479ab6677178f217f827b3b15941ec34dea6398
- step 2 aed2183903f92a4db896b6360821bf21a4c83ed0
- step 3 c3e82f789d4249dec79c72cb9c873c3d54b3bfba
- step 4 90bd34b182390cad2cb2a7f05ba342bbc80f1685
- step 5 a1f5f29c33a27b975b70f1490829181b6df31a0b
- step 6 a3d2045cc87491b450e91e33a75c36c96a7ebe58
- step 7 154f2bf8590b940663da016f734d2be89a350fcb

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
|------|------------|----------------|---------|------------|
| 1 | 0 | 0 | 0 | 8m |
| 2 | 0 | 0 | 0 | 1m |
| 3 | 0 | 0 | 0 | 6m |
| 4 | 0 | 0 | 0 | 4m |
| 5 | 0 | 0 | 0 | 5m |
| 6 | 0 | 0 | 0 | 9m |
| 7 | 0 | 0 | 0 | 5m |
| **total** | 0 | 0 | 0 | 37m |
