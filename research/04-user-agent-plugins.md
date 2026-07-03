# PlumbBob user agents — Analysis 4: the plug-in contract and the composition question

> Question: users should be able to author their own local agents (fascicle-built or
> otherwise) and plug them into plumbbob's loop — planned ahead of time, invoked
> per-step, keeping the human in the loop by default and supporting `--auto`. What is
> the contract, where do agents live, where does the *planned* binding live if not
> `intent.md`, and how do we compose "intent + agent harness(es) + invocation logic"
> without becoming ridgeline with extra steps? Benchmarked against academic, industry,
> and open-source prior art.
>
> Date: 2026-07-02. Companions: [`02-model-agnostic-standalone.md`](./02-model-agnostic-standalone.md)
> (fascicle *inside* plumbbob — declined), [`03-reasoning-seam-and-fascicle-plan.md`](./03-reasoning-seam-and-fascicle-plan.md).
> Sequencing: designed to land **after** the worktree-proof sidecar restructure
> (`builds/<slug>/` + settings ladder), which it depends on.

## The recommendation in one screen

1. **One envelope.** A versioned JSON-in-stdin / JSON-out-stdout / prose-on-stderr
   subprocess contract. An agent is *anything executable* that speaks it — fascicle,
   bash, Python, a wrapped ridgeline phase. Plumbbob never knows the runtime.
2. **One verb.** `plumbbob agent run <name> [--step N]` — deterministic mechanics
   only: resolve the agent, compose the input JSON from files the CLI already reads,
   spawn, validate the output envelope, apply side effects through existing verbs
   (`park`, checkpoint `--body` material). It has **no way to advance the loop** — no
   checkpoint, no step flip, no chaining.
3. **Two homes.** Agent definitions: `.plumbbob/agents/<name>/` (tracked, project) →
   `~/.plumbbob/agents/<name>/` (personal), resolved down the same ladder as settings.
4. **One plan artifact.** Planned bindings live in `builds/<slug>/harness.json`,
   a sibling of `intent.md` authored at `/pb-plan` time — *not* in `intent.md`, and
   *not* in a new `state.json` (§ the composition question).
5. **Three slots, no DSL.** A step may bind agents `before` (context in), `build`
   (executor), and `after` (advisory review). Anything finer-grained is prose the
   host model interprets, or code inside the agent. Config never grows control flow.
6. **Checkride is the gate.** Agent output is a diff like any other author's diff:
   `plumbbob check` (→ checkride) decides done-ness; the human decides advancement.
   D3's author-blindness extends unchanged.

## What already exists — the seam is half-built

- **D3 (pluggable, author-blind executor).** `/pb-verify` "reads the diff, not the
  author"; "another harness" is already a legal executor. A user agent that mutates
  the working tree is *already* a plumbbob citizen today. This analysis adds a
  doorway, not a capability.
- **`check` precedent** (`src/lib/check.ts`): plumbbob already spawns an arbitrary
  user-configured command and trusts only its exit code. The agent verb is the same
  move with a richer envelope.
- **Checkride precedent** (in-house): "human-readable progress goes to stderr;
  stdout carries machine output only." The exact stream discipline the envelope
  needs, already shipped in the sibling tool. Checkride's slot/adapter model (a role
  in the pipeline; a blessed default; alternates wired) is also the shape of the
  step-slot design below.
- **The standing fascicle decline is compatible.** Analysis 02 declined fascicle
  *inside* plumbbob (deps, Node 24 floor, key UX). Here fascicle sits on the *user's*
  side of a subprocess boundary. The CLI stays zero-dep and deterministic; whether
  the child process imports `ai`/`zod` is invisible. Fascicle's home remains
  ridgeline; this lets fascicle-built agents visit without moving in.

## The contract (envelope)

