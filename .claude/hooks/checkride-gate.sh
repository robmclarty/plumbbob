#!/bin/sh
# checkride-gate.sh — the claude stop-hook gate.
#
# checkride owns this file: `checkride agent-setup` (and `checkride init`)
# overwrite it on every run. Customize through checkride.config.json (a `gate`
# key narrows what runs) or the environment (CHECKRIDE_NODE_BIN), not by
# editing here — edits are lost on the next refresh.
#
# Runs the repo's `check` script as a hard gate, and reports the verdict in
# claude's hook protocol. See `checkride gate --help`.

# The Stop payload arrives as JSON on stdin and says whether the harness has
# already been round this loop once. Read it before anything else can consume
# it, and only from a pipe: `cat` on a terminal would hang a hand-run forever.
payload=''
[ -t 0 ] || payload=$(cat)

# True once the harness has already auto-submitted a turn on this hook.
retry() {
  printf %s "$payload" |
    grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true|"loop_count"[[:space:]]*:[[:space:]]*[1-9]'
}

# Give up on blocking, and say so. Nothing here is silent: a turn that ended
# unverified must never look like one that passed.
stand_down() {
  # `systemMessage` reaches the user — the one party who can fix an
  # environment. With no `decision` in the body, Claude Code does not block.
  printf '{"systemMessage":"%s"}\n' "$1"
  printf '%s\n' "$1" >&2
  exit 0
}

# Block the turn — unless this is the second consecutive attempt, in which
# case blocking is the thing already shown not to work.
block() {
  retry && stand_down "$1 Standing down rather than blocking a second time on the same verdict."
  printf '%s\n' "$1" >&2
  exit 2
}

if ! cd "${CURSOR_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-.}}"; then
  block 'checkride: the gate could not run — the project directory the harness named does not exist or cannot be entered, so there is no repo to check.'
fi

body=$(pnpm --config.verify-deps-before-run=false exec checkride gate --harness claude --if-dirty)
status=$?
# Claude Code parses a hook body only on exit 0, and only a body can carry a
# user-visible message alongside the block. So when checkride produced one,
# forward it and exit 0: the verdict rides in `decision`, not in the status.
case "$status" in
  0|2)
    if [ -n "$body" ]; then
      printf '%s\n' "$body"
      exit 0
    fi
    # No body — an older checkride that reports only through the exit code.
    exit "$status"
    ;;
esac

# Neither of checkride's two gate codes: checkride itself never ran. Which of
# the two reasons it was decides whether blocking could accomplish anything.
if [ -e node_modules/.bin/checkride ] || [ -e .pnp.cjs ] || [ -e .pnp.js ]; then
  block 'checkride: the gate could not run — checkride is installed here but `checkride gate` did not answer. Nothing ran: no check executed and no artifact was written, so `.check/` holds nothing from this turn. Run `pnpm exec checkride gate --harness claude` in a terminal to see the failure directly.'
fi
stand_down 'checkride: the gate could not run — checkride is not installed in this repo. Nothing ran: no check executed and no artifact was written, so `.check/` holds nothing from this turn. Run `pnpm install` (checkride is a devDependency of this repo), then run `pnpm check`. Not blocking: the fix is an install rather than an edit, so blocking would only repeat this message. Nothing was verified this turn.'
