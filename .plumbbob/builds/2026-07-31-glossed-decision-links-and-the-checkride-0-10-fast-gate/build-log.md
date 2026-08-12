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

**Current step:** 15 — docs(agents): bridge AGENTS.md into Claude Code with a CLAUDE.md import
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
- ☑ 11. docs(decisions): record the citation convention and the gate profile
- ☑ 12. docs(voice): seed the hand-owned voice exemplar folder
- ☑ 13. chore(deps): upgrade checkride to 0.12.1
- ☑ 14. chore(gate): install the prose slot and point its exemplars at the voice folder
- ☐ 15. docs(agents): bridge AGENTS.md into Claude Code with a CLAUDE.md import
- ☐ 16. docs(prose): burn down the first prose run by hand
- ☐ 17. fix(cli): refuse --body when stdin cannot deliver one
- ☐ 18. fix(intent): count an open question by its resolution marker, not a substring

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.
- [x] cli-core.test.ts runs `checkpoint -m --help` in-process against the developer's OWN repo — it landed 4 real commits here today; only the approval latch usually stops it
- [x] checkride's links slot scans INSIDE fenced blocks and code spans — every illustrative citation the docs/skills/template sweeps write must either resolve or not be link-shaped (it failed this build's own intent.md)
- [x] harden --body's stdin read: bodyArg guards only isTTY, so under an agent harness (stdin = socket) readFileSync(0) blocks forever; gate on fstatSync(0).isFile()||isFIFO() instead, at checkpoint.ts:359 and finish.ts:140
- [x] the --body anti-pattern warning exists ONLY in skills/finish/SKILL.md:49-52 (once per build); port it to skills/build/SKILL.md:73 and skills/verify/SKILL.md:68 — the two skills that actually run checkpoint --body, once per STEP
- [x] harvest/SKILL.md:45-46 still teaches the pre-anchor Decision form (`D5 (retry-cap)`) when it folds a blocker into intent.md — outside step 8's seam, so the one intent.md-writing skill the anchored form never reached
- [x] templates/intent.md's Q1 placeholder stays uncounted only because its body says "unresolved" and parseOpenQuestions filters on /resolved/i — an accident, not a design; guarded by a test but a confusing trap if the placeholder is ever reworded
- [x] scripts/check-refs.ts's header comment still says the scanner is 'Not yet wired into checkride.config.json' — step 10 wired it as the refs slot, so the file's own account of itself is stale
- [x] scripts/check-refs.ts's comments cite this build's local D3/D5/D6/D10/D13, which name entirely different decisions in the repo key (repo D6 is parseable-steps, not records-stay) — scripts/ is outside the scanner's walk so nothing catches it; repoint them at D74 (glossed-citations) now that it is published
- [x] plumbbob check --only <slots> is ignored on the checkride path — 'check --only types' runs all 8 slots (65s) where 'pnpm exec checkride --only types' runs one (1.5s), so the iteration loop every skill recommends silently costs a full run; cli-reference.md documents the flags as mapping straight onto checkride's own, which is the contract to restore
- [x] decide whether plumbbob's repo root wants a CLAUDE.md pointer at AGENTS.md — checkride init offers to write one; step 14 removed it as out of scope
- [x] quote the SKILL.md frontmatter descriptions so vale can parse them — all 13 carry an unquoted colon, which hard-errors E201 and aborts the whole prose run, so skills/ is out of the vale walk until then
- [x] step 15 must also drop `optIn: true` from the prose entry — its done-when only asks for a green `--only prose`, which passes while the slot still sits out of the default run and the fast turn gate

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

