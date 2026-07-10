# PlumbBob upgrades — Plan 7: the remaining hardening builds

> Question: plan 05 named five workstreams; the latch (spec 06) and its edge
> fixes shipped in 0.7.0/0.7.1, and the eval tier is being built as
> `builds/2026-07-10-eval-tier` (plan 05 item 1). What exactly are the builds
> that follow, in what order, and with what boundaries — so the roadmap rides
> the repo instead of one agent's session?
>
> Date: 2026-07-10. Companions: [`05-review-hardening-plan.md`](./05-review-hardening-plan.md)
> (the source items), [`06-approval-latch.md`](./06-approval-latch.md) (shipped),
> `docs/decisions.md` (D64–D66). Each build below gets its own `/pb-plan`
> intent when it starts — this doc is the queue, not the intents.

## Sequencing

Build 1 (the eval tier, in flight) finishes first: its committed
baseline-vs-latched report is what Build 4 links, and Builds 2–3 land
unmeasured until it exists. Build 2 is independent and may interleave. Each
build closes with `/pb-finish` and a release cut by the human (`/version`).

Standing constraints (unchanged from plan 05 / the decision log): no
thirteenth skill, no new user-facing verb, **no agent-envelope changes** (the
doorway freeze holds — a needed envelope change stops the build and becomes a
research finding instead), dep-bearing examples are standalone packages, and
fascicle stays out of `src/` (eval driver and user-agents only).

## Build 2 — Receipts: plan-time gate probe + instrumentation

### 2a. Plan-time gate probe (plan 05 item 2a)

Move "checkride found nothing to check" from first-checkpoint (the worst
moment) to plan time (while the human is still deciding).

- `src/verbs/start.ts`: after scaffolding, run the same detection pass doctor
  uses — `resolveString(root, 'check', '')` short-circuits on a configured
  override, else checkride's in-process `runDoctor({ cwd, stdout: silent })`
  (pattern at `src/verbs/doctor.ts` `gateReport`). When every
  `DoctorCheck.adapter === null`, print the warning with the exact fix
  (`"check": "npm test"` in `.plumbbob/settings.json`). Never a refusal —
  `start` still succeeds.
- Extract the shared probe into `src/lib/check.ts` (e.g. `detectGate(root)` →
  `{ configured, detected }`) so `start` and `doctor` read one implementation
  (`gateReport` is module-private; the extraction goes to check.ts, not an
  export of doctor internals).
- `doctor` grows the same explicit `○ nothing to check` info line (today an
  all-skip repo reports `failed: 0` with no callout).
- `skills/pb-plan/SKILL.md`: one sentence in the Scaffold step — surface the
  warning to the human at plan time and offer to set the `check` key now.
- Tests: start (probe fires in an empty fixture; silent when configured or
  when tools are detected), doctor (new line), a contract pin for the pb-plan
  sentence.

### 2b. Instrumentation (plan 05 item 3)

Per-build counters accrued at moments the CLI already owns; totals rolled into
report.md at finish. Zero new deps, no new verbs.

