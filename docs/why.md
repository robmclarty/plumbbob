# Why PlumbBob

The case for PlumbBob: who it is for, the one law, the five edges the CLI holds when the
model would not, what the receipts measured, and where it sits. The pitch and the first
session are in the [README](../README.md).

## Who it is for

- **You already build with a coding agent and end the day reviewing a wall of diff.**
  PlumbBob turns that wall into small steps, each its own commit, and stops for your
  review where the plan says one is due, with every step small enough to read as an
  editor.
- **You are skeptical of AI-written code.** Nothing lands without a green check, a
  self-review against the plan, and your say-so, and the CLI refuses to record a step
  the model approved for itself.
- **You would rather not learn a tool.** Everything it writes is markdown and ordinary
  git commits in your own repo; the skills are slash commands, and `/plumbbob:status`
  always names the next one. A [glossary](glossary.md) covers the words it mints.

Not for a typo, and not for a rewrite. A one-line fix needs no session, and a large,
settled build wants an autonomous harness such as
[Ridgeline](https://github.com/robmclarty/ridgeline). The loop earns its keep in between:
a feature, a bug, a refactor.

## The one law

The one law, vibe to execute, never vibe to decide, is stated and earned in the
[README](../README.md#plumbbob); the boundary it draws is a pause rather than a lock on
purpose ([D10 (pause-not-lock)](decisions.md#d10)). The *why* behind that, attention as
the scarce resource, is in
[`attention-first-development.md`](attention-first-development.md).

## What holds when the model would not

The README names the mechanical half; these are its five edges, enforced by the CLI and
git rather than by the model's goodwill:

- **A gate that refuses red.** `checkpoint` won't record a step while the check gate is
  red, and `start` refuses a dirty tree: the [checkride](https://www.npmjs.com/package/checkride)
  run (types, lint, tests, dead code, docs) has to pass before a step lands.
- **One SHA per verified step.** Every approved step is its own git commit against a
  recorded baseline: a ledger of checkpoints, not one undifferentiated diff at the end.
- **A preservation-aware revert.** `/plumbbob:revert` resets exactly to a recorded checkpoint
  SHA while keeping your plan and notes intact, and restores *only* SHAs the loop wrote.
- **A build record that rides the PR.** The tracked `builds/<slug>/` folder (intent, log,
  checkpoints, report) merges into `main` with the branch instead of dying with the
  worktree; the archive never destroys.
- **The approval latch.** `checkpoint` refuses to land a step until the harness records a
  human turn since that step began
  ([D64 (approval-latch)](decisions.md#d64) to [D66 (oob-commits-surfaced)](decisions.md#d66),
  the ledger-plane enforcement), so the model can't self-commit past you: the refusal
  *is* the pause.

![The record in the wall, drawn: the scaffold is down and stacked on the ground, a bench mark is cut into the end stone of every course, and in the open cornerstone lie the rolled plan, tied with the red line, and the ledger, laid into the wall to stay](../site/media/build-record.svg)

Each has its decision on record: the gate ([D32 (checkride-gate)](decisions.md#d32))
and its clean baseline ([D22 (clean-baseline)](decisions.md#d22)), the folder per build
([D26 (build-folders)](decisions.md#d26)) under the rule that nothing destroys
([C4 (never-destroy)](decisions.md#c4)), and the grants only a prompt you typed can mint
([D65 (human-typed-grants)](decisions.md#d65)).

## Measured, not asserted

The latch's payoff is measured, not asserted. A headless skill-eval harness
([`test/evals/`](../test/evals/)) sweeps the loop against a fresh fixture repo, every
assertion a mechanical read of git and sidecar state, and writes each receipt under
[`evals/`](evals/README.md). The baseline arm is the plugin with its hooks stripped; the
latched arm is the plugin as shipped. On the first sweep
([2026-07-11](evals/2026-07-11.md)) the route the latch owns, *no checkpoint over a red
check under pressure*, went from **2/5 prose-only to 5/5 latched**, and every sweep since
has held it. [2026-09-03](evals/2026-09-03.md) began scoring the shape of the turn itself,
and [2026-10-19](evals/2026-10-19.md) held a run to its stop card, 5/5. The latest receipts,
[2026-10-31-short-stop](evals/2026-10-31-short-stop.md) (a short stop card after an
approved halt, 5/5) and [2026-10-31-reply-order](evals/2026-10-31-reply-order.md) (a
question at the pause and feedback at the pause, 5/5 each), ran the latched arm alone.

## The name

The name is the method. A plumb bob is a weight on a string; gravity pulls it into a
vertical line, the builder's oldest reference for *true*: the fixed mark you hold the
work against so it never drifts out of square. PlumbBob hangs your
**intent** as that line and keeps every step aligned to it, so the build stays plumb
with what you decided instead of wandering off behind the model. The line is the
reference the work is re-trued against, and it does not move when the step list does:
park, harvest, step, refine, and order rewrite the courses, and the line stays where you
hung it.

## The skeptic's questions

The questions a skeptic should ask are answered straight in the FAQ, and not repeated
here: [why not just use plan mode](faq.md#why-not-just-use-plan-mode),
[why not just use git and a TODO file](faq.md#why-not-just-use-git-and-a-todo-file),
[why not wait for a vendor to ship this natively](faq.md#why-not-wait-for-a-vendor-to-ship-this-natively),
and the one the latch exists to answer,
[can't the model just blow through the pause?](faq.md#cant-the-model-just-blow-through-the-pause)

## Where it sits

PlumbBob is the layer below [Ridgeline](https://github.com/robmclarty/ridgeline) and
above vibing;
[`attention-first-development.md`](attention-first-development.md#where-it-sits-and-when-to-reach-for-it)
sorts the three. This repository was built with it.

## Further reading

- [`balancing-attention.md`](balancing-attention.md): where the automation line sits in the loop, and what stays on your side of it.
- [`staying-plumb.md`](staying-plumb.md): what to do when the plan meets what it did not cover, verb by verb.
- [`managing-agents.md`](managing-agents.md): the four house rules for a crew you do not trust blind.
- [`cli-only.md`](cli-only.md): one build driven from a terminal, with no skill in the loop.
- [`learn/README.md`](learn/README.md): the course, lesson by lesson.
