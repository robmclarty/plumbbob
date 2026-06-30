# PlumbBob distribution — Analysis 1: the Claude-native path

> Question: installing plumbbob today effectively dumps its payload into the user's
> home `~/.claude/`. What's a more user-friendly install, benchmarked against how
> other TypeScript CLI tools distribute themselves? Recommendation reached by
> adversarial eval.
>
> Date: 2026-06-25. Companion: [`02-model-agnostic-standalone.md`](./02-model-agnostic-standalone.md).

## What actually happens today

The README sells a clean npm flow, but the friction you're describing is the
**`plumbbob setup --global`** path: it `cpSync`s all **11 `pb-*` skills into
`~/.claude/skills/`**, copies the hook into `~/.claude/plumbbob/hooks/`, and
rewrites `~/.claude/settings.json`. From the user's seat that *is* "dump the whole
project into my home dir" — same downsides as a clone: it mingles plumbbob's 11
skills with the user's hand-authored ones, mutates a global file, keeps no version
record, and has no clean uninstall (`--uninstall` "leaves installed files in
place").

Three facts about plumbbob (verified in source) make the fix easy:

| Fact | Why it matters |
|---|---|
| **CLI has zero runtime deps** (no `dependencies` in package.json — pure Node + its own `dist/`) | It can be bundled and run as `node …/dist/cli.js` with **no `npm install` at runtime** |
| **Templates resolved via `import.meta.url`** (`start.ts:98`) | Templates travel with `dist/`; path resolution already works wherever the package sits |
| **The post-edit hook never calls the CLI** — gated on `.plumbbob/STATE`, shells to the *project's* `node_modules/.bin/oxlint` | The hook is self-contained; it only needs to be on disk and registered |

## The reframe

**PlumbBob is not a CLI. It's a Claude Code *extension* — 11 skills + 1 hook +
templates — with a CLI as an implementation detail the skills shell out to.** So
"how do TS CLIs install" is the wrong benchmark for the payload. The right benchmark
is "how do you ship skills + hooks to Claude Code," and as of late 2025 there's a
purpose-built official answer.

## Research findings

### Claude Code's native plugin system is an exact fit

A plugin bundles `skills/`, `hooks/hooks.json`, `bin/`, and supporting files; users
install with two commands; and it erases every pain point:

| Current pain | Plugin system |
|---|---|
| 11 skills copied into `~/.claude/skills/`, mingled with the user's own | Copied into an **isolated versioned cache** (`~/.claude/plugins/cache/…`); skills **namespaced** `/plumbbob:pb-plan` — zero collision |
| Hand-rewrite `~/.claude/settings.json` to wire the hook | `hooks/hooks.json` **auto-registers** on enable — no settings edit |
| `setup.ts` bakes a machine path into each skill (`__PLUMBBOB_BIN__`) | `bin/` is **auto-added to PATH** while enabled → skills just call `plumbbob` |
| No version pin, no auto-update, dirty uninstall | Version tracking, auto-update, atomic `/plugin uninstall` (removes cache + data) |
| "Copy these files and edit settings" to share | Share = `/plugin marketplace add robmclarty/plumbbob` |

### TS CLI distribution, the 2025–2026 consensus

- Prefer `npx <pkg>@version` over global installs (EACCES/PATH pain).
- **Never do setup in `postinstall`** — pnpm 10 blocks dependency postinstalls by
  default; npm v12 (~July 2026) turns them off too (husky already migrated off it).
- Write assets **per-project, committed** (eslint/biome/husky/shadcn convention);
  use **XDG dirs** (`~/.config`, `~/.local/share`), never bare `$HOME` dotfiles, for
  anything user-global.
- The **clone-into-`$HOME` pattern (oh-my-zsh) is the named anti-pattern** — no
  version pinning, git required, opaque home mutation, weak uninstall, no integrity.

## Recommendation

**Ship plumbbob as a native Claude Code plugin, distributed from its own GitHub repo
as a one-plugin marketplace, with the zero-dep CLI bundled in `bin/`. Keep the npm
package as a secondary path; retire `setup --global`.**

The repo *becomes* the marketplace — no second repo:

```text
plumbbob/
├── .claude-plugin/
│   ├── marketplace.json        # { name, owner, plugins:[{name:"plumbbob", source:"."}] }
│   └── plugin.json             # { name:"plumbbob", version:"0.4.0", … }
├── hooks/hooks.json            # PostToolUse "Edit|Write|…" → ${CLAUDE_PLUGIN_ROOT}/hooks/post-edit.sh
├── hooks/post-edit.sh          # unchanged
├── skills/pb-*/SKILL.md        # drop the __PLUMBBOB_BIN__ substitution; call bare `plumbbob`
├── bin/plumbbob                # shim: exec node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" "$@"
├── dist/ templates/            # shipped as-is
└── package.json                # still publishes to npm for the CLI/fallback
```

Install collapses from "install pkg → run setup → restart" to:

```text
/plugin marketplace add robmclarty/plumbbob
/plugin install plumbbob
```

Nothing touches `~` except the isolated plugin cache. The whole `setup.ts`
placeholder-substitution machinery (~200 lines) **deletes** — bin-on-PATH + auto
hook registration replace it.

## Adversarial evaluation

1. **Namespacing tax — the real cost.** Plugin skills are forced to
   `/plumbbob:pb-plan`, not `/pb-plan`. The README pitch is "no step numbers to
   remember"; `/plumbbob:pb-plan` is *more* to type, and `pb-` becomes redundant.
   **Mitigation:** rename skills to bare verbs (`plan`, `step`, `build`…) →
   `/plumbbob:plan`. Tab-completion makes the namespace cheap. The one genuine UX
   regression; decide if it's worth the isolation (it is).
2. **Claude Code version floor.** Plugins/marketplaces are recent; older clients
   can't install. **Mitigation:** keep the npm package as the fallback
   (`npx plumbbob setup --local`). You lose nothing by keeping both.
3. **"Bundling `dist/` into a git repo is ugly."** Cleaner refinement: point the
   marketplace entry at the npm package (`"source": {"source":"npm","package":"plumbbob"}`)
   so npm stays the single build artifact. Caveat: verify on your Claude Code
   version that an npm-source plugin still puts `bin/` on PATH; if not, commit
   `dist/` (108KB, harmless).
4. **`${CLAUDE_PLUGIN_ROOT}` in `allowed-tools` matchers.** bin-on-PATH lets
   `Bash(__PLUMBBOB_BIN__ status:*)` become static `Bash(plumbbob status:*)` —
   *better* than today's baked absolute path.
5. **Plugin-system stability.** The exact `~/.claude/plugins/cache` paths are
   internal and could shift, but you never reference them; you use public `/plugin`
   commands + `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}`, the documented
   contract. Low risk.

**Rejected under eval:** standalone compiled binary (solves a problem you don't
have — Node is already required — and ignores the real payload); `curl|sh` (no
integrity, server-spoofable, pointless when a real package exists); any
`postinstall` auto-wiring (being turned off ecosystem-wide).

## Ranked

| Approach | Home-dir clean | One-cmd install | Versioned/auto-update | Namespaced | Effort | Verdict |
|---|:---:|:---:|:---:|:---:|---|---|
| **Plugin + marketplace** | ✅ | ✅ | ✅ | ✅ | Medium | **Primary** |
| npm pkg, default `--local`, kill `--global` | ✅ (project only) | ⚠️ two-step | ⚠️ npm only | ❌ | Low | **Keep as fallback** |
| Current `setup --global` | ❌ | ❌ | ❌ | ❌ | — | **Retire** |
| Clone into `~` / standalone binary / curl\|sh | ❌ | varies | ❌ | ❌ | — | Reject |

**Net:** convert to a plugin (primary), keep the slimmed npm path as the old-client
fallback, delete `--global`. Minimum viable migration is small — add three manifest
files, a 1-line `bin/` shim, swap the hook into `hooks/hooks.json`, strip the
`__PLUMBBOB_BIN__` dance from the skills.

## Sources

All official Anthropic docs unless noted:

- [Plugins](https://code.claude.com/docs/en/plugins)
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference) — manifest schema, `bin/` PATH, caching, `${CLAUDE_PLUGIN_ROOT}`
- [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Discover/install plugins](https://code.claude.com/docs/en/discover-plugins)
- npm: [global EACCES](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/), [npx](https://docs.npmjs.com/cli/v11/commands/npx/), [npm-init](https://docs.npmjs.com/cli/v11/commands/npm-init/)
- [GitHub: npm v12 disables install scripts](https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/)
- [pnpm supply-chain](https://pnpm.io/supply-chain-security)
- [husky get-started](https://typicode.github.io/husky/get-started.html)
- [shadcn CLI](https://ui.shadcn.com/docs/cli)
- [XDG Base Directory](https://specifications.freedesktop.org/basedir/latest/)
- [oh-my-zsh](https://github.com/ohmyzsh/ohmyzsh)
