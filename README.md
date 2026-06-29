# Plumbbob

<p align="center">
  <img src="hero.jpg" alt="A row of plumb bobs of varying shapes hanging from strings" width="600">
</p>

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

You drive the whole loop from your IDE with eight `/pb-*` skills — no step numbers to
remember, no raw CLI to type. Each is `disable-model-invocation`, so *you* fire
every move, and `/pb-status` always names your next one.

| Skill | Does |
|-------|------|
| `/pb-plan` | plan the whole goal — scaffold the session + author intent's Frame, Decisions, Constraints, **and all Steps** |
| `/pb-step` | revise/sharpen the next step (empty input auto-syncs it to reality) |
| `/pb-build` | *(optional)* implement the next planned step, then verify it to the pause — `--auto` self-approves and chains to done |
| `/pb-verify` | the tick — check → self-review → validate → **PAUSE** → checkpoint |
| `/pb-park` | capture an idea without chasing it |
| `/pb-status` | orient — where you are, the next step's done-when + seam, and the next move |
| `/pb-harvest` | triage parked ideas at a boundary (blocker / tangent / pivot) |
| `/pb-wrap` | wrap up — write the report, archive safely, clear for a fresh goal |

Three optional power moves survive for when you need them: `/pb-revert` (recover to
a checkpoint), `/pb-spike` (throwaway worktree experiment), and `/pb-refine` (attack
the frame for holes, or repair the plan when it drifts — usable at any point).

## The loop

The happy path is **plan the whole thing up front, then drive `/pb-build` until
done** — approving each step at its verify pause:

```text
/pb-plan                      author the whole plan (incl. all steps)   (once)
  └ per step:
       /pb-status             review the next step (done-when + seam)
       /pb-step   (optional)  sharpen/revise it first if needed
       /pb-build  (or DIY)    implement it → verify → PAUSE → checkpoint
       /pb-park               capture strays mid-build
       /pb-harvest            triage them at a boundary
  /pb-wrap                    report + archive + clear                  (once)
```

Each `/pb-build` builds the next undone step and stops at the pause for your
approval — re-firing it is itself the clock tick. (`/pb-build --auto` is the opt-in
that lets the agent self-approve and chain to done, halting on a red check or any
mismatch.) For a worked example that walks one goal end to end — planning, building
each step, wrapping up, archiving, and starting the next task — see
[`docs/happy-path.md`](docs/happy-path.md).

**Three ways to plan.** `/pb-plan` produces the same artifact — a complete, standalone
`intent.md` — from whichever seed you give it: **no argument** runs a short interview;
**a file path** absorbs an out-of-band spec (retaining its detail so the plan stands on
its own); **any other text** expands your inline intent. No quotes required — it
disambiguates the mode itself.

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
- The eight `/pb-*` skills plus the optional power moves, each
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

Plumbbob is a personal tool — install it once, globally, like `gh` or your
dotfiles. The npm package ships the CLI plus the skills and hook; `plumbbob init`
links them into Claude Code as an in-place plugin.

```sh
npm i -g plumbbob      # the CLI (also a `pb` shorthand)
plumbbob init          # link it into Claude Code; --uninstall to undo
```

`init` symlinks the package into `~/.claude/skills/plumbbob`, where Claude Code
loads it as a plugin: the skills appear namespaced as `/pb-*` and the
post-edit hook auto-registers from `hooks.json`. Nothing else under `~` is touched
and `settings.json` is left alone — restart Claude Code (or `/reload-plugins`) to
activate. Because it's a symlink, a later `npm i -g plumbbob@latest` stays live with
no re-link.

**Sessions are per-project.** Install scope is not session scope: you install the
tool once, but each goal lives in its own repo — `plumbbob start "<goal>"` writes a
`.plumbbob/` sidecar there, independent of the one global link.

**Other agents (roadmap).** The npm package is the agent-neutral carrier; a future
`plumbbob init --host codex|cursor|zed` will place the same skills where those tools
look. Claude Code is the first, first-class target.

### Verify

```sh
plumbbob doctor
```

`doctor` checks that the link resolves to the plugin manifest, the skills, and the
hook, and prints the exact fix for anything broken. Run it first if a `/pb-*`
skill ever opens with an empty dashboard; [`docs/troubleshooting.md`](docs/troubleshooting.md)
covers the rest.

## Development

```sh
pnpm install
pnpm check     # tsc, oxlint, ast-grep, vitest, knip, markdownlint
pnpm build     # emit dist/ (what the published bin runs)
```

## Documentation

- [`docs/techniques.md`](docs/techniques.md) — the methods behind the loop, each on its own.
- [`docs/happy-path.md`](docs/happy-path.md) — one goal walked end to end.
- [`docs/cli-reference.md`](docs/cli-reference.md) — every verb, flag, and exit code.
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — fixes for the common snags.
- [`docs/decisions.md`](docs/decisions.md) — the `D#` / `C#` design-decision key.
- [`docs/attention-first-development.md`](docs/attention-first-development.md) — the philosophy: attention as the scarce resource.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, conventions, and how to submit changes.

## The shape, in one line

The human owns convergence; the LLM owns divergence in design and convergence only
in implementation; and the boundary between deciding and executing is a **pause you
advance**, not a lock you fight — the system does the labor and waits for you to be
the clock.

## License

Licensed under the [Apache License 2.0](LICENSE).
