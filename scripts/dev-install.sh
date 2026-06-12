#!/bin/sh
# dev-install.sh — register Plumbline's hooks in the global Claude Code settings
# for dogfooding, pointing them at THIS working tree's hooks/ (so edits to the
# hooks take effect with no re-copy). Step 8's `plumbline setup` is the real
# installer that copies hooks into ~/.claude/. This one is idempotent (run twice
# => byte-identical settings.json), writes a backup, and supports --uninstall.
#
# Usage:
#   scripts/dev-install.sh              install / re-sync
#   scripts/dev-install.sh --uninstall  remove Plumbline's hook entries
#
# Requires jq. The hooks are session-gated, so registering them globally is safe:
# a repo with no .plumbline/ session sees zero behavior change (C7).

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
cp "$SETTINGS" "$SETTINGS.plumbline-bak"

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
  echo "dev-install: removed Plumbline hooks from $SETTINGS (backup: $SETTINGS.plumbline-bak)"
else
  jq --arg dir "$HOOKS_DIR" "$STRIP $ADD" "$SETTINGS" >"$SETTINGS.tmp"
  mv "$SETTINGS.tmp" "$SETTINGS"
  echo "dev-install: registered Plumbline hooks (from $HOOKS_DIR) in $SETTINGS"
  echo "dev-install: backup written to $SETTINGS.plumbline-bak"
  echo "dev-install: restart Claude Code (or reload settings) for the hooks to take effect."
fi
