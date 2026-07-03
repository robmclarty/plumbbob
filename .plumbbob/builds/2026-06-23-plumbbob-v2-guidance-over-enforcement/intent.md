# Plumbbob v2 — guidance over enforcement

**STATE:** DESIGN
**Phase:** decide
**Size:** medium

<!-- Bootstrap note: this redesign is being planned by hand and built under the
NEW model (no enforcement), because the tool that would run it does not exist
yet. v1's muzzle is left dormant (no STATE gate active) for the duration. The
report at /pb-reset archives this plan; the dogfood is "build the new plumbbob
with the new plumbbob's loop, performed by hand until the skills exist." -->

## Frame

*(The problem, in plain words, before any solution.)*

- **Problem:** v1 enforces the deciding/executing boundary with a hard file lock
  (the pre-edit muzzle + seam-guard). For a solo author the lock only ever stops
  the person holding the key — it provides no security (the README itself calls
  it "a fence, not a wall"), so its only product is forced ritual. The result is
  friction: you must "undo plumbbob" to make a simple edit. Three further gaps:
  `/pb-build` is a misnomer (it unlocks a seam, never builds), there is no
  orientation for a long multi-day build ("where am I, what's next"), and the
  surface is 26 commands across three naming conventions that no one can recall.
- **Smallest thing that solves it:** Replace the lock with a *clock*. STATE
  demotes from a gate to pure orientation; the pause-for-approval at each step
  boundary becomes the mechanism that keeps the human the decider. Collapse the
  surface to **eight `pb-*` skills** the user invokes from the IDE, backed by the
  existing dumb CLI. Make `/pb-build` actually build (and optional), add a real
  orientation command, and let steps be planned just-in-time.
- **Done looks like:** A user can run the whole loop knowing eight words —
  `plan, step, build, verify, park, status, harvest, reset` — never typing a step
  number or the raw CLI, never hitting a block. `/pb-status` names the next move.
  `/pb-verify` checkpoints any diff regardless of who wrote it. This repo's own
  v2 build is finished through `/pb-reset`. `pnpm check` is green.
- **Explicitly NOT doing:** Ridgeline integration; archive indexing/retrieval;
  other-agent adapters (still a future plumbbob); a team/multi-user enrollment
  story (guidance is designed for the solo author first); reintroducing any hard
  block as a *default*. The opt-in "guard mode" wall is deferred to an open
  question, not built up front.

## Architecture sketch

```
  IDE / chat pane — the eight pb-* skills (all the user ever invokes)
  ┌───────────────────────────────────────────────────────────────────┐
  │ /pb-plan   frame the goal        /pb-park    capture an idea        │
  │ /pb-step   plan next increment   /pb-status  orient + name next move│
  │ /pb-build  (optional) implement  /pb-harvest triage parked ideas    │
  │ /pb-verify check·review·validate /pb-reset   report·archive·clear   │
  │            ·PAUSE·commit                                            │
  └───────────────┬───────────────────────────────────────────────────┘
                  │ skills shell out to / read from
                  ▼
        plumbbob CLI (dumb mechanism, never typed by hand)
        + .plumbbob/ sidecar: STATE (orientation only, not a gate)
          intent.md  build-log.md  checkpoints  archive/
                  │
                  ▼
        hooks: post-edit.sh (light feedback, KEPT — serves the model; the ONLY
               edit-time hook left in v2)
               pre-edit.sh + bash-guard.sh → REMOVED (they only defended the lock)
                  │
                  ▼
        git — additive only: baseline, WIP checkpoint commits, revert to SHAs
```

## Decisions

- D1: **The pause replaces the lock.** STATE stops gating edits and becomes pure
  orientation (it feeds `/pb-status` and tells `/pb-verify`/`/pb-step` where you
  are). The human stays the decider not because a wall refuses them but because
  the system does a step's labor and then *stops and waits* for them to advance —
  pull, not block — *because* a lock that only stops the key-holder is friction
  with no security, while a pause keeps the human as the clock with none.
