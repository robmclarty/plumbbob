# Plumbbob

A guidance-first build process for working *with* an LLM instead of being dragged
behind one. It's the layer below Ridgeline: where Ridgeline runs autonomously
without you, Plumbbob keeps you in the driver's seat for the small-to-medium work
that doesn't justify a full autonomous build — a feature, a bug, a refactor — while
staying deliberate rather than vibing. You decide on a surface outside the chat;
Plumbbob orients you, runs each step's labor, and then **stops and waits for you to
advance** — the human is the clock, not a lock.

> Ridgeline is the line. Plumbbob establishes *true* before you build.
> The LLM is a hand, not a head.

This repository was built using Plumbbob v2, dogfooded on its own build under its
own loop.

## The one law

**Vibe to execute, never vibe to decide.**

Vibing is fine — *once every decision being carried out was already made on a
surface outside the chat.* It becomes a slot machine only when the deciding happens
inside the stream while code is flowing. The whole job of Plumbbob is to keep
decisions and execution from fusing:

- The **human** owns convergence. You decide, choose, pick the branch.
- The **LLM** owns divergence in design (finding holes, generating options) and
  convergence *only* in build (executing a decided step).
- The **boundary** between deciding and executing is held by a **pause you
  advance**, not a wall that refuses you.

If you feel tired and lost, those two activities have fused again. The fix is never
"prompt better." It's "stop, leave the chat, go decide, come back."

## Why it works: get the plan out of your head

The exhaustion is a working-memory problem. You can't *produce* intent and
*consume* the model's output at once — consuming overwrites producing. So Plumbbob
externalizes your plan onto durable surfaces that survive the flood:

- `intent.md` — what you decided, before any code. Your canonical intent.
- `build-log.md` — the live ledger of steps, parked ideas, and decisions.

When the model floods you, you read the page, not your memory. The chat is
ephemeral; the docs persist. **The chat is a hand; the docs are the head.**

## The shift: a clock, not a lock

Plumbbob v1 enforced the deciding/executing boundary with a hard file lock — a
pre-edit muzzle that *refused* code edits unless you were in the right state. It
provided no real security (a determined model routed around it), so its only product
was forced ritual.

v2 replaces the lock with a **clock**. Nothing blocks your edits. Instead, the
system does a step's work, then pauses at a verify gate for your approval before it
checkpoints. You stay the decider not because a wall refuses you, but because the
loop pulls up to a line — the verify pause — and idles there until you approve.
Pull, not block. The pause *is* the product; it is the moment your judgment enters,
and it cannot be skipped.

## The eight skills

You drive the whole loop from your IDE with eight `pb-*` skills — no step numbers to
remember, no raw CLI to type. Each is `disable-model-invocation`, so *you* fire
every move, and `/pb-status` always names your next one.

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

Three optional power moves survive for when you need them: `/pb-revert` (recover to
a checkpoint), `/pb-spike` (throwaway worktree experiment), and
`/plumbbob-interrogate` (attack the frame for holes).

## The loop

