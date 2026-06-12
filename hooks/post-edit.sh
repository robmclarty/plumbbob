#!/bin/sh
# post-edit.sh — light feedback (D25). PostToolUse, non-blocking, ALWAYS exits 0.
# Runs file-scoped oxlint + ast-grep on the changed file and injects any failures
# into the model's context via additionalContext (verified API, D3). No-ops when
# the tools are absent or there is no session. tsc is deferred to the heavy tier
# (D25): it has no true single-file mode and would tax every keystroke.

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

root=$(find_root) || exit 0 # no session: no feedback

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)
[ -z "$path" ] && path=$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -z "$path" ] && exit 0

case "$path" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs) ;;
  *) exit 0 ;;
esac
[ -f "$path" ] || exit 0

bin="$root/node_modules/.bin"
out=""
if [ -x "$bin/oxlint" ]; then
  o=$("$bin/oxlint" "$path" 2>&1) || out="${out}${o}
"
fi
if [ -x "$bin/ast-grep" ]; then
  a=$("$bin/ast-grep" scan "$path" 2>&1) || out="${out}${a}
"
fi

# Drop ast-grep's cosmetic postinstall notice (parked at step 1).
out=$(printf '%s' "$out" | grep -v 'postinstall script did not run' | grep -v 'Enable postinstall to avoid')

if [ -n "$(printf '%s' "$out" | tr -d '[:space:]')" ]; then
  ctx="Light check flagged $path:
$out"
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg c "$ctx" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $c}}'
  else
    esc=$(printf '%s' "$ctx" | awk 'BEGIN{ORS="\\n"} {gsub(/\\/,"\\\\"); gsub(/"/,"\\\""); print}')
    printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$esc"
  fi
fi

exit 0
