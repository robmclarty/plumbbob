# PlumbBob build: `--auto` and step ranges

Read by the build skill when it is invoked with `--auto`, a step range or a step list, and by
every `/plumbbob:run`, before the first step is entered. The step numbers below are the build
skill's own loop (`SKILL.md` beside this file).

## `--auto`: let the agent be the clock (opt-in)

`/plumbbob:build --auto` is the explicit escape hatch when the human wants unattended
progress instead of approving each step. It does the same work, but **the agent reviews
and approves in the human's place**, and it **chains**:

- Build the next step, running its slots (see `agents.md`) in the same
  order as the default path: bound `before`-agents → implement (or the bound `build`-agent) → bound
  `after`-agents → `check` → self-review → **if the check is green AND the
  self-review finds no proof / Decision / Constraint mismatch, checkpoint** and move
  straight on to the next planned step. Repeat. `--auto` adds no new machinery; the
  `after`-agent output simply feeds the *existing* self-review halt condition.
- **Stop and hand back to the human** the moment a halt arrives, and end the turn by the
  kind of halt it is
  ([D85 (range-top-lands)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d85)):
  - **A halt on trouble leaves a step unlanded.** The check is red (a red `plan` check
    that `plumbbob export` clears, as step 5 says, is no halt), the step's proof
    command is red (the checkpoint refused and recorded nothing), the checkpoint
    refused because `intent.md` was edited during the step (a grant covers the plan the
    human approved, so it recorded nothing and the step waits at its pause), the self-review finds
    a mismatch (surface exactly what, and do not checkpoint it), a bound agent returns
    `blocked` or `drift` (unblock-and-re-run, or `/plumbbob:refine`; an agent cannot
    advance the loop), or a new decision is needed. The step is still in flight and the
    human has a call to make about it, so end on the same turn the default pause does:
    write the detail file, run `plumbbob handoff`, and paste its block.
  - **A call the plan reserves halts at its pause.** A step the plan's `## Build ranges`
    names as a bare range (`/plumbbob:build 10`) is a decision the plan left for the human,
    and `plumbbob build` says so as it enters the step (`step 10 ends at its pause, where
    the plan reserves the call for the human`). Build it, verify it, and end on the same
    turn a halt on trouble does: write the detail file, run `plumbbob handoff`, and paste
    its block. The latch would let it land, since `--auto` grants every step, so keeping
    the step open is yours to do
    ([D94 (auto-and-stops)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d94)).
    A range that lands its steps runs through, since its stop is a review that can wait
    for the end of the run, and a typed range stays exactly as typed.
  - **A clean halt lands its step first.** The top of a requested range is reached (the
    next step in build order is one the range does not name, or none is left), or no
    planned steps remain, and `plumbbob build` names that step as it enters it (for
    example `step 3 is the last undone step in the plan`). That step checkpoints like
    every step before it, and its
    checkpoint's block is the whole ending: relay it with nothing written around it, then
    end the turn. Write no detail file and run no `handoff`, because nothing is pending.
    The block already carries the Verdict the step earned and a Next Up pointing at what
    comes next (the next undone step and its `- model:` recommendation, or the finish),
    which is what a fresh context window needs to pick the right `/model`.

`--auto` and a step range are the only paths that checkpoint without a human pause, and
only because the human asked for it by name. A range hands the clock back once its top
step has landed: the step after it waits for the human's next run. The default (no flag,
no range) always ends at the pause.

### A step range (`N-M`, or a list like `20,5-9`) is a bounded `--auto`

`/plumbbob:build 1-3` self-approves steps 1 through 3 exactly as `--auto` does, then **stops
once step 3 has landed** instead of chaining to done. A range may also list its steps, numbers
and spans joined by commas (`/plumbbob:build 20,5-9`, typed with or without a space after a
comma), and it grants exactly the steps it names: the checkpoint refuses any other
([D91 (step-list-grants)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d91)).
The range *is* the opt-in; you do not also pass `--auto`.

**A run hands you a range the plan names, walked the same way.** `/plumbbob:run` (the run
skill) reads this section for its walk: its grant is the `steps` list the turn hook minted
from the plan's `## Build ranges` when the human typed the run, in the normal form a typed
list mints, so the latch, `plumbbob build`'s notice at the top step, and every halt below
read it exactly as they read a typed range
([D96 (plan-names-the-grant)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d96)).

Run it as the `--auto` loop, walked in build order. **Start at the range's first undone step
in build order, however it is written** (`5-9,20` under an order that puts 20 first starts at
20), and after each landing take the next undone step in build order. Build it if the range
names it; **stop before building any step the range does not name**, or once none is left. It
adds no machinery: just the one more entry already in the halt list above, and it is a clean
halt, so the top step is never held back for approval. The human approved it by typing the
range, and `plumbbob build` says so as it enters that step:
`step 3 is the top of the range you granted`, or, when the walk ends early (the plan runs
out, or the next step in build order is one the range does not name),
`the last undone step in the range you granted`.

- **A range that parses**: build each step it names in build order, self-approving and
  checkpointing each, the last included, then relay the last one's checkpoint block and end
  the turn. `N-N` is a range like any other: it builds and lands the single step `N`. Only a
  bare `/plumbbob:build N` ends at the pause.
- **A range that does not parse** (for example `3-1`, or `1--3`): that is not a range you can
  walk, and it grants nothing; report it and stop rather than guess the intent.
- **A number past the last planned step** (for example `1-9` with three steps): build through
  the last planned step the range names and stop; that is the existing "no planned steps
  remain" halt, not an error. A number the plan lacks is never reached.
- **A step inside the range won't build** (its seam won't parse): `plumbbob build <n>` fails
  exactly as it always does; surface it and stop, the same as a red check. Do not skip past
  the gap.
- **The range starts above the next undone step** (the order reads `6, 4, 5` under
  `/plumbbob:build 4-5`): the first step enters as a single-number jump like `/plumbbob:build 4`
  would, with the skipped step noted. Once it lands, the next undone step in build order is
  the one you jumped, which the range does not name, so the halt above fires there, and
  `plumbbob build` names step 4 as the last undone step in the range, its detail naming step 6
  as the step the walk halts before. The range that walks the whole stretch names the jumped
  step too (`/plumbbob:build 6,4-5`).
- **The build order puts a step the range does not name inside it** (the order reads
  `1, 4, 2, 3` under `/plumbbob:build 1-3`): the halt above fires before step 4, and
  `plumbbob build` names step 1 as the last undone step in the range. The range that walks
  the whole stretch lists step 4 too (`/plumbbob:build 1-4`, or `/plumbbob:build 1,4,2,3`).
- **At a range's stop, harvest before the next range.** No harvest runs between the steps
  inside a range, so the parks pile up, and a blocker among them would otherwise ride into
  the next one. A run's range ends on the stop card, which lists every open park with a
  proposed class, and the reply that settles the card records them (the run skill's
  section on the reply at a stop). A range landed here, by a typed range, ends on the plain
  boundary instead; when the human asks what comes next there with parks open (the table's
  `Parked` row, `2 of 7 open`), the move is `/plumbbob:harvest`, then the run the card names.
- **After an early stop, settle the step, then rerun what is left.** A halt on trouble
  inside a range ends at that step's pause, and the grant ends with the turn. Once the
  human approves and the step lands, the range line beneath Next Up names the run that lands
  what is left of the range (`|  | **Range 3** on Opus: /plumbbob:run (steps 8-9) |`), and that is
  what the human types to carry on; `/plumbbob:build 8-9` lands the same steps by hand.
