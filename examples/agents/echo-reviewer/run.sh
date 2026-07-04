#!/usr/bin/env sh
# echo-reviewer — the reference agent from docs/agents.md.
#
# It reads the StepContext on stdin, narrates on STDERR (streamed live to the
# human's terminal), and writes exactly one envelope on STDOUT. That stream split
# IS the contract: everything you'd want to watch goes to stderr; only the single
# JSON result goes to stdout. This script uses only POSIX `sh` and needs nothing
# installed — no jq, no node — so it works as a drop-in you can read top to bottom.

set -eu

# 1. Read the whole StepContext (a single JSON object) from stdin to EOF.
#    A real agent would parse this; we just capture it so we can show the split.
input="$(cat)"

# 2. Narrate on STDERR — this is where logs, progress, and reasoning belong.
#    None of this can leak into the envelope, because the envelope is stdout only.
echo "echo-reviewer: read $(printf '%s' "$input" | wc -c | tr -d ' ') bytes of StepContext." 1>&2
echo "echo-reviewer: (a real agent would review the diff here and narrate as it goes)" 1>&2

# 3. Emit exactly ONE envelope on STDOUT, and nothing else.
#    - status "done": finished cleanly (vs "blocked" / "drift").
#    - parked[]: a stray idea PlumbBob will land through the park verb — the agent
#      never writes .plumbbob/ itself.
cat <<'ENVELOPE'
{
  "contract": 1,
  "status": "done",
  "summary": "echo-reviewer ran; nothing to flag on this step.",
  "body": "This is the reference agent — swap this script for your real review and keep the stream discipline: prose on stderr, one envelope on stdout.",
  "parked": ["example: a real reviewer might park a follow-up it noticed here"],
  "notes": ""
}
ENVELOPE
