# presentation

**Phase** (your own bookkeeping while framing): decided; building next
**Size:** medium
**Scope:** presentation

## Frame

- **Problem:** every plumbbob turn ends in a different shape. The CLI's hand-off
  block is the only stable text; the recap around it (what was done, which
  decisions and constraints were honored, whether the seam held) is composed
  fresh by whichever model is driving, so it varies in length, order, and
  register from turn to turn. Detail floods the picture: paths and identifiers
  ride inside sentences, code arrives unasked, and the two things the human
  needs (are we on track, and what is next) are buried. The aligned pause block
  in `docs/happy-path.md:152-165` is an illustration nothing produces, and the
  checkride gate verdict has no placement rule at all.
- **Smallest thing that solves it:** one written spec of the turn's anatomy,
  enforced two ways per [D1 (consistency-from-ownership)](#d1): the CLI renders
  every deterministic line, and the skills carry an exact template for the
  judgment lines only a model can fill. Detail moves behind numbered handles
  into one overwritten file, with git as the archive.
- **Done looks like:** two consecutive step turns, driven by different models,
  render the same anatomy: numbered plain-English highlights, the aligned
  recap carrying the gate verdict in its check row, the footer card, and the
  model's recommendation as the turn's last words.
  Every illustrated block in `docs/happy-path.md` is producible by the shipped
  CLI and skills. The eval tier (`test/evals/`) runs green against the new
  anatomy, with a fresh receipt in `docs/evals/`. `pnpm check` green.
- **Explicitly NOT doing:** no TUI, no ANSI color, no cursor control; no new
  dependencies; no new data collection (presentation only); no verbosity key in
  settings yet (parked until the fixed anatomy proves insufficient); no edits
  to `docs/voice`; no changes to checkride's own output (only to where the
  relay places it).

## Architecture sketch

```
a step turn, top to bottom
  [model] headline + numbered highlights      <- skill template, plain English
  [cli]   recap: measured rows + the model's
          judgment rows, verdict in the check
          row, every line inside 72 columns
  [cli]   footer card: banner (glyph + word + worst component + step N of M),
          next up (step + model), the your-call block
  [cli]   recommendation: 1-2 plain sentences  <- model judgment, fed through
          relayed unfenced, the last words        the detail file

the detail plane (never in the default turn body)
  .plumbbob/detail.md                         <- the in-flight step's full
                                                 detail, overwritten at each
                                                 step boundary; also the wire
                                                 handoff parses for the banner
  git (checkpoint commits)                    <- the archive: diff in the
                                                 tree, commentary in the body
  the chat: "expand 2"                        <- answered from disk or git
                                                 show, never from recall
```

## Decisions

- <a id="d1"></a>**D1 (consistency-from-ownership)**: whatever can be
  deterministic is CLI-rendered and relayed verbatim; the model composes only
  judgment lines, under an exact template, *because* the hand-off block already
  proved relay beats re-composition for cross-model consistency.
- <a id="d2"></a>**D2 (word-carries-meaning)**: every glyph is paired with its
  word; styling and glyphs are redundancy, never the sole channel, *because*
  renderers differ, fonts drop glyphs to tofu, and screen readers speak
  Unicode names (Primer: enhance meaning, never communicate it).
- <a id="d3"></a>**D3 (text-glyphs-only)**: the vocabulary is a closed set of
  text-presentation codepoints (today's de-facto CLI set `✓ ✗ ▸ ○ ⚠ · →` plus
  the status ladder), no emoji-presentation codepoints, *because* emoji force
  color and render at unpredictable width across terminals.
