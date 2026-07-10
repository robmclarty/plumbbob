#!/bin/sh
# pre-bash-commit.sh — the git-commit ask-hook (D66). PreToolUse on Bash: when a
# step is in flight and the model reaches for a raw `git commit`, turn that commit
# into a permission *question*, never a wall. checkpoint owns the landing (the latch
# lives there); this only nudges the human to route through it. ALWAYS exits 0 and
# never `deny`s — the human decides, C5 stays intact (D66). `plumbbob checkpoint`'s
# own internal `git commit` spawn never passes through hooks, so nothing self-trips.

# The repo root is the nearest ancestor whose .plumbbob/settings.local.json carries
# an `activeBuild` cursor — the per-worktree "a tracked build is live here" signal
# (D28), the same probe post-edit.sh uses. A plain grep, no JSON parse.
find_root() {
  d=$(pwd -P)
  while [ -n "$d" ]; do
    if [ -f "$d/.plumbbob/settings.local.json" ] &&
      grep -q '"activeBuild"' "$d/.plumbbob/settings.local.json" 2>/dev/null; then
      printf '%s' "$d"
      return 0
    fi
    [ "$d" = "/" ] && break
    d=$(dirname "$d")
  done
  return 1
}

root=$(find_root) || exit 0 # no active build here: nothing to guard

# The active build's slug names its folder under builds/; STEP inside it is the
# in-flight signal (cleared when the step checkpoints). jq if present, else the same
# sed fallback post-edit.sh uses for its field read.
settings="$root/.plumbbob/settings.local.json"
slug=$(jq -r '.activeBuild // empty' "$settings" 2>/dev/null)
[ -z "$slug" ] && slug=$(sed -n 's/.*"activeBuild"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$settings" | head -n1)
[ -z "$slug" ] && exit 0
[ -f "$root/.plumbbob/builds/$slug/STEP" ] || exit 0 # no step in flight: silent

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && cmd=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -z "$cmd" ] && exit 0

# Match a `git … commit` invocation: `git` as a command word (start or after a
# non-word char), then — without crossing a shell separator (`&& || ; |`) — the
# `commit` subcommand as a whole word. This clears `git status`/`git diff`/`git log`
# (no `commit` word) and `git log --grep=commit` (`=commit`, no space before it),
# while still catching `git -C path commit` and `git commit -m …`.
printf '%s' "$cmd" |
  grep -Eq '(^|[^[:alnum:]_])git[[:space:]]+([^&|;]*[[:space:]])?commit([[:space:]]|$)' || exit 0

# A step is in flight and this is a raw commit: ask (never deny — the human decides).
# The reason is static, so a plain printf of the literal JSON needs no escaping.
printf '%s\n' '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": "plumbbob: a step is in flight — checkpoint owns the landing. Approve only if you asked for this commit."}}'

exit 0
