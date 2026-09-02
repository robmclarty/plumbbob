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

# Build log: presentation

**Current step:** none (at the boundary)
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. docs(presentation): author the turn anatomy spec
- ☑ 2. feat(detail): the latest-step detail file and its lifecycle
- ☑ 3. feat(handoff): render the orientation banner and footer card
- ☑ 4. feat(verify): emit the recap skeleton and gate verdict line
- ☑ 5. docs(skills): align every skill output spec to the anatomy
- ☑ 6. feat(handoff): emit the plan-pause card, driver next-up, and trailing
- ☑ 7. feat(recap): handoff emits the whole CLI ending as one block
- ☑ 8. docs(anatomy): make the whole turn the anatomy and nothing else
- ☑ 9. feat(handoff): label the recommendation and split the move from its
- ☑ 10. docs(skills): relay every tier's ending from the plan and driver skills
- ☐ 11. docs(happy-path): make every illustrated block producible
- ☐ 12. feat(notices): every relayed line states its fact through one formatter
- ☐ 13. feat(handoff): point past an open spike and out of a finished session
- ☐ 14. test(evals): run the eval tier against the new anatomy

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

- [x] step 5 gap: the plan-pause your-call block and the mid-step driver next-up line are spec'd in presentation.md but not yet emitted by `plumbbob handoff` (needs a src change, outside step 5's docs seam); skills document the tier ending the CLI actually emits rather than fake the furniture.
- [x] bug: handoff's footer card omits a trailing blank line (src/verbs/handoff.ts ends its stdout with a single \n), so the next output clobbers the last your-call line — emit a trailing blank line so the card ends the turn with visual separation. A src fix, outside step 5's docs seam.
- [x] the standalone verdict line duplicates the recap check row: step 7 computes that row anyway, so fold the gate verdict into it and drop the separate line from the anatomy (revisits D20)
- [x] recap values run long enough to force horizontal scrolling: give the row a width budget (short evidence clause in the recap, full story in the detail file)
- [x] close the pause with 1 or 2 sentences of recommendation / suggested next action, model-fed into handoff and rendered as plain text after the card, not inside a fence (revisits D5 verdict-last)
- [x] checkride summary.json marks nothing on a narrowed run; handoff's check row can only say NOT-the-full-check when skips are recorded
- [x] checkride verdict rewording retires the literal NOT-the-full-check phrase; sweep plumbbob's AGENTS.md stanza, verify skill, presentation spec, and summaryCheckRow suffix when the new checkride ships
- [x] docs/cli-reference.md's handoff entry still calls the card the always-last text and omits the recap fence, inline diff, and recommendation the pause block now carries; outside step 8's seam, sweep it with the step-10 reconciliation
- [x] plumbbob's own boundary and driver lines (checkpoint's 'step N checkpointed — sha. Back at the boundary.', park's 'parked: tag: text') do not meet the one-colon, no-dash notice register presentation.md now states; a src sweep of those strings, outside step 8's docs seam

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

- **blocker**: the anatomy gap (the plan-pause card and driver next-up line are
  not emitted by `handoff`). The human wants the whole anatomy in this build, so
  the shipped CLI must produce every tier's ending, not the skills faking it in
  prose. Folded into intent as D17 (whole-anatomy-emitted) and steps 6 and 8.
- **blocker**: `handoff`'s trailing-newline bug (the card clobbers its own last
  line). A defect in the footer card, the build's core deliverable; a card flush
  against the next output cannot be the turn's last text (D5). Folded into D17
  and step 6.
- Fresh feedback this boundary (not a parked item): the holistic turn reads
  repetitive and verbose (step 5's own pause stated the check verdict three
  times, wrapped in meta-narration). Captured as D18 (turn-is-the-anatomy) and
  step 7.

