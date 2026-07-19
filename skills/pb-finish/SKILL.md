---
name: pb-finish
description: Finish the build — write the report (what shipped, decisions, parked/harvested items, deferred tangents), then make the final commit that closes the session. The build folder rides the branch into the PR — no separate archive. Report by default, no gate.
disable-model-invocation: true
allowed-tools: Read, Write, Bash(plumbbob status:*), Bash(plumbbob finish:*)
---

# PlumbBob — finish the build (the close-out)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/pb-finish` ends the build: it captures what happened, then makes the final commit
that closes the session. **Report by default** — no refuse-without-report gate,
and no separate docs phase. The build folder is tracked: it merges with the
branch and shows up in the PR, so there is nothing to archive — the folder *is* the
record.

## What this skill does, in order

1. **Write the report** to the active build's `report.md`
   (`.plumbbob/builds/<slug>/report.md`), from `intent.md` + `build-log.md`.
   The build-log's `## Log` is already the chronological history — `plumbbob checkpoint`
   wrote a dated line for every step as it landed. **Read it as the spine; do not
   re-narrate it.** The report adds only what the log does not already carry:
   - **What shipped** — summarize from the `## Log` timeline; don't rebuild it step by step.
   - **Decisions and why** — the settled calls that shaped the build (the *why* behind the log).
   - **Parked & harvested** — what was captured and how each was classified.
   - **Final status** — done or partial, and what is left.
   - **Deferred tangents** — the harvested items that become future work.
   This is the "yeah, I did that" artifact. Write it by default; the human may edit it.
2. **Finish.** Run `plumbbob finish`, which appends the checkpoint SHAs to the
   report and makes the final commit — subject `chore(<scope>): finish`, its body
   led by a `plumbbob finish` marker plus an optional proportional `--body` (the
   stdin heredoc) — then
   clears the control state (the in-flight markers, then `STATE` last — one delete
   drops both the session sentinel and the active-build cursor it carries). The
   build folder stays in place, committed, and rides the branch into the PR.
3. **Point at the next goal** — `/pb-plan` to frame the next one.

## The hard contracts

- **Report by default, never a gate.** Always offer the report; never wall the exit. A
  bug fix's report can be three lines — size it to the work.
- **The log is the history; the report is the synthesis.** `checkpoint` already recorded
  what shipped, step by step — finish applies the *unique additions* (the why, the deferred
  tangents, the final status), it does not rewrite the timeline.
- **The folder is the archive, never destroy**. `finish` keeps intent +
  build-log + report in `builds/<slug>/` and commits them; nothing is copied out and
  nothing is deleted but the untracked control markers.
- **No version bump, no docs phase.** Updating real docs is a separate, explicit ask;
  cutting a release is the human's `/version`.
