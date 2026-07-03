# Report — Plumbbob v2: guidance over enforcement

## What shipped

Plumbbob was rebuilt from a hard-enforcement model (a pre-edit file lock) to a
guidance-first one (a clock the human advances). Nine steps, every one dogfooded on
this repo's own build under the new loop:

1. **Defang enforcement** — deleted the pre-edit muzzle, the seam-guard, `bash-guard`,
   the `mode` escape hatch, and the CLAUDECODE/`HUMAN_ONLY` machinery. Nothing blocks
   edits anymore; the only edit-time hook left is the non-blocking `post-edit`.
2. **`/pb-status`** — a rich orientation dashboard that names the next move.
3. **`/pb-verify`** — the executor-agnostic tick (check → self-review → validate →
   PAUSE → checkpoint), backed by new `check` + `checkpoint` verbs.
4. **`/pb-build`** — the optional engine (was a misnamed thin driver that only unlocked
   a seam).
5. **`/pb-plan` + `/pb-step`** — the planning skills (whole-goal vs. single increment).
6. **`/pb-park` + `/pb-harvest`** — the capture/triage pair (renamed; harvest clears the
   list).
7. **`/pb-reset`** — the close-out (report by default, no gate).
8. **Skill-surface cleanup** — added the missing `pb-status` skill; deleted seven dead
   v1 skills.
9. **Verb cleanup + e2e + README** — deleted `review`/`done`/`wrap`/`finish`; rewrote
   the e2e for the v2 loop and the README to the clock model.

The surface is now eight `pb-*` skills — plan, step, build, verify, park, status,
harvest, reset — plus three optional power moves (revert, spike, interrogate). The CLI
is a dumb mechanism the skills shell out to; the human never types it.

## Decisions and why

The full record (D1–D16) is in the archived `intent.md`. The load-bearing ones:

- **D1** — the pause replaces the lock: the human stays the decider by *advancing*, not
  by being refused. A lock that only stops the key-holder is friction with no security.
- **D3** — pluggable executor: `/pb-verify` reads the *diff, not the author*; `/pb-build`
  is optional. Plumbbob is the harness-agnostic spine.
- **D6** — just-in-time stepping: steps are planned one at a time, as you reach them.
- **D9** — `/pb-reset` writes the report by default; the close-out has no gate.
- **D10** — the whole apparatus that *defended* the lock (driver indirection, allowlist
  games, the escape hatch) came out with it: with no wall to defend, a wrong state
  transition is harmless.

## Parked and harvested

- One item parked (step 4): the `build` verb's stale "Edits are limited to the seam"
  message — v1 lock language. Harvested at the step-6 boundary as a **tangent**, then
  fixed in step 8. The full park → harvest → fix loop, tracked end to end.

## Final status

**Done.** All nine steps checkpointed on branch `v2-guidance-over-enforcement`;
`pnpm check` stayed green throughout (159 tests at close). The build ran entirely on
the new loop — every step planned with `/pb-step`, entered with `build`, verified at a
pause, checkpointed with the executor-agnostic `checkpoint`. This session is itself
closed through `/pb-reset`: the plan that built v2, archived by v2's own close-out.

## Deferred tangents (future plumbbob)

- **Opt-in guard mode** (Q1, deferred): a hard-block mode behind an off-by-default flag,
  if lived experience ever shows guidance lets something through. Deliberately not built
  — the reversible default is guidance-only.
- **`docs/plumbbob-README.md`** still describes the v1 mode-machine/muzzle; the
  attention-first philosophy doc remains valid. A docs pass is a future task.
- A non-blocking **orientation nudge** at edit time (D11) if on-demand `/pb-status`
  proves insufficient.
- A multi-lens adversarial **self-review** in `/pb-verify` (D16) if single-read drift
  ever slips through.
- **Merge to `main`** and cut a release (`/version`) — left to the author per D5.

## Checkpoints

- baseline da0f9af28014b9e0f844bc34797779da86e625eb
- step 1 94c8056f296a7035041369c231a3215bc248edde
- step 2 478f3027c7f87b6b6eab3e18a83b42d236bccf4e
- step 3 744270935effe2e76d5411168abe95b78fae144b
- step 4 13b6381ba759a5b7cef56fb4cbf592773786e8c7
- step 5 d3f8127258130977874771ad8ca95ed69c9513ec
- step 6 1e67cf9dbca5b49d5c655a1eb5bb31001bd474a8
- step 7 2ae5ae7f4d5b7bc5feec74a799f8ec4fb6e96dab
- step 8 8c52779ce6d68e657448d37ec61f902374f7f116
- step 9 6f671b0d8d9fef03f22c70c9502c8aa42e67f68c