- D2: **Eight skills, all `pb-`-prefixed**, the only surface the user must
  remember: `/pb-plan` `/pb-step` `/pb-build` `/pb-verify` `/pb-park`
  `/pb-status` `/pb-harvest` `/pb-reset` — *because* 26 commands across three
  naming conventions is the single biggest recall failure, and these eight are
  exactly the operations the author named as his real workflow.
- D3: **Pluggable executor.** `/pb-build` is an *optional* engine that implements
  the current step for you, then hands to `/pb-verify`. The loop works without it
  — implement by hand, vibed, or with another harness. `/pb-verify` reads the
  *diff, not the author* — *because* plumbbob is the harness-agnostic spine; how
  the diff appears is a slot the user fills however they like.
- D4: **`/pb-verify` is the tick:** check (`pnpm check`) → self-review the diff
  against `intent.md` → validate the step's done-when → **PAUSE for the human's
  approval** → auto-commit. The pause is the one human-convergence beat; the
  human declares the step done and the system verifies+records it — *because*
  this is where "you are the clock" lives, executor-independent.
- D5: **Auto-commit on approval** via the built-in commit-with-TIL skill, but
  **version bumps + changelog are never automatic** — the user runs `/version`
  when *they* decide to cut a release — *because* a WIP checkpoint is cheap and
  reversible, while a release is a judgment call the author owns.
- D6: **Just-in-time stepping.** `/pb-step` plans the *next* step (one by default,
  several if already known); `intent.md`'s Steps start empty and grow. It
  co-exists with planning several up front — *because* multi-day exploratory work
  discovers its real steps as it goes, and up-front full plans were ceremony.
- D7: **Vocabulary:** `/pb-plan` = the *whole-goal* move (frames `intent.md`);
  `/pb-step` = the *single-increment* move. `/pb-harvest` is the complement of
  `/pb-park` (park seeds, later harvest them); it replaces `triage`. `/pb-park`
  renames v1's `/park` for prefix consistency — *because* the pairing should read
  as a loop and the surface should be uniform.
- D8: **`/pb-status` is a rich orientation dashboard** that names the next move:
  intent title, step X of N, last checkpoint SHA, current focus + done-when,
  count of parked items and open questions, and the suggested next skill —
  *because* the multi-day-resume "where am I" need is unmet by v1's state-word
  printer, and naming the next move is what frees the user from memorizing order.
- D9: **`/pb-reset` writes the report by default** (no refuse-without-report
  gate), then archives intent+log+report and clears. The separate `/docs` phase
  is dropped — docs become an explicit ask, not a phase — *because* guidance
  offers the artifact instead of walling the exit, and a bug fix rarely earns a
  doc.
- D10: **The defensive apparatus is removed.** The `pb-*` driver indirection, the
  allowlist exclusions + permission-prompt scheme, the `disable-model-invocation`
  *purity argument*, `bash-guard.sh`, and the `mode` escape hatch all existed
  only to protect a lock that no longer gates anything — *because* with no wall to
  defend, a wrong state transition is harmless. Skills may still set
  `disable-model-invocation: true` simply as "this is the human's deliberate
  workflow verb," which is one cheap frontmatter line, not the old machinery.
- D11: **`post-edit.sh` light feedback stays; `pre-edit.sh` is removed.** The
  light tier serves the model (Claude can't see the editor's LSP) and never blocks.
  v1's pre-edit muzzle is gone entirely — not demoted to a no-op — *because*
  awareness is the valuable half of enforcement and coercion the friction half, and
  on-demand `/pb-status` covers orientation better than an interruptive per-edit
  nudge would. If an edit-time nudge ever earns its keep, it returns as a fresh,
  deliberately-designed hook.
- D12: **interrogate and spike survive as optional power moves**, surfaced by
  `/pb-status` when relevant, not part of the core eight — *because* they earn
  their keep on genuine forks and adversarial framing but are not the daily loop.
