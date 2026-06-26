# Plumbbob — the reasoning seam + slotting fascicle in as the primary engine

> Builds on [Analysis 2](./02-model-agnostic-standalone.md). Goal: do the hard,
> flexible thing — plumbbob is **model-agnostic by construction**, Claude Code is a
> **first-class consumer**, and the system is **deterministic-script-first**: model
> calls are isolated to where genuine reasoning is unavoidable. The orchestration is
> one fascicle-shaped harness; **only the way an individual model call is dispatched
> forks**, and every model call returns **structured data the deterministic outer
> harness handles**.
>
> Precedent: **Ridgeline already does this** (`~/Projects/ridgeline/code/ridgeline`).
> `engine/provider-route.ts` is the fork point; `engine/claude.runner.ts`
> (`runClaudeOneShot`) and `engine/claude-process.ts` (`runClaudeProcess`) are
> interchangeable model-call transports; `commands/shape.ts` + `commands/qa-workflow.ts`
> are the scripted interview (deterministic `readline` Q&A + scoped model turns)
> returning a JSON-schema'd object (`SHAPE_OUTPUT_SCHEMA`). Copy that shape.
>
> Date: 2026-06-25 (rev. 2 — folds in: interview-as-orchestration, claude_cli
> explicit-only, deterministic-first + four dispatch angles, verbatim model labels).

---

# Part A — Architecture

## A.0 The governing principle: deterministic first

Most of plumbbob is, and stays, **deterministic script** — no model in the loop:
scaffold, state, git baseline/checkpoint, park, revert, status render, archive,
`intent.md`/`build-log.md` parse + persist. A model call is a **last resort**, used
only where real reasoning is unavoidable, and when used it is:

1. **Scoped** — the smallest possible sub-task, not "do the whole verb."
2. **Schema'd** — it returns **structured data** against a declared schema (Ridgeline's
   `SHAPE_OUTPUT_SCHEMA` / `engine/schemas.ts` pattern), never free prose the harness
   has to re-interpret.
3. **Consumed deterministically** — the **outer harness** validates the data,
   persists it, and decides the next step. The model proposes; the script disposes.

This is the inversion of "an agent does everything." The harness is in charge; the
model is a typed function call inside it.

## A.1 The seam already exists — implicitly

`src/verbs/start.ts` proves it: `plumbbob start` scaffolds `.plumbbob/`, writes
`STATE`, records the git baseline, stamps the templates — and makes **no model
call**. Today all reasoning is done by the host model executing `SKILL.md` prose. So
plumbbob is already split into a deterministic CLI half and a reasoning half; the
seam between them is just *informal* (the reasoning "script" is English in the skill,
and only a host agent can run it). The work is to make that seam **explicit and
CLI-owned** so any of four dispatch angles can answer a model call.

## A.2 The shape: one deterministic harness, a narrow pluggable dispatch

```
 Deterministic harness (fascicle-shaped, plumbbob-owned)        The ONLY fork
 ────────────────────────────────────────────────────          ─────────────
 sequence / loop / branch / suspend(human) / parse / persist
        │                                                       Dispatcher.call(
        ├── deterministic step ──────────────► (no model)         prompt, schema
        ├── deterministic step ──────────────► (no model)       ) ─► structured data
        └── model_call step ─────────────────► Dispatcher ─────────┐
                                                                   │ forks 4 ways ▼
                                                  1 claude-code (skill/agent/hook)
                                                  2 codex      (skill/agent/hook)
                                                  3 fascicle API   (cloud provider)
                                                  4 fascicle local (Ollama/LM Studio)
        ◀──────────── structured data returns; harness validates/persists/branches ──┘
```

Three CLI-owned pieces, mirroring the original seam but with the fork pulled in tight:

- **The harness** — per reasoning verb (`plan`-interview, `step`, `refine`,
  `harvest`, `verify`-review), a deterministic composition: fascicle `sequence` /
  `loop` / `branch` / `suspend` (for human turns) with **`model_call` steps** at the
  reasoning points. This is the bulk of the logic and it is **identical across all
  dispatch angles**. It is literally fascicle-shaped (and can be a real fascicle flow,
  or plain orchestration code that calls the same dispatcher).
- **`model_call(prompt, schema) → data`** — the one place a model is consulted. It
  does **not** hardcode a transport; it asks the **Dispatcher**. It always returns
  **typed data** (schema-validated), the way Ridgeline's turns return `ShapeOutput`.
