<!--
build-log.md: your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time. CLI-maintained: `build`,
              `checkpoint`, and `revert` keep this mirror and the Current step line
              in sync with intent.md; you never hand-edit them.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Harvest   : the boundary ritual that keeps you on one branch.
  Log       : the build's history. `plumbbob checkpoint` appends a line per step as it
              lands; feeds the /plumbbob:finish report, which rides the branch into the PR.
-->

# Build log: move 2: make the plan schedulable

**Current step:** 8 — docs(plan): teach the export where the plan is taught
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. docs(plan): spec the step fields and the plan.json export
- ☑ 2. fix(intent): refuse the seam tokens runciter refuses
- ☑ 3. feat(intent): read a step's after, stop, and effort lines
- ☑ 4. feat(plan): derive runciter.plan/1 from intent.md
- ☑ 5. feat(plan): check a plan's dependencies and seams before it exports
- ☑ 6. feat(export): write plan.json beside intent.md
- ☑ 7. feat(check): keep plan.json current, and fail the check when it drifts
- ☐ 8. docs(plan): teach the export where the plan is taught

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

- [x] fourth plan check: an after: line naming a step later in build order, fold into step 5 (blocker)
- [x] for move 3's design in runciter: let a worker pull the integration tip into its worktree at its own commit points (trunk to worker only, opt-in per plan), instead of weaving mid-step commits into the trunk; and show parallel workers on the host task list or as lanes on the frontier card

## Harvest  *(run `/plumbbob:harvest` at each step boundary, after green)*

Classify each parked item as exactly ONE. Naming it before acting is what keeps you
from sprawling across branches.

| Class            | Meaning                                   | Action                               |
| ---------------- | ----------------------------------------- | ------------------------------------ |
| **blocker**      | Plan was wrong/incomplete; can't proceed  | `/plumbbob:revert`, fold into intent |
| **tangent**      | A different path, not clearly better      | Defer or kill. Default here.         |
| **pivot signal** | Evidence the whole approach is wrong      | Stop. Replan deliberately.           |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require a
> failed assumption, not a shinier idea, before you pivot.

Harvest results this boundary:

- 2026-11-12, at the step 1 boundary: 1 parked idea, classified.
- **blocker**: park 1 · fourth plan check: an after: line naming a step later in build order, fold into step 5 (blocker) → you approved it at step 1's pause, and step 5 hasn't been built yet, so it folds into that step's done-when
- 2026-11-13, at range 2 of 3's stop: 1 parked idea, classified.
- **tangent**: park 2 · for move 3's design in runciter: let a worker pull the integration tip into its worktree at its own commit points (trunk to worker only, opt-in per plan), instead of weaving mid-step commits into the trunk; and show parallel workers on the host task list or as lanes on the frontier card → it is runciter's scheduler design for move 3, and nothing in this build waits on it

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends an entry here
every time a step lands (via `/plumbbob:build` or `/plumbbob:verify`): the dated line,
and beneath it the pause as you approved it, so this fills in as you go, not at the
end, and an older step's detail is a scroll away. Add your own decision/event lines too: this is what
you point at to say "I did that: the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*

- 2026-11-12 — plan committed · 1a1c3c2cc

  **Recommendation**: Approve it. The read checked that every seam in every existing build survives the tighter grammar (none uses `!`, a backslash or a `.`/`..` segment), that vitest already picks up `test/contract/`, that the three CLI writers of `intent.md` are `checkpoint`, `order` and `defer`, and that the plan parses with three ranges; the one hole worth watching is 1, and step 7 is where it gets settled.

  **1.** Step 7 leaves open how a plumbbob-side red reads on the card

  The drift check runs ahead of checkride in `runCheck`, but the recap's check row is measured from `.check/summary.json`. A red that writes no summary would leave the last green summary on disk, and the card could offer `looks good` over a stale plan. Step 7's note names the precedent (`runCommand` writes a summary for the override); closing it means the drift red writes a summary the row reads, or leaves none and the row says so.

  **2.** `pnpm check` in this repo never calls `plumbbob check`

  The brief makes drift a `plumbbob check` failure, and step 7 does that, so it also gates every checkpoint. But this repo's `pnpm check` runs checkride directly, so a drifted `plan.json` in this repo turns the checkpoint red and leaves `pnpm check` green. That holds for any repo, by design (plumbbob's check lives in plumbbob), but it means "`pnpm check` green" at the finish doesn't prove the two exported plans are current. Step 7's tests carry that proof instead.

  **3.** This build's own plan exports fully serial

  Every step here touches `src/lib/intent.ts` or builds on the step before, so no step carries an `after:` line and check 3 has nothing to fire on in either exported plan. The parallel and failing cases live only in step 4's and step 5's fixtures, so the second stop reads two serial plans. That is honest, but it isn't a demonstration of the check ridgeline never had.

