# PlumbBob build: running bound agents

Read by the build skill when `plumbbob status` shows a `harness bindings:` block. The step
numbers below are the build skill's own loop (`SKILL.md` beside this file).

## Running bound agents

Skip this section unless `plumbbob status` shows a `harness bindings:` block. Nearly every
build binds **no** agents; for them the build skill's default path is the whole story. When a
harness *is* bound, this is what each affected step gains, in lifecycle order.

- **`before`: load context in (step 3).** If the `harness bindings:` block binds agents to
  this step's `before` slot (in `harness.json` or in settings), run `plumbbob agent run --step <n> --mode before` first: each
  returns a validated envelope on stdout that plumbbob also appends to the step's
  `handoff.json`, and its `summary`/`body` become **context you read into the build** (that
  is the whole point of the slot: load the context in before you write). No binding, or no
  harness, is a clean no-op: just build.
- **`build`: delegate the diff (step 4).** If a `build`-slot agent is bound, run
  `plumbbob agent run --step <n> --mode build` and let that agent author the step's code
  instead of writing it yourself; its envelope reports what it did. You still own the verify
  tick; the diff is reviewed the same way whoever wrote it.
- **A manifest's `when` prose is your cue to run an agent mid-build (step 4).** The three
  slots are the only *declarative* lifecycle points; there is no config for "a salient
  moment in the middle." That is judgment, and you are the frontier model in the room: when
  the work reaches the situation a bound agent's `when` (or a step `note`) describes, run
  `plumbbob agent run <name> --step <n>` yourself. Prose is the orchestration language; you
  are the workflow engine.
- **Route a non-`done` envelope by its status (step 4).** An agent that returns `blocked`
  couldn't finish (missing input, failed precondition): surface its `notes`, let the human
  unblock, and re-run it; don't work around it. One that returns `drift` finished but found
  the plan no longer matches reality: **stop and send the human to `/plumbbob:refine`** to repair
  the plan before continuing, rather than building on a plan that's now wrong. A non-zero
  exit is a failed run: report it and stop.
- **`after`: advisory input to the verify tick (step 5).** After `plumbbob check`, run any
  bound `after`-agents (`plumbbob agent run --step <n> --mode after`) and fold their
  envelopes into the self-review as **advisory input**; they inform, they never gate
  (checkride gates, the human is the clock; an `after`-agent that could fail a step would
  be the old lock back in another form). What an agent saved and named in its envelope's
  `evidence[]` (a screenshot, a trace) is the CLI's to show: `plumbbob handoff` lists each
  piece as a link under the Readout, so leave the paths out of your review, and never
  treat one as proof the step is done
  ([D157 (evidence-is-shown)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d157)).
