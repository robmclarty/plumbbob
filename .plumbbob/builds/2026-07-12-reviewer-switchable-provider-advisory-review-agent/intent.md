# reviewer: switchable-provider advisory review agent

**Phase:** plan — review pending
**Size:** small–medium

## Frame

- **Problem:** The one shipped user-authored agent, `ollama-reviewer`, is hard-wired
  to a local Ollama model configured by env vars only. PlumbBob is mostly a *Claude*
  plugin, so the most valuable second opinion — the one that costs no API key and no
  local GPU — is a `claude_cli` review that piggybacks the already-logged-in Claude
  session. We want one maintained reviewer whose model provider is **switchable**
  (claude_cli by default, ollama for local/private compute), configured the way every
  other environment property is configured: through the settings ladder, not env-only.
- **Smallest thing that solves it:** Evolve `ollama-reviewer` into a generalized
  `reviewer` agent with a provider switch, and make exactly **one** CLI change — hand
  each agent its own config block through the *existing, frozen* envelope `settings`
  field. No new verb, no new envelope field, no fascicle in `src/`.
- **Done looks like:** `plumbbob agent run reviewer --step N` gives an advisory review
  of the step's diff at the verify pause; with no config it uses `claude_cli` (oauth,
  sonnet); `settings.json → agentConfig.reviewer` or an untracked `settings.local.json`
  override switches provider/model without touching the agent code; every
  ollama-reviewer behavior (in-agent diff, per-provider preflight → actionable
  `blocked`, advisory `done`-always, stderr trajectory) survives; `pnpm check` green.
- **Explicitly NOT doing:** No new user-facing verb. No envelope change (contract-1 is
  frozen). No provider key in plumbbob (keys stay in env; claude_cli/ollama need none).
  No AI-SDK peer deps (native transport floor). **No pb-build slimming** (research/07
  §3b) — that rode with the old scope and is deferred to its own build. No harness.json
  for *this* build (the reviewer is the product here; it is bound and exercised in
  *other* builds, and would be circular to bind to its own steps).

## Architecture sketch

```
settings.json        ─┐  tracked:   agentConfig.reviewer = { provider: "claude_cli", model: "sonnet" }
settings.local.json  ─┤  untracked: agentConfig.reviewer = { provider: "ollama", model: "qwen3:8b" }
env PB_REVIEWER_*    ─┘  ephemeral override, under settings
                        │
              resolveRecord(root,'agentConfig')[spec.name] ?? {}   ← THE ONE CLI LINE (runOne)
                        ▼
   runOne composes StepContext.settings = { auto, agentTimeout, agent: {…} }
                        │   contract-1 envelope `settings` field — FROZEN, no new field
                        ▼  stdin JSON
   examples/agents/reviewer/review.mjs   (standalone pkg: fascicle ^0.9.5 + zod only)
     provider = ctx.settings.agent?.provider ?? process.env.PB_REVIEWER_PROVIDER ?? 'claude_cli'
        ├── claude_cli  (external kind, auth_mode 'oauth', real --json-schema)  ← DEFAULT · needs fascicle ≥ 0.9.5
        └── ollama      (transport 'native', prompt+parse+repair loop)
     diff(step.seam, 40KB cap) → model_call(reviewSchema) → envelope
        done-always (advisory) · now → body · later → parked[]     │ stderr: live trajectory
                        ▼  stdout: one JSON envelope
   plumbbob lands parked[] via the park verb · review advises · checkride gates · human advances
```

## Decisions

