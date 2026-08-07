# ollama-reviewer

[`echo-reviewer`](../echo-reviewer/) shows PlumbBob's agent contract bare — POSIX `sh`,
nothing installed. This example shows the contract wrapped around the real thing: a
[fascicle](https://github.com/robmclarty/fascicle)-composed agent driving a **local model
via Ollama**, riding in the same PlumbBob session as Claude Code. The host model builds;
the local model gives an advisory second opinion on every step's diff at the verify
pause. No API key, and the diff never leaves your machine.

For the step-by-step walkthrough — install to every-pause review — see
[`docs/local-model-review.md`](../../../docs/local-model-review.md). This README is the
reference: prerequisites, configuration, failure modes, and how the file is built.

The contract it speaks is [`docs/agents.md`](../../../docs/agents.md) — and since
fascicle 0.8.11, most of it is the library's job: `run_stdio` (from `fascicle/stdio`)
reads and validates the StepContext, routes trajectory to **stderr**, disposes the
engine, writes exactly one schema-validated envelope to **stdout**, and makes the exit
code the verdict. The § "The fascicle trap" discipline, enforced instead of hand-rolled.

## Prerequisites

- **Node >= 24** — fascicle's floor. This is higher than PlumbBob's own (>= 22.18) and
  applies only to *this agent's subprocess*: the agent's runtime is its own business —
  D53 (agents-own-keys) — PlumbBob just spawns the command.
- **Ollama** installed and running (`ollama serve`), with a model pulled.

| Model | Size | Notes |
|-------|------|-------|
| `qwen3:8b` (default) | ~5 GB | reviews well; worth the download |
| `llama3.2:3b` | ~2 GB | the light option; noticeably shallower reviews |

Configuration is env only:

| Variable | Default | |
|----------|---------|---|
| `OLLAMA_MODEL` | `qwen3:8b` | the exact tag you pulled, colons and all |
| `OLLAMA_BASE_URL` (or `OLLAMA_HOST`) | `http://localhost:11434` | where Ollama listens |

## Install

Copy the directory into a repo's project tier (or `~/.plumbbob/agents/` to have it in
every repo), then install its dependencies **inside the copied directory**:

```sh
cp -r examples/agents/ollama-reviewer /path/to/your/repo/.plumbbob/agents/
cd /path/to/your/repo/.plumbbob/agents/ollama-reviewer
npm install
ollama pull qwen3:8b
```

The project tier is *tracked* — the shipped `.gitignore` keeps `node_modules/` out of
your repo. The agent has no dependency on PlumbBob itself: it talks pure envelope.

## Try it standalone (two minutes)

Without any session — from any git repo with uncommitted changes:

```sh
node review.mjs < demo/stepcontext.json
```

Watch the split as it runs: the `ollama-reviewer: …` lines and the model's spans are
**stderr** (live narration); the single JSON object at the end is **stdout** (the one
envelope PlumbBob consumes). With Ollama stopped you get a `blocked` envelope telling
you to start it — that's the intended loop — D52 (blocked-vs-drift) — not a failure.

Through PlumbBob — inside an active session (`plumbbob agent run` needs one, plus a
current step):

```sh
plumbbob agent list                          # → ollama-reviewer (project) [after] — …
plumbbob agent run ollama-reviewer --step 1
```

(To run it straight out of this examples directory instead of installing first:
`plumbbob agent run ollama-reviewer --agent examples/agents/ollama-reviewer --step 1` —
the `--agent` path flag still wants the name, for the run label.)

## The full-build demo

[`demo/spec.md`](demo/spec.md) is a complete spec for a small build (a `wordwrap`
utility — three steps, zero dependencies) that binds this agent as the after-slot
default. In a scratch repo:

```sh
git init wordwrap-demo && cd wordwrap-demo
mkdir -p .plumbbob/agents
cp -r /path/to/plumbbob/examples/agents/ollama-reviewer .plumbbob/agents/
(cd .plumbbob/agents/ollama-reviewer && npm install)
```

Then, in Claude Code:

1. `/plumbbob:plan .plumbbob/agents/ollama-reviewer/demo/spec.md` — plan absorbs the spec
   into `intent.md` and (per the spec's `## Harness` section) writes `harness.json`
   binding `ollama-reviewer` to every step's after slot. Inspect both at the plan pause.
2. `/plumbbob:build` — at each step's verify pause the CLI runs the bound agent: the local
   model's narration streams by, its envelope folds into self-review as **advisory
   input** (it informs, never gates), and any `later`-severity concerns land as park
   lines in `build-log.md`.

## When it can't run

Every *anticipated* obstacle is a `blocked` envelope with the fix in `notes`, exit 0 —
fix and re-run:

- **deps not installed** → `run: npm install (in the agent's own directory …)`
- **Ollama down** → `Ollama is not reachable at … — start it (ollama serve) …`
- **model not pulled** → `model qwen3:8b is not pulled — run: ollama pull qwen3:8b (or
  set OLLAMA_MODEL to one of: …)`

Anything else is `run_stdio`'s verdict, with nothing on stdout and a machine-readable
failure as the last stderr line: exit 1 when the flow fails mid-run (a PlumbBob "failed
run"), exit 2 when the contract itself is violated (unparseable stdin, a StepContext or
envelope that fails its schema).

A review of a multi-KB diff takes ~30–60 s on an 8B model, plus model load on the first
call. Runs are unbounded by default; set `agentTimeout` in `.plumbbob/settings.json` if
you want a ceiling.

## How it's built

[`review.mjs`](review.mjs), one file, top to bottom:

- **`run_stdio` owns the process contract** — stdin read and validated against a loose
  StepContext schema (only the `contract` gate is strict — the rest is best-effort
  prose), the result validated against a zod schema *of the PlumbBob envelope itself*,
  the engine disposed before stdout is written, exactly one JSON document emitted, exit
  code as the verdict. The agent never touches stdout.
- **The flow** — `gather` (preflight `/api/tags`, then `git diff HEAD` scoped to the
  step's seam plus pseudo-diffs for untracked files, capped at 40 KB) feeds a `branch`:
  an anticipated obstacle or empty diff short-circuits to its envelope; otherwise
  `model_call` with a zod review schema (`schema_repair_attempts` on top of Ollama's
  native constrained decoding) wrapped in `retry`, then mapped to the envelope.
- **A human trajectory logger** — `run_stdio` defaults to `stderr_logger` (JSONL on
  stderr, already in contract, aimed at machines); this agent swaps in a logger that
  streams the model's text raw and prints span names, so the person at the pause
  watches the review happen.
- **The envelope** — a completed review is always `done` (advisory even with concerns);
  `now`-severity concerns go in `body` for the human at the pause, `later` ones become
  `parked[]` and land as park lines.