- 2026-08-12, at the step 11 boundary — five parked items, four classified, one still open.
- **tangent (deferred)** — `skills/harvest/SKILL.md` still teaches the unanchored Decision
  form (`D5 (retry-cap): …`, no `<a id>`), so it is one step behind step 8. It is the one
  intent.md-writing skill that neither step 7's sweep nor step 8's seam reached. Deferred
  rather than fixed, but the escalation is on the record: the `links` slot scans
  `.plumbbob/builds/*/intent.md` — the discovery behind [C4 (links-must-resolve)](intent.md#c4)
  — so a blocker folded in by a future harvest can leave a dangling anchor and redden that
  build's gate.
- **blocker (fixed at the boundary)** — `scripts/check-refs.ts` still described itself as
  "not yet wired into checkride.config.json" after step 10 wired it as the `refs` slot. One
  comment, factually false, fixed in place.
- **blocker (fixed at the boundary)** — the same file's comments cited this build's *local*
  D3/D5/D6/D10/D13, which name entirely different decisions in the repo key (repo D6 is
  `parseable-steps`, not `records-stay`), including one in a **printed** violation message.
  Nothing caught it because `scripts/` sits outside the scanner's own walk — the failure this
  build exists to end, living in the build's own scanner. All six sites now cite
  [D74 (glossed-citations)](../../../docs/decisions.md#d74), which step 11 had just published
  while listing this very file under its *Tagged in*. No new intent Decision was minted: D74
  already settled the rule, and this was applying it, not deciding it.
- **tangent (adopted as step 17)** — `parseOpenQuestions` filters opener lines on the bare
  substring `/resolved/i`. The 2026-07-18 intent-legibility build already named the benign
  face (its local `placeholder-uncounted`: the template's placeholder is uncounted *only*
  because "unresolved" contains "resolved") and pinned it with a test, but left the mechanism
  accidental. The malign face is what earns the step: a genuinely open question whose opener
  says "still unresolved" is read as resolved and disappears from the count. Surveyed all 31
  Q-openers in the build history to size the fix — `/\bresolved\b/i` matches every form in use
  and fails on "unresolved", with no regression, where the stricter-looking `*resolved:*`
  match would regress 15 openers. Promoted into the plan by the human's call, the same route
  the `--body` findings took to step 16, and carrying the promotion of that build's two
  stranded locals into the repo key.
- **tangent (killed)** — the claim that `plumbbob check --only <slots>` is ignored was wrong.
  This repo sets `"check": "pnpm check"`, so it runs the *override* path, where the narrowing
  flags are warned-and-ignored by design ([D24 (configurable-check)](../../../docs/decisions.md#d24));
  the CLI prints exactly that warning, and `docs/cli-reference.md` already documents it. Kept
  as a killed line rather than deleted, because the residual is worth knowing: configuring
  `check` means this repo's daily dogfood never exercises plumbbob's own in-process checkride
  path ([D32 (checkride-gate)](../../../docs/decisions.md#d32)).

- 2026-08-11, at the step 14 boundary — three parked items, all three classified.
- **blocker (folded, no revert)** — the burn-down step's done-when asked only for a green
  `--only prose`, which is satisfiable while `optIn: true` still holds the slot out of the
  default run. The build could have reached "done" with the prose slot installed and never
  running. Folded into the step's done-when and seam in
  [intent.md](intent.md#steps), which now names the flag's removal explicitly. Worth naming
  the shape rather than just the fix: step 14 introduced `optIn: true` deliberately, as the
  [D3 (checker-authored-first-wired-last)](intent.md#d3) bargain applied to prose, and a
  staging flag is exactly the kind of thing that becomes permanent by being nobody's job to
  remove.
- **blocker (fold + new step)** — the parked "does the repo root want a `CLAUDE.md`?"
  question, proposed as a tangent and overturned by checking it. Anthropic's docs say plainly
  that Claude Code reads `CLAUDE.md` and not `AGENTS.md`, and prescribe a root `CLAUDE.md`
  carrying an `@AGENTS.md` import. So step 14's whole deliverable — the generated stanza
  pointing a writing session at `docs/voice/` — was loading into nothing, and
  [D19 (exemplars-are-config-not-prompt)](intent.md#d19) held in mechanism but not in
  delivery. D19 amended, and the bridge inserted as the new step 15, ahead of the burn-down
  rather than after it, so the anchor is live for the one step in this build that writes
  prose by hand. The file `checkride init` offered and step 14 removed as out of scope turns
  out to be the thing that makes step 14 real.
- **tangent (deferred)** — all 13 `SKILL.md` frontmatter descriptions carry an unquoted
  colon; vale parses frontmatter as YAML, and one `E201` aborts the entire run rather than
  skipping the file, so `skills/` is out of the vale walk. Deferred: it blocks nothing, and
  quoting 13 values touches the shipped plugin surface, which wants its own step and its own
  check that the skills still load. The escalation is on the record, and the burn-down step
  carries it too — `skills/` is among the most-read prose in the repo, so "prose is green"
  will understate coverage until this lands.

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
- 2026-08-12 — step 11 checkpointed · bc39ce348 — docs(decisions): record the citation convention and the gate profile (41m)
- 2026-08-12 — step 14 checkpointed · 50bd46c80 — chore(gate): install the prose slot and point its exemplars at the voice folder (1 drift, 21m)