- D1: Build targets **`fascicle >= 0.9.5`** — *because* claude_cli + a zod `schema` is
  broken on 0.9.4 (`claude --json-schema` rejects the `$schema: .../draft/2020-12` URI
  that `z.toJSONSchema()` stamps); the default provider depends on the one-line fix
  (`const { $schema, $id, ...json } = z.toJSONSchema(schema)` in the claude_cli
  adapter's `compile_schema`), proven end-to-end. *(Sequencing of that release is Q1.)*
- D2: Agent named **`reviewer`**, a **new sibling package** seeded from
  `examples/agents/ollama-reviewer/`'s structure; **`ollama-reviewer` kept frozen** as
  an alternative approach to compare — *because* the two designs are worth holding side
  by side: ollama-reviewer is the single-provider / AI-SDK-constrained-decode shape,
  `reviewer` is the switchable / native-transport shape. (Resolved Q2 — see Verdicts.)
- D3: **Default provider `claude_cli`** (`auth_mode: 'oauth'`, model default `sonnet`)
  — *because* plumbbob is mostly a Claude plugin; it piggybacks the logged-in Claude
  session, no API key, no local model to pull.
- D4: **Read precedence** `ctx.settings.agent?.provider ?? process.env.PB_REVIEWER_PROVIDER ?? 'claude_cli'`
  (same shape for `.model`, and `.baseUrl` on ollama, falling back to
  `OLLAMA_HOST`/`OLLAMA_BASE_URL`) — *because* settings is the durable home, env is an
  ephemeral override *under* it, and the code default is the floor.
- D5: **Config home = plumbbob settings**, forwarded through the existing envelope
  `settings` field — *because* provider/model is an environment/personal property
  (varies by machine and person, constant across builds); the settings ladder plus the
  untracked `settings.local.json` models exactly that. Not harness.json (that stays
  bindings + prose by research/04's litmus test — "which agent, where", not "with what
  model"); not env-as-primary.
- D6: **Exactly one plumbbob-CLI change** — add `agent: resolveRecord(root,'agentConfig')[spec.name] ?? {}`
  to runOne's composed `settings` (`resolveRecord` is already imported) — *because* it
  hands each agent its own config block over the frozen contract-1 field, no new field
  and no new verb. This consciously crosses research/07's self-imposed "no CLI change"
  scope for Build 3 — that scope was a consequence of the old env-var design, not
  doctrine.
- D7: **Settings shape** `{ "agentConfig": { "reviewer": { "provider": …, "model": … } } }`,
  keyed by agent name, tracked default in `settings.json`, personal override in
  `settings.local.json` — *because* keying by name lets every future agent share the
  one mechanism, and the tracked/untracked split is the ladder doing its job. Note the
  ladder semantic: `resolveRecord` returns the *first defined* `agentConfig` rung whole
  (local shadows project entirely, no deep merge) — consistent with today's `agents`
  slot-defaults; the agent's per-field `?? default` softens a partial override.
- D8: **Transport native, no AI-SDK peers**; package deps = `fascicle ^0.9.5` + `zod`
  only (drop `ai` + `ai-sdk-ollama`) — *because* claude_cli (external kind) gets real
  `--json-schema` constrained decode regardless of this axis, and the reviewer's simple
  3-field schema rides fascicle's prompt+parse+repair loop fine on ollama-native. The
  AI-SDK peers would buy only constrained-decode-on-small-models, google/bedrock, and
  vision — none on this critical path. Reversible: flip ollama → `transport: 'ai_sdk'`
  (add `ai` + `ai-sdk-ollama` as lazy/optional deps via the existing `loadDeps`
  degradation) only if local structured output proves flaky.
- D9: **Advisory, `done`-always**; a completed review is `done` even with concerns
  (`now` severity → `body` for the human at the pause, `later` → `parked[]`); `blocked`
  is reserved for obstacles (missing `claude` binary, Ollama unreachable, model not
  pulled, deps missing) via per-provider preflight — *because* review informs and never
  gates (checkride is the gate), and obstacles feed the D52 fix-and-re-run loop.

## Constraints

- C1: No new user-facing verb — the whole feature rides `agent run` and the settings
  ladder.
- C2: The agent envelope is **contract-1 and FROZEN** — no new fields; config travels
  in the existing `settings` pass-through field only.
- C3: plumbbob **never holds a provider key** — keys stay in the environment;
  claude_cli and ollama need none (D53).
- C4: Config **never encodes control flow** — settings carry provider/model strings
  only; no slots, no conditionals. harness.json stays bindings + prose.
- C5: The agent **never writes `.plumbbob/`** — parked lines return through the
  envelope; the CLI lands them via the park verb (D44).
- C6: **Checkride remains the gate; review is advisory only** (C6/identity invariant) —
  an `after` agent can never fail a step.
- C7: The reviewer is a **standalone package, never a workspace member** — its own
  `node_modules`, its own runtime floor (Node >= 24, fascicle's floor); no dependency
  on plumbbob itself, it speaks pure envelope.
- C8: **fascicle stays out of `src/`** — the one CLI change is a settings-forward line
  with no fascicle import; fascicle lives only in the example agent (research/07's
  standing constraint).

## Steps

**Prerequisite (out of this repo's tree, gated Step 2 — CLEARED 2026-07-13):** the
one-line `$schema`/`$id` strip in fascicle's `claude_cli` adapter `compile_schema` was
applied and **fascicle 0.9.5 is published** (npm `latest`, verified). Step 2 is
unblocked; the reviewer package pins `fascicle ^0.9.5`.

1. [x] Create the `reviewer` sibling package (seeded from `ollama-reviewer`): the provider switch + the ollama path — **done when:** `PB_REVIEWER_PROVIDER=ollama node review.mjs < demo/stepcontext.json` returns a valid `done` envelope when Ollama is up (or an actionable `blocked` when it is not), and an import check confirms deps resolve to `fascicle` + `zod` only
   - seam: `examples/agents/reviewer/agent.json`, `examples/agents/reviewer/package.json`, `examples/agents/reviewer/review.mjs`, `examples/agents/reviewer/.gitignore`, `examples/agents/reviewer/demo/stepcontext.json`
   - model: opus — the provider-abstraction shape (read precedence, per-provider preflight, native fascicle composition) is the design core of the build
2. [x] The `claude_cli` default provider (fascicle ≥ 0.9.5) — **done when:** with no `PB_REVIEWER_PROVIDER` and no `settings.agent`, `node review.mjs < demo/stepcontext.json` drives claude_cli through the logged-in session and returns a valid structured review in one shot; with `claude` absent from PATH it returns an actionable `blocked`
   - seam: `examples/agents/reviewer/review.mjs`, `examples/agents/reviewer/package.json`
   - model: opus — external-provider wiring + the 0.9.5 `--json-schema` interaction is the subtle part
3. [x] The one plumbbob-CLI change: forward each agent's own config block — **done when:** runOne composes `agent: resolveRecord(root,'agentConfig')[spec.name] ?? {}` into `settings`, a verb-level test asserts `ctx.settings.agent` carries `settings.json → agentConfig[name]`, that `settings.local.json` overrides it, and that it is `{}` when neither defines it, and `pnpm check` is green (existing agent tests included)
   - seam: `src/verbs/agent.ts`, `src/verbs/__tests__/agent.test.ts`
   - model: sonnet — a one-line addition plus a focused test, fully specified by the done-when
4. [ ] Docs + provider matrix (`ollama-reviewer` stays) — **done when:** the reviewer README carries a provider matrix (provider → settings/env keys → auth → cost/privacy), `examples/agents/README.md` lists both agents with the comparison framing (ollama-reviewer = single-provider / AI-SDK; reviewer = switchable / native), `docs/local-model-review.md` and `docs/agents.md` reference `reviewer` for the switchable story while ollama-reviewer's own mentions stay valid, and `pnpm check` passes its docs + links slots
   - seam: `examples/agents/reviewer/README.md`, `examples/agents/README.md`, `docs/local-model-review.md`, `docs/agents.md`
   - model: sonnet — mechanical doc edits; the provider matrix + the two-agent comparison framing want a little care

## Open questions

*(None open — Q1/Q2 resolved at the plan pause; see Verdicts.)*

## Verdicts

- 2026-07-12 — fascicle 0.9.5 sequencing → **release-first** (build against `^0.9.5`);
  the one-line fix is applied and released in a separate fascicle session, so the
  claude_cli default is live at ship. Rejected the ollama-only-now interim.
- 2026-07-12 — ollama-reviewer disposition → **keep it frozen** as an alternative to
  compare; `reviewer` ships as a new sibling package (D2), not a rename. Rejected
  retiring it.
