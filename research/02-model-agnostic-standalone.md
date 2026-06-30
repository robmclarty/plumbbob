# PlumbBob distribution — Analysis 2: the model-agnostic standalone path

> Question: the flip-side of [Analysis 1](./01-claude-native-distribution.md). Keep
> plumbbob **model-agnostic** — Claude conveniences allowed, but not *required* to
> use it. What does plumbbob look like as a completely standalone CLI that uses
> **fascicle** + a config file to make its own model calls, with thin custom
> integrations for Claude / Codex / Cursor skills (to start), targeting use *in
> conjunction with* the main agentic tools (Claude Code, Codex, Cursor, VS Code,
> Zed)? Recommendation by adversarial eval.
>
> Date: 2026-06-25.

## The reframe (vs. Analysis 1)

Analysis 1 treats plumbbob as a *Claude Code extension* — its reasoning is done by
whatever model drives the skills; the CLI is deterministic glue (git, state,
dashboards). This analysis treats plumbbob as a **standalone reasoning tool that
owns its own model calls** via fascicle, and treats every agentic tool — Claude
Code, Codex, Cursor, VS Code, Zed — as a *pluggable front-end*, not a dependency.

The two are **not either/or.** This architecture is a **superset**: the Claude
integration here *is* the plugin from Analysis 1, with its skills shelling out to
the standalone `plumbbob` CLI. The real question is how much to invest in
model-agnosticism now vs. later.

## What fascicle gives plumbbob

Fascicle (Rob's own package, v0.8.x) is a TypeScript agent-composition toolkit:
`Step<i,o>` primitives + one `create_engine` surface over **8 providers**
(Anthropic, OpenAI, Google, OpenRouter, Bedrock, Ollama, LM Studio, and a
`claude_cli` subprocess adapter). Its primitives map to plumbbob's design
*startlingly* well:

| PlumbBob concept | Fascicle primitive |
|---|---|
| `/pb-verify` **pause you advance** (the human tick) | **`suspend`** — "pause for external input; resume later with `resume_data`" |
| `/pb-refine` **attack the frame for holes** | **`adversarial`** — build, critique, repeat until accept or `max_rounds` |
| multi-judge verify / pick the best plan | **`consensus` / `ensemble` / `tournament`** |
| checkpoints | **`checkpoint`** (memoize by key in a store) |
| model-agnostic calls from a config | **`create_engine({ providers })`** + per-provider effort translation |

That alignment isn't cosmetic — fascicle's `suspend` *is* plumbbob's "clock, not a
lock." If plumbbob is ever going to make its own model calls, fascicle is the
natural engine, and the design philosophy survives the move intact.

## The labor split — the load-bearing decision

The danger in "standalone, makes its own calls" is scope explosion: plumbbob
reinventing a full agentic coding harness (tool-calling loop that edits files, runs
commands, iterates) — i.e., rebuilding Claude Code/Codex, worse. **Hold this line:**

| Layer | Owner | Why |
|---|---|---|
| **Mechanics** — scaffold, checkpoint, park, revert, status render, git | plumbbob CLI (deterministic, no model) | already built; no reason to change |
| **Reasoning / divergence** — author intent, plan steps, sharpen step, attack frame (refine), harvest triage, verify self-review | plumbbob CLI **via fascicle** | text-in/text-out; model-agnostic; fascicle's sweet spot |
| **Execution / the hands** — implement a step, edit files, run commands | **the host agentic tool** (in-conjunction mode) | mature harnesses already do this; don't compete |
| **Convergence** — decide, approve, advance | **the human** | unchanged; the whole point |

This keeps plumbbob's law — *"the LLM is a hand, not a head"* — but sharpens it:
plumbbob's own fascicle calls are **deciding-support divergence** (generate options,
find holes), the host tool is the **hand** (execution), and the human stays the
**convergence decider** at the `suspend` pause. `/pb-build` (implement a step) stays
delegated to the host in the primary use-case; a fascicle tool-loop for standalone
execution is an *optional, advanced* mode (CI/headless/local-model), explicitly not
the headline.

