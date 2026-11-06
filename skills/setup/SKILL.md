---
name: setup
description: "Human-triggered driver for `plumbbob setup`: get a repo that has never used plumbbob ready for its first build. It adds only what is missing: the `.plumbbob/` folder, an empty `settings.json`, and the git excludes for the control files."
disable-model-invocation: true
model: haiku
allowed-tools: Bash(plumbbob setup:*)
---

# PlumbBob: set up a repo (driver)

This is a **driver skill**: a chat-side trigger for the mechanical `plumbbob setup` verb. It is
`disable-model-invocation: true`: only the human fires it. It carries **no Edit and no Write
tool**; it shells the verb and relays its output verbatim, refusal included. The CLI is the
source of truth: never retry a refused setup, and never edit a file to work around one.

Setup is the move before the first `/plumbbob:plan`. It opens no session and records no
baseline (`plumbbob start` does both, when the plan skill runs it). What it adds, each only
when it is missing:

- the `.plumbbob/` folder at the repo root;
- `.plumbbob/settings.json`, seeded as `{}`, since an absent key already is the default;
- one line per control file (`STATE`, `TURN`, `PROMPT`, `RELAY`, the in-flight markers
  inside each build, and `.check/`) in the clone's `.git/info/exclude`, so git never
  tracks them.

Every write is additive. An existing folder or settings file is left as it is, a line
already in the exclude file is not written twice, and a clone that keeps the whole sidecar
local (the `.plumbbob/` line a `plumbbob start --local` writes) keeps it that way. A second
run adds nothing and says so.

## What it does

1. Run `plumbbob setup` via Bash. It writes only the pieces above that are missing.
2. Relay the verb's output verbatim: the `**Setup**:` lead line naming what it added (or
   that it was already in place), and any advisory beneath it. Relay that block whole and
   run no second command.
3. An advisory is guidance, never a failure, so name it and stop:
   - **no commits yet**: `plumbbob start` records a baseline commit, so the human makes an
     initial commit before `/plumbbob:plan`;
   - **git still sees a control file**: the file is already tracked, or a pattern
     re-includes it; the advisory's own remedy says which fix applies;
   - **the repo ignores `.plumbbob/`**: build folders cannot ride the branch, and plan and
     finish commits land record-only.
4. A refusal (not a git repository, or a legacy flat sidecar that `plumbbob doctor
   --migrate` moves first) carries its own remedy line. Relay it and end the turn.
5. If the output shows `command not found`, the CLI is not on PATH: for a marketplace
   install, confirm the plugin is enabled in `/plugin`, then `/reload-plugins`; for a
   skills-dir or global install, run `npm i -g plumbbob && plumbbob init`.

`/plumbbob:doctor` reports the same readiness without writing anything: its repo setup
section warns about each missing piece, and a repo set up by hand reads as ready once git
ignores every control file.
