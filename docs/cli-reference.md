# CLI reference

The `plumbbob` CLI is the mechanical layer the `/plumbbob:*` skills shell out to — in
normal use you **never type it by hand**. This page documents the full surface anyway, for
power users, for driving PlumbBob from another harness, and for understanding what each
skill actually runs.

```text
plumbbob <verb> [args]      # also available as `pb`
```

It is a lean CLI — node builtins plus one deliberate dependency,
[checkride](https://www.npmjs.com/package/checkride) (**C2**, amended; **D32**) — that runs
natively on Node ≥ 22.18. Every verb is a
pure function that writes to stdout/stderr and returns an exit code; the only
`process.exit` is the bin entry.

## Verbs at a glance

| Verb | Synopsis | Effect |
|------|----------|--------|
| `start` | `start <title> [--slug <name>] [--local] [--allow-dirty]` | scaffold `builds/<slug>/`, record baseline, open the session |
| `status` | `status` | print the orientation dashboard (or `NO ACTIVE SESSION`) |
| `build` | `build <n>` | write step `n`'s seam + `STEP` (goes in-flight) |
| `check` | `check [--bail] [--changed] [--all] [--only a,b] [--skip a,b] [--include a,b]` | run the heavy gate; no state change |
| `checkpoint` | `checkpoint [<n>] [--plan] [-m <msg>] [--body <<'BODY'…]` | gate on green, commit, record SHA, mark step done |
| `revert` | `revert [--to <n>]` | `git reset --hard` to a checkpoint SHA |
| `park` | `park <text>` | append a line to the park list |
| `spike` | `spike <slug> [opt…]` \| `spike done` | throwaway worktree experiment |
| `use` | `use <slug>` | re-point the active-build cursor and resume that build |
| `finish` | `finish [--body <<'BODY'…]` | append checkpoints to the report, make the final commit, close the session |
| `init` | `init [--uninstall] [--force]` | link plumbbob into Claude Code as the skills-dir plugin |
| `doctor` | `doctor [--migrate]` | diagnose the plugin link; migrate a legacy flat sidecar |
| `help` | `help` \| `--help` \| `-h` | print the verb table |
| `version` | `version` \| `--version` \| `-v` | print the CLI version |

Every session verb accepts `--build <slug>` to target a specific build; without it, the verb
resolves the active build from the cursor (**D28**, see [the layout](#the-plumbbob-sidecar)).

## Session verbs

### start

```text
plumbbob start "<title>" [--slug <name>] [--local] [--allow-dirty]
```

Scaffolds the sidecar, records the baseline `HEAD`, and opens the session. By default it
plants a tracked build folder at `.plumbbob/builds/<slug>/` — the slug derived from the title
(override with `--slug`) — holding `intent.md`, `build-log.md`, and `checkpoints`
(`baseline <sha>`); it writes the tracked `settings.json` (`{"auto": false}` — no `check`
key, because absence means checkride is the gate, **D24**/**D32**) and the untracked
`STATE` sentinel, points the `activeBuild` cursor at the new build (**D28**), and narrows the
repo's `info/exclude` to the control-plane patterns (**D17**/**D26**). `--local` opts out into
the old fully-untracked flat layout — everything under `.plumbbob/` excluded (**D26**).
Refuses (exit 1) on an empty title, a slug that collides with an existing build, a non-git
directory, a repo with no commits, an already-active session, or a dirty tree —
`--allow-dirty` overrides the dirty-tree refusal and records the current `HEAD` as the
baseline (**D22**).

### status

```text
plumbbob status
```

Prints the orientation dashboard — title, the derived phase, the step list with the next
step's done-when and seam, the last checkpoint, and the parked / open-question counts — then a
single suggested next move (**D8** / **D15**). Read-only; prints `NO ACTIVE SESSION` and
exits 0 when there is no session.

### build

```text
plumbbob build <n>
```

Reads step `n`'s seam from `intent.md` and writes `SEAM` (the path list) and `STEP` (the
number) — the `STEP` file is what makes the dashboard read `BUILD`. The seam is
orientation, not a lock. Refuses (exit 1)
with no session, a non-numeric or `< 1` step, or a seam it cannot parse (seams are exact
paths or `dir/` grants, never globs — **D23**).

### check

```text
plumbbob check [--bail] [--changed] [--all] [--only a,b] [--skip a,b] [--include a,b]
```

Runs the heavy gate with **no** state change (**D16** / **D24** / **D32**). The gate is
[checkride](https://www.npmjs.com/package/checkride), run in-process: each slot (types,
lint, struct, dead, test, docs, links, spell) resolves to the tool the repo already
configures, raw output lands in `.check/`, and a red run names the failing slots with
their `.check/<slot>` pointers. A `check` key in the settings ladder
(`settings.local.json` → `settings.json`, **D27**) overrides checkride with a shell
command, spawned exactly as before — that is how non-checkride repos gate.

The flags narrow a checkride run for the iteration loop (`--bail --only types,lint`);
they map straight onto checkride's own flags and are warned-and-ignored on the override
path. `checkpoint`'s gate takes no flags — the commit gate is always the full run.

Exits with the check's code: **0** green, **1** red — including a run where every slot
skipped, which refuses rather than passing vacuously — and **2** when the gate itself
broke (e.g. a malformed `checkride.config.json`). Refuses (exit 1) with no session.

### checkpoint

```text
plumbbob checkpoint [<n>] [-m <msg>] [--body <<'BODY' … BODY]
plumbbob checkpoint --plan  [--body …]
```

The executor-agnostic commit tick (**D3**). Resolves the step — explicit `<n>`, else the
in-flight `STEP`, else the first undone step in `intent.md` — then gates on a green check,
commits any pending work (or records the existing `HEAD` if the tree is already clean) with a
CLI-owned subject `plumbbob: step N — <title>`, appends `step <n> <sha>` to `checkpoints`,
flips the step to `[x]`, and clears `SEAM`/`STEP` — dropping the dashboard back to the
`DESIGN` boundary. `-m <msg>` overrides the subject. The commit **body** comes from a
`--body` heredoc on stdin (skill-composed,
proportional); without it a deterministic fallback carries done-when + seam + diffstat
(**D5**/**D6**). `--plan` instead commits *only* the build's artifact folder as
`plumbbob: plan — <title>` and records a `plan <sha>` line, giving the plan its own commit so
the first step's diff doesn't absorb the scaffold (**D11**). Refuses (exit 1) with no session,
no resolvable step, or a red check.

### revert

```text
plumbbob revert [--to <n>]
```

`git reset --hard` to a recorded checkpoint SHA: the last step by default, `--to <n>` for a
specific step, or the baseline as the fallback. The build folder is now *tracked* (**D26**),
so before the reset `revert` snapshots `builds/<slug>/` to a temp dir and restores it after —
park lines and intent edits survive even when reverting to a baseline that predates the folder
(**C4**). Untracked files **inside the seam** are removed, files outside it are left alone.
Clears `SEAM`/`STEP`, dropping back to the `DESIGN` boundary. Refuses (exit 1) with no session,
an invalid `--to`, or a step with no recorded checkpoint.

### park

```text
plumbbob park "<text>"
```

Appends `<text>` as a raw line under `## Park list` in `build-log.md` and prints
`parked: <text>` (**D7**). This is the dumb capture path — composing the tidy tagged line
is the `/pb-park` skill's job. Refuses (exit 1) with no session, empty text, or no
`## Park list` section.

### spike

```text
plumbbob spike "<slug>" [opt…]      # open
plumbbob spike done                 # close
```

Opens a throwaway experiment for a genuine fork (**D18**): a sibling git worktree and
`spike/<slug>-<opt>` branch per option (default options `a` and `b`), created **outside**
the repo root, and drops the `SPIKE` marker. `spike done` removes every spike worktree and
branch and clears the marker. Refuses (exit 1) with no session, a step already in flight, an
empty slug, or a worktree path that already exists; `done` refuses when no spike is open.

### use

```text
plumbbob use <slug>
```

Re-points the `activeBuild` cursor at the named build and resumes it — the one verb for both
switching between builds and picking one back up (**D30**). Validates that
`builds/<slug>/` exists, then rewrites the cursor in `settings.local.json`. It warns (but
allows) leaving a build that still has a step in flight — that surviving `STEP`/`SEAM` is the
payoff of per-build markers. Refuses (exit 1) with an empty slug or a slug with no build
folder; `status` with no cursor lists the available builds instead of refusing.

### finish

```text
plumbbob finish [--body <<'BODY' … BODY]
```

The close-out (**D9**/**D29**). Appends the checkpoint SHAs to the build's `report.md`
(the report itself is written by the `/pb-finish` skill; a missing one is noted, never a
refusal), makes the final
commit (subject `plumbbob: finish — <title>`, mirroring the step-checkpoint shape; body
from an optional `--body` heredoc), and clears
the control state (`STATE`, the cursor, the in-flight markers). No separate archive copy — the
tracked build folder already *is* the record and merges into `main` with the branch, so it
rides into the PR (**D26**). There is **no** refuse-without-report gate. Refuses (exit 1) only
with no session.

## Install verbs

PlumbBob has **two co-equal install paths**: the marketplace plugin (Claude Code installs
the published npm package for you — skills and this CLI on PATH via `bin/` — so it needs no
`init`) and the skills-dir link these verbs manage. See [`install.md`](install.md) for the
choice; the two are mutually exclusive.

### init

```text
plumbbob init [--uninstall] [--force]
```

Links plumbbob into Claude Code as the **skills-dir plugin**: it symlinks the package into
`~/.claude/skills/plumbbob`, where Claude Code loads it in place (skills as `/plumbbob:*`,
the post-edit hook auto-registered from `hooks/hooks.json`). Idempotent, global-only, and it
**never writes `settings.json`**. `--uninstall` drops the link. Refuses (exit 1) if the path
exists and is not a plumbbob link, **or** if a marketplace plumbbob plugin is already
installed — the two register the same plugin name and collide over the `/plumbbob:*`
namespace (skills can drop to flat names like `/pb-status`); `--force` overrides that guard
(the dev-install path uses it). Restart Claude Code (or `/reload-plugins`) to activate.

### doctor

```text
plumbbob doctor [--migrate]
```

Three diagnostics under one verb.

**Plugin link** (read-only). Across both install paths it verifies the skills-dir link
resolves to a package carrying the manifest, the skills, and the hook; it also recognizes a
**marketplace-only** install as a valid, passing state, and flags the double-install
**collision** when both are present, printing the exact fix for anything missing. Run it first
if a `/plumbbob:*` skill opens an empty dashboard. Also available in-session as `/pb-doctor` —
the only way to reach it on a **marketplace** install, where the CLI is on PATH only inside a
Claude Code session.

**Sidecar layout.** When run inside a repo carrying a *legacy flat sidecar* — the
pre-restructure layout with a `config` file, an `archive/` folder, or a flat active session —
`doctor` reports it and offers `--migrate`. `plumbbob doctor --migrate` moves the archive
entries and the active session into tracked `builds/<slug>/` folders (the active one becomes
the cursor; the rest are "done" simply by not being it), turns `config` into `settings.json`,
narrows the excludes, and **stages** the whole move without committing — the commit is yours
(**D31**).

**Check gate** (**D32**). Reports how the heavy gate will resolve in this repo: a configured
`check` override is named as-is; otherwise checkride's own doctor prints the slot/adapter
table (`✓ types ← tsc`, `○ spell — no tool detected`, …) so you can see what a green gate
actually covers before trusting it.

Exits 0 when everything passes, 1 when a check fails or an un-migrated legacy
sidecar is present.

## The `.plumbbob/` sidecar

The sidecar splits into a **tracked artifact plane** and an **untracked control plane**
(**D17**/**D26**). The artifact plane — `settings.json` and every `builds/<slug>/` folder —
is committed, so a build's record (intent, log, checkpoints, report) rides its branch into the
PR. The control plane — `STATE`, `settings.local.json`, and each build's in-flight markers —
stays git-excluded; a session is live iff `STATE` is present.

```text
.plumbbob/
  STATE                    # untracked — session sentinel; its presence means a session is live
  settings.json            # tracked   — project defaults: {"check": "…", "auto": false}
  settings.local.json      # untracked — personal overlay + the cursor: {"activeBuild": "<slug>", …}
  builds/
    <slug>/
      intent.md            # tracked   — canonical intent (rides the branch into the PR)
      build-log.md         # tracked   — live ledger + park list
      checkpoints          # tracked   — "baseline <sha>", "plan <sha>", "step N <sha>"
      report.md            # tracked   — written at finish
      STEP                 # untracked — the in-flight step number (its presence is the BUILD phase)
      SEAM                 # untracked — the in-flight step's declared paths (awareness, not a lock)
      SPIKE                # untracked — marker, present while a spike fork is open
```

Which build a verb acts on resolves `--build <slug>` → the `activeBuild` cursor → the sole
build in `builds/` → a refusal with a hint (**D28**). `plumbbob start --local` opts back into
the old fully-untracked flat layout — `intent.md`/`build-log.md`/`checkpoints` at the sidecar
root, the whole `.plumbbob/` excluded — for repos that will not track tool folders (**D26**).
A repo scaffolded by a pre-restructure plumbbob keeps that legacy flat layout until
`plumbbob doctor --migrate` moves it here (**D31**).

## Settings

Settings resolve through a four-rung ladder (**D27**): a CLI flag → `settings.local.json`
(untracked personal overlay) → `settings.json` (tracked project defaults) → a built-in
default. The known keys:

```jsonc
// settings.json  (tracked — shared project defaults)
{ "auto": false }                        // no "check" key: checkride is the gate (D32)
{ "check": "npm test", "auto": false }   // or override the gate with any shell command

// settings.local.json  (untracked — personal, per-worktree)
{ "auto": true, "activeBuild": "<slug>" }
```

`check` overrides the heavy gate (a shell command run in the repo root; its exit code is
the result); **absent, the gate is checkride** (**D24**/**D32**). `auto` is whether the
agent approves in your place. `activeBuild` is the per-worktree cursor. Both files are
optional JSON — a missing or malformed one contributes nothing rather than wedging the
tool.

## Exit codes

- **0** — success. For `check` (and `checkpoint`'s gate), 0 means the heavy check was
  green.
- **1** — a refusal or failure: a guard tripped (no session, a step in flight, bad
  argument), a red check, or an unknown verb. `check` propagates the underlying command's
  non-zero code.
- **2** — the gate itself broke (**D32**): checkride couldn't run at all (e.g. a
  malformed `checkride.config.json`). Fix the harness before trusting green or red.

## See also

- [`techniques.md`](techniques.md) — what each verb is *for* and how the methods fit.
- [`troubleshooting.md`](troubleshooting.md) — what to do when a verb refuses.
- [`decisions.md`](decisions.md) — the `D#` / `C#` tags referenced above.
