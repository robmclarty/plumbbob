#!/bin/sh
# bash-guard.sh — Plumbbob's assistive fence (D21), not a wall. PreToolUse on
# Bash. Session-gated. Blocks shell commands that poke control state or write
# files outside BUILD/SPIKE, so the muzzle is not trivially bypassed. Full
# shell-write detection is unsolvable; the residual gap is accepted (D21).

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

deny() {
  printf 'plumbbob: %s\n' "$1" >&2
  exit 2
}

root=$(find_root) || exit 0 # no session: allow

input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$command" ] && command=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -z "$command" ] && exit 0

state=$(tr -d '[:space:]' <"$root/.plumbbob/STATE" 2>/dev/null)

# Always: keep the model out of the control files and the escape hatch (D21).
case "$command" in
  *.plumbbob/STATE* | *.plumbbob/SEAM*)
    deny "blocked: do not touch .plumbbob/STATE or SEAM from the shell. Read state with \`plumbbob status\`; transitions are the human's verbs. Do not retry."
    ;;
esac
case "$command" in
  *"plumbbob mode"* | *"pb mode"* | *"plumbbob mode"*)
    deny "blocked: \`plumbbob mode\` is the human's escape hatch, not a model action. Do not retry — ask the human."
    ;;
esac

# Outside BUILD/SPIKE: block obvious file-writing shell patterns (D21).
case "$state" in
  BUILD | SPIKE) ;;
  *)
    # Strip redirects that can't write a real file (stderr merges, /dev/null
    # sinks) so read-only commands aren't over-blocked. Any surviving `>` is a
    # real write. The residual gap (e.g. `>/dev/nullEVIL`) is accepted (D21).
    scrubbed=$(printf '%s' "$command" | sed 's/[0-9]*>&[0-9-]//g; s/&\{0,1\}[0-9]*>>* *\/dev\/null//g')
    case "$scrubbed" in
      *">"* | *"tee "* | *"sed -i"* | *"git apply"*)
        deny "blocked: file-writing shell commands are not allowed in ${state:-?} (code edits happen in BUILD). Do not retry — park it or ask the human to \`plumbbob build <n>\`."
        ;;
    esac
    ;;
esac

exit 0
