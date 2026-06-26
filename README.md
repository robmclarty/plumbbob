# Plumbbob

A guidance-first build process for working *with* an LLM instead of being dragged behind one. You decide on a surface outside the chat; plumbbob orients you, runs each step's labor, and then **stops and waits for you to advance** — the human is the clock, not a lock.

> Ridgeline is the line. Plumbbob establishes *true* before you build.
> The LLM is a hand, not a head.

This repository was built using Plumbbob v2, dogfooded on its own build under its own loop.

## The shift: a clock, not a lock

Plumbbob v1 enforced the deciding/executing boundary with a hard file lock (a pre-edit muzzle). v2 replaces the lock with a **clock**: nothing blocks your edits. Instead, the system does a step's work, then pauses at a verify gate for your approval before it checkpoints. You stay the decider by *advancing the clock*, not by fighting a wall.

- The **human** owns convergence — you decide, you approve, you advance.
- The **plan** lives on durable surfaces (`intent.md`, `build-log.md`), not in the chat.
- The boundary is a **pause**, not a refusal: the system pulls up to a line and waits.

## The eight skills

You drive the whole loop from your IDE with eight `pb-*` skills — no step numbers to remember, no raw CLI to type. `/pb-status` always names your next move.

| Skill | Does |
|-------|------|
| `/pb-plan` | frame a goal — scaffold the session + author intent's Frame, Decisions, Constraints |
| `/pb-step` | plan the next increment — a title, a done-when, a seam |
| `/pb-build` | *(optional)* implement the planned step, then verify it to the pause |
| `/pb-verify` | the tick — check → self-review → validate → **PAUSE** → checkpoint |
| `/pb-park` | capture an idea without chasing it |
| `/pb-status` | orient — where you are, what's parked, and the next move |
| `/pb-harvest` | triage parked ideas at a boundary (blocker / tangent / pivot) |
| `/pb-wrap` | wrap up — write the report, archive safely, clear for a fresh goal |

Three optional power moves survive for when you need them: `/pb-revert` (recover to a checkpoint), `/pb-spike` (throwaway worktree experiment), and `/plumbbob-interrogate` (attack the frame for holes).

## The loop

```
/pb-plan                      frame the goal              (once)
  └ per step:
       /pb-status             "what's next?"
       /pb-step               plan the next increment
       /pb-build  (or DIY)    implement it
       /pb-verify             check → review → PAUSE → checkpoint
       /pb-park               capture strays mid-build
       /pb-harvest            triage them at a boundary
  /pb-wrap                    report + archive + clear     (once)
```

**The pluggable executor.** `/pb-build` is one way to turn a planned step into code — it is *optional*. Implement by hand, in a vibe session, or with another harness, and run `/pb-verify` instead: it reads the *diff, not the author*. Plumbbob is the harness-agnostic spine; how the diff appears is a slot you fill however you like.

## What ships

- A `plumbbob` CLI (TypeScript, run natively by Node ≥ 22.18, zero runtime dependencies) — the dumb mechanical verbs the skills shell out to. You never type it by hand.
- One session-gated Claude Code hook — `post-edit.sh`, a non-blocking light-feedback pass that injects file-scoped lint into the model's context. (v1's pre-edit muzzle and bash-guard are gone — guidance, not enforcement.)
- The eight `pb-*` skills plus the optional power moves, each `disable-model-invocation` so *you* fire every move.
- A `.plumbbob/` sidecar of flat files: `STATE` (orientation only), `intent.md`, `build-log.md`, `checkpoints`, and `archive/`.

## Install

The npm package is `plumbbob`; it installs the CLI (`plumbbob` plus a `pb` shorthand) and ships the hook and skills inside the package.

### Project-level (recommended)

```sh
pnpm add -D plumbbob
pnpm exec plumbbob setup --local    # or --project to commit it for a team
```

This copies the skills into `<repo>/.claude/skills/` (their bin pointed at the project-local binary) and registers the post-edit hook in place under `node_modules`. Nothing is written under `~`.

### Global

```sh
npm install -g plumbbob
plumbbob setup --global
```

This copies the hook and skills under `~/.claude/` and registers them in `~/.claude/settings.json`. Restart Claude Code (or reload settings) after install.

### Verify the install

```sh
pnpm exec plumbbob doctor    # or `plumbbob doctor` for a global install
```

`doctor` checks the four things that must be true — the skills are present, their bin resolves, the CLI is installed, and the post-edit hook is registered — and prints the exact fix for anything broken. Run it first if a `/pb-*` skill ever opens with an empty dashboard.

## STATE is orientation, not a gate

The one-word `.plumbbob/STATE` (`DESIGN` / `BUILD` / `SPIKE`) is read by `/pb-status` to tell you where you are and what to do next. It no longer gates edits — a wrong state is a mislabeled position on a map, not a locked door. The post-edit hook is session-gated: a repo with no `.plumbbob/STATE` behaves exactly like plain Claude Code.

## Git footprint — additive only

Plumbbob commits cheap checkpoint markers (`plumbbob: step n done`) on your feature branch and reverts to its own recorded SHAs. It never rewrites pushed history; your normal squash-merge collapses the checkpoints at PR time. `wrap` archives plain markdown under `.plumbbob/archive/` and never touches git.

## Development

```sh
pnpm install
pnpm check     # tsc, oxlint, ast-grep, vitest, knip, markdownlint
pnpm build     # emit dist/ (what the published bin runs)
```

The underlying philosophy — attention as the scarce resource — lives in [`docs/attention-first-development.md`](docs/attention-first-development.md).

## License

Licensed under the [Apache License 2.0](LICENSE).
