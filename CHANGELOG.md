# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.12] - 2026-06-30

- **Added:** an `argument-hint` to every skill that accepts input, so Claude Code shows the accepted
  arguments as greyed-out placeholder text while you type the slash command — for example,
  `pb-build` hints `[step-number] [--auto]` and `pb-spike` hints `<slug> | done`. The five no-arg
  commands (`verify`, `status`, `harvest`, `doctor`, `wrap`) are intentionally left without a hint
  so they do not falsely imply they accept input.

## [0.4.11] - 2026-06-30

- **Changed:** `.plumbbob/STATE` is now a pure session sentinel — its presence means a session is
  live, and its content no longer carries meaning. The dashboard phase is derived from what is on
  disk rather than stored: an in-flight `STEP` file reads as `BUILD`, the new `SPIKE` marker reads
  as `SPIKE`, and otherwise you are at the `DESIGN` boundary. The displayed `[DESIGN|BUILD|SPIKE]`
  labels are unchanged; they are simply computed now instead of being written and read back.
- **Changed:** the CLI's transition messages dropped the `STATE=…` annotations in favour of plainer
  wording — `start` reports the baseline, `build` says "building step N", and `checkpoint` / `revert`
  say "back at the boundary". `spike` now refuses while a step is in flight (rather than refusing on
  a non-`DESIGN` state) and gates its open/close on the `SPIKE` marker.
- **Removed:** the stored five-value state machine, along with the `readState` / `writeState`
  helpers, the six `writeState` transition calls across the verbs, and the dead `REVIEW` / `FINISH`
  branches in the next-move inference. `orient` now takes the in-flight step and a spiking flag
  instead of a state string.

## [0.4.10] - 2026-06-30

- **Added:** `plumbbob checkpoint` now records the build's history as it happens — it appends a
  dated line to the build-log's `## Log` for every step it lands, naming the step (its title
  lifted from `intent.md`) with the short SHA. Because both `/plumbbob:pb-build` and
  `/plumbbob:pb-verify` end in a checkpoint, the ledger fills in step by step instead of being
  reconstructed at wrap. The append is best-effort, so a missing or hand-edited build-log never
  blocks a checkpoint; the recorded checkpoint SHA stays the source of truth.
- **Changed:** `/plumbbob:pb-wrap` now reads the `## Log` as the spine of "what shipped" and adds
  only the unique synthesis — the why behind the decisions, deferred tangents, and final status —
  rather than re-narrating the timeline the checkpoints already wrote. The build-log template and
  the `pb-build` / `pb-verify` skills were updated to match, and the section-append mechanic was
  extracted into a shared helper that `park` now uses too.

## [0.4.9] - 2026-06-30

- **Added:** a `pb-doctor` driver skill that runs `plumbbob doctor` from inside a Claude Code
  session — the only place the diagnostic can run on a marketplace install, where the CLI is
  on PATH only while the plugin is enabled. It is read-only (no Edit/Write), and its injected
  line gates on `command -v` so it surfaces doctor's full report even when checks fail, falling
  back to install-path guidance only when the CLI is genuinely off PATH.
- **Changed:** the README, CLI reference, troubleshooting guide, and `doctor`'s own trailing
  output line no longer imply `plumbbob doctor` is always a terminal command — they now record
  that a marketplace plugin puts the CLI on PATH only inside a session, so
  `/plumbbob:pb-doctor` is the in-session way to reach it.
- **Fixed:** `bin/plumbbob` and `bin/pb` now ship executable through an npm-sourced plugin
  install. The package `bin` field points at the shims themselves so npm/pacote stamps them
  0755 — it normalizes other packed files to 0644, dropping the working-tree `+x` bit — and the
  shims were hardened to resolve any symlink chain so `npm i -g` and `node_modules/.bin` deps
  keep working alongside the plugin-on-PATH path.

## [0.4.8] - 2026-06-30

- **Added:** a `version` verb (`plumbbob version`, `--version`, `-v`) that prints the CLI
  version read from the shipped `package.json`, degrading to `unknown` rather than erroring
  when that manifest is absent or malformed. It joins the existing `help` / `--help` / `-h`
  surface in the CLI reference's verb table.
