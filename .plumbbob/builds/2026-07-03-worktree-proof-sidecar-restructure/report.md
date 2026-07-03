# Report — Worktree-proof sidecar restructure

**Size:** medium · **Result:** done (10/10 steps, all green + checkpointed)

Prompted by a user's field test (2026-07), which surfaced four compounding
failures: `start` crashed in linked worktrees, build artifacts were local-only and
died with `git worktree remove`, checkpoint history was opaque ("step N done"), and
`config` was a bespoke flat file with no project/personal split.

## What shipped

1. **Linked-worktree exclude crash fixed** — excludes now resolve via
   `git rev-parse --git-path info/exclude` (the common gitdir git actually reads),
   with `mkdirSync` on the parent. Covered by a subprocess test inside a real
   `git worktree add` linked worktree.
2. **Step titles in checkpoint subjects** — `plumbbob: step N — <title>`, falling
   back to `step N done` when intent has no title.
3. **`--body` stdin flag + deterministic fallback body** — checkpoints take a
   skill-composed body via a single-quoted heredoc; without `--body` the CLI composes
   done-when + seam + diffstat, so vibed checkpoints still get informative history.
4. **Settings ladder replaces `config`** — `.plumbbob/config` is gone; `check`
   resolves flag → `settings.local.json` → `settings.json` → default. `auto` is now a
   documented personal-overlay key.
5. **Layout core** — `start` scaffolds `.plumbbob/builds/<slug>/` (intent, build-log,
   checkpoints inside), sets the `activeBuild` cursor in `settings.local.json`,
   refuses on slug collision, and narrows excludes to control patterns. `start --local`
   retains the fully-untracked layout.
6. **Verbs + hook follow the layout; `use` verb lands** — every verb accepts
   `--build <slug>` and otherwise resolves via the cursor; `plumbbob use <slug>`
   re-points and validates; `status` with no cursor lists `builds/`; `post-edit.sh`
   greps `activeBuild`.
7. **Tracked-artifact safety** — `revert` snapshots `builds/<slug>/`, resets, and
   restores as uncommitted changes so park lines survive `reset --hard` (including
   revert-to-baseline where the folder doesn't exist at target); scope-drift warnings
   ignore `.plumbbob/builds/`.
8. **Plan-approval commit** — `checkpoint --plan` commits only the build folder as
   `plumbbob: plan — <title>`, so the first step's diff doesn't absorb the scaffold.
9. **`wrap` → `finish`** — renamed and gutted to report + final commit
   (`plumbbob: finish — <title>`) + clear cursor; `archive/` retired (a finished build
   folder rides the branch into the PR and IS the archive); no compat alias.
10. **Migration + docs + decision log** — `doctor` detects a legacy flat sidecar and
    offers the move (archive → `builds/`, active session → a build folder, `config` →
    `settings.json`), staging but never committing; docs + decisions.md updated.

**Done looks like** (from intent): `start` → steps → `finish` green inside a linked
worktree; a finished build's folder merges with its branch and shows in the PR diff;
`git log --oneline` reads as a narrative (baseline → plan → titled steps → finish).

## Decisions and why

The full decision log is in `intent.md` (D1–D18) and the repo's `decisions.md`. The
load-bearing calls:

- **Two planes** (D2/D8): tracked `builds/<slug>/` artifacts that survive
  `git worktree remove` and ride the PR; untracked control state (the cursor) that
  stays per-worktree. `archive/` is retired because a finished folder *is* the archive.
- **The cursor is `activeBuild` in `settings.local.json`** (D3/D16): one scalar key
  per worktree, so one-active-per-worktree holds by construction. `use <slug>` (Q10)
  re-points it — the single first-class switch/resume verb.
- **CLI owns the subject, prose arrives via `--body` heredoc** (D5/D6): the CLI can't
  compose prose but guarantees a greppable subject shape across the whole history.
- **Clean `wrap`→`finish` break, no alias** (D14): pre-1.0 with a tiny user base is
  the time to rename without deprecation baggage.
- **Dirty-window trade accepted with eyes open** (D18): between checkpoints, artifact
  edits are ordinary uncommitted changes; the plan commit + per-step sweeps shrink the
  window to the code's own, and `--local` retains full immunity.

## Parked & harvested

- **Explore flattening `src/lib`** — parked during the build, left unharvested.
  Classified here as a **tangent**: a structural cleanup with no failed assumption
  behind it. Deferred (see below).

## Final status

**Done.** All ten steps completed, `pnpm run check` green, docs and decisions.md
updated. Not done in this build (explicitly out of scope): folding `plumbbob start`
into `/pb-plan`, `init --host` targets, and any version bump or release — Rob cuts
releases via `/version`.

Note: this repo's *own* `.plumbbob/` sidecar is still the legacy flat layout the
step-10 migration targets; the globally installed CLI (0.4.14) predates the built
`finish` verb. Installing the new build and running `doctor` on this sidecar is
natural next work, not part of this close-out.

## Deferred tangents

- **Flatten `src/lib`** — evaluate whether a shallower directory structure improves
  clarity. Tangent; pick up as its own small build if it earns priority.

## Checkpoints

- baseline 00ac4b1dca97f9a2c99841ec6735fc233ff678da
- step 1 096c89d0678f211ee5042a26b418ec7d6ca617f6
- step 2 7f21628cae6e81ce34d618993159e004b6b127a4
- step 3 55e43b42059c2cfb41c06f13a7a2532f4c6bd1f5
- step 4 0d0711940a63831c1d96b44c4fdbd9341b8fdd52
- step 5 c12e959a1ce1b3d67e2ff88c5c7e7ff6ce58d58e
- step 6 3977d0fa6f72de253fb98c11e19d0fa6452cd166
- step 7 f1c9ba6db5e0e586629b84a66f4edea59d0d3f97
- step 8 a8831d1754656bd0fe1adaacbe350a5f4531b29d
- step 9 518750bdd5cc47d7c85994e8d34a97730a9444d3
- step 10 8c54d070e3101f8308d8393a80a70610bced3c70