- 2026-11-12 — step 1 checkpointed · a640c7940 — docs(plan): spec the step fields and the plan.json export (1 drift, 21m)

  **Summary**: `docs/plan-export.md` now specifies the `after:`, `stop:` and `effort:` lines with a worked step and its exported JSON, the defaults, the field mapping, the words every refusal prints, and how `plan.json` stays current. `docs/decisions.md` records the build's nineteen decisions as D133 to D151, in the build's own order, and D23 has its dated revision.

  1. Some of the words are my calls, not the plan's
  2. Two refusals beyond the six, because the contract needs them
  3. An `after:` that points forward in build order goes unchecked
  4. The ajv version in D15 needs a look at step 4
  5. One file outside the seam

  **Readout**:

  ```text
  check        green: 1 of 1 checks
  done-when    met
  decisions    7 of 7 honored
  constraints  5 of 5 honored
  seam         strayed: 1 path outside the seam
               → cspell.json
  diff         +385 -3 across 3 files
               - cspell.json +2 -1
               - docs/decisions.md +99 -2
               - docs/plan-export.md +284 -0
  spent        21 min · 1 turn · 220s gate · green first run
  ```

  **Verdict**: ◐ A hair off (seam strayed)

  **Recommendation**: Approve the grammar and the words as written, and add a fourth plumbbob check for an `after:` that names a step later in build order, folded into step 5. That's the one case where the plan and plumbbob's own walk would disagree about order, and catching it at export costs one more loop over steps step 5 already walks.

  **1.** Some of the words are my calls, not the plan's

  The plan settled the grammar but not every edge. I chose these, and each is yours to change before step 2 parses anything: `none` must stand alone (`after: none, 3` is malformed); `stop:` can add a stop or turn a range end `structural`, but it can't remove a range end's `planned` stop, because D3 only lists the two values; `!` counts as a glob character, so it shares the glob message, while a backslash and a bad segment each get their own; the existing glob message swaps its em-dash for `, per D23 (no-glob-seams).`; check 3 looks only at steps inside a range, and it includes landed steps, since every step is exported (D8 (every-step)).

  **2.** Two refusals beyond the six, because the contract needs them

  The contract needs at least one seam entry and a non-empty `done_when` on every step. A step whose seam won't parse, or whose **done when:** is empty, would produce a `plan.json` the schema rejects, so the spec lists both under "The lines themselves" with the words they print. They aren't new rules, just the parse catching it before the schema does.

  **3.** An `after:` that points forward in build order goes unchecked

  If step 3 says `- after: 5` but `## Build order` puts 3 before 5, a scheduler waits on 5 while plumbbob's own serial walk builds 3 first, which is the opposite. None of the six checks catches this. I wrote nothing about it rather than add a seventh check the plan doesn't have. Options: a fourth plumbbob check ("an `after:` names a step later in build order"), or an open question to settle later.

  **4.** The ajv version in D15 needs a look at step 4

  D15 (ajv-dev-dep) says 8.18.0 is "the one already in the tree". pnpm's store does hold `ajv@8.18.0`, but the hoisted `node_modules/ajv` is 8.20.0. D147 records the pin at 8.18.0 as the plan says; step 4 should confirm which one to pin.

  **5.** One file outside the seam

  `cspell.json` gains `xhigh`, the effort rung the spell check didn't know. Steps 3 to 5 will put the same word into `src/`, so the lexicon was the place for it.

