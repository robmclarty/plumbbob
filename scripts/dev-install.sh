#!/bin/sh
# dev-install.sh — link THIS working tree into Claude Code as the plumbbob plugin,
# for hacking on plumbbob itself. It puts the `plumbbob` bin on PATH (a global pnpm
# link) and runs `plumbbob init` to symlink the checkout into
# ~/.claude/skills/plumbbob, where Claude Code loads it as `plumbbob@skills-dir`.
# Edits to skills/ and hooks/ are then LIVE — reload Claude Code (or /reload-plugins);
# rebuild (`pnpm build`) after changing the CLI. `--uninstall` reverses both.
#
# This replaces the old settings.json hook registration: a linked plugin
# auto-registers the post-edit hook from hooks/hooks.json, so dev-install no longer
# touches settings.json. (`plumbbob init` is the PRODUCTION installer; this is the
# dev convenience that also builds and puts the bin on PATH.) Idempotent — re-run to
# re-sync; `plumbbob init` reports "already linked".
#
# Usage:
#   scripts/dev-install.sh              build, link the bin, link the plugin
#   scripts/dev-install.sh --uninstall  drop the plugin link + the global bin link

set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$ROOT"

if [ "${1:-}" = "--uninstall" ]; then
  node src/cli.ts init --uninstall || true
  pnpm uninstall --global plumbbob >/dev/null 2>&1 || true
  echo "dev-install: unlinked this checkout (plugin link + global bin). Restart Claude Code."
  exit 0
fi

pnpm build                   # so the linked `plumbbob` bin (dist/cli.js) is current
pnpm link --global           # `plumbbob` (+ `pb`) on PATH, pointing at this checkout
node src/cli.ts init --force # symlink ~/.claude/skills/plumbbob -> this checkout; --force past the marketplace-collision guard (dev wants the live checkout)

echo "dev-install: linked this checkout as the plumbbob plugin (bin on PATH + ~/.claude/skills/plumbbob)."
echo "dev-install: restart Claude Code (or /reload-plugins). Skill + hook edits are live; run 'pnpm build' after CLI changes."
echo "dev-install: undo with 'scripts/dev-install.sh --uninstall'."
