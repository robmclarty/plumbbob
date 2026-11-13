# Report: move 2, make the plan schedulable

## What shipped

A plumbbob plan can now be read by runciter's scheduler. Steps take three optional lines, `- after:`, `- stop:` and `- effort:`, and they're read strictly. A plan with none of them exports fully serial. The seam parse refuses the same tokens runciter refuses. `plumbbob export [<slug>]` derives `runciter.plan/1` from `intent.md`, runs the contract's three plan rules and plumbbob's four plan checks over it, and writes `plan.json` beside the intent, or writes nothing and names each finding. Once a build is exported, `checkpoint`'s tick, `order` and `defer` keep the file current. `plumbbob check` fails ahead of the gate, naming `plumbbob export`, when any other edit leaves the file behind. This build and `2026-10-17-build-ranges` both carry an exported `plan.json` that validates against the vendored schema. `docs/plan-export.md` specifies all of it, and the template, the plan, step and refine skills, the glossary and the CLI reference teach it.

## Decisions and why

- **D2 (serial-default)**: a step with no `after:` line depends on the step before it in build order, because a scheduler reads a missing dependency as "may run in parallel", the unsafe reading.
- **D3 (range-end-stops)** and **D4 (bare-range-approximation)**: plumbbob's per-range stops become the contract's per-step stops on each range's last step, including a bare range's one step, taken after it lands on the integration branch.
- **D6 (one-seam-grammar)**: plumbbob and runciter share one seam grammar, recorded as a dated revision of D23 (no-glob-seams), so plumbbob can never accept a plan runciter refuses.
- **D11 (refuse-the-write)**: a failing plan writes no `plan.json`, so a scheduler can never act on a plan whose own checks say two steps would collide.
- **D12 (bytes-compare)**: "current" means the bytes equal a fresh derivation's, and `source.sha256` hashes the whole intent, so any edit drifts the plan.
- **D14 (cli-keeps-current)** and **D17 (opt-in-by-presence)**: only an exported build is held to its `plan.json`, and the CLI's own writes never turn the check red. A user with no scheduler pays nothing.
- **D20 (no-forward-after)**: a fourth plan check, approved at step 1's pause, refuses an `after:` line that names a step building later, because otherwise the scheduler and plumbbob's serial walk would read the order opposite ways.
- **D15 (ajv-dev-dep)** and **D16 (vendored-contract)**: conformance is tested against runciter's schema file itself, copied from `9b40f0f`, with ajv as a dev dependency only.

## Parked & harvested

| Park | Why it matters | Settled |
| --- | --- | --- |
| **P1**: [the fourth plan check](build-log.md#L41) | without it, a scheduler and plumbbob read a forward `after:` opposite ways | blocker: folded into step 5 as D20 (no-forward-after) |
| **P2**: [workers pull the trunk](build-log.md#L42) | shapes how move 3's parallel workers stay current, and how a person sees them | tangent: it's runciter's scheduler design for move 3, and nothing here waited on it |

## Final status

Done: all eight steps landed, every range's stop has been recorded, and the gate is green. Two things are left. The roadmap's State and its `runciter.plan/1` row, committed in runciter's repo as a separate docs commit, is the plan's last stop and comes after this finish. And the installed 0.16.0 plugin predates step 7, so until a release ships it, a build exported under the old plugin goes stale at each tick. This build's ticks at steps 7 and 8 were re-exported from `src` by hand.

## Deferred tangents

- P2, for move 3's design in runciter: a worker pulls the integration tip into its worktree at its own commit points (trunk to worker only, opt-in per plan), and parallel workers show on the host task list or as lanes on the frontier card.
- Raised with runciter before move 3, per Q4 (landed-steps): the contract has no field for a landed step, so a plan handed over mid-build would rebuild what has already landed.
- Whether the drift check should cover only the active build, rather than every exported build folder as it does now (range 3's stop).

## Checkpoints

- baseline c50a3aabe7c2cfd3b7e6a2642eb2a4c6e3b1c60c
- plan 1a1c3c2cc6c4b010b5ed50248f21c7366f48c23d
- step 1 a640c7940b421468470210d9bf28333bc839cd8e
- step 2 9483636f88b4aaf4b207d41e53a36b3c54e19dfd
- step 3 4898d42614717b800255b0fa422c70e543b8ea19
- step 4 8680ae64ca6b15a08fd61b8594534bd660c4d216
- step 5 a72eb6104e9805d9abbb9a6a087bb5e3ed2d8cba
- step 6 e3bdedab0112501b0847911b43e4e9c9328eca85
- step 7 f380136fef85819add5ab96f17975ff356c443db
- step 8 07332adb94aaeab705b55c07a343319b1ed49a24

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
| ---- | ---------- | -------------- | ------- | ---------- |
| 1 | 0 | 1 | 0 | 21m |
| 2 | 0 | 1 | 0 | 7m |
| 3 | 0 | 0 | 0 | 8m |
| 4 | 1 | 0 | 0 | 24m |
| 5 | 0 | 0 | 0 | 6m |
| 6 | 1 | 1 | 0 | 9m |
| 7 | 0 | 1 | 0 | 16m |
| 8 | 0 | 0 | 0 | 11m |
| **total** | 2 | 4 | 0 | 102m |
