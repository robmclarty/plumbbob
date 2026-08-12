<!--
build-log.md — your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time. CLI-maintained: `build`,
              `checkpoint`, and `revert` keep this mirror and the Current step line
              in sync with intent.md — you never hand-edit them.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Harvest   : the boundary ritual that keeps you on one branch.
  Log       : the build's history. `plumbbob checkpoint` appends a line per step as it
              lands; feeds the /plumbbob:finish report, which rides the branch into the PR.
-->

# Build log — glossed decision links and the checkride 0.10 fast gate

**Current step:** 11 — docs(decisions): record the citation convention and the gate profile
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status — CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint —
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. fix(cli): run the in-process CLI tests against a fixture repo
- ☑ 2. chore(deps): upgrade checkride to 0.10.2
- ☑ 3. chore(gate): run a test-less checkride profile on every turn
- ☑ 4. feat(refs): flag a citation that is bare, mislinked, or unglossed
- ☑ 5. docs(refs): gloss every decision citation in the docs
- ☑ 6. docs(decisions): promote the commit-subject decisions into the repo key
- ☑ 7. docs(skills): point the skills' citations at the published decisions
- ☑ 8. feat(intent): anchor and gloss the build-local citations
- ☑ 9. docs(cli): gloss the D-tags in the CLI's own output
- ☑ 10. chore(gate): wire the citation check into checkride and the fast profile
- ☐ 11. docs(decisions): record the citation convention and the gate profile
- ☑ 12. docs(voice): seed the hand-owned voice exemplar folder
- ☑ 13. chore(deps): upgrade checkride to 0.12.1
- ☐ 14. chore(gate): install the prose slot and point its exemplars at the voice folder
- ☐ 15. docs(prose): burn down the first prose run by hand
- ☐ 16. fix(cli): refuse --body when stdin cannot deliver one

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.
- [x] cli-core.test.ts runs `checkpoint -m --help` in-process against the developer's OWN repo — it landed 4 real commits here today; only the approval latch usually stops it
- [x] checkride's links slot scans INSIDE fenced blocks and code spans — every illustrative citation the docs/skills/template sweeps write must either resolve or not be link-shaped (it failed this build's own intent.md)
- [x] harden --body's stdin read: bodyArg guards only isTTY, so under an agent harness (stdin = socket) readFileSync(0) blocks forever; gate on fstatSync(0).isFile()||isFIFO() instead, at checkpoint.ts:359 and finish.ts:140
- [x] the --body anti-pattern warning exists ONLY in skills/finish/SKILL.md:49-52 (once per build); port it to skills/build/SKILL.md:73 and skills/verify/SKILL.md:68 — the two skills that actually run checkpoint --body, once per STEP
- [ ] harvest/SKILL.md:45-46 still teaches the pre-anchor Decision form (`D5 (retry-cap)`) when it folds a blocker into intent.md — outside step 8's seam, so the one intent.md-writing skill the anchored form never reached
- [ ] templates/intent.md's Q1 placeholder stays uncounted only because its body says "unresolved" and parseOpenQuestions filters on /resolved/i — an accident, not a design; guarded by a test but a confusing trap if the placeholder is ever reworded
- [ ] scripts/check-refs.ts's header comment still says the scanner is 'Not yet wired into checkride.config.json' — step 10 wired it as the refs slot, so the file's own account of itself is stale
- [ ] scripts/check-refs.ts's comments cite this build's local D3/D5/D6/D10/D13, which name entirely different decisions in the repo key (repo D6 is parseable-steps, not records-stay) — scripts/ is outside the scanner's walk so nothing catches it; repoint them at D74 (glossed-citations) now that it is published
- [ ] plumbbob check --only <slots> is ignored on the checkride path — 'check --only types' runs all 8 slots (65s) where 'pnpm exec checkride --only types' runs one (1.5s), so the iteration loop every skill recommends silently costs a full run; cli-reference.md documents the flags as mapping straight onto checkride's own, which is the contract to restore

