# Examples

[`docs/happy-path.md`](../docs/happy-path.md) tells the story of one PlumbBob session —
rate-limiting a login endpoint. This folder holds the **artifacts that session leaves
behind**: the build's tracked folder, exactly as it would sit at
`.plumbbob/builds/rate-limit-the-login-endpoint/` on the feature branch after
`/plumbbob:finish`, ready to ride into the PR.

Read them in the order they were written:

| File | Written by | When |
| ------ | ----------- | ------ |
| [`intent.md`](rate-limit-the-login-endpoint/intent.md) | you + `/plumbbob:plan` | before any code — the Frame, Decisions, Constraints, and all Steps |
| [`build-log.md`](rate-limit-the-login-endpoint/build-log.md) | the loop, as it runs | park lines mid-step, harvest calls and checkpoint lines at each boundary |
| [`checkpoints`](rate-limit-the-login-endpoint/checkpoints) | the CLI | one SHA per recorded state — baseline, plan, each verified step |
| [`stats.json`](rate-limit-the-login-endpoint/stats.json) | the CLI | per step, as it runs — when it started and landed, red runs, reverts; the pause's `spent` row and the report's Stats table read it |
| [`report.md`](rate-limit-the-login-endpoint/report.md) | `/plumbbob:finish` | at close-out — what shipped, why, and what was deferred |

## The commit log it produced

Every commit subject is CLI-owned ([D34 (cli-owns-subjects)](../docs/decisions.md#d34)) and
Conventional ([D68 (conventional-subjects)](../docs/decisions.md#d68)); the `plumbbob step N`
marker rides the body, so `git log --grep plumbbob` still finds them all, and the branch
history reads as the build's spine:

```text
f3e9a1b2c chore(rate-limit-the-login-endpoint): finish
9c4d02e11 feat(config): make the limit configurable via env
5b8f31da2 feat(login): wire the limiter into POST /login
a1b2c3d4e feat(limiter): add a token-bucket limiter
7d2e94fb0 chore(rate-limit-the-login-endpoint): plan
3a1f2b0c1 (baseline — wherever the branch stood when the session opened)
```

The three step subjects carry a scope each, because each step title was authored with one;
`plan` and `finish` fall back to the build's slug with its date prefix stripped, so one log
shows two rungs of D68's scope chain.

A normal squash-merge collapses these markers at PR time, while the build folder itself
lands in `main` — the record outlives the branch.

## What you will NOT find here

The untracked control plane: no `STATE`, no `settings.local.json`, and no
`STEP`/`SEAM`/`SPIKE` markers. Those are per-worktree ephemera — git-excluded while the
session runs, cleared by `finish` — so a build folder on a branch always looks like
this: five plain files anyone can read with no tooling.

## The real thing

These artifacts are a worked example, curated for readability. For unedited, real
records, this repository builds PlumbBob with PlumbBob's own loop — every build that shipped PlumbBob
lives under [`.plumbbob/builds/`](../.plumbbob/builds/), messy parts included.

## A user-authored agent

[`agents/`](agents/) holds a second kind of example: **user-authored agents** —
executables that plug into the loop through PlumbBob's subprocess envelope. Two ship: the
reference agent from [`docs/agents.md`](../docs/agents.md) (a bash script and a four-line
manifest with nothing to install), and a fascicle-composed reviewer that drives a **local
model via Ollama** — no API key, the diff never leaves your machine.
