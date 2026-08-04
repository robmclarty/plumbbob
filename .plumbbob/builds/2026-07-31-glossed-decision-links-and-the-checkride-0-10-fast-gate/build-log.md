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

**Current step:** none (at the boundary)
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status — CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint —
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. fix(cli): run the in-process CLI tests against a fixture repo
- ☑ 2. chore(deps): upgrade checkride to 0.10.2
- ☐ 3. chore(gate): run a test-less checkride profile on every turn
- ☐ 4. feat(refs): flag a citation that is bare, mislinked, or unglossed
- ☐ 5. docs(refs): gloss every decision citation in the docs
- ☐ 6. docs(decisions): promote the commit-subject decisions into the repo key
- ☐ 7. docs(skills): point the skills' citations at the published decisions
- ☐ 8. feat(intent): anchor and gloss the build-local citations
- ☐ 9. docs(cli): gloss the D-tags in the CLI's own output
- ☐ 10. chore(gate): wire the citation check into checkride and the fast profile
- ☐ 11. docs(decisions): record the citation convention and the gate profile

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.
- [ ] cli-core.test.ts runs `checkpoint -m --help` in-process against the developer's OWN repo — it landed 4 real commits here today; only the approval latch usually stops it
- [ ] checkride's links slot scans INSIDE fenced blocks and code spans — every illustrative citation the docs/skills/template sweeps write must either resolve or not be link-shaped (it failed this build's own intent.md)

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

- (none yet)

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends a dated line here
every time a step lands — via `/plumbbob:build` or `/plumbbob:verify` — so this
fills in as you go, not at the end. Add your own decision/event lines too: this is what
you point at to say "I did that — the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*
- 2026-08-01 — step 1 checkpointed · ead5b60b7 — fix(cli): run the in-process CLI tests against a fixture repo (2 red, 1 drift, 21m)
- 2026-08-01 — step 2 checkpointed · 0581298be — chore(deps): upgrade checkride to 0.10.2 (1 drift, 19m)
