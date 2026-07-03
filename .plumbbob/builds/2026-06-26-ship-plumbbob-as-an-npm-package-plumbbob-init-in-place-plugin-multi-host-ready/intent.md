<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.

Size to the work: a small change fills Frame + a couple of Decisions and deletes
the rest; a medium feature fills it all. Opinionated where decided, explicit where
open. If the implementor (you-later, or the LLM) has to guess, the doc failed.
-->

# Ship plumbbob as an npm package + `plumbbob init` (in-place plugin, multi-host-ready)

**STATE:** DESIGN
**Phase** (bookkeeping while in DESIGN): steps authored
**Size:** medium

## Frame

- **Problem:** Installing plumbbob is unfriendly. `setup --global` copies all 11
  `pb-*` skills into `~/.claude/skills/`, drops the hook under `~/.claude/plumbbob/`,
  and hand-edits `~/.claude/settings.json` — it pollutes the user's home, mingles with
  their own skills, has no version record, and no clean uninstall.
- **Smallest thing that solves it:** Distribute plumbbob as a **globally-installed npm
  package** (`npm i -g plumbbob`) that `plumbbob init` links into the agent as an
  **in-place plugin** — a symlink into the global skills dir (`~/.claude/skills/plumbbob`)
  so the skills load namespaced (`/plumbbob:plan`) with the hook auto-registered. One
  install, available in every repo. No per-project install, no remote marketplace, no bin
  shim, no settings.json hand-editing.
- **Done looks like:** `npm i -g plumbbob && plumbbob init` yields `/plumbbob:plan` + a
  live (session-gated) post-edit hook, available in **every** repo; sessions stay
  per-project (`.plumbbob/` created by `plumbbob start`); a global update keeps the tool
  current; nothing under `~` except the one symlink; the old multi-scope `setup`
  (`--global/--local/--project`) is gone; `pnpm check` green.
- **Explicitly NOT doing:** the fascicle / local-model path (declined — host-only); a
  remote Claude marketplace (npm is the carrier instead); building the Codex/Cursor/Zed
  `init` targets in THIS goal (the architecture leaves room — a later goal); rewriting
  the CLI verbs' logic.

## Architecture sketch

```
npm package "plumbbob"  (the agent-neutral carrier)
├── .claude-plugin/plugin.json   # { "name": "plumbbob", "version" }  → namespace /plumbbob:*
├── skills/<verb>/SKILL.md        # bare verbs: plan, step, build, verify, …  (was pb-*)
├── hooks/hooks.json              # PostToolUse "Edit|Write|…" → post-edit.sh (auto-registers)
├── hooks/post-edit.sh            # unchanged, session-gated
├── bin/  dist/  templates/       # the CLI; bare `plumbbob` resolves via npm's global PATH
└── package.json                  # published to npm

install:  npm i -g plumbbob              (global — a personal tool, like firecrawl/gh)
wire:     plumbbob init                   → symlink ~/.claude/skills/plumbbob → <global pkg>
          (later) plumbbob init --host codex|cursor|zed  → symlink into that agent's global skills dir
result:   Claude Code loads it IN PLACE as a plugin → /plumbbob:plan, hook live, bin on PATH
sessions: per-project — `plumbbob start` writes .plumbbob/ in each repo (independent of install)
```

## Decisions

- D1: **Distribute as a globally-installed npm package** (no per-project install);
  `plumbbob init` links it into the global skills dir as an **in-place plugin** (no
  remote marketplace) — *because* plumbbob is a **personal tool** (like firecrawl/`gh`),
  not a project dependency: it's not in CI, gates no build, emits no committed artifact,
  and it's guidance-not-enforcement. **Install scope ≠ session scope** — sessions stay
  per-project (`.plumbbob/`) regardless. An in-place symlink also stays live with a
  global update, whereas a marketplace install copies to a cache and freezes (research/01
  Q6 + the step-1 spike).
- D2: **No bin shim / no `__PLUMBBOB_BIN__` substitution** — skills call bare
  `plumbbob`, resolved by npm's **global PATH** (`npm i -g` puts it there) — *because*
  npm already creates the bin at install; this deletes the ~200-line substitution
  machinery in setup.ts.
- D3: **Claude Code is the first `init` target; the npm carrier + portable `SKILL.md`
  keep Codex/Cursor/Zed as future `init --host` targets** — *because* model-agnosticism
  comes from multi-host placement, not from plumbbob calling providers (research/02).
- D4: **Plugin name = `plumbbob` → `/plumbbob:plan`** (single namespace) — *because*
  Claude Code namespaces by the plugin `name` and supports **no alias**, so `/pb:plan`
  as a second prefix is impossible (Q1 resolved).
- D5: **Rename skills `pb-*` → bare verbs** (`plan`, `step`, `build`, `verify`, `park`,
  `status`, `harvest`, `wrap`, `revert`, `spike`, `refine`) — *because* the `pb-`
  prefix stutters under the namespace (`/plumbbob:pb-plan`).
- D6: **Replace the multi-scope `setup` (`--global/--local/--project`) with a single,
  global-scope `plumbbob init`** — explicit, idempotent, reversible (`--uninstall`),
  **never** a `postinstall` — *because* one scope is all a personal tool needs, and
  postinstall is being disabled by pnpm/npm (`init` is the husky/eslint convention).
