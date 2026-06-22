# Plumbbob

A manual, attention-first build process that enforces the deciding/executing
boundary so you build *with* an LLM instead of being dragged behind one. You
decide on a surface outside the chat; a one-word state file and a set of Claude
Code hooks refuse to let code edits cross that line until you have.

The full philosophy — the one law, the mode machine, the loop — lives in
[`docs/plumbbob-README.md`](docs/plumbbob-README.md). This file is the
as-built reference: what ships, how to install it, and the verbs you type.

This repository was built using Plumbbob, dogfooded on its own build under its
own enforcement from step 5 onward.

## What ships

- A `plumbbob` CLI (TypeScript, run natively by Node ≥ 22.18, zero runtime
  dependencies) — the dumb mechanical verbs that move the state machine and the
  git checkpoints.
- Three session-gated Claude Code hooks — a pre-edit muzzle + seam-guard, a Bash
  guard, and a non-blocking light-feedback pass. With no active session they
  short-circuit to allow in microseconds, so a repo without a Plumbbob session
  behaves like plain Claude Code.
- The judgment skills — the design/finish thinking work, each human-triggered
  (`disable-model-invocation: true`): `/plumbbob-interrogate`, `/park`,
  `/plumbbob-triage`, `/plumbbob-report`, `/plumbbob-docs`.
- The `pb-*` driver skills — thin chat-side triggers for the transition verbs
  (`/pb-start`, `/pb-build`, `/pb-review`, `/pb-done`, `/pb-revert`, `/pb-wrap`,
  `/pb-finish`, `/pb-spike`), also `disable-model-invocation: true`, so you can
  drive the whole loop from the agent window without leaving for a terminal.
- A `.plumbbob/` sidecar of flat control files (`STATE`, `SEAM`, `checkpoints`,
  `intent.md`, `build-log.md`) that the hooks read with a grep.

## Install

The npm package is `plumbbob`; it installs the CLI as `plumbbob` plus a `pb`
shorthand, and ships the hooks and skills inside the package. There are two
install shapes: project-level (self-contained, nothing global) and global.

### Project-level (recommended) — nothing under `~`

Add Plumbbob as a dev dependency and set it up self-contained, so everything
lives in the repo and `node_modules` with no global install to manage:

```sh
pnpm add -D plumbbob
pnpm exec plumbbob setup --local   # or just `setup` — it auto-detects a project-local install
```

A self-contained `setup` writes **nothing** under `~/.claude`. It copies the
skills into `<repo>/.claude/skills/` (with their bin invocation pointed at the
project-local `node_modules/.bin/plumbbob`) and registers the hooks in place at
`$CLAUDE_PROJECT_DIR/node_modules/plumbbob/hooks/`.

| Command                              | Registers in                         | Use for                          |
|--------------------------------------|--------------------------------------|----------------------------------|
| `pnpm exec plumbbob setup --local`   | `<repo>/.claude/settings.local.json` | yourself, this repo (untracked)  |
| `pnpm exec plumbbob setup --project` | `<repo>/.claude/settings.json`       | enrolling a team (committable)   |

Both forms address the hooks and the skill bin through `$CLAUDE_PROJECT_DIR`, so
a committed `settings.json` carries no machine-absolute path — a teammate runs
`pnpm install` and re-runs `setup` to regenerate their skills copy.

### Global — one install, every repo

```sh
npm install -g plumbbob
plumbbob setup --global
```

`setup --global` copies the hooks to `~/.claude/plumbbob/hooks/` and the skills
to `~/.claude/skills/`, then registers absolute command paths in
`~/.claude/settings.json`. The skills call a bare `plumbbob`, which the global
install puts on your `PATH`; from a dev checkout, alias it instead:

```sh
alias plumbbob='node /path/to/plumbbob/src/cli.ts'
```

`plumbbob setup --uninstall` (with the same scope flag) strips the registration;
the installed/copied files stay in place. After installing, restart Claude Code
(or reload settings) for the hooks to take effect.

## The verbs and skills

Mechanical verbs are the `plumbbob` CLI, run from your terminal. The judgment
work is skills, invoked from the chat pane. The split is judgment-vs-mechanism.