- **Changed:** the README's "What ships" note now records that `plumbbob --help` and
  `plumbbob --version` are the two things a human types by hand, and the troubleshooting guide
  gains a "Building and publishing" entry covering `npm pack` / `npm publish` / `npm install`
  aborting with `EBADDEVENGINES` inside the repo because `devEngines` pins pnpm — use pnpm for
  repo-local work, while consumers' `npm i -g plumbbob` is unaffected.

## [0.4.7] - 2026-06-30

- **Changed:** the install documentation now presents the two install paths as co-equal and
  mutually exclusive — the self-contained marketplace plugin (which ships the `plumbbob`/`pb`
  CLI on PATH via its `bin/` shims, needing neither `npm i -g` nor `plumbbob init`) and the
  npm-global plus `plumbbob init` skills-dir link. The README, CLI reference, happy-path, and
  troubleshooting docs cover the collision guard (`init` refuses when a marketplace plumbbob
  is present, `--force` overrides) and `doctor`'s awareness of both paths plus its
  double-install detection.
- **Fixed:** the `bin/plumbbob` and `bin/pb` PATH shims use `CDPATH=''` rather than the bare
  `CDPATH=` empty-prefix form, clearing a ShellCheck SC1007 warning. The semantics are
  identical — an empty `CDPATH` scoped to the `cd` so it cannot resolve the script directory
  against a `CDPATH` entry — but the explicit `''` is what the warning itself recommends.

## [0.4.6] - 2026-06-29

- **Changed:** the eleven driver skills are re-prefixed with `pb-` (`plan` → `pb-plan`, and so
  on), so they surface as `/plumbbob:pb-plan` and the like. This reverses the 0.4.4 de-prefix:
  that change assumed marketplace-only distribution, where skills are always namespaced and
  `pb-` is redundant — but plumbbob keeps the non-marketplace skills-dir/CLI install first-class,
  and on that path a two-plugin collision can drop skills to flat names, where the `pb-` prefix
  keeps `/pb-status` from clashing with the built-in `/status`. Command references were updated
  in lockstep across the skills, docs, README, templates, and CLI output strings.
- **Changed:** `plumbbob init`'s in-code framing now describes the skills-dir link as the
  deliberate, first-class non-marketplace install path (npm-global, local dev, pre-plugin
  clients, and eventually other agents) rather than a legacy fallback.
- **Changed:** the plugin's display name is restyled `PlumbBob` to match the README heading.

## [0.4.5] - 2026-06-29

