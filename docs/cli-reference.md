# CLI reference

The `plumbbob` CLI is the mechanical layer the `/plumbbob:*` skills shell out to; in
normal use you **never type it by hand**. This page documents the full surface anyway, for
power users, for driving PlumbBob from another harness, and for understanding what each
skill actually runs.

```text
plumbbob <verb> [args]      # also available as `pb`
```

It is a lean CLI (node builtins plus one deliberate dependency,
[checkride](https://www.npmjs.com/package/checkride) ([**C2 (few-deliberate-deps)**](decisions.md#c2), amended; [**D32 (checkride-gate)**](decisions.md#d32))) that runs
natively on Node ≥ 22.18. Every verb is a
pure function that writes to stdout/stderr and returns an exit code; the only
`process.exit` is the bin entry.

## Verbs at a glance

| Verb | Synopsis | Effect |
| ------ | ---------- | -------- |
| `start` | `start <title> [--slug <name>] [--local] [--allow-dirty]` | scaffold `builds/<slug>/`, record baseline, open the session |
| `status` | `status [--build <slug>] [--invoked "<args>"]` | print the orientation dashboard (or `NO ACTIVE SESSION`) |
| `build` | `build [<n>] [--build <slug>]` | write step `n`'s seam + `STEP` (goes in-flight) |
| `handoff` | `handoff [<n>] [--plan] [--driver] [--build <slug>]` | print the turn's whole CLI-rendered ending, by tier; read-only |
| `check` | `check [--bail] [--changed] [--all] [--only a,b] [--skip a,b] [--include a,b]` | run the heavy gate; no state change |
| `checkpoint` | `checkpoint [<n>] [--plan] [-m <msg>] [--body <<'BODY'…]` | gate on green, commit, record SHA, mark step done |
| `revert` | `revert [--to <n>] [--build <slug>]` | `git reset --hard` to a checkpoint SHA |
| `abandon` | `abandon [--build <slug>]` | drop the in-flight step, keep its work in the tree |
| `park` | `park <text>` | append a line to the park list |
| `spike` | `spike <slug> [opt…] [--build <slug>]` \| `spike report <slug>` \| `spike done` | throwaway worktree experiment |
| `agent` | `agent list` \| `agent run <name> [--step N] [--mode …] [--agent <path>] [--build <slug>]` | list user-authored agents, or run one through the doorway |
| `use` | `use <slug>` | re-point the active-build cursor and resume that build |
| `finish` | `finish [--body <<'BODY'…] [--build <slug>]` | append checkpoints to the report, make the final commit, close the session |
| `init` | `init [--uninstall] [--force]` | link plumbbob into Claude Code as the skills-dir plugin |
| `doctor` | `doctor [--migrate]` | diagnose the plugin link; migrate a legacy flat sidecar |
| `recover` | `recover [--fix]` | reconcile the control plane: stale markers, a cursor pointing nowhere, spike leftovers |
| `turn` | `turn` | `UserPromptSubmit` hook machinery; not a user verb |
| `help` | `help [<verb>]` \| `--help` \| `-h` | print the verb table, or one verb's flags |
| `version` | `version` \| `--version` \| `-v` | print the CLI version |

`status`, `build`, `handoff`, `revert`, `abandon`, `spike`, `finish`, and `agent` accept `--build <slug>`
to target a specific build; without it, the verb resolves the active build from the cursor
([**D28 (state-cursor)**](decisions.md#d28), see [the layout](#the-plumbbob-sidecar)). The other verbs act on
the cursor's build only.

Every verb answers `--help` (or `-h`) with its own synopsis, arguments, and flags:
`plumbbob checkpoint --help`, or equivalently `plumbbob help checkpoint`. The flags a verb
declares are the only ones it accepts: an unrecognized flag is a refusal (exit 1), never a
silently ignored token, so a typo cannot fall through into a commit. `turn` and `park` are the
two exceptions to the refusal: `turn` is a hook that must never wedge a prompt, and `park`'s
argument is free text.

Where a line sits picks its shape ([the turn anatomy](presentation.md);
[**D84 (one-liner-register)**](decisions.md#d84)). A transition
prints its whole ending to stdout as one block: the lead line wearing a bold label
(`**Checkpoint**: Step 15 complete (2d917cde7)`), the Verdict where one is measured, the
advisories as bare capitalized sentences with their `→` remedies, and the Next Up pointer,
one blank line between each. A refusal is not an ending, so it goes to stderr keeping the
`plumbbob:` prefix, which names the speaker where checkride's output and git's share one
result. One formatter in `src/lib/notice.ts` renders all three heads and the order they
stack in.

## Session verbs

### start

```text
plumbbob start "<title>" [--slug <name>] [--local] [--allow-dirty]
```

Scaffolds the sidecar, records the baseline `HEAD`, and opens the session. By default it
plants a tracked build folder at `.plumbbob/builds/<slug>/` (the slug derived from the title
as `YYYY-MM-DD-<title-slug>`, date-prefixed so `builds/` lists chronologically; `--slug`
overrides it verbatim, no prefix) holding `intent.md`, `build-log.md`, and `checkpoints`
(`baseline <sha>`); it writes the tracked `settings.json` (seeded empty as `{}`, which is
exactly "all defaults", since absent `check` already means checkride is the gate and absent
`auto` already means false ([**D24 (configurable-check)**](decisions.md#d24)/[**D32 (checkride-gate)**](decisions.md#d32)); the file is
yours once it exists, so a re-start never touches it) and the untracked
`STATE` sentinel (whose content is the active-build cursor, pointed at the new build, [**D28 (state-cursor)**](decisions.md#d28)) and narrows the
repo's `info/exclude` to the control-plane patterns ([**D17 (two-planes)**](decisions.md#d17)/[**D26 (build-folders)**](decisions.md#d26)). `--local` opts out into
the old fully untracked flat layout: everything under `.plumbbob/` excluded ([**D26 (build-folders)**](decisions.md#d26)).
Refuses (exit 1) on an empty title, a slug that collides with an existing build, a non-git
directory, a repo with no commits, an already-active session, or a dirty tree;
`--allow-dirty` overrides the dirty-tree refusal and records the current `HEAD` as the
baseline ([**D22 (clean-baseline)**](decisions.md#d22)).

### status

```text
plumbbob status [--build <slug>] [--invoked "<args>"]
```

Prints the orientation dashboard (title, the derived phase, the step list with the next
step's done-when and seam, the last checkpoint, and the parked / open-question counts), then a
single suggested next move ([**D8 (status-dashboard)**](decisions.md#d8) / [**D15 (one-next-move)**](decisions.md#d15)). Read-only; prints `NO ACTIVE SESSION` and
exits 0 when there is no session.

`--invoked "<args>"` takes the raw text of a skill invocation (the `/plumbbob:build`
skill passes its `$ARGUMENTS` through). An explicit step number in that text repoints
the dashboard's marker, detail rows, and next move at the requested step, noting
anything it skips or collides with; the injected state then never argues with a typed
`/plumbbob:build 22`. Text with no step number (flags only, or a host that never
substitutes the placeholder) changes nothing.

### build

```text
plumbbob build [<n>] [--build <slug>]
```

Reads step `n`'s seam from `intent.md` and writes `SEAM` (the path list) and `STEP` (the
number); the `STEP` file is what makes the dashboard read `BUILD`. The seam is
orientation, not a lock. Refuses (exit 1)
with no session, a non-numeric or `< 1` step, or a seam it cannot parse (seams are exact
paths or `dir/` grants, never globs; [**D23 (no-glob-seams)**](decisions.md#d23)).

### handoff

```text
plumbbob handoff [<n>] [--plan] [--driver] [--build <slug>]
```

Prints the whole CLI-rendered **ending of a turn** ([the turn anatomy](presentation.md);
[**D80 (cli-renders-model-relays)**](decisions.md#d80)) as one contiguous block, closed by a trailing blank line so nothing that follows can clobber
it. Read-only, no state change. Every part outside the readout fence is a bold label, a
colon, and text that wraps, with one blank line between blocks and no fence but the
readout's own (plus the inline diff's).

At a build pause it renders the turn entire, in this order:

- `**Summary**:` the lead the model wrote as `.plumbbob/detail.md`'s `## Summary`
  section, with the `(details: …)` bracket appended, then the `## <n>` section titles
  beneath it as the numbered highlights.
- `**Readout**:` the step and its title, then the fence: the `check` row measured from
  `.check/summary.json`, `seam` from the SEAM marker against the work-plane diff, `diff`
  and `spent` from `git diff --numstat`, `stats.json`, and the turn ledger, folded with
  the three judgment rows (`done-when`, `decisions`, `constraints`) the model wrote into
  the detail file. Green rows collapse to a count, red rows name the one offender.
- a `diff` fence, when the change is 20 lines or fewer.
- `**Verdict**:` the ladder rung, computed worst-of over those same rows plus the step's
  accrued stats, naming its worst component in a trailing parenthetical
  ([**D82 (readout-ladder)**](decisions.md#d82)).
- `**Next Up**:` the next undone step, its progress count, and a bracket carrying the
  step's `- model:` recommendation and where to read it in full.
- `**Your Call**:` the moves a human actually makes at a pause, each with its outcome.
- `**Recommendation**:` the model's own call, read from the detail file's
  `## Recommendation` section behind a CLI-prepended label. It is the ending's last text,
  Your Call being its last rendered block.

The tiers below it are derived, not passed. A landed step with none in flight yields the
orientation-tier ending (the Verdict and Next Up only: no Your Call, no recommendation),
and a fresh session with nothing measured yields the forward pointer alone. An explicit
`<n>` overrides which step it reports on; otherwise it uses the in-flight step, else the
last checkpointed one.

Two endings no session state can tell apart from those take a flag, so every tier's ending
is emitted here rather than faked in a skill's prose: `--plan` renders the plan-pause
ending (a leading `---` rule, since the model's framed plan precedes it, then Next Up, a
your-call block carrying the two plan moves, and the recommendation; nothing is measured
yet, so no Verdict), and `--driver` renders a driver turn's pointer alone, which aims back
at the step still open instead of forward at the next one. Owning every ending here rather
than as prose in the skills keeps them from drifting out of sync with `status`, which
renders the same next-step detail. Refuses (exit 1) with no session, or with `--plan` and
`--driver` together.

Every transition verb prints its own ending through this same code, so `checkpoint`,
`park`, `revert`, `abandon`, `spike`, `use`, and `finish` each emit the Verdict (where one
is measured) and the pointer for themselves, and a skill relays one command's output rather
than two. `handoff` stays the way to render an ending where no verb ran: a build pause, a
re-read of the boundary, the plan pause, or a driver turn a skill drove some other way.

### check

```text
plumbbob check [--bail] [--changed] [--all] [--only a,b] [--skip a,b] [--include a,b]
```

Runs the heavy gate with **no** state change ([**D16 (check-plus-self-review)**](decisions.md#d16) / [**D24 (configurable-check)**](decisions.md#d24) / [**D32 (checkride-gate)**](decisions.md#d32)). The gate is
[checkride](https://www.npmjs.com/package/checkride), run in-process: each slot (checkride's own set (`types`, `lint`, `struct`, `dead`, `test`, `docs`, `links`, …) plus
any custom check the config declares) resolves to the tool the repo already configures,
raw output lands in `.check/`, and a red run names the failing slots with
their `.check/<slot>` pointers. A `check` key in the settings ladder
(`settings.local.json` → `settings.json`, [**D27 (settings-ladder)**](decisions.md#d27)) overrides checkride with a shell
command, spawned exactly as before; that is how non-checkride repos gate.

The flags narrow a checkride run for the iteration loop (`--bail --only types,lint`);
they map straight onto checkride's own flags and are warned-and-ignored on the override
path. `checkpoint`'s gate takes no flags: the commit gate is always the full run.

That full run is the only gate plumbbob has. A repo may *also* install checkride's own
Stop hook, which gates the code at the end of every file-touching turn under whatever
narrowed profile its `gate` key names: a separate gate on a separate plane, and one that
never stands in for this one ([**D75 (two-gates)**](decisions.md#d75)). This repo ran
both until 0.11.0 and now runs the full gate alone; [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
says why.

Exits with the check's code: **0** green, **1** red (including a run where every slot
skipped, which refuses rather than passing vacuously), and **2** when the gate itself
broke (for example a malformed `checkride.config.json`). Refuses (exit 1) with no session.

### checkpoint

```text
plumbbob checkpoint [<n>] [-m <msg>] [--body <<'BODY' … BODY]
plumbbob checkpoint --plan  [--body …]
```

The executor-agnostic commit tick ([**D3 (author-blind-executor)**](decisions.md#d3)). Resolves the step (explicit `<n>`, else the
in-flight `STEP`, else the first undone step in `intent.md`), then gates on a green check,
commits any pending work (or records the existing `HEAD` if the tree is already clean) with a
CLI-owned Conventional subject `<type>(<scope>): <description>` (scope from the build slug, type
from the step title; author prefix honored, else `feat`), appends `step <n> <sha>` to `checkpoints`,
flips the step to `[x]`, and clears `SEAM`/`STEP`, dropping the dashboard back to the
`DESIGN` boundary. It also appends the step's entry to the build-log's `## Log`: the dated
line, and beneath it the pause as the human approved it (the Summary and highlights, the
Readout, the Verdict, the recommendation, and the full story behind each highlight), read
from `.plumbbob/detail.md`, which it then truncates ([**D81 (detail-file)**](decisions.md#d81));
the lead line's bracket carries a `details:` pointer at that entry. `-m <msg>` overrides
the subject. The commit **body** leads with a
`plumbbob step N` marker, then a `--body` heredoc on stdin (skill-composed,
proportional); without it a deterministic fallback carries done-when + seam + diffstat
([**D68 (conventional-subjects)**](decisions.md#d68)/[**D35 (fallback-body)**](decisions.md#d35)). `--plan` instead commits *only* the build's artifact folder as
`chore(<scope>): plan` and records a `plan <sha>` line, giving the plan its own commit so
the first step's diff doesn't absorb the scaffold ([**D36 (plan-commit)**](decisions.md#d36));
it records the plan pause's cold read the same way, beneath a `plan committed` line in
the Log. Either form closes on its
whole ending, `handoff`-rendered and printed here: the lead line, the Verdict the step just
earned (the plan commit measures nothing, so it has none), any advisory, and the pointer.
Staged paths outside the step's seam are an advisory, never a gate, and the stray they name
puts a `seam strayed` rung under that Verdict, the same rung the pause's measured seam row
gave it. Refuses (exit 1) with no session,
no resolvable step, or a red check.

### revert

```text
plumbbob revert [--to <n>] [--build <slug>]
```

`git reset --hard` to a recorded checkpoint SHA: the last step by default, `--to <n>` for a
specific step, or the baseline as the fallback. The build folder is now *tracked* ([**D26 (build-folders)**](decisions.md#d26)),
so before the reset `revert` snapshots `builds/<slug>/` to a temp dir and restores it after:
park lines and intent edits survive even when reverting to a baseline that predates the folder
([**C4 (never-destroy)**](decisions.md#c4)). Untracked files **inside the seam** are removed, files outside it are left alone.
Clears `SEAM`/`STEP`, dropping back to the `DESIGN` boundary. Refuses (exit 1) with no session,
an invalid `--to`, or a step with no recorded checkpoint.

### abandon

```text
plumbbob abandon [--build <slug>]
```

The third exit from an in-flight step. `checkpoint` lands it and `revert` destroys the work;
`abandon` drops the attempt and keeps the working-tree diff exactly where it is. It clears the
in-flight control markers (`STEP`, `SEAM`, `TICK`, and the step-scoped `handoff.json`), appends
an abandon line to the build-log's `## Log`, and records the drop in `stats.json`. It touches
neither the working tree nor git nor the intent checkbox: the step keeps its `[ ]` and its place
in the plan, re-buildable later, with its diff still in the tree for you to keep, rework, or
commit by hand ([**D79 (abandon-keeps-work)**](decisions.md#d79)). A step exit is a boundary crossing, so `abandon` honors the same approval latch
as `checkpoint`: it refuses when no human turn has intervened since the step began, so an abandon
can never slip a same-turn checkpoint past the pause. Refuses (exit 1) with no session, or with no
step in flight.

### park

```text
plumbbob park "<text>"
```

Appends `<text>` as a raw line under `## Park list` in `build-log.md` and prints
`**Parked**: <text>` ([**D7 (park-then-harvest)**](decisions.md#d7)). This is the dumb capture path: composing the tidy line,
tag at the tail, is the `/plumbbob:park` skill's job. Refuses (exit 1) with no session, empty text, or no
`## Park list` section.

### spike

```text
plumbbob spike "<slug>" [opt…] [--build <slug>]   # open
plumbbob spike report "<slug>"                    # scaffold a report, no worktrees
plumbbob spike done                               # close
```

Opens a throwaway experiment for a genuine fork ([**D18 (spike-lifecycle)**](decisions.md#d18)): a sibling git worktree and
`spike/<slug>-<opt>` branch per option (default options `a` and `b`), created **outside**
the repo root, and drops the `SPIKE` marker. `spike done` removes every spike worktree and
branch and clears the marker. Refuses (exit 1) with no session, a step already in flight, an
empty slug, or a worktree path that already exists; `done` refuses when no spike is open.

### agent

```text
plumbbob agent list
plumbbob agent run <name> [--step N] [--mode before|build|after] [--agent <path>] [--build <slug>]
plumbbob agent run        --mode before|build|after [--step N]
```

The doorway to **user-authored agents** ([**D39 (subprocess-envelope)**](decisions.md#d39); the full author contract is
[`agents.md`](agents.md)). An agent is any executable that speaks a versioned
JSON-stdin / JSON-stdout / prose-stderr envelope; these two subcommands list and run them,
with **no code path to advance the loop**: no checkpoint, no step flip, no chaining
([**C6 (no-advance-verb)**](decisions.md#c6), the identity invariant).

`agent list` prints every resolvable agent (name, origin tier (`project` /`personal`),
slots, and description), walking `.plumbbob/agents/<name>/` (tracked) then
`~/.plumbbob/agents/<name>/` (personal), project shadowing personal ([**D41 (agent-resolution)**](decisions.md#d41)). A malformed
`agent.json` lists as an `✗ … invalid:` line rather than hiding. Refuses (exit 1) outside a
git repository.

`agent run` composes the step's `StepContext` from `intent.md` + settings, spawns the
manifest `command` via `sh -c` at the **repo root** with the agent's own directory in
`PLUMBBOB_AGENT_DIR` ([**D49 (posix-sh)**](decisions.md#d49)) and the context JSON on stdin, streams the child's stderr
live, and, on a clean run (exit 0 + a valid envelope), lands any `parked[]` through the
park verb ([**D44 (cli-side-effects)**](decisions.md#d44)), appends the envelope to the step-scoped `builds/<slug>/handoff.json`
ledger (untracked, cleared at checkpoint or abandon; [**D47 (handoff-ledger)**](decisions.md#d47)), prints the human summary on stderr, and
re-emits the machine envelope on **its own stdout** for the calling skill ([**D46 (stream-discipline)**](decisions.md#d46)).

- **`--step N`** picks the step (else the in-flight `STEP`; without either it refuses).
- **A name** runs exactly that agent and **fails loud** on a miss or an undeclared
  `--mode` slot ([**D54 (bindings-degrade-soft)**](decisions.md#d54); you asked for it by name). **No name + `--mode <slot>`** runs the
  step's harness-**bound** agents for that slot ([**D42 (harness-bindings)**](decisions.md#d42)); a bound agent a teammate lacks
  **degrades to a warning** and is skipped ([**D54 (bindings-degrade-soft)**](decisions.md#d54)).
- **`--mode`** names the slot; it must be one the manifest declares. A single-slot agent
  infers it; a multi-slot agent requires it.
- **`--agent <path>`** points at an explicit agent directory (top of the ladder); it still
  needs a name for the run label.
- **Ctrl-C** kills the child and reports rather than orphaning it ([**D58 (sigint-forwarded)**](decisions.md#d58)); a positive
  `agentTimeout` (below) arms a kill timer ([**D51 (agent-timeout)**](decisions.md#d51)).

Exits **0** on a clean run, **1** on a failed one: a non-zero child exit (reported
verbatim, the envelope of a failed child is *not* trusted), garbage on stdout (out of
contract), a timeout kill, an interrupt, an explicit-name miss, or an undeclared-slot
refusal. A batch of bound agents returns non-zero if any that actually ran failed.

### use

```text
plumbbob use <slug>
```

Re-points the active-build cursor at the named build and resumes it: the one verb for both
switching between builds and picking one back up ([**D30 (use-to-switch)**](decisions.md#d30)). Validates that
`builds/<slug>/` exists, then rewrites the cursor in `STATE` (leaving the session sentinel intact). It advises (but
allows) leaving a build that still has a step in flight: that surviving `STEP`/`SEAM` is the
payoff of per-build markers. The advisory rides the ending, between the lead line and the
pointer into the build just switched to. Refuses (exit 1) with an empty slug or a slug with no build
folder; `status` with no cursor lists the available builds instead of refusing.

### finish

```text
plumbbob finish [--body <<'BODY' … BODY] [--build <slug>]
```

The close-out ([**D9 (finish-no-gate)**](decisions.md#d9)/[**D29 (finish-replaces-wrap)**](decisions.md#d29)). Appends the checkpoint SHAs to the build's `report.md`
(the report itself is written by the `/plumbbob:finish` skill; a missing one is noted, never a
refusal), makes the final
commit (subject `chore(<scope>): finish`, mirroring the step-checkpoint Conventional shape; body
leads with a `plumbbob finish` marker, then an optional `--body` heredoc), and clears
the control state (`STATE`, the cursor, the in-flight markers). No separate archive copy: the
tracked build folder already *is* the record and merges into `main` with the branch, so it
rides into the PR ([**D26 (build-folders)**](decisions.md#d26)). **No** refuse-without-report gate stands in the way. It closes on its own ending: the
lead line naming the folder that now rides the branch, then `**Next Up**: Nothing planned -
/plumbbob:plan`, printed here because finish has just cleared the session `handoff` would
read one from. Refuses (exit 1) only with no session.

### turn

```text
plumbbob turn
```

Hook machinery, not a user verb. Registered as the `UserPromptSubmit` hook, it reads the hook
payload from **stdin** (it takes no arguments), ticks the human-turn ledger that the
checkpoint latch reads, and emits any nudge as `additionalContext` JSON on stdout. It always
exits 0 and never refuses an unrecognized flag: a hook that failed would wedge every prompt in
the session.

## Install verbs

PlumbBob has **two co-equal install paths**: the marketplace plugin (Claude Code installs
the published npm package for you (skills and this CLI on PATH via `bin/`), so it needs no
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
installed: the two register the same plugin name and collide over the `/plumbbob:*`
namespace (skills can drop to flat names like `/plumbbob:status`); `--force` overrides that guard
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
if a `/plumbbob:*` skill opens an empty dashboard. Also available in-session as `/plumbbob:doctor`:
the only way to reach it on a **marketplace** install, where the CLI is on PATH only inside a
Claude Code session.

**Sidecar layout.** When run inside a repo carrying a *legacy flat sidecar* (the
pre-restructure layout with a `config` file, an `archive/` folder, or a flat active session),
`doctor` reports it and offers `--migrate`. `plumbbob doctor --migrate` moves the archive
entries and the active session into tracked `builds/<slug>/` folders (the active one becomes
the cursor; the rest are "done" simply by not being it), turns `config` into `settings.json`,
narrows the excludes, and **stages** the whole move without committing: the commit is yours
([**D31 (doctor-migrate)**](decisions.md#d31)).

**Check gate** ([**D32 (checkride-gate)**](decisions.md#d32)). Reports how the heavy gate will resolve in this repo: a configured
`check` override is named as-is; otherwise checkride's own doctor prints the slot/adapter
table (`✓ types ← tsc`, `○ spell — no tool detected`, …) so you can see what a green gate
actually covers before trusting it.

Exits 0 when everything passes, 1 when a check fails or an un-migrated legacy
sidecar is present.

### recover

```text
plumbbob recover [--fix]
```

Reads the control plane as a set and reports whether it is telling the truth. `doctor`
answers "is plumbbob installed correctly"; `recover` answers "is *this session's* state
consistent": the question that matters after a crash, a lost context window, or a build
switched away mid-step. What it checks:

- **The cursor resolves.** A `STATE` cursor naming a build that is gone is the quiet one:
  every read comes back empty, so `status` renders a plausible *empty dashboard* instead of
  refusing. With exactly one build left, `--fix` re-points at it; with several, it names
  them and leaves the choice to you.
- **The phase is readable.** A spike and a step both marked in flight means `status` shows
  the spike and hides the step. A `STEP` the plan no longer contains means a `refine`
  rewrote `## Steps` underneath it. Both are reported, never auto-resolved: which one is
  real is a judgment call.
- **Nothing is left over.** An orphaned `handoff.json` would thread a finished step's agent
  output into the next step's context; a `TICK` stranded at the boundary arms the approval
  latch against a pause that already closed; a `GRANT` with no turn ledger to clear it
  reads as standing self-approval. `--fix` clears all three.
- **Spike leftovers.** Worktrees and `spike/*` branches with no open spike (which
  `spike done` refuses to touch, since it requires the marker). **Reported with the exact
  removal commands and never removed:** those worktrees sit outside the repo and may hold
  the only copy of what the spike learned.

Diagnosis is free; repair is asked for by name. `--fix` writes only the untracked control
files plumbbob owns: it never touches a tracked artifact (intent, build log, checkpoints,
report), never touches git history, and never lands or advances a step. Recovering is not a
rewind: it reconciles bookkeeping and never restores lost work (that is
[`revert`](#revert), and it is destructive by design). Exits 0 when the control plane is
consistent, 1 while any problem stands.

## The `.plumbbob/` sidecar

The sidecar splits into a **tracked artifact plane** and an **untracked control plane**
([**D17 (two-planes)**](decisions.md#d17)/[**D26 (build-folders)**](decisions.md#d26)). The artifact plane (`settings.json` and every `builds/<slug>/` folder)
is committed, so a build's record (intent, log, checkpoints, report) rides its branch into the
PR. The control plane (`STATE`, `settings.local.json`, and each build's in-flight markers)
stays git-excluded; a session is live iff `STATE` is present.

```text
.plumbbob/
  STATE                    # untracked — session sentinel (presence = live) AND the active-build cursor (its content — D28 (state-cursor))
  TURN                     # untracked — the human-turn counter the approval latch reads, ticked by the UserPromptSubmit hook
  GRANT                    # untracked — a one-turn self-approval, minted only from a typed --auto or step range
  detail.md                # untracked — the in-flight step's full detail: the wire handoff renders a turn from, recorded under the build-log's Log and truncated at checkpoint — D81 (detail-file)
  settings.json            # tracked   — project defaults: {} (or {"check": "…"}); start seeds it empty
  settings.local.json      # untracked — personal overlay only, e.g. a per-worktree {"check": "…"} (no cursor — that lives in STATE)
  agents/                  # tracked   — optional: user-authored agents, one dir per agent (D41 (agent-resolution); see agents.md)
    <name>/agent.json      #            — the manifest; personal agents live under ~/.plumbbob/agents/
  builds/
    <slug>/                # derived slugs are YYYY-MM-DD-<title-slug>, so ls sorts chronologically
      intent.md            # tracked   — canonical intent (rides the branch into the PR)
      build-log.md         # tracked   — live ledger + park list
      checkpoints          # tracked   — "baseline <sha>", "plan <sha>", "step N <sha>"
      report.md            # tracked   — written at finish
      stats.json           # tracked   — per-step receipts (stamps, red runs, reverts) the spent row reads
      harness.json         # tracked   — optional: per-step agent slot bindings (D42 (harness-bindings); see agents.md)
      STEP                 # untracked — the in-flight step number (its presence is the BUILD phase)
      SEAM                 # untracked — the in-flight step's declared paths (awareness, not a lock)
      SPIKE                # untracked — marker, present while a spike fork is open
      TICK                 # untracked — the TURN value stamped when the step was entered; with TURN, the latch's whole state
      handoff.json         # untracked — step-scoped agent-run ledger, cleared at checkpoint or abandon — D47 (handoff-ledger)
```

Which build a verb acts on resolves `--build <slug>` → the active-build cursor in `STATE` → the sole
build in `builds/` → a refusal with a hint ([**D28 (state-cursor)**](decisions.md#d28)). `plumbbob start --local` opts back into
the old fully untracked flat layout (`intent.md`/`build-log.md`/`checkpoints` at the sidecar
root, the whole `.plumbbob/` excluded) for repos that will not track tool folders ([**D26 (build-folders)**](decisions.md#d26)).
A repo scaffolded by a pre-restructure plumbbob keeps that legacy flat layout until
`plumbbob doctor --migrate` moves it here ([**D31 (doctor-migrate)**](decisions.md#d31)).

What every control-plane file holds, how they are git-excluded, and why they are not in
`.gitignore` or your home directory: [`state-and-git.md`](state-and-git.md).

## Settings

Settings resolve through a four-rung ladder ([**D27 (settings-ladder)**](decisions.md#d27)): a CLI flag → `settings.local.json`
(untracked personal overlay) → `settings.json` (tracked project defaults) → a built-in
default. The known keys:

```jsonc
// settings.json  (tracked — shared project defaults; start seeds it empty)
{}                                       // all defaults: no "check" key means checkride is the gate — D32 (checkride-gate)
{ "check": "npm test" }                  // or override the gate with any shell command
{ "agents": { "after": ["reviewer"] } }  // project-wide slot bindings — the bottom of the ladder — D57 (merge-ladder)
{ "agentTimeout": 120 }                  // kill a user-authored agent after N seconds (0/absent = off — D51 (agent-timeout))

// settings.local.json  (untracked — personal, per-worktree)
{ "check": "pnpm check --only types,lint" }   // the same keys, overriding the tracked file in this worktree only
```

`check` overrides the heavy gate (a shell command run in the repo root; its exit code is
the result); **absent, the gate is checkride** ([**D24 (configurable-check)**](decisions.md#d24)/[**D32 (checkride-gate)**](decisions.md#d32)). `auto` is a legacy key
the latch no longer honors ([**D67 (auto-not-a-grant)**](decisions.md#d67)): set, it is
named at the pause and by `doctor`, and it grants nothing, since self-approval comes only
from a typed `/plumbbob:build --auto` or step range. The per-worktree active-build cursor
is **not** a setting: it
is `STATE`'s content, so plumbbob never rewrites this hand-editable overlay ([**D28 (state-cursor)**](decisions.md#d28)). `agents` sets
project-wide slot bindings for [user-authored agents](agents.md): the bottom rung under a
build's `harness.json` and the `--agent` flag ([**D57 (merge-ladder)**](decisions.md#d57)). `agentTimeout` (seconds) arms a
kill timer for a spawned agent; absent or `0` means no timeout, since the human is present
and Ctrl-C works ([**D51 (agent-timeout)**](decisions.md#d51)). Both files are optional JSON: a missing or malformed one
contributes nothing rather than wedging the tool.

## Exit codes

- **0**: success. For `check` (and `checkpoint`'s gate), 0 means the heavy check was
  green.
- **1**: a refusal or failure: a guard tripped (no session, a step in flight, bad
  argument), a red check, or an unknown verb. `check` propagates the underlying command's
  non-zero code.
- **2**: the gate itself broke ([**D32 (checkride-gate)**](decisions.md#d32)); checkride couldn't run at all (for
  example a malformed `checkride.config.json`). Fix the harness before trusting green or red.

## See also

- [`techniques.md`](techniques.md): what each verb is *for* and how the methods fit.
- [`troubleshooting.md`](troubleshooting.md): what to do when a verb refuses.
- [`decisions.md`](decisions.md): the `D#` / `C#` tags referenced above.
