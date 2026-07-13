# reviewer

[`echo-reviewer`](../echo-reviewer/) shows PlumbBob's agent contract bare — POSIX `sh`,
nothing installed. [`ollama-reviewer`](../ollama-reviewer/) wraps that contract around one
framework and one local model. This example is the next turn: the same advisory reviewer, but
with a **switchable model provider** — `claude_cli` by default (it piggybacks the Claude
session you're already logged into — no API key, no local model to pull), or `ollama` for
local, private compute where the diff never leaves your machine.

One agent, two providers, chosen through the **settings ladder** — not by editing the agent.
The host model builds; the reviewer gives an advisory second opinion on each step's diff at
the verify pause. It informs, it never gates — checkride is the gate.

The contract it speaks is [`docs/agents.md`](../../../docs/agents.md); for the fuller
Ollama-from-a-fresh-repo walkthrough see
[`docs/local-model-review.md`](../../../docs/local-model-review.md). Since fascicle 0.8.11 the
process contract is the library's job: `run_stdio` (from `fascicle/stdio`) reads and validates
the StepContext, routes trajectory to **stderr**, validates the envelope against a schema,
writes exactly one JSON object to **stdout**, and makes the exit code the verdict — the
§ "The fascicle trap" discipline, enforced rather than hand-rolled.

## Providers

| Provider | `agentConfig.reviewer` keys | Env override | Auth | Cost / privacy |
|----------|-----------------------------|--------------|------|----------------|
| **`claude_cli`** *(default)* | `provider`, `model` (default `sonnet`), `binary` (default `claude`) | `PB_REVIEWER_PROVIDER`, `PB_REVIEWER_MODEL`, `PB_REVIEWER_CLAUDE_BINARY` | the logged-in Claude session (`auth_mode: oauth`) — **no API key** | billed to your Claude plan; the diff is sent to Anthropic |
| **`ollama`** | `provider`, `model` (default `qwen3:8b`), `baseUrl` (default `http://localhost:11434`) | `PB_REVIEWER_PROVIDER`, `PB_REVIEWER_MODEL`, `OLLAMA_HOST` / `OLLAMA_BASE_URL` | none — a local server | **free**; the diff never leaves your machine |

`claude_cli` is the default *because* PlumbBob is mostly a Claude plugin: the most valuable
second opinion is the one that costs no extra key and no local GPU, piggybacking the session
you're already in (D3). Switch to `ollama` when you want the review to run entirely on your own
hardware. Adding a third provider is one more descriptor in `review.mjs`'s `PROVIDERS` map —
the switch is the whole shape.

### How a property is chosen — settings, then env, then the floor

Every property resolves by the same precedence (D4): the agent's own config block from the
settings ladder first, an environment variable as an ephemeral override *under* it, then the
code default as the floor.

```text
ctx.settings.agent.provider   →   PB_REVIEWER_PROVIDER   →   'claude_cli'
ctx.settings.agent.model      →   PB_REVIEWER_MODEL      →   per-provider default (above)
```

The CLI forwards each agent its own config block — `agentConfig.<name>` from the settings
ladder — through the existing envelope `settings` field, so the reviewer reads
`ctx.settings.agent` with no new contract (D5/D6). Set the tracked team default in
`.plumbbob/settings.json`:

```jsonc
// .plumbbob/settings.json — tracked; rides the PR
{ "agentConfig": { "reviewer": { "provider": "claude_cli", "model": "sonnet" } } }
```

…and override it per-machine in the untracked `.plumbbob/settings.local.json`:

```jsonc
// .plumbbob/settings.local.json — untracked personal overlay
{ "agentConfig": { "reviewer": { "provider": "ollama", "model": "qwen3:8b" } } }
```

The ladder returns the *first* rung that defines `agentConfig` whole — the local overlay
shadows the project file, no deep merge — and the agent's per-field `?? default` softens a
partial override (D7). With neither file set and no env var, the reviewer runs `claude_cli`
against the logged-in session.

## Prerequisites

- **Node >= 24** — fascicle's floor. Higher than PlumbBob's own (>= 22.18), and it applies only
  to *this agent's subprocess*: the agent's runtime is its own business (D53).
- **The chosen provider's own prerequisite:**
  - `claude_cli` (default) — the `claude` CLI on PATH and logged in (run `claude` once,
    interactively). Nothing else to install; the reviewer drives that session. This provider
    **needs fascicle >= 0.9.5**, which strips the `$schema`/`$id` keys `z.toJSONSchema` stamps
    and `claude --json-schema` rejects (D1).
  - `ollama` — Ollama installed and running (`ollama serve`), with the model pulled
    (`ollama pull qwen3:8b` for the default).

Dependencies are `fascicle` + `zod` only. The Ollama path uses fascicle's **native** transport,
which keeps the AI-SDK peers (`ai`, `ai-sdk-ollama`) out of the package (D8); `claude_cli` is
fascicle's **external** kind, driving the `claude` binary's own `--json-schema` constrained
decode. (`ollama-reviewer`, the single-provider sibling, takes the AI-SDK path instead.)

## Install

Copy the directory into a repo's project tier (or `~/.plumbbob/agents/` to have it in every
repo), then install its dependencies **inside the copied directory**:

