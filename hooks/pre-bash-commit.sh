#!/bin/sh
# pre-bash-commit.sh — the git-commit ask-hook — D66 (oob-commits-surfaced). PreToolUse on Bash: when a
# step is in flight and the model reaches for a raw `git commit`, turn that commit
# into a permission *question*, never a wall. checkpoint owns the landing (the latch
# lives there); this only nudges the human to route through it. ALWAYS exits 0 and
# never `deny`s — the human decides, C5 (additive-git) stays intact — D66 (oob-commits-surfaced). `plumbbob checkpoint`'s
# own internal `git commit` spawn never passes through hooks, so nothing self-trips.

# The repo root is the nearest ancestor with an active session — `.plumbbob/STATE`,
# the sentinel `start` writes and `finish` removes. Present in both the tracked and
# the `--local` layout (post-edit.sh only fires when STATE is non-empty, i.e. a
# tracked build; this hook must guard `--local` steps too, so it probes existence).
find_root() {
  d=$(pwd -P)
  while [ -n "$d" ]; do
    if [ -f "$d/.plumbbob/STATE" ]; then
      printf '%s' "$d"
      return 0
    fi
    [ "$d" = "/" ] && break
    d=$(dirname "$d")
  done
  return 1
}

root=$(find_root) || exit 0 # no active session here: nothing to guard

# The in-flight signal is STEP (cleared when the step checkpoints): inside the
# active build's folder when STATE names one, else the flat sidecar STEP of the
# `--local` layout. STATE's content IS the cursor — D28 (state-cursor) — read the first line, trim
# whitespace, and treat the legacy `active` sentinel (pre-STATE-cursor) as no cursor.
slug=$(head -n1 "$root/.plumbbob/STATE" 2>/dev/null | tr -d '[:space:]')
[ "$slug" = "active" ] && slug=""
if [ -n "$slug" ]; then
  step_file="$root/.plumbbob/builds/$slug/STEP"
else
  step_file="$root/.plumbbob/STEP"
fi
[ -f "$step_file" ] || exit 0 # no step in flight: silent

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && cmd=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -z "$cmd" ] && exit 0

# A command *mentioning* "git commit" is prose, not a commit — a grep pattern, an
# echoed sentence, a checkpoint --body heredoc. Best-effort strip before matching:
# drop heredoc bodies (everything below the first `<<` line; the operator line
# itself still counts, so `git commit -F- <<MSG` is caught) and quoted string
# contents. A real commit that follows a heredoc body in the same command slips
# through unasked — acceptable for an affordance that never gates.
stripped=$(printf '%s\n' "$cmd" |
  awk '{ print } /<</ { exit }' |
  sed -e "s/'[^']*'//g" -e 's/"[^"]*"//g')

# Match a `git … commit` invocation: `git` as a command word (start or after a
# non-word char), then — without crossing a shell separator (`&& || ; |`) — the
# `commit` subcommand as a whole word. This clears `git status`/`git diff`/`git log`
# (no `commit` word) and `git log --grep=commit` (`=commit`, no space before it),
# while still catching `git -C path commit` and `git commit -m …`.
printf '%s' "$stripped" |
  grep -Eq '(^|[^[:alnum:]_])git[[:space:]]+([^&|;]*[[:space:]])?commit([[:space:]]|$)' || exit 0

# A step is in flight and this is a raw commit: ask (never deny — the human decides).
# The reason is static, so a plain printf of the literal JSON needs no escaping.
printf '%s\n' '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": "plumbbob: a step is in flight — checkpoint owns the landing. Approve only if you asked for this commit."}}'

exit 0