- New tracked file `builds/<slug>/stats.json` (anything under the build folder
  not in `excludeControl`'s list rides the branch). Sidecar grows
  `statsPath`/`bumpStat`/`readStats` mirroring the handoff helpers
  (single-writer, malformed-tolerant — D27). Shape, keyed by step:
  `{ "1": { redChecks, driftWarnings, reverts, startedAt, landedAt } }`.
- Accrual points (best-effort, never blocking): `build <n>` stamps
  `startedAt` (nothing records wall-clock today; TICK is a turn counter);
  checkpoint's red-gate branch bumps `redChecks`; `warnScopeDrift` bumps
  `driftWarnings`; `revert` bumps `reverts` against the in-flight step
  (revert records nothing at all today); checkpoint's land beat stamps
  `landedAt` and may add a compact suffix to the build-log `## Log` line
  (e.g. `(2 red, 1 revert, 34m)`).
- Roll-up at finish: beside `appendCheckpointShas`, append a `## Stats`
  section to report.md — one row per step plus totals; silently skipped when
  stats.json is absent (old builds).
- Tests: stats helpers (unit), red-bump via the existing red-gate fixtures,
  revert bump, finish roll-up, absent-file no-op.

## Build 3 — The fascicle review agent + pb-build slimming

### 3a. The multi-provider review agent

Evolve `examples/agents/ollama-reviewer/` into `examples/agents/
fascicle-reviewer/` — one maintained reviewer, generalized. (Alternative if
preferred at plan time: new sibling package, ollama-reviewer frozen.)
Standalone package (fascicle ^0.8.16, zod ^4), never a workspace member,
**zero envelope changes** — it consumes contract 1 exactly as-is via fascicle
`run_stdio`.

- Provider dispatch by env var: `PB_REVIEWER_PROVIDER` = `ollama` (default) |
  `lmstudio` | `openrouter` | `claude_cli` — all four are first-class fascicle
  providers (verified in 0.8.16's type surface). `PB_REVIEWER_MODEL` per
  provider; `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL`/`OLLAMA_HOST` (legacy
  `OLLAMA_MODEL` honored as fallback), `LMSTUDIO_BASE_URL`; claude_cli uses
  the logged-in CLI (`auth_mode: 'auto'`).
- Keep every degradation behavior: missing deps / unreachable endpoint /
  missing key → actionable `blocked` envelope (preflight per provider); diff
  computed in-agent from `step.seam` (40KB cap); advisory `done`-always with
  now→`body`, later→`parked[]`.
- Known upstream caveat from the eval-tier build: fascicle 0.8.16's `run_cli`
  drops the typed provider config for claude_cli (`provider_config: {}`) —
  the claude_cli backend may need the same `extra_args` workaround the eval
  driver uses, until fascicle threads the real config.
- Docs: provider matrix table (provider → env vars → cost profile) in the
  example README + `docs/local-model-review.md`; the "local reviewer beside
  in-session Claude" story is the `after`-slot `harness.json` binding.
- Tests: the example ships its own smoke (`node review.mjs <
  demo/stepcontext.json`) and env-dispatch unit tests; plumbbob's own suite is
  untouched (no envelope change ⇒ no CLI change).

### 3b. pb-build slimming (plan 05 item 4) — rides along

`skills/pb-build/SKILL.md` carries ~28–30 lines of agent-slot material
interleaved through default-path steps 3–5 (before-slot :41-46, build-slot
:52-55, `when`-prose :56-61, status routing :62-67, after-slot :72-76).
Restructure, same contracts:

- Each default-path step keeps one conditional pointer line (the injected
  `plumbbob status` already prints the `harness bindings:` block only when a
  harness exists — that is the visible trigger).
- The five passages move into a single fenced section (e.g. `## Running bound
  agents`), entered only when the status shows bindings. The `--auto` section
  and hard contracts reference it.
- Contract tests: move the pinned sentences deliberately; add one pin
  asserting the default path no longer embeds slot mechanics.
- Same build as 3a because validating the reviewer end-to-end exercises
  exactly these skill paths.

## Build 4 — README repositioning (plan 05 item 5)

Lead with what a prompt cannot replicate; the planning surface becomes the
on-ramp, not the moat. A reorder plus one new section, not a rewrite — and it
runs LAST so it links receipts instead of promises.

- New second section after the hero (before "The loop in one picture"): the
  mechanical substrate — the gate that refuses red, the SHA-per-step ledger,
  the preservation-aware revert, the PR-riding build record, the approval
  latch. Lift the substrate lists already inside the skeptic answers
  (README.md:198-203 and :224-226) into the lead; the skeptic answers then
  reference it.
- The skeptic section's eval blockquote flips from "forthcoming companion" to
  a link to the committed `reports/evals/<date>.md` with the headline
  baseline-vs-latched deltas (done as part of the eval build's close-out if
  the report lands first).
- Intro tagline aligns with "guidance on the work, a latch on the record"
  (already the plugin/package descriptions).
- Fold in whatever resonated or confused in the July demo.
- Verification: `pnpm check`'s docs + links slots; README renders on GitHub
  with the substrate leading.

## What this plan deliberately does not include

- The eval tier (Build 1) — in flight as `builds/2026-07-10-eval-tier`, its
  own intent.
- Any latch/work-plane changes — D10/D13/D64–D66 stand.
- A second agent slot, a new doorway D-number, or fascicle in the CLI.
- The parked eval-tier findings (pb-doctor's headless injection, the c7
  settings-auto flip, the fascicle upstream fix) — routed at that build's
  harvest, not here.
