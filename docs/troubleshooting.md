# Troubleshooting

Most problems are install/linking issues with a one-line fix, and the CLI usually tells
you the fix itself. **Start here:**

```sh
plumbbob doctor
```

`doctor` is read-only and understands **both install paths**. It checks that the skills-dir
link resolves to a package carrying the manifest, the skills, and the hook; it also accepts a
**marketplace-only** install as a passing state, flags a double-install **collision** when
both are present, and prints the exact `→ fix` for anything broken. Run it first whenever a
`/plumbbob:*` skill misbehaves.

**Where to run it.** A terminal `plumbbob doctor` works only for the **global / skills-dir**
install (`npm i -g plumbbob`). A **marketplace** plugin puts the CLI on PATH *only inside a
Claude Code session* (via its `bin/` shims), so there is no terminal `plumbbob` — run
**`/plumbbob:doctor`** in-session instead (or just ask Claude to run `plumbbob doctor`). If
no `/plumbbob:*` skill loads at all, that is a plugin-not-loaded problem `doctor` cannot
reach: check the `/plugin` UI and `/reload-plugins`.

## Install and linking

### A `/plumbbob:*` skill opens with an empty dashboard

**Cause.** No plugin linked, so Claude Code loaded no skills — the most common silent
failure. **Fix.** Run `plumbbob doctor`; if it reports "not linked," either install the
[`agent-tools`](https://github.com/robmclarty/agent-tools) marketplace plugin
(`/plugin install plumbbob@robmclarty`) or run `plumbbob init`, then restart Claude Code
(or `/reload-plugins`).

### The skills do not appear at all after installing

**Cause.** Claude Code only scans `~/.claude/skills/` at startup. **Fix.** Run
`plumbbob init`, then **restart Claude Code or run `/reload-plugins`** — the link is live
but the plugin list is cached until a reload.

### A skill prints "plumbbob CLI not found"

**Cause.** The skills shell a bare `plumbbob`, so the CLI must be on your `PATH`. **Fix.**
The **marketplace plugin** puts `plumbbob` (and `pb`) on PATH via its `bin/` shims whenever
the plugin is enabled — confirm it is installed and enabled. For the **skills-dir/global**
install, `npm i -g plumbbob` (it also installs a `pb` shorthand), then `plumbbob init`.
Confirm with `which plumbbob`.

### `plumbbob init` refuses: "a marketplace plumbbob plugin is already installed"

**Cause.** A marketplace plumbbob plugin already provides the skills and the CLI, so linking
the skills-dir plugin too would register a *second* plugin named `plumbbob`; the two fight
over the `/plumbbob:*` namespace and skills can drop to flat names like `/plumbbob:status`. **Fix.**
Keep one. Stay on the marketplace plugin (it needs no `init`), or remove it
(`/plugin uninstall plumbbob@robmclarty`) and re-run `plumbbob init`. `--force` overrides
the guard if you truly want both. `plumbbob doctor` reports the same collision when both are
already present — apply its `→ fix`.

### `plumbbob init` says the path "already exists and is not a plumbbob link"

**Cause.** Something else occupies `~/.claude/skills/plumbbob` (a real directory, or a link
to elsewhere). **Fix.** Move or remove that path, then re-run `plumbbob init`. (`init`
refuses to clobber a non-plumbbob path.)

### `plumbbob init --uninstall` leaves the directory in place

**Cause.** The path is a real directory, not a plumbbob symlink, so `--uninstall` will not
delete it (it never destroys non-link data). **Fix.** Remove it by hand if you are sure.

### Skills still misbehave after a clean `doctor`

**Fix.** Restart Claude Code (or `/reload-plugins`). A symlinked plugin stays current
across `npm i -g plumbbob@latest`, but the running editor still caches the plugin list.

## Sessions and state

### An older repo has a flat `.plumbbob/` (a `config` file or `archive/` folder)

**Cause.** The repo was scaffolded by a pre-restructure plumbbob, before builds got their own
tracked `builds/<slug>/` folders. **Fix.** Run `plumbbob doctor` inside the repo — it detects
the legacy flat sidecar and offers the move. `plumbbob doctor --migrate` relocates the archive
entries and the active session into `builds/<slug>/`, turns `config` into `settings.json`, and
**stages** the whole move without committing ([**D31 (doctor-migrate)**](decisions.md#d31)). Review it with `git status` and make
the commit yourself.

### `status` shows `NO ACTIVE SESSION`

**Cause.** There is no `.plumbbob/STATE` in this repo — install scope is not session scope.
**Fix.** Start a session here: `/plumbbob:plan` (or `plumbbob start "<goal>"`). Sessions are
**per-project** — each repo gets its own `.plumbbob/` sidecar.

### `start` refuses with "the working tree is dirty"

**Cause.** `start` records a clean baseline commit ([**D22 (clean-baseline)**](decisions.md#d22)). **Fix.** Commit or stash
first, or run `plumbbob start --allow-dirty "<title>"` to record the current HEAD as the
baseline — but a later revert-to-baseline will then discard the uncommitted work.

### `start` refuses with "no commits yet" or "not a git repository"

**Cause.** `start` needs a repo with a baseline commit to anchor checkpoints. **Fix.**
`git init` if needed, then make an initial commit, then `plumbbob start`.

### `start` refuses with "a session is already active here"

**Cause.** A `.plumbbob/` session already exists in this repo. **Fix.** Close it with
`/plumbbob:finish` before starting another, or continue the existing one (`/plumbbob:status`).
If `status` shows a build you do not recognize — or an empty one you know you filled in —
the cursor may be pointing at a build folder that is gone; run `plumbbob recover` (below).

### `status` shows an empty dashboard for a build you know you wrote

**Cause.** The active-build cursor in `.plumbbob/STATE` names a build folder that no longer
exists — deleted, renamed, or left behind on another branch. Every read comes back empty, so
the dashboard renders as a fresh untitled build instead of refusing. **Fix.** Run
`plumbbob recover` (or `/plumbbob:recover`): it names the dangling cursor and, when exactly
one build survives, `plumbbob recover --fix` re-points at it. With several, pick the one you
meant with `plumbbob use <slug>`.

### The session state looks wrong after a crash, a context loss, or a build switch

**Cause.** The control plane is a set of small untracked marker files, and a session that
ended abruptly can leave them disagreeing: a step marked in flight that the plan no longer
contains (a `/plumbbob:refine` rewrote `## Steps` underneath it), a spike and a step both
marked at once, an agent handoff ledger left over from a step that never landed, or a latch
stamp stranded at the boundary by a `revert`. **Fix.** `plumbbob recover` reports each one
with its consequence; `plumbbob recover --fix` repairs the ones that need no judgment. It
touches only untracked control files — never intent, the build log, the checkpoints ledger,
or git — and it is not a rewind: discarding a half-done step is still `/plumbbob:revert`.

### `/plumbbob:park` or `/plumbbob:harvest` refuses

**Cause.** Both need an active session, and `harvest` runs only at a **boundary**. **Fix.**
Park works any time the session is live — start a session first if there is none. Harvest
refuses mid-step (a step in flight): finish the step with `/plumbbob:verify` first, then
harvest from the boundary.

## The build loop and checks

### `checkpoint` (or `verify`) refuses because the check is red

**Cause.** The heavy gate failed; the tick refuses to checkpoint on red ([**D16 (check-plus-self-review)**](decisions.md#d16)). **Fix.**
Read the failing slots the gate printed — each names its raw output under `.check/`
(canonical index: `.check/summary.json`) — fix the failure, and re-run. Red means stop,
not pause — there is nothing to approve until it is green. Narrow the loop while
iterating: `plumbbob check --bail --only types,lint`.

### The check gate refuses with "found nothing to check"

**Cause.** No `check` setting is configured, so the gate is checkride ([**D24 (configurable-check)**](decisions.md#d24)/[**D32 (checkride-gate)**](decisions.md#d32)),
and checkride detected no tool configs in this repo — an all-slots-skipped run refuses
rather than passing vacuously. **Fix.** Either give checkride something to check (a
`tsconfig.json`, a `vitest.config.ts`, a `checkride.config.json` custom check, …) or set
the `"check"` key in `.plumbbob/settings.json` to your own command (e.g.
`"check": "npm test"`). `plumbbob doctor` prints the slot/adapter table.

### The check exits 2 — "the gate itself broke"

**Cause.** Checkride couldn't run at all — usually a malformed
`checkride.config.json` ([**D32 (checkride-gate)**](decisions.md#d32)). This is a harness failure, not a code failure; both
block. **Fix.** Repair the config (or set a `"check"` override) and re-run.

### The heavy check runs the wrong command (or fails in a non-pnpm repo)

**Cause.** A `"check"` key in the settings ladder overrides checkride and is spawned
verbatim ([**D24 (configurable-check)**](decisions.md#d24)). **Fix.** Set the `"check"` key in `.plumbbob/settings.json` to your
command (e.g. `"check": "npm test"`), remove it to gate through checkride, or override it
per-worktree in `settings.local.json` ([**D27 (settings-ladder)**](decisions.md#d27)). The command is run in the repo root via
a shell.

### `build` refuses with "build needs a step number" or a seam error

**Cause.** `build <n>` could not find step `n`, or the step's seam is unparseable. **Fix.**
Make sure `## Steps` has the step in the standard format with a `- seam:` line of exact
paths or `dir/` grants — never a glob ([**D23 (no-glob-seams)**](decisions.md#d23)). Sharpen it with `/plumbbob:step`, then
build again.

## The post-edit hook (light feedback)

### No light feedback appears after edits

The `post-edit` hook is intentionally quiet, and several conditions make it a no-op — all
by design ([**D25 (light-then-heavy)**](decisions.md#d25)):

- **No active build.** The hook is gated on a non-empty `.plumbbob/STATE` (its content is the
  active-build cursor): with no cursor — no session, or a `--local` session, whose `STATE` is
  empty — the repo behaves like plain Claude Code. Start a (tracked) session to enable it.
- **Tools absent.** It runs `oxlint` and `ast-grep` from the repo's `node_modules/.bin`; if
  they are not installed there, it silently skips them.
- **Non-source file.** It only inspects `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and `.cjs`
  files, and only if the path still exists.
- **Clean file.** If the file-scoped check passes, there is nothing to report. It never
  blocks an edit and always exits 0.

## Building and publishing

### `npm pack` or `npm publish` aborts with `EBADDEVENGINES`

**Cause.** `devEngines` pins the repo's package manager to pnpm, so `npm pack`, `npm
publish`, or `npm install` run *inside this repo* with plain npm abort. **Fix.** Use pnpm
for repo-local work (`pnpm install`, `pnpm pack`, publish via pnpm). Consumers are
unaffected — `npm i -g plumbbob` ignores `devEngines` (it is dev-scoped to this package).

## Spikes and revert

### `spike` refuses to start

**Cause.** Spikes start from a settled boundary ([**D18 (spike-lifecycle)**](decisions.md#d18)) — not while a step is in flight.
**Fix.** If a step is in flight, finish or revert it first. "Already in a spike" → run
`plumbbob spike done` to close the current one.
If a worktree path "already exists," remove it or run `spike done`.

### `spike done` says "no active spike to close" but the worktrees are still there

**Cause.** `spike done` needs the `SPIKE` marker, and several things clear it while the
worktrees live on: `finish` deletes it, `use <other-build>` moves the cursor away from the
build that owns it, and a spike whose second worktree failed to open never wrote it at all.
The worktrees and `spike/*` branches are then unreachable by any verb. **Fix.** Run
`plumbbob recover` — it finds them and prints the exact `git worktree remove` /
`git branch -D` commands. It deliberately does **not** run them: those directories sit
outside the repo and may hold the only copy of what the spike learned, so salvage first,
then remove by hand.

### `revert` says "no checkpoint recorded for step n"

**Cause.** Nothing was checkpointed for that step. **Fix.** Run `plumbbob revert` with no
`--to` to go to the last checkpoint, or `--to <n>` for a step that actually has one;
`/plumbbob:status` lists the last checkpoint. With no step checkpoints at all, revert falls
back to the baseline.

---

*Still stuck? `plumbbob doctor` names the fix for any link problem, and
[`cli-reference.md`](cli-reference.md) documents every verb, flag, and exit code.*
