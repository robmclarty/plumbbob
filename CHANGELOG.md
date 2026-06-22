# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
