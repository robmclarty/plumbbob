---
name: pb-reset
description: Close out the build — write the report (what shipped, decisions, parked/harvested items, deferred tangents), then archive intent + build-log + report and clear for a fresh goal. Report by default, no gate.
disable-model-invocation: true
model: opus
allowed-tools: Read, Write, Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ reset:*)
---

# Plumbbob — reset for a new goal (the close-out)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

`/pb-reset` ends the build: it captures what happened, archives it, and clears the
sidecar for the next goal. **Report by default** (D9) — no refuse-without-report gate,
and no separate docs phase.

## What this skill does, in order

1. **Write the report** to `.plumbbob/report.md`, from `intent.md` + `build-log.md`:
   - **What shipped** — the steps completed and what they delivered.
   - **Decisions and why** — the settled calls that shaped the build.
   - **Parked & harvested** — what was captured and how each was classified.
   - **Final status** — done or partial, and what is left.
   - **Deferred tangents** — the harvested items that become future work.
   This is the "yeah, I did that" artifact. Write it by default; the human may edit it.
2. **Archive & clear.** Run `__PLUMBBOB_BIN__ reset`, which appends the checkpoint SHAs
   to the report, archives intent + build-log + report to
   `.plumbbob/archive/<date>-<slug>/`, and clears the sidecar (STATE last). Git is not
   touched.
3. **Point at the next goal** — `/pb-plan` to frame the next one.

## The hard contracts

- **Report by default, never a gate.** Always offer the report; never wall the exit. A
  bug fix's report can be three lines — size it to the work.
- **Archive-then-clear, never destroy** (C4). The archive is the record; the active
  files only clear once they are safely copied.
- **No version bump, no docs phase.** Updating real docs is a separate, explicit ask;
  cutting a release is the human's `/version`.
