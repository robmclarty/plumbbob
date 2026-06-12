# Plumbline

A manual, attention-first build process that enforces the deciding/executing
boundary so you build *with* an LLM instead of being dragged behind one. You
decide on a surface outside the chat; a one-word state file and a set of Claude
Code hooks refuse to let code edits cross that line until you have.

The full philosophy — the one law, the mode machine, the loop — lives in
[`docs/plumbline-README.md`](docs/plumbline-README.md). This file is the
as-built reference: what ships, how to install it, and the verbs you type.

This repository was built using Plumbline, dogfooded on its own build under its
own enforcement from step 5 onward.

## What ships

- A `plumbline` CLI (TypeScript, run natively by Node ≥ 24, zero runtime
  dependencies) — the dumb mechanical verbs that move the state machine and the
  git checkpoints.
- Three session-gated Claude Code hooks — a pre-edit muzzle + seam-guard, a Bash
  guard, and a non-blocking light-feedback pass. With no active session they
  short-circuit to allow in microseconds, so a repo without a Plumbline session
  behaves like plain Claude Code.
- Five Claude Code skills — the judgment work, each one human-triggered
  (`disable-model-invocation: true`): `/plumbline-interrogate`, `/park`,
  `/plumbline-triage`, `/plumbline-report`, `/plumbline-docs`.
- A `.plumbline/` sidecar of flat control files (`STATE`, `SEAM`, `checkpoints`,
  `intent.md`, `build-log.md`) that the hooks read with a grep.

## Install

`plumbline setup` copies the hooks to `~/.claude/plumbline/hooks/` and the skills
to `~/.claude/skills/`, then registers the hooks in a Claude Code settings file.
The hooks and skills always install once under `~/.claude/`; the registration
scope is a sharing choice, not a behavior choice.

| Command                    | Registers in                         | Use for                              |
|----------------------------|--------------------------------------|--------------------------------------|
| `plumbline setup`          | `~/.claude/settings.json`            | yourself, across every repo (default) |
| `plumbline setup --project`| `<repo>/.claude/settings.json`       | enrolling a whole team (committable)  |
| `plumbline setup --local`  | `<repo>/.claude/settings.local.json` | yourself, this repo only (untracked)  |

The repo-scoped files register `~`-prefixed command paths, so committed settings
carry no machine-absolute home directory — a teammate without Plumbline installed
gets a non-blocking hook error, not a wall. `plumbline setup --uninstall` strips
the registration (the installed files stay in place).

After installing, restart Claude Code (or reload settings) for the hooks to take
effect, and put `plumbline` on your `PATH` so the skills' status pre-injection
resolves. There is no global bin yet — alias it at the CLI entry point:

```sh
alias plumbline='node /path/to/plumbline/src/cli.ts'
```

## The verbs and skills

Mechanical verbs are the `plumbline` CLI, run from your terminal. The judgment
work is skills, invoked from the chat pane. The split is judgment-vs-mechanism.

| Verb / skill               | Does                                                              | Kind          |
|----------------------------|------------------------------------------------------------------|---------------|
| `plumbline start "<t>"`    | scaffold `.plumbline/`; `STATE=DESIGN`; record the baseline      | CLI           |
| `/plumbline-interrogate`   | `DESIGN`; attack the frame for holes; append to Open questions   | skill (Opus)  |
| `plumbline build <n>`      | write `SEAM` from step n; `STATE=BUILD`                          | CLI           |
| `plumbline review`         | run the heavy check; if green → `STATE=REVIEW`                   | CLI           |
| `plumbline done`           | ensure check green; checkpoint commit + record SHA; `STATE=DESIGN` | CLI         |
| `plumbline park "<text>"`  | append a raw line to the park list; the model never sees it      | CLI (dumb)    |
| `/park`                    | compose one tidy tagged line, you approve, then it shells `park` | skill (Haiku) |
| `/plumbline-triage`        | `DESIGN`; classify the park list blocker/tangent/pivot           | skill (Opus)  |
| `plumbline revert [--to n]`| `git reset --hard` to a checkpoint SHA; `STATE=DESIGN`           | CLI           |
| `plumbline wrap`           | `STATE=FINISH` so the report and docs skills can run             | CLI           |
| `/plumbline-report`        | `FINISH`; write `.plumbline/report.md` from intent + log         | skill (Opus)  |
| `/plumbline-docs`          | `FINISH`; conservatively update `docs/` from canonical intent    | skill (Opus)  |
| `plumbline finish`         | refuse unless a report exists; archive; clear; muzzle off        | CLI           |
| `plumbline spike "<slug>"` | throwaway worktree experiment per option; `spike done` tears down | CLI          |
| `plumbline mode <x>`       | escape hatch: set `STATE` directly (not part of the normal flow) | CLI (hidden)  |
| `plumbline setup`          | install hooks + skills; register them (D27 scopes above)         | CLI           |

In a Claude Code session the deciding/transition verbs refuse to run (they are
yours to type in a terminal); `status` and `park` are the deliberate exceptions.

## The core / adapter boundary

The deciding/executing core — the `plumbline` CLI, the `.plumbline/` sidecar, and
the additive git footprint — is agent- and model-agnostic. Only the enforcement
layer (the hooks, the skills, the `CLAUDECODE` verb guard) is specific to Claude
Code, because enforcement inherently means intercepting some agent's edit tool.
Claude Code is v1's enforcement adapter; other-agent adapters over the same core
are a future Plumbline, not a v1 obligation.

## Ratified residual gaps

These are deliberate v1 boundaries, decided on the record, not oversights:

- **The archive is local-only.** `finish` lists the checkpoint SHAs in the report
  and archives plain markdown under `.plumbline/archive/`; it never touches git
  (D20). The sidecar is kept untracked so a revert can never destroy captured
  attention.
- **The muzzle is a fence, not a wall.** The Bash guard blocks the obvious
  shell-write escape routes around the edit hooks, but full shell-write detection
  is unsolvable; a determined model can still get around it (D21). The fence
  raises the cost of crossing the boundary by accident, which is the job.
- **`tsc` is deferred to the heavy tier.** The light post-edit feedback runs
  file-scoped oxlint + ast-grep only; `tsc` has no true single-file mode, so it
  runs in the `pnpm check` gate inside `review`/`done` rather than per keystroke
  (D25).

## Development

```sh
pnpm install
pnpm check     # tsc, oxlint, ast-grep, vitest, knip, markdownlint
```

**The pnpm pin.** `package.json` pins `devEngines.packageManager` to an *exact*
pnpm version (`11.1.2`) rather than a range, because the `^` range broke every
pnpm command at the time of writing. That exact pin will need bumping by hand on
the next pnpm upgrade; moving back to a ranged constraint is a future revisit.

`scripts/dev-install.sh` is the development installer: it registers the hooks
pointing at this working tree's `hooks/` (so hook edits take effect with no
re-copy), where `plumbline setup` copies them into `~/.claude/`. Use
`dev-install.sh` while hacking on the hooks themselves; use `plumbline setup` to
install Plumbline for real.

## License

Licensed under the [Apache License 2.0](LICENSE).