- <a id="d4"></a>**D4 (honest-elision)**: hidden detail is always counted and
  pointed at ("12 lines parked in the detail file"), *because* a silent cut
  reads as coverage (terraform's concise-diff lesson).
- <a id="d5"></a>**D5 (verdict-last)**: the footer card is the final text of a
  turn, *because* the eye lands at the end of terminal output (clig.dev).
- <a id="d6"></a>**D6 (vanish-or-collapse)**: a section that does not apply
  disappears entirely; a section whose emptiness is meaningful collapses to
  its one-line good state ("constraints: all honored"), *because* "no data for
  this section" is clutter, while silence on a meaningful zero is ambiguous.
- <a id="d7"></a>**D7 (code-on-request)**: code blocks stay out of the default
  turn body, with one exception: a diff of 20 lines or fewer may ride inline
  at the pause; everything larger lives in the detail plane behind an honest
  diffstat row, *because* code is the single largest source of visual flood
  and the count ([D4 (honest-elision)](#d4)) covers what moved.
- <a id="d8"></a>**D8 (plumb-when-natural)**: the presentation reaches for the
  plumb register where it fits (plumb, a hair off, out of plumb) and plain
  English otherwise, *because* a metaphor used only where it comes naturally
  stays a metaphor instead of a costume.
- <a id="d9"></a>**D9 (latest-detail-file)**: one untracked file
  (`.plumbbob/detail.md`) holds the in-flight step's full detail; checkpoint
  appends it to the commit body (an explicit `--body` leads) and then
  truncates it, *because* the checkpoint commit is the durable archive and a
  pile of stale detail files is its own flood; past-step expansion answers
  from `git show`, never from memory.
- <a id="d10"></a>**D10 (recap-split-by-nature)**: the CLI owns banner,
  verdict line, and footer card (extending `plumbbob handoff`); the skill
  carries an exact fenced template for the judgment rows, *because*
  determinism belongs to the CLI and judgment belongs to the model, the same
  split that already works for `## Steps`.
- <a id="d11"></a>**D11 (worst-of-banner)**: the banner's level is computed
  worst-of over the recap rows (check, done-when, decisions, constraints,
  seam) plus the step's accrued stats (reds, reverts), and it names its worst
  component inline ("a hair off · 2 red runs before green"), *because* a
  computed banner is trustworthy where a vibed one is theater, and a named
  cause saves the hunt.
- <a id="d12"></a>**D12 (instructive-choice)**: the card closes with a
  your-call block of three moves (approve, fix, revert), each line quoting or
  describing what the human says and stating what happens next, *because* the
  card has to teach itself; a bare "looks good / needs work" assumes the
  reader already knows the ceremony.
- <a id="d13"></a>**D13 (circle-ladder)**: the ladder is `● plumb` (every
  measure true), `◐ a hair off` (green with advisories accrued), `○ out of
  plumb` (a measure failing now), `✗ not standing` (truing the diff will not
  fix it); the fill drains as the plumb line stops holding, *because* the
  split that earns a fourth state is "fix the work" versus "fix the plan",
  and each state must ask a different move of the human.
- <a id="d14"></a>**D14 (recap-as-wire)**: the model writes the exact fenced
  recap into the detail file before calling `plumbbob handoff`; handoff
  parses the rows, folds them worst-of with its measured facts, and re-emits
  the check row from its own measurement, *because* measured beats attested,
  and an exact format is a parseable wire the way `## Steps` already is.
- <a id="d15"></a>**D15 (three-tier-anatomy)**: decision turns (the
  build/verify pause, the plan pause, the auto halt) render the full card,
  your-call included; orientation turns (status, the checkpoint boundary,
  finish) render banner plus next-up; driver verbs keep their verbatim relay
  plus next-up, *because* the your-call block belongs only where a decision
  is actually pending.
- <a id="d16"></a>**D16 (latest-card-addressing)**: a bare expand number
  binds to the latest card; an older step takes its step number or sha, and
  the detail file anchors the same numbers, *because* expansion must be a
  lookup, never a recall.
- <a id="d17"></a>**D17 (whole-anatomy-emitted)**: `plumbbob handoff` emits
  every tier's ending, not only the step-pause and boundary cards: the
  plan-pause card (the your-call block with the two plan-pause moves) and the
  driver next-up line (pointing back at the in-flight step), and every card
  ends with a trailing blank line, *because* the done-looks-like requires every
  illustrated ending to be producible by the shipped CLI, and a card flush
  against the next output cannot be the turn's last text
  ([D5 (verdict-last)](#d5)). Resolves the step-5 parked gap and the
  trailing-newline bug.
- <a id="d18"></a>**D18 (turn-is-the-anatomy)**: a turn is the anatomy and
  nothing else: the model never narrates or frames the CLI-rendered parts (no
  "here is the pause", no restating the check verdict in prose), each fact
  appears once in its designated part, and any judgment or flag rides as a
  one-line highlight, not a freeform prose block, *because* the parts render
  clean while the holistic turn goes verbose and repetitive when the model
  wraps them in meta-narration and duplicates facts across parts (step 5's own
  pause stated the check verdict three times).
- <a id="d19"></a>**D19 (cli-does-what-it-can)**: apply
  [D1 (consistency-from-ownership)](#d1) to the limit: if the CLI can compute or
  render something deterministically, the CLI does it, and the model is reserved
  for what only it can do (judgment and prose). Concretely the recap's `check`,
  `seam`, and `diff` rows are CLI-computed (check from the last run, seam from
  the SEAM marker versus `git diff`, diff from `git diff --numstat`) and the
  model writes only the three judgment rows (`done-when`, `decisions`,
  `constraints`), *because* every row the model attests is one it can pad or get
  wrong, and determinism is what earns the readout its trust.
- <a id="d20"></a>**D20 (one-seam-turn)**: the CLI ending is emitted by one
  command as one contiguous block (the assembled recap fence, the verdict line,
  the footer card, the trailing blank line, and the inline diff fence when the
  change is 20 lines or fewer); the model's final authored line is the detail
  pointer, it relays exactly once, and it writes nothing after the relay,
  *because* every gap between interleaved parts is where meta-narration breeds,
  and a single seam leaves it nowhere to live; a positional rule ("your last
  line, then relay, then end") holds where a "don't repeat" prohibition does
  not.
- <a id="d21"></a>**D21 (verdict-in-the-row)**: the gate verdict's one home is
  the recap's `check` row; the standalone verdict line leaves the anatomy,
  *because* handoff re-emits that row from its own measurement
  ([D19 (cli-does-what-it-can)](#d19)), and one measured fact rendered twice is
  the repetition [D18 (turn-is-the-anatomy)](#d18) exists to kill. The row's
  evidence names the gate and its scope, so a narrowed gate still says
  `NOT the full check` where the verdict now lives. Amends
  [D20 (one-seam-turn)](#d20)'s block contents and step 4's skeleton.
- <a id="d22"></a>**D22 (recap-width-budget)**: every recap line fits 72
  columns: the label pad leaves 58 for the value, the evidence is one short
  clause, and the full story lives behind the handle in the detail file
  ([D4 (honest-elision)](#d4)), *because* a fence never wraps, so an overlong
  row scrolls sideways in exactly the renderers
  [C2 (markdown-only)](#c2) exists for. CLI-computed rows conform by
  construction; the skill template carries the budget for the judgment rows.
- <a id="d23"></a>**D23 (recommendation-last)**: a decision turn's last words
  are the model's recommendation: one or two plain sentences naming the move
  it would take and why, written into the detail file as a
  `## recommendation` section, emitted by handoff after the card, and relayed
  as plain prose, never fenced, *because* the your-call block teaches the
  moves without saying which one to take, and a pause that leaves the human
  deciding unassisted is a defect (Rob's call), not a missing nicety. Amends
  [D5 (verdict-last)](#d5): the card stays the last rendered block; the
  recommendation is the last text. Orientation and driver turns are unchanged
  (nothing is pending there).

- <a id="d24"></a>**D24 (narrowing-named-not-shouted)**: a narrowed gate
  discloses itself by naming its deselected slots, read from the summary's
  skipped rows (checkride records `--only`/`--skip` deselections; the check
  row renders `· without test`), and the literal `NOT the full check` phrase
  retires from the anatomy, *because* Rob's checkride verdict rewording
  (2026-09-01) moved every verdict to one sentence with one parenthetical,
  and a named narrowing states the same fact without the shout. Amends
  [D21 (verdict-in-the-row)](#d21); steps 8 and 10 write the docs to this,
  and the AGENTS.md stanza refreshes at the next checkride release.
- <a id="d25"></a>**D25 (labeled-recommendation)**: the recommendation opens
  with a bold `**Recommendation**:` label that `plumbbob handoff` prepends, then
  the move as its own sentence closed by a period, then the reason as a
  capitalized sentence (`**Recommendation**: Approve it. The gate is green
  and the seam held.`), *because* the turn's last text should announce what
  it is before the eye reads it, and a colon after the move fused the call
  and its reason into one breathless clause (Rob's call, 2026-09-01). The
  label is the one bold token the turn body spends. Amends
  [D23 (recommendation-last)](#d23).

## Constraints

- <a id="c1"></a>**C1 (no-new-deps)**: no new dependencies.
- <a id="c2"></a>**C2 (markdown-only)**: everything must read well in Claude
  Code's and Cursor's renderers and as plain text in a PR diff; alignment
  survives only inside a fence.
- <a id="c3"></a>**C3 (sentinels-stay-exact)**: parse-bearing strings
  (`NO ACTIVE SESSION`, the `## Steps` format, checkpoint subjects) are
  unchanged.
- <a id="c4"></a>**C4 (prose-planes-hold)**:
  [D78 (em-dash-ban)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d78)
  stands, carve-out included: skill bodies stay vale-clean while relayed CLI
  strings keep their em-dashes.
- <a id="c5"></a>**C5 (voice-untouchable)**: `docs/voice` is never edited.

## Steps

1. [x] docs(presentation): author the turn anatomy spec, **done when:**
   `docs/presentation.md` defines the highlights, recap, verdict line, footer
   card (your-call wording per [D12 (instructive-choice)](#d12)), the state
   table ([D13 (circle-ladder)](#d13)), the tier map
   ([D15 (three-tier-anatomy)](#d15)), the glyph vocabulary, and the
   threshold rules (the 20-line diff exception among them), and `pnpm check`
   is green
   - seam: `docs/presentation.md`
   - model: fable (the design judgment of the whole build lives in this document)
2. [x] feat(detail): the latest-step detail file and its lifecycle,
   **done when:** `.plumbbob/detail.md` is untracked, written before each
   pause, folded into the commit body and truncated by checkpoint per
   [D9 (latest-detail-file)](#d9), and unit tests cover the lifecycle
   - seam: `src/verbs/checkpoint.ts`, `src/verbs/start.ts`, `test/checkpoint.test.ts`
3. [x] feat(handoff): render the orientation banner and footer card,
   **done when:** unit tests assert the exact card text; the banner folds the
   parsed recap rows ([D14 (recap-as-wire)](#d14)) worst-of with measured
   facts ([D11 (worst-of-banner)](#d11)); the your-call block reads per
   [D12 (instructive-choice)](#d12)
   - seam: `src/verbs/handoff.ts`, `src/lib/orient.ts`, `test/handoff.test.ts`
   - model: sonnet (mechanical once step 1 has fixed the strings)
4. [x] feat(verify): emit the recap skeleton and gate verdict line,
   **done when:** the verify pause renders the recap template (diffstat row
   included per [D7 (code-on-request)](#d7)) with the check verdict verbatim
   on its own line
   - seam: `src/verbs/check.ts`, `skills/verify/SKILL.md`, `skills/build/SKILL.md`
5. [x] docs(skills): align every skill output spec to the anatomy,
   **done when:** the nine catalogued drifts (digest below) are gone, the
   hand-off block carries one name everywhere, every skill's ending sits in
   its [D15 (three-tier-anatomy)](#d15) tier, and build/verify spec the
   detail-file write
   - seam: `skills/`, `docs/cli-reference.md`
   - model: opus (voice-governed prose across nine files)
6. [x] feat(handoff): emit the plan-pause card, driver next-up, and trailing
   blank line, **done when:** `plumbbob handoff` renders the plan-pause card
   (the your-call block with the two plan-pause moves) and a driver-tier next-up
   line pointing back at the in-flight step, and every card ends with a trailing
   blank line ([D17 (whole-anatomy-emitted)](#d17)); `test/handoff.test.ts`
   asserts each shape
   - seam: `src/verbs/handoff.ts`, `src/lib/orient.ts`, `test/handoff.test.ts`
   - model: sonnet (mechanical extension of the existing card renderer)
7. [x] feat(recap): handoff emits the whole CLI ending as one block,
   **done when:** `plumbbob handoff` computes the recap's `check` (from the last
   run), `seam` (the SEAM marker versus `git diff`), and `diff`
   (`git diff --numstat`) rows, parses the judgment rows (`done-when`,
   `decisions`, `constraints`) and the `## recommendation` section from
   `.plumbbob/detail.md`, and emits the assembled fence (the gate verdict in
   the check row, no standalone verdict line,
   [D21 (verdict-in-the-row)](#d21)), the inline diff fence when the change is
   20 lines or fewer, the card, and the recommendation last as one contiguous
   block ([D19 (cli-does-what-it-can)](#d19), [D20 (one-seam-turn)](#d20),
   [D23 (recommendation-last)](#d23)); every CLI-computed line fits the
   72-column budget ([D22 (recap-width-budget)](#d22)); unit tests cover each
   computed row, the assembled block, and the recommendation
   - seam: `src/lib/orient.ts`, `src/verbs/handoff.ts`, `src/verbs/check.ts`, `src/lib/git.ts`, `test/handoff.test.ts`
   - model: sonnet (git numstat and the seam diff are mechanical; the recap-assembly seam wants a careful read)
8. [x] docs(anatomy): make the whole turn the anatomy and nothing else,
   **done when:** `docs/presentation.md` and the build/verify skills spec the
   two-region turn: the model authors headline, highlights (a judgment flag is
   a highlight with its full story in a detail section, never a prose block),
   and the detail pointer as its final authored line, writes the recap's
   judgment rows (inside the 72-column budget,
   [D22 (recap-width-budget)](#d22)) and the `## recommendation` section into
   `.plumbbob/detail.md`, then relays `plumbbob handoff`'s block once, the card
   fenced and the recommendation as plain prose, and writes nothing after it;
   the spec drops the standalone verdict line
   ([D21 (verdict-in-the-row)](#d21)), re-homes the narrowed-gate clause and
   the Stop-hook relay in the check row, and ends every decision turn on the
   recommendation ([D23 (recommendation-last)](#d23)); meta-narration of the
   CLI-rendered parts and cross-part repetition are forbidden by the positional
   rule ([D18 (turn-is-the-anatomy)](#d18),
   [D19 (cli-does-what-it-can)](#d19), [D20 (one-seam-turn)](#d20))
   - seam: `docs/presentation.md`, `skills/build/SKILL.md`, `skills/verify/SKILL.md`
   - model: fable (holistic editorial judgment on the whole turn)
9. [ ] feat(handoff): label the recommendation and split the move from its
   reason, **done when:** `plumbbob handoff` emits the recommendation as
   `**Recommendation**: <move>. <Reason>.` (the label CLI-prepended,
   [D25 (labeled-recommendation)](#d25)), unit tests assert the label on the
   pause and plan-pause endings, and `docs/presentation.md` and the
   build/verify skills fix the move-then-reason shape in the template and the
   worked example
   - seam: `src/verbs/handoff.ts`, `src/verbs/__tests__/handoff.test.ts`, `docs/presentation.md`, `skills/build/SKILL.md`, `skills/verify/SKILL.md`
   - model: sonnet (a one-line prefix, two test assertions, and template wording)
10. [ ] docs(skills): relay every tier's ending from the plan and driver skills,
   **done when:** the plan skill relays the plan-pause card and the driver
   skills (park, spike, revert, recover, abandon) relay the driver next-up line
   from `plumbbob handoff` ([D17 (whole-anatomy-emitted)](#d17)), each ending
   sitting in its [D15 (three-tier-anatomy)](#d15) tier
   - seam: `skills/plan/SKILL.md`, `skills/park/SKILL.md`, `skills/spike/SKILL.md`, `skills/revert/SKILL.md`, `skills/recover/SKILL.md`, `skills/abandon/SKILL.md`
   - model: sonnet (mechanical wiring once step 6 emits the endings)
11. [ ] docs(happy-path): make every illustrated block producible,
   **done when:** each rendered block in `docs/happy-path.md` matches real CLI
   output or the skill's exact template
   - seam: `docs/happy-path.md`
   - model: sonnet (reconciliation against the shipped spec)
12. [ ] test(evals): run the eval tier against the new anatomy, **done when:**
   the c-series contracts read the new turn shapes, the driver runs green,
   and a fresh receipt lands in `docs/evals/`
   - seam: `test/evals/contracts/`, `test/evals/helpers/`, `docs/evals/`
   - model: opus (the contracts' assertions encode judgment about output shape)

## Open questions

- <a id="q1"></a>**Q1 (status-vocabulary)**: *resolved:* 2026-08-28, the plumb
  register ([D8 (plumb-when-natural)](#d8)); the words live in
  [D13 (circle-ladder)](#d13).
- <a id="q2"></a>**Q2 (glyph-ladder)**: *resolved:* 2026-08-28, circles with
  the plumb words ([D13 (circle-ladder)](#d13)); diamonds deleted for the
  tofu risk on `◈`.
- <a id="q3"></a>**Q3 (expansion-mechanism)**: *resolved:* 2026-08-28,
  numbered handles + one overwritten detail file, git as the archive
  ([D9 (latest-detail-file)](#d9)); no settings key.
- <a id="q4"></a>**Q4 (recap-ownership)**: *resolved:* 2026-08-28, split by
  nature ([D10 (recap-split-by-nature)](#d10)).
- <a id="q5"></a>**Q5 (banner-aggregation)**: *resolved:* 2026-08-28,
  computed worst-of, naming its worst component
  ([D11 (worst-of-banner)](#d11)).
- <a id="q6"></a>**Q6 (your-call-wording)**: *resolved:* 2026-08-28, the
  three-move block as leaned ([D12 (instructive-choice)](#d12)); exact
  strings land in the spec at step 1.
- <a id="q7"></a>**Q7 (banner-data-path)**: *resolved:* 2026-08-28, the recap
  is the wire ([D14 (recap-as-wire)](#d14)); measured beats attested.
- <a id="q8"></a>**Q8 (archive-into-commit)**: *resolved:* 2026-08-28,
  checkpoint folds the detail file into the commit body, then truncates
  ([D9 (latest-detail-file)](#d9)).
- <a id="q9"></a>**Q9 (anatomy-scope)**: *resolved:* 2026-08-28, three tiers
  ([D15 (three-tier-anatomy)](#d15)).
- <a id="q10"></a>**Q10 (diff-at-the-pause)**: *resolved:* 2026-08-28,
  diffstat row + detail plane, inline allowed at 20 lines or fewer
  ([D7 (code-on-request)](#d7)).
- <a id="q11"></a>**Q11 (expand-addressing)**: *resolved:* 2026-08-28, bare
  numbers bind to the latest card
  ([D16 (latest-card-addressing)](#d16)).

## Verdicts

- 2026-08-28: status vocabulary → chose the plumb register because it is the
  tool's own instrument and the voice doc's governing metaphor; deleted
  PM-standard and nautical.
- 2026-08-28: expansion mechanism → chose numbered handles + one overwritten
  detail file with git as the archive; deleted per-step detail piles and the
  settings knob.
- 2026-08-28: recap ownership → chose split-by-nature (CLI deterministic,
  model judgment in an exact fenced template); deleted CLI-skeleton-with-slots.
- 2026-08-28: banner feed → chose computed worst-of naming its worst
  component; deleted model-judged status.
- 2026-08-28: state table → chose circles (`● ◐ ○ ✗`) with the plumb words
  because the draining fill tells one story; deleted diamonds.
- 2026-08-28: your-call wording → chose the three-move quoted block; deleted
  the bare looks-good/needs-work pair.
- 2026-08-28: banner data path → chose recap-as-wire, measured beats
  attested; deleted machine-facts-only and flag-passing.
- 2026-08-28: detail archive → chose commit-body fold before truncate;
  deleted truncate-only.
- 2026-08-28: anatomy scope → chose three tiers; deleted one-size-fits-all.
- 2026-08-28: diff at the pause → chose diffstat + detail plane with a
  20-line inline exception; deleted always-inline.
- 2026-08-28: expand addressing → chose latest-card binding, step number or
  sha for older; deleted global numbering.
- 2026-08-28: evals → in scope as step 7; the build is not complete until the
  tier runs against the new anatomy.
- 2026-08-29: step-5 harvest → both parked items classed blocker; the whole
  anatomy ships in this build (the plan-pause card, the driver next-up, the
  trailing blank line), deleted defer-to-follow-up.
- 2026-08-29: holistic verbosity → the turn is the anatomy and nothing else
  ([D18 (turn-is-the-anatomy)](#d18)); deleted tone guidance in favor of
  structural rules.
- 2026-09-01: ownership limit → if the CLI can, the CLI does
  ([D19 (cli-does-what-it-can)](#d19)): check/seam/diff rows move to the CLI,
  the model keeps the three judgment rows; deleted the model-attested six-row
  recap.
- 2026-09-01: repetition → one seam per turn ([D20 (one-seam-turn)](#d20)):
  handoff emits the whole CLI ending as one contiguous block, the model relays
  once and writes nothing after; deleted the four-slot interleave and
  "don't repeat" prohibitions.
- 2026-09-01: step-6 harvest → all three parked items classed blocker (Rob's
  calls; his read: a pause that ends without a recommendation is a defect).
  The verdict line folds into the check row (D21 (verdict-in-the-row)), recap
  rows get a 72-column budget (D22 (recap-width-budget)), and a decision
  turn's last words are the model's recommendation, relayed unfenced
  (D23 (recommendation-last), amending D5 (verdict-last)); deleted
  defer-to-follow-up. Steps 7 and 8 absorb all three; no new steps.

- 2026-09-01: step-7 harvest → both parked items classed blocker, both already
  handled in flight at Rob's direction: checkride records narrowed-run skips
  and the check row names them (D24 (narrowing-named-not-shouted), amending
  D21 (verdict-in-the-row)); the doc sweep is absorbed by steps 8 and 10, and
  the AGENTS.md stanza refresh rides the checkride release. No new steps.
- 2026-09-01: step-8 boundary → Rob's call on the recommendation's shape: a
  bold `**Recommendation**:` label, the move as its own sentence, the reason
  capitalized after it (D25 (labeled-recommendation), amending
  D23 (recommendation-last)). Folded in as a new step 9; the plan grew to 12
  steps and the later steps shifted by one.

## Research digest

*Source: four research passes, 2026-08-28 (three web, one repo map). Compressed
here so this file stands alone.*

- Three mature systems (Primer CLI, rustc RFC 1644, Elm) converge on one
  stack: one strong header naming and locating each chunk; hierarchy from
  weight, whitespace, and glyph shape, never color alone; a closed symbol set
  of five or so; fixed positional grammar (context above, code middle, hint
  below, verdict last); aggressive elision with honest counts.
- Primer CLI: hierarchy comes from font weight and space only; bold yes,
  italic unused. Budget roughly one bold token per line or bold dies.
- rustc: severity register `error / note / help`; the error states what only,
  the help alone suggests the fix; identifiers always in backticks.
- clig.dev: brief on success; suggest the next command; the most important
  line goes last.
- NN/g progressive disclosure: two levels at most, and the expander must say
  what is behind it. systemctl pairs a taste of the detail with the pointer;
  terraform's summary line carries decision weight, so its counts must be
  honest.
- The Sims 4 plumbbob is a four-level worst-of indicator (green / yellow /
  orange / red, driven by the lowest need); Statuspage computes its top line
  the same way. Platinum is the canonical above-green state if one is ever
  wanted.
- Terminal reality: variation selectors are unreliable (a glyph can be one
  column in kitty and two in Windows Terminal); geometric shapes are
  East-Asian-ambiguous width; emoji-presentation codepoints cannot be
  de-colored. Glyph at line start followed by a space is the safe pattern.

The nine catalogued drifts (step 5's checklist):

1. The aligned verify pause block in `docs/happy-path.md:152-165` is
   illustration only: no skill mandates it, no verb emits it.
2. finish's `## Stats` and `## Checkpoints` sections are invisible to the
   finish skill's report spec.
3. Recap section names diverge across build/verify skills, happy-path, and
   the finish report.
4. Four names for one artifact: closing block, standardized hand-off block,
   its block, canonical three-part closing block.
5. `skills/build/SKILL.md:107,232` reference a "closing block below" that
   moved into the CLI at 0.8.5.
6. `plumbbob park`'s `parked: <text>` output has no relay line in the park
   skill.
7. The write-vs-relay em-dash boundary lives only in `docs/decisions.md`,
   not anywhere the model reads while working.
8. The status skill mandates verbatim relay, then asks for commentary.
9. The checkride Stop-hook verdict has no relay spec anywhere.