## Harvest  *(run `/plumbbob:harvest` at each step boundary, after green)*

Classify each parked item as exactly ONE. Naming it before acting is what keeps you
from sprawling across branches.

| Class            | Meaning                                   | Action                          |
|------------------|-------------------------------------------|---------------------------------|
| **blocker**      | Plan was wrong/incomplete; can't proceed  | `/plumbbob:revert`, fold into intent  |
| **tangent**      | A different path, not clearly better      | Defer or kill. Default here.    |
| **pivot signal** | Evidence the whole approach is wrong      | Stop. Replan deliberately.      |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require a
> failed assumption, not a shinier idea, before you pivot.

Harvest results this boundary:

- 2026-08-08, at the step 4 boundary — four parked items, all four classified.
- **blocker (resolved)** — `cli-core.test.ts` ran `checkpoint -m --help` against the
  developer's own repo. It was the origin of step 1, which shipped it as `ead5b60b7`:
  the call now passes an explicit root (`run([...], NOWHERE)`), so the suite no longer
  touches the live branch. Recorded rather than dropped, because the four stray commits
  in the reflog are only explicable with this line next to them. No action left.
- **blocker (folded, no revert)** — checkride's `links` slot scans *inside* fenced blocks
  and code spans, so an illustrative citation written into a fence still has to resolve.
  It already failed this build's own `intent.md`, and steps 5, 7, and 11 are all sweeps
  that write teaching examples. Folded into [C4 (links-must-resolve)](intent.md#c4) so
  the three sweeps honor it up front instead of each discovering it on a red check.
- **tangent (adopted)** — the two `--body` findings: the stdin read that blocks forever
  under an agent harness, and the anti-pattern warning that lives only in the `finish`
  skill. Both are product defects found incidentally, off this build's subject and
  blocking nothing — ordinarily a defer. Promoted into the plan as step 16 by the human's
  call instead, which is what the capture existed to make possible.

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends a dated line here
every time a step lands — via `/plumbbob:build` or `/plumbbob:verify` — so this
fills in as you go, not at the end. Add your own decision/event lines too: this is what
you point at to say "I did that — the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*
- 2026-08-01 — step 1 checkpointed · ead5b60b7 — fix(cli): run the in-process CLI tests against a fixture repo (2 red, 1 drift, 21m)
- 2026-08-01 — step 2 checkpointed · 0581298be — chore(deps): upgrade checkride to 0.10.2 (1 drift, 19m)
- 2026-08-07 — step 13 checkpointed · 14ef4333f — chore(deps): upgrade checkride to 0.12.1
- 2026-08-07 — step 12 checkpointed · eb6fa00f7 — docs(voice): seed the hand-owned voice exemplar folder
- 2026-08-07 — step 3 checkpointed · 91ca7d427 — chore(gate): run a test-less checkride profile on every turn (1 drift)
- 2026-08-08 — step 4 checkpointed · 4b5abb31d — feat(refs): flag a citation that is bare, mislinked, or unglossed (46m)
- 2026-08-08 — step 5 checkpointed · a89cdf9e2 — docs(refs): gloss every decision citation in the docs (1 drift, 13m)
- 2026-08-08 — step 6 checkpointed · c03775e97 — docs(decisions): promote the commit-subject decisions into the repo key (12m)
- 2026-08-08 — step 7 checkpointed · 31ea13ffc — docs(skills): point the skills' citations at the published decisions (1 drift, 47m)
- 2026-08-08 — step 8 checkpointed · 82be65b9f — feat(intent): anchor and gloss the build-local citations (37m)
- 2026-08-08 — step 9 checkpointed · 90115ca06 — docs(cli): gloss the D-tags in the CLI's own output (6m)
- 2026-08-12 — step 10 checkpointed · 4bed3f823 — chore(gate): wire the citation check into checkride and the fast profile (5m)
