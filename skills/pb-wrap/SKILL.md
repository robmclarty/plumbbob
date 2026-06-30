---
name: pb-wrap
description: Wrap up the build — write the report (what shipped, decisions, parked/harvested items, deferred tangents), then safely archive intent + build-log + report before clearing for a fresh goal. Archive-then-clear, never destroy. Report by default, no gate.
disable-model-invocation: true
model: opus
allowed-tools: Read, Write, Bash(plumbbob status:*), Bash(plumbbob wrap:*)
---

# Plumbbob — wrap the build (the close-out)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not found - install the dep and re-run: npm i -g plumbbob && plumbbob init"`

`/pb-wrap` ends the build: it captures what happened, archives it, and clears the
sidecar for the next goal. **Report by default** (D9) — no refuse-without-report gate,
and no separate docs phase.

## What this skill does, in order

1. **Write the report** to `.plumbbob/report.md`, from `intent.md` + `build-log.md`.
   The build-log's `## Log` is already the chronological history — `plumbbob checkpoint`
   wrote a dated line for every step as it landed. **Read it as the spine; do not
   re-narrate it.** The report adds only what the log does not already carry:
   - **What shipped** — summarize from the `## Log` timeline; don't rebuild it step by step.
   - **Decisions and why** — the settled calls that shaped the build (the *why* behind the log).
   - **Parked & harvested** — what was captured and how each was classified.
   - **Final status** — done or partial, and what is left.
   - **Deferred tangents** — the harvested items that become future work.
   This is the "yeah, I did that" artifact. Write it by default; the human may edit it.
2. **Archive & clear.** Run `plumbbob wrap`, which appends the checkpoint SHAs
   to the report, archives intent + build-log + report to
   `.plumbbob/archive/<date>-<slug>/`, and clears the sidecar (STATE last). Git is not
   touched.
3. **Point at the next goal** — `/pb-plan` to frame the next one.

## The hard contracts

- **Report by default, never a gate.** Always offer the report; never wall the exit. A
  bug fix's report can be three lines — size it to the work.
- **The log is the history; the report is the synthesis.** `checkpoint` already recorded
  what shipped, step by step — wrap applies the *unique additions* (the why, the deferred
  tangents, the final status), it does not rewrite the timeline.
- **Archive-then-clear, never destroy** (C4). The archive is the record; the active
  files only clear once they are safely copied.
- **No version bump, no docs phase.** Updating real docs is a separate, explicit ask;
  cutting a release is the human's `/version`.