- D13: **(Q1 resolved) The hard-block code is removed outright**, not kept behind
  a flag. `pre-edit.sh` AND `bash-guard.sh` are deleted and de-registered (the
  only edit-time hook left is `post-edit.sh`); the CLI's `HUMAN_ONLY_VERBS` /
  `CLAUDECODE` in-session refusal, the `mode` verb, and `VALID_STATES` are deleted
  — *because* a vestigial wall (even a no-op one that spawns on every edit) is just
  latent friction; a clean break is honest, and if an edit-time orientation nudge
  is ever wanted it gets a fresh hook then. The code lives on in git history.
- D14: **(Q2 resolved) `intent.md` stays in the git-ignored `.plumbbob/`
  sidecar**, no tracked copy; `/pb-reset` archives intent + build-log + report to
  `.plumbbob/archive/<date>-<slug>/` — *because* the design-faithful location
  keeps one source of truth and the archive preserves design history without
  polluting the tracked tree.
- D15: **(Q4 resolved) `/pb-status` infers one primary next move and shows the
  context to override it.** Rules: in BUILD → finish the in-flight step
  (`/pb-verify`); in DESIGN with the next `## Steps` item planned (has a
  done-when) → `/pb-build` it; in DESIGN with the next item unplanned or absent →
  `/pb-step`; all steps done → `/pb-harvest` if anything is parked, else
  `/pb-reset`; SPIKE/FINISH point at their close-out. It always prints the full
  step list + counts so the human can ignore the suggestion — *because*
  orientation should remove the "what now?" tax without taking the decision away.
