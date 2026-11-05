# FAQ

The questions people ask *before* and *while* adopting PlumbBob. If something is broken
rather than unclear, [`troubleshooting.md`](troubleshooting.md) is the page you want. The
skeptic's three questions, [plan mode](#why-not-just-use-plan-mode),
[git and a TODO file](#why-not-just-use-git-and-a-todo-file), and
[waiting for a vendor](#why-not-wait-for-a-vendor-to-ship-this-natively), are answered
straight at the end of this page, and [`why.md`](why.md) makes the case for the method as
a whole.

## Do I have to use `/plumbbob:build`?

No. `/plumbbob:build` is one executor, not the loop. Write a step by hand, vibe it in another
session, or produce it with another harness entirely, then run `/plumbbob:verify`: same check,
same pause, same checkpoint. The tick reads the *diff, not the author*.

## Can I plug in my own reviewer or builder?

Yes. A user-authored agent is any executable that speaks one small JSON envelope: drop it
under `.plumbbob/agents/`, bind it to a step's `before`, `build`, or `after` slot in the
build's `harness.json`, and it runs through the same pause with no verb to advance the
loop ([C6 (no-advance-verb)](decisions.md#c6)), so checkride still gates and you are still
the clock. The contract, with a copy-paste example, is in [`agents.md`](agents.md); a local
model reviewing every step is walked end to end in
[`local-model-review.md`](local-model-review.md).

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

Keep it local. Until the plan commit lands, the plan card offers the move by name,
`keep it local`, and typing it runs `plumbbob start --local`
([D117 (publish-on-the-card)](decisions.md#d117)); you can also run that command yourself
before the plan. Either way the whole `.plumbbob/` sidecar stays untracked and the
artifacts live at its root, at the cost of the build record dying with the worktree
instead of riding into the PR.

## What does the check gate actually run?

By default, [checkride](https://www.npmjs.com/package/checkride): one run across the
tools your repo already configures (types, lint, tests, dead code, docs, and the rest).
Repos that gate through something else set the `"check"` key in `.plumbbob/settings.json`
(`"check": "npm test"`, say) and that command is spawned verbatim instead. An override is
measured the same way as checkride: its exit code and captured output land under
`.check/`, so the pause's readout still carries a `check` row (`green: 1 of 1 checks`) and
offers the `looks good` move. `plumbbob doctor` prints exactly how the gate will resolve.

A repo with no tests or linters does not pass vacuously. Checkride runs whatever tools the
repo configures, and where it finds nothing it refuses to call an empty run green; `start`
warns you the moment you open the session. Either give it something to check (a
`tsconfig.json`, a `vitest.config.ts`, any tool it detects; `plumbbob doctor` prints the
table) or set `"check"` to your own command.

## What do I say at the pause?

One of four things, and the block names them every time. `looks good` lands the step as a
checkpoint. `expand` (with a number, `expand 2`, or any question at all) shows more of
what is there and changes nothing; the answer comes from the step's detail file, the diff,
or the build log's entry for an older step, never from memory. It closes on one line
pointing back at the step rather than on the whole block again, and `show the pause`
brings the block back whenever you want it. Anything that reads as direction is taken as what to
change, and nothing lands until you say `looks good`. `revert` winds the work back to the
last checkpoint. Inside a range that lands its steps, with steps still ahead of the one
paused, a fifth move rides second, beneath `looks good`: `/plumbbob:run` checkpoints this
step, then runs the rest of the range to its stop
([D95 (run-verb)](decisions.md#d95)). The shape of the whole block, and why it never
varies, is in [`presentation.md`](presentation.md).

A run's stop card takes the same kind of reply, once for the whole range. `looks good`
records the review and the class proposed for every parked idea, `make P3 a blocker`
changes one first, and `/plumbbob:run` records the card and runs the next range.

## How is a run different from typing `/plumbbob:build 2-3`?

Both land the steps a range names on green, each with its own check, self-review, and
checkpoint, and both stop where the range does. The run differs in who holds the numbers
and what you read at the end. You type `/plumbbob:run`, and the turn hook mints the grant
from the plan's own range, so after a harvest re-cuts that range the run walks the new one
without you working out `6,4-5` ([D96 (plan-names-the-grant)](decisions.md#d96)). A run's
range ends on the stop card, which reviews every step it landed and puts every parked idea
in front of you with a lean, settled in one reply; a typed range ends on its last step's
boundary, and the harvest is a turn of its own. In the worked example in
[`runs.md`](runs.md#the-same-plan-by-hand) the two cost 7 and 8 prompts, and a step at a
time costs 16.

## Can't the model just blow through the pause?

On the **work** plane, yes, and that is a deliberate trade
([D10 (pause-not-lock)](decisions.md#d10)): a hard lock on every edit buys ritual, not
control, because a determined model routes around it, and a denial mid-thought leaves no
legal move ([D13 (no-edit-guards)](decisions.md#d13)). The **record** is a different
plane, and there the tick is latched ([D64 (approval-latch)](decisions.md#d64)):
`checkpoint` refuses to land a step until a human turn has landed since the step began,
so the model cannot commit its own work past you, and the one grant it could once forge
(an `auto` in a settings file) no longer counts ([D67 (auto-not-a-grant)](decisions.md#d67)).
The refusal simply *is* the pause, mechanical at the one boundary the product is named
after, while what must be human stays human: you, reading the diff. PlumbBob enforces
deterministically where determinism works (`checkpoint` refuses on a red check, `revert`
restores only recorded SHAs). When a raw commit does slip the ledger, `status` says so
([D66 (oob-commits-surfaced)](decisions.md#d66)) and the checkpoint record makes recovery
one command; cheap recovery, not a cage, is the control that matters.

The latch's effect is measured rather than claimed. A headless eval harness sweeps the
loop with a prose-only baseline against the shipped latch, every assertion a mechanical
read of git and sidecar state, and each receipt lands under [`evals/`](evals/). The latest are
[2026-10-31-short-stop](evals/2026-10-31-short-stop.md) (c13, 5/5) and
[2026-10-31-reply-order](evals/2026-10-31-reply-order.md), with
[2026-10-27-feedback](evals/2026-10-27-feedback.md) and
[2026-10-27-show](evals/2026-10-27-show.md) beside them.

## Which model should I run?

Whichever you like; the plan may suggest one per step. `/plumbbob:plan` writes an advisory
`model:` line under a step when the signal is clear (a small model for mechanical wiring,
a frontier one for test authoring or design), `/plumbbob:status` and every Next Up surface
it, and switching is your `/model` call before the next run or build. A build range
carries a `model:` line of its own, the strongest any step inside it needs. Next Up names
the step's own model, never the range's ([D115 (card-weights)](decisions.md#d115)); the
range line beneath it names the next range and the model its run builds on
([D122 (next-range-under-next-up)](decisions.md#d122)). Nothing switches for you and
nothing refuses a step on the wrong model ([D62 (model-recommendation)](decisions.md#d62)).

## Can I work on more than one goal at once?

One build is active per worktree: the active-build cursor (the content of `.plumbbob/STATE`) is a
single value by construction. But builds are cheap to park and resume: `plumbbob use
<slug>` switches the cursor (an in-flight step survives the switch), and separate git
worktrees each carry their own cursor, so parallel goals live naturally in parallel
worktrees.

## Does it work outside Claude Code?

The skills are Claude Code skills, so Claude Code is the host that gets the whole loop:
the cards, the four hooks, the latch. The CLI underneath owes it nothing. The skills
shell out to the CLI, so in the loop you rarely type it. It is a first-class path on its
own: every verb runs from a terminal, and a few (`use`, `handoff`, `defer`, `check`,
`agent`) have no skill of their own. [`cli-only.md`](cli-only.md) drives one build that
way. The artifacts are plain markdown and ordinary git commits, so the method travels to
any other host, driven by hand.

## Sixteen skills: which ones do I actually use day to day?

Four: `/plumbbob:plan` once, `/plumbbob:run` per range, `/plumbbob:status` whenever you lose
the thread, `/plumbbob:finish` once. A run stops where the plan says, at a step's pause or
on the stop card that reviews what landed, and one reply settles either. `/plumbbob:park`
joins the moment a stray idea shows up mid-step, and the next stop card proposes a class for
it. The rest are situational: `/plumbbob:build` to take one step at a time (or for a plan
without ranges), `/plumbbob:verify` for a diff you wrote yourself,
`/plumbbob:step`/`/plumbbob:refine`/`/plumbbob:order` when the plan needs work,
`/plumbbob:harvest` at boundaries no stop card covers,
`/plumbbob:revert`/`/plumbbob:abandon`/`/plumbbob:spike` for rewinds, drops, and forks,
`/plumbbob:doctor` when the install misbehaves, and `/plumbbob:recover` when the session's own
state looks wrong.

## Is every task worth a session?

No: ceremony destroys attention too. A typo or a one-liner gets no session: just fix it.
A large, settled build wants a fully autonomous harness such as
[Ridgeline](https://github.com/robmclarty/ridgeline), which runs it without you. The full
loop earns its keep in between, from "contained bug" up to "feature touching a few
modules": a feature, a bug, a refactor. Sizing the process to the work is the skill
([`techniques.md`](techniques.md#calibration-size-the-process-to-the-work)).

## Why not just use plan mode?

Plan mode is the same instinct (decide before executing), scoped to one session. The plan
lives in the chat, so it fades with the context window, and the approval gates the *start*
of the work, not each increment of it. PlumbBob puts the plan in a file in your repo that
survives compaction, restarts, and next week. It moves the approval to **the stops the
plan names**, down to every step when you want it, with each step checked, reviewed
against the plan, and committed as its own checkpoint, so a wrong turn costs one step, not
the afternoon. And it records the *whys* alongside the decisions, so the record can still
answer "what did we decide, and why" long after the session is gone. The two compose
fine: plan mode (or anything else) can produce a step's diff, and `/plumbbob:verify` reads
it like any other.

## Why not just use git and a TODO file?

That is the honest skeleton, and if your discipline holds by willpower alone, it may be
all you need. What the CLI adds is the mechanical half of the discipline,
[the five edges](why.md#what-holds-when-the-model-would-not), so willpower is spent only at the
pause. The one edge not on that list: a status dashboard re-injected into every skill, so
the model re-orients on each move without you re-explaining the state.

## Why not wait for a vendor to ship this natively?

They are converging on it (plan modes, spec kits, native checkpoints), and that
convergence is evidence *for* the premise. PlumbBob is deliberately thin against that
future: the artifacts are plain markdown and ordinary git commits in your own repo, the
CLI is lean (node builtins plus one deliberate dependency), and nothing locks you in. The
investment is small (sixteen skills over a plain-markdown sidecar, learnable in an
afternoon), and what you are actually learning is the method: decisions before code, one
verified step at a time, capture instead of chase. That transfers to whatever tool wins.
If something better ships, you walk away with your archives and your habits intact.

---

*Not answered here? [`happy-path.md`](happy-path.md) shows a full session,
[`skills-reference.md`](skills-reference.md) and [`cli-reference.md`](cli-reference.md)
document every surface, and [`troubleshooting.md`](troubleshooting.md) covers the snags.*