- **Added:** a self-contained marketplace plugin install. The plugin now ships `bin/plumbbob`
  and `bin/pb` PATH shims (resolved relative to the plugin's install dir) alongside the skills,
  so a marketplace install puts the `plumbbob`/`pb` CLI on PATH without `npm i -g` and needs no
  `plumbbob init`. The `bin/` directory is included in the published package files.
- **Added:** a collision guard between the skills-dir link (`plumbbob init`) and a marketplace
  install. A new `marketplacePlumbbob()` helper reads Claude Code's `installed_plugins.json`;
  `init` now refuses when a marketplace plumbbob is already installed (since both register a
  plugin named `plumbbob` and would fight over the `/plumbbob:*` namespace, dropping skills to
  flat names like `/status`), and `--force` overrides the guard.
- **Changed:** `plumbbob doctor` recognizes a marketplace-only install as a valid, passing state
  and flags the double-install collision when both a skills-dir link and a marketplace install
  are present. `dev-install.sh` now runs `init --force` to link the live checkout past the guard.

## [0.4.4] - 2026-06-29

- **Changed:** the eleven driver skills drop the `pb-` prefix introduced in 0.4.3 and go
  back to bare verbs — they now invoke as `/plumbbob:plan`, `/plumbbob:step`,
  `/plumbbob:build`, `/plumbbob:verify`, `/plumbbob:park`, `/plumbbob:status`,
  `/plumbbob:harvest`, `/plumbbob:wrap`, `/plumbbob:refine`, `/plumbbob:revert`, and
  `/plumbbob:spike`. Claude Code namespaces a plugin's skills as `/<plugin>:<skill>`
  rather than flattening them to bare commands, so the 0.4.3 prefix was redundant and
  produced a doubled `/plumbbob:pb-plan`. If you installed 0.4.3, re-run `plumbbob init`
  and use the `/plumbbob:<verb>` form. The CLI verbs (`plumbbob status`, `pb park`, …)
  are unchanged.
- **Fixed:** the install docs and the `init.ts` rationale — which claimed Claude Code
  surfaces each skill as a bare `/<skill>` command and that the names must ship
  pre-prefixed — now correctly state that a plugin's skills load namespaced as
  `/plumbbob:*`.
- **Changed:** the `/version` release skill now force-writes `.claude-plugin/plugin.json`
  in lockstep with `package.json`; this release brings the plugin manifest back into sync
  after it had drifted to 0.4.0.

## [0.4.3] - 2026-06-29

- **Changed:** the eleven driver skills are renamed with a `pb-` prefix — `/pb-plan`,
  `/pb-step`, `/pb-build`, `/pb-verify`, `/pb-park`, `/pb-status`, `/pb-harvest`,
  `/pb-wrap`, `/pb-refine`, `/pb-revert`, `/pb-spike`. Claude Code flattens a plugin's
  skill names into the bare chat command (`/status`, `/park`, …), which collided with
  built-in and other-plugin slash commands and was ambiguous; the prefix restores the
  original unambiguous naming. The CLI verbs (`plumbbob status`, `pb park`, …) are
  unchanged.

## [0.4.2] - 2026-06-27

- **Added:** four `ast-grep` rules to the check gate that enforce the zero-dependency
  constraint (imports must be `node:` builtins or relative paths) and three architectural
  invariants — `process.exit` only in the bin entry, no `console` logging, and subprocess
  spawning confined to the git, check, and spike modules.
- **Added:** a fuller documentation set — `docs/techniques.md` (the methods behind the
  loop), `docs/cli-reference.md`, `docs/troubleshooting.md`, `docs/decisions.md` (the
  `D#` / `C#` design-decision key), and a root `CONTRIBUTING.md` — all cross-linked from a
  new Documentation section in the README.
- **Fixed:** documentation drift — the philosophy doc now describes guidance rather than
  the retired v1 enforcement model, the happy-path example shows the real `park` output,
  and the package description reflects the current skill count.

This is a docs-and-tooling release; no runtime behavior changed.

## [0.4.1] - 2026-06-27

- **Changed:** the test suite is reorganized by intent — unit tests now sit in `__tests__/`
  next to the module they cover, while multi-module tests live under `test/` in labeled
  `integration/`, `e2e/`, and `contract/` folders, with shared helpers in `test/helpers/`.
  This is purely internal; no runtime behavior changes.
- **Changed:** `cli.ts` is split into a thin executable entry plus `cli-core.ts`, so the
  argv dispatch and help table can be imported and unit-tested without the bin's lone
  `process.exit` tearing down the test worker.
- **Added:** unit coverage for the previously untested library modules (`git`, `archive`,
  `check`, and the only-indirectly-covered `sidecar`), in-process tests for the session
  verbs (`start`, `status`, `park`, `build`, `check`, `checkpoint`, `wrap`, `revert`,
  `spike`), and a `cli-core` dispatch test.
- **Added:** a `dev-install.sh` smoke test that stubs `pnpm`/`node` on `PATH` to assert the
  build/link/init orchestration without a real global link, plus extra `post-edit.sh` hook
  branch cases (no session, a non-source extension, and a missing file).

## [0.4.0] - 2026-06-25

- **Changed:** batch planning is now the default. `/pb-plan` authors the **whole**
  `intent.md` — Frame, Decisions, Constraints, **and all the Steps** (each with a
  done-when and a seam) — so the happy path is to plan once and drive `/pb-build` per
  step until done. Just-in-time stepping survives, but `/pb-step` is now a *revision*
  tool: it sharpens the next step against reality (an empty `/pb-step` auto-syncs it)
  rather than being the way steps are born. (Supersedes the just-in-time-first default.)
- **Added:** `/pb-plan` takes an optional argument and disambiguates the mode itself —
  no argument runs an interactive interview, a path to an existing file absorbs that
  spec into `intent.md` (retaining its detail so the plan stands on its own), and any
  other text expands an inline intent. No quotes required.
- **Added:** `/pb-build --auto` — an opt-in that lets the agent self-review and approve
  in your place, then chain to the next step until done, halting on a red check or any
  self-review mismatch. The default (no flag) still ends at the human pause.
- **Added:** `plumbbob status` now surfaces the next undone step's **done-when** and
  **seam** in the dashboard, and its next-move hints that `/pb-step` can revise the step
  before you build it.
- **Changed:** `/plumbbob-interrogate` is renamed `/pb-refine` (easier to type) and
  broadened — beyond attacking the frame for holes (appended as Open questions), it can
  now repair the plan to re-sync `intent.md` with reality, human-approved, at any point.
- **Fixed:** the `build-log.md` template's boundary section is now `## Harvest` (matching
  `/pb-harvest`, which writes there) instead of the stale `## Triage`, and a step's
  "done" wording drops the v1 `plumbbob done` for a checkpoint via `/pb-verify` or
  `/pb-build`. The `intent.md` template's Steps guidance now describes batch planning.

