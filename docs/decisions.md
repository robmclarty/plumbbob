# Decisions and constraints — the D and C key

The PlumbBob source is annotated with shorthand tags — `D3`, `C1`, `D17`, and so on —
that point back to settled design decisions (`D`) and hard constraints (`C`). They keep
the code comments terse without losing the *why*. This page is the key: it reconstructs
each tag from where it is referenced in the code, so a reader who hits "`D17`" in a comment
can look up what it means.

The list covers the tags **present in the code**. Some numbers (e.g. `D2`, `D5`,
`D11`, `D12`, `D21`) belonged to superseded decisions and are no longer referenced; a few
entries below are earlier decisions kept only because a comment still cites them, and they
are marked as such.

## Constraints (C)

Hard rules the code must honor. **C1** and **C2** are machine-enforced by the ast-grep
rules in `rules/` (run via `pnpm check`); the rest are upheld by review and the design of
the code.

- **C1 — Functional and procedural only.** No classes, no `this`, no default exports;
  every symbol has a stable named export. Enforced by `rules/no-class.yml` and
  `rules/no-default-export.yml`. *Tagged across* `src/**` and the test tree.
- **C2 — Node builtins plus a few deliberate dependencies.** *Amended* — the CLI imports
  `node:*`, relative paths, and an explicit allowlist of dependencies (currently one:
  `checkride`, our own sibling package, pinned exact — **D32**). The old "zero runtime
  dependencies" wording had hardened into dogma; the rule was always a means
  (determinism, no supply-chain sprawl), not an end. Use a few packages as necessary —
  our own tools first — never a casual `npm install`; hand-crafting what a sibling tool
  already provides is the anti-pattern, not the dependency. Enforced by
  `rules/node-builtins-only.yml` (the allowlist lives in its regex). *Tagged in*
  `git.ts`, `sidecar.ts`, `plugins.ts`, `doctor.ts`, `cli-core.ts`.
- **C4 — Never destroy.** No step, revert, or migration path may lose park lines, intent
  edits, or a recorded build folder. `revert` snapshots the tracked build folder and
  restores it after a `reset --hard` (**D26**); `doctor --migrate` moves the legacy sidecar
  and stages it without committing. *Tagged in* `revert.ts`. (The old archive-then-clear
  copy retired with `archive.ts` — a finished build folder is now the record it protected,
  **D29**.)
- **C5 — Additive git footprint.** PlumbBob only reads, locates, stages, commits forward,
  and resets `--hard` to its own recorded SHAs. It never rewrites pushed history; your
  squash-merge collapses the checkpoint markers at PR time. *Tagged in* `git.ts`,
  `finish.ts`.

*(`C3` is not referenced in the current code.)*

Beyond the numbered constraints, `rules/` guards three architectural invariants:
`no-process-exit` (only the bin entry exits, so verbs and `cli-core` stay importable by
tests), `no-console` (the CLI writes through `process.stdout` / `process.stderr`), and
`centralize-subprocess` (subprocess spawning stays in `lib/git.ts`, `lib/check.ts`, and
`verbs/spike.ts`).

## Decisions (D)

- **D1 — A deterministic, lean CLI; guidance, not a lock.** The foundation:
  a hand-rolled `plumbbob` CLI built on node builtins (plus the deliberate few of **C2**),
  and a deciding/executing boundary held by a pause rather than enforced by a file lock.
  *Tagged in* `cli-core.ts`.
- **D3 — The pluggable, author-blind executor.** `/pb-build` is optional; `verify`
  and `checkpoint` read *the diff, not who wrote it*, so a hand-built, vibed, or
  other-harness diff checkpoints identically. *Tagged in* `checkpoint.ts`, the `build` and
  `verify` skills.
- **D4 — The in-flight step lives in flat files.** `SEAM` (a plain path list) and `STEP`
  (a bare number) record the step in flight as flat files, not parsed markdown. *Tagged
  in* `sidecar.ts`.
- **D6 — Steps are the parseable build plan; roadmap prose lives elsewhere.** Only
  `## Steps` carries the numbered, machine-read increments; narrative roadmap text stays
  out of it. *Tagged in* `orient.ts`.
