# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