## [0.3.3] - 2026-06-25

- **Added:** a `docs/happy-path.md` worked walkthrough that follows one goal end to
  end — framing it, letting `/pb-build` pick and ship each step, then wrapping up,
  archiving, and starting the next task — linked from the README's loop section.
- **Changed:** the root `README.md` is now the single canonical overview, having
  absorbed the standalone `plumbbob-README` (the one law, why it works, calibration,
  the two gate tiers, STATE-as-orientation, git footprint, and the `.plumbbob/`
  layout). The live `templates/` were refreshed to the v2 surface: the step seam in
  `intent.md` now reads as orientation — awareness, not a lock — and `build-log.md`
  uses `/pb-wrap` and `plumbbob wrap` in place of the stale `/plumbbob-report` and
  `plumbbob finish` names.
- **Removed:** the now-duplicate `docs/plumbbob-README.md`, and the unreferenced,
  unshipped `docs/build-log.template.md` and `docs/intent.template.md` — stale copies
  of the live `templates/` pair that `plumbbob start` actually uses.

## [0.3.2] - 2026-06-25

- **Changed:** the close-out is renamed from `/pb-reset` to `/pb-wrap`, and the
  backing CLI verb from `reset` to `wrap`. "Reset" named the mechanism and read as
  destructive — like you were about to wipe your plans; "wrap" names the moment:
  finish up, archive safely, then clear for the next goal. Behaviour is unchanged —
  archive-then-clear, never destroy (C4); report by default, no gate (D9). (A
  separate `wrap` verb existed in v1's finish ceremony and was removed in 0.3.0;
  this reuses the name for the single close-out.)

## [0.3.1] - 2026-06-24

- **Fixed:** the self-contained install no longer breaks on a fresh npm install.
  `setup` had pointed every skill's bin at `$CLAUDE_PROJECT_DIR/node_modules/.bin/plumbbob`,
  but that variable is defined only in Claude Code's hook context and expands
  empty in a skill's bash, so the `/pb-*` status line collapsed to a bad path and
  failed silently. `setup` now resolves the bin when it runs: a `--local` install
  bakes the absolute path to the project-local binary, while `--project` keeps a
  portable bare `plumbbob` (resolved from the `node_modules/.bin` Claude Code
  prepends to `PATH`). The status injection also gained a fallback so a future
  misinstall fails loudly with a fix hint instead of an empty dashboard.
- **Added:** a `plumbbob doctor` verb that diagnoses an install end to end. It
  checks the four things that must be true — the skills are present, their bin
  resolves, the CLI is installed, and the post-edit hook is registered — and
  prints the exact fix for anything broken, including the unresolved placeholder
  and the legacy `$CLAUDE_PROJECT_DIR` bin a pre-0.3.1 install left behind.

## [0.3.0] - 2026-06-23

