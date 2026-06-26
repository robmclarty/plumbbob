# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
