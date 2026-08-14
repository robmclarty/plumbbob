<!--
intent.md: your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.

Size to the work: a small change fills Frame + a couple of Decisions and deletes
the rest; a medium feature fills it all. Opinionated where decided, explicit where
open. If the implementor (you-later, or the LLM) has to guess, the doc failed.

One rule runs through the whole doc: compress what's settled; expand what's pending.
Decisions and Constraints stay one line each; they re-inject into every build step,
so their tokens recur. Open questions expand into plain-then-lean prose; a human
reads them once, to decide, and that legibility buys back a chat round-trip.
-->

# the leftovers: mask-aware sweep sizing, the park-nudge eval, and abandon-step

**Phase** (your own bookkeeping while framing): frame
**Size:** medium
**Scope:** leftovers

*Source: the human's inline brief (2026-08-13), expanding three recorded deferrals: the em-dash sweep's `report.md` tangent ("size the next prose sweep with a mask-aware scan"), the eval tier's c5 measurement gap, and the recover commit's "Deliberately NOT built" paragraph (`2c0c0445c`).*

## Frame

*(You, on paper first. The problem in plain words, before any solution.)*

- **Problem:** Three leftovers, each with its own record, none blocking another.
  **(a) Sweep sizing lied in both directions.** The em-dash sweep's per-surface
  queues undercounted throughout: vale collapses multi-line paragraphs when
  positioning findings, so `docs/decisions.md`'s listed 85 was really 197 U+2014
  outside code spans, while raw grep overcounts by including the code spans and
  fences the rule correctly ignores (the intent's rough 1,200 was a raw count).
  Neither easy measure sizes a step honestly, and the next sweep will hit the same
  wall. A wrinkle the scout surfaced: `scripts/check-refs.ts` masks fenced and
  inline code only; `EmDash.yml`'s comment claims indented blocks are invisible to
  the citation scanner too, and today that claim is false.
  **(b) The park-nudge receipt is half of an experiment.** Correcting this build's
  own brief: the nudge HAS been measured once. `docs/evals/2026-07-27.md` shows c5
  latched 5/5 at plumbbob 0.9.0, nine days after the nudge shipped, with the
  attribution in that receipt's commit (`915e264`); the earlier 0/5s (07-11, 07-18)
  predate it. What has never run is the **baseline arm** (the sweep that strips
  `UserPromptSubmit`, and with it the nudge), so there is no A/B isolating the
  nudge's effect, and nothing at all has been measured at 0.10.0. The Cursor-port
  prerequisite wants the clean A/B.
  **(c) An in-flight step has two exits and both take the work with them.**
  Checkpoint lands it; revert destroys it (`git reset --hard` plus removal of
  untracked in-seam files). Dropping the attempt while keeping the working-tree
  diff was deliberately scoped out of `recover` (2026-08-06, recorded only in that
  commit's body: "a new loop transition rather than a repair of inconsistent
  state... earns its own design pass"). This build is that design pass.
- **Smallest thing that solves it:** (a) one shared masking module in `scripts/`
  (fenced, inline, indented) feeding both `check-refs.ts` and a new counter script
  that prints per-file pattern counts over what remains; (b) one two-arm c5 sweep
  at 0.10.0 landed as a derived receipt in `docs/evals/`; (c) one `plumbbob
  abandon` verb that clears the in-flight markers, logs the event, and touches
  nothing else, plus its driver skill and docs.
- **Done looks like:** the counter's fixture test pins fenced, inline, indented,
  and multi-line cases, and a run against the sweep baseline's `docs/decisions.md`
  reproduces the 197 (or documents the small delta indented-block masking
  legitimately introduces); `docs/evals/2026-08-13.md` is committed with c5
  baseline and latched rows at n=5, stamped 0.10.0; `plumbbob abandon` ships with
  the latch seam pinned by test and every contract suite green; `pnpm check` green
  at every checkpoint.
- **Explicitly NOT doing:** the Cursor second-host work (deferred 2026-08-13). Any
  version bump or CHANGELOG entry (0.10.0 just shipped; Rob cuts releases with
  `/version`). New eval machinery: item (b) may reword one string in
  `src/verbs/turn.ts` and nothing else. Teaching `revert` to write a log line
  (parked; abandon establishes the pattern first). Counting inside `.ts` comments
  (vale's job, not a sizing script's). Editing existing receipts or build records.

## Architecture sketch

```
(a) sizing                    (b) the missing arm            (c) the third exit
scripts/prose-mask.ts          pnpm build                     build -> STEP in flight
  |- check-refs.ts (refs slot)  run.ts --contract c5            |- checkpoint  land it
  |- count-prose.ts (new)         --sweep baseline | latched    |- revert      destroy it
mask fences + inline + indented   --report                      |- abandon     NEW: clear
then count per file in the rest    -> docs/evals/2026-08-13.md     STEP/SEAM/TICK/handoff,
                                                                   log it, tree untouched
```

## Decisions

*(One line each: settled, not re-litigated in the chat. Grows as you resolve the
holes `/plumbbob:refine` surfaces, and as blockers fold in during BUILD.)*

- <a id="d1"></a>**D1 (one-build-batch)**: all three leftovers ride this one build as three step clusters, *because* each is one or two steps, none blocks another, and the em-dash build set the batching precedent; if abandon's open questions balloon it, that cluster forks to its own build rather than growing this one.
- <a id="d2"></a>**D2 (shared-mask)**: the counter and `check-refs.ts` share one masking module in `scripts/` covering fenced blocks, inline code, and indented blocks, *because* two divergent masks recreate the exact miscount this build exists to close, and `EmDash.yml` already promises indented blocks are invisible to the citation scanner while today's scanner masks none.
- <a id="d3"></a>**D3 (markdown-first)**: the counter reads markdown files only, *because* the undercount bit on markdown (85 versus 197) and mapping `.ts` comments to prose is vale's job; a sizing script that half-reimplements it would lie a third way.
- <a id="d4"></a>**D4 (derived-receipt)**: the c5 receipt is generated by the driver's `--report`, never hand-authored, *because* a receipt is an instrument reading; the 2026-08-07 precedent keeps even invalid runs on it, and hand edits would make it a claim instead.
- <a id="d5"></a>**D5 (abandon-verb)**: the capability lands as a standalone verb, not a `recover` repair and not a `revert` flag, *because* recover's own header bars loop transitions ("a recovery verb that could land a step would be a second, quieter checkpoint"), revert is the reset-hard path by rule, and the scoping-out commit named this "a new loop transition [that] earns its own design pass".
- <a id="d6"></a>**D6 (tree-untouched)**: abandon never touches the working tree or git (no reset, no removal of work files, no commit), *because* keeping the work is its entire contract; its only writes are the marker clears and the build-log line.
- <a id="d7"></a>**D7 (stays-planned)**: an abandoned step keeps its `[ ]` checkbox and its place in the plan, *because* abandon drops the attempt, not the intention; the log line records the attempt, and removing a step the human no longer wants is `/plumbbob:step`'s job. Resolved from [Q1 (stays-planned)](#q1), 2026-08-13.
- <a id="d8"></a>**D8 (abandon-log-line)**: abandon appends a build-log line via a new `buildlog.ts` sibling to `checkpointLogLine` (`` - <date> — step <n> abandoned · work kept in tree — <title> ``), *because* the log is the build's narrative and a silently cleared marker is a hole in it; no reason flag in v1, since a why worth keeping is a park line. Resolved from [Q2 (log-line)](#q2), 2026-08-13.
- <a id="d9"></a>**D9 (abandon-latched)**: abandon runs the same latch check as checkpoint, *because* a step exit is a boundary crossing and the human is the clock; the composed case (abandon, then same-turn checkpoint) must still refuse, pinned by test under [C4 (latch-holds)](#c4). Resolved from [Q3 (abandon-latch)](#q3), 2026-08-13.
- <a id="d10"></a>**D10 (both-arms)**: the c5 sweep runs baseline and latched arms at n=5 each, *because* the baseline arm is the never-run control that isolates the nudge, and the latched arm is the regression check two releases after the 0.9.0 receipt. Resolved from [Q4 (c5-scope)](#q4), 2026-08-13.
- <a id="d11"></a>**D11 (third-exit-teaching)**: every site that enumerates the exits from an in-flight step learns the third one, found by grep rather than memory (the recover hint string rides step 7; troubleshooting, cli-reference, and the revert and recover skills ride step 8), *because* a shipped third exit under guidance that still teaches two makes the most-read prose lie, and the skills-contract regexes must stay green through the edits. Resolved from [Q6 (third-exit-teaching)](#q6), 2026-08-13.
- <a id="d12"></a>**D12 (reword-ledger)**: if step 6 fires, the superseded latched ledger archives to `.jsonl.bak` before the re-sweep and the receipt regenerates, baseline runs untouched, *because* a reworded nudge is a different instrument and a receipt column reads one instrument (the 2026-08-07 archive precedent), while the baseline arm never saw the nudge. Resolved from [Q7 (reword-ledger)](#q7), 2026-08-13.
- <a id="d13"></a>**D13 (nudge-stays)**: if the no-nudge baseline also reads 5/5, the receipt records it and the nudge stays, *because* a one-line always-on guard that measures redundant today is cheap insurance against the next model or CLI change; arguing its removal is its own build. Resolved from [Q8 (baseline-passes)](#q8), 2026-08-13.
- <a id="d14"></a>**D14 (commonmark-parity)**: the mask's contract is CommonMark, vale's own scope, never guessed human intent: a four-plus-space run masks only after a blank line (the spec's rule; indented code cannot interrupt a paragraph), sub-four-space indents count as the paragraphs they are, a leading tab measures four columns, and untracked list content indent is the one approximation, made auditable by `--show-masked`, *because* the counter exists to predict what `Repo.EmDash` will flag, and parity with the rule's parser is the only definition of an honest count that cannot drift. Resolved from [Q5 (indented-vs-lists)](#q5), 2026-08-13.
- <a id="d15"></a>**D15 (wrapped-code-spans)**: the shared mask matches an inline code span that wraps a line break, *because* CommonMark closes a code span at the next matching backtick run regardless of newlines, and a mask that stops at the line end over-counts exactly what vale correctly ignores (live today in `skills/verify/SKILL.md`), reopening on the citation scanner's surface and the counter's alike the fidelity gap this build exists to close. Harvested as a blocker from step 2's park list, 2026-08-14.
- <a id="d16"></a>**D16 (scripts-in-refs-scan)**: `scripts/**/*.ts` joins the citation scanner's `src` surface, *because* the exclusion was hiding ten real violations across the three scripts this build touched, and a scanner blind to a whole prose surface overstates its coverage by exactly that much, the same way the unlinted `skills/` walk did before the em-dash build pulled it in. Harvested as a blocker from step 2's park list, 2026-08-14.
- <a id="d17"></a>**D17 (global-tags-only-in-code)**: a `D#`/`C#` tag printed in shipped code under `src/` or `scripts/` cites [docs/decisions.md](../../../docs/decisions.md) only, and a build-local decision is named in words until a step promotes it to the key, *because* build-local numbering collides with the global key ([D14 (commonmark-parity)](#d14) here resolves to the unrelated global [D14 (throwaway-repo-tests)](../../../docs/decisions.md#d14)), and step 7 would otherwise redden the refs slot citing [D6 (tree-untouched)](#d6) through [D9 (abandon-latched)](#d9) in `src/verbs/abandon.ts` before step 8 promotes that rationale. Harvested as a blocker from step 2's park list, 2026-08-14.

## Constraints

*(Hard rules the build must honor. `/plumbbob:verify` and `/plumbbob:refine` read against these.)*

- <a id="c1"></a>**C1 (no-new-deps)**: stdlib only; the counter and the verb add no packages.
- <a id="c2"></a>**C2 (no-release)**: no version bump, no CHANGELOG entry; the human cuts releases with `/version`.
- <a id="c3"></a>**C3 (wording-only)**: item (b)'s only permitted source change is the nudge string in `src/verbs/turn.ts` and its test's substrings; harness, driver, and contract code stay untouched.
- <a id="c4"></a>**C4 (latch-holds)**: nothing here weakens [D64 (approval-latch)](../../../docs/decisions.md#d64) or [D67 (auto-not-a-grant)](../../../docs/decisions.md#d67); after an abandon, a same-turn checkpoint still refuses, pinned by test.
- <a id="c5"></a>**C5 (records-stay)**: existing receipts, ledgers, and build records are never edited; a new sweep adds a new dated receipt ([C4 (never-destroy)](../../../docs/decisions.md#c4) at the repo level).

## Steps

*(The build plan. Drive `/plumbbob:build` until done.)*

1. [x] chore(refs): share the masking spans and mask indented blocks, **done when:** the span collection lives in a `scripts/` module both consumers import; indented blocks join fenced and inline in the mask ([D2 (shared-mask)](#d2)) under [D14 (commonmark-parity)](#d14); `check-refs.ts` keeps its refs-specific definition-line exclusion on top; the existing `check-refs` integration tests stay green and new cases cover an indented block; refs slot green
   - seam: `scripts/prose-mask.ts`, `scripts/check-refs.ts`, `test/integration/check-refs.test.ts`
   - model: sonnet (mechanical extraction behind existing tests)
2. [x] feat(prose): add a mask-aware counter that sizes a prose sweep, **done when:** `node scripts/count-prose.ts [--pattern <re>] [path ...]` prints per-file counts and a total over masked markdown (pattern defaults to U+2014; paths default to the prose slot's walk list); the mask follows [D14 (commonmark-parity)](#d14) and a fixture test pins fenced, inline, indented, two- and three-space-continuation, and multi-line-paragraph cases; `--show-masked` prints every masked indented span; run at build time against the em-dash sweep's recorded baseline (`git show <baseline>:docs/decisions.md`) it reproduces 197 or the verified delta from indented masking; `pnpm check` green
   - seam: `scripts/count-prose.ts`, `test/integration/count-prose.test.ts`, `package.json`
   - model: sonnet (small tool, fully specified by the fixture and the recorded method)
   - notes: exit 0 always; it is a meter, not a gate. Wire a `size:prose` package script beside the `eval:*` entries so the dead slot sees a consumer and the tool stays discoverable.
3. [x] fix(refs): mask an inline code span that wraps a line break, **done when:** `collectMaskSpans` masks a code span whose opening and closing backticks sit on different lines, stopping at a blank line (a code span cannot cross a paragraph break) under [D15 (wrapped-code-spans)](#d15) and [D14 (commonmark-parity)](#d14); fixture tests pin the wrapped span and the blank-line stop on both consumers' surfaces; `node scripts/count-prose.ts skills/verify/SKILL.md` reports 0 where it reports 1 today, and no other file in the default walk changes count; `pnpm check` green
   - seam: `scripts/prose-mask.ts`, `test/integration/count-prose.test.ts`, `test/integration/check-refs.test.ts`
   - model: sonnet (one regex and its fixtures; blast radius measured at one file)
4. [ ] fix(refs): scan scripts/ and cite only global decisions there, **done when:** `check-refs.ts`'s walker yields `scripts/**/*.ts` beside `src/**/*.ts` ([D16 (scripts-in-refs-scan)](#d16)); the twelve violations the widened surface finds today are fixed at the source, the ten build-local tags (`D2` ×4, `D14` ×3, `D15` ×2, `D3` ×1) named in words under [D17 (global-tags-only-in-code)](#d17) and the two `D74` citations whose gloss wraps onto the next comment line reflowed so tag and gloss share a line; a `scanRepo` test pins that a `scripts/` file is walked; refs slot green; `pnpm check` green
   - seam: `scripts/check-refs.ts`, `scripts/prose-mask.ts`, `scripts/count-prose.ts`, `test/integration/check-refs.test.ts`
   - model: sonnet (mechanical, and the scanner itself verifies the result)
5. [ ] chore(evals): re-measure c5 both arms at 0.10.0, land the receipt, **done when:** `docs/evals/2026-08-13.md` is committed carrying c5 baseline and latched rows at n=5 ([D10 (both-arms)](#d10)), stamped plumbbob 0.10.0, generated by `--report` ([D4 (derived-receipt)](#d4)); the JSONL ledgers stay local in `reports/evals/`
   - seam: `docs/evals/2026-08-13.md`
   - model: opus (careful harness driving through recorded gotchas)
   - notes: `pnpm build` first (the warmup version guard compares against package.json, now 0.10.0). Run with the tree to yourself: a concurrent `pnpm check` or stryker transiently removes `dist/cli.js` and voids runs. Sweep before mid-afternoon PT: `today()` is UTC and a straddled sweep splits its ledger. The transient CLI-crash class lands as terminal `invalid` and stays on the receipt; a rerun the same day accumulates honestly into the same table. Cost at the 07-27 rate (about $0.65 a run): roughly $7 for both arms.
6. [ ] fix(turn): reword the park nudge and re-measure the latched arm, **done when:** the nudge line in `src/verbs/turn.ts` is reworded within [C3 (wording-only)](#c3), `turn.test.ts`'s substring assertions updated with it, a fresh latched arm reads 4/5 or better, and the same-day receipt regenerated
   - seam: `src/verbs/turn.ts`, `src/verbs/__tests__/turn.test.ts`, `docs/evals/2026-08-13.md`
   - model: fable (one load-bearing line of prose)
   - notes: conditional. Enters only if step 5's latched arm reads 3/5 or worse (4/5 at n=5 is judgment-call noise; discuss at the boundary). If step 5 holds, strike this step with `/plumbbob:step`. If it fires, the superseded latched ledger archives to `.jsonl.bak` before the re-sweep ([D12 (reword-ledger)](#d12)).
7. [ ] feat(abandon): drop an in-flight step and keep the work, **done when:** `plumbbob abandon` clears `STEP`, `SEAM`, `TICK`, and `handoff.json`, appends the abandon line to the build log ([D8 (abandon-log-line)](#d8)), records it in `stats.json`, and touches neither the working tree nor the intent checkbox ([D6 (tree-untouched)](#d6), [D7 (stays-planned)](#d7)); it honors the latch ([D9 (abandon-latched)](#d9)) and a unit test pins that a same-turn checkpoint after an abandon still refuses ([C4 (latch-holds)](#c4)); the cli-docs contract is green (reference row and section, `site/api.html` verbDef); `pnpm check` green
   - seam: `src/verbs/abandon.ts`, `src/cli-core.ts`, `src/lib/sidecar.ts`, `src/lib/buildlog.ts`, `src/verbs/recover.ts`, `src/verbs/__tests__/abandon.test.ts`, `docs/cli-reference.md`, `site/api.html`
   - model: opus (strong-assertion tests across the latch seam)
   - notes: marker clearing goes through new sidecar helpers (`clearStep`/`clearSeam` do not exist yet) rather than widening `rules/centralize-destructive-fs.yml`; never import `resetHard` (`rules/reset-hard-only-in-revert.yml`). Mirror revert's surface: accept `--build <slug>`, refuse with no session and with no step in flight, and leave a spike-plus-step inconsistency to `recover`. The recover hint that names revert as the only way to drop a step gains abandon here ([D11 (third-exit-teaching)](#d11)).
8. [ ] docs(abandon): add the driver skill and record the decision, **done when:** `skills/abandon/SKILL.md` passes the driver-skill contract (added to the `DRIVER_VERB` map; quoted description, `disable-model-invocation`, haiku, verbatim/never-retry body); `docs/skills-reference.md`, `docs/state-and-git.md`, `docs/troubleshooting.md`, and the revert and recover skills teach the third exit, with no two-exit phrasing surviving a repo-wide search ([D11 (third-exit-teaching)](#d11)); every hardcoded skill count moves thirteen to fourteen (five README sites plus the three `site/` pages, each verified for what it actually counts); `docs/decisions.md` carries the next free number, D79 (abandon-keeps-work), promoting the recover commit's scoping-out rationale into the key; refs, links, and prose slots green; `pnpm check` green
   - seam: `skills/abandon/SKILL.md`, `test/contract/skills.test.ts`, `docs/skills-reference.md`, `docs/state-and-git.md`, `docs/troubleshooting.md`, `docs/cli-reference.md`, `skills/revert/SKILL.md`, `skills/recover/SKILL.md`, `README.md`, `site/index.html`, `site/api.html`, `site/docs.html`, `docs/decisions.md`
   - model: fable (the most-read prose and a decisions entry)

## Open questions

*(Holes you could NOT resolve on paper: the one section that expands rather than
compresses. Do not guess them into Decisions; a genuine fork goes to a SPIKE, with
the verdict recorded below and in Decisions.)*

- <a id="q1"></a>**Q1 (stays-planned)**: *resolved:* 2026-08-13, the step keeps its `[ ]` and the plan is untouched; became [D7 (stays-planned)](#d7)
  - *plain:* Only checkpoint flips a checkbox today, so the abandoned step would naturally read as planned-and-undone, re-buildable later. The alternative is abandon editing the plan (striking or annotating the step). Getting it wrong either leaves a plan that lies about intent, or hands a bookkeeping verb editorial power over the human's plan.
  - *lean:* it stays `[ ]`, untouched. Abandon drops the attempt, not the intention; the build-log line records that an attempt happened, and removing a step the human no longer wants is `/plumbbob:step`'s job, not abandon's.
- <a id="q2"></a>**Q2 (log-line)**: *resolved:* 2026-08-13, a new log line records the abandon; became [D8 (abandon-log-line)](#d8)
  - *plain:* Revert writes no `## Log` line; markers clear silently and only stats.json remembers. An abandon that vanishes the same way leaves the log claiming a step was in flight and then saying nothing at all, which is a hole in the narrative the log exists to keep. Whatever shape lands here becomes the pattern revert could adopt later.
  - *lean:* a new sibling to `checkpointLogLine` in `src/lib/buildlog.ts`, the first non-checkpoint log event: `` - <date> — step <n> abandoned · work kept in tree — <title> ``. No reason flag in v1; a why worth keeping is a park line.
- <a id="q3"></a>**Q3 (abandon-latch)**: *resolved:* 2026-08-13, abandon honors the same latch as checkpoint; became [D9 (abandon-latched)](#d9)
  - *plain:* Abandon clears `TICK`, the latch's input. If a checkpoint at the boundary with no `TICK` does not refuse, then abandon followed by checkpoint becomes an unlatched land: the same genus of side door [D67 (auto-not-a-grant)](../../../docs/decisions.md#d67) closed for settings-auto. The cheap fix is gating abandon like checkpoint; the expensive mistake is discovering the bypass in an eval later.
  - *lean:* abandon runs the same latch check as checkpoint, *because* a step exit is a boundary crossing and the human is the clock; and step 7 pins the composed case ("abandon, then same-turn checkpoint still refuses") by test regardless of which way this resolves.
- <a id="q4"></a>**Q4 (c5-scope)**: *resolved:* 2026-08-13, both arms at 0.10.0; became [D10 (both-arms)](#d10)
  - *plain:* The brief said the nudge was never measured; the tracked receipt says otherwise, and the memory that fed the brief has been corrected. What is genuinely missing is the baseline arm (nudge stripped, isolating its effect; c5 is prose-governed by design, [D10 (pause-not-lock)](../../../docs/decisions.md#d10)/[D13 (no-edit-guards)](../../../docs/decisions.md#d13), so the latch does not reach it) and any measurement at 0.10.0, two releases later. The options: run both arms (about $7), run latched-only as a regression check, or accept the 0.9.0 receipt as the Cursor-port prerequisite and drop the item.
  - *lean:* run both arms at 0.10.0 (steps 5 and 6 are authored to this). Baseline isolates the nudge, latched confirms no regression, and the pair is the citable A/B the Cursor port wants.
- <a id="q5"></a>**Q5 (indented-vs-lists)**: *resolved:* 2026-08-13, the mask's contract is CommonMark parity; became [D14 (commonmark-parity)](#d14)
  - *plain:* CommonMark's "four spaces is code" only holds outside list context, and the surfaces this counter exists for are bullet-heavy: `docs/decisions.md` is one long list, and every intent carries nested sub-lines. A naive four-space rule would mask ordinary nested prose and undercount again, the same failure this build exists to close, just in the opposite direction. Vale avoids this by parsing markdown; a regex span collector cannot, cheaply. In this repo's house style, continuations indent two spaces, so genuine four-space runs are nearly always real code examples.
  - *lean:* name the mask's contract precisely and most of the precision falls out of the spec: the mask matches CommonMark (vale's own scope), not guessed human intent. Under that contract the hard cases resolve exactly. A four-plus-space run with no preceding blank line is paragraph continuation, counted: that is CommonMark's own rule (an indented code block cannot interrupt a paragraph), not a shortcut. Two- or three-space "code-looking" indents are paragraphs to CommonMark, so vale flags their em-dashes and the counter must count them; the queue has to include whatever the rule will surface. Eight-space runs fall inside the four-or-more rule, and a leading tab measures as four columns. The one true approximation left is list context (a blank-line-preceded four-space run nested deep in a list would false-mask); house style never nests that deep, the fixture pins two- and three-space continuations as counted, and a `--show-masked` flag prints every masked indented span so a sizing run can be eyeballed instead of trusted blind.
- <a id="q6"></a>**Q6 (third-exit-teaching)**: *resolved:* 2026-08-13, the teaching sweep widens steps 7 and 8; became [D11 (third-exit-teaching)](#d11)
  - *plain:* The two-exit world is written down beyond step 8's seam: the recover hint string in `src/verbs/recover.ts` ("or plumbbob revert to drop the step"), `docs/troubleshooting.md` ("discarding a half-done step is still `/plumbbob:revert`"), the revert and recover sections of `docs/cli-reference.md`, and plausibly `skills/revert/SKILL.md` and `skills/recover/SKILL.md`. A third exit that ships while the most-read guidance keeps teaching two makes that guidance lie, and the skills contract pins some recover phrasing, so edits there must keep its regexes green.
  - *lean:* widen the plan rather than trust the seam: the recover hint string rides step 7 (it is verb code); step 8 gains a grep-driven sweep of every site that enumerates the exits from an in-flight step (`docs/troubleshooting.md`, `docs/cli-reference.md`, `skills/revert/SKILL.md`, `skills/recover/SKILL.md`, `docs/state-and-git.md`), with the skills-contract regexes kept green.
- <a id="q7"></a>**Q7 (reword-ledger)**: *resolved:* 2026-08-13, a superseded latched ledger archives to `.jsonl.bak`; became [D12 (reword-ledger)](#d12)
  - *plain:* `--report` renders a UTC-day's whole ledger, so a same-day re-sweep after rewording blends two instruments (old and new wording) into one latched column. The 2026-08-07 precedent cuts cleanly both ways: runs measured by a changed instrument were archived to `.jsonl.bak` (a different instrument is a different receipt), while infra-invalid runs measured by the current instrument stayed. [C5 (records-stay)](#c5) forbids editing ledgers; the archive-rename before the receipt is committed is the recorded exception shape.
  - *lean:* if step 6 fires, archive the superseded latched ledger to `.jsonl.bak` before the re-sweep and regenerate; the baseline runs stay untouched (the nudge never reached that arm, so rewording does not change its instrument).
- <a id="q8"></a>**Q8 (baseline-passes)**: *resolved:* 2026-08-13, record it and keep the nudge; became [D13 (nudge-stays)](#d13)

## Verdicts

*(Filled in as spikes and forks resolve: the audit trail of "these were my calls.")*

- (none yet)