```text
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

For a worked example that walks one goal end to end — from framing, through letting
`/pb-build` pick and ship each step, to wrapping up, archiving, and starting the
next task — see [`docs/happy-path.md`](docs/happy-path.md).

**The pluggable executor.** `/pb-build` is one way to turn a planned step into code
— it is *optional*. Implement by hand, in a vibe session, or with another harness,
and run `/pb-verify` instead: it reads the *diff, not the author*. Plumbbob is the
harness-agnostic spine; how the diff appears is a slot you fill however you like.

## Calibration: size everything to the work

The fastest way to abandon this is ceremony on a one-liner. The discipline is
*decisions before code*, not *always produce three files*.

- **Tiny** (typo, one-liner): no session. Just fix it.
- **Small** (a contained bug/change): `/pb-plan` a frame + 2–3 decisions; one or two
  steps; build → verify → checkpoint.
- **Medium** (a feature touching a few modules): the full loop above.
- **Large / architectural**: that's Ridgeline's job, not Plumbbob's.

Calibration is the skill. When in doubt, smaller.

## What ships

- A `plumbbob` CLI (TypeScript, run natively by Node ≥ 22.18, zero runtime
  dependencies) — the dumb mechanical verbs the skills shell out to. You never type
  it by hand.
- The eight `pb-*` skills plus the optional power moves, each
  `disable-model-invocation` so *you* fire every move.
- One session-gated Claude Code hook — `post-edit.sh`, a non-blocking light-feedback
  pass that injects file-scoped lint into the model's context so it self-corrects in
  flow. (v1's pre-edit muzzle, seam-guard, and bash-guard are gone — guidance, not
  enforcement.)
- A `.plumbbob/` sidecar of flat files: `STATE` (orientation only), `intent.md`,
  `build-log.md`, `checkpoints`, and `archive/`.

## Gates — two tiers, different jobs

- **Light** — the non-blocking `post-edit` feedback above. Per changed file. Never
  blocks an edit. It exists only because Claude can't see your editor's LSP, so the
  light tier *serves the model*.
- **Heavy** — the full `pnpm check` (tsc, oxlint, ast-grep, vitest, knip,
  markdownlint). Not a hook: it runs *inside* `/pb-verify`, which refuses to
  checkpoint while red. The hard gate lives on the deliberate boundary, not the
  keystroke.

## STATE is orientation, not a gate

The current position lives in one word in `.plumbbob/STATE` — `DESIGN`, `BUILD`, or
`SPIKE`. It no longer gates anything. It is read by `/pb-status` to tell you where
you are and what to do next; a wrong state is a mislabeled position on a map, not a
locked door. The post-edit hook is session-gated: a repo with no `.plumbbob/STATE`
behaves exactly like plain Claude Code.

## Git footprint — additive only

Plumbbob commits cheap checkpoint markers (`plumbbob: step n done`) on your feature
branch and reverts to its own recorded SHAs. It **never rewrites pushed history**;
your normal squash-merge collapses the checkpoints at PR time. `start` records the
baseline HEAD; `revert [--to n]` does `git reset --hard` to a recorded SHA; `wrap`
archives plain markdown under `.plumbbob/archive/` and never touches git.

## The `.plumbbob/` folder

```text
.plumbbob/
  STATE          # one word: DESIGN | BUILD | SPIKE — orientation, not a gate
  SEAM           # the in-flight step's declared paths (awareness, not a lock)
  STEP           # the in-flight step number
  checkpoints    # "step N <git-sha>", one per verified step
  intent.md      # canonical intent
  build-log.md   # live ledger
  archive/
    <date>-<slug>/
      intent.md
      build-log.md
      report.md
```

## Install

The npm package is `plumbbob`; it installs the CLI (`plumbbob` plus a `pb`
shorthand) and ships the hook and skills inside the package.

### Project-level (recommended)

```sh
pnpm add -D plumbbob
pnpm exec plumbbob setup --local    # or --project to commit it for a team
```

This copies the skills into `<repo>/.claude/skills/` (their bin pointed at the
project-local binary) and registers the post-edit hook in place under
`node_modules`. Nothing is written under `~`.

### Global

```sh
npm install -g plumbbob
plumbbob setup --global
```

This copies the hook and skills under `~/.claude/` and registers them in
`~/.claude/settings.json`. Restart Claude Code (or reload settings) after install.

### Verify the install

```sh
pnpm exec plumbbob doctor    # or `plumbbob doctor` for a global install
```

`doctor` checks the four things that must be true — the skills are present, their
bin resolves, the CLI is installed, and the post-edit hook is registered — and
prints the exact fix for anything broken. Run it first if a `/pb-*` skill ever opens
with an empty dashboard.

## Development

```sh
pnpm install
pnpm check     # tsc, oxlint, ast-grep, vitest, knip, markdownlint
pnpm build     # emit dist/ (what the published bin runs)
```

The underlying philosophy — attention as the scarce resource — lives in
[`docs/attention-first-development.md`](docs/attention-first-development.md).

## The shape, in one line

The human owns convergence; the LLM owns divergence in design and convergence only
in implementation; and the boundary between deciding and executing is a **pause you
advance**, not a lock you fight — the system does the labor and waits for you to be
the clock.

## License

Licensed under the [Apache License 2.0](LICENSE).
