# move 2: make the plan schedulable

**Phase:** frame
**Size:** medium
**Scope:** plan

*Source: move 2 of runciter's `docs/specs/long-horizon-builder-roadmap.md`, written against the contract runciter approved on 2026-11-12 at `9b40f0f` (`docs/plan-protocol.md`, `schema/runciter.plan.schema.json`, `schema/examples/runciter.plan.example.json`, `src/protocol/plan.ts`), with this repo's `research/16-the-planner-and-the-frontier.md` ("What the plan must carry", "Seams from the Map", "The export") and `research/15-parallel-builds-and-the-contract.md`. The code facts below were read from `src/` at `c50a3aabe`. The brief is quoted whole under [Source](#source).*

## Frame

- **Problem:** runciter's scheduler (move 3) will run a build's steps in parallel worktrees, and it reads a plan only as `plan.json` in the shape `runciter.plan/1`. Today's `intent.md` can't be read that way. A step has no id the contract accepts, no dependencies (order is document order or the `## Build order` line), no per-step stop (stops are per range), no effort, and a seam grammar looser than runciter's. A scheduler reads a missing dependency as "may run in parallel", which is the unsafe reading.
- **Smallest thing that solves it:**
  - Three optional step sub-lines, `- after:`, `- stop:` and `- effort:`, read strictly, with defaults that export today's plans fully serial.
  - The seam parse tightened to runciter's grammar, so there is one grammar in both repos.
  - A pure derivation from `intent.md` to `runciter.plan/1`, with the contract's three plan rules and plumbbob's three plan checks run before anything is written.
  - `plumbbob export`, which writes `plan.json` beside `intent.md`; the CLI keeps an exported `plan.json` current on its own writes, and `plumbbob check` fails when it has drifted.
- **Done looks like:** `plumbbob export` writes a `plan.json` for this build and for `.plumbbob/builds/2026-10-17-build-ranges/` (five ranges), both validate against the vendored JSON Schema and pass the three plan rules, the vendored example round-trips, a hand edit to an exported build's `intent.md` turns `plumbbob check` red until `plumbbob export` runs again, and `pnpm check` exits 0.
- **Explicitly NOT doing:** the core/plugin package split; contract paths and `contract.lock` (note 15, the roadmap's item 4), so `contract_paths` is always `[]`; `status --all`; the frontier card; proposals; the ACP host; seam seeds from the Map and the declared-against-actual log (note 16's sized item 2); `effort: ensemble`; any change to runciter's contract or code.

## Architecture sketch

```
intent.md ──parse──▶ steps (n, title, done when, seam, note:, after:, stop:, effort:)
   │                 ranges (## Build ranges)     order (## Build order)
   │                 decisions, constraints (scrapeBullets, as StepContext does)
   ▼
derivePlan (src/lib/plan.ts, pure) ──▶ runciter.plan/1 object
   │
   ├─ plan rules (the contract's): unique ids, known deps, no cycle
   ├─ plan checks (plumbbob's, src/lib/plancheck.ts, tree injected):
   │    1. every after: names a step
   │    2. every undone step's seam path exists, or is under a part that does
   │    3. no two steps in one range share a seam unless one reaches the other
   ▼
plumbbob export [<slug>] ──▶ .plumbbob/builds/<slug>/plan.json   (refuses on any failure)

checkpoint · order · defer  ── write intent.md ──▶ re-export, when plan.json exists
plumbbob check / checkpoint gate ──▶ red when plan.json ≠ derivePlan(intent.md)
```

## Decisions

- <a id="d1"></a>**D1 (step-id)**: a step's id is `step-<n>`, its plan number, *because* plumbbob numbers a step for life (the `## Build order` line carries the sequence), so the id is as stable as the number, and `step-<n>` fits the contract's `[a-z0-9][a-z0-9-]{0,63}` for any plan.
- <a id="d2"></a>**D2 (serial-default)**: a step depends on what its optional `- after:` sub-line names (step numbers and spans, comma-separated, read by `src/lib/steplist.ts`, or `none`); without one it depends on the step before it in build order, and the first step in build order on nothing, *because* a scheduler reads a missing dependency as "may run in parallel", so the unannotated plan must export fully serial, which is also what plumbbob does today.
- <a id="d3"></a>**D3 (range-end-stops)**: the last step of each range, in build order, exports `stop: "planned"`; an optional `- stop:` sub-line (`planned` or `structural`) overrides any step's; every other step is `none`, *because* plumbbob's stops are per range ([D92 (build-ranges)](../../../docs/decisions.md#d92)) and the contract's are per step, taken after that step lands, so the range's last step is where the same call falls.
- <a id="d4"></a>**D4 (bare-range-approximation)**: a bare range (`/plumbbob:build 4`, a call made before step 4 lands) exports the same `planned` stop on step 4, taken after it lands on the integration branch, *because* the contract has no stop before landing, and a stop on the integration branch still puts the person ahead of anything that builds on the step, with promotion to `main` a person's every time ([Q5 (bare-range-stop)](#q5)).
- <a id="d5"></a>**D5 (effort-line)**: an optional `- effort:` sub-line takes one of `low`, `medium`, `high`, `xhigh`, `max`, and exports `null` when absent; it is never derived from `- model:`, *because* a model names a seat and a rung names how hard the seat works, and a mapping from one to the other goes stale with the next model release.
- <a id="d6"></a>**D6 (one-seam-grammar)**: `parseStepSeam` refuses what runciter refuses, adding `!`, a backslash, and an empty, `.` or `..` segment to today's globs and absolute paths, still stripping a leading `./`, recorded as a dated revision of [D23 (no-glob-seams)](../../../docs/decisions.md#d23), *because* two grammars for one seam would let plumbbob accept a plan runciter refuses, and the shared parse is where one grammar lives (build-ranges' [D5 (one-grammar)](../2026-10-17-build-ranges/intent.md#d5)).
- <a id="d7"></a>**D7 (field-mapping)**: `title` is the step title, `done_when` its **done when:** text, `context` its `- note:` sub-lines verbatim in order, `decisions` and `constraints` the bullets `composeStepContext` already scrapes from the build's `## Decisions` and `## Constraints`, `range` the range's item number as a string (`null` for a step no range names), `build.id` the slug, `build.title` the build's title, `source` the repo-relative path of `intent.md` and the sha256 of its bytes, and `contract_paths` `[]`, *because* each of these is already a parsed fact, and a builder under runciter should get the same context the doorway gives it today.
- <a id="d8"></a>**D8 (every-step)**: the export carries every step, landed or not, in plan-number order, *because* the contract has no field for a landed step, and a plan.json that dropped them would rewrite the dependency graph under the person's feet ([Q4 (landed-steps)](#q4)).
- <a id="d9"></a>**D9 (strict-fields)**: a malformed `- after:`, `- stop:` or `- effort:` line, or more than one of a kind on a step, is a finding that names the step, never a guess, *because* the seam parse already refuses rather than guesses, and these lines are about to steer a scheduler.
- <a id="d10"></a>**D10 (reaches-not-names)**: plan check 3 passes when either step reaches the other through `depends_on`, directly or not, *because* a transitive dependency serializes the two steps as surely as a direct one, and demanding a direct edge would push plans into redundant `after:` lines.
- <a id="d11"></a>**D11 (refuse-the-write)**: `plumbbob export` writes nothing when a plan rule or a plan check fails; it prints each failure by step and exits 1, *because* a scheduler acting on a plan that fails them would run two steps at once that the plan meant to order.
- <a id="d12"></a>**D12 (bytes-compare)**: `plan.json` is the derivation serialized one way (two-space JSON, keys in the contract's order, every default written out, a trailing newline), and "current" means its bytes equal a fresh derivation's, *because* a byte compare needs no JSON-aware diff, and writing every default means the file never depends on what a reader fills in.
- <a id="d13"></a>**D13 (export-verb)**: the verb is `plumbbob export [<slug>]`, on the active build by default, and on a named build folder otherwise, *because* the second stop needs a `plan.json` from a finished build, and one verb file is the CLI's rule ([M1 (cli)](../../../keyframes.md)).
- <a id="d14"></a>**D14 (cli-keeps-current)**: `checkpoint` (its tick), `order` and `defer` re-export after they write `intent.md`, but only when the build folder already holds a `plan.json`, *because* a verb the person ran shouldn't turn the next check red, and a hand or model edit is what the drift check exists to catch.
- <a id="d15"></a>**D15 (ajv-dev-dep)**: conformance tests validate with `ajv` 8.18.0 (`ajv/dist/2020`), pinned as a dev dependency; the CLI never imports it, *because* conformance means validating against the vendored schema file itself, and a hand check would re-state the schema and drift from it the day runciter regenerates it. The version is the one already in the tree.
- <a id="d16"></a>**D16 (vendored-contract)**: the JSON Schema and the example are copied byte for byte into `test/contract/runciter-plan/`, with a README naming runciter's commit `9b40f0f` and the files' source paths, *because* runciter is private and unpublished, so the test can't import it, and a named commit says which version a refreshed copy replaces.
- <a id="d17"></a>**D17 (opt-in-by-presence)**: a build writes `plan.json` only once `plumbbob export` has run on it; from then on the CLI keeps it current and the drift check applies, and a build without one is untouched, *because* note 16 keeps a build with no scheduler as it is today, and every user's hand edit turning their check red would be a tax on builds no scheduler reads ([Q1 (opt-in-by-presence)](#q1)).
- <a id="d18"></a>**D18 (under-a-part)**: plan check 2 passes a seam path that exists, one whose parent directory exists, or one under an existing path a root `keyframes.md` Map part names; a new directory outside every part, or a new file in a directory that doesn't exist, fails, *because* a new file is the ordinary case, and "the nearest existing ancestor" is always the repo root, which checks nothing ([Q2 (under-a-part)](#q2)).
- <a id="d19"></a>**D19 (checks-at-export)**: the plan checks bite at `plumbbob export` and at the check for an exported build, and nowhere on the plan card yet, *because* the card naming them belongs with the frontier card, note 16's item 5, which is out of this build's scope ([Q3 (checks-bite-where)](#q3)).
- <a id="d20"></a>**D20 (no-forward-after)**: plumbbob's plan checks gain a fourth: an `after:` line may not name a step that comes later in build order, printed as ``step 3's `after:` names step 5, which builds after it; move step 5 earlier with `plumbbob order`, or drop it from the line.``, *because* a scheduler would hold step 3 for step 5 while plumbbob's own serial walk builds step 3 first, so the two would read the plan's order opposite ways (P1, approved at step 1's pause, 2026-11-11).

## Constraints

- <a id="c1"></a>**C1 (contract-is-runciters)**: `runciter.plan/1` is written against as it stands at `9b40f0f`; a field that seems wrong for plumbbob is raised with Rob, never worked around here.
- <a id="c2"></a>**C2 (no-runtime-dep)**: the CLI's imports stay Node builtins, relative paths and checkride ([C2 (few-deliberate-deps)](../../../keyframes.md)); `ajv` lives only in tests.
- <a id="c3"></a>**C3 (pure-lib)**: the derivation and the plan checks are pure functions in `src/lib/`, the tree injected the way `src/lib/seamcheck.ts` injects it.
- <a id="c4"></a>**C4 (single-stream-unchanged)**: a build with no `plan.json` reads, renders, checks and commits exactly as it does today.
- <a id="c5"></a>**C5 (functional-only)**: no classes, no `this`, no default exports ([C1 (functional-only)](../../../keyframes.md)).

## Steps

1. [x] docs(plan): spec the step fields and the plan.json export, **done when:** a new `docs/plan-export.md` gives the grammar of the `- after:`, `- stop:` and `- effort:` sub-lines with a worked step, the defaults ([D2 (serial-default)](#d2), [D3 (range-end-stops)](#d3), [D5 (effort-line)](#d5)), the field mapping ([D7 (field-mapping)](#d7)), the six rules and checks with the words each failure prints, and what keeps `plan.json` current; `docs/decisions.md` carries the new decisions and D23's dated revision; and the human approves the grammar at the step's pause, before any parser changes
   - seam: `docs/plan-export.md`, `docs/decisions.md`
   - model: opus (the grammar every later step parses)
   - effort: high
2. [x] fix(intent): refuse the seam tokens runciter refuses, **done when:** `parseStepSeam` refuses a token holding `!` or a backslash, or with an empty, `.` or `..` segment, with a message naming the token and D23 (no-glob-seams), still strips a leading `./`, and every undone step's seam in every `intent.md` under `.plumbbob/builds/` still parses; tests in `src/lib/__tests__/intent.test.ts` cover each refusal
   - seam: `src/lib/intent.ts`, `src/lib/__tests__/intent.test.ts`
   - model: sonnet (mechanical, fully specified)
   - note: the refusals sit at `src/lib/intent.ts:114` to `:126`; runciter's `seam_entry_issue` is the reference for which tokens fail.
3. [x] feat(intent): read a step's after, stop, and effort lines, **done when:** a pure parser in `src/lib/intent.ts` returns each step's `after` (step numbers, `none`, or absent), `stop` and `effort` from its sub-lines, the step's `- note:` lines in order, and a finding by step for a malformed or duplicated line ([D9 (strict-fields)](#d9)); `after` reads through `src/lib/steplist.ts`; tests cover each value, each refusal, and a step carrying none of the lines
   - seam: `src/lib/intent.ts`, `src/lib/__tests__/intent.test.ts`
   - model: sonnet (a parser in the shape of `parseStepSeam`)
4. [x] feat(plan): derive runciter.plan/1 from intent.md, **done when:** `derivePlan` in a new `src/lib/plan.ts` turns an intent's text, its slug, its repo-relative path and its sha256 into the contract's object per [D1 (step-id)](#d1) to [D8 (every-step)](#d8), and `serializePlan` writes it per [D12 (bytes-compare)](#d12); `test/contract/plan-json.test.ts` validates derived plans (an unannotated plan, one with `after:` lines, one with ranges and a bare range) against the vendored schema with ajv, checks the three plan rules on each, and round-trips the vendored example through the schema and the rules
   - seam: `src/lib/plan.ts`, `src/lib/__tests__/plan.test.ts`, `test/contract/plan-json.test.ts`, `test/contract/runciter-plan/`, `package.json`, `pnpm-lock.yaml`
   - model: opus (the contract's shape, where a wrong default is a parallel run)
   - effort: high
   - note: vendor `schema/runciter.plan.schema.json` and `schema/examples/runciter.plan.example.json` from `~/Projects/runciter/code/runciter` at `9b40f0f` per [D16 (vendored-contract)](#d16), and add ajv per [D15 (ajv-dev-dep)](#d15).
5. [x] feat(plan): check a plan's dependencies and seams before it exports, **done when:** a new `src/lib/plancheck.ts` runs the contract's three plan rules (unique ids, known dependencies, no cycle) and plumbbob's four plan checks (the fourth is [D20 (no-forward-after)](#d20)) over a derived plan with the tree injected, and returns each failure by step in the words `docs/plan-export.md` gives; check 2 skips landed steps; check 3 uses `seams_overlap`'s semantics and [D10 (reaches-not-names)](#d10); tests cover a pass and each failure; `docs/plan-export.md` and `docs/decisions.md` carry the fourth check and its words
   - seam: `src/lib/plancheck.ts`, `src/lib/__tests__/plancheck.test.ts`, `docs/plan-export.md`, `docs/decisions.md`
   - model: opus (the check ridgeline never had)
   - note: runciter's `seams_overlap` and `find_cycle` (`src/protocol/plan.ts`) are the reference; re-implement, never import. "Under a part" is [D18 (under-a-part)](#d18).
6. [x] feat(export): write plan.json beside intent.md, **done when:** `plumbbob export [<slug>]` derives and checks the plan and writes `.plumbbob/builds/<slug>/plan.json`, or writes nothing and exits 1 naming each failure ([D11 (refuse-the-write)](#d11)); the verb is registered and documented where `test/contract/cli-docs.test.ts` looks; and running it writes this build's `plan.json` and `.plumbbob/builds/2026-10-17-build-ranges/plan.json`, both of which validate against the vendored schema
   - seam: `src/verbs/export.ts`, `src/verbs/__tests__/export.test.ts`, `src/cli-core.ts`, `docs/cli-reference.md`, `.plumbbob/builds/2026-11-11-move-2-make-the-plan-schedulable/plan.json`, `.plumbbob/builds/2026-10-17-build-ranges/plan.json`
   - model: sonnet (a verb over two finished pure modules)
7. [x] feat(check): keep plan.json current, and fail the check when it drifts, **done when:** `checkpoint`'s tick, `order` and `defer` re-export when the build folder holds a `plan.json` ([D14 (cli-keeps-current)](#d14)); `plumbbob check` and the checkpoint gate exit 1, naming `plumbbob export`, when `plan.json` differs from a fresh derivation or the plan fails a rule or check; a build without `plan.json` checks exactly as before ([C4 (single-stream-unchanged)](#c4)); tests cover a drifted file, a CLI write that keeps it current, and a build with none
   - seam: `src/lib/check.ts`, `src/lib/__tests__/check.test.ts`, `src/verbs/checkpoint.ts`, `src/verbs/__tests__/checkpoint.test.ts`, `src/verbs/order.ts`, `src/verbs/__tests__/order.test.ts`, `src/verbs/defer.ts`, `src/verbs/__tests__/defer.test.ts`
   - model: opus (the gate, and how its red reads on the card)
   - note: the drift check runs ahead of the gate in `runCheck` (`src/lib/check.ts:128`). How its red reaches the recap's check row, which reads `.check/summary.json` (`summaryCheckRow`, `src/lib/orient.ts:2161`), is settled here; the override path's summary (`runCommand`, `src/lib/check.ts:163`) is the precedent for writing one. A re-exported `plan.json` rides the same commit as the `intent.md` write that caused it, so the checkpoint stages it with the tick.
8. [ ] docs(plan): teach the export where the plan is taught, **done when:** `templates/intent.md` shows the three sub-lines in its step guidance, `skills/plan/SKILL.md`, `skills/step/SKILL.md` and `skills/refine/SKILL.md` say to run `plumbbob export` after an edit to a build that has a `plan.json`, `docs/plan-export.md` is linked from `docs/cli-reference.md` and the glossary, and the glossary defines `plan.json`
   - seam: `templates/intent.md`, `skills/plan/SKILL.md`, `skills/step/SKILL.md`, `skills/refine/SKILL.md`, `docs/plan-export.md`, `docs/cli-reference.md`, `docs/glossary.md`, `src/verbs/__tests__/start.test.ts`
   - model: sonnet (prose over settled behavior)

## Build order

## Build ranges

Drive it with `/plumbbob:run`, a range at a time.

1. `/plumbbob:build 1`, **stop:** at step 1's pause, approve the grammar of the three sub-lines, their defaults, and the words each check prints, before any parser changes
   - model: opus
2. `/plumbbob:build 2-6`, **stop:** read the first two exported plans, this build's and `2026-10-17-build-ranges`' (five ranges), each validated against the vendored schema, before the check starts failing on drift
   - model: opus
3. `/plumbbob:build 7-8`, **stop:** the final read, then `/plumbbob:finish`, then the roadmap's State and its `runciter.plan/1` row, committed in runciter's repo as a separate docs commit
   - model: opus

## Open questions

- <a id="q1"></a>**Q1 (opt-in-by-presence)**: Should every build write `plan.json`, or only a build exported once?, *resolved:* 2026-11-11, only a build exported once, as [D17 (opt-in-by-presence)](#d17)
  - *plain:* Note 16 says a build with no scheduler writes no `plan.json`, while the roadmap says regenerate it on every amendment; if every build carried one, every hand edit to every user's `intent.md` would turn their next check red until they ran `plumbbob export`.
  - *lean:* Only a build exported once: the first `plumbbob export` opts the build in, the CLI keeps it current from then on ([D14 (cli-keeps-current)](#d14)), and the drift check fires only where the file exists ([C4 (single-stream-unchanged)](#c4)).
- <a id="q2"></a>**Q2 (under-a-part)**: When does a seam path that doesn't exist yet count as "under a part that does"?, *resolved:* 2026-11-11, its parent directory exists or it sits under an existing Map part path, as [D18 (under-a-part)](#d18)
  - *plain:* A new file is the ordinary case, so check 2 can't demand that every path exist, but "its nearest existing ancestor" is always the repo root, which checks nothing.
  - *lean:* It passes when its parent directory exists, or when it sits under a path a root `keyframes.md` Map part names and that path exists; a new directory outside every part, or a new file in a directory that doesn't exist yet, fails.
- <a id="q3"></a>**Q3 (checks-bite-where)**: Should the three plan checks only refuse the export, or also show on the plan card?, *resolved:* 2026-11-11, the export and the check only, as [D19 (checks-at-export)](#d19)
  - *plain:* Refusing the export stops a bad plan reaching a scheduler, but a person planning a build that has never been exported would never see the checks at all.
  - *lean:* Only the export and the check for now; the plan card naming them belongs with the frontier card (note 16's item 5), which is out of this build's scope.
- <a id="q4"></a>**Q4 (landed-steps)**: Should runciter's contract learn which steps have already landed?, *resolved:* 2026-11-11, export every step per [D8 (every-step)](#d8) and raise the gap with runciter before move 3
  - *plain:* `runciter.plan/1` has no status field, so a half-finished plumbbob build handed to the scheduler would build its landed steps again; move 3's fresh plans don't hit this, but a plan handed over mid-build would.
  - *lean:* Export every step as [D8 (every-step)](#d8) says, and raise it with runciter before move 3 rather than adding a field here ([C1 (contract-is-runciters)](#c1)).
- <a id="q5"></a>**Q5 (bare-range-stop)**: Is a stop after landing close enough for a bare range, whose call comes before?, *resolved:* 2026-11-11, yes, per [D4 (bare-range-approximation)](#d4)
  - *plain:* A bare range asks the person to approve a step's own work before it lands, and the contract can only stop after a step lands, so under a scheduler that step reaches the integration branch first.
  - *lean:* Yes, as [D4 (bare-range-approximation)](#d4) says: the integration branch isn't `main`, nothing builds on the step before the person reads it, and a pre-landing stop is runciter's to add if move 3 shows it's needed.

## Verdicts

## Source

> # Move 2 of the long-horizon roadmap: make plumbbob's plan schedulable
>
> You're in plumbbob (0.16.0). This is move 2 of the cross-repo roadmap at
> /Users/robmclarty/Projects/runciter/code/runciter/docs/specs/long-horizon-builder-roadmap.md.
> Read its "The idea in one paragraph", "Who owns what", "The contracts" and "Move 2" first. In
> short: runciter's scheduler (move 3, not started) will run a build's steps in parallel
> worktrees. It reads the plan only as `plan.json`, in the shape `runciter.plan/1`. Runciter owns
> that shape; plumbbob writes it.
>
> ## The contract you write against (approved 2026-11-12; don't change it from here)
>
> - docs/plan-protocol.md: every field, the seam grammar, the three plan rules, and what a stop means.
> - schema/runciter.plan.schema.json: the JSON Schema 2020-12, generated from runciter's zod schema.
> - schema/examples/runciter.plan.example.json
> - src/protocol/plan.ts: the reference validator, including `seams_overlap`.
>
> If the contract seems wrong for plumbbob, stop and say so. Don't work around it. A change to
> it is runciter's, made there.
>
> ## plumbbob's own design for this
>
> `research/16-the-planner-and-the-frontier.md` (seam, stop and effort made load-bearing; the
> three checks; "The export") and `research/15-parallel-builds-and-the-contract.md`. Move 2 is
> the narrow cut of note 16's first sized items. The roadmap's scope:
>
> 1. `seam`, `stop` and `effort` as explicit step fields in `intent.md`.
> 2. Three deterministic plan checks: every dependency names a step; every seam path exists or
>    is under a part that does; no two steps in one range share a seam unless one depends on
>    the other (the check ridgeline never had).
> 3. `plan.json` beside `intent.md`, regenerated on every amendment, with any mismatch a
>    `plumbbob check` failure, not a question.
>
> Pure CLI code in `src/lib`. **Skip:** the core/plugin package split, contract paths and
> `contract.lock` (note 15 and roadmap item 4; emit `contract_paths: []` for now), `status --all`,
> the frontier card, proposals, the ACP host.
>
> ## The gaps between today's intent.md and runciter.plan/1
>
> 1. **Step ids.** Lean: `step-<n>`, so the id is stable while the number is.
> 2. **depends_on.** Lean: an optional `- after:` sub-line (step numbers, or `none`). Without one, a
>    step depends on the step before it in build order, so an unannotated plan exports fully
>    serial.
> 3. **stop.** Lean: the last step of each range exports as `planned`; an optional `- stop:`
>    sub-line (`planned | structural`) overrides; everything else is `none`.
> 4. **effort.** Lean: an optional `- effort:` sub-line (`low | medium | high | xhigh | max`),
>    `null` when absent. Don't derive it from `model:`.
> 5. **The seam grammar is stricter in runciter.** Lean: tighten the shared parse to match
>    (one grammar, D5), recorded as a dated revision of D23.
> 6. **The rest of the mapping.** `done_when` from **done when:**, `context` from the step's
>    `note:` sub-lines, `decisions`/`constraints` the verbatim bullets the StepContext already
>    composes, `range` the range's number as a string, `build.id` the slug, and `source`
>    `intent.md`'s repo-relative path and the sha256 of its bytes.
>
> ## Conformance
>
> Vendor the JSON Schema and the example into a test-fixture folder, with a README naming the
> runciter commit they came from (`9b40f0f`). Test that every exported `plan.json` validates
> against the schema; the three plan rules hold; the vendored example round-trips. If a schema
> validator (ajv) is worth adding, make it a dev dependency, or hand-check the shapes; say which
> and why.
>
> ## How to run it
>
> Plan it as a plumbbob build in this repo. Stops at: the `intent.md` grammar before any parser
> changes; the first `plan.json` exported from a real build (this build's own, and
> `.plumbbob/builds/2026-10-17-build-ranges/`, five ranges), validated against the vendored
> schema; the finish. `pnpm check` green is the definition of done. When it ships, update the
> roadmap's State and its contracts row for `runciter.plan/1` in runciter's repo, as a separate
> docs commit. Don't touch runciter's code.