- **D7 — Capture then triage (park → harvest).** Parking is a dumb flat-line append the
  hooks can read with a grep (no markdown parsing); triage happens later, at a step
  boundary. *Tagged in* `sidecar.ts`, the `park` and `harvest` skills.
- **D8 — `status` is an orientation dashboard.** It parses the live session into the
  where-am-I view. *Tagged in* `status.ts`, `orient.ts`.
- **D9 — `finish` is the close-out: report by default, no gate.** A single verb does the
  whole close-out — it writes `report.md` into the build folder, makes the final commit, and
  clears the control state — but never refuses the exit without a report. Renamed from `wrap`
  (**D29**). *Tagged in* `finish.ts`, the `pb-finish` skill. (Supersedes **D19**.)
- **D10 — The boundary is a pause, not a lock.** Nothing blocks edits; the loop pulls up
  to the verify pause and waits. *Tagged in* `cli-core.ts`.
- **D13 — No edit-blocking guards.** There is no pre-edit muzzle, seam-guard, or bash-guard,
  no human-only `mode` escape hatch, and no `CLAUDECODE` in-session refusal — guidance, not
  enforcement. *Tagged in* `cli-core.ts`.
- **D14 — Subprocess testing in throwaway repos.** Tests run the real CLI against tmp git
  repos; because a real `pnpm check` would recurse into vitest, fixtures point the check at
  a stub. *Tagged in* `test/helpers/fixture-repo.ts`, `check.ts`, and the `check` tests.
- **D15 — `status` infers one primary next move.** It suggests a single next step while
  printing the full list and counts so you can always override. *Tagged in* `orient.ts`.
- **D16 — The heavy check plus a single structured self-review.** The verify tick runs the
  full gate, then reads the diff against done-when, Decisions, and Constraints in one pass.
  *Tagged in* `check.ts`, the `build` and `verify` skills.
- **D17 — The sidecar splits into a tracked artifact plane and an excluded control
  plane.** *Amended* — where the whole `.plumbbob/` used to be git-excluded, now only the
  per-worktree **control** files are (`STATE`, `settings.local.json`, and each build's
  `STEP`/`SEAM`/`SPIKE`); the **artifact** plane — `settings.json` and every
  `builds/<slug>/` folder (intent, build-log, checkpoints, report) — is *tracked* so a
  build's record rides its branch into the PR instead of dying with the worktree (**D26**,
  supersedes **D20**). `start --local` keeps the old whole-directory exclude (**D26**).
  *Tagged in* `sidecar.ts`, `git.ts`, `revert.ts`, `spike.ts`.
- **D18 — The spike lifecycle.** A genuine fork gets a throwaway worktree and branch per
  option, kept outside the repo, torn down by `spike done`. *Tagged in* `spike.ts`.
- **D22 — `start` refuses a dirty tree.** A clean baseline is required; `--allow-dirty`
  overrides it and records the current HEAD as the baseline. *Tagged in* `start.ts`.
- **D23 — Seams are exact paths or `dir/` grants, never globs.** A seam token is matched as
  an exact path or a directory prefix; a glob is rejected. *Tagged in* `intent.ts`.
- **D24 — The heavy check is configurable, defaulting to `pnpm run check`.** The `check`
  command resolves through the settings ladder (**D27**), defaulting to `pnpm run check`;
  `start` seeds it into `settings.json` and warns when the target repo has no such script.
  *Tagged in* `start.ts`, `check.ts`.
- **D25 — Light feedback at the keystroke, heavy checks at the boundary.** The `post-edit`
  hook runs a non-blocking, file-scoped lint pass and injects findings into the model's
  context; `tsc` and the rest of the gate are deferred to the heavy tier inside `verify`.
  *Tagged in* `hooks/post-edit.sh`.
