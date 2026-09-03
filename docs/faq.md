# FAQ

The questions people ask *before* and *while* adopting PlumbBob. If something is broken
rather than unclear, [`troubleshooting.md`](troubleshooting.md) is the page you want; if
you're asking "why not just use X instead," the [README](../README.md#why-not-just)
answers the skeptic's versions straight.

## Do I have to use `/plumbbob:build`?

No. `/plumbbob:build` is one executor, not the loop. Write a step by hand, vibe it in another
session, or produce it with another harness entirely, then run `/plumbbob:verify`: same check,
same pause, same checkpoint. The tick reads the *diff, not the author*.

## Can I adopt it mid-project?

Yes: that's the normal case. PlumbBob needs a git repo with at least one commit and a
clean tree, nothing more; there is no project-wide setup or migration. Sessions are
per-goal: fire `/plumbbob:plan` for the next feature or bug, and the rest of the repo never
knows PlumbBob was there.

## What ends up in my git history?

Only additive, Conventional-Commit subjects on your feature branch: one `chore(<scope>): plan`,
one `<type>(<scope>): <description>` per verified step, one `chore(<scope>): finish`. Each carries
a `plumbbob step N` (or `plumbbob plan`/`plumbbob finish`) marker in its body, so `git log --grep
plumbbob` still finds them all. Your normal squash-merge collapses them at PR time. The build's record
(`.plumbbob/builds/<slug>/` with the intent, log, checkpoints, and report) is tracked and
rides the branch into the PR, so the "what did we decide, and why" survives the merge.
PlumbBob never rewrites pushed history.

## Do my teammates need PlumbBob installed?

No. Everything it writes is plain markdown and ordinary git commits; a teammate reviews
the PR (including the build folder) with no tooling. The per-worktree control files
(`STATE`, `settings.local.json`, the in-flight markers) are excluded via your repo's local
`info/exclude`, not `.gitignore`, so nothing PlumbBob-specific is imposed on the repo.
[`state-and-git.md`](state-and-git.md) walks through exactly what that writes and why.

## What if my team won't track a tool folder in the repo?

Start with `plumbbob start --local` (or ask `/plumbbob:plan` for a local session): the whole
`.plumbbob/` sidecar stays untracked and the artifacts live at its root, at the cost of
the build record dying with the worktree instead of riding into the PR.

## What does the check gate actually run?

By default, [checkride](https://www.npmjs.com/package/checkride): one run across the
tools your repo already configures (types, lint, tests, dead code, docs …). Repos that
gate through something else set the `"check"` key in `.plumbbob/settings.json` (e.g.
`"check": "npm test"`) and that command is spawned verbatim instead. `plumbbob doctor`
prints exactly how the gate will resolve. A run where every slot skipped **refuses**
rather than passing vacuously.

## What do I say at the pause?

One of four things, and the block names them every time. `looks good` lands the step as a
checkpoint. `expand` (with a number, `expand 2`, or any question at all) shows more of
what is there and changes nothing; the answer comes from the step's detail file, the diff,
or `git show`, never from memory. Anything that reads as direction is taken as what to
change, and nothing lands until you say `looks good`. `revert` winds the work back to the
last checkpoint. The shape of the whole block, and why it never varies, is in
[`presentation.md`](presentation.md).

## Can't the model just blow through the pause?

On the **work** plane, yes, and that is a deliberate trade ([D10 (pause-not-lock)](decisions.md#d10)/[D13 (no-edit-guards)](decisions.md#d13) in
[`decisions.md`](decisions.md)): a hard lock on every edit buys ritual, not control,
because a determined model routes around it. The **record** is a different plane, and
there the tick is latched ([D64 (approval-latch)](decisions.md#d64)): `checkpoint` refuses
to land a step until a human turn has landed since the step began, so the model cannot
commit its own work past you, and the one grant it could once forge (an `auto` in a
settings file) no longer counts ([D67 (auto-not-a-grant)](decisions.md#d67)). PlumbBob
enforces deterministically where determinism works (`checkpoint` refuses on a red check,
`revert` restores only recorded SHAs), and when guidance does get blown through on the
work plane, the checkpoint record makes recovery one command. The latch's effect is
measured rather than claimed; the receipts are under [`evals/`](evals/).

## My repo has no tests or linters. Does the gate still work?

Not vacuously. The gate is checkride, which runs whatever tools the repo configures; a
repo where it finds nothing refuses to call an empty run green, and `start` warns you the
moment you open the session. Either give it something to check (a `tsconfig.json`, a
`vitest.config.ts`, any tool it detects; `plumbbob doctor` prints the table) or set
`"check"` in `.plumbbob/settings.json` to your own command (`"check": "npm test"`). An
override is measured the same way as checkride: its exit code and captured output land
under `.check/`, so the pause's readout still carries a `check` row (`green: 1 of 1
checks`) and offers the `looks good` move.

## Which model should I run?

Whichever you like; the plan may suggest one per step. `/plumbbob:plan` writes an advisory
`model:` line under a step when the signal is clear (a small model for mechanical wiring,
a frontier one for test authoring or design), `/plumbbob:status` and every `**Next Up**`
line surface it, and switching is your `/model` call before the next `/plumbbob:build`.
Nothing switches for you and nothing refuses a step on the wrong model
([D62 (model-recommendation)](decisions.md#d62)).

## Can I work on more than one goal at once?

One build is active per worktree: the active-build cursor (the content of `.plumbbob/STATE`) is a
single value by construction. But builds are cheap to park and resume: `plumbbob use
<slug>` switches the cursor (an in-flight step survives the switch), and separate git
worktrees each carry their own cursor, so parallel goals live naturally in parallel
worktrees.

## Does it work outside Claude Code?

Today, Claude Code is the first-class host: the skills are Claude Code skills. But the
CLI is deliberately host-neutral: every mechanical verb (`start`, `build`, `check`,
`checkpoint`, `revert`, …) works from any terminal, and the artifacts are plain markdown,
so you can drive the method from anywhere by hand. A `plumbbob init --host codex|cursor|zed`
is on the roadmap ([`install.md`](install.md#other-agents-roadmap)).

## Fourteen skills: which ones do I actually use day to day?

Four: `/plumbbob:plan` once, `/plumbbob:build` (or `/plumbbob:verify`) per step, `/plumbbob:status` whenever you
lose the thread, `/plumbbob:finish` once. `/plumbbob:park` joins the moment a stray idea shows up
mid-step. The rest are situational: `/plumbbob:step`/`/plumbbob:refine` when the plan needs work,
`/plumbbob:harvest` at boundaries, `/plumbbob:revert`/`/plumbbob:abandon`/`/plumbbob:spike` for rewinds, drops,
and forks, `/plumbbob:doctor` when the install misbehaves, and `/plumbbob:recover` when the session's own
state looks wrong.

## Is every task worth a session?

No: ceremony destroys attention too. A typo or a one-liner gets no session: just fix it.
The full loop earns its keep from "contained bug" up to "feature touching a few modules";
above that, reach for a fully autonomous harness. Sizing the process to the work is the
skill ([`techniques.md`](techniques.md#calibration-size-the-process-to-the-work)).

---

*Not answered here? [`happy-path.md`](happy-path.md) shows a full session,
[`skills-reference.md`](skills-reference.md) and [`cli-reference.md`](cli-reference.md)
document every surface, and [`troubleshooting.md`](troubleshooting.md) covers the snags.*