| Verb / skill               | Does                                                              | Kind          |
|----------------------------|------------------------------------------------------------------|---------------|
| `plumbbob start "<t>"`    | scaffold `.plumbbob/`; `STATE=DESIGN`; record the baseline      | CLI           |
| `/plumbbob-interrogate`   | `DESIGN`; attack the frame for holes; append to Open questions   | skill (Opus)  |
| `plumbbob build <n>`      | write `SEAM` from step n; `STATE=BUILD`                          | CLI           |
| `plumbbob review`         | run the heavy check; if green → `STATE=REVIEW`                   | CLI           |
| `plumbbob done`           | ensure check green; checkpoint commit + record SHA; `STATE=DESIGN` | CLI         |
| `plumbbob park "<text>"`  | append a raw line to the park list; the model never sees it      | CLI (dumb)    |
| `/park`                    | compose one tidy tagged line, you approve, then it shells `park` | skill (Haiku) |
| `/plumbbob-triage`        | `DESIGN`; classify the park list blocker/tangent/pivot           | skill (Opus)  |
| `plumbbob revert [--to n]`| `git reset --hard` to a checkpoint SHA; `STATE=DESIGN`           | CLI           |
| `plumbbob wrap`           | `STATE=FINISH` so the report and docs skills can run             | CLI           |
| `/plumbbob-report`        | `FINISH`; write `.plumbbob/report.md` from intent + log         | skill (Opus)  |
| `/plumbbob-docs`          | `FINISH`; conservatively update `docs/` from canonical intent    | skill (Opus)  |
| `plumbbob finish`         | refuse unless a report exists; archive; clear; muzzle off        | CLI           |
| `plumbbob spike "<slug>"` | throwaway worktree experiment per option; `spike done` tears down | CLI          |
| `plumbbob mode <x>`       | escape hatch: set `STATE` directly (not part of the normal flow) | CLI (hidden)  |
| `plumbbob setup`          | install hooks + skills; register them (install shapes above)     | CLI           |

### Driving the transitions from the chat

Every transition verb also has a thin `pb-*` driver skill, so you can run the
whole loop from the agent window without switching to a terminal: `/pb-start`,
`/pb-build`, `/pb-review`, `/pb-done`, `/pb-revert`, `/pb-wrap`, `/pb-finish`,
`/pb-spike`. Each shells exactly its verb and reports the result verbatim; each is
`disable-model-invocation: true`, so *only you* can fire it.

The boundary the one law protects is **human-initiated vs model-initiated**, not
terminal-vs-chat. A `disable-model-invocation` skill is a human trigger that
happens to live in the chat: the model can never invoke it, the deciding still
happens in `intent.md`, and the verb is still dumb mechanism. So the transition
verbs run in-session now (a terminal still works too) — the lone hold-out is
`mode`, the escape hatch, which stays human-only (refused in-session, and blocked
from the model's shell by the Bash guard). The transition verbs are deliberately
kept out of your settings allowlist, so a stray *model-initiated* transition
surfaces a Claude Code permission prompt; each driver skill self-authorizes only
its own verb, only while you are running it.

## The core / adapter boundary

The deciding/executing core — the `plumbbob` CLI, the `.plumbbob/` sidecar, and
the additive git footprint — is agent- and model-agnostic. Only the enforcement
layer (the hooks, the skills, the `CLAUDECODE` verb guard) is specific to Claude
Code, because enforcement inherently means intercepting some agent's edit tool.
Claude Code is v1's enforcement adapter; other-agent adapters over the same core
are a future Plumbbob, not a v1 obligation.

## Ratified residual gaps

These are deliberate v1 boundaries, decided on the record, not oversights:

- **The archive is local-only.** `finish` lists the checkpoint SHAs in the report
  and archives plain markdown under `.plumbbob/archive/`; it never touches git
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
pnpm build     # emit dist/ (what the published bin runs); prepack runs this for you
```

The published `bin` (`plumbbob` / `pb`) points at `dist/cli.js`, not the `.ts`
source, so a fresh install runs under plain `node` without `tsx`. The `prepack`
hook rebuilds `dist/` before every pack/publish; you only need `pnpm build` by
hand when you want to run the compiled output locally. From a dev checkout the
source still runs directly (`node src/cli.ts`) via Node's type stripping.

**The pnpm pin.** `package.json` pins `devEngines.packageManager` to an *exact*
pnpm version (`11.1.2`) rather than a range, because the `^` range broke every
pnpm command at the time of writing. That exact pin will need bumping by hand on
the next pnpm upgrade; moving back to a ranged constraint is a future revisit.

`scripts/dev-install.sh` is the development installer: it registers the hooks
pointing at this working tree's `hooks/` (so hook edits take effect with no
re-copy), where `plumbbob setup --global` copies them into `~/.claude/`. Use
`dev-install.sh` while hacking on the hooks themselves; use `plumbbob setup` to
install Plumbbob for real.

## License

Licensed under the [Apache License 2.0](LICENSE).
