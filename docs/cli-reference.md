# CLI reference

The `plumbbob` CLI is the mechanical layer the `/plumbbob:*` skills shell out to — in
normal use you **never type it by hand**. This page documents the full surface anyway, for
power users, for driving Plumbbob from another harness, and for understanding what each
skill actually runs.

```text
plumbbob <verb> [args]      # also available as `pb`
```

It is a zero-dependency CLI that runs natively on Node ≥ 22.18 (**C2**). Every verb is a
pure function that writes to stdout/stderr and returns an exit code; the only
`process.exit` is the bin entry.

## Verbs at a glance

| Verb | Synopsis | Effect |
|------|----------|--------|
| `start` | `start <title> [--allow-dirty]` | scaffold `.plumbbob/`, record baseline, open the session |
| `status` | `status` | print the orientation dashboard (or `NO ACTIVE SESSION`) |
| `build` | `build <n>` | write step `n`'s seam + `STEP` (goes in-flight) |
| `check` | `check` | run the heavy gate; no state change |
| `checkpoint` | `checkpoint [<n>] [-m <msg>]` | gate on green, commit, record SHA, mark step done |
| `revert` | `revert [--to <n>]` | `git reset --hard` to a checkpoint SHA |
| `park` | `park <text>` | append a line to the park list |
| `spike` | `spike <slug> [opt…]` \| `spike done` | throwaway worktree experiment |
| `wrap` | `wrap` | archive intent + log + report, clear the sidecar |
| `init` | `init [--uninstall] [--force]` | link plumbbob into Claude Code as the skills-dir plugin |
| `doctor` | `doctor` | diagnose the plugin link |
| `help` | `help` \| `--help` \| `-h` | print the verb table |
| `version` | `version` \| `--version` \| `-v` | print the CLI version |

## Session verbs

### start

```text
plumbbob start "<title>" [--allow-dirty]
```

Scaffolds the `.plumbbob/` sidecar, records the baseline `HEAD`, and opens the session. It
writes `STATE` (the session sentinel), `checkpoints` (`baseline <sha>`), `config`
(`check=…`), `intent.md`, and `build-log.md`, and appends `.plumbbob/` to the repo's
`info/exclude` (**D17**). Refuses
(exit 1) on an empty title, a non-git directory, a repo with no commits, an already-active
session, or a dirty tree — `--allow-dirty` overrides the dirty-tree refusal and records the
current `HEAD` as the baseline (**D22**).

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
orientation, not a lock (v2). Refuses (exit 1)
with no session, a non-numeric or `< 1` step, or a seam it cannot parse (seams are exact
paths or `dir/` grants, never globs — **D23**).

### check

```text
plumbbob check
```

Runs the heavy gate — the command in `.plumbbob/config` (`check=`, default `pnpm run
check`) — streaming its output, with **no** state change (**D16** / **D24**). Exits with
the check's own code (0 = green). Refuses (exit 1) with no session.

### checkpoint

```text
plumbbob checkpoint [<n>] [-m "<message>"]
```

The executor-agnostic commit tick (**D3**). Resolves the step — explicit `<n>`, else the
in-flight `STEP`, else the first undone step in `intent.md` — then gates on a green check,
commits any pending work (or records the existing `HEAD` if the tree is already clean),
appends `step <n> <sha>` to `checkpoints`, flips the step to `[x]`, and clears `SEAM`/`STEP`
— which drops the dashboard back to the `DESIGN` boundary. `-m` sets the commit message.
Refuses (exit 1) with no session, no resolvable step, or a red check.

### revert

```text
plumbbob revert [--to <n>]
```

`git reset --hard` to a recorded checkpoint SHA: the last step by default, `--to <n>` for a
specific step, or the baseline as the fallback. The git-excluded sidecar is preserved
across the reset, so park lines and intent edits survive (**D17** / **C4**); untracked
files **inside the seam** are removed, files outside it are left alone. Clears `SEAM`/`STEP`,
dropping back to the `DESIGN` boundary. Refuses (exit 1) with no session, an invalid `--to`,
or a step with no recorded checkpoint.

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

### wrap

```text
plumbbob wrap
```

The v2 close-out (**D9**). Appends the checkpoint SHAs to `report.md` (if present), copies
`intent.md`, `build-log.md`, and `report.md` into `.plumbbob/archive/<date>-<slug>/`, then
clears the active sidecar files (`STATE` last). Archive-then-clear, never destroy (**C4**);
git is untouched. There is **no** refuse-without-report gate. Refuses (exit 1) only with no
session.

## Install verbs

Plumbbob has **two co-equal install paths**: the self-contained marketplace plugin (which
ships the skills *and* this CLI on PATH via `bin/`, so it needs no `init`) and the skills-dir
link these verbs manage. See [Install](../README.md#install) for the choice; the two are
mutually exclusive.

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
plumbbob doctor
```

Read-only diagnostic across both install paths. For the skills-dir link it verifies the link
resolves to a package carrying the manifest, the skills, and the hook; it also recognizes a
**marketplace-only** install as a valid, passing state, and flags the double-install
**collision** when both are present. It prints the exact fix for anything missing. Exits 0
when all checks pass, 1 otherwise. Run it first if a `/plumbbob:*` skill opens an empty
dashboard. Also available in-session as `/pb-doctor` — the only way to reach it on a
**marketplace** install, where the CLI is on PATH only inside a Claude Code session.

## The `.plumbbob/config` file

`start` writes a flat `key=value` config; the only key today is the heavy-check command:

```text
check=pnpm run check
```

Edit it to point the gate at any command (**D24**) — it runs in the repo root via a shell,
and its exit code is the check result.

## Exit codes

- **0** — success. For `check` (and `checkpoint`'s gate), 0 means the heavy check was
  green.
- **1** — a refusal or failure: a guard tripped (no session, a step in flight, bad
  argument), a red check, or an unknown verb. `check` propagates the underlying command's
  non-zero code.

## See also

- [`techniques.md`](techniques.md) — what each verb is *for* and how the methods fit.
- [`troubleshooting.md`](troubleshooting.md) — what to do when a verb refuses.
- [`decisions.md`](decisions.md) — the `D#` / `C#` tags referenced above.