- **The Dispatcher** — the fork (Ridgeline's `engine/provider-route.ts`). Same
  signature, four implementations (A.3). The harness neither knows nor cares which
  one is live.

The deterministic glue around every `model_call` — `build` the prompt+context,
`validate` the returned data, `persist` to `intent.md`/`build-log.md`, decide
next — is shared and reused by the existing `src/lib/intent.ts` parser. **One output
contract, one parser, four dispatchers.**

## A.3 The four angles of attack (dispatchers)

Two families: **host-dispatched** (the model call is answered by the in-session
subscription model) and **fascicle-dispatched** (answered in-process by fascicle).

### Host-dispatched — the in-session subscription answers (preferred; free-ish)

The harness runs in the CLI; when it hits a host-dispatched `model_call`, it
**`suspend`s** (fascicle `suspend` → persists harness state under `.plumbbob/`),
emits the prompt + output schema, and exits. The skill/agent/hook hands the prompt to
the in-session model; that model returns the structured data; the skill calls
`plumbbob <verb> --resume <handle> --data <json>`; the CLI **rehydrates** the
suspended harness and continues to the next deterministic step. A multi-call verb is
a few suspend/resume hops — the harness stays in control the whole time; the host is
*only* a model-call transport.

1. **Claude Code — skill / agent / hook.** First-class (A.7): the skill's
   deterministic `` !`plumbbob <verb> --emit` `` pre-render injection puts the prompt
   in context *before* the model sees it (guaranteed, not "the agent chose to run a
   terminal"). For heavier sub-tasks the prompt can target a Claude Code **subagent**;
   the **hook** can drive the resume. Runs on the user's Claude subscription, zero
   config in-session.
2. **Codex — skill / agent / hook.** Same suspend/resume protocol via a Codex
   `SKILL.md` (`.agents/skills/`, `disable-model-invocation: true`). Execution is
   "soft" (the agent runs `plumbbob <verb>` under approval) but the data contract is
   identical. Runs on the user's Codex subscription.

> Cursor / VS Code / Zed are the same Codex-shaped story (shared `.agents/skills/`
> `SKILL.md` + soft exec); list them as later targets, not in the first cut.

### Fascicle-dispatched — fascicle answers in-process (model-agnostic; opt-in)

`model_call` resolves synchronously inside the CLI via fascicle — **no suspend, no
host, runs headless / as a pure CLI tool**. This is where fascicle is the engine.

3. **fascicle API** — fascicle → Anthropic / OpenAI / Google / OpenRouter / Bedrock,
   per-token on the user's key. **Verbatim model labels** (`claude-opus-4-8`,
   `gpt-5`, …) — no alias table; pass through to the provider exactly like fascicle.
   - **`claude_cli` is an explicit-only variant of this angle.** It authenticates via
     the user's logged-in `claude` CLI to run the **full fascicle harness logic**
     (not the in-skill logic) on the subscription. **Do NOT default to it** — it is
     moving to **full API pricing**, so its cost edge is disappearing. Offer it only
     when the user explicitly asks ("use my Claude sub but with the fascicle CLI
     orchestration").
4. **fascicle local** — fascicle → Ollama / LM Studio. Free, private, offline. Best
   for the cheap/mechanical model turns; weaker on the hardest planning.

### Dispatch, summarized

| Angle | Who answers | Mechanism | Cost | Default? |
|---|---|---|---|---|
| 1 Claude Code skill/agent/hook | in-session Claude (subscription) | `suspend`→emit→`--resume` | free in-session | **yes, when in a Claude session** |
| 2 Codex skill/agent/hook | in-session Codex (subscription) | `suspend`→emit→`--resume` | free in-session | yes, when in a Codex session |
| 3 fascicle API | fascicle → cloud provider | in-process | per-token (key) | opt-in (config/flag) |
| 3′ fascicle API · `claude_cli` | fascicle → spawned `claude` | in-process | **soon full API price** | **explicit-only** |
| 4 fascicle local | fascicle → Ollama / LM Studio | in-process | free/local | opt-in (config/flag) |

The CLI calls a model **in-process only for angles 3–4**. Angles 1–2 never have the
CLI talk to a provider; the subscription model does, and only because the user is
already in that session.

## A.4 The interview is an orchestration, not a call (the Ridgeline pattern)

`/pb-plan` mode 1 (interview) is **not** a single `model_call`. It is a deterministic
scripted Q&A loop, exactly like Ridgeline's `commands/shape.ts` + `qa-workflow.ts`:

```
loop (deterministic, harness-owned):
  ├─ suspend(human)         ask the next question         ← readline (CLI) or skill turn (host)
  ├─ model_call(synthesize) fold the answer into the      ← dispatched (any angle), returns
  │                         working SHAPE-shaped object       a typed partial, not prose
  ├─ branch                 enough to converge?            ← deterministic check on the data
  └─ …repeat until converged
persist → intent.md  (Frame, Decisions, Constraints; Steps authored from the object)
```

The **script owns the loop and the convergence test**; the human turns are
deterministic; only the *synthesis turns* are `model_call`s, each returning structured
data (Ridgeline's `SHAPE_OUTPUT_SCHEMA` is the model). This runs under **any**
dispatcher:

- **Angles 3–4 (fascicle):** the loop runs in-process — `readline` prompts the human,
  each synthesis turn hits the provider. Pure CLI, no host. (Ridgeline proves this
  exact shape works.)
- **Angles 1–2 (host):** each synthesis turn is a suspend/resume hop answered by the
  in-session model; the host may also conduct the human turns conversationally.

So the interview is model-agnostic and mostly deterministic — the model is consulted
only to fold free-form human answers into the typed object, never to "run the
interview." Open tuning question: suspend **granularity** in host mode (per turn vs.
batched) — start coarse, refine.

## A.5 Config + dispatch resolution

Config (plumbbob-owned; XDG user default + per-project override; keys via env):

```toml
# ~/.config/plumbbob/config.toml  ·  .plumbbob/config.toml (project override)
[reasoning]
dispatch = "host"             # host | api | local   (default host = no in-process model call)
# host auto-resolves to the angle of the session you're in (claude-code / codex / …)

[reasoning.verbs]             # optional per-verb override
# refine = "api"              # e.g. always run the frame-attack on a strong cloud model
# harvest = "local"           # triage is cheap → local

[reasoning.api]               # read only when a verb resolves to api
provider = "anthropic"        # verbatim provider + model labels, fascicle-style
model = "claude-opus-4-8"
effort = "high"               # fascicle translates effort per provider; key from env
# use_claude_cli = true       # EXPLICIT opt-in only; subscription auth, soon full API price

[reasoning.local]             # read only when a verb resolves to local
provider = "ollama"
base_url = "http://localhost:11434"
model = "qwen2.5-coder:32b"   # verbatim
```

Resolution per verb: **`--reason <dispatch>` flag → `[reasoning.verbs].<verb>` →
`[reasoning].dispatch` → `host`.** `host` resolves to the in-session angle (Claude
Code / Codex) via the skill that invoked `--emit`. No model-call SDK is loaded unless
a verb resolves to `api`/`local`. `plumbbob doctor` reports the resolved dispatch per
verb and whether its prerequisites (session / key / SDK / local server) are present.

## A.6 Where the verbs land

| Verb | Half | Model calls? |
|---|---|---|
| `start`/scaffold, `checkpoint`, `park`, `revert`, `status`, `wrap`, `doctor` | deterministic | **never** |
| `plan` (interview + author steps) | harness + model turns | scripted loop; synthesis turns dispatched (A.4) |
| `step` (sharpen/sync next step) | harness + 1 model turn | one dispatched `model_call` |
| `refine` (attack frame / repair) | harness + model turns | fascicle **`adversarial`** loop in fascicle dispatch; iterated emit/resume in host |
| `harvest` (triage parked ideas) | harness + 1 model turn | one dispatched call, structured verdict per idea |
| `verify` — **review** | harness + model turn(s) | one call; fascicle **`consensus`** optional in api/local |
| `verify` — **pause** | control (human) | none — fascicle **`suspend`** semantics; the human tick, never automated |
| `build` (implement a step) | **execution / the hands** | host's job in-session; a fascicle tool-loop is an **explicit advanced** opt-in, never default |

## A.7 Claude Code, first-class

Claude Code earns the streamlined path: **deterministic `!emit` injection** (the only
host that can put the dispatched prompt in context with no "agent decided to run a
terminal"), **plugin packaging** ([Analysis 1](./01-claude-native-distribution.md)),
the option to target a **subagent** for a heavy sub-task, and a **hook** to drive
`--resume`. In-session it needs zero config — the subscription model simply answers
the dispatched calls. Other hosts consume the identical suspend/emit/resume protocol
through a shared `.agents/skills/` `SKILL.md`; only the determinism is softer.

## A.8 The picture

```
 config[reasoning]
       │
       ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ plumbbob CLI                                                               │
 │   deterministic verbs (no model): start/checkpoint/park/revert/status/wrap │
 │   reasoning harness (fascicle-shaped, deterministic):                      │
 │     sequence/loop/branch/suspend(human) … model_call(prompt,schema)→data   │
 │                                   │                                        │
 │                              Dispatcher (provider-route)                   │
 └───────────────┬──────────────────┬───────────────────┬────────────────────┘
   host-dispatched│                  │ host-dispatched   │ fascicle-dispatched (in-process)
  suspend→emit→resume                │                   │
        ▼                            ▼                   ▼
  1 Claude Code               2 Codex             3 fascicle API (verbatim labels;
   skill/agent/hook            skill/agent/hook      claude_cli = explicit-only)
   (subscription)              (subscription)      4 fascicle local (Ollama/LM Studio)
        └─────────── all return STRUCTURED DATA ──────────┘
                              │
                              ▼
              harness validates → persists (intent.md / build-log.md via src/lib/intent.ts) → next step

 Front-ends (thin triggers): Claude Code plugin + .claude/skills/ (deterministic !emit) ·
   .agents/skills/ for Codex (+ Cursor/VS Code/Zed later) · pure CLI `plumbbob <verb> --reason api|local`
```

---

# Part B — The plan: slot fascicle in now, as the primary engine

Fascicle is the **single** model-calling layer the moment the CLI calls a model. Build
the deterministic harness + dispatcher first (host-only, zero in-process model risk),
then light up the fascicle dispatch angles. Phrased in plumbbob's own step idiom.

## Phase 0 — Foundations (no behavior change)

1. **[ ] Config layer.** — done when: `plumbbob` merges
   `~/.config/plumbbob/config.toml` + `.plumbbob/config.toml` into a typed
   `ReasoningConfig`; absent config resolves to `dispatch = "host"`; keys read from
   env, never persisted.
   - seam: `src/lib/config.ts` (new)
2. **[ ] Node floor + fascicle dep, lazy.** — done when: `engines.node >= 24`;
   `fascicle` + `zod` + `@ai-sdk/*` are deps but **dynamically imported** so a
   host-only user loads no provider SDK; `pnpm build` still emits a runnable `dist/`.
   - seam: `package.json`, `src/lib/reasoning/dispatch.ts` (dynamic `import`)

## Phase 1 — The deterministic harness + the dispatcher seam (host-only)

3. **[ ] Define the harness contract + structured output.** — done when: a verb's
   reasoning is expressed as a deterministic harness with `model_call(prompt, schema)
   → data` points; the output contract is one markdown shape reused by
   `src/lib/intent.ts`; a `zod`/JSON schema per call type exists (copy Ridgeline's
   `engine/schemas.ts` discipline). Unit-tested with fixtures.
   - seam: `src/lib/reasoning/{harness,schema}.ts` (new), `src/lib/intent.ts`
4. **[ ] The Dispatcher interface + host implementation (suspend/emit/resume).** —
   done when: `Dispatcher.call(prompt, schema)` exists; the **host** impl does
   `suspend` (persist harness state under `.plumbbob/`) → `plumbbob <verb> --emit`
   prints the prompt+schema → `plumbbob <verb> --resume --data <json>` rehydrates and
   continues; CLI makes **no** in-process model call. Model: Ridgeline
   `engine/provider-route.ts`.
   - seam: `src/lib/reasoning/dispatch.ts`, `src/lib/reasoning/host.ts` (new)
5. **[ ] Port `plan` (incl. the interview loop) onto the harness, host-only.** — done
   when: `/pb-plan` produces a byte-comparable `intent.md` to today; the interview is
   the scripted loop of A.4 (human turns + dispatched synthesis turns), not skill
   prose; existing tests green.
   - seam: `src/verbs/plan.ts` (new), `skills/pb-plan/SKILL.md` (thin: emit→host→resume)
6. **[ ] Port `step`/`refine`/`harvest`/`verify`-review onto the harness, host-only.**
   — done when: each is a deterministic harness with scoped, schema'd model turns; its
   skill is a thin emit/resume trigger; mechanics verbs untouched.
   - seam: `src/verbs/{step,refine,harvest,verify}.ts`, matching `skills/*/SKILL.md`

*End of Phase 1: nothing calls a model in-process; behavior unchanged; the harness is
real, the dispatcher seam is the only fork. Safe checkpoint.*

## Phase 2 — Light up fascicle dispatch (CLI can now answer model calls in-process)

7. **[ ] Fascicle engine factory.** — done when: `buildEngine(cfg)` turns a resolved
   `[reasoning.api|local]` block into `create_engine({ providers })`, provider SDKs
   dynamically imported, clear error on missing SDK/key, `dispose()` after each run.
   - seam: `src/lib/reasoning/fascicle.ts` (new)
8. **[ ] Fascicle dispatch impl (angles 3–4).** — done when: `Dispatcher.call`
   resolves in-process via `model_call` when a verb resolves to `api`/`local`; the
   scripted interview and the analytic verbs run **end-to-end with no host**; same
   `intent.md` contract; **verbatim** model labels; a `zod` post-validate backstops
   the markdown parse.
   - seam: `src/lib/reasoning/{dispatch,fascicle}.ts`
9. **[ ] `claude_cli` behind an explicit flag.** — done when:
   `use_claude_cli = true` (or `--reason api --claude-cli`) routes the api angle
   through fascicle's `claude_cli` adapter; it is **never** auto-selected; `doctor`
   prints a "subscription auth; pricing moving to full API rate" note.
   - seam: `src/lib/reasoning/fascicle.ts`
10. **[ ] Dispatch resolution live across all reasoning verbs + doctor.** — done when:
    A.5 resolution governs every verb uniformly and `plumbbob doctor` reports the
    resolved angle + prerequisite health (session / key / SDK / local server).
    - seam: `src/cli.ts` dispatcher, `src/verbs/doctor.ts`

## Phase 3 — Use fascicle's primitives where they beat a flat call

11. **[ ] `refine` → `adversarial`** in fascicle dispatch (build→critique→repeat).
12. **[ ] `verify`-review → optional `consensus`/`ensemble`** (N judges, accept on
    agreement) behind a config knob.
13. **[ ] Reuse fascicle `checkpoint` + trajectory** in fascicle dispatch so cost and
    spans are observable (`fascicle-viewer` works out of the box).

## Phase 4 — Generalize the front-ends

14. **[ ] Verbs authored once** as `.agents/skills/pb-*/SKILL.md`
    (`disable-model-invocation: true`), mirrored to `.claude/skills/` with the
    deterministic `!emit` only in the Claude copy. Codex first; Cursor/VS Code/Zed
    after.
15. **[ ] `plumbbob mcp` (fascicle `serve_flow`), read-only** — `status`/context as an
    MCP tool for any host; **never** the action/transition verbs (MCP is model-invoked
    and would wind the clock).
16. **[ ] `plumbbob init --host <claude|codex|…>`** scaffolds the integration per
    project (committed; XDG for user defaults; nothing in `$HOME`); writes an
    `AGENTS.md` snippet + `CLAUDE.md` shim.

## Guardrails

- **Deterministic-first is the law.** Reach for a `model_call` only when a deterministic
  script genuinely can't do it; keep each call scoped + schema'd; the harness consumes
  the data.
- **Phases 0–1 ship alone**, zero in-process model risk; the contract leaves the skill
  prose and the seam becomes real.
- **Phase 2 makes fascicle primary** — gate behind config so host-only users are
  untouched; dispose engines; print a cost estimate on any in-process call (`host` =
  free).
- **Hold the labor line.** CLI owns deterministic mechanics + the reasoning harness;
  the host owns execution (`build`). No standalone coding agent by default.
- **One contract, one parser, four dispatchers.** If the `intent.md` output shape ever
  forks per angle, the seam has failed.

## Resolved (was: open questions)

- **Interview:** scripted orchestration (Ridgeline `shape`/`qa-workflow` pattern), not
  a single call — A.4. ✅
- **`claude_cli`:** explicit opt-in only; never default; subscription auth for running
  the full fascicle harness, with a full-API-pricing caveat — A.3. ✅
- **Output:** model calls return **structured data** (schema'd) handled deterministically
  by the outer harness — A.0. Emit the shared markdown shape + `zod`-postcheck; one
  parser. ✅
- **Model labels:** **verbatim**, fascicle-style; no alias table — A.5. ✅

## Net

The dispatcher seam is the whole investment: the deterministic fascicle-shaped harness
is written once; a `model_call` returns typed data; and **only how that one call is
answered forks four ways** — Claude Code, Codex, fascicle API, fascicle local.
Deterministic-script-first keeps those calls few and small. Build Phases 0–1 now (no
in-process model risk), and Phase 2 turns the key with fascicle as the one engine.