## The integration layer — what the research says

I researched the live extension surfaces of all five targets. Two substrates matter:

### 1. Agent Skills (`SKILL.md`) — the human-invocable, converging standard

As of early/mid-2026 a shared **Agent Skills** standard has landed in **all five
tools**, and four of them (Codex, Cursor, VS Code, Zed) read the shared
**`.agents/skills/`** path; several also cross-read `.claude/skills/`. Crucially,
**`disable-model-invocation: true`** (Claude, Codex, Cursor, Zed — 4 of 5) makes a
skill **fire only when the human types `/` or `@`** — the model is *forbidden* to
auto-trigger it. **That is plumbbob's "human is the clock" law expressed natively.**

So the action surface = **one `SKILL.md` per verb**, authored once under
`.agents/skills/pb-*/`, mirrored to `.claude/skills/` for Claude Code, every one
`disable-model-invocation: true`, each body = "run `plumbbob <verb>`."

### 2. MCP — the universal substrate, but it inverts the control flow

**All five support MCP** (local stdio included) — the only mechanism that is
*everywhere*. Fascicle even ships `serve_flow` to expose a composed flow as an MCP
tool. **But MCP tools are model-invoked** — the model decides when to call them.
That is the *opposite* of plumbbob's contract (the human initiates each step). An MCP
tool can be approval-gated, but the human is then *approving*, not *initiating*.

**Resolution:** use MCP for the **read side only** — `plumbbob status` / context the
model may pull anytime — and keep every **action/transition** on human-invoked,
model-invocation-disabled skills. Never expose `verify`/`checkpoint`/`build` as a
bare MCP tool, or the clock becomes a thing the model can wind.

### 3. The deterministic-execution gap (the asterisk on "cross-tool")

Only **Claude Code can *deterministically* run the CLI** from a skill — its
`` !`plumbbob …` `` pre-render injection runs the command *before* the model sees the
skill. On **Codex, Cursor, VS Code, Zed**, the skill body instructs the agent to run
`plumbbob <verb>` via its terminal tool **under approval** — "soft" execution: the
human triggers the skill, but you're trusting the agent to actually run the verb.
Verbs are idempotent and the skill is explicit, so this is workable — but the
human-as-clock *guarantee* is firm only on Claude Code; elsewhere it's a strong
convention, not a lock.

### 4. Instruction file

**`AGENTS.md`** is read by 4 of 5 natively (VS Code behind `chat.useAgentsMdFile`,
off by default), and Claude Code consumes it via a one-line `@AGENTS.md` import or a
symlink from `CLAUDE.md`. Author the loop docs once in `AGENTS.md` + a `CLAUDE.md`
shim.

## Proposed architecture

```text
                    ┌─────────────────────────────────────────────┐
                    │  plumbbob CLI  (standalone, model-agnostic)  │
   config ────────▶ │  • mechanics: git/state/checkpoint (no model)│
 ~/.config/plumbbob │  • reasoning: plan/step/refine/harvest/verify│ ──▶ fascicle ──▶ 8 providers
   /config.toml     │    via fascicle model_call + suspend pause   │      engine      (incl. Ollama=local,
 .plumbbob/config.  │  • plumbbob mcp  (fascicle serve_flow, READ)  │                  claude_cli=sub auth)
   toml (override)  └───────────────┬─────────────────────────────┘
                                    │ thin triggers (no logic)
        ┌───────────────┬───────────┼───────────────┬───────────────┐
   Claude Code        Codex        Cursor        VS Code           Zed
   .claude/skills/  .agents/skills/ (shared)  .github/skills/   .agents/skills/
   (or the plugin)  + disable-model-invocation everywhere        (+ MCP read-side)
```

