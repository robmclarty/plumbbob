# plumbbob

## Intent

PlumbBob is a Claude Code plugin and a small CLI that runs LLM-assisted coding as a loop a
person controls. The person and the model settle the plan in a file before any code; the model
builds it one checked, committed step at a time, and stops where the plan says the call is the
person's. Its real job is not the first plan but keeping the plan true as the build learns.

- **For:** a developer doing the small-to-medium work that fills most days, who wants the
  model's speed without being dragged behind it.
- **Good looks like:** at the end of a build, the person can say what shipped and why, and the
  build folder says the same, in plain text beside the code.
- **Not:** an autonomous agent, a lock on the model, a project tracker, or a replacement for
  review.

Each Constraint and Decision here keeps its number and slug from `docs/decisions.md`, which
stays the log.

## Principles

- **P1 (decide-not-execute)**: The person owns every decision and the model owns the labor.
  Vibe to execute, never vibe to decide.
  - because: a model that decides as well as builds leaves the person reacting to a plan they
    never made.
- **P2 (durable-plan)**: The plan lives in a file in the repo, not in a chat or a head.
  - because: what is not written down washes downstream with the next long turn.
- **P3 (decision-not-diff)**: The unit of work is a decision, not a diff. Progress is the
  choices made and recorded.
- **P4 (absorb-at-the-stop)**: Generation and absorption happen at different times: the model
  runs long, and the person reads at the stop.
- **P5 (capture-not-chase)**: A new idea mid-build is parked, then judged cold at the next
  stop.
  - because: breaking focus costs more than the idea is worth in the moment.
- **P6 (size-to-the-work)**: Size the process to the work. A one-line fix does not need a
  plan.
  - because: ceremony destroys attention too.
- **P7 (deterministic-first)**: Whatever can be deterministic is rendered by the CLI; the
  model gets only the judgment.
  - because: a line the CLI owns reads the same on every run.

## Map

- **M1 (cli)**: The `plumbbob` CLI: argument parsing, one file per verb, exit codes.
  - paths: bin/, src/cli.ts, src/cli-core.ts, src/verbs/
- **M2 (lib)**: Shared machinery: git, the check gate, the latch, intent and build-log
  parsing.
  - paths: src/lib/
- **M3 (plugin)**: The eighteen skills, the hooks that wire the turn loop, and the templates a
  build starts from.
  - paths: skills/, hooks/, templates/
- **M4 (gate)**: What `pnpm check` runs: the checkride config, the ast-grep rules, the refs
  scanner.
  - paths: checkride.config.json, sgconfig.yml, rules/, scripts/
- **M5 (evals)**: Live-model contracts for the behavior a unit test cannot see.
  - paths: test/evals/
- **M6 (record)**: Every build's intent, log, and report, and the decision log, tracked beside
  the code.
  - paths: .plumbbob/builds/, docs/decisions.md
- **M7 (site)**: The website.
  - paths: site/

## Constraints

- **C1 (functional-only)**: Functional and procedural only: no classes, no `this`, no default
  exports.
  - held-by: file:rules/no-class.yml#"id: no-class",
    file:rules/no-default-export.yml#"id: no-default-export"
- **C2 (few-deliberate-deps)**: The CLI imports Node builtins, relative paths, and an explicit
  allowlist (today only checkride), never a casual install.
  - held-by: file:rules/node-builtins-only.yml#"id: node-builtins-only"
- **C3 (bindings-not-logic)**: `harness.json` holds bindings and prose notes, never control
  flow.
  - held-by: review
- **C4 (never-destroy)**: No step, revert, or migration loses park lines, intent edits, or a
  recorded build folder.
  - held-by: file:rules/centralize-destructive-fs.yml#"id: centralize-destructive-fs",
    file:test/e2e/build-loop.test.ts#"mid-step park lines survive a revert"
- **C5 (additive-git)**: plumbbob reads, stages, and commits forward, and resets only to SHAs
  it recorded. It never rewrites pushed history.
  - held-by: file:rules/additive-git-only.yml#"id: additive-git-only",
    file:rules/reset-hard-only-in-revert.yml#"id: reset-hard-only-in-revert"
- **C6 (no-advance-verb)**: Nothing an agent returns can checkpoint, flip a step, or start
  another agent; only a person advances the loop, per [P1 (decide-not-execute)].
  - held-by: file:rules/agent-no-advance.yml#"id: agent-no-advance"
