# Example agents

A **user-authored agent** is any executable that speaks PlumbBob's subprocess envelope — the
doorway that lets a program plug into the loop as a step's `before`, `build`, or `after` slot.
The full contract for authors is [`docs/agents.md`](../../docs/agents.md); this folder holds
two working examples — the contract bare, and the contract wrapping a real framework:

- [`echo-reviewer/`](echo-reviewer/) — POSIX `sh`, nothing to install; read it top to bottom.
- [`ollama-reviewer/`](ollama-reviewer/) — a [fascicle](https://github.com/robmclarty/fascicle)-composed
  agent driving a **local model via Ollama** to review each step's diff.

## `echo-reviewer/`

The reference agent from `docs/agents.md`, in two files:

| File | What it is |
|------|-----------|
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
worked answer to `docs/agents.md` § "The fascicle trap" (trajectory on stderr, no signal
handlers, dispose in `finally`), and it ships [`demo/spec.md`](ollama-reviewer/demo/spec.md) —
a complete spec `/pb-plan` can absorb to set up a build with the agent bound to every step's
after slot.

| File | What it is |
|------|-----------|
| [`ollama-reviewer/agent.json`](ollama-reviewer/agent.json) | the manifest — binds the after slot, `node` as the command |
| [`ollama-reviewer/review.mjs`](ollama-reviewer/review.mjs) | the agent — preflight, seam-scoped diff, fascicle model call, envelope mapping |
| [`ollama-reviewer/demo/spec.md`](ollama-reviewer/demo/spec.md) | a spec for a small build that binds the agent via `harness.json` |

Unlike echo-reviewer it has real dependencies (a standalone package — `npm install` inside the
copied directory) and prerequisites (Node ≥ 24, Ollama running, a model pulled). Its
[README](ollama-reviewer/README.md) has the two-minute smoke run and the full-build
walkthrough.
