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
  recap, the gate verdict verbatim on its own line, and the footer card last.
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
  [model] recap: labeled judgment rows        <- skill template, fenced
  [cli]   check verdict, verbatim, own line
  [cli]   footer card: banner (glyph + word + worst component + step N of M),
          next up (step + model), the your-call block

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

1. [ ] docs(presentation): author the turn anatomy spec, **done when:**
   `docs/presentation.md` defines the highlights, recap, verdict line, footer
   card (your-call wording per [D12 (instructive-choice)](#d12)), the state
   table ([D13 (circle-ladder)](#d13)), the tier map
   ([D15 (three-tier-anatomy)](#d15)), the glyph vocabulary, and the
   threshold rules (the 20-line diff exception among them), and `pnpm check`
   is green
   - seam: `docs/presentation.md`
   - model: fable (the design judgment of the whole build lives in this document)
2. [ ] feat(detail): the latest-step detail file and its lifecycle,
   **done when:** `.plumbbob/detail.md` is untracked, written before each
   pause, folded into the commit body and truncated by checkpoint per
   [D9 (latest-detail-file)](#d9), and unit tests cover the lifecycle
   - seam: `src/verbs/checkpoint.ts`, `src/verbs/start.ts`, `test/checkpoint.test.ts`
3. [ ] feat(handoff): render the orientation banner and footer card,
   **done when:** unit tests assert the exact card text; the banner folds the
   parsed recap rows ([D14 (recap-as-wire)](#d14)) worst-of with measured
   facts ([D11 (worst-of-banner)](#d11)); the your-call block reads per
   [D12 (instructive-choice)](#d12)
   - seam: `src/verbs/handoff.ts`, `src/lib/orient.ts`, `test/handoff.test.ts`
   - model: sonnet (mechanical once step 1 has fixed the strings)
4. [ ] feat(verify): emit the recap skeleton and gate verdict line,
   **done when:** the verify pause renders the recap template (diffstat row
   included per [D7 (code-on-request)](#d7)) with the check verdict verbatim
   on its own line
   - seam: `src/verbs/check.ts`, `skills/verify/SKILL.md`, `skills/build/SKILL.md`
5. [ ] docs(skills): align every skill output spec to the anatomy,
   **done when:** the nine catalogued drifts (digest below) are gone, the
   hand-off block carries one name everywhere, every skill's ending sits in
   its [D15 (three-tier-anatomy)](#d15) tier, and build/verify spec the
   detail-file write
   - seam: `skills/*/SKILL.md`, `docs/cli-reference.md`
   - model: opus (voice-governed prose across nine files)
6. [ ] docs(happy-path): make every illustrated block producible,
   **done when:** each rendered block in `docs/happy-path.md` matches real CLI
   output or the skill's exact template
   - seam: `docs/happy-path.md`
   - model: sonnet (reconciliation against the shipped spec)
7. [ ] test(evals): run the eval tier against the new anatomy, **done when:**
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
