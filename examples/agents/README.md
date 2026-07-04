# Example agents

A **user-authored agent** is any executable that speaks PlumbBob's subprocess envelope — the
doorway that lets a program plug into the loop as a step's `before`, `build`, or `after` slot.
The full contract for authors is [`docs/agents.md`](../../docs/agents.md); this folder holds a
minimal working example you can read top to bottom and run.

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
