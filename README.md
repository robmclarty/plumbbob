# PlumbBob

<p align="center">
  <img src="hero.svg" alt="A row of plumb bobs of varying shapes hanging from strings" width="600">
</p>

<p align="center">
  <a href="https://robmclarty.github.io/plumbbob/">Website</a> ·
  <a href="https://robmclarty.github.io/plumbbob/docs.html">Docs</a> ·
  <a href="https://robmclarty.github.io/plumbbob/api.html">API reference</a>
</p>

> Plans are worthless, but planning is everything.
>
> *Dwight D. Eisenhower, 1957, repeating an Army saying*
>
> It is a bad plan that admits of no modification.
>
> *Publilius Syrus, first century BC, in D. Lyman's 1856 translation*

PlumbBob is a Claude Code plugin (sixteen skills, twenty-one CLI verbs, four hooks) that runs
LLM-assisted coding as a loop you control. You and the model settle the plan in a file
*before* any code, down to where the build will stop for you; then the model builds it
one small step at a time, each checked and committed on its own, and **stops where the
plan says the call is yours**, waiting for you to read what landed and approve it
before it goes on. It's built for the small-to-medium work that fills most days (a feature, a
bug, a refactor) where a fully autonomous build is overkill but freestyle prompting
leaves you dragged behind the model, reacting instead of deciding.

> Establish *plumb* before you build. The LLM is a hand, not a head.

Its one law is **vibe to execute, never vibe to decide**: the human owns every
decision, the LLM owns the labor, and the boundary between them is a **pause you
advance**, not a wall that refuses you.

**The plan is managed over the build, not only written before it.** A build runs into
what the plan never covered: a duration format nobody specified, or an idea that is a
tangent today and a blocker next week. The skills exist for that moment as much as for
the first plan. `/plumbbob:park` captures the stray in one line and the next stop card
sorts it into blocker, tangent, or pivot; `/plumbbob:step` and `/plumbbob:refine`
rewrite the plan to what you learned; `/plumbbob:order` re-cuts the build to follow;
`/plumbbob:spike` runs the experiment the plan cannot settle; a question you leave to
the work is marked deferred, not forgotten. Each change lands beside the code as plain
markdown with its *because*, so the record says why the plan moved as well as what
shipped.