- **Changed:** Plumbbob shifts from enforcement to guidance — the lock becomes a
  clock. The deciding/executing boundary is no longer held by a hard file lock
  that refused edits; it is held by a pause you advance. `STATE` is demoted from a
  gate to pure orientation, and the verify pause — where you approve a step's diff
  before it is checkpointed — is what now keeps you the decider. The whole surface
  collapses to eight `pb-*` skills you drive from the IDE, so there are no step
  numbers to remember and no raw CLI to type.
- **Added:** the eight-skill surface — `/pb-plan`, `/pb-step`, `/pb-build`,
  `/pb-verify`, `/pb-park`, `/pb-status`, `/pb-harvest`, and `/pb-reset`.
  `/pb-status` is a rich orientation dashboard that names your next move;
  `/pb-verify` is an executor-agnostic tick (check, self-review, validate, pause,
  checkpoint) that reads the diff and not its author, so hand-written, vibed, or
  `/pb-build`-generated code all checkpoint the same way; `/pb-build` is now an
  optional engine that actually implements a planned step; and `/pb-reset` writes
  the report by default and archives with no gate. New `check`, `checkpoint`, and
  `reset` CLI verbs back them.
- **Removed:** the pre-edit muzzle, the seam-guard, and the `bash-guard` hook — the
  entire enforcement layer that only ever defended a lock. The `mode`, `review`,
  `done`, `wrap`, and `finish` verbs are gone, along with the v1 driver skills
  (`pb-start`, `pb-review`, `pb-done`, `pb-wrap`, `pb-finish`) and the
  `plumbbob-report` and `plumbbob-docs` judgment skills, all folded into the eight.

## [0.2.3] - 2026-06-22

- **Fixed:** `plumbbob revert` no longer discards plumbbob's own installed
  files. The verb does a repo-wide `git reset --hard` to the checkpoint, which
  reverted every tracked file — including the driver skills a self-contained
  install copies into `.claude/skills/pb-*`, so an out-of-seam skill edit or a
  `pnpm up plumbbob` re-setup was silently rolled back along with the half-done
  step. revert now snapshots plumbbob's own paths (the sidecar, plus each
  installed skill named in the bundled `skills/` dir) across the reset and
  restores them afterward. Only plumbbob's own skills are protected — a user's
  own `.claude/skills/<name>/` still follows the reset, and the git-excluded
  sidecar is covered too so revert stays robust even where `.plumbbob/` was
  tracked by mistake.

## [0.2.2] - 2026-06-22

- **Fixed:** the pre-edit muzzle no longer blocks writes outside the repository
  or to git-ignored files inside it. The seam-guard previously treated every
  path that was not a `.plumbbob/` control doc or a `docs/` file as code subject
  to the BUILD seam check, so Claude's own plan-mode scratch under
  `~/.claude/plans` was denied as "outside the seam", and ignored files (fallow
  data, `dist/`, `coverage/`) hit the same wall. The muzzle is now gated behind
  `git check-ignore`, so it governs only in-repo, non-ignored paths; `.plumbbob/`
  is itself git-ignored but stays muzzled via an explicit arm, so control state
  (STATE/SEAM) is never made writable.

## [0.2.1] - 2026-06-22

- **Fixed:** `bash-guard` no longer over-blocks read-only redirects outside
  BUILD/SPIKE. The guard previously denied any command containing `>`, which
  caught harmless forms that cannot write a real file — stderr merges (`2>&1`)
  and `/dev/null` sinks (`2>/dev/null`, `&>/dev/null`). These are now scrubbed
  before the write check, while any surviving `>` is still treated as a real
  write and blocked.

## [0.2.0] - 2026-06-22

- **Added:** a self-contained, project-level install shape so Plumbbob can run
  entirely from a project (`pnpm exec plumbbob setup --local`) with nothing
  written under `~/.claude`. The hooks are referenced in place at
  `$CLAUDE_PROJECT_DIR/node_modules/plumbbob/hooks/` (invoked via `sh`, so no
  execute bit is needed) and the skills are copied into `<repo>/.claude/skills/`
  with their bin invocation resolved to the project-local
  `node_modules/.bin/plumbbob`. `--local` writes `settings.local.json`,
  `--project` writes a committable `settings.json`, and a bare `setup`
  auto-detects a project-local dependency.