- D16: **(Q3 resolved) `/pb-verify`'s self-review is a single structured
  self-read**, not a multi-lens adversarial panel: one pass over the diff against
  the step's done-when, the Decisions, and the Constraints, surfaced to the human
  at the pause — *because* the human is the real reviewer at the approval beat; the
  machine pass catches mechanical drift, and a heavier panel stays parkable if
  drift ever slips through (mirrors D11/D13's "start simple, escalate on evidence").

## Constraints

- C1: Functional/procedural only — no class/this/extends; no default exports (the
  repo's own ast-grep rules enforce both).
- C2: CLI keeps zero runtime dependencies; `node:` builtins only.
- C3: No session ⇒ zero behavior change anywhere (session-gating stays the
  calibration mechanism: tiny work stays free).
- C4: Additive-only git: never rewrite history; revert resets to recorded SHAs;
  never destroy captured attention (archive-then-clear).
- C5: The eight skills are the *only* surface the user must remember; typing the
  raw `plumbbob` CLI is never required.
- C6: Migration safety — v1 sessions/archives and an installed v1 setup must not
  break; an in-flight v1 session must still close. No destructive rename of
  existing archives.
- C7: Size to the work — no ceremony on a one-liner.

## Roadmap

*(Non-binding sketch of the whole build. `/pb-step` promotes the next line to a
formally-planned step under ## Steps when we reach it; the order can change.)*

1. Unlock first — defang enforcement so the rest builds under the new model.
2. `/pb-status` rich orientation (CLI `status` → dashboard + next-move).
3. `/pb-verify` — the executor-agnostic tick (check·review·validate·pause·commit).
4. `/pb-build` — optional engine that hands to verify.
5. `/pb-plan` + `/pb-step` — intent framing + just-in-time step authoring.
6. `/pb-park` (rename) + `/pb-harvest` (triage→harvest).
7. `/pb-reset` — report-by-default → archive → clear.
8. Installer registers the new eight; delete the dead apparatus; README/docs to
   the new model; e2e + dogfood close-out.

## Steps

*(Formally-planned steps in the standard format, one in flight at a time.
Just-in-time per D6: a step lands here only when `/pb-step` plans it. `status`
parses this section, so it stays clean — roadmap prose lives above, not here.)*

1. [x] Defang enforcement — **done** (checkpoint 94c8056). Lock removed; only
   `post-edit.sh` remains as an edit-time hook.
   - seam: `hooks/pre-edit.sh`, `hooks/bash-guard.sh`, `src/cli.ts`,
     `src/verbs/mode.ts`, `src/lib/settings.ts`, `src/lib/sidecar.ts`,
     `src/verbs/setup.ts`, plus the tests/helpers that asserted the lock
2. [x] `/pb-status` rich orientation — **done** (checkpoint 478f302).
   Dashboard with the step list + ✓/▸ markers, done-count, last checkpoint,
   parked/open-question counts, and the D15 next-move inference; pure
   `src/lib/orient.ts` + 12 unit tests. Dogfooding caught the just-in-time gap
   (all-planned-done should offer `/pb-step`, not just `/pb-reset`) — folded in.
   - seam: `src/lib/orient.ts`, `src/verbs/status.ts`, `test/orient.test.ts`,
     `test/session-verbs.test.ts`
3. [x] `/pb-verify` — the executor-agnostic tick — **done when:** `plumbbob check`
   runs the heavy gate with no state change; `plumbbob checkpoint [<n>]` commits a
   checkpoint for the in-flight step (STEP file) or the inferred next-undone step
   **even with no BUILD state** (executor-agnostic per D3), refuses on a red check,
   flips the intent checkbox to `[x]`, records the SHA, clears STEP/SEAM, and
   returns to DESIGN; `skills/pb-verify/SKILL.md` carries the
   check→self-review→validate→PAUSE→commit contract (opus,
   `disable-model-invocation`, reads the diff not the author per D3, single
   structured self-read per D16); `pnpm check` green with verb + skill tests.
   - seam: `src/verbs/check.ts`, `src/verbs/checkpoint.ts`, `src/lib/orient.ts`,
     `src/cli.ts`, `skills/pb-verify/SKILL.md`, `test/verify.test.ts`,
     `test/skills.test.ts`
4. [x] `/pb-build` — the optional engine — **done when:** `skills/pb-build/SKILL.md`
   is the v2 engine (opus, `disable-model-invocation`): pick the planned step,
   `plumbbob build <n>` to enter it, read the step's done-when/seam/Decisions/
   Constraints, implement **only** that step, then run the verify tick through to
   the PAUSE (check → self-review → validate → PAUSE → checkpoint); it states
   plainly that it is **optional** (D3) and that a new idea mid-build is a
   `/pb-park`, not an edit; the old thin-driver `pb-build` is replaced and its
   skills-test contract updated to the engine; `pnpm check` green.
   - seam: `skills/pb-build/SKILL.md`, `test/skills.test.ts`
5. [x] `/pb-plan` + `/pb-step` — the planning skills — **done when:**
   `skills/pb-plan/SKILL.md` (opus, `disable-model-invocation`) scaffolds via
   `plumbbob start` and authors the intent's Frame, Decisions, and Constraints
   before any code, leaving `## Steps` empty for just-in-time planning (D6);
   `skills/pb-step/SKILL.md` (opus) proposes one verifiable next step — a title, a
   **done-when**, and a **seam** — and, on the human's OK, appends it to `## Steps`
   in the standard format `status`/`build` parse; both keep the human the converger
   (D7 vocabulary: plan = whole goal, step = increment); `pnpm check` green with
   skill contracts.
   - seam: `skills/pb-plan/SKILL.md`, `skills/pb-step/SKILL.md`, `test/skills.test.ts`
6. [x] `/pb-park` + `/pb-harvest` — the capture/triage pair — **done when:**
   `skills/park/` is renamed to `skills/pb-park/` (still haiku, still captures by
   shelling `plumbbob park`, never an edit); `skills/plumbbob-triage/` becomes
   `skills/pb-harvest/` (opus: walk the Park list, propose blocker/tangent/pivot
   per item with tangent the default, the human confirms each, record under
   `## Harvest`, fold a confirmed blocker into intent); the old skill dirs are gone
   and `test/skills.test.ts` + `test/setup.test.ts` reference the new names;
   `pnpm check` green. (Then dogfood: `/pb-harvest` the parked build-message item.)
   - seam: `skills/pb-park/SKILL.md`, `skills/pb-harvest/SKILL.md`,
     `test/skills.test.ts`, `test/setup.test.ts`
7. [x] `/pb-reset` — the close-out — **done when:** `plumbbob reset` archives
   intent + build-log + report (report only if present) to
   `.plumbbob/archive/<date>-<slug>/`, appends the checkpoint SHAs to the report,
   clears the active files + STATE/SEAM/STEP, and — unlike v1 `finish` — has **no
   refuse-without-report gate** (D9); `archiveSession` copies the report only when
   it exists; `skills/pb-reset/SKILL.md` (opus) writes the report by default (what
   shipped, decisions, parked/harvested, final status, deferred tangents) then
   shells `plumbbob reset`; no version bump, no separate docs phase; `pnpm check`
   green with verb + skill tests.
   - seam: `src/verbs/reset.ts`, `src/lib/archive.ts`, `src/cli.ts`,
     `skills/pb-reset/SKILL.md`, `test/reset.test.ts`, `test/skills.test.ts`
8. [x] Skill-surface cleanup — **done when:** `skills/pb-status/SKILL.md` exists (a
   thin haiku driver for `plumbbob status` — the missing eighth skill); the
   superseded v1 driver skills (`pb-start`, `pb-review`, `pb-done`, `pb-wrap`,
   `pb-finish`) and judgment skills (`plumbbob-report`, `plumbbob-docs`) are deleted;
   `src/verbs/build.ts`'s stale "Edits are limited to the seam" message is softened
   (the harvested tangent); `test/skills.test.ts` + `test/setup.test.ts` reference
   only the surviving surface; `pnpm check` green. (The verbs `review`/`done`/`wrap`/
   `finish`, the e2e, and the README move to step 9.)
   - seam: `skills/pb-status/SKILL.md`, `src/verbs/build.ts`, `test/skills.test.ts`,
     `test/setup.test.ts`, + deletions of the seven superseded skill dirs
9. [x] Verb cleanup + e2e + README + self-close-out — **done when:** the superseded
   verbs `review`/`done`/`wrap`/`finish` are deleted with their CLI wiring;
   `build-loop.test.ts` drops the review/done/REVIEW-reentry describes (revert stays,
   its `done`→`checkpoint`); `finish.test.ts` is removed (reset.test.ts covers the
   close-out); `cli.test.ts`'s verb table reflects the surviving verbs; `e2e.test.ts`
   drives the v2 loop (start → build → checkpoint → park → reset); the README is
   rewritten to the clock model (eight skills, guidance not enforcement, the pause);
   `pnpm check` green. Then **close this session out through `/pb-reset`**.
   - seam: `src/verbs/review.ts`, `src/verbs/done.ts`, `src/verbs/wrap.ts`,
     `src/verbs/finish.ts`, `src/cli.ts`, `test/build-loop.test.ts`,
     `test/finish.test.ts`, `test/cli.test.ts`, `test/e2e.test.ts`, `README.md`

## Open questions

*(Holes not resolved on paper. Do not guess them into Decisions.)*

- Q1: *(resolved 2026-06-22 → D13: remove the hard-block code outright.)*
- Q2: *(resolved 2026-06-22 → D14: keep intent in `.plumbbob/`, archive at reset.)*
- Q3: *(resolved 2026-06-22 → D16: a single structured self-read; a multi-lens panel stays parkable.)*
- Q4: *(resolved 2026-06-22 → D15: status infers one primary next move, prints the context to override it.)*

## Verdicts

*(Filled in as forks resolve — the audit trail of "these were my calls.")*

- 2026-06-22 — Design converged with the author over five turns: enforce→guide
  pivot (D1), eight-skill surface (D2), pluggable executor (D3), the verify tick
  and commit/version split (D4/D5), just-in-time stepping (D6), the final names
  and vocabulary (D7), rich orientation (D8), report-by-default reset (D9), and
  removal of the lock-defending apparatus (D10). Recorded in memory under
  plumbbob-redesign-skill-surface.
- 2026-06-22 — Q1/Q2 resolved with the author at the step-1 boundary: remove the
  hard-block code outright, no vestigial guard flag (→ D13); keep `intent.md` in
  `.plumbbob/` and archive it with build-log + report at `/pb-reset` (→ D14).