A system prompt can *ask* a model to plan first and stop for review. What it can't do is
**hold the line when the model doesn't**, and that mechanical half is what PlumbBob adds
under the skills. The five edges that hold it (the CLI and git, not the model's goodwill),
and the effect of the latch (the CLI's refusal to record a step no human has approved),
measured rather than asserted, are in [`docs/why.md`](docs/why.md). This repository was
built using PlumbBob itself, running its own loop. **Guidance on the work, a latch on the
record.**

## The loop in one picture

<p align="center">
  <img src="site/media/loop-one-step.svg" alt="One step of the loop, drawn as a wall going up course by course: on the scaffold a person reads a plumb line at the corner, and down the wall a mechanical arm holds the next stone and waits" width="760">
</p>

Everything the model must stay true to lives in one file, the build's `intent.md` under
`.plumbbob/builds/<slug>/`, written before any code: the **Frame** (the problem, what done
looks like, what you are not doing), the **Decisions** and **Constraints** (each settled
call with its *because*), the **Steps** (each with a **done-when** to check it by and a
**seam** of files it may touch), and the **Build ranges** (where the build stops for your
call).

```text
/plumbbob:plan       decide everything on paper: frame, decisions, steps, ranges     (once)
  per range:
    /plumbbob:run        each step: implement → check → self-review → checkpoint
                         then STOP where the plan says: a step's pause, or the stop card
    (one reply)          → settle the stop; fire /plumbbob:run again
/plumbbob:finish     report what shipped and why, final commit, clear                (once)
```

`/plumbbob:build` is the same loop a step at a time, stopping at every step's pause, for
a plan without ranges or a stretch you want to walk slowly. Nothing is locked and nothing
refuses you: the loop does the labor, pulls up to the line, and waits for you to advance
it. **You are the clock.** [`docs/runs.md`](docs/runs.md) walks one plan through its runs
and then drives it by hand, the two side by side.

## Install

PlumbBob installs **once, globally** (like `gh` or your dotfiles), and both routes
register a Claude Code plugin named `plumbbob`, so pick one. From inside Claude Code, the
marketplace:

```text
/plugin marketplace add robmclarty/agent-tools
/plugin install plumbbob@robmclarty
```

From a terminal, npm global plus `init`:

```sh
npm i -g plumbbob      # the CLI (also a `pb` shorthand)
plumbbob init          # link it into Claude Code; --uninstall to undo
```

Restart Claude Code (or `/reload-plugins`) and `/plumbbob:doctor` confirms the wiring;
the full guide (namespacing, per-project sessions, and how to verify the wiring) is in
[`docs/install.md`](docs/install.md).

## Your first session

In Claude Code, inside a git repo with a clean tree and at least one commit:

1. **Plan.** Fire `/plumbbob:plan` with nothing (it interviews you), a rough line, or a
   path to a spec; together you fill the build's `intent.md`: the steps, and the build
   ranges that say where the build stops for your call. No code yet.
2. **Run.** Fire `/plumbbob:run`. It builds the range holding the next step and stops
   where the plan reserved your call: a step's pause (one block of fixed shape, the
   [turn anatomy](docs/presentation.md): the CLI measures the check, the seam, and the
   diff; the model supplies the judgment) or the stop card that reviews the range.
3. **Reply.** `looks good` lands the step as its own commit; a question shows more and
   changes nothing; a direction makes the change. Nothing lands until you approve, and
   re-firing `/plumbbob:run` is the clock tick.
4. **Fold in what you learned.** A stray idea goes to `/plumbbob:park`; the stop card
   proposes blocker, tangent, or pivot for it, and one reply settles the lot. When the
   surprise outgrows a park, `/plumbbob:step` or `/plumbbob:refine` rewrites the plan.
5. **Finish.** When the last range lands, answer its stop card with `/plumbbob:finish`:
   the report, the final commit, and the build folder riding the branch into the PR.

Every block above, as Claude Code renders it, is in [`docs/happy-path.md`](docs/happy-path.md).

## The skills

You drive the whole loop from Claude Code with `/plumbbob:*` skills. Every skill is
`disable-model-invocation`, so *you* fire every move, and `/plumbbob:status` always names
your next one. Many sessions need only the happy path: plan, run each range, finish.

| Skill | Does |
| --- | --- |
| `/plumbbob:plan` | open the session and author the whole plan: Frame, Decisions, Constraints, every Step, and the build ranges that say where the build stops for you |
| `/plumbbob:run` | run what is left of the range holding the next step and stop where the plan says: a step's pause, or the stop card that reviews the range and settles every parked idea in one reply |
| `/plumbbob:finish` | write the report, make the final commit, clear for the next goal |
| `/plumbbob:status` | where you are, the next step's done-when and seam, and the next move |

The other twelve (build, step, refine, order, spike, park, harvest, verify, revert,
abandon, recover, doctor), with inputs and effects, are in
[`docs/skills-reference.md`](docs/skills-reference.md). `/plumbbob:park` captures a stray
in one line without chasing it, and `/plumbbob:verify` lands a diff you wrote yourself,
since the check and self-review read the diff, not its author.

The skills shell out to the CLI, so in the loop you rarely type it. It is a first-class
path on its own: every verb runs from a terminal, and a few (`use`, `handoff`, `defer`,
`check`, `agent`) have no skill of their own. [`docs/cli-only.md`](docs/cli-only.md)
drives one build that way.

## Documentation

Each doc answers one question, in rough reading order for a new user:

- *What does a session look like?* → [`docs/happy-path.md`](docs/happy-path.md): one goal walked end to end; read this first.
- *Teach me the method, lesson by lesson.* → [`docs/learn/README.md`](docs/learn/README.md): the course map.
- *How do I drive a plan with runs, and what moves mid-build?* → [`docs/runs.md`](docs/runs.md)
- *Why this tool, and what can a prompt not replicate?* → [`docs/why.md`](docs/why.md)
- *Should I, can I, why not just…?* → [`docs/faq.md`](docs/faq.md)
- *What do the words mean?* → [`docs/glossary.md`](docs/glossary.md)
- *What does each skill do?* → [`docs/skills-reference.md`](docs/skills-reference.md): all sixteen.
- *Show me the artifacts it leaves behind.* → [`examples/`](examples/): a finished build folder, file by file.

The philosophy is [`docs/attention-first-development.md`](docs/attention-first-development.md).
Every other page (install, the CLI reference, state and git, agents, troubleshooting,
decisions, the essays) is indexed in [`docs/README.md`](docs/README.md) and on the
[site's docs page](https://robmclarty.github.io/plumbbob/docs.html).

## License

Licensed under the [Apache License 2.0](LICENSE).
