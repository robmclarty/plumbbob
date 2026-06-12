# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-06-12

- **Added:** Apache-2.0 `LICENSE` and a README License section; the npm publish
  surface — `bin` exposing the CLI as `plumbbob` with a `pb` shorthand, a `files`
  whitelist (`src`, `hooks`, `skills`, `templates`), an `engines` Node floor
  (`>=22.18.0`), and `repository` / `homepage` / `bugs` / `keywords` metadata;
  and this changelog.
- **Changed:** license from `UNLICENSED` to `Apache-2.0`. Renamed the project,
  npm package, and CLI from `plumbline` to `plumbbob` (the npm name `plumbline`
  was already taken) — every reference across the CLI, skills, hooks, docs,
  templates, and the sidecar directory (`.plumbline/` → `.plumbbob/`) moved with
  it. The Bash guard still blocks `mode` under the legacy `plumbline` spelling in
  addition to `plumbbob` and `pb`.
- **Removed:** the `private: true` flag, unblocking registry publication.

## [0.1.1] - 2026-06-12

- **Changed:** pinned `devEngines.packageManager` to an exact pnpm version
  (`11.1.2`) instead of a range, and documented that the pin needs manual bumps.

## [0.1.0] - 2026-06-11

- **Added:** initial `plumbbob` CLI (then named `plumbline`) — the verb set (`start`, `status`, `build`,
  `review`, `done`, `revert`, `park`, `spike`, `wrap`, `finish`, `mode`,
  `setup`), the pre-edit / post-edit / bash-guard hooks, skills, and templates
  that enforce the deciding/executing boundary.
