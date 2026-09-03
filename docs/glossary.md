# Glossary

The loop mints its vocabulary one term at a time, and each term is defined where it is
born. This page collects them, one line each, so a reader landing on any doc can look a
word up without reading the others first. Each entry points at the page that owns it.

## The plan

- **Intent** (`intent.md`): the file the deciding lands in before any code: the Frame,
  the Decisions, the Constraints, the Steps, and the Open questions. The chat is the
  hand; this is the head. → [`techniques.md`](techniques.md#externalize-the-plan-onto-two-durable-surfaces)
- **Frame**: the problem in plain words: what is wrong, the smallest thing that solves
  it, what done looks like, and what you are explicitly not doing.
- **Decision** (`D1 (slug)`): a settled call, one line, with the *because* that
  mattered. Cited everywhere with its slug, never as a bare number.
  → [`techniques.md`](techniques.md#decisions-before-code)
- **Constraint** (`C1 (slug)`): a hard rule the build must honor; the verify pass reads
  the diff against it.
- **Open question** (`Q1 (slug)`): a hole you could not settle on paper, expanded in
  place (a *plain* and a *lean* sub-line) so a human can answer it cold, never guessed
  into a Decision.
- **Step**: one small, verifiable increment, carrying a done-when and a seam. Its title
  is the commit subject it lands as. → [`techniques.md`](techniques.md#steps-as-small-verifiable-increments)
- **Done-when**: the step's finish line, ideally a test or check result, that the verify
  pass can actually check.
- **Seam**: the exact paths a step is expected to touch. Orientation, never a lock: a
  path outside it is a visible stray, not a refused edit.
- **Model recommendation** (`model:`): an advisory line under a step naming the smallest
  model that can carry it; `status` and every Next Up line surface it.

## The loop

- **Session**: one goal in one repo, opened by `plumbbob start` (which `/plumbbob:plan`
  runs for you) and closed by `finish`. Its record is the build folder.
  → [`happy-path.md`](happy-path.md)
- **Build folder** (`.plumbbob/builds/<slug>/`): the tracked record of one goal: intent,
  build log, checkpoints, stats, and the report. It rides the branch into the PR.
  → [`state-and-git.md`](state-and-git.md)
- **Build log** (`build-log.md`): the live ledger: the step mirror, the park list, the
  harvest, and a dated log line per landed step.
- **Boundary**: the settled state between steps, with nothing in flight. The dashboard
  calls it `DESIGN`; a step in flight is `BUILD`; an open spike is `SPIKE`. Phase is
  derived from files on disk, never stored.
  → [`techniques.md`](techniques.md#position-is-derived-not-stored)
- **The tick**: the five beats a step passes through to land: check, self-review,
  validate, pause, checkpoint. `/plumbbob:build` runs it after writing the code;
  `/plumbbob:verify` runs it over any diff.
  → [`techniques.md`](techniques.md#the-build-loop-and-the-verify-tick)
- **The pause**: where the tick stops and waits for you. The model presents the step and
  ends its turn; your next message advances it. A clock, not a lock.
  → [`presentation.md`](presentation.md)
- **Checkpoint**: one commit per verified step, recorded by SHA in the `checkpoints`
  file, landed only on a green check and your approval.
- **Baseline**: the commit `HEAD` sat on when the session opened; the floor every revert
  measures from.
- **The gate** (the heavy check): the full project check the tick refuses to checkpoint
  over. By default [checkride](https://www.npmjs.com/package/checkride), one run across
  the tools the repo configures; a `check` key in settings substitutes any command.
  → [`cli-reference.md`](cli-reference.md#check)
- **The latch**: the rule that `checkpoint` refuses to land a step until a human turn has
  landed since the step began, so a model cannot commit its own work past you. Enforced
  on the record, never on edits. → [`decisions.md`](decisions.md#d64)
- **Auto** (`--auto`, or a range like `1-3`): the one self-approval, granted only by a
  prompt you typed; the agent then approves in your place and halts on red or a mismatch.
- **Revert**: `git reset --hard` to a recorded checkpoint, with the build folder
  snapshotted across it so your plan and park lines survive.
- **Abandon**: the third exit from a step: drop the attempt, keep the diff in the tree,
  leave the step planned.
- **Park**: capture a mid-step idea as one tagged line in the build log, and go straight
  back to the step. → [`techniques.md`](techniques.md#capture-dont-chase-park-and-harvest)
- **Harvest**: triage the park list at a boundary; each item becomes a blocker, a
  tangent, or a pivot signal, and you call each one.
- **Spike**: a throwaway worktree experiment for a fork the plan cannot settle on paper;
  the deliverable is the verdict written back into intent, not the code.
  → [`techniques.md`](techniques.md#spikes-when-the-design-will-not-settle)
- **Finish**: the close-out: the report is written, the final commit made, the control
  state cleared. The folder stays.
- **Report** (`report.md`): what shipped and why, what was parked and how it was
  classified, and the deferred tangents, with the checkpoint SHAs and the per-step stats
  appended by the CLI.

## The turn

The shape every turn ends in is specified in [`presentation.md`](presentation.md); these
are its parts.

- **Summary**: the turn's opening line: the outcome, not the activity, then up to five
  numbered **highlights**, each a handle `expand` can open.
- **Readout**: the fenced rows of measured facts: `check`, `done-when`, `decisions`,
  `constraints`, `seam`, `diff`, `spent`. Green collapses to a count; red names one
  offender.
- **Verdict**: one line on a four-rung ladder, worst-of over the readout: `● Plumb`,
  `◐ A hair off` (green, with advisories on the way), `○ Out of plumb` (fix the work),
  `✗ Not standing` (fix the plan).
- **Next Up**: the forward pointer: the next step, its progress count, and its model
  recommendation.
- **Your Call**: the four replies a human makes at a pause, each with its outcome:
  `looks good`, `expand` (or any question), a direction, `revert`.
- **Recommendation**: the model's own call, the turn's last words: the move, then the
  reason.
- **Expand** (`expand 2`): the question that opens one highlight's full story from the detail
  file, changing nothing.
- **Detail file** (`.plumbbob/detail.md`): where the model writes its judgment before a
  pause; `handoff` renders the turn from it, and `checkpoint` folds it into the commit
  body. The file is the wire, and git is the archive.
- **Footer card**: the ending's last three parts (Verdict, Next Up, Your Call),
  CLI-rendered and relayed verbatim.
- **Tiers**: a *decision* turn (a pause) carries the whole block; an *orientation* turn
  (status, a boundary, finish) carries the lead line, the Verdict, and Next Up; a
  *driver* turn (park, spike, revert, use) carries the lead line and Next Up.
- **Relay**: the skill pasting the CLI's block as the whole turn, writing nothing before
  or after it.

## The machinery

- **Skill** (`/plumbbob:<verb>`): one of the fourteen slash commands you fire in Claude
  Code; every one is `disable-model-invocation`, so the model never fires one for you.
  → [`skills-reference.md`](skills-reference.md)
- **Verb** (`plumbbob <verb>`): the CLI underneath, which the skills shell out to; you
  never type it in normal use. → [`cli-reference.md`](cli-reference.md)
- **Sidecar** (`.plumbbob/`): everything PlumbBob keeps in your repo: a tracked artifact
  plane (settings and the build folders) and an untracked control plane (the session
  sentinel, the in-flight markers, the latch's counters).
  → [`state-and-git.md`](state-and-git.md)
- **Executor**: whatever turns a planned step into a diff. `/plumbbob:build` is the
  bundled one; your hands, another session, or another harness work the same, because
  the tick reads the diff, not the author.
- **User-authored agent**: any executable that speaks the JSON envelope (step context on
  stdin, one envelope on stdout, prose on stderr), bound to a step's `before`, `build`,
  or `after` slot in `harness.json`. It can inform the loop and never advance it.
  → [`agents.md`](agents.md)
- **Plumb**: true vertical, the builder's oldest reference. Intent is the line; every
  step is held against it.