- **Added:** the eight `pb-*` driver skills (`/pb-start`, `/pb-build`,
  `/pb-review`, `/pb-done`, `/pb-revert`, `/pb-wrap`, `/pb-finish`, `/pb-spike`),
  thin human-fired chat triggers — each `disable-model-invocation: true` — that
  shell their transition verb and report it verbatim, so the whole loop can run
  from the agent window without leaving for a terminal. Every skill now carries a
  `__PLUMBBOB_BIN__` placeholder that `setup` substitutes at copy time.
- **Changed:** transition verbs now run inside a Claude Code session rather than
  being refused under `CLAUDECODE`. The deciding/executing boundary is reframed
  as human-initiated vs model-initiated (not terminal vs chat): the driver skills
  are the human's in-session trigger, and a stray model-initiated transition is
  caught by Claude Code's permission prompt because the verbs are kept out of the
  settings allowlist. `mode` is the lone hold-out — it stays human-only, refused
  in-session and blocked from the model's shell by the Bash guard.
- **Changed:** `plumbbob setup` defaults to the self-contained shape when
  Plumbbob is a project-local dependency; `--global` restores the original
  `~/.claude` install (copied hooks + skills, absolute command paths, bare
  `plumbbob` on `PATH`).

## [0.1.5] - 2026-06-22

- **Added:** a `/version` maintainer skill that bumps the `package.json` version
  by semver (major, minor, or patch), writes a dated Keep a Changelog entry
  summarizing the commits since the last release, and commits the result as
  `chore: release A.B.C`. It lives under `.claude/` rather than the published
  `skills/` directory so it ships to plumbbob's maintainers, not its end users.

## [0.1.4] - 2026-06-22

- **Fixed:** the published `bin` pointed at the raw TypeScript `src/cli.ts`, so a
  fresh `npm install -g plumbbob` only ran where `tsx` (or Node type-stripping)
  happened to be available. The package now compiles to `dist/` and the `bin`
  (`plumbbob` / `pb`) points at `dist/cli.js`, which runs under plain `node`.
- **Added:** `build` (`tsc -p tsconfig.build.json`) and `clean` scripts, a
  `prepack` hook that rebuilds `dist/` before every pack/publish, and
  `tsconfig.build.json` (emits to `dist/`, rewriting the `.ts` import specifiers
  to `.js`).
- **Changed:** the `files` whitelist ships `dist` instead of `src`; knip's entry
  is pinned to `src/cli.ts` now that `bin` resolves into `dist/`.

## [0.1.3] - 2026-06-12

- **Changed:** renamed the project, npm package, and CLI from `plumbline` to
  `plumbbob` (the npm name `plumbline` was already taken). The brand, the command
  (now `plumbbob`, with a `pb` alias), the `/plumbbob-*` skills, the `.plumbbob/`
  sidecar directory, and the `~/.claude/plumbbob/hooks/` install paths all moved
  with it; the `repository` / `homepage` / `bugs` URLs now point at
  `github.com/robmclarty/plumbbob`. The Bash guard still blocks `mode` under the
  legacy `plumbline` spelling as well as `plumbbob` and `pb`.

## [0.1.2] - 2026-06-12

- **Added:** Apache-2.0 `LICENSE` and a README License section; the npm publish
  surface — a `bin` entry for the CLI, a `files` whitelist (`src`, `hooks`,
  `skills`, `templates`), an `engines` Node floor (`>=22.18.0`), and
  `repository` / `homepage` / `bugs` / `keywords` metadata; and this changelog.
- **Changed:** license from `UNLICENSED` to `Apache-2.0`.
- **Removed:** the `private: true` flag, unblocking registry publication.

## [0.1.1] - 2026-06-12

- **Changed:** pinned `devEngines.packageManager` to an exact pnpm version
  (`11.1.2`) instead of a range, and documented that the pin needs manual bumps.

## [0.1.0] - 2026-06-11

- **Added:** initial `plumbbob` CLI (then named `plumbline`) — the verb set (`start`, `status`, `build`,
  `review`, `done`, `revert`, `park`, `spike`, `wrap`, `finish`, `mode`,
  `setup`), the pre-edit / post-edit / bash-guard hooks, skills, and templates
  that enforce the deciding/executing boundary.
