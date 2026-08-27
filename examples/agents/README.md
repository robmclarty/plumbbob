# Example agents

A **user-authored agent** is any executable that speaks PlumbBob's subprocess envelope — the
doorway that lets a program plug into the loop as a step's `before`, `build`, or `after` slot.
The full contract for authors is [`docs/agents.md`](../../docs/agents.md); this folder holds
three working examples — the contract bare, the contract wrapping a real framework, and the
same reviewer made provider-switchable:

- [`echo-reviewer/`](echo-reviewer/) — POSIX `sh`, nothing to install; read it top to bottom.
- [`ollama-reviewer/`](ollama-reviewer/) — a [fascicle](https://github.com/robmclarty/fascicle)-composed
  agent driving a **local model via Ollama** to review each step's diff.
- [`reviewer/`](reviewer/) — the same review, with a **switchable model provider**
  (`claude_cli` by default, `ollama` for local/private compute) chosen through the settings
  ladder.

The two fascicle reviewers are two shapes of the same idea, worth holding side by side:

| | `ollama-reviewer` | `reviewer` |
| --- | ------------------- | ------------ |
| **Provider** | single — Ollama only | **switchable** — `claude_cli` (default) or `ollama` |
| **Transport / deps** | AI-SDK (`ai` + `ai-sdk-ollama`) | **native** — `fascicle` + `zod` only |
| **Configured by** | env vars only | the **settings ladder** (`agentConfig.reviewer`), env under it |
| **Default cost** | free, private (local) | no API key — piggybacks the logged-in Claude session |

`ollama-reviewer` stays as the single-provider / AI-SDK reference; `reviewer` is the
switchable / native evolution. Reach for `reviewer` when you want one maintained agent whose
provider is a config choice; keep `ollama-reviewer` when the AI-SDK path (its
constrained-decode-on-small-models, or other AI-SDK providers) is what you're after.

## `echo-reviewer/`

The reference agent from `docs/agents.md`, in two files:

| File | What it is |
| ------ | ----------- |
| [`echo-reviewer/agent.json`](echo-reviewer/agent.json) | the manifest — `name`, the `command` PlumbBob spawns, the `slots` it binds to, and prose (`description`, `when`) for the host model |
| [`echo-reviewer/run.sh`](echo-reviewer/run.sh) | the agent — reads the StepContext on stdin, narrates on **stderr**, emits one envelope on **stdout** |

It's POSIX `sh` with nothing to install — the whole contract with no dependencies. To try it,
copy the directory into a repo's project tier and run it against a step:

```sh
cp -r examples/agents/echo-reviewer .plumbbob/agents/
plumbbob agent list                        # → echo-reviewer (project) [after] — …
plumbbob agent run echo-reviewer --step 1  # streams its prose, prints its envelope
```

Watch the split as it runs: the `echo-reviewer: …` lines are its **stderr** (narration, live
in your terminal), and the single JSON object is its **stdout** (the one result PlumbBob
consumes). Swap `run.sh` for your real logic and keep that discipline — prose on stderr, one
envelope on stdout — and you have a working agent.

## `ollama-reviewer/`

The step up from the reference agent: the same contract wrapped around
[fascicle](https://github.com/robmclarty/fascicle) driving a **local model via Ollama** — an
advisory reviewer for every step's diff, no API key, nothing leaving your machine. It's the
worked answer to `docs/agents.md` § "The fascicle trap" — fascicle's `run_stdio` (>= 0.8.11)
enforces the stream discipline for it — and it ships [`demo/spec.md`](ollama-reviewer/demo/spec.md) —
a complete spec `/plumbbob:plan` can absorb to set up a build with the agent bound to every step's
after slot.

| File | What it is |
| ------ | ----------- |
| [`ollama-reviewer/agent.json`](ollama-reviewer/agent.json) | the manifest — binds the after slot, `node` as the command |
| [`ollama-reviewer/review.mjs`](ollama-reviewer/review.mjs) | the agent — preflight, seam-scoped diff, fascicle model call, envelope mapping |
| [`ollama-reviewer/demo/spec.md`](ollama-reviewer/demo/spec.md) | a spec for a small build that binds the agent via `harness.json` |

Unlike echo-reviewer it has real dependencies (a standalone package — `npm install` inside the
copied directory) and prerequisites (Node ≥ 24, Ollama running, a model pulled). Its
[README](ollama-reviewer/README.md) has the two-minute smoke run and the full-build
walkthrough.

## `reviewer/`

The same advisory review, made **provider-switchable**. `ollama-reviewer` is hard-wired to one
local model configured by env vars; `reviewer` puts the model provider on a switch —
`claude_cli` by default (it piggybacks the Claude session you're already logged into — no API
key, no local model to pull), or `ollama` for local, private compute — and configures it the
way every other environment property is configured: through the settings ladder, not env-only.

| File | What it is |
| ------ | ----------- |
| [`reviewer/agent.json`](reviewer/agent.json) | the manifest — binds the after slot, `node` as the command |
| [`reviewer/review.mjs`](reviewer/review.mjs) | the agent — a `PROVIDERS` map of descriptors, per-provider preflight, seam-scoped diff, native/external fascicle composition, envelope mapping |

The switch reads `agentConfig.reviewer` from the settings ladder (tracked default in
`.plumbbob/settings.json`, personal override in the untracked `settings.local.json`), with an
env var (`PB_REVIEWER_PROVIDER`, `PB_REVIEWER_MODEL`, …) as an ephemeral override under it and
the `claude_cli` default as the floor. Its dependencies are `fascicle` (>= 0.9.5, for
`claude_cli`) + `zod` only — the native transport keeps the AI-SDK peers out. The
[README](reviewer/README.md) carries the full provider matrix, the precedence rules, and the
per-provider prerequisites.
