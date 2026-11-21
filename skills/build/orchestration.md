# PlumbBob build: building with the host's sub-agents

Read by the build skill when `plumbbob status` shows the line
`orchestration  host: a step may be built by sub-agents, inside its seam`. The step numbers
below are the build skill's own loop (`SKILL.md` beside this file).

## Building with the host's sub-agents

When the dashboard carries the line
`orchestration  host: a step may be built by sub-agents, inside its seam`, the human has
set `orchestration` to `host` in the settings
(D167 (host-orchestration)). You are then the step's orchestrator as well as
its builder: you cut the work, hand it out, and answer for what comes back. Without the
line this section does not apply, and you never fan a step out on your own judgment.

- **Find the slices.** The step's `- note:` line names its split when the plan wrote one;
  follow it. With no note, cut along the seam's entries: one slice per `dir/` grant or
  per group of files that change together. Two slices that would touch one file are one
  slice. A step with a single slice is built by you, directly, as step 4 says.
- **Settle what the slices share before they run apart.** When one slice builds against
  another (a type, a function's signature, a file's name), write that part yourself first,
  or state it in every brief. Sub-agents that guess at each other's names cost a second
  round.
- **Brief each sub-agent with the step's contract, not your summary of it.** Give it its
  slice of the seam as paths, the step's proof as written, the Decisions and Constraints
  from `intent.md` verbatim, and the `like` files to read first. Tell it three things in
  as many lines: edit only inside the slice; run no `plumbbob` verb and no `git commit`;
  report anything it wanted to change outside the slice in its reply, without changing it.
- **Use the host's workflow tool for a wide step.** Where the host has one (in Claude Code,
  the Workflow tool), the build skill, typed by the human with the setting on, is the
  instruction to use it for a step of three slices or more, or one whose note asks for a
  review stage: one agent per slice, then a reviewer over the joined diff when the note
  names one. For two slices, start plain sub-agents side by side. On a host with neither,
  build the step yourself and say so in the Summary's lead.
- **Join the work yourself.** When the sub-agents return, read the whole diff against the
  seam and the proof. Park each tangent they reported with `plumbbob park`; a change one
  made outside its slice is scope drift, to surface as step 4 says. Run the proof's
  command and fix what it shows, with a sub-agent or by hand, before the verify tick.
- **One step, one card.** However many agents built it, the step ends on one verify tick
  and one pause, written by you. Name the split in the Summary: how many slices, what
  each covered, and what the join changed. No sub-agent runs `plumbbob handoff` or
  `plumbbob checkpoint`, and none is asked whether the step is done.

A `build`-slot agent bound to the step outranks the setting: run it as `agents.md` says and do not fan out beside it, since a step has one author. `before` and
`after` agents run as they always do, around the whole step. Under `--auto` or a range
the setting changes nothing about the halts: a red check, a red proof or a mismatch still
stops the run.