Harvest results at the step-6 boundary (all three Rob's calls, all blocker):

- **blocker**: the standalone verdict line duplicates the recap's check row.
  Step 7 computes that row from the same measurement, so the anatomy would
  render one fact twice, the repetition D18 (turn-is-the-anatomy) exists to
  kill. Folded into intent as D21 (verdict-in-the-row); steps 7 and 8 absorb.
- **blocker**: recap rows run long enough to force horizontal scrolling, and a
  readout that scrolls sideways fails the thing the anatomy is for. Folded into
  intent as D22 (recap-width-budget); steps 7 and 8 absorb.
- **blocker**: the pause ends without a recommendation, and Rob calls that a
  defect, not an enhancement: the your-call block teaches the moves but does
  not say which one to take. Folded into intent as D23 (recommendation-last);
  steps 7 and 8 absorb.

Harvest results at the step-7 boundary (both Rob's calls, both blocker, both
already handled in flight at his direction):

- **blocker**: a narrowed checkride run recorded nothing about its narrowing,
  so the check row could not state its scope. Handled during step 7: checkride
  (an uncommitted diff in its own repo) now records `--only`/`--skip`
  deselections as skipped summary rows, and the check row names them. Folded
  into intent as D24 (narrowing-named-not-shouted).
- **blocker**: Rob's checkride verdict rewording retires the literal
  `NOT the full check` phrase, so the remaining doc steps must not re-spec a
  dead string. The `summaryCheckRow` half landed in step 7; the presentation
  spec and verify skill are step 8's seam and happy-path is step 10, all now
  building to D24 (narrowing-named-not-shouted). The AGENTS.md stanza is a
  release-time chore: it regenerates from `checkride agent-setup` at the next
  refresh after the checkride release. No new steps.

Harvest results at the step-9 boundary (both parked during step 8, both Rob's
calls, both blocker):

- **blocker**: the `handoff` entry in `docs/cli-reference.md` still calls the
  card the always-last text and omits the recap fence, the inline diff, and
  the labeled recommendation, so the reference contradicts the handoff the
  build ships. A seam the plan missed, not a different path. Folded into
  intent as D26 (reference-tracks-the-card); step 11's seam widens to carry
  the reference, since that step already reconciles a doc against real CLI
  output. No new step.
- **blocker**: plumbbob's own boundary and driver lines (`checkpointed — <sha>.
  Back at the boundary.`, `parked: <tag>: <text>`, and build's no-undone-step
  refusal) break the one-colon notice register the spec states, and the spec
  itself calls them a parked sweep, not an exemption. The sweep has to land
  before the eval tier reads those turn shapes. Folded into intent as
  D27 (own-lines-one-colon) and a new step 12; the eval step shifts to 13.
- Fresh design at this boundary (not a parked item): the sweep's real
  perimeter is every relayed line, seventeen of them, and each carries its
  own pointer sentence. Recorded as D28 (fact-not-move) through
  D32 (handoff-owns-every-pointer); step 12 re-cut as the sweep, step 13
  added for handoff's pointer, the eval step to 14.

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends a dated line here
every time a step lands (via `/plumbbob:build` or `/plumbbob:verify`), so this
fills in as you go, not at the end. Add your own decision/event lines too: this is what
you point at to say "I did that: the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*

- 2026-08-29 — step 1 checkpointed · e1469c7f7 — docs(presentation): author the turn anatomy spec (1 drift, 52m)
- 2026-08-29 — step 2 checkpointed · 030407ba6 — feat(detail): the latest-step detail file and its lifecycle (1 drift, 11m)
- 2026-08-29 — step 3 checkpointed · 88d0656d3 — feat(handoff): render the orientation banner and footer card (1 drift, 16m)
- 2026-08-29 — step 4 checkpointed · 65726e6f7 — feat(verify): emit the recap skeleton and gate verdict line (150m)
- 2026-08-29 — step 5 checkpointed · 45705f5a2 — docs(skills): align every skill output spec to the anatomy (44m)
- 2026-09-01 — boundary decisions (Rob's calls): whole anatomy in this build; CLI does what it can (D19 (cli-does-what-it-can): check/seam/diff rows move to the CLI); one seam per turn (D20 (one-seam-turn): handoff emits the whole ending, the model relays once). Plan grew to 11 steps.
- 2026-09-02 — step 6 checkpointed · 23768b624 — feat(handoff): emit the plan-pause card, driver next-up, and trailing (1 drift, 16m)
- 2026-09-02 — step 7 checkpointed · 558737199 — feat(recap): handoff emits the whole CLI ending as one block (1 drift, 94m)
- 2026-09-02 — step 8 checkpointed · 2cc7a18bf — docs(anatomy): make the whole turn the anatomy and nothing else (16m)
- 2026-09-02 — step 9 checkpointed · 30c88e8cd — feat(handoff): label the recommendation and split the move from its (7m)
- 2026-09-02 — step 10 checkpointed · 0dd5ad52e — docs(skills): relay every tier's ending from the plan and driver skills (88m)