```jsonc
// stdin → the StepContext the CLI composes deterministically
{
  "contract": 1,
  "mode": "before" | "build" | "after",
  "build": { "slug": "...", "title": "..." },
  "step": { "n": 4, "title": "...", "doneWhen": "...", "seam": ["src/lib/git.ts"] },
  "decisions": ["D1: ..."],
  "constraints": ["C1: ..."],
  "context": [ { "agent": "api-researcher", "summary": "...", "body": "..." } ],  // before-slot outputs
  "settings": { }
}

// stdout ← the result envelope (nothing else on stdout, ever)
{
  "contract": 1,
  "status": "done" | "blocked" | "drift",
  "summary": "one-line for the human and the checkpoint subject vicinity",
  "body": "proportional prose — feeds `checkpoint --body`",
  "parked": ["ideas surfaced mid-run — applied via the park verb, not by the agent"],
  "notes": "anything the verify pause should see"
}
```

- **stderr passes through to the terminal.** The human *watches* the agent work.
  That is the attention-first move: the flood is visible but banked — production
  (agent narrating on stderr) never collides with consumption (the result arrives
  as one structured envelope at the pause).
- **Exit codes:** 0 = envelope on stdout is authoritative; non-zero = failed run,
  CLI reports and stops. `contract` major-version mismatch = refuse with a hint.
- **Side effects are applied by the CLI, never by the agent.** `parked[]` goes
  through the park verb; the sidecar keeps a single writer. An agent that edits
  `.plumbbob/` directly is out of contract.
- **Signals:** the CLI forwards SIGINT — the human is present; Ctrl-C must kill the
  child. (Fascicle agents: `install_signal_handlers: false`, dispose in `finally` —
  the hooks already exist, per the pr-improve example.)
- Keys, model choice, sandboxing are the **agent's** business (its env, its config).
  Plumbbob never touches a provider key — the standing host-only decision holds.