```sh
cp -r examples/agents/reviewer /path/to/your/repo/.plumbbob/agents/
cd /path/to/your/repo/.plumbbob/agents/reviewer
npm install
```

The project tier is *tracked* — the shipped `.gitignore` keeps `node_modules/` (and
`package-lock.json`) out of your repo. The agent has no dependency on PlumbBob itself: it
talks pure envelope.

## Try it standalone (two minutes)

Without any session — from any git repo with uncommitted changes:

```sh
node review.mjs < demo/stepcontext.json               # default provider: claude_cli
PB_REVIEWER_PROVIDER=ollama node review.mjs < demo/stepcontext.json   # the local path
```

Watch the split as it runs: the `reviewer: …` lines and the model's streamed text are
**stderr** (live narration); the single JSON object at the end is **stdout** (the one envelope
PlumbBob consumes). If the chosen provider isn't ready — no `claude` on PATH, Ollama down, a
model not pulled — you get a `blocked` envelope with the fix in `notes`; that's the intended
loop (D52), not a failure.

Through PlumbBob — inside an active session (`plumbbob agent run` needs one, plus a current
step):

```sh
plumbbob agent list                        # → reviewer (project) [after] — …
plumbbob agent run reviewer --step 1
```

(To run it straight out of this examples directory instead of installing first:
`plumbbob agent run reviewer --agent examples/agents/reviewer --step 1` — the `--agent` path
flag still wants the name, for the run label.)

## When it can't run

Every *anticipated* obstacle is a `blocked` envelope with the fix in `notes`, exit 0 — fix and
re-run (D52):

- **deps not installed** → `run: npm install (in the agent's own directory …)`
- **`claude` not on PATH** (claude_cli) → install Claude Code, or switch the reviewer to
  `ollama` via `agentConfig.reviewer.provider`
- **Ollama down** (ollama) → `Ollama is not reachable at … — start it (ollama serve) …`
- **model not pulled** (ollama) → `run: ollama pull <model> …`
- **unknown provider** → the name isn't wired; set `provider` to one of `claude_cli`, `ollama`

Anything else is `run_stdio`'s verdict, with nothing on stdout and a machine-readable failure
as the last stderr line: exit 1 when the flow fails mid-run (a PlumbBob "failed run"), exit 2
when the contract itself is violated (unparseable stdin, a StepContext or envelope that fails
its schema). Runs are unbounded by default; set `agentTimeout` in `.plumbbob/settings.json`
for a ceiling.

## How it's built

[`review.mjs`](review.mjs), one file, top to bottom:

- **A provider is a descriptor** — a plain object with a `label`, the per-provider
  `engineProviders` map handed to `create_engine`, the `{ provider, model }` for
  `engine.generate`, and a `preflight()` that returns `null` when good to go or an actionable
  `blocked` message otherwise. One factory per provider, keyed by name in `PROVIDERS`; the
  switch resolves `ctx.settings.agent.provider ?? PB_REVIEWER_PROVIDER ?? 'claude_cli'` and
  calls the matching factory. Adding a provider is one more entry.
- **`run_stdio` owns the process contract** — stdin validated against a loose StepContext
  schema (only the `contract` gate is strict; the rest is best-effort prose, D61), the result
  validated against a zod schema *of the PlumbBob envelope itself*, exactly one JSON document
  emitted, exit code as the verdict. The agent never touches stdout.
- **The engine is created after the provider resolves** — the per-provider config depends on
  the StepContext, which arrives on stdin, so `create_engine` runs inside the review step and
  is disposed in a `finally` before `run_stdio` serializes the envelope.
- **The flow** — resolve provider → `preflight()` (an obstacle short-circuits to `blocked`) →
  `git diff HEAD` scoped to the step's seam plus pseudo-diffs for untracked files, capped at
  40 KB (an empty diff short-circuits to a clean `done`) → `engine.generate` with a zod review
  schema (`schema_repair_attempts` for the native path; real `--json-schema` for claude_cli),
  wrapped in `retry` → mapped to the envelope.
- **A human trajectory logger** — `run_stdio` defaults to `stderr_logger` (JSONL on stderr,
  aimed at machines); this agent swaps in one that streams the model's text raw and prints span
  names, so the person at the pause watches the review happen.
- **The envelope** — a completed review is always `done` (advisory even with concerns);
  `now`-severity concerns go in `body` for the human at the pause, `later` ones become
  `parked[]` and land as park lines.