- 2026-11-12 — step 2 checkpointed · 9483636f8 — fix(intent): refuse the seam tokens runciter refuses (1 drift, 7m)
- 2026-11-12 — step 3 checkpointed · 4898d4261 — feat(intent): read a step's after, stop, and effort lines (8m)
- 2026-11-12 — step 4 checkpointed · 8680ae64c — feat(plan): derive runciter.plan/1 from intent.md (1 red, 24m)
- 2026-11-12 — step 5 checkpointed · a72eb6104 — feat(plan): check a plan's dependencies and seams before it exports (6m)
- 2026-11-12 — step 6 checkpointed · e3bdedab0 — feat(export): write plan.json beside intent.md (1 red, 1 drift, 9m)
- 2026-11-13 — range 2 of 3's stop recorded — read the first two exported plans, this build's and `2026-10-17-build-ranges`' (five ranges), each validated against the vendored schema, before the check starts failing on drift

  **Summary**: `plumbbob export` now writes a build's `plan.json` in runciter's `runciter.plan/1`. Behind it are the seam parse tightened to runciter's grammar, a strict reader for the `after:`, `stop:` and `effort:` lines, a pure derivation, and seven rules and checks that refuse the write on any failure. Both real plans exported and validate against the vendored schema: this build's has 8 steps over 3 ranges and `2026-10-17-build-ranges`' has 13 steps over 5, both fully serial, each with a `planned` stop on the last step of every range.

  1. ajv is pinned at 8.20.0, where D15 names 8.18.0
  2. This build's plan.json is already one tick behind
  3. Both exports are serial, so check 3 never fired on a real plan
  4. The fourth check landed as D152 (no-forward-after)
  5. Three files outside their steps' seams

  **Readout**:

  ```text
  steps        5 of 5 landed
               - 2 9483636 · 3 4898d42 · 4 8680ae6 · 5 a72eb61 · 6 e3bdeda
  check        green: 1 of 1 checks, 5 landings
  done-when    met
  decisions    bent: D15 (ajv-dev-dep)
               → ajv pinned at 8.20.0, not 8.18.0; see section 1
  constraints  5 of 5 honored
  seam         strayed: 3 paths outside 2 steps' seams
               - step 2: src/lib/__tests__/seamcheck.test.ts
               - step 6: cspell.json, site/api.html
  diff         +1647 -10 across 21 files
               - cspell.json +1 -0
               - docs/cli-reference.md +20 -0
               - docs/decisions.md +6 -0
               - docs/plan-export.md +9 -1
               - package.json +1 -0
               - pnpm-lock.yaml +3 -0
               - site/api.html +2 -0
               - and 14 more
  spent        55 min · 2 red runs · 2 drift warnings
  ```

  **Verdict**: ○ Out of plumb (decisions bent)

  **Harvested**: **1** of 2 parked ideas open

  | Park | Why it matters | Lean |
  | --- | --- | --- |
  | **P2**: [Parallel steps, tip pulled in](#park-list) | a wide plan could land several steps side by side without half-built work reaching the trunk | tangent: it is runciter's scheduler design for move 3, and nothing in this build waits on it |

  **Recommendation**: Read the two exported plans and approve the range: `.plumbbob/builds/2026-11-11-move-2-make-the-plan-schedulable/plan.json` and `.plumbbob/builds/2026-10-17-build-ranges/plan.json`. They match their intents step for step, and the one stale hash is step 7's to fix. Correct D15 (ajv-dev-dep) and D147 to 8.20.0 when you reply, then run range 3 with `/plumbbob:run`.

  **1.** ajv is pinned at 8.20.0, where D15 names 8.18.0

  D15 (ajv-dev-dep) says to pin ajv 8.18.0 because it is "the one already in the tree". The lockfile only ever held 8.20.0, and that is the hoisted `node_modules/ajv`. 8.18.0 sits in pnpm's store but nothing in this repo resolves to it. I followed the decision's reason over its number and pinned 8.20.0, so nothing new was downloaded and the release-age window never came into it. D15 in `intent.md` and D147 in `docs/decisions.md` both still say 8.18.0, and I left them for you to correct.

  **2.** This build's plan.json is already one tick behind

  The export ran before step 6's checkpoint ticked its box, so the committed `plan.json` for this build carries the hash of the `intent.md` from before the tick (`180d13fe`, where the file now hashes to `56fdbe0f`). `2026-10-17-build-ranges`' is current. Nothing goes red yet, since the drift check is step 7. Step 7 is exactly what fixes this: `checkpoint` re-exports when it ticks, and the check catches every other edit.

  **3.** Both exports are serial, so check 3 never fired on a real plan

  Neither plan has an `after:` line, so every step depends on the one before it, and the overlap check (the one ridgeline never had) has nothing to catch. Its passing and failing cases live only in `src/lib/__tests__/plancheck.test.ts`, which covers equal entries, a grant covering a file, a grant against its bare form, reach through a step in between, and steps in different ranges. Step 1's pause flagged this, and it still holds.

  **4.** The fourth check landed as D152 (no-forward-after)

  The check you approved at step 1's pause (an `after:` may not name a step that builds later) is in `src/lib/plancheck.ts`, with its words in `docs/plan-export.md` and its entry in `docs/decisions.md` as D152, the build's D20. It skips landed steps, since their place in the order is history. Rule 2 reports only dependencies no `after:` line accounts for, because check 1 already names the rest, and the cycle rule waits until every dependency is known, which is how runciter's validator does it.

  **5.** Three files outside their steps' seams

  The glob message dropped its em-dash for `, per D23 (no-glob-seams).`, as the spec says, so `src/lib/__tests__/seamcheck.test.ts`, which asserted the old words, changed in step 2. Step 6's done-when names the places `cli-docs.test.ts` looks, and `site/api.html` is one of them, so the verb went in there too. `cspell.json` learned `plancheck`, after the spell slot turned step 6's first checkpoint red. Step 4's other red run was three e2e tests timing out at a load average of 60. They passed alone, 71 of 71, and the retry landed green.

- 2026-11-13 — step 7 checkpointed · f380136fe — feat(check): keep plan.json current, and fail the check when it drifts (1 drift, 16m)
