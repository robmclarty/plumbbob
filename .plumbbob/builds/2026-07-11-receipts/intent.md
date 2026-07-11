# Receipts — plan-time gate probe and per-build stats

**Phase** (your own bookkeeping while framing): build
**Size:** small

## Frame

- **Problem:** Two receipts are missing (research/07, Build 2). (a) The
  highest-probability week-1 bounce: a repo where checkride detects nothing
  learns that at the FIRST CHECKPOINT — deep in a step, the worst moment —
  instead of at plan time, while the human is still deciding. (b) The "is the
  loop worth it?" conversation has no data: nothing counts red checks, drift
  warnings, reverts, or wall-clock per step.
- **Smallest thing that solves it:** (a) `start` runs checkride's existing
  detection pass and, on nothing-to-check, says so with the exact settings fix
  — a warning, never a refusal; `doctor` gains the same callout. (b) A tracked
  `builds/<slug>/stats.json` accrued at the moments the CLI already owns
  (build / checkpoint / revert), rolled into report.md's `## Stats` at finish.
- **Done looks like:** `plumbbob start` in a bare repo prints the
  nothing-to-check warning with the `"check"` fix; a red→green→checkpoint
  cycle plus a revert produces a stats.json and a per-step `## Stats` table in
  report.md at finish.
- **Explicitly NOT doing:** No gate at plan time (guidance, never a refusal —
  D9/D10). No new verbs, no new deps. No stats display in `status` (the
  dashboard stays lean; report.md is the reader). Not touching the eval tier.

## Decisions

- D1: The detection rule lives once, in `src/lib/check.ts` (`detectGate`) —
  *because* `doctor.gateReport` is module-private and `start` must not import
  doctor internals; both read one implementation.
- D2: `start` becomes async — *because* the probe is checkride's in-process
  `runDoctor` (the doctor pattern) and the dispatch seam is already
  Promise-typed; ~52 test call sites convert `captureIo` → `captureIoAsync`
  (the established twin).
- D3: stats.json is TRACKED (rides the branch with the artifact plane) —
  *because* the numbers are the record's evidence, exactly like checkpoints;
  in-flight-only state stays excluded, this is not that.
- D4: Every accrual is best-effort and single-writer, malformed-tolerant —
  *because* a corrupt stats file must never wedge a checkpoint (the D27
  philosophy, same as handoff.json).
- D5: Wall-clock derives from `startedAt` (stamped by `build <n>`) to
  `landedAt` (stamped at checkpoint) — *because* nothing records time today
  and these are the two beats the CLI already owns.

## Constraints

- C1: The probe NEVER changes `start`'s exit code — a bare repo still starts.
- C2: Zero new dependencies; checkride's `runDoctor` is already imported by
  doctor.
- C3: Stats accrual adds no output to the happy path except the optional
  compact suffix on the build-log Log line.

## Steps

1. [x] detectGate + doctor's nothing-to-check callout — **done when:**
   `detectGate(root)` returns `{configured, detected}` (configured
   short-circuits; else checkride runDoctor, detected = any tool adapter
   present), unit-tested for all three shapes; `doctor` prints an
   `○ nothing to check` info line with the exact settings fix for a bare repo
   (today it reports failed:0 with no callout).
   - seam: `src/lib/check.ts`, `src/verbs/doctor.ts`,
     `src/lib/__tests__/check.test.ts`, `src/verbs/__tests__/doctor.test.ts`
   - model: sonnet — mechanical extraction of an existing pattern
2. [x] `start` probes at plan time — **done when:** `start` is async and, after
   scaffolding, prints the nothing-to-check warning naming
   `{"check": "npm test"}` in `.plumbbob/settings.json`; silent when a check is
   configured or tools are detected; exit code unchanged either way; all
   `captureIo(() => start(…))` call sites converted to `captureIoAsync`;
   `skills/pb-plan/SKILL.md` surfaces the warning at plan time (one sentence,
   contract-pinned).
   - seam: `src/verbs/start.ts`, `src/verbs/__tests__/`, `src/lib/__tests__/`,
     `test/helpers/`, `skills/pb-plan/SKILL.md`, `test/contract/skills.test.ts`
3. [x] Stats sidecar helpers — **done when:** `statsPath(root, slug?)` +
   `readStats` + `recordStepStat(root, slug, step, mutation)` exist beside the
   handoff helpers, are excluded from NOTHING (tracked by default), tolerate a
   corrupt file by starting fresh, and are unit-tested.
   - seam: `src/lib/sidecar.ts`, `src/lib/__tests__/sidecar.test.ts`
   - model: sonnet — mirrors appendHandoff exactly
4. [ ] Accrual at the beats the CLI owns — **done when:** `build <n>` stamps
   `startedAt`; checkpoint bumps `redChecks` on a red gate and `driftWarnings`
   when the seam warning fires, stamps `landedAt` on land, and the build-log
   Log line gains a compact suffix when stats exist (e.g. `(2 red, 1 revert,
   34m)`); `revert` bumps `reverts` against the in-flight step (it records
   nothing today); all best-effort.
   - seam: `src/verbs/build.ts`, `src/verbs/checkpoint.ts`,
     `src/verbs/revert.ts`, `src/lib/buildlog.ts`, matching tests
5. [ ] Finish rolls up `## Stats` — **done when:** finish appends a per-step
   table (red checks, drift warnings, reverts, wall-clock) plus a totals row to
   report.md beside the `## Checkpoints` append; silently skipped when
   stats.json is absent (old builds); tested both ways.
   - seam: `src/verbs/finish.ts`, `src/verbs/__tests__/finish.test.ts`

## Open questions

*(none — the seams were mapped in research/07 and verified against the code
before this plan.)*

## Verdicts

*(none yet)*