**Config file** (plumbbob owns it; translates to fascicle's `create_engine`):

```toml
# ~/.config/plumbbob/config.toml  (XDG user default; .plumbbob/config.toml overrides per-project)
[engine]
provider = "anthropic"      # or openai | google | openrouter | bedrock | ollama | lmstudio | claude_cli
model    = "claude-opus-4-8"
effort   = "high"
# keys come from env (ANTHROPIC_API_KEY, …), never committed
[engine.standalone_execution]
enabled  = false            # opt-in fascicle tool-loop for headless build; off by default
```

**`plumbbob init --host <tool>`** (explicit subcommand — *never* postinstall; see
Analysis 1) scaffolds the right integration per project, committed, XDG for user
defaults, nothing dumped in `$HOME`.

## Adversarial evaluation

**Where it wins**

- **True model-agnosticism** — 8 providers; **local/offline/private via Ollama or
  LM Studio**; no single-vendor lock-in. This is the whole thesis and it's real.
- **Works headless / CI / standalone** — plumbbob can author a plan or run a refine
  pass with no host tool at all.
- **One reasoning core, many thin front-ends** — orchestration logic lives in one
  tested CLI, not duplicated across five prompt dialects.
- **Philosophy survives** — `disable-model-invocation` + fascicle `suspend` encode
  "human is the clock" *natively*, on 4 of 5 tools.
- **Future-proof** — not betting the product on one vendor's plugin system.

**Where it breaks (and the honest mitigations)**

1. **The cost / double-charge problem — the biggest hit.** Standalone fascicle calls
   cost money *on the user's own API key*. Subscription users (Claude Pro/Max,
   ChatGPT Plus) don't have or want API keys, and resent paying twice when the host
   model would do the reasoning for free. Mitigations, each with a catch:
   `claude_cli` adapter (reuses the authed `claude` CLI subscription → free, but
   re-introduces a Claude dependency for that path); local models via Ollama (free +
   private, but weaker at hard planning); or simply "bring your own key." **There is
   no clean answer** — this is the structural tax of owning your own calls, and it's
   exactly the tax Analysis 1 avoids by riding the host's existing auth.
