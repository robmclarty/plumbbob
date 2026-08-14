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

# Build log: the leftovers: mask-aware sweep sizing, the park-nudge eval, and abandon-step

**Current step:** 8 — docs(abandon): add the driver skill and record the decision
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. chore(refs): share the masking spans and mask indented blocks
- ☑ 2. feat(prose): add a mask-aware counter that sizes a prose sweep
- ☑ 3. fix(refs): mask an inline code span that wraps a line break
- ☑ 4. fix(refs): scan scripts/ and cite only global decisions there
- ☑ 5. chore(evals): re-measure c5 both arms at 0.10.0, land the receipt
- ☑ 6. fix(turn): reword the park nudge [STRUCK 2026-08-14, not built]
- ☑ 7. feat(abandon): drop an in-flight step and keep the work
- ☐ 8. docs(abandon): add the driver skill and record the decision

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.
- [x] prose-mask.ts's INLINE_CODE_RE doesn't match a backtick-delimited span that wraps across a line break, so an em-dash inside one (e.g. skills/verify/SKILL.md:100-101) reads as unmasked prose to count-prose.ts
- [x] check-refs.ts's scan surface excludes scripts/**/*.ts, so a build-local D#/C# citation in a scripts/ comment (e.g. D2, D3, D14 in prose-mask.ts and count-prose.ts, all numbers already taken by unrelated decisions in docs/decisions.md) is never checked and can read as the wrong global decision
- [x] step 3's fix added two more build-local D15 citations in scripts/prose-mask.ts (the collectNonBlankLineBlocks doc comment, and collectInlineCodeSpans's); step 4's done-when count (eight build-local tags: D2 x4, D14 x3, D3 x1) is now stale by two and needs D15 named in words too

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

**2026-08-14, after step 2. Two items, both called blocker by Rob; no tangents, no pivot signals.**

- **blocker** — the shared mask misses an inline code span that wraps a line break.
  Verified live: `skills/verify/SKILL.md` counts 1, and that match is the em-dash inside
  `` `checkpoint refused ... since this step began` ``, a code span broken across lines
  100-101. Vale masks it and the prose slot is green, so the counter over-reports against
  the very instrument it exists to predict. `check-refs.ts` shares the mask and the blind
  spot. Folded in as D15 (wrapped-code-spans).
- **blocker** — `scripts/**/*.ts` sits outside the citation scanner's surface, which was
  hiding real violations in the files steps 1 and 2 just shipped (seven counted at this
  boundary; ten once `check-refs.ts` itself was scanned at the `/plumbbob:step` pass): `D2` (retired
  globally) twice in each file, `D3` unglossed, and `D14` glossed `commonmark-parity`
  where the global key reads `throwaway-repo-tests`. What made it a blocker rather than a
  tangent is the ordering hazard ahead: step 5 writes `src/verbs/abandon.ts`, `src/` *is*
  scanned, and its done-when cites build-local D6 through D9, which step 6 does not
  promote to the key until after. Folded in as D16 (scripts-in-refs-scan) and D17
  (global-tags-only-in-code).

Both need plan surgery, not just a decision: the mask fix and the scan-surface widening
each want a step, landing before step 5 so the refs slot is honest when abandon is
written. That is `/plumbbob:step`'s call, not this skill's. *(Made the same day: they ride
as steps 3 and 4, ahead of the evals; abandon now rides 7, its docs 8; see the Log.)*

**2026-08-14, after step 3. One item, called blocker by Rob; no tangents, no pivot signals.**

- **blocker** — step 3's wrapped-span fix left two build-local `D15 (wrapped-code-spans)`
  citations behind in `scripts/prose-mask.ts` (the `collectNonBlankLineBlocks` doc comment
  and `collectInlineCodeSpans`'s, lines 40 and 68). Global `D15` is `one-next-move`
  (`docs/decisions.md:115`), so the moment step 4 widens the scan to `scripts/**` the pair
  reads as the wrong global decision: the very gloss mismatch step 4 exists to clear.
  Step 4's done-when was counted before step 3 landed, so it undercounts by two — "eight
  build-local tags / ten violations" should read ten and twelve, with `D15` ×2 named in
  words alongside `D2`, `D14`, and `D3`. No new decision: this rides under the standing
  D17 (global-tags-only-in-code); the fix is a done-when count correction, and that is
  `/plumbbob:step`'s surgery, not this skill's. *(Made the same day: step 4's done-when
  corrected via `/plumbbob:step`; see the Log.)*

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends a dated line here
every time a step lands (via `/plumbbob:build` or `/plumbbob:verify`), so this
fills in as you go, not at the end. Add your own decision/event lines too: this is what
you point at to say "I did that: the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*
- 2026-08-14 — step 1 checkpointed · 38a2b8b56 — chore(refs): share the masking spans and mask indented blocks (2m)
- 2026-08-14 — step 2 checkpointed · b929bc11a — feat(prose): add a mask-aware counter that sizes a prose sweep (1 drift, 15m)
- 2026-08-14 — plan revised (`/plumbbob:step`, Rob's call): the two harvest blockers land early as steps 3 (wrapped-span mask fix, D15) and 4 (scripts/ joins the refs scan, D16/D17), so the scanner is honest before abandon is written; evals and the reword shift to 5–6, abandon and its docs to 7–8; every step reference in intent.md synced to the new numbers
- 2026-08-14 — step 3 checkpointed · 6e5db5d73 — fix(refs): mask an inline code span that wraps a line break (7m)
- 2026-08-14 — harvest after step 3 (Rob's call): the one open park item called a blocker; step 3 seeded two build-local `D15 (wrapped-code-spans)` cites in `scripts/prose-mask.ts` (lines 40, 68), and global `D15` is `one-next-move`, so they read as the wrong decision once step 4 widens the scan. No new decision; rides under the standing D17 (global-tags-only-in-code)
- 2026-08-14 — step 4 done-when corrected (`/plumbbob:step`, Rob's call): the tally now reads twelve violations and ten build-local tags, `D15` ×2 joining `D2` ×4, `D14` ×3, `D3` ×1; seam and model unchanged since both cites already sit inside the seam's `scripts/prose-mask.ts`
- 2026-08-14 — step 4 checkpointed · bcc358192 — fix(refs): scan scripts/ and cite only global decisions there (9m)
- 2026-08-14 — step 5 checkpointed · d3a82abaa — chore(evals): re-measure c5 both arms at 0.10.0, land the receipt (1 drift, 68m)
- 2026-08-14 — step 7 checkpointed · 399677d8b — feat(abandon): drop an in-flight step and keep the work (20m)
