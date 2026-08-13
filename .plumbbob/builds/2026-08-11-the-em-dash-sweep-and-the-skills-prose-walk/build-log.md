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

# Build log — the em-dash sweep and the skills prose walk

**Current step:** 10 — docs(skills): sweep the skills prose
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status — CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint —
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. docs(skills): teach the harvest skill the anchored decision form
- ☑ 2. fix(skills): quote every SKILL.md frontmatter description
- ☑ 3. chore(gate): walk skills/ in the prose slot and burn down the findings
- ☑ 4. feat(prose): author the em-dash rule at warning and print the queue
- ☑ 5. docs(decisions): sweep the key and settle both format markers
- ☑ 6. docs(prose): sweep the guide docs
- ☑ 7. docs(prose): sweep the reference docs
- ☑ 8. docs(prose): sweep the front door and the agents guide
- ☑ 9. docs(templates): sweep the templates and land the decided marker
- ☐ 10. docs(skills): sweep the skills prose
- ☐ 11. chore(prose): sweep the src/lib doc comments
- ☐ 12. chore(prose): sweep the src/verbs doc comments
- ☐ 13. chore(prose): sweep the test, entrypoint, and script comments
- ☐ 14. docs(prose): exempt the receipts, sweep or exempt the essays
- ☐ 15. chore(gate): raise the em-dash rule to error and record it

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.
- [x] docs/evals/ carries 68 EmDash findings and no step owns it: steps 5-12 never name the eval receipts, so step 13 cannot reach error-green as planned. Records under C3, or a sweep step of its own -> /plumbbob:refine
- [x] step 11 measures 543 findings (460 production comments, 83 in test files), past D4's 150-250 band by 2x: it needs splitting before it is built -> /plumbbob:refine
- [ ] steps 6-13 queue counts undercount: vale collapses multi-line paragraphs when positioning findings, so per-file totals under-report (decisions.md's 85 was 197 outside code spans); re-measure at each step's entry with a mask-aware scan
- [ ] docs/voice/voice.md's decision-register parenthetical ('stands until that format is decided separately') went stale when D8 landed the comma marker; Rob's pen only (C2) -> flag, never model-edit

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

**Boundary after step 4** (2026-08-11, both confirmed by Rob, resolved with `/plumbbob:refine`):

- **blocker** — `docs/evals/` carries 68 EmDash findings and no step owned it, so step 13's
  repo-wide error-green was unreachable as planned. Folded into intent as
  [D9 (receipts-are-records)](intent.md#d9): the receipts are exempted as records under
  [C3 (records-stay)](intent.md#c3), not swept, and the stanza lands in what is now step 14
  alongside the essay exemptions.
- **blocker** — step 11 measured 543 findings, roughly twice the 150-250 review band
  [D4 (sweep-by-surface)](intent.md#d4) sets, so it could not be built as one reviewable
  checkpoint. Split along the directory seam into three steps: `src/lib/` 231, `src/verbs/`
  213, and tests plus entrypoints plus `scripts/` 99. The old steps 12 and 13 renumbered to
  14 and 15, and the plan is 15 steps long now.

Both numbers came from step 4's queue, which is what that step existed to print.

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends a dated line here
every time a step lands — via `/plumbbob:build` or `/plumbbob:verify` — so this
fills in as you go, not at the end. Add your own decision/event lines too: this is what
you point at to say "I did that — the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*
- 2026-08-12 — step 1 checkpointed · 09f654835 — docs(skills): teach the harvest skill the anchored decision form (7m)
- 2026-08-12 — step 2 checkpointed · e3b5af42c — fix(skills): quote every SKILL.md frontmatter description (6m)
- 2026-08-12 — step 3 checkpointed · af0e781e3 — chore(gate): walk skills/ in the prose slot and burn down the findings (8m)
- 2026-08-12 — step 4 checkpointed · 19e96e206 — feat(prose): author the em-dash rule at warning and print the queue (9m)
- 2026-08-13 — step 5 checkpointed · 89da5fe5b — docs(decisions): sweep the key and settle both format markers (33m)
- 2026-08-13 — step 6 checkpointed · 7a2fa3b35 — docs(prose): sweep the guide docs (1 drift, 66m)
- 2026-08-13 — step 7 checkpointed · 164460ed2 — docs(prose): sweep the reference docs (27m)
- 2026-08-13 — step 8 checkpointed · a1caea2b8 — docs(prose): sweep the front door and the agents guide (19m)
- 2026-08-13 — step 9 checkpointed · 44ee1ed11 — docs(templates): sweep the templates and land the decided marker (1 drift, 38m)