Fascicle today has **no built-in stdin/stdout JSON mode** — but compliance is ~5
lines for an author (`JSON.parse` stdin → `run(flow, input)` → write the result
union to stdout), and fascicle's idiomatic result shape is already a zod
discriminated union serialized with `JSON.stringify`. One trap to document: fascicle
examples tee *trajectory events* to stdout (pr-improve's `tee_logger`) — a compliant
agent routes trajectory to stderr or a file. The fascicle-side fixes (a `run_stdio`
helper, a library `stderr_logger`, matching 0/1/2 exit codes) are proposed in
fascicle's `research/explorations/2026-07-stdio-agent-contract.md`.

## Where agents live

```
.plumbbob/agents/<name>/          # tracked — rides the PR; teammates get it
  agent.json                      # manifest
  run.sh | main.ts | anything     # the executable the manifest points at
~/.plumbbob/agents/<name>/        # personal library, same shape
```

```jsonc
// agent.json
{
  "name": "fan-out-reviewer",
  "description": "Ensemble of three lenses over the step diff, synthesized to one verdict",
  "when": "after a step whose seam touches more than ~3 files, or any step marked risky",
  "slots": ["after"],
  "command": "./run.sh",
  "contract": 1
}
```

Resolution: `--agent` flag → project `agents/` → personal `agents/` — the settings
ladder's shape (D7 of the restructure). The manifest's `description`/`when` are
**prose for the host model**, exactly like a Claude Code subagent's frontmatter
description or a skill description: they are how the reasoner in the room decides
to reach for the tool. `command` is how the deterministic CLI runs it. Precedents:
Claude Code's `.claude/agents/*.md` project/user two-level convention; git's
`git-credential-<name>` discovery-by-name; pre-commit's per-hook manifest.

## The composition question — where does *planned* agent integration live?

The requirement: compose a step as **intent + agent harness(es) + invocation
logic**, planned ahead of time, human-controlled, `--auto`-capable.

### Not `intent.md`

Unchanged from the prior analysis: the intent is executor-agnostic by doctrine
(D3 — the plan must not care how the diff appears), it now rides the PR as prose a
teammate reads (Ben: "better documentation than most human PRs"), and an
`agent:` key is where DSL creep starts. The intent says **what** and **why**.

### Not a `state.json`

The instinct "are we leaning too heavily on intent.md?" is right, but the worktree
restructure already answered it: control state (STEP/SEAM/SPIKE markers, the
`activeBuild` cursor) is untracked ephemera; artifacts are tracked narrative.
`intent.md` is not a state store — the one stateful thing in it (the `[x]` flips)
is deliberate PR narrative. Agent bindings are neither state nor intent: they are
**plan-adjacent configuration**. Fracturing intent.md into a state file would trade
its best property (one prose surface a human re-reads to reload the plan) for
nothing the restructure hasn't already provided.

### Yes: `builds/<slug>/harness.json` — a sibling artifact

```jsonc
{
  "contract": 1,
  "defaults": { "after": ["fan-out-reviewer"] },        // applies to every step
  "steps": {
    "3": { "before": ["api-researcher"],
            "note": "the researcher owns the OpenAPI diff; feed it to the builder" },
    "5": { "build": "parallel-builder" }                 // replaces the host model's labor
  }
}
```

- **Authored at `/pb-plan` time.** That is the meta-programming moment, and it is
  attention-first by construction: agent involvement is decided in DESIGN, off the
  chat, and reviewed at the plan pause alongside the steps themselves. `/pb-step`
  can revise a step's bindings just-in-time like it revises the step.
- **Tracked, rides the PR.** A reviewer sees not just what was planned but what
  machinery built it. One-folder self-containment (the restructure's core property)
  is preserved: `intent.md` = what/why, `harness.json` = with-what,
  `build-log.md` = what happened, `checkpoints` = where.
- **Graceful degradation.** A missing agent (teammate without your personal
  library) downgrades the binding to a warning; the loop works without it — the
  same optionality contract as `/pb-build` itself.
- Project-wide *defaults* (e.g. "always run my reviewer after every step in this
  repo") live in `settings.json` / `settings.local.json`; per-build bindings live
  in the build's own harness file; the flag overrides both.

### The three slots — and why there is no fourth

A `/pb-build` beat has exactly three stable attachment points that don't require a
workflow language:

| Slot | Runs | Its output becomes | Analog |
|---|---|---|---|
| `before` | before implementation | `context[]` in the build input — feeds the implementing model (host or agent) | ridgeline's researchers |
| `build` | instead of the host model's implementation labor | the diff itself | ridgeline's builder |
| `after` | once the diff exists, before the pause | **advisory** input presented at the verify pause | ridgeline's reviewer — minus the gate |

"At a salient point in the middle" is deliberately **not** a slot, because no
declarative format can name a salient point — that's a judgment call. And here
plumbbob has an advantage ridgeline structurally lacks: ridgeline is headless, so
its control flow must be code (fascicle compositions); plumbbob **always has a
frontier model in the room** executing SKILL.md prose. The judgment half of
when/how/why is therefore delegated to the host model *as prose* — the manifest's
`when` field, the harness file's `note` field — and the host model fires
`plumbbob agent run <name>` mid-build the same way it decides to use any tool.

**Prose is plumbbob's orchestration language, and the host model is its workflow
engine.** The declarative part (slot bindings) stays machine-checkable and feeds
the deterministic CLI; the judgment part stays prose and feeds the reasoner. There
is nothing in between — no `if`, no `retry`, no `loop` in config, ever.

This dissolves the "fascicle workflow for a fascicle workflow" recursion. There are
two composition layers with different media, and they don't compete:

- **Within an agent: code.** Fan-out + synthesize, ensemble judges, adversarial
  build+review, tournaments — fascicle's 18 primitives. Plumbbob sees one
  subprocess and one envelope, however baroque the insides.
- **Across a step: prose + slots.** Plumbbob composes agents the way a human
  composes colleagues: *"get the research from X before you start; have Y look at
  it when you think you're done."*

**The litmus test for every future extension:** if a proposed harness.json key
couldn't be spoken aloud in a sentence like that, it belongs inside an agent (code)
or inside a skill (prose) — not in config.

### `--auto` composes without new machinery

The beat under `--auto` becomes: before-agents → implement (host or build-agent) →
after-agents → check → self-review → checkpoint-if-clean → next. After-agent output
is advisory input the self-review must address — feeding the *existing* halt
condition ("self-review finds a mismatch → stop and hand back"), not a new gate.
The default path unchanged: everything lands at the pause and the human is the
clock. This is the full-auto-with-custom-agents capability, and it costs zero new
control-flow machinery.

## The scope-creep line — "is this ridgeline with extra steps?"

No — provided three invariants hold. They are the identity boundary:

1. **The envelope has no verb for advancing the loop.** No agent can checkpoint,
   flip a step, or trigger another agent. Chaining exists only in `--auto`, at the
   skill layer, invoked by a human by name. (Ridgeline advances itself; plumbbob's
   user is the clock — the subprocess boundary enforces the difference *by
   construction*.)
2. **Config never encodes control flow.** Slots + prose only. The moment
   harness.json grows a conditional, plumbbob is programming in YAML (see
   cautionary tales) and ridgeline already does the code version better.
3. **Review is advisory, gates are checkride's.** An `after` agent that can fail a
   step is the lock returning in autonomy's costume. Agents advise; `plumbbob
   check` (deterministic, exit-code-honest) gates; the human advances.

The clean division of labor across the three tools:

> **plumbbob** is the attention-first console — the UI/UX for ridgeline-class work.
> **fascicle** is the power behind any single envelope.
> **checkride** is the definition of done that doesn't care who wrote the diff.
>
> Intent says what. Agents do labor. Checkride says done. The human says proceed.

A literal bridge falls out for free: a ridgeline phase (already a subprocess that
spawns `claude -p`) can be wrapped as a plumbbob agent in an afternoon — one step
of a plumbbob build executed by ridgeline machinery, gated by checkride, advanced
by a human. That is the compounding story in one sentence.

## Prior art

### Subprocess contracts — the envelope's lineage

| Precedent | Contract | Lesson for plumbbob |
|---|---|---|
| **git credential helpers** | key-value on stdin/stdout; discovery by `git-credential-<name>` | name-convention discovery + stdio contract survives decades; helpers in any language |
| **Terraform `external` data source** | JSON on stdin → JSON object on stdout, errors to stderr, non-zero = fail | the envelope, almost verbatim, in mass production since 2017 |
| **Claude Code hooks** | JSON on stdin → JSON/exit-code out ([docs](https://code.claude.com/docs/en/sub-agents), [overview](https://alexop.dev/posts/understanding-claude-code-full-stack/)) | the convention Rob's users already live in; hook = manifest pointing at a command |
| **Claude Code subagents** | `.claude/agents/*.md`, frontmatter + prose, project/user two-level | prose descriptions steering a reasoner's tool choice = the manifest `when` field |
| **pre-commit framework** | per-repo manifest of hooks, language-agnostic runners | manifest + runner separation; agents in any runtime |
| **checkride** (in-house) | stdout = machine JSON only, stderr = human progress; slots + adapters | the stream discipline and the slot/adapter shape, already house style |
| **LSP** | one protocol, N servers; editor ignorant of server runtime | the framing: this envelope is *LSP for build labor* |
| **MCP / A2A** | JSON-RPC contracts; A2A's task lifecycle includes an `input_required` state ([survey](https://arxiv.org/html/2505.02279v1), [A2A guide](https://rapidclaw.dev/blog/a2a-protocol-complete-guide-2026)) | industry converging on contract-first agent interop; `input_required` as a first-class state validates pause-as-protocol. Plumbbob's envelope stays deliberately smaller: process-local, single-shot, no discovery/negotiation — adopt the *stance*, not the stack |

### Orchestration frameworks — what plumbbob must not become

- **LangGraph** — code-graph engine; HITL is `interrupt()` + `Command(resume=...)`
  with checkpointed state ([blog](https://www.langchain.com/blog/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt),
  [pattern guide](https://docs.bswen.com/blog/2026-04-16-langgraph-human-in-the-loop/)).
  Plumbbob is the inversion: the pause is the default beat and autonomy is the
  opt-in flag, not the reverse. Their persistence-to-survive-interrupts maps to
  `builds/<slug>/` + checkpoint SHAs — already built.
- **Temporal** — the determinism boundary: workflow code must be deterministic;
  side effects live in activities. Direct structural analog: plumbbob CLI =
  workflow layer (deterministic, replayable), agents = activities (non-deterministic,
  retried/reported). Validates keeping every nondeterministic thing on the far side
  of the envelope.
- **CrewAI / AutoGen / MetaGPT** — role-based agent teams; YAML role configs
  (role/goal/backstory — prose-in-config precedent) but control flow in code, and
  autonomous by default with HITL bolted on. Plumbbob differs on the clock, not on
  the roles.
- **ridgeline** (in-house) — the autonomous pole done well, and one cautionary
  detail: its agent contracts are mixed-discipline (builder signals via a
  `READY_FOR_REVIEW` sentinel line; reviewer via trailing JSON scraped from prose).
  Two agents, two ad-hoc conventions. The versioned envelope is the fix.

### Academic

- **SWE-agent / ACI** ([arXiv 2405.15793](https://arxiv.org/abs/2405.15793)) —
  interface design *is* agent performance: simple, few, well-documented actions;
  guardrails in the interface (their edit-blocking linter ≈ the checkride gate).
  Mandate: keep the envelope minimal; resist field sprawl.
- **AlphaCodium / flow engineering** ([arXiv 2401.08500](https://arxiv.org/abs/2401.08500)) —
  structured multi-stage flows beat single prompts (19% → 44% pass@5 on
  CodeContests). This is the value user agents encapsulate — and the reason the
  composition belongs *inside* the agent, where it can be engineered as a flow.
- **HULA** (Atlassian, ICSE — [arXiv 2411.12924](https://arxiv.org/abs/2411.12924),
  [blog](https://www.atlassian.com/blog/atlassian-engineering/hula-blog-autodev-paper-human-in-the-loop-software-development-agents)) —
  HITL agents deployed in JIRA: engineers keep control at the plan and code
  stages; stage-by-stage human feedback improved outcomes and trust at industrial
  scale. The closest peer-reviewed validation of pause-per-beat.

### Cautionary tales — declarative formats that grew control flow

GitHub Actions is the canonical one: a "simple" YAML workflow format that
accreted expressions, conditionals, matrices, and reusable-workflow plumbing —
with no functions, no real abstraction, and a minutes-long feedback loop
([community thread](https://github.com/orgs/community/discussions/15904),
["YAML programming wasteland"](https://dev.to/jmfayard/github-actions-a-new-hope-in-yaml-wasteland-1i9c),
[the pain that is GitHub Actions](https://www.feldera.com/blog/the-pain-that-is-github-actions)).
Jenkins walked the same road earlier (XML → Jenkinsfile pipeline-as-code). The
lesson is structural: **a declarative format that grows control flow becomes a bad
programming language with none of a language's affordances.** harness.json stays
bindings + prose notes; everything with an `if` in it is either fascicle code
(inside an agent) or skill prose (interpreted by the host).

## Comparison

| | Who is the clock | Control-flow medium | Agent contract | HITL model | Extensible by users |
|---|---|---|---|---|---|
| **plumbbob + agents** | human (agent under `--auto`, by name) | prose + 3 fixed slots | versioned JSON envelope, any runtime | the pause **is** the product | drop a folder in `agents/` |
| **ridgeline** | harness | fascicle code | prompt-in / stream-json + sentinels | none (autonomous by design) | edit TS flows |
| **LangGraph** | graph engine | Python/TS graph code | in-process nodes | `interrupt()` opt-in | write graph code |
| **CrewAI / AutoGen** | framework | code (+ YAML roles) | in-process | bolted on | write framework code |
| **Claude Code subagents** | host model | prose | markdown frontmatter, in-host | permission prompts | drop a file in `agents/` |
| **HULA** | human | fixed pipeline | internal | approve per stage | no |

The empty quadrant plumbbob occupies: **human-clocked, prose-orchestrated,
contract-extensible.** Nothing surveyed combines all three.

## Sequencing and dependencies

Land after the worktree restructure, which supplies three prerequisites:
`builds/<slug>/` (harness.json's home; makes StepContext one-folder-derivable),
the settings ladder (agent defaults' home), and the tracked/untracked split
(agents are tracked). Then the build is small: one verb (`agent run` + `agent
list`), one resolver, one envelope validator, `before`/`build`/`after` handling in
the pb-build/pb-verify skills, harness.json authoring in pb-plan, and a
`docs/agents.md` defining the contract. The ecosystem does the rest — that is the
point of a doorway.

## Open questions

- **Q1 — file name:** ~~`harness.json` vs `agents.json` vs folding into a
  `## Harness` section of a future plan artifact.~~ **Resolved 2026-07-02:
  `harness.json` ratified** — Rob's framing: "effectively like `hooks.json` with
  certain *lifecycle* labels to hook into supported event points." The slots ARE
  the lifecycle: `before`/`build`/`after` are the supported event points of a
  build beat, and the file reads as hook registrations against them.
- **Q2 — before-slot transport:** `context[]` inline in the input JSON (current
  sketch) vs files in `builds/<slug>/context/` the input references. Inline until
  size proves otherwise.
- **Q3 — recursion:** an agent shelling `plumbbob agent run` — forbid (env guard),
  or shrug (it's the user's process tree)? Leaning shrug + a documented warning.
- **Q4 — timeouts:** none (human is present, Ctrl-C works) vs a settings key.
  Leaning none for v1.
- **Q5 — Windows:** `command` through a shell vs argv array in the manifest.
- **Q6 — contract evolution:** minor-version additive fields; major = refuse.
  Where does the schema live so agent authors can validate? (`docs/agents.md` +
  a `plumbbob agent check <name>` doctor-style verb?)

## Sources

Industry protocols and frameworks:

- [A Survey of Agent Interoperability Protocols: MCP, ACP, A2A, ANP](https://arxiv.org/html/2505.02279v1) (arXiv 2505.02279)
- [A2A Protocol Guide 2026](https://rapidclaw.dev/blog/a2a-protocol-complete-guide-2026)
- [LangGraph: making it easier to build human-in-the-loop agents with interrupt](https://www.langchain.com/blog/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt)
- [LangGraph HITL via the interrupt() pattern](https://docs.bswen.com/blog/2026-04-16-langgraph-human-in-the-loop/)
- [Claude Code: create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Understanding Claude Code's full stack: MCP, skills, subagents, and hooks](https://alexop.dev/posts/understanding-claude-code-full-stack/)

Academic:

- [SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793) (arXiv 2405.15793)
- [Code Generation with AlphaCodium: From Prompt Engineering to Flow Engineering](https://arxiv.org/abs/2401.08500) (arXiv 2401.08500)
- [Human-In-the-Loop Software Development Agents (HULA)](https://arxiv.org/abs/2411.12924) (arXiv 2411.12924, ICSE)
- [HULA at Atlassian — engineering blog](https://www.atlassian.com/blog/atlassian-engineering/hula-blog-autodev-paper-human-in-the-loop-software-development-agents)

Cautionary tales:

- [GitHub community: alternative to YAML for defining workflows](https://github.com/orgs/community/discussions/15904)
- [GitHub Actions: a new hope in YAML programming wasteland](https://dev.to/jmfayard/github-actions-a-new-hope-in-yaml-wasteland-1i9c)
- [The pain that is GitHub Actions](https://www.feldera.com/blog/the-pain-that-is-github-actions)

In-house: ridgeline (`~/Projects/ridgeline/code/ridgeline/` — `src/engine/claude-process.ts`,
`src/agents/core/{builder,reviewer}.md`), fascicle (`~/Projects/fascicle/code/fascicle/` —
`examples/pr-improve/`, `docs/writing-a-harness.md`, and the companion proposal
`research/explorations/2026-07-stdio-agent-contract.md`), checkride
(`~/Projects/checkride/code/checkride/README.md` — stream discipline, slots/adapters).
