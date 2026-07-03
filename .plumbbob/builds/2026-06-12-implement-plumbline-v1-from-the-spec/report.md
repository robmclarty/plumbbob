# Report — Implement Plumbline v1 from the spec

Plumbline v1 is built, and it was built using itself: from step 5 onward this
repo's own build ran under Plumbline's enforcement, edits confined to each step's
declared seam by the live hooks. This is the session's closing artifact, written
by `/plumbline-report` and archived by `plumbline finish`.

## What shipped

The README's v1 surface, working on this machine for one user, dogfooded on its
own build:

- **The `plumbline` CLI** (TypeScript, run natively by Node ≥ 24, zero runtime
  deps, hand-rolled argv dispatch): `start`, `status`, `mode`, `park`, `build`,
  `review`, `done`, `revert`, `spike`, `wrap`, `finish`, `setup`. State lives in
  the flat `.plumbline/` sidecar (`STATE`, `SEAM`, `STEP`, `checkpoints`,
  `config`, `intent.md`, `build-log.md`) so the hooks read it with a grep.
- **Three session-gated Claude Code hooks** (POSIX sh): a combined pre-edit
  muzzle + seam-guard, a Bash guard (D21), and a non-blocking light-feedback pass
  (D25). With no session they short-circuit to allow in microseconds (C3/C7).
- **The five skills** with mechanically-enforced contracts (D12/D13):
  `/plumbline-interrogate`, `/park`, `/plumbline-triage`, `/plumbline-report`,
  `/plumbline-docs` — each human-triggered, opening with a `plumbline status`
  pre-injection and a wrong-state refusal.
- **The installer** `plumbline setup` (D27): copies hooks and skills under
  `~/.claude/`, registers them in the global / `--project` / `--local` settings
  file, idempotently. Plus the root `README.md` documenting it.
- **Tests**: 129 across 11 files — strict intent parser, build-loop, hooks via
  synthetic stdin, finish/spike lifecycle, the static skill content-contracts,
  the settings merge, and a full e2e session drive with the live hook in the loop.
  `pnpm check` (tsc, oxlint, ast-grep, vitest, knip, markdownlint) is green.

Measured against the Frame's "done looks like": the e2e test drives
start → build → done → finish in a fixture repo (`test/e2e.test.ts`); the muzzle
was proven live blocking an out-of-seam edit (step 5 probe, and again in the e2e
hook assertions); `pnpm check` is green; and this very session is now finishing
through its own `finish` gate with this report bound for `.plumbline/archive/`.

## The decisions and why

Twenty-eight decisions (D1–D28) and eight constraints (C1–C8) are recorded in
`intent.md`; the load-bearing ones:

- **D1/D2/D3**: CLI in type-stripped TS (kills the build step; intent parsing and
  settings merge are painful in sh); hooks stay POSIX sh with a pure-sh dormant
  fast path; hooks built from the *real* hooks API (JSON on stdin, deny = exit 2),
  not the README pseudocode's fictional `$EDIT_PATH`.
- **D17 + C4**: the sidecar is untracked (`.git/info/exclude`), because a tracked
  sidecar makes "revert never destroys captured attention" unsatisfiable — a
  `reset --hard` would wipe park lines and intent edits. This forced D20 (archive
  local-only) downstream.
- **D11/C8**: every block/refusal message is written for the *model* — name what
  was blocked, name the verb that fixes it, say "do not retry; park it" — because
  hook denials are delivered to Claude, and a thrashing model is the failure mode.
- **D12/D13**: the skill layer's three reinforcing layers (CLI-vs-skill,
  pre-injection-vs-compose, Haiku-vs-Opus, plus `disable-model-invocation` on all
  five) and the two handoff-edge contracts (interrogate appends only to Open
  questions and ends its turn; triage proposes and the human calls it) — because
  those skills are where deciding would otherwise slide back into the chat.
- **D18/D19/D28**: SPIKE locks the main tree like DESIGN while experiments run in
  hook-dormant sibling worktrees; FINISH is a real state entered by `wrap`, the
  one state where `docs/` is writable, with the report skill prompting the wrap.
- **D21**: the muzzle is a fence, not a wall — a targeted Bash guard plus a
  `CLAUDECODE` transition-verb refusal, with the residual gap documented, because
  full shell-write detection is unsolvable and over-filtering taxes real work.
- **D27**: `setup` gains registration scopes (global default, `--project`,
  `--local`) with `~`-portable command paths for the committable scopes — raised
  mid-build as an unexamined assumption in the original global-only spec, weighed,
  and resolved without a new step.

Three deliberate spec deviations are on record: the main-tree lock during SPIKE
(D18), the archive staying out of git (D20), and `tsc` deferred from the light
tier to the heavy gate (D25).

## Parked items and how each was triaged

`/plumbline-triage` was never formally invoked: no parked item ever rose to a
blocker that forced a boundary, and each was tagged at capture with its own
disposition. Final disposition of the five:

- **Archive indexing/retrieval over past builds** — tangent, deferred. The README
  marks it out of scope for v1; a future Plumbline.
- **`finish --commit-archive` flag** — tangent, deferred. Q3 resolved to an
  untracked sidecar (D17/D20), so committing the archive becomes an explicit
  future flag, not a v1 obligation.
- **devEngines exact pin re-breaks pnpm on upgrade** — tangent, deferred. The pin
  (D15) is load-bearing today; a pinning-policy revisit is left for later. (The
  intended README note about the pin was not added — `README.md` is code-locked in
  FINISH — so this stays a small open doc follow-up.)
- **ast-grep postinstall stderr notice** — **resolved** in step 4:
  `hooks/post-edit.sh` filters the two cosmetic lines out of the injected context
  (lines 45–46). The heavy `ast-grep scan` still prints the notice, but that is
  out-of-band of the light feedback the item was about.
- **Other-agent/editor enforcement adapters** — tangent, deferred future
  Plumbline. The deliverable half (naming the core/adapter boundary) shipped in
  `README.md`; the adapters themselves are out of v1 scope.

## Final status

**Done.** All eight steps are checkpointed (baseline + steps 1–8; the SHA list
follows under Checkpoints, appended by `finish`). The full v1 surface is built,
self-enforcing, and green. The single carried-forward loose end is the optional
devEngines-pin note in `README.md`; everything else in the Frame is satisfied.

## Deferred tangents (future Plumblines)

- Other-agent/editor enforcement adapters (Cursor, Aider, Codex, …) over the same
  agent-agnostic CLI + sidecar core.
- Archive indexing/retrieval across past builds.
- `finish --commit-archive` for teams that want the archive in git.
- A `tsc`-daemon revisit so the light tier can catch type errors per-edit (D25).
- A devEngines pinning policy that survives pnpm upgrades, plus the README note.
- A global `plumbline` bin / PATH story (v1 ships an alias; `setup` warns).

## Checkpoints

- baseline ae79436e7b36b3ac7039558e302382b74b6b9dca
- step 1 ba7ae6f485aae49fea7a0d2accaa3d79ef4b0794
- step 2 d6d5479e14c8c61625d15eb7e0ec083978890b01
- step 3 a648588ab352010b6f705a86f4c619d88a5184bb
- step 4 74c0aa5d129ecf38ccf150b9ae9e6a30da9d29ef
- step 5 ffd1318c7b7470e03d91d58103df96847d723805
- step 6 649a623dee87595ee1194796bba6e25c1671536d
- step 7 dcce56102f4890a740787be51d0a3502ea28da7c
- step 8 d73afe3d85a85197523124cc0ff6e6f6308bebe1