2. **Loses the zero-runtime-dep property.** fascicle is ESM-only, **Node ≥24**
   (plumbbob is ≥22.18 today), and pulls `ai` + `zod` + ≥1 `@ai-sdk/*` as real
   runtime deps. That complicates the clean `bin/`-bundling story from Analysis 1
   (now there's a `node_modules` to ship/install) and raises the Node floor.
3. **Soft execution off-Claude.** Only Claude Code runs the verb deterministically
   from a skill; the other four rely on the agent choosing to run the terminal under
   approval. The clock is a *lock* only on Claude Code.
4. **MCP inverts control flow** — the one universal substrate can't carry the action
   surface without breaking the law; it's read-only, so "ship one MCP server
   everywhere" only solves the *context* half, not the *trigger* half.
5. **Integration maintenance × 5**, over **young, fast-churning formats** — skills
   convergence is weeks old; Codex prompts → skills, Cursor commands → skills, and
   VS Code `.chatmode.md` → `.agent.md` are all mid-deprecation. The converging
   `.agents/skills/` + AGENTS.md standard *reduces* this, but you're authoring
   against moving targets.
6. **Two reasoning paths risk.** If you want host-delegated reasoning *in-host*
   (free) **and** fascicle reasoning *standalone* (paid), that's two code paths per
   verb that can drift. Pick one source of truth — recommend "fascicle always owns
   reasoning," accept the cost, soften with `claude_cli`/local.
7. **Scope-creep gravity** — the pull to make standalone plumbbob a full coding
   agent. Must hold the labor split above or the project doubles in size and starts
   losing to the incumbents it depends on.

## Recommendation

**Adopt the model-agnostic architecture as the *direction*, but stage it — and do
Analysis 1's plugin first, because it's small, high-value, and a strict subset.**

Concrete sequencing:

1. **Now — ship the Claude plugin (Analysis 1).** Keep the CLI deterministic. This
   is days of work and fixes the home-dir complaint immediately.
2. **Add a reasoning seam.** Refactor the reasoning verbs (`plan`, `step`, `refine`,
   `harvest`, `verify`-review) so each has a clean boundary where a model call could
   slot — but keep them host-delegated for now. This is architecture, not a
   dependency.
3. **Introduce fascicle behind that seam, config-gated and opt-in.** Default off
   (in-host = host does reasoning, no cost). Turn it on for standalone/headless/local
   via `~/.config/plumbbob/config.toml`. Map `/pb-refine`→`adversarial`,
   `/pb-verify`→`suspend`. Pay the Node-24 / runtime-dep cost only when this ships.
4. **Generalize the front-ends.** Author verbs once as `.agents/skills/pb-*/`
   (`disable-model-invocation: true`) + mirror to `.claude/skills/`; add `plumbbob
   mcp` (fascicle `serve_flow`) **read-only**; ship `AGENTS.md` + `CLAUDE.md` shim;
   `plumbbob init --host <tool>` to scaffold per project.
5. **Standalone execution stays an explicit, advanced opt-in** — never the default,
   never the pitch.

**Decision rule:**

| If the near-term goal is… | Do |
|---|---|
| Best Claude Code experience, ship this week | **Analysis 1 only** (plugin); defer fascicle |
| Model-agnostic product across ≥2 hosts, headless-capable, vendor-independent | **This analysis**, staged 1→5 above |
| Unsure / want optionality | Ship plugin now **with** the reasoning seam (step 2) so fascicle can land later without a rewrite |

The seam in step 2 is the whole trick: it costs almost nothing now and preserves the
option to go fully model-agnostic without throwing away the plugin. Don't pay
fascicle's Node-24 + runtime-dep + cost complexity until multi-host demand is real —
but architect today so that bill is a config flag, not a rewrite.

## Sources

Integration surfaces (official docs/changelogs, June 2026):

- Claude Code: `code.claude.com/docs/en/{skills,mcp,memory,hooks,plugins-reference}`
- Codex CLI: `developers.openai.com/codex/{skills,custom-prompts,mcp,config-reference,guides/agents-md}` — custom prompts **deprecated** in favor of skills
- Cursor: `cursor.com/docs/{rules,context/skills,context/commands,mcp,context/mcp/install-links}` — commands folding into skills (v2.4)
- VS Code (Copilot): `code.visualstudio.com/docs/agent-customization/{overview,prompt-files,custom-agents,custom-instructions,agent-skills}`, `.../agents/reference/mcp-configuration` — `servers` key (not `mcpServers`); AGENTS.md opt-in
- Zed: `zed.dev/docs/ai/{skills,mcp,agent-panel,external-agents}` — MCP = "context servers"; custom slash commands removed (v1.4)
- fascicle: `github.com/robmclarty/fascicle` README + `docs/{providers,cli,composition,configuration}.md` (local: `~/Projects/fascicle/code/fascicle`)

Cross-cutting facts:

- **MCP supported by all five** (stdio local) — but 4 incompatible config shapes:
  `mcpServers` (Claude, Cursor) / `servers` (VS Code) / `context_servers` (Zed) /
  TOML `[mcp_servers.*]` (Codex).
- **`SKILL.md` Agent Skills** now read by all five; `.agents/skills/` shared by 4;
  **`disable-model-invocation`** in 4 of 5 = the human-as-clock primitive.
- **`AGENTS.md`** read by 4 of 5 natively (VS Code flag-gated); Claude via import/symlink.
- Distribution mechanics (postinstall deprecation, XDG, per-project init,
  oh-my-zsh anti-pattern) carried over from [Analysis 1](./01-claude-native-distribution.md).
