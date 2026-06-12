#!/bin/sh
# dev-install.sh — the DEVELOPMENT installer: register Plumbbob's hooks in the
# global Claude Code settings pointing at THIS working tree's hooks/ (so edits to
# the hooks take effect with no re-copy). Use this while hacking on the hooks
# themselves. `plumbbob setup` is the production installer — it COPIES the hooks
# and skills into ~/.claude/ and supports the D27 registration scopes; use it to
# install Plumbbob for real. This one is idempotent (run twice => byte-identical
# settings.json), writes a backup, and supports --uninstall.
#
# Usage:
#   scripts/dev-install.sh              install / re-sync
#   scripts/dev-install.sh --uninstall  remove Plumbbob's hook entries
#
# Requires jq. The hooks are session-gated, so registering them globally is safe:
# a repo with no .plumbbob/ session sees zero behavior change (C7).

set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
HOOKS_DIR=$(cd "$SCRIPT_DIR/../hooks" && pwd -P)
SETTINGS_DIR="$HOME/.claude"
SETTINGS="$SETTINGS_DIR/settings.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "dev-install: jq is required but not found on PATH." >&2
  exit 1
fi
for h in pre-edit.sh bash-guard.sh post-edit.sh; do
  if [ ! -f "$HOOKS_DIR/$h" ]; then
    echo "dev-install: missing hook $HOOKS_DIR/$h" >&2
    exit 1
  fi
done
chmod +x "$HOOKS_DIR"/pre-edit.sh "$HOOKS_DIR"/bash-guard.sh "$HOOKS_DIR"/post-edit.sh

mkdir -p "$SETTINGS_DIR"
[ -f "$SETTINGS" ] || printf '%s\n' '{}' >"$SETTINGS"
cp "$SETTINGS" "$SETTINGS.plumbbob-bak"

# An entry is "ours" iff one of its hook commands lives under our hooks dir.
# Stripping ours before re-adding is what makes a re-run byte-identical.
# $dir below is a jq variable (--arg dir), not shell — single quotes are correct.
# shellcheck disable=SC2016
STRIP='
  def ours: [.hooks[]?.command // empty | contains($dir)] | any;
  .hooks //= {}
  | .hooks.PreToolUse = ((.hooks.PreToolUse // []) | map(select(ours | not)))
  | .hooks.PostToolUse = ((.hooks.PostToolUse // []) | map(select(ours | not)))
'

# shellcheck disable=SC2016
ADD='
  | .hooks.PreToolUse += [
      { matcher: "Edit|Write|MultiEdit|NotebookEdit",
        hooks: [ { type: "command", command: ($dir + "/pre-edit.sh") } ] },
      { matcher: "Bash",
        hooks: [ { type: "command", command: ($dir + "/bash-guard.sh") } ] }
    ]
  | .hooks.PostToolUse += [
      { matcher: "Edit|Write|MultiEdit|NotebookEdit",
        hooks: [ { type: "command", command: ($dir + "/post-edit.sh") } ] }
    ]
'

if [ "${1:-}" = "--uninstall" ]; then
  jq --arg dir "$HOOKS_DIR" "$STRIP" "$SETTINGS" >"$SETTINGS.tmp"
  mv "$SETTINGS.tmp" "$SETTINGS"
  echo "dev-install: removed Plumbbob hooks from $SETTINGS (backup: $SETTINGS.plumbbob-bak)"
else
  jq --arg dir "$HOOKS_DIR" "$STRIP $ADD" "$SETTINGS" >"$SETTINGS.tmp"
  mv "$SETTINGS.tmp" "$SETTINGS"
  echo "dev-install: registered Plumbbob hooks (from $HOOKS_DIR) in $SETTINGS"
  echo "dev-install: backup written to $SETTINGS.plumbbob-bak"
  echo "dev-install: restart Claude Code (or reload settings) for the hooks to take effect."
fi
