# Report — reviewer: switchable-provider advisory review agent

**Status:** done · 4/4 steps · size small–medium
**Timeline:** see `build-log.md` § Log (2026-07-13, ~51m across four steps)

## What shipped

One maintained example agent, `examples/agents/reviewer/`, whose **model provider is a
config choice** — `claude_cli` by default (it piggybacks the logged-in Claude session; no
API key, no local model to pull), or `ollama` for local, private compute. The provider,
model, and per-provider details resolve by precedence — the settings ladder first, an env
var under it, a code default as the floor — and the switch itself is a `PROVIDERS` map of
descriptors, so adding a provider is one more entry.

The one supporting change in plumbbob proper is a **single line** in `runOne` (`src/verbs/
agent.ts`): it composes `agent: resolveRecord(root, 'agentConfig')[spec.name] ?? {}` into
the StepContext's existing `settings` field, handing each agent its own config block over
the frozen contract-1 envelope — no new verb, no new envelope field.

The prior `ollama-reviewer` is **kept frozen** as the single-provider / AI-SDK reference, and
the docs frame the two side by side. Shipped surface:

- `examples/agents/reviewer/` — `agent.json`, `package.json` (`fascicle ^0.9.5` + `zod`
  only), `review.mjs` (the provider switch, per-provider preflight, native + external
  fascicle composition), `demo/stepcontext.json`, `.gitignore`, and a `README.md` carrying
  the full provider matrix.
- `src/verbs/agent.ts` — the one settings-forward line; `src/verbs/__tests__/agent.test.ts`
  — the verb-level assertions that `ctx.settings.agent` carries `agentConfig[name]`, that
  `settings.local.json` overrides it, and that it is `{}` when neither defines it.
- `examples/agents/README.md`, `docs/agents.md`, `docs/local-model-review.md` — the
  two-agent comparison and the switchable-provider references.

## Decisions and why

- **`claude_cli` is the default (D3).** PlumbBob is mostly a Claude plugin, so the most
  valuable second opinion is the one that costs no extra key and no local GPU — it rides the
  session you're already in (`auth_mode: oauth`).
- **Config home = the settings ladder, forwarded over the frozen envelope (D5/D6).**
  Provider/model is an environment/personal property (varies by machine and person, constant
  across builds); the tracked `settings.json` + untracked `settings.local.json` split models
  exactly that. It travels the existing `settings` pass-through field — one CLI line, no new
  field, no new verb, no `harness.json` growth (that stays bindings + prose).
- **Native transport, no AI-SDK peers (D8).** `claude_cli` (external kind) gets real
  `--json-schema` constrained decode regardless; the reviewer's 3-field schema rides
  fascicle's prompt+parse+repair loop fine on ollama-native. Dropping `ai` + `ai-sdk-ollama`
  keeps the package to `fascicle` + `zod`. Reversible: flip ollama → `transport: 'ai_sdk'`
  only if local structured output proves flaky.
- **Build targets `fascicle >= 0.9.5` (D1).** The `claude_cli` default depends on the
  one-line `$schema`/`$id` strip in fascicle's `compile_schema` (the `claude --json-schema`
  URI-rejection fix), applied and published in a separate fascicle session, verified `latest`
  before ship.
- **`ollama-reviewer` kept frozen, `reviewer` a new sibling (D2).** The two designs are
  worth holding side by side — single-provider / AI-SDK vs switchable / native — rather than
  collapsing one into a rename.

## Parked & harvested

None. Zero items were parked across the four steps; no harvest was needed.

## Deferred tangents / future work

- **pb-build slimming (research/07 §3b)** — explicitly out of scope for this build; it rode
  with the old env-var scope and is deferred to its own build.
- **ollama → `ai_sdk` transport** — held in reserve behind D8; only worth adding the AI-SDK
  peers back (as lazy/optional deps) if native structured output on small models proves
  flaky in practice.
- **No `harness.json` for this build, by design** — the reviewer is the product here; it is
  bound and exercised in *other* builds, and binding it to its own steps would be circular.

## Notes for release

- Step 1 recorded one drift warning (per `stats.json`); it was resolved and the step landed
  cleanly at checkpoint.
- Before `/version`: confirm `fascicle` `^0.9.5` is still npm `latest` — the `claude_cli`
  default depends on the `$schema`/`$id` strip that shipped in it (D1).

## Checkpoints

- baseline bbee3fa54a79e649d127d530d5f7b1b9927660b4
- plan 26614dd73fd629ca1865958977b19ecfdc12002d
- step 1 d2213f59963455c1cd8d8368551e8ea069cca935
- step 2 95b7e6265be1c083a73c04f23ed3dcd10344e812
- step 3 8abb98bd6e724d4cb7273d9c6d29a7519decf778
- step 4 511ef6ef7d31b38817df6497b6e454f31a16c663

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
|------|------------|----------------|---------|------------|
| 1 | 0 | 1 | 0 | 13m |
| 2 | 0 | 0 | 0 | 10m |
| 3 | 0 | 0 | 0 | 20m |
| 4 | 0 | 0 | 0 | 8m |
| **total** | 0 | 1 | 0 | 51m |
