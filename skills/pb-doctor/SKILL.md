---
name: pb-doctor
description: Diagnose the plugin install from inside a session — is plumbbob linked, are the skills and hook present, is there a collision. A thin trigger for `plumbbob doctor`. Matters most for a marketplace install, where the CLI is on PATH only inside Claude Code.
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob doctor:*)
---

# Plumbbob — doctor (the is-it-installed-right move)

Install diagnostic (injected when this skill runs): !`if command -v plumbbob >/dev/null 2>&1; then plumbbob doctor 2>&1; else echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."; fi`

This is a **thin driver** for `plumbbob doctor`. The report above is read-only — `doctor`
inspects, it never writes. This skill carries **no Edit and no Write tool**: never edit a file
to change what the report says. If a check failed, surface its `→ fix` verbatim and apply
*that* fix, then have the human **restart Claude Code (or `/reload-plugins`)**. **Never retry.**

## Why a skill (and not just the terminal)

The CLI's reach differs by install path, and that is the whole point of running `doctor` here:

- **Marketplace plugin** — `plumbbob` is on PATH **only inside a Claude Code session** (its
  `bin/` shims are injected into the Bash tool while the plugin is enabled). There is **no
  terminal `plumbbob`** to run. So this skill — or letting me run `plumbbob doctor` in-session
  — is the *only* way to reach `doctor`. The fact that this skill loaded at all already proves
  the plugin is enabled and the shim is on PATH.
- **Skills-dir / global install** (`npm i -g plumbbob` + `plumbbob init`) — `plumbbob` is on
  PATH everywhere, so terminal `plumbbob doctor` works too; this skill is just convenience.

The one failure `doctor` **cannot** diagnose: a plugin that never loaded at all (no
`/plumbbob:*` skill appears). That is a `/plugin` / `/reload-plugins` problem, not doctor's —
and if you are reading this, that is not your situation.

## What it does

1. Surface the injected `doctor` report verbatim — every `✓` and any `✗` with its `→ fix`.
2. If all checks passed, say so; if a skill still misbehaves, the fix is a restart, not a re-run.
3. If a check failed, apply its named `→ fix`, then restart Claude Code (or `/reload-plugins`).
4. If the line above says the CLI is not on PATH, follow the install-path branch it printed.
