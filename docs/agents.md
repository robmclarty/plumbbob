# User-authored agents — the doorway

PlumbBob's executor is **author-blind** ([**D3**](decisions.md#d3)): `/plumbbob:verify` and `checkpoint` read *the
diff, not who wrote it*, so a step's code can come from you, from `/plumbbob:build`, from a vibe
session, or from another harness entirely. This page is the contract for that last case —
the **doorway** a user-authored agent speaks to plug into the loop. An agent here is
**anything executable** that speaks one versioned JSON envelope: a program on disk, a
manifest that names it, and a plan artifact that binds it to a step. There is no SDK to
import and no language to adopt — a twelve-line bash script is a complete agent.

The rest of the docs are for driving PlumbBob. This one is for *extending* it. If you only
want to run the loop, you never need this page; the [skills](skills-reference.md)
work with no agents at all.

## The three invariants

Everything below is downstream of three rules. When you author an agent, hold these; when
you wonder why the contract refuses something, it's one of these:

1. **The envelope has no verb to advance the loop** ([**C6**](decisions.md#c6) — the identity invariant).
   Nothing an agent returns can checkpoint, flip a step, or trigger another agent. The
   subprocess boundary enforces *human-as-clock by construction*, not by policy — an agent
   that could advance the loop would be autonomy wearing the loop's costume. This is the
   litmus for every field the envelope will ever grow.
2. **The CLI owns every side effect** ([**D44**](decisions.md#d44)). An agent *returns* concerns; PlumbBob
   *applies* them — `parked[]` lands through the park verb, never by the agent writing
   `.plumbbob/` itself. The sidecar keeps a single writer.
3. **Review is advisory; checkride gates; the human advances** ([**D45**](decisions.md#d45)). An
   `after`-slot agent *informs* the verify pause. No code path lets it fail a step — a
   gate that an agent can trip is the lock returning in autonomy's costume.

## The envelope

The contract is a subprocess convention, run in production since Terraform's `external`
data source shipped it in 2017 and already house style here (checkride uses the same
stream discipline). Four streams, one shape:

```text
                 ┌───────────────────────────────────────────────┐
   stdin  ──────►│  the agent (any executable, run via `sh -c`)  │
   (StepContext  │  cwd = repo root   env: PLUMBBOB_AGENT_DIR     │
    JSON)        └───────────────────────────────────────────────┘
                        │ stdout (JSON)         │ stderr (prose)
                        ▼                        ▼
              the output envelope        streams LIVE to the terminal
              — consumed at the pause     — the human watches it work
```

- **stdin** — a single JSON object, the `StepContext` (below). Read it to EOF.
- **stdout** — a single JSON object, the output envelope (below), and **nothing else,
  ever**. This is the one structured result PlumbBob consumes. A stray `console.log`,
  a progress bar, a banner — anything non-envelope on stdout puts you out of contract.
- **stderr** — free-form prose, streamed live to the human's terminal as you run. This is
  where narration, logs, and reasoning go.
- **exit code** — `0` means the envelope on stdout is authoritative. **Any non-zero exit
  is a failed run**: PlumbBob reports it and stops, and does *not* trust the envelope of a
  child that failed. This is the attention-first split ([**D46**](decisions.md#d46)): production narrates on
  stderr, consumption stays structured on stdout, and the two never collide.

### Input: the StepContext (stdin)

Composed deterministically by the CLI from the build's `intent.md` and settings — the whole
picture of the step you're running against:

```jsonc
{
  "contract": 1,                       // the contract major version (see "Versioning")
  "mode": "before",                    // the slot you're running in: before | build | after
  "build": { "slug": "2026-07-02-rate-limit-login", "title": "Rate-limit the login endpoint" },
  "step": {
    "n": 3,
    "title": "Make the limit configurable via env",
    "doneWhen": "the limit reads from RATE_LIMIT_MAX, defaulting to 5; test covers the default",
    "seam": ["src/limiter.ts", "src/__tests__/limiter.test.ts"]   // exact paths / dir/ grants
  },
  "decisions":   ["D1: token bucket over sliding window — because …", "…"],  // verbatim intent bullets
  "constraints": ["C1: no new runtime deps — because …", "…"],
  "context":     ["<before-slot agent output threaded in as prose>", "…"],   // inline (D59)
  "settings":    { "auto": false, "agentTimeout": 0 }              // plumbbob's own — never a provider key (D53)
}
```

Notes that matter to an author:

- `step.seam` is parsed **strictly** (it gates git behavior): exact paths or `dir/` grants,
  never globs. Everything else — title, done-when, decisions, constraints — is **best-effort
  prose** scraped from `intent.md` ([**D61**](decisions.md#d61)): a formatting quirk warns on stderr and is
  skipped, never wedges the run. `decisions`/`constraints` arrive verbatim, each intent
  bullet as one string with its *because* intact, so an agent sees the reasoning, not just
  the ruling.
- `context[]` carries the output of `before`-slot agents, threaded in inline ([**D59**](decisions.md#d59)) — how
  a `build` agent sees what a `before` agent surfaced.
- `settings` is *plumbbob's* relevant configuration only. Provider keys, model choice, and
  sandboxing are **your** agent's business ([**D53**](decisions.md#d53)) — its env, its config; PlumbBob never
  touches a key.

### Output: the envelope (stdout)

A single JSON object. Two fields are required; the rest default to empty:

```jsonc
{
  "contract": 1,                       // required — must match the CLI's contract major
  "status": "done",                    // required — done | blocked | drift
  "summary": "Read RATE_LIMIT_MAX; default 5; added the default test.",  // required, non-empty
  "body": "…longer prose for the human at the pause…",   // optional
  "parked": ["the 429 body should be JSON, not text"],   // optional — lands via the park verb
  "notes": "needs FOO in the env to run the integration test"  // optional
}
```

`status` is the routing signal, and the three values route differently at the pause
([**D52**](decisions.md#d52)):

| `status`  | Meaning | What the human does |
|-----------|---------|---------------------|
| `done`    | Finished. | Read the summary; continue the loop. |
| `blocked` | Couldn't finish — missing input, failed precondition. | Read `notes`, unblock, **re-run** the agent. |
| `drift`   | Finished, but the plan no longer matches reality. | Repair the plan with `/plumbbob:refine` before continuing. |

`parked[]` is how an agent captures a mid-run "ooh, what if" without acting on it — each
string becomes a park line the CLI lands through the park verb ([**D44**](decisions.md#d44)). Unknown fields are
tolerated and dropped ([**C7**](decisions.md#c7), see Versioning); a malformed `parked` (non-strings,
blanks) is refused rather than silently dropped, because losing a parked concern is quiet
data loss.

## The manifest — `agent.json`

An agent lives in its own directory holding an `agent.json` that names it and points at its
command:

```jsonc
// .plumbbob/agents/reviewer/agent.json
{
  "contract": 1,                       // required — the contract major this agent speaks
  "name": "reviewer",                  // required — non-empty
  "command": "node \"$PLUMBBOB_AGENT_DIR/review.mjs\"",  // required — the shell command PlumbBob spawns
  "slots": ["after"],                  // required — non-empty subset of before | build | after
  "description": "Flags silent failures and untested branches.",  // optional prose, for the host model
  "when": "after any step that adds error handling or a catch block"  // optional prose, for the host model
}
```

The manifest speaks to **two audiences** ([**D55**](decisions.md#d55)):

- `command` is for the **deterministic CLI** — the shell string PlumbBob runs.
- `description` and `when` are prose for the **host model** — the same role a subagent's
  frontmatter `description` plays. `description` says what the agent is; `when` is the cue
  the model reads to decide *whether* to fire this agent mid-build. PlumbBob's config never
  names *when* to run something (that's judgment, and there's always a frontier model in the
  room reading prose); the manifest's `when` is where that judgment gets its hint.

### How the command runs ([**D49**](decisions.md#d49), POSIX only)

- **Shell:** the `command` string is run through `sh -c`. It's a shell string, not an argv
  array — pipes, redirects, and `$VAR` all work. POSIX only (\*nix / macOS).
- **cwd:** the **repo root**, not the agent's directory. A `build`-slot agent edits
  repo-relative seam paths, so root is the only cwd that makes those paths resolve — the same
  reason `check` runs its command at root.
- **`PLUMBBOB_AGENT_DIR`:** because cwd is the repo root, the agent's own directory is exposed
  in the environment as `PLUMBBOB_AGENT_DIR`. Reference your own files through it —
  `"$PLUMBBOB_AGENT_DIR/review.mjs"` — never a relative path.

## Where agents live — resolution

Two tiers, plus a flag, resolved first-hit-wins ([**D41**](decisions.md#d41) — the settings ladder's shape, and
the same two-level convention as Claude Code's `.claude/agents/`):

```text
--agent <path>              →   an explicit directory, top priority (an escape hatch)
.plumbbob/agents/<name>/    →   project tier: TRACKED, rides the PR — the team's agents
~/.plumbbob/agents/<name>/  →   personal tier: your own library, across every repo
```

A name defined in both resolves from **project** (it shadows personal). A tier "hits" when it
holds an `agent.json`: a *malformed* manifest there is surfaced as an error, never silently
skipped in favor of a different agent.

Because the project tier is tracked, an agent you commit rides the branch into the PR — a
teammate gets it for free. An agent only in your **personal** tier is yours alone: if the
build's `harness.json` binds it and a teammate lacks it, the binding **downgrades to a
warning** and the loop runs without it ([**D54**](decisions.md#d54)) — the same never-required contract as
`/plumbbob:build` itself. (An agent you name *explicitly* is different — see "Fail loud vs degrade
soft.")

## Binding agents to steps — `harness.json`

You plan *which* agent runs at *which* lifecycle point in a build's `harness.json`, a sibling
of `intent.md` under `builds/<slug>/`, authored at `/plumbbob:plan` time ([**D42**](decisions.md#d42)). Three slots,
and only three ([**D43**](decisions.md#d43)):

- **`before`** — runs before you write the step's code; its envelope is **context in**
  (threaded into the next agent's `context[]`).
- **`build`** — authors the step's diff in your place (still verified the same way — [**D3**](decisions.md#d3)).
- **`after`** — runs at the verify pause as **advisory** review; it informs, never gates.

There is deliberately no fourth slot — no declarative format can name "a salient point in the
middle of the work" ([**D43**](decisions.md#d43)). That's judgment, and it's handled in *prose* (a manifest's
`when`, a step's `note`) by the host model, not by config.

```jsonc
// builds/2026-07-02-rate-limit-login/harness.json
{
  "contract": 1,
  "defaults": { "after": ["reviewer"] },          // bind to every step
  "steps": {
    "2": { "before": ["schema-lister"],           // per-step slots override the defaults
           "note": "the limiter needs the existing middleware order — list it first" },
    "3": { "build": "codegen", "after": [] }       // a string or a list; [] explicitly binds nothing
  }
}
```

- **The merge ladder** ([**D57**](decisions.md#d57)): for a given step and slot, a `--agent` flag beats a per-step
  entry, which beats `defaults`, which beats project-wide defaults in `settings.json`
  (`{"agents": {"after": ["reviewer"]}}`). First level that names the slot wins — **replace,
  not append**. A slot bound to `[]` is an explicit override to *nothing*.
- **`note`** is prose the host model reads (like a manifest's `when`) — never mechanics.
- **`harness.json` stays bindings + prose only** ([**C3**](decisions.md#c3)). The moment it grows an `if`, a
  `retry`, or a `loop`, the contract has failed its own spec. Control flow lives in *agents*
  (as code) and in *prose* (read by the model), never in config — GitHub Actions' YAML-grown-a-
  programming-language is the cautionary tale.

## Running an agent

The skills fire these for you; you rarely type them. The full surface is in the
[CLI reference](cli-reference.md#agent).

```sh
plumbbob agent list                          # every resolvable agent, its tier, slots, description
plumbbob agent run reviewer --step 3         # run a named agent against step 3
plumbbob agent run --mode after --step 3     # run the step's harness-BOUND after-agents
plumbbob agent run reviewer --agent ./r      # --agent points at an explicit directory
```

`agent run` composes the `StepContext`, spawns the command, streams its stderr live, captures
and validates the envelope on stdout, lands any `parked[]` through the park verb, and records
the envelope in the step's **handoff ledger** (`builds/<slug>/handoff.json` — untracked,
step-scoped, cleared when the step checkpoints, [**D47**](decisions.md#d47)) so a later `agent run` or a
context-compacted session can thread earlier envelopes back into `context[]`. It re-emits the
validated envelope on **its own stdout** (machine, for the calling skill) with the human
summary on stderr. There is **no** code path here to checkpoint, flip a step, or chain agents
([**C6**](decisions.md#c6)).

### Fail loud vs degrade soft

The two ways an agent can go missing route differently ([**D54**](decisions.md#d54)):

- **You named it** — `agent run reviewer` or `--mode after` against a manifest that doesn't
  declare `after`: **errors**. You asked for that agent specifically; a miss is loud.
- **A harness binding names it** and a teammate lacks it (personal-tier only): **warns and
  skips** ([**D54**](decisions.md#d54)). A binding is ambient configuration the loop must survive without.

A run that actually *starts* and then fails — non-zero exit, a timeout, garbage on stdout —
is a hard failure either way. [D54](decisions.md#d54) softens a *missing* agent, not a *broken* one.

### Interrupts and timeouts

- **Ctrl-C** is forwarded to the child and kills it, then reports — a present human's
  interrupt never orphans the agent ([**D58**](decisions.md#d58)).
- **Timeouts are off by default** ([**D51**](decisions.md#d51)). Set `agentTimeout` (seconds) in the settings
  ladder to arm one; absent or `0` means no timeout. The human is present by default (Ctrl-C
  works), so enforcement is your explicit opt-in, not PlumbBob's guess. On expiry the child is
  killed and the run reported as failed.

## Composing agents (nested invocation)

An agent **may** shell `plumbbob agent run` to compose other agents — a build/review loop with
a cutoff, say ([**D50**](decisions.md#d50)). This is allowed with no environment guard, because:

- **Loops belong inside agents, as code.** A build-then-review-until-clean loop is legitimate
  composition; its cutoff is *your* job as the author (config never grew a `retry` — [**C3**](decisions.md#c3)).
- **The identity invariant holds at every depth.** The envelope has no verb to advance
  PlumbBob's loop ([**C6**](decisions.md#c6)), so no nesting depth can smuggle one in. A composed agent can drive
  *its* children all it likes; it still cannot checkpoint your build.

The warning, not a wall: an uncapped nest is an infinite loop you wrote. Put the cutoff in.

## The fascicle trap — never route a trajectory to stdout

The single most common way to break the contract, called out because it's easy to hit when you
wrap an existing agent framework (fascicle, an SDK, a REPL agent): **their streaming trajectory
— tokens, tool calls, chain-of-thought — must go to stderr, and only the final envelope to
stdout.**

Frameworks default to writing their trajectory to **stdout** (it's "the output"). Piped
straight through, that trajectory *is* your stdout, and PlumbBob sees a stream of tokens where
it expects one JSON object — you're out of contract on the first byte. The fix is a one-line
redirect discipline:

```sh
#!/usr/bin/env sh
# Run the framework with ALL its narration on stderr (1>&2), capture nothing on stdout…
your-agent-framework --task "$(cat)" 1>&2
# …then emit the ONE envelope on stdout, and nothing else.
printf '%s\n' '{"contract":1,"status":"done","summary":"…"}'
```

stdout is a mailbox for exactly one letter, not a log. Everything the human should *watch* goes
to stderr (where it streams live); only the one structured *result* goes to stdout. Get this
backwards and every run fails validation with "the agent wrote non-JSON to stdout."

As of fascicle 0.8.11 the library enforces this discipline for you: `run_stdio` (from
`fascicle/stdio`) reads JSON from stdin, routes trajectory to stderr, disposes the engine, writes
exactly one JSON document to stdout, and exits 0 only when that document is authoritative — the
whole trap, closed at the source. A worked, in-contract agent built on it ships under
[`examples/agents/ollama-reviewer/`](../examples/agents/ollama-reviewer/).

## Versioning

The envelope, manifest, and `harness.json` all carry a `contract` integer. This PlumbBob speaks
**contract 1**. Within a major version the envelope only *gains* fields, so an older CLI can
read a newer minor; a **major mismatch is refused** with an upgrade hint pointing at whichever
side is behind ([**D46**](decisions.md#d46)), because across a major the shapes may genuinely disagree. Keep your
envelope **minimal** — resist field sprawl (SWE-agent's ACI lesson): additions are a minor
bump, removals or renames are a major ([**C7**](decisions.md#c7)).

## A complete working example

A minimal agent that speaks the envelope end to end — reads the StepContext, narrates on
stderr, parks a stray idea, and returns `done` — ships under
[`examples/agents/echo-reviewer/`](../examples/agents/echo-reviewer/). Drop that directory
under `.plumbbob/agents/`, and:

```sh
plumbbob agent list                       # → echo-reviewer (project) [after] — …
plumbbob agent run echo-reviewer --step 1 # runs it against step 1, streams its prose, prints the envelope
```

It's a bash script and a four-line manifest — the whole contract, with nothing to install.

The step up — the same contract wrapping a real framework and a real local model
(fascicle + Ollama), plus a demo spec `/plumbbob:plan` can absorb to bind it into a build —
ships beside it under
[`examples/agents/ollama-reviewer/`](../examples/agents/ollama-reviewer/).

And the same review with a **switchable model provider** — `claude_cli` by default (it
piggybacks the logged-in Claude session; no API key, no local model to pull) or `ollama`
for local, private compute, chosen through the settings ladder (`agentConfig.<name>`,
forwarded to the agent as `ctx.settings.agent`) rather than by editing the agent — ships
under [`examples/agents/reviewer/`](../examples/agents/reviewer/). It's the worked example of
config travelling the frozen envelope `settings` field; its README carries the full provider
matrix.

## See also

- [`skills-reference.md`](skills-reference.md#the-harness-slots) — how `/plumbbob:plan`, `/plumbbob:step`,
  `/plumbbob:build`, and `/plumbbob:verify` drive the slots for you.
- [`cli-reference.md`](cli-reference.md#agent) — `agent list` / `agent run`, the `agentTimeout`
  setting, and the sidecar layout.
- [`decisions.md`](decisions.md) — the `D#` / `C#` design-decision key the tags above cite.
