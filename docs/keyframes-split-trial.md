# The keyframes split trial

plumbbob is the first project to try splitting a keyframes plan by scope. keyframes' own plan
settles two calls: a plan that outgrows its budgets splits by scope instead of raising them
(grow-by-scope), and a project's decision history stays in a log outside the plan (log-apart).
Neither is built into `keyframes check` yet, so this trial is where the design gets its data.

plumbbob suits it because its record is far past one plan's budgets. `docs/decisions.md` holds 109
decisions and 7 constraints in 22,347 words; a keyframes plan allows 20 active decisions,
12 constraints and 2,000 words in all.

## What the trial makes

**The root plan holds only the core.** `keyframes.md` at the repo root keeps the principles,
constraints and decisions that hold across all of plumbbob, the ones an agent working anywhere
could break, and it stays inside every keyframes budget.

**The log stays where it is.** `docs/decisions.md` is not rewritten or trimmed. The plan cites it
for history instead of copying from it.

**A part gets a plan of its own only with a reason.** It must be a path the root plan's Map claims,
with rules that hold nowhere else, and its plan's Intent says why it stands alone. A part with one
or two rules of its own keeps them in the root plan.

## Who does what, in order

**Rob writes the root plan first, by hand.** He runs `npx @robmclarty/keyframes init` and times
himself writing from the template, as every keyframes pilot does. The order matters: a draft read
first would anchor his choices, and the trial would measure the draft instead of the format.

**Then an agent drafts the same split, without sight of Rob's.** It works in a fresh session from
the brief below, and writes its draft outside the repo (`~/Projects/plumbbob/split-trial/` on
Rob's machine), never into it.

**Then the two are compared**, as the last section describes.

## The brief for the drafting agent

Read the README, `AGENTS.md`, `CLAUDE.md`, everything in `docs/` with `docs/decisions.md` first,
each `skills/*/SKILL.md`, and the layout of `src/`. If a `keyframes.md` already exists, don't read
it: it's Rob's.

Write two files. The first is `keyframes.md`, the root plan, in the shape `init` writes, clean
under `npx @robmclarty/keyframes check` and inside every budget: 7 principles, 7 Map parts,
12 constraints, 12 taste items, 10 scenarios, 20 active decisions, 60 words an item and 2,000
words in all. The second is `placements.md`, one row for every decision and constraint in
`docs/decisions.md`: its ID there, its placement, the reason in a clause, and its part when the
placement is a part.

| Placement | Means |
| --- | --- |
| core | Holds across all of plumbbob; it goes in the root plan |
| part | Holds only inside one part; it goes in that part's plan |
| log | History, a superseded call, or a detail that isn't a standing rule; it stays only in the log |

An item that looks stale, or that the code contradicts, is not placed: it becomes an open Question
in the root plan, with its evidence. If a part earns a plan of its own, draft that plan too, beside
the others in the draft folder; it cites the root plan and never restates or overrides a core
item.

## How the trial is scored

**Agreement on the core, counted both ways.** Of Rob's core items, the share the agent also put in
the core; of the agent's core items, the share Rob kept. Each disagreement is written down with
both reasons, and those pairs become the rubric for storyboard's placement step, the planner that
will draft splits like this one.

**What `check` can't do yet.** For each part plan either side wrote, run
`npx @robmclarty/keyframes check <its folder>` and note what fails only because the plan is a part:
a citation of the root plan reads as broken, and pointers resolve from the part's folder. Those
notes are the design for scoped plans in keyframes.

**The minutes.** Rob's time to a clean root plan, beside the agent's.

The results go into keyframes' `docs/pilots.md`, in a section for plumbbob.