- D7: **Host-only; no fascicle/local engine** — *because* plumbbob is the layer around
  a frontier cloud subscription run inside a host agent (the rubber-duck decision).

## Constraints

- C1: Keep plumbbob's **zero-runtime-dependency** property — `node:` builtins only.
- C2: Functional/procedural house style — no classes, no `this`, no default export.
- C3: The post-edit hook stays **session-gated** (no behavior without `.plumbbob/STATE`)
  and degrades gracefully when oxlint/ast-grep are absent.
- C4: Don't break the existing npm install path or the test suite; `pnpm check` (tsc,
  oxlint, ast-grep, vitest, knip, markdownlint) stays green.
- C5: `init` is **idempotent + reversible** (symlink in; `--uninstall` removes it) and
  **never hand-edits** the user's `settings.json`.

## Steps

1. [x] SPIKE — validate the in-place skills-dir plugin mechanism by hand — **done when:** a hand-made `.claude-plugin/plugin.json` + a symlink (`~/.claude/skills/plumbbob` and a project `.claude/skills/plumbbob`) loads namespaced `/plumbbob:<skill>`, the `hooks.json` hook fires on an edit, and `bin/` resolves — recorded pass/fail per scope on the target CC version (de-risks the trust-gate + the known local-path "0 skills" bug)
   - seam: `.claude-plugin/plugin.json` (throwaway), a manual symlink; notes to `build-log.md`
2. [x] Add the real plugin manifest — **done when:** `.claude-plugin/plugin.json` (name `plumbbob`) ships in `package.json` `files`, and `claude plugin validate .` passes (or the JSON matches the documented schema)
   - seam: `.claude-plugin/plugin.json`, `package.json`
3. [x] Rename skills `pb-*` → bare verbs; drop `__PLUMBBOB_BIN__` — **done when:** skills live at `skills/<verb>/SKILL.md`, call bare `plumbbob` with static `allowed-tools: Bash(plumbbob …:*)`, and `vitest run` is green
   - seam: `skills/`, `src/verbs/setup.ts`
4. [x] Convert the hook to a plugin hook — **done when:** `hooks/hooks.json` registers the PostToolUse matcher pointing at the bundled `post-edit.sh`, and editing a `.ts` file in an enabled-plugin test repo fires the light check
   - seam: `hooks/hooks.json`, `hooks/post-edit.sh`
5. [x] Replace `setup` with a single-scope `plumbbob init` — **done when:** `plumbbob init` symlinks the package into `~/.claude/skills/plumbbob`, is idempotent, supports `--uninstall`, never touches `settings.json`; the old `--global/--local/--project` modes are removed; `doctor` reports init health; init/doctor tests pass
   - seam: `src/verbs/init.ts` (from `setup.ts`), `src/verbs/doctor.ts`, `src/cli.ts`, `test/`
6. [x] Lead the README + docs with the npm + `init` flow — **done when:** the Install section opens with `npm i -g plumbbob && plumbbob init`, explains sessions are per-project via `plumbbob start`, notes the multi-host `init --host` roadmap, and `markdownlint` passes
   - seam: `README.md`, `docs/happy-path.md`
7. [x] Rework `dev-install.sh` for the plugin model — **done when:** it links THIS checkout as the plugin (`pnpm link --global` puts the bin on PATH + `plumbbob init` symlinks the checkout), `--uninstall` reverses both, it no longer touches `settings.json` (the plugin's hooks.json auto-registers), and `sh -n` parses clean
   - seam: `scripts/dev-install.sh`

## Open questions

- Q1: The Codex/Cursor/Zed `init --host` targets — exact placement (`.agents/skills/`
  vs per-tool dirs) and per-agent hook story. *Out of scope here; a later goal.* —
  *resolve by:* park (future goal)

## Verdicts

- 2026-06-25 — namespace fork → **plugin name `plumbbob`** (`/plumbbob:plan`); `/pb:plan`
  alias rejected because Claude Code supports exactly one namespace = the plugin name.
- 2026-06-25 — bin resolution fork → **no shim**; skills call bare `plumbbob` resolved
  via npm's bin (global PATH / project `node_modules/.bin`); `${CLAUDE_PLUGIN_ROOT}` and
  `__PLUMBBOB_BIN__` both dropped.
- 2026-06-25 — distribution fork → **npm package + `plumbbob init` symlink (in-place
  plugin)**, not a remote marketplace, because the marketplace copies to a cache and
  would freeze against `pnpm update`; the npm carrier also keeps it agent-neutral.
- 2026-06-26 — **Step 1 spike PASSED** the recipe on claude 2.1.185: a symlinked
  skills-dir plugin loads namespaced, its `hooks.json` hook fires, and `bin/` lands on
  PATH (all proven end-to-end at **global** scope via headless `claude -p`). **Project**
  scope works by the same mechanism but is **trust-gated** (not surfaced/loaded outside a
  trusted interactive session).
- 2026-06-26 — install-scope fork → **global-only** (dropped `--project`/`--local`).
  plumbbob is a personal tool, not a project dep; **install scope ≠ session scope**, so
  per-project work is unaffected; and global-only dodges the trust-gate the spike found,
  collapsing `init`/`doctor` to one scope. (Revised D1, D6, step 5.)
