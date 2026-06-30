# Install

PlumbBob installs **once, globally** — like `gh` or your dotfiles. There are two
co-equal, mutually-exclusive ways to do it (both register a Claude Code plugin named
`plumbbob`; running both collides over the `/plumbbob:*` namespace). The
[README](../README.md#install) shows the quick form of each; this page is the full
reference.

## The marketplace plugin

Self-contained: it ships the skills *and* the `plumbbob`/`pb` CLI on PATH (via its
`bin/` shims), so it needs neither `npm i -g` nor `plumbbob init`:

```text
/plugin install plumbbob@<marketplace>
```

## npm global + `init`

The npm package ships the CLI, the skills, and the hook; `plumbbob init` links them
into Claude Code as an in-place plugin:

```sh
npm i -g plumbbob      # the CLI (also a `pb` shorthand)
plumbbob init          # link it into Claude Code; --uninstall to undo
```

`init` symlinks the package into `~/.claude/skills/plumbbob`, where Claude Code loads
it as a plugin; the post-edit hook auto-registers from `hooks.json`. Because it's a
symlink, a later `npm i -g plumbbob@latest` stays live with no re-link. If a
marketplace plumbbob is already installed, `plumbbob init` refuses rather than create
the collision (`--force` overrides), and `plumbbob doctor` flags a double-install.

## Namespacing

Either way, Claude Code namespaces the skills under the `plumbbob` plugin, so the
real commands are `/plumbbob:pb-plan`, `/plumbbob:pb-status`, and the rest. **For
readability these docs write the short form — `/pb-plan` means `/plumbbob:pb-plan`.**
Nothing else under `~` is touched and `settings.json` is left alone — restart Claude
Code (or `/reload-plugins`) to activate.

## Sessions are per-project

Install scope is not session scope: you install the tool once, but each goal lives in
its own repo — `plumbbob start "<goal>"` writes a `.plumbbob/` sidecar there,
independent of the one global link.

## Other agents (roadmap)

The npm package is the agent-neutral carrier; a future `plumbbob init --host
codex|cursor|zed` will place the same skills where those tools look. Claude Code is
the first, first-class target.

## Verify

```sh
plumbbob doctor
```

`doctor` works for either install path: it confirms a marketplace plugin, or checks
that the skills-dir link resolves to the plugin manifest, the skills, and the hook —
flagging a double-install collision — and prints the exact fix for anything broken.
The terminal command above is for the **global / skills-dir** install; a
**marketplace** plugin puts the CLI on PATH only *inside a Claude Code session*, so
run **`/pb-doctor`** there instead. Run it first if a `/plumbbob:*` skill ever opens
with an empty dashboard; [`troubleshooting.md`](troubleshooting.md) covers the rest.
