# A local model reviewing every step

How to use the [`ollama-reviewer`](../examples/agents/ollama-reviewer/) example agent with
PlumbBob, from a fresh repo to a local model reviewing every step of a build. The host model
(Claude Code) builds; a local model via Ollama gives an advisory second opinion on each
step's diff at the verify pause — no API key, and the diff never leaves your machine.

This is one worked path through the general agent machinery; the contract behind it is
[`agents.md`](agents.md).

> **Want a switch instead of Ollama-only?** [`reviewer`](../examples/agents/reviewer/) is the
> same advisory review with a **switchable model provider** — `claude_cli` by default (it
> piggybacks the logged-in Claude session; no API key, no local model to pull), or `ollama`
> for the local, private path this page walks. It's configured through the settings ladder
> (`agentConfig.reviewer`) rather than env-only. This page stays the `ollama-reviewer`
> walkthrough; everything below applies to `reviewer` with `provider: "ollama"` set, and its
> [README](../examples/agents/reviewer/README.md) has the full provider matrix.

## One-time setup

**1. Install the agent into a repo.** Copy the directory into the project tier and install
its dependencies *inside the copy* — it's a standalone package:

```sh
cd your-repo
mkdir -p .plumbbob/agents
cp -r /path/to/plumbbob/examples/agents/ollama-reviewer .plumbbob/agents/
(cd .plumbbob/agents/ollama-reviewer && npm install)
```

Commit it — the project tier is tracked and rides the PR (the shipped `.gitignore` keeps
`node_modules/` out). Alternatively, copy to `~/.plumbbob/agents/` once and it's available
in every repo (the personal tier), without your teammates needing it — a missing
personal-tier agent degrades to a warning, not a failure ([**D54**](decisions.md#d54)).

**2. Have Ollama ready.** `ollama serve` running, and the model pulled — `ollama pull
qwen3:8b` for the default. `OLLAMA_MODEL` / `OLLAMA_BASE_URL` override the defaults; the
agent's [README](../examples/agents/ollama-reviewer/README.md) has the model table.

**3. Confirm it resolves:**

```sh
plumbbob agent list
# → ollama-reviewer (project) [after] — Advisory review of a step's diff by a LOCAL model…
```

## Using it — three escalating ways

**4. One-off, by hand.** Any time you're mid-build and want a second opinion on the current
step's diff:

```sh
plumbbob agent run ollama-reviewer --step 2
```

Needs an active session. The model's narration streams on your terminal (stderr); the CLI
validates the envelope, prints the summary, and lands any `parked[]` items as park lines in
`build-log.md`. If it comes back `blocked` (Ollama down, model missing), the `notes` tell
you the fix — fix and re-run ([**D52**](decisions.md#d52)).

**5. Bound to a build, so it fires automatically.** Put a `harness.json` beside `intent.md`
in the build folder:

```json
{ "contract": 1, "defaults": { "after": ["ollama-reviewer"] } }
```

Now `/build` runs it at **every step's verify pause** without you asking — its review
folds into self-review as advisory input (it informs, never gates). Use
`"steps": {"3": {"after": ["ollama-reviewer"]}}` instead of `defaults` to bind only specific
steps. Normally you don't write this file by hand: `/plan` offers to author it at the
plan pause.

**6. The whole loop in one demo.** The agent ships its own spec that sets all of this up.
In a scratch repo with the agent installed (steps 1–2), run:

```text
/plan .plumbbob/agents/ollama-reviewer/demo/spec.md
```

plan absorbs the spec into `intent.md` (a three-step wordwrap utility) and — per the
spec's `## Harness` section — writes the `harness.json` binding for you. Approve the plan,
then `/build`. At each verify pause you'll see the local model review the diff live:
`now`-severity concerns appear in the envelope body for you to read at the pause, `later`
ones land as park lines to harvest afterward.

## The quickest sanity check

No session — and no PlumbBob — required: from inside the agent's directory, in any git repo
with uncommitted changes:

```sh
node review.mjs < demo/stepcontext.json
```

It reviews whatever `git diff HEAD` shows and prints the envelope. Watch the split: the
narration is stderr, the one JSON object is stdout.

That's the whole surface: install once, `agent run` when you want an opinion, `harness.json`
(via `/plan`) when you want it on every pause.
