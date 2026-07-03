<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.
-->

# User agent plugins — envelope, agent verb, harness.json

**Phase** (bookkeeping while in DESIGN): plan authored — awaiting human review
**Size:** medium

*Source: `research/04-user-agent-plugins.md` (2026-07-02) — tracked in this repo;
distilled here so the build stands alone, pointer retained under ## Source.*

## Frame

- **Problem:** D3 already makes the executor pluggable and author-blind — "another
  harness" is a legal author of any step's diff — but there is no doorway: no
  contract a user-authored agent can speak, no place for agents to live, no way to
  *plan* agent involvement per-step, and no invocation mechanics. Users who build
  agents (fascicle or otherwise) must wire them in by hand, ad hoc, per project.
  The seam is half-built: `check.ts` already spawns an arbitrary user command and
  trusts only its exit code; checkride already ships the stream discipline
  (stdout = machine JSON, stderr = human prose). What's missing is the envelope,
  the homes, the plan artifact, and one verb.
- **Smallest thing that solves it:** a versioned JSON-in-stdin / JSON-out-stdout /
  prose-on-stderr subprocess contract; agent definitions in `.plumbbob/agents/<name>/`
  (tracked) and `~/.plumbbob/agents/<name>/` (personal); planned per-step bindings in
  `builds/<slug>/harness.json` with exactly three slots (`before`/`build`/`after`);
  one deterministic verb `plumbbob agent run <name> [--step N]` (+ `agent list`)
  that composes the input, spawns, validates the output envelope, and applies side
  effects through existing verbs. Skills interpret the judgment half as prose.
- **Done looks like:** a fixture agent (a bash script speaking the envelope) can be
  dropped in `.plumbbob/agents/`, listed by `agent list`, bound in a build's
  `harness.json`, and run via `agent run` — with stderr streaming to the terminal,
  `parked[]` landing through the park verb, non-zero exit reported and stopped on,
  and a contract-mismatch refused with a hint — all proven by subprocess tests in
  throwaway repos; the pb-plan/pb-build/pb-verify/pb-step skills know the three
  slots; `docs/agents.md` defines the contract for authors; `pnpm run check` green.