- **D26 — One folder per build under `builds/<slug>/`.** Each build owns a self-contained,
  tracked `.plumbbob/builds/<slug>/` folder (intent, build-log, checkpoints, report) that
  rides its branch into the PR; the in-flight `STEP`/`SEAM`/`SPIKE` markers live inside it
  but stay excluded. `revert` snapshots the folder to a temp dir and restores it after the
  `reset --hard`, so a rewind never destroys tracked park lines even when reverting to a
  baseline that predates the folder (**C4**). `start --local` opts back into the old
  fully-untracked flat layout for repos that will not track tool folders. *Tagged in*
  `sidecar.ts`, `start.ts`, `revert.ts`.
- **D27 — The settings ladder replaces `config`.** A setting resolves flag →
  `settings.local.json` (untracked personal overlay) → `settings.json` (tracked project
  defaults) → built-in default. `check` is a project default; `auto` (agent-approves-in-
  your-place) is a personal preference. Both files are optional JSON; a malformed one
  contributes nothing rather than wedging the tool. Supersedes the flat `.plumbbob/config`.
  *Tagged in* `settings.ts`, `check.ts`, `start.ts`.
- **D28 — The active-build cursor.** Which build a verb acts on resolves `--build <slug>`
  → the `activeBuild` cursor in `settings.local.json` → the sole build in `builds/` → a
  refusal with a hint. Because the cursor is a single scalar key in an untracked per-worktree
  file, one-active-per-worktree holds *by construction* — it cannot point at two builds.
  *Tagged in* `sidecar.ts`.
- **D29 — `finish` replaces `wrap`; the build folder is the archive.** The close-out verb
  was renamed `wrap` → `finish` (a clean break, no alias) and gutted: it writes `report.md`
  into the build folder, makes the final commit, and clears the control state — no separate
  archive copy, because the tracked folder already *is* the record and merges into main with
  the branch. Retired `archive.ts`. Supersedes **D20**. *Tagged in* `finish.ts`.
- **D30 — `use <slug>` switches and resumes.** One `nvm use`-shaped verb re-points the
  `activeBuild` cursor at a build, validating the folder and warning (but allowing) a leave
  with a step in flight — that surviving in-flight state is the point of per-build markers
  (**D26**). *Tagged in* `use.ts`.
- **D31 — `doctor --migrate` moves a legacy flat sidecar into `builds/`.** `doctor` detects a
  pre-restructure flat sidecar (`config`, `archive/`, a flat active session) and, under
  `--migrate`, moves the archive entries and the active session into `builds/<slug>/` folders
  (the active one becomes the cursor; the rest are "done" simply by not being it) and turns
  `config` into `settings.json`. It **stages** the move but never commits — the human owns
  that commit (Q8). *Tagged in* `doctor.ts`.
- **D32 — Checkride is the check gate, imported programmatically.** The heavy check is
  our sibling package `checkride` — the first entry in `dependencies`, pinned exact,
  called through its API (`runChecks`) rather than spawned, so the typed summary (failing
  slots, `.check/<slot>` raw-output pointers) comes back in-process. The `check` setting
  (**D24**, amended) becomes the spawn-command *override* for repos that gate through
  something else: present ⇒ spawn it exactly as before; absent ⇒ checkride. An
  all-slots-skipped checkride run is a refusal, not a green — zero-config detection in an
  unconfigured repo must not vacuously pass the gate. Checkride's exit 2 (harness error)
  reports distinctly from red; both block. *Tagged in* `check.ts`.

### Superseded

- **D20 — The archive was local-only markdown.** Wrapping wrote a plain-markdown archive
  under `.plumbbob/archive/`, local-only, that died with a `git worktree remove`. **D29**
  retired it: a finished build folder is tracked and rides the branch into the PR, so there
  is nothing separate to archive. *No longer referenced in code.*

- **D19 — `finish` refused without a report.** An earlier close-out gated the exit on a
  written report. **D9** removed the gate: `wrap` writes the report by default but never
  walls the exit. *Still cited in* `archive.ts`.

---

*The conceptual companion to this key is [`techniques.md`](techniques.md), which explains
the methods these decisions shape. Contributors adding a new settled decision should give
it the next free `D#`, reference it inline where it is implemented, and add a line here.*
