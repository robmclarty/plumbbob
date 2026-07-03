# Build log — Plumbbob v2 — guidance over enforcement

**Current step:** none (DESIGN) · **STATE:** DESIGN
**Heavy check:** pnpm run check
**Branch:** v2-guidance-over-enforcement (baseline da0f9af)

## Steps

*(Mirror of intent.md's Steps, with live status. Only ONE step in flight.)*

- ☑ 1. Defang enforcement — **done** (checkpoint 94c8056); lock removed, only post-edit.sh remains
- ☑ 2. `/pb-status` rich orientation — **done** (checkpoint 478f302); dashboard + D15 next-move
- ☑ 3. `/pb-verify` — the executor-agnostic tick — **done** (checkpoint 7442709); check + checkpoint verbs + skill
- ☑ 4. `/pb-build` — the optional engine — **done** (checkpoint 13b6381); v2 engine skill replaces the thin driver
- ☑ 5. `/pb-plan` + `/pb-step` — the planning skills — **done** (checkpoint d3f8127); intent framing + just-in-time steps
- ☑ 6. `/pb-park` + `/pb-harvest` — the capture/triage pair — **done** (checkpoint 1e67cf9); renames + harvest clears the list
- ☑ 7. `/pb-reset` — the close-out — **done** (checkpoint 2ae5ae7); report-by-default, no gate
- ☑ 8. Skill-surface cleanup — **done** (checkpoint 8c52779); pb-status added, 7 dead skills gone, build message softened
- ☑ 9. Verb cleanup + e2e + README — **done** (checkpoint 6f671b0); v1 verb apparatus gone, v2 loop end to end

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched.
> Capture is one line (`/pb-park`). Harvest happens only at the boundary.

- (none yet)
- [x] build verb prints 'Edits are limited to the seam' — stale v1 lock language; in v2 the seam is awareness, not a limit. Soften the message in src/verbs/build.ts (step 8 apparatus cleanup, or sooner).

## Harvest  *(run at each step boundary, after green)*

Classify each parked item as exactly ONE: **blocker** (plan was wrong → fold into
intent.md, handle now) · **tangent** (different, not clearly better → defer/kill;
the default) · **pivot signal** (the whole approach is wrong → stop and replan).

- 2026-06-22 (step 6 boundary) — "build verb 'Edits are limited to the seam' message" → **tangent**: a real but deferrable cleanup, not blocking. Folded into step 8's v1-apparatus cleanup (soften/retire the build-verb message there).

## Log

*(Append-only. One decision or event per line, dated. `/pb-reset` reads this.)*

- 2026-06-22 — v2 redesign planned by hand (bootstrap): intent.md drafted from the
  five-turn design conversation; step 1 (defang enforcement) formally planned.
- 2026-06-22 — Step 1 built: deleted `pre-edit.sh`, `bash-guard.sh`, and
  `mode.ts`; stripped the CLI's `mode`/`CLAUDECODE`/`HUMAN_ONLY` machinery and
  `VALID_STATES`; left `post-edit.sh` as the only edit-time hook; de-registered the
  removed hooks from `setup`, `settings`, and `dev-install`. `pnpm check` green.
  Seam expanded from the declared 8 files to 16 — every test that asserted the lock
  had to flip to assert *allow* (added sidecar.ts, run-hook.ts, fixture-repo.ts,
  session-verbs/spike/setup/e2e tests, dev-install.sh).
- 2026-06-22 — At the verify pause the author asked why keep a no-op `pre-edit.sh`;
  reversed D13's no-op call and removed it (and its registration) entirely. The
  pause caught the cruft — exactly its job.
- 2026-06-22 — Step 1 approved and checkpointed → `94c8056` on branch
  v2-guidance-over-enforcement (166 tests green). Back to DESIGN; next is `/pb-step`
  for step 2 (`/pb-status` orientation).
- 2026-06-22 — Step 2 (`/pb-status`) built + approved. Restructured intent (Roadmap
  split out of Steps so the parser stays clean); activated `.plumbbob/STATE` now
  that it's safe (the dogfood session is "real"). New `src/lib/orient.ts` + 12
  tests; 178 green. Live status on our own session validated it. Dogfooding then
  caught the just-in-time next-move gap (all-planned-done → offer `/pb-step`, not
  just `/pb-reset`); fixed and amended into checkpoint → `478f302`.
- 2026-06-22 — Step 3 (`/pb-verify`) built + approved. New `check` + executor-agnostic
  `checkpoint` verbs (resolve step explicit › STEP › next-undone; gate on green;
  commit-or-record-HEAD; flip intent `[x]`; → DESIGN) + `skills/pb-verify/SKILL.md`
  (check→self-review→validate→PAUSE→checkpoint). Q3 resolved → D16 (single self-read).
  194 green. **Dogfooded on its own step:** committed `7442709`, then `plumbbob
  checkpoint 3` gated on the live `pnpm check` and recorded it — the tick checkpointed
  itself. v1 `review`/`done` + `pb-*` drivers remain until step 8.
- 2026-06-22 — Step 4 (`/pb-build`) built + approved → checkpoint `13b6381`. Replaced
  the thin pb-build driver with the v2 engine skill (opus: pick step → `build <n>` →
  read the plan → implement only that step → verify to the PAUSE). Dogfooded the full
  build→verify cycle: `build 4` entered BUILD, mid-build `plumbbob build`'s stale
  "limited to the seam" message was **parked not chased** (1 item awaiting harvest),
  diff stayed to exactly the 2 seam files, `checkpoint` (no arg) resolved STEP=4. 195 green.
- 2026-06-22 — Step 5 (`/pb-plan` + `/pb-step`) → checkpoint `d3f8127`. The planning
  skills (opus) that author intent's Frame/Decisions/Constraints and just-in-time
  steps. 205 green.
- 2026-06-22 — Step 6 (`/pb-park` + `/pb-harvest`) → checkpoint `1e67cf9`. Renamed
  park→pb-park, triage→pb-harvest; dogfooding harvest surfaced parseParked counting
  `[x]` items, fixed (count only open `[ ]`; harvest flips the box). Then **dogfooded
  the full loop**: harvested the step-4 build-message item as a tangent (folded into
  step 8), and `status` dropped to `parked 0`. The eight-skill surface now exists.
- 2026-06-22 — Step 7 (`/pb-reset`) → checkpoint `2ae5ae7`. New `reset` verb (archive
  + clear, no report gate, D9) + `archiveSession` copies report only if present +
  `/pb-reset` skill (report by default). 215 green. Not dogfooded on our own session —
  that's the step-8 finale. NOTE found mid-step: there is no `skills/pb-status/` yet —
  `/pb-status` has the verb but no driver skill; step 8 must add it.
