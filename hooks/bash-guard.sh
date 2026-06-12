#!/bin/sh
# bash-guard.sh — Plumbline's assistive fence (D21), not a wall. PreToolUse on
# Bash. Session-gated. Blocks shell commands that poke control state or write
# files outside BUILD/SPIKE, so the muzzle is not trivially bypassed. Full
# shell-write detection is unsolvable; the residual gap is accepted (D21).

find_root() {
  d=$(pwd -P)
  while [ -n "$d" ]; do
    if [ -f "$d/.plumbline/STATE" ]; then
      printf '%s' "$d"
      return 0
    fi
    [ "$d" = "/" ] && break
    d=$(dirname "$d")
  done
  return 1
}

deny() {
  printf 'plumbline: %s\n' "$1" >&2
  exit 2
}

root=$(find_root) || exit 0 # no session: allow

input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$command" ] && command=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -z "$command" ] && exit 0

state=$(tr -d '[:space:]' <"$root/.plumbline/STATE" 2>/dev/null)

# Always: keep the model out of the control files and the escape hatch (D21).
case "$command" in
  *.plumbline/STATE* | *.plumbline/SEAM*)
    deny "blocked: do not touch .plumbline/STATE or SEAM from the shell. Read state with \`plumbline status\`; transitions are the human's verbs. Do not retry."
    ;;
esac
case "$command" in
  *"plumbline mode"*)
    deny "blocked: \`plumbline mode\` is the human's escape hatch, not a model action. Do not retry — ask the human."
    ;;
esac

# Outside BUILD/SPIKE: block obvious file-writing shell patterns (D21).
case "$state" in
  BUILD | SPIKE) ;;
  *)
    case "$command" in
      *">"* | *"tee "* | *"sed -i"* | *"git apply"*)
        deny "blocked: file-writing shell commands are not allowed in ${state:-?} (code edits happen in BUILD). Do not retry — park it or ask the human to \`plumbline build <n>\`."
        ;;
    esac
    ;;
esac

exit 0
