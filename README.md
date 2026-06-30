# PlumbBob

<p align="center">
  <img src="hero.jpg" alt="A row of plumb bobs of varying shapes hanging from strings" width="600">
</p>

A [guidance-first build process](docs/attention-first-development.md) for working
*with* an LLM instead of being dragged behind one. It's the layer below [Ridgeline](https://github.com/robmclarty/ridgeline):
where Ridgeline runs autonomously without you, PlumbBob keeps you in the driver's seat
for the small-to-medium work that doesn't justify a full autonomous build — a feature,
a bug, a refactor — while staying deliberate rather than vibing. You decide on a surface
outside the chat; PlumbBob orients you, runs each step's labor, and then **stops and
waits for you to advance** — the human is the clock, not a lock.

> PlumbBob establishes *true* before you build. The LLM is a hand, not a head.

Its one law is **vibe to execute, never vibe to decide**: the human owns every
decision, the LLM owns the labor, and the boundary between them is a **pause you
advance**, not a wall that refuses you. The *why* behind that — attention as the
scarce resource — is the subject of the guidance-first article above; the *how* of
each method is in [`docs/techniques.md`](docs/techniques.md). This repository was
built using PlumbBob, dogfooded on its own build under its own loop.

## Install

PlumbBob installs **once, globally** — like `gh` or your dotfiles — in one of two
co-equal, mutually-exclusive ways (both register a Claude Code plugin named
`plumbbob`).

**Marketplace plugin** — self-contained; ships the skills *and* the CLI on PATH, so
it needs neither `npm` nor `init`:

```text
/plugin install plumbbob@<marketplace>
```

**npm global + `init`** — installs the CLI, then links the skills and hook into
Claude Code in place:

```sh
npm i -g plumbbob      # the CLI (also a `pb` shorthand)
plumbbob init          # link it into Claude Code; --uninstall to undo
```

Restart Claude Code (or `/reload-plugins`) to activate, then run `plumbbob doctor`
(or `/pb-doctor` in-session) to confirm the wiring. The full guide — namespacing,
per-project sessions, the agent-neutral roadmap — is in
[`docs/install.md`](docs/install.md).

## Features

You drive the whole loop from your IDE with `/plumbbob:*` skills — no step numbers to
remember, no raw CLI to type. Each is `disable-model-invocation`, so *you* fire every
move, and `/pb-status` always names your next one. (For readability these docs write
the short form: `/pb-plan` means `/plumbbob:pb-plan`.)

| Skill | Does |
|-------|------|
| `/pb-plan` | plan the whole goal — scaffold the session and author intent's Frame, Decisions, Constraints, **and all Steps** |
| `/pb-step` | revise/sharpen the next step (empty input auto-syncs it to reality) |
| `/pb-build` | *(optional)* implement the next planned step, then verify it to the pause — `--auto` self-approves and chains to done |
| `/pb-verify` | the tick — check → self-review → validate → **PAUSE** → checkpoint |
| `/pb-park` | capture an idea without chasing it |
| `/pb-status` | orient — where you are, the next step's done-when + seam, and the next move |
| `/pb-harvest` | triage parked ideas at a boundary (blocker / tangent / pivot) |
| `/pb-wrap` | wrap up — write the report, archive safely, clear for a fresh goal |

Three power moves round it out — `/pb-revert` (recover to a checkpoint), `/pb-spike`
(throwaway worktree experiment), and `/pb-refine` (attack the frame for holes or
repair a drifted plan) — plus `/pb-doctor` to check your install.

Under the skills ships a zero-dependency `plumbbob` CLI (the mechanical verbs the
skills shell out to), one session-gated post-edit hook (non-blocking lint feedback in
flow), and a `.plumbbob/` sidecar of flat files (`intent.md`, `build-log.md`,
checkpoints, archive). `/pb-build` is just one executor — implement a step by hand or
in any other harness and run `/pb-verify` instead; it reads the *diff, not the author*.

## Getting started

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
mismatch.) For one goal walked end to end — planning, building each step, wrapping
up, and starting the next — see [`docs/happy-path.md`](docs/happy-path.md).

## Documentation

- [`docs/install.md`](docs/install.md) — the full install guide and the agent-neutral roadmap.
- [`docs/techniques.md`](docs/techniques.md) — the methods behind the loop, each on its own.
- [`docs/happy-path.md`](docs/happy-path.md) — one goal walked end to end.
- [`docs/cli-reference.md`](docs/cli-reference.md) — every verb, flag, exit code, and the `.plumbbob/` sidecar.
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — fixes for the common snags.
- [`docs/decisions.md`](docs/decisions.md) — the `D#` / `C#` design-decision key.
- [`docs/attention-first-development.md`](docs/attention-first-development.md) — the philosophy: attention as the scarce resource.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, conventions, and how to submit changes.

## License

Licensed under the [Apache License 2.0](LICENSE).
