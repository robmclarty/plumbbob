# Report — Ship plumbbob as an npm package + `plumbbob init` (in-place plugin)

**Goal:** stop the unfriendly install (`setup --global` dumped 11 skills into
`~/.claude/skills/`, hand-edited `settings.json`, no versioning, no clean uninstall).
Distribute plumbbob as a globally-installed npm package that `plumbbob init` links
into Claude Code as an in-place plugin. Branch: `feat/plugin-distribution`.

## What shipped

- **`plumbbob init`** (replaces the 3-scope `setup`): one global command that symlinks
  the package into `~/.claude/skills/plumbbob`, where Claude Code loads it as
  `plumbbob@skills-dir`. Idempotent, `--uninstall` reverses, **never writes
  settings.json**. Net **−700 lines** (deleted `setup.ts`, `lib/settings.ts`).
- **Plugin manifest** `.claude-plugin/plugin.json` (name `plumbbob`), shipped in the
  package `files`. `claude plugin validate .` clean.
- **Skills renamed** `pb-*` → bare verbs → invoked as `/plumbbob:plan` etc.;
  `__PLUMBBOB_BIN__` substitution gone (skills call a bare `plumbbob`).
- **Hook** auto-registers via `hooks/hooks.json` (`PostToolUse` → `post-edit.sh`); no
  settings.json editing.
- **Docs**: README leads with `npm i -g plumbbob && plumbbob init`; every `/pb-*` →
  `/plumbbob:*` across CLI hints, templates, README, and the happy-path.
- **`dev-install.sh`** reworked to link the checkout as the plugin (build + `pnpm link
  --global` + `init`), dropping the old settings.json registration.

Install is now: `npm i -g plumbbob && plumbbob init`.

## Decisions

- **Host-only; fascicle declined.** Rubber-ducked the model-agnostic CLI idea and the
  reasoning seam (prototyped on `proto/reasoning-seam`, see `research/03`): for a
  human-clocked tool used inside a subscription agent, the host model dominates a
  standalone engine. Plumbbob is the layer *around* a frontier subscription.
- **Global-only install.** Plumbbob is a personal tool (like firecrawl/`gh`), not a
  project dependency. *Install scope ≠ session scope* — sessions stay per-project via
  `plumbbob start`, independent of the one global link. Dropped `--local/--project`.
- **npm carrier, not a Claude marketplace.** Keeps distribution agent-neutral (a
  future `init --host codex|cursor|zed`) and, as an in-place symlink, stays live with
  `npm update` (a marketplace install copies to a cache and freezes).
- **Single namespace `/plumbbob:plan`.** Claude Code namespaces by plugin name with no
  alias, so `/pb:plan` as a second prefix is impossible.

## Final status

- **7/7 steps checkpointed, `pnpm check` green at every checkpoint.** Open question
  carried forward: the multi-host `init --host` targets (Codex/Cursor/Zed) — a future
  goal; the npm carrier + portable `SKILL.md` leave room for it.
- **Validated end-to-end** (not just unit tests): the spike proved the skills-dir
  symlink mechanism (namespaced load + hook fire + bin on PATH, global scope;
  project scope is trust-gated → drove the global-only call). After `init`,
  `claude plugin list` recognizes `plumbbob@skills-dir`, a headless edit fires the
  hook, and `plumbbob doctor` reports all checks green.
- **Two bugs the spike/validate caught before shipping:** project-scope skills-dir is
  trust-gated (shaped the global-only decision); and `pb-plan`/`pb-verify` had unquoted
  `: ` in their descriptions — invalid YAML the strict plugin loader silently drops,
  taking `disable-model-invocation` with it (fixed by quoting).
- Research docs `01`–`03` are on `main`; the fascicle prototype is archived on
  `proto/reasoning-seam` (not merged).

## Checkpoints

- baseline 2c989eaf8623e263211a0ef8fde7b9c28fdd9cc5
- step 2 0f0712b3b1e2a00148f45a309c72973e4178b199
- step 3 d1ecb379f5476f7051ce7670de132c619e6352b3
- step 4 24389658ca828b03d95e7b4055015c3fda0258bb
- step 5 1ac41834156822d8aa43915d54e59cfbe6f8fbd6
- step 6 0f533d13947e24bec6f887584ccddd37f45709a6
- step 7 d283696d0d2441513299ace9fa9c380d804f1ca3
