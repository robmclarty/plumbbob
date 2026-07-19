# FAQ

The questions people ask *before* and *while* adopting PlumbBob. If something is broken
rather than unclear, [`troubleshooting.md`](troubleshooting.md) is the page you want; if
you're asking "why not just use X instead," the [README](../README.md#why-not-just)
answers the skeptic's versions straight.

## Do I have to use `/pb-build`?

No. `/pb-build` is one executor, not the loop. Write a step by hand, vibe it in another
session, or produce it with another harness entirely, then run `/pb-verify` — same check,
same pause, same checkpoint. The tick reads the *diff, not the author*.

## Can I adopt it mid-project?

Yes — that's the normal case. PlumbBob needs a git repo with at least one commit and a
clean tree, nothing more; there is no project-wide setup or migration. Sessions are
per-goal: fire `/pb-plan` for the next feature or bug, and the rest of the repo never
knows PlumbBob was there.

## What ends up in my git history?

Only additive, Conventional-Commit subjects on your feature branch: one `chore(<scope>): plan`,
one `<type>(<scope>): <description>` per verified step, one `chore(<scope>): finish`. Each carries
a `plumbbob step N` (or `plumbbob plan`/`plumbbob finish`) marker in its body, so `git log --grep
plumbbob` still finds them all. Your normal squash-merge collapses them at PR time. The build's record —
`.plumbbob/builds/<slug>/` with the intent, log, checkpoints, and report — is tracked and
rides the branch into the PR, so the "what did we decide, and why" survives the merge.
PlumbBob never rewrites pushed history.

## Do my teammates need PlumbBob installed?

No. Everything it writes is plain markdown and ordinary git commits — a teammate reviews
the PR (including the build folder) with no tooling. The per-worktree control files
(`STATE`, `settings.local.json`, the in-flight markers) are excluded via your repo's local
`info/exclude`, not `.gitignore`, so nothing PlumbBob-specific is imposed on the repo.

## What if my team won't track a tool folder in the repo?

Start with `plumbbob start --local` (or ask `/pb-plan` for a local session): the whole
`.plumbbob/` sidecar stays untracked and the artifacts live at its root, at the cost of
the build record dying with the worktree instead of riding into the PR.

## What does the check gate actually run?

By default, [checkride](https://www.npmjs.com/package/checkride): one run across the
tools your repo already configures (types, lint, tests, dead code, docs …). Repos that
gate through something else set the `"check"` key in `.plumbbob/settings.json` (e.g.
`"check": "npm test"`) and that command is spawned verbatim instead. `plumbbob doctor`
prints exactly how the gate will resolve. A run where every slot skipped **refuses**
rather than passing vacuously.

## Can't the model just blow through the pause?

Yes — and that's a deliberate trade ([D10](decisions.md#d10)/[D13](decisions.md#d13) in [`decisions.md`](decisions.md)). A hard
lock buys ritual, not control: a determined model routes around it. PlumbBob enforces
deterministically where determinism works — `checkpoint` refuses on a red check, `revert`
restores only recorded SHAs — and when guidance does get blown through, the checkpoint
record makes recovery one command. Cheap recovery, not prevention, is the control that
matters.

## Can I work on more than one goal at once?

One build is active per worktree — the active-build cursor (the content of `.plumbbob/STATE`) is a
single value by construction. But builds are cheap to park and resume: `plumbbob use
<slug>` switches the cursor (an in-flight step survives the switch), and separate git
worktrees each carry their own cursor, so parallel goals live naturally in parallel
worktrees.

## Does it work outside Claude Code?

Today, Claude Code is the first-class host — the skills are Claude Code skills. But the
CLI is deliberately host-neutral: every mechanical verb (`start`, `build`, `check`,
`checkpoint`, `revert`, …) works from any terminal, and the artifacts are plain markdown,
so you can drive the method from anywhere by hand. A `plumbbob init --host codex|cursor|zed`
is on the roadmap ([`install.md`](install.md#other-agents-roadmap)).

## Twelve skills — which ones do I actually use day to day?

Four: `/pb-plan` once, `/pb-build` (or `/pb-verify`) per step, `/pb-status` whenever you
lose the thread, `/pb-finish` once. `/pb-park` joins the moment a stray idea shows up
mid-step. The rest are situational — `/pb-step`/`/pb-refine` when the plan needs work,
`/pb-harvest` at boundaries, `/pb-revert`/`/pb-spike` for recovery and forks, `/pb-doctor`
when the install misbehaves.

## Is every task worth a session?

No — ceremony destroys attention too. A typo or a one-liner gets no session: just fix it.
The full loop earns its keep from "contained bug" up to "feature touching a few modules";
above that, reach for a fully autonomous harness. Sizing the process to the work is the
skill ([`techniques.md`](techniques.md#calibration--size-the-process-to-the-work)).

---

*Not answered here? [`happy-path.md`](happy-path.md) shows a full session,
[`skills-reference.md`](skills-reference.md) and [`cli-reference.md`](cli-reference.md)
document every surface, and [`troubleshooting.md`](troubleshooting.md) covers the snags.*