- **Explicitly NOT doing:** any envelope verb that advances the loop (no checkpoint,
  no step flip, no agent chaining — that boundary is the product identity); control
  flow in config (no `if`/`retry`/`loop` in harness.json, ever); a gate — `after`
  output is advisory, checkride gates, the human advances; fascicle inside plumbbob
  (declined in research/02; fascicle-built agents visit via the subprocess boundary
  without moving in); provider keys or model choice (the agent's env, never
  plumbbob's); a marketplace/registry; version bump or release.

## Architecture sketch

```
                       .plumbbob/agents/<name>/            ~/.plumbbob/agents/<name>/
                         agent.json  (manifest)              (personal library,
                         run.sh|main.ts|anything              same shape)
                              ▲
   resolution: --agent flag → project agents/ → personal agents/   (the settings ladder's shape)

  builds/<slug>/harness.json          plumbbob agent run <name> [--step N]
  {                                        │
    "contract": 1,                         │ composes StepContext from files the CLI
    "defaults": { "after": [...] },        │ already reads (intent.md, settings, harness)
    "steps": {                             ▼
      "3": { "before": [...],         stdin:  { contract, mode, build, step,
              "note": "prose" },               decisions[], constraints[], context[], settings }
      "5": { "build": "..." } }       child:  stderr ──► terminal (human watches; SIGINT forwarded)
  }                                   stdout: { contract, status: done|blocked|drift,
                                               summary, body, parked[], notes }   ◄── nothing else, ever
                                           │
                                           ▼
                             CLI applies side effects (parked[] → park verb);
                             NO path to checkpoint / step flip / chaining.

  slots (the only lifecycle points):  before → context in   build → the diff   after → advisory at the pause
  judgment (when/why mid-build)    :  prose — manifest "when", harness "note" — read by the host model
  gate                             :  plumbbob check (checkride)   clock: the human (--auto by name only)
```

## Decisions

- D1: one versioned JSON-stdin/JSON-stdout/prose-stderr envelope; an agent is
  anything executable that speaks it — *because* runtime-agnosticism is the doorway
  (Terraform `external` has run this exact contract in production since 2017, and
  checkride's stream discipline is already house style).
- D2: one verb, `plumbbob agent run`, deterministic mechanics only, with **no way to
  advance the loop** — no checkpoint, no step flip, no chaining — *because* the
  subprocess boundary then enforces human-as-clock *by construction*, not by policy
  (ridgeline advances itself; plumbbob's user is the clock).
- D3: agents live in `.plumbbob/agents/<name>/` (tracked, rides the PR) then
  `~/.plumbbob/agents/<name>/` (personal), resolved flag → project → personal —
  *because* it's the settings ladder's proven shape (restructure D7) and Claude
  Code's `.claude/agents/` two-level convention users already live in.
- D4: planned bindings live in `builds/<slug>/harness.json`, a sibling of
  `intent.md` authored at `/pb-plan` time — not in `intent.md`, not in a
  `state.json` — *because* the intent is executor-agnostic by doctrine (D3: the
  plan must not care how the diff appears) and bindings are plan-adjacent
  configuration; one-folder self-containment holds (intent = what/why, harness =
  with-what, build-log = what happened). Name ratified 2026-07-02: it reads as
  hook registrations against lifecycle points.
- D5: exactly three slots — `before` (context in), `build` (the diff), `after`
  (advisory review) — and no fourth — *because* no declarative format can name "a
  salient point in the middle"; that's judgment, and plumbbob always has a frontier
  model in the room reading prose. Prose is the orchestration language; the host
  model is the workflow engine; config never grows control flow (GitHub Actions is
  the cautionary tale).
- D6: side effects are applied by the CLI, never the agent — `parked[]` goes
  through the park verb; an agent writing `.plumbbob/` directly is out of
  contract — *because* the sidecar keeps a single writer.
- D7: `after` output is advisory input at the verify pause; `plumbbob check`
  (checkride) gates; the human advances — *because* an after-agent that can fail a
  step is the lock returning in autonomy's costume.
- D8: stderr passes through to the terminal; stdout carries the envelope only;
  exit 0 = envelope authoritative, non-zero = failed run (report and stop);
  contract major-version mismatch = refuse with a hint — *because* production
  (agent narrating) must never collide with consumption (one structured result at
  the pause) — the attention-first move.
- D9: keys, model choice, and sandboxing are the agent's business (its env, its
  config) — *because* the standing host-only decision holds; plumbbob never
  touches a provider key.
- D10: a missing agent (teammate without your personal library) downgrades the
  binding to a warning; the loop works without it — *because* it's the same
  optionality contract as `/pb-build` itself.
- D11: manifest `description`/`when` are prose for the host model (like a subagent
  frontmatter description); `command` is for the deterministic CLI — *because*
  each half of when/how feeds the layer that can actually use it.
- D12: `--auto` composes with zero new machinery: before-agents → implement →
  after-agents → check → self-review → checkpoint-if-clean → next; after-output
  feeds the *existing* self-review halt condition — *because* the default path
  (everything lands at the pause) must stay unchanged.
- D13: project-wide defaults (e.g. "always run my reviewer") live in
  `settings.json`/`settings.local.json`; per-build bindings in the build's
  harness file; the flag overrides both — *because* that's the existing ladder,
  down to the tier.
- D14: SIGINT is forwarded to the child — *because* the human is present and
  Ctrl-C must kill the agent, not orphan it.
- D15: before-slot outputs travel inline as `context[]` in the input JSON —
  *because* inline is the simplest thing until size proves otherwise (research Q2;
  revisit only on evidence).
- D16: nested invocation is allowed — an agent may shell `plumbbob agent run` to
  compose other agents (e.g. a build/review loop with a cutoff), no env guard —
  *because* loops belong as code inside agents, cutoffs are the author's job, and
  the identity invariant (the envelope has no verb to advance plumbbob's loop)
  holds at every nesting depth; documented warning, not enforcement.
- D17: timeouts exist but are off by default — an `agentTimeout` (seconds) key in
  the settings ladder; absent/0 = no timeout, set = kill the child and report a
  failed run — *because* the human is present by default (Ctrl-C works), and
  enforcement should be the user's explicit opt-in, not plumbbob's guess.
- D18: POSIX only (*nix/macOS) — the manifest `command` is a string run through
  `sh -c` with the agent's directory as cwd — *because* Rob doesn't care about
  Windows support, and a shell string keeps `agent.json` one line, not an argv
  array.
- D19: `agent list` stays a dedicated subcommand, but `doctor` validates every
  defined agent (manifest well-formed, command exists and is executable, contract
  version supported) and `status` reports the active build's bound agents —
  *because* the user won't run the dedicated command regularly, so the surfaces
  they already check must carry the report; doctor-as-validator also answers
  where authors check compliance (with `docs/agents.md` holding the schema), so
  no separate `agent check` verb.

## Constraints

- C1: functional/procedural, node builtins only, zero runtime deps (repo C1/C2) —
  the verb spawns like `check.ts` does; whatever the child imports is invisible.
- C2: the envelope has no verb for advancing the loop — no key, flag, or side
  effect may checkpoint, flip a step, or trigger another agent (identity
  invariant; the litmus for every future field).
- C3: harness.json stays bindings + prose notes — the moment it grows a
  conditional, this build has failed its own spec.
- C4: review is advisory, gates are checkride's, the human is the clock — no code
  path may make an `after` agent blocking.
- C5: every spawning/git-touching change gets a subprocess test in a throwaway
  repo (repo D14); fixture agents are plain bash scripts.
- C6: keep the envelope minimal — resist field sprawl (SWE-agent's ACI lesson);
  additions are minor-version, removals/renames are major.
- C7: no version/CHANGELOG bump in this build (Rob cuts releases via `/version`).

## Steps

1. [ ] Envelope + manifest module — **done when:** `src/lib/agents.ts` defines the
   contract-1 types, validates `agent.json` (name, slots ⊆ {before,build,after},
   command, contract) and the output envelope (status ∈ {done,blocked,drift},
   summary; unknown fields tolerated), and refuses a contract major-version
   mismatch with a hint; unit tests cover valid/invalid manifests, valid/invalid
   envelopes, and the mismatch refusal
   - seam: `src/lib/agents.ts`, `src/lib/__tests__/agents.test.ts`
2. [ ] Resolver + `plumbbob agent list` — **done when:** resolution walks
   `--agent <path>` → `.plumbbob/agents/<name>/` → `~/.plumbbob/agents/<name>/`
   (first hit wins); `agent list` prints name, origin tier, slots, and description
   for every resolvable agent; tests cover project-shadows-personal and an
   HOME-overridden personal library
   - seam: `src/lib/agents.ts`, `src/verbs/agent.ts`, `src/cli-core.ts`, `src/lib/__tests__/agents.test.ts`, `src/__tests__/cli-core.test.ts`
3. [ ] StepContext composition — **done when:** the input JSON (contract, mode,
   build slug/title, step n/title/doneWhen/seam, decisions[], constraints[],
   context[], settings) is composed deterministically from `intent.md` + settings;
   `intent.ts` gains the decisions/constraints/title/done-when parse it doesn't
   have today; unit tests assert the composed JSON for a fixture build
   - seam: `src/lib/agents.ts`, `src/lib/intent.ts`, `src/lib/__tests__/agents.test.ts`, `src/lib/__tests__/intent.test.ts`
4. [ ] `plumbbob agent run <name> [--step N] [--mode before|build|after]` —
   **done when:** the verb composes the input, spawns the manifest command via
   `sh -c` with the agent dir as cwd (D18) and JSON on stdin, inherits stderr,
   forwards SIGINT, honors an opt-in `agentTimeout` settings key (absent/0 = no
   timeout; on expiry kill the child and report a failed run, D17), parses stdout
   as the envelope, applies `parked[]` via the park verb, and honors exit-code
   semantics — with no code path to checkpoint or step state; subprocess tests
   with bash fixture agents cover done/blocked/drift, non-zero exit (report and
   stop), garbage stdout (out of contract), timeout kill, and park lines landing
   in the build folder
   - seam: `src/verbs/agent.ts`, `src/lib/agents.ts`, `src/lib/settings.ts`, `src/verbs/__tests__/agent.test.ts`
5. [ ] `harness.json` bindings — **done when:** the CLI reads
   `builds/<slug>/harness.json` (contract, `defaults`, per-step slots + `note`),
   merges settings-level defaults under it and the `--agent` flag over it, and
   downgrades a missing agent to a warning (D10); `agent run --step N` with no
   name resolves the bound agent for the mode; tests cover per-step override of
   defaults, absent harness file (clean no-op), and the missing-agent warning
   - seam: `src/lib/agents.ts`, `src/verbs/agent.ts`, `src/verbs/__tests__/agent.test.ts`
6. [ ] Doctor validates agents; status reports bindings — **done when:** `doctor`
   walks every resolvable agent (project + personal) and flags a malformed
   `agent.json`, a missing/non-executable command, or an unsupported contract
   version (D19); `status` on an active build lists its harness bindings and
   warns on ones that don't resolve; tests cover a broken fixture agent in each
   failure mode
   - seam: `src/verbs/doctor.ts`, `src/verbs/status.ts`, `src/lib/agents.ts`, `src/verbs/__tests__/doctor.test.ts`, `src/verbs/__tests__/status.test.ts`
7. [ ] Skills learn the slots — **done when:** pb-plan offers harness.json
   authoring at plan time (bindings reviewed at the plan pause, alongside the
   steps); pb-step revises a step's bindings just-in-time; pb-build runs
   before-agents into `context[]`, delegates to a build-slot agent when bound, and
   documents the `--auto` beat (D12); pb-verify presents after-agent output as
   advisory input at the pause; manifest `when` prose is documented as the host
   model's cue to fire `agent run` mid-build; `docs/skills-reference.md` updated
   - seam: `skills/pb-plan/SKILL.md`, `skills/pb-step/SKILL.md`, `skills/pb-build/SKILL.md`, `skills/pb-verify/SKILL.md`, `docs/skills-reference.md`
8. [ ] Docs, example, decision log — **done when:** `docs/agents.md` defines the
   full contract for agent authors (envelope schema, manifest, harness.json, the
   three invariants, the fascicle trajectory-to-stderr trap, and the
   nested-invocation warning: composing agents from an agent is allowed, cutoffs
   are yours, D16); `docs/cli-reference.md` gains `agent run|list` +
   `agentTimeout`; `docs/decisions.md` records the new decisions; README points
   at the doorway; a minimal working example agent ships under `examples/`;
   `pnpm run check` green
   - seam: `docs/agents.md`, `docs/cli-reference.md`, `docs/decisions.md`, `README.md`, `examples/`

## Open questions

*(none — Q1–Q5 resolved 2026-07-03, see Verdicts.)*

## Verdicts

- 2026-07-02 — research Q1 (file name: `harness.json` vs `agents.json` vs a
  section of a plan artifact) → chose **`harness.json`** because it reads as hook
  registrations against the beat's lifecycle points ("effectively `hooks.json`
  with lifecycle labels") → D4.
- 2026-07-03 — Q1 (recursion) → clarified: recursion = an agent shelling
  `plumbbob agent run` (composing other agents), NOT loops inside an agent (those
  are just code and were never in question). Chose **allow, no env guard** —
  build/review loops with cutoffs are a legitimate composition; the
  no-loop-advance invariant holds at every depth → D16.
- 2026-07-03 — Q2 (timeouts) → chose **build it, off by default**: `agentTimeout`
  settings key, absent/0 = none, user opts into enforcement → D17.
- 2026-07-03 — Q3 (Windows) → chose **POSIX only**; `command` is a shell string
  via `sh -c`, no argv array → D18.
- 2026-07-03 — Q4 (author validation) → chose **doctor validates defined agents**
  (manifest, executable, contract) on top of `docs/agents.md` prose; no separate
  `agent check` verb → D19, new step 6.
- 2026-07-03 — Q5 (list placement) → chose **dedicated subcommand + tie into
  status/doctor** so the surfaces the user already checks carry the report → D19,
  step 6.

## Source

Distilled from `research/04-user-agent-plugins.md` (2026-07-02, tracked in this
repo), which carries the full prior-art survey (subprocess-contract lineage,
orchestration cautionary tales, SWE-agent/AlphaCodium/HULA) and the comparison
table. Companions: `research/02-model-agnostic-standalone.md` (fascicle inside
plumbbob — declined), `research/03-reasoning-seam-and-fascicle-plan.md`.
Fascicle-side stdio fixes are proposed separately in fascicle's
`research/explorations/2026-07-stdio-agent-contract.md`.
