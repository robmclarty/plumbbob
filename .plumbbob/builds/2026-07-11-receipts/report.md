# Report — Receipts: plan-time gate probe and per-build stats

Plan 05's items 2a and 3, queued as Build 2 in research/07: the week-1 gate
bounce now surfaces at plan time, and the loop finally counts what it costs.

## What shipped

- **The plan-time gate probe** (`detectGate` in `src/lib/check.ts`): one shared
  detection rule — checkride's in-process doctor pass, with the always-on repo
  checks (links, pnpm-audit, publint, attw) excluded, because a gate made only
  of those green-lights every checkpoint while testing nothing about the code.
  `start` runs it after scaffolding and warns with the exact fix
  (`{"check": "npm test"}` in `.plumbbob/settings.json`); `doctor` gains the
  same `○ gate: no code checks detected` callout; `pb-plan` surfaces the
  warning while the human is still deciding (contract-pinned). Never a refusal
  — the exit code is untouched. `start` became async for the probe (the
  dispatch seam was already Promise-typed; 52 test call sites converted to
  `captureIoAsync`).
- **Per-build stats** (`builds/<slug>/stats.json`, tracked — the numbers are
  the record's evidence): `build <n>` stamps `startedAt`; `checkpoint` bumps
  `redChecks` on a red gate (not on harness breakage) and `driftWarnings` when
  the seam warning fires, stamps `landedAt` on land, and rides a compact
  suffix on the build-log Log line (`(2 red, 34m)` — a clean first-try step
  reads exactly as before); `revert` bumps `reverts` against the in-flight
  step (it recorded nothing at all before). All accrual is best-effort and
  malformed-tolerant (D27) — the receipt can never wedge a verb.
- **The finish roll-up**: report.md gains a `## Stats` table — one row per
  step (red checks, drift warnings, reverts, wall-clock) plus totals; silently
  skipped for old builds with nothing accrued. After a month of dogfood, "is
  the loop worth it?" is a table, not a feeling.

## Notes

- Detection-rule coupling: the always-on adapter list mirrors what checkride's
  doctor reports for an empty directory; a checkride release adding a new
  always-on check should update `ALWAYS_ON_ADAPTERS` beside `gateDetectsTools`.
- This build's own Stats table below is partial by construction: the stats
  code only existed from step 4 on, and the CLI running the loop was rebuilt
  mid-build.

## Follow-up (harvested as a tangent)

`start` unconditionally rewrites `.plumbbob/settings.json`, clobbering a
configured `check` on re-start — pre-existing; write-if-absent is the likely
one-line fix, pending the human's call on whether the seeding is intentional.

## Checkpoints

- baseline 3e453b2c2059760412899ee63f8cad27ae57c250
- plan cdaec8c602af9ba3a146864975e20e1fb053273c
- step 1 756dcaeeddbe54a11ff6e21663b68ae1d778431b
- step 2 e89965c78472f9e8c10ec5fec9e191808f1cd9ce
- step 3 de3b250bce9ca58bb792ee3fb0f93ef87a5430d4
- step 4 7127db5f8498a1254aa3bdc13da84f44d5b3e32f
- step 5 6067093da05f7c230c5ac97ad282582de8e0d764