- **C7 (minimal-envelope)**: The agent envelope stays minimal: unknown fields are tolerated
  and dropped, and an addition is a minor bump.
  - held-by: `file:src/lib/__tests__/agents.test.ts#"tolerates unknown envelope keys"`

## Scenarios

- **S1 (one-cycle)**: A person plans, builds a step, checkpoints, parks a stray, and finishes,
  and the build folder records each move.
  - held-by: file:test/e2e/e2e.test.ts#"a full PlumbBob session end to end"
- **S2 (default-pause)**: A default build stops after each step and waits for the person.
  - held-by: file:test/evals/contracts/c1-pause.eval.ts#"default build pauses"
- **S3 (range-stop)**: A run walks its range, stops at the range's top, and ends on the stop
  card.
  - held-by: file:test/evals/contracts/c4-range.eval.ts#"a range stops at its top",
    file:test/evals/contracts/c11-run.eval.ts#"a run ends on its stop card"
- **S4 (park-and-harvest)**: A stray idea mid-build is parked, not chased, and settled at the
  stop, per [P5 (capture-not-chase)].
  - held-by: file:test/evals/contracts/c5-park.eval.ts#"id: 'c5'",
    `file:src/verbs/__tests__/harvest.test.ts#"flips each settled park"`
- **S5 (red-holds)**: A red check refuses the checkpoint and records nothing.
  - held-by: file:test/evals/contracts/c2-red.eval.ts#"no checkpoint over red",
    file:test/integration/verify.test.ts#"refuses on a red check, recording nothing"

## Decisions

- **D1 (lean-cli)**: A deterministic, lean CLI on Node builtins; guidance, not a lock.
  - because: the same answer every run is one a person and a model can both lean on.
- **D7 (park-then-harvest)**: Capture, then triage: a stray is parked as one flat line and
  harvested at the next boundary.
  - because: [P5 (capture-not-chase)], and a line you can grep costs nothing to write
    mid-build.
- **D10 (pause-not-lock)**: Nothing blocks an edit; the loop pulls up at the pause and waits.
  - because: a wall gets routed around, and a pause gets read.
- **D17 (two-planes)**: Each build's folder under `.plumbbob/builds/` is tracked; only the
  per-worktree control files are excluded.
  - because: the record of why belongs in git, beside the code it describes.
- **D32 (checkride-gate)**: checkride is the check gate, called through its API; exit 0 is
  done.
  - because: the typed summary names the failing slot and its raw output in-process.
- **D64 (approval-latch)**: A checkpoint lands only after a human turn since the step began,
  or a grant the person typed.
  - because: guidance on the work, a latch on the record; the refusal is the pause.
- **D92 (build-ranges)**: The plan says where the build stops for a human call, as numbered
  build ranges.
  - because: the stops are chosen up front, while there is time to think.
- **D104 (harvest-records)**: `plumbbob harvest` records a stop's settled parks in the build
  log, and commits nothing.
  - because: the plan changes as the build learns, and each change should leave a dated line.
- **D123 (defer-records)**: `plumbbob defer` marks a question deferred, with what will settle
  it, and keeps it counted as open.
  - because: an unknown named and set aside beats one quietly decided.
- **D132 (scenario-evals)**: An opt-in `scenarios` slot runs the eval contracts the Scenarios
  point at, so "linked" and "passing" sit side by side.
  - because: the `intent` slot proves a pointer resolves, not that what it points at passes.

## Taste

- **T1 (bold-then-earn)**: State the principle in bold, then earn it in plain prose; never the
  reverse.
- **T2 (number-not-adjective)**: Give the number instead of the adjective: "vitest is 53s of
  the 56s", not "tests are slow".
- **T3 (no-em-dash)**: No em-dash in prose. An aside rides in brackets; a pause takes a
  semicolon, a colon, or a comma. `docs/voice/voice.md` has the full form.
- **T4 (no-hype)**: No hype adjectives, and no "it's not just X, it's Y".
- **T5 (minted-terms)**: Mint vocabulary one term at a time, defined at birth (the latch, the
  seam, park, harvest), then use it everywhere.

## Questions

- **Q1 (part-plans)**: Does any part of plumbbob earn a plan of its own, or do this plan and
  `docs/decisions.md` cover it?
- **Q2 (slug-parity)**: Should the refs scanner check that each C and D item here carries the
  same slug as its entry in `docs/decisions.md`?

## Ideas

- **I1 (taste-as-rule)**: Hold [T3 (no-em-dash)] by its vale rule. Taste takes no `held-by:`,
  so that means a Constraint pointing at `.vale/styles/Repo/EmDash.yml`.
