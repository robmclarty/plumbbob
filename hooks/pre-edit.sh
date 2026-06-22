#!/bin/sh
# pre-edit.sh — Plumbbob muzzle + seam-guard. PreToolUse on
# Edit|Write|MultiEdit|NotebookEdit. Session-gated: a repo with no .plumbbob/
# session behaves exactly like plain Claude Code (C7). The dormant check is pure
# sh (test -f) before any JSON parsing, so a no-session edit pays ~nothing (C3).
# Built from the verified hooks API (D3): input is JSON on stdin
# (tool_input.file_path / notebook_path, absolute); deny is exit 2 + stderr.

# Walk up from the hook's physical cwd to the session root, like git finds .git.
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

# Seam membership (D23): exact whole-line match, or a `dir/` line by prefix.
in_seam() {
  _rel=$1
  _seam=$2
  [ -f "$_seam" ] || return 1
  grep -qFx "$_rel" "$_seam" && return 0
  while IFS= read -r _line || [ -n "$_line" ]; do
    case "$_line" in
      */)
        case "$_rel" in
          "$_line"*) return 0 ;;
        esac
        ;;
    esac
  done <"$_seam"
  return 1
}

deny() {
  printf 'plumbbob: %s\n' "$1" >&2
  exit 2
}

root=$(find_root) || exit 0 # no session anywhere above cwd: allow

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)
if [ -z "$path" ]; then
  path=$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
  [ -z "$path" ] && path=$(printf '%s' "$input" | sed -n 's/.*"notebook_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
fi
[ -z "$path" ] && exit 0 # nothing to guard: allow

state=$(tr -d '[:space:]' <"$root/.plumbbob/STATE" 2>/dev/null)

# Canonicalize the absolute tool path to repo-relative (D4).
case "$path" in
  "$root"/*) rel=${path#"$root"/} ;;
  *) rel=$path ;;
esac

# 1. The archive is read-only history — never writable (D6/D19).
case "$rel" in
  .plumbbob/archive/*)
    deny "blocked: $rel is archived history (read-only). Do not retry."
    ;;
esac

# 2. The three control docs are writable in every state, so DESIGN and FINISH can
#    do their work. Anchored exact paths — never a bare */intent.md suffix (D6).
case "$rel" in
  .plumbbob/intent.md | .plumbbob/build-log.md | .plumbbob/report.md)
    exit 0
    ;;
esac

# 3. docs/ is writable only in FINISH (D19).
case "$rel" in
  docs/*)
    [ "$state" = "FINISH" ] && exit 0
    deny "blocked: $rel (docs/) is writable only in FINISH — docs are projected at the end. Do not retry; park it or finish the build first."
    ;;
esac

# The seam muzzle below governs repo code only (D23). A path *outside* the repo
# (Claude's own plan-mode scratch in ~/.claude/plans, an editor tmpfile) and a
# git-ignored path *inside* it (fallow data, dist/, coverage/) are none of its
# business — never block them. `.plumbbob/` is itself git-ignored but is
# plumbbob's own control surface, so its non-doc files (STATE/SEAM/...) must stay
# governed by the muzzle, never skipped here.
case "$rel" in
  .plumbbob/*) ;; # control state: stays governed by the muzzle, never skipped
  *)
    # git resolves the path via the repo toplevel (robust to symlinked cwds).
    # check-ignore exit: 0 = ignored, 128 = outside the repo — neither is the
    # muzzle's business; 1 = in-repo, tracked territory -> fall through to it.
    git -C "$root" check-ignore -q -- "$path" 2>/dev/null
    [ "$?" -ne 1 ] && exit 0
    ;;
esac

# 4. Everything else is code: allowed only in BUILD, confined to the SEAM (D23).
#    SPIKE locks the main tree like DESIGN (D18) — spike edits live in dormant
#    worktrees, so the muzzle never needs to allow SPIKE here.
if [ "$state" = "BUILD" ]; then
  in_seam "$rel" "$root/.plumbbob/SEAM" && exit 0
  deny "blocked: $rel is outside the seam for this step. Do not retry — park it (\`plumbbob park\`), or ask the human to revise the step's seam in intent.md and re-run \`plumbbob build <n>\`."
fi

deny "blocked: code edits are not allowed in ${state:-?} (they happen in BUILD). Do not retry — if this needs doing it's a decision: park it (\`plumbbob park\`) or ask the human to \`plumbbob build <n>\`."
