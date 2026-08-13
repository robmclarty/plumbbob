<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.

Size to the work: a small change fills Frame + a couple of Decisions and deletes
the rest; a medium feature fills it all. Opinionated where decided, explicit where
open. If the implementor (you-later, or the LLM) has to guess, the doc failed.

One rule runs through the whole doc: compress what's settled; expand what's pending.
Decisions and Constraints stay one line each — they re-inject into every build step,
so their tokens recur. Open questions expand into plain-then-lean prose — a human
reads them once, to decide, and that legibility buys back a chat round-trip.
-->

# the em-dash sweep and the skills prose walk

**Phase** (your own bookkeeping while framing): frame
**Size:** medium
**Scope:** prose

*Source: the deferred tangents of `.plumbbob/builds/2026-07-31-glossed-decision-links-and-the-checkride-0-10-fast-gate/report.md`, and that build's Q10 (em-dash-rule-scope), whose recorded lean was "defer to its own build". This is that build.*

## Frame

*(You, on paper first. The problem in plain words — before any solution.)*

- **Problem:** Three debts the citations build named and deliberately left, all on the
  prose plane.
  **(a) The em-dash ban has no teeth.** The voice (`docs/voice/voice.md`) bans the
  em-dash in prose; the repo carries roughly 1,200 of them in gate-visible surfaces.
  Measured 2026-08-12 by raw grep, before the rule existed, so these count every mark
  including the ones inside code spans that the rule correctly ignores; step 4's own
  measured queue is the one the steps are sized against, and it sits in the sketch
  below. 932 across the markdown the vale walk covers (199 in `docs/decisions.md`
  alone, 197 in the reference docs, 225 in the guide docs, 195 in
  README/CONTRIBUTING/SECURITY/`docs/agents.md`, 65 in the two hand-written essays, 51
  in `templates/`), 267 in `skills/`, and a comment-share of the 999 raw hits in `src/`
  plus 9 in `scripts/` that only the rule itself can size. Until a rule exists, every
  writing session can reintroduce them faster than any sweep removes them.
  **(b) `skills/` is unlinted.** Vale parses SKILL.md frontmatter as YAML; one unquoted
  `: ` in a description raises E201, and E201 aborts the entire run rather than skipping
  the file. So the most-read prose in the repo sits outside the walk, and "prose is
  green" overstates its coverage by exactly that much.
  **(c) The harvest skill teaches a stale form.** `skills/harvest/SKILL.md` still shows
  a blocker folding into intent as `D5 (retry-cap): <the call>` with no anchor; every
  other intent-writing skill teaches the anchored, slugged form. The escalation the last
  harvest recorded: the links slot scans `.plumbbob/builds/*/intent.md`, so a blocker
  folded in the stale form can leave a dangling reference and redden that build's gate.
- **Smallest thing that solves it:** Quote all 13 frontmatter descriptions; add `skills`
  to the prose slot's path list; one house vale rule (`Repo.EmDash`) that lands at
  `warning` and flips to `error` only after the sweep; per-surface sweep steps under the
  voice's own four-way mapping (brackets for an aside; semicolon when both halves stand
  alone; colon when the second half names the first; comma before a coordinating
  conjunction); one corrected passage in the harvest skill.
- **Done looks like:** `pnpm check` green with `Repo.EmDash` at `error` across the whole
  walk, `skills/` included; zero entries in `checkride.baseline.json`; the only em-dashes
  left in covered prose sit inside code spans, fences, or a deliberately exempted record
  or hand-written file; `docs/decisions.md` records the rule as the next free number.
- **Explicitly NOT doing:** Runtime strings the CLI prints keep their em-dashes (vale
  cannot see a string literal, and terminal output is not the prose plane the voice
  governs; most of the 999 raw `src/` hits are strings and test titles). `AGENTS.md` and
  `CLAUDE.md` are not swept (the stanza is checkride-generated; its register is
  checkride's). `CHANGELOG.md`, `.plumbbob/builds/*`, and `examples/` stay out of the
  walk as the records and demo content they are. No version bump, no CHANGELOG entry
  (Rob cuts releases with `/version`). The Q6 packed-install manifest re-check stays
  parked for release time.

## Architecture sketch

```
THE RULE — one severity ladder, wired last

  .vale/styles/Repo/EmDash.yml     flags U+2014 in prose scope
      step 4:  level: warning   →  visible on every run, fails nothing
      step 15: level: error     →  the ban is live, gate and fast profile alike
  (only error-severity alerts fail the check — .vale.ini's own contract)

THE SURFACES — swept in review-sized steps, walk extended first

  skills/ frontmatter quoted (2) → skills/ joins the walk (3) → rule lands (4)
      ↓
  decisions.md 85 · guides 133 · reference 106 · front door 114
  templates 20 · skills 147 · src+scripts comments 543, split three ways
      ↓
  records exempted (evals); hand-written essays: Rob's pen or a per-file
  exemption — never a model pass
      ↓
  rule → error, decisions.md records it (15)
```

## Decisions

*(One line each — settled, not re-litigated in the chat. Grows as you resolve the
holes `/plumbbob:refine` surfaces, and as blockers fold in during BUILD.)*

- <a id="d1"></a>**D1 (warning-then-error)**: the rule lands at `warning` severity in step 4 and flips to `error` only in the final step, *because* only error-severity alerts fail the check (.vale.ini's stated contract), so the queue stays visible on every run while the sweeps burn it down, and a rule that failed mid-sweep would refuse the very checkpoints that clean it up.
- <a id="d2"></a>**D2 (em-dash-only)**: the rule flags U+2014 alone, *because* the voice bans the em-dash specifically; the en-dash in a range (`steps 1–3`) and the hyphen are different marks doing different jobs, and a rule that over-matches teaches people to ignore it.
- <a id="d3"></a>**D3 (quote-all-thirteen)**: every SKILL.md description is quoted, not only the ones that currently break, *because* an invariant held by accident is the failure shape [D77 (placeholder-uncounted)](../../../docs/decisions.md#d77) just closed elsewhere; uniform quoting makes the next description safe by rule, not by luck.
- <a id="d4"></a>**D4 (sweep-by-surface)**: the sweep lands as per-surface steps of roughly 150–250 sites each, *because* a single 1,200-site diff cannot be reviewed in one pass, and the checkpoint is the unit of review ([D64 (approval-latch)](../../../docs/decisions.md#d64) makes each pause real).
- <a id="d5"></a>**D5 (skills-walk-first)**: `skills/` joins the vale walk before the em-dash rule exists, *because* the rule should meet its whole surface once; a surface that grows mid-sweep re-opens steps that already closed.
- <a id="d6"></a>**D6 (exemption-over-forgery)**: a hand-written file Rob declines to sweep gets a per-file `Repo.EmDash = NO` stanza in `.vale.ini` with a one-line why, never a model re-punctuation, *because* a model pass over a hand-written anchor text is the exact copy-of-a-copy failure `docs/generation-loss.md` documents, and an exemption is honest about who owns the prose.
- <a id="d7"></a>**D7 (model-holds-the-pen)**: the model applies the voice's four-way mapping file by file, every hunk read by the human at the step's pause; a site the mapping cannot settle without rewording is flagged, never reworded, and the two hand-written essays are excluded outright, *because* the mapping is the voice's own written rule (a punctuation transform, not a tone pass), and the review-sized checkpoint ([D4 (sweep-by-surface)](#d4)) is the human pass that keeps it honest. Resolved from [Q1 (who-holds-the-pen)](#q1), 2026-08-12.
- <a id="d8"></a>**D8 (comma-and-colon)**: the decision line ends `, *because* <why>` and a definition header reads `**DNN (slug): Title.**`, *because* vale's RE2 has no lookaround, so an exempted marker is regex contortion or permanent under-coverage, and both replacements are punctuation the voice already prescribes; the refs scanner is indifferent ([C4 (scanner-stays-green)](#c4)). Resolved from [Q2 (format-markers)](#q2), 2026-08-12; this intent's own decisions wear the comma form from birth.
- <a id="d9"></a>**D9 (receipts-are-records)**: `docs/evals/*` is exempted from `Repo.EmDash` with its own stanza in `.vale.ini`, never swept, *because* an eval receipt is a dated measurement written once, the same genus as the `CHANGELOG.md` and `.plumbbob/builds/*` this build already holds out, and re-punctuating one edits the record after the fact ([C3 (records-stay)](#c3)). Folded in from the step 4 park list, 2026-08-11.

## Constraints

*(Hard rules the build must honor. `/plumbbob:verify` and `/plumbbob:refine` read against these.)*

- <a id="c1"></a>**C1 (no-baseline)**: nothing is written to `checkride.baseline.json`; every finding is fixed, or its file is deliberately exempted under [D6 (exemption-over-forgery)](#d6). The posture the citations build set (its D18) continues.
- <a id="c2"></a>**C2 (voice-stays-shut)**: `docs/voice/` keeps its empty `BasedOnStyles =` carve-out and is never model-edited; if a format decision makes its provisional `— *because*` parenthetical stale, the move is to flag it for Rob's pen, not to touch it.
- <a id="c3"></a>**C3 (records-stay)**: `CHANGELOG.md`, historical `.plumbbob/builds/*`, and the checkride-generated stanza wording in `AGENTS.md` are not swept; no version bump ([C4 (never-destroy)](../../../docs/decisions.md#c4) for the records, the human's `/version` for the release).
- <a id="c4"></a>**C4 (scanner-stays-green)**: every format change in `docs/decisions.md` keeps the refs scanner and the links slot green; the scanner's DEFINITION_RE reads anchor + tag + slug only (verified against `scripts/check-refs.ts`), so the header separator may change but the `<a id>`/tag/slug shape may not.

## Steps

*(The build plan. Drive `/plumbbob:build` until done.)*

1. [x] docs(skills): teach the harvest skill the anchored decision form — **done when:** the fold-a-blocker passage in `skills/harvest/SKILL.md` shows the anchored, slugged form a Decision is born in, matching what the plan and refine skills teach, with no pre-anchor example left; `pnpm check` green
   - seam: `skills/harvest/SKILL.md`
   - model: sonnet — a one-passage port from the sibling skills
2. [x] fix(skills): quote every SKILL.md frontmatter description — **done when:** all 13 descriptions are YAML-quoted (the 11 bare ones join `verify` and `plan`, already quoted), a vale run over `skills/` parses every file with no E201 abort, and the skills contract suite stays green
   - seam: `skills/`, `test/contract/skills.test.ts` (read; likely untouched)
   - model: sonnet — mechanical quoting behind an existing contract test
3. [x] chore(gate): walk skills/ in the prose slot and burn down the findings — **done when:** `skills` is in the prose slot's path list, the config note no longer calls `skills/` the one left-out path, the shipped rules' findings over `skills/` are fixed under [D7 (model-holds-the-pen)](#d7) with nothing baselined, and `pnpm check` is green
   - seam: `checkride.config.json`, `skills/`, `AGENTS.md`
   - model: fable — the fixes are wording calls in the most-read prose
   - notes: the finding count is unknown until the walk turns on; measure at step entry, and if it swamps the step, split by skill rather than reaching for the baseline ([C1 (no-baseline)](#c1)). While in the config: the generated AGENTS.md stanza's active-check list still omits `prose` (stale since the slot went default-on); regenerate it with checkride's own command rather than hand-editing the stanza ([C3 (records-stay)](#c3)).
4. [x] feat(prose): author the em-dash rule at warning and print the queue — **done when:** `.vale/styles/Repo/EmDash.yml` exists at `warning` severity flagging U+2014 in prose scope (code spans and fences escape it, the same way they escape the refs scanner), the full check stays green because warnings do not fail it ([D1 (warning-then-error)](#d1)), and one vale run prints the per-surface queue steps 5–12 burn down
   - seam: `.vale/styles/Repo/EmDash.yml`
   - model: opus — vale scoping is the one subtle part: what "prose scope" means for markdown bodies and for ts-mapped-to-js comments
5. [x] docs(decisions): sweep the key and settle both format markers — **done when:** `docs/decisions.md` carries zero em-dashes outside code spans; the 79 definition headers wear the colon separator and its two literal `— *because*` sites the comma marker ([D8 (comma-and-colon)](#d8)); refs and links slots green throughout ([C4 (scanner-stays-green)](#c4))
   - seam: `docs/decisions.md`
   - model: fable — 85 sites, and each replacement is an ear call under the voice's mapping
6. [x] docs(prose): sweep the guide docs — **done when:** `techniques`, `happy-path`, `state-and-git`, and `troubleshooting` carry zero em-dashes (133 today) and the reworded sentences read to the voice, not merely past the rule
   - seam: `docs/techniques.md`, `docs/happy-path.md`, `docs/state-and-git.md`, `docs/troubleshooting.md`
   - model: fable — the guides carry the repo's teaching register
7. [x] docs(prose): sweep the reference docs — **done when:** `cli-reference`, `skills-reference`, `install`, `architecture`, `local-model-review`, and `faq` carry zero em-dashes (106 today)
   - seam: `docs/cli-reference.md`, `docs/skills-reference.md`, `docs/install.md`, `docs/architecture.md`, `docs/local-model-review.md`, `docs/faq.md`
   - model: fable — reference prose is dense with asides, the hardest of the four mappings to call
8. [x] docs(prose): sweep the front door and the agents guide — **done when:** `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `docs/agents.md` carry zero em-dashes (114 today)
   - seam: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/agents.md`
   - model: fable — the README is the most-judged prose in the repo
9. [x] docs(templates): sweep the templates and land the decided marker — **done when:** the three templates carry zero em-dashes (20 today), `templates/intent.md`'s decision-line format teaches the `, *because*` marker ([D8 (comma-and-colon)](#d8)), and a build scaffolded from them is born clean
   - seam: `templates/intent.md`, `templates/build-log.md`, `templates/spike-report.md`
   - model: fable — the templates seed every future build's prose
   - notes: [Q2 (format-markers)](#q2) named two format em-dashes; the template carries more, unfenced: the step-line `<title> — **done when:**` separator (which `parseSteps` in `src/lib/orient.ts` reads; its doc comment states the shape) and the `- model:` sub-line's ` — ` before the why. Each must be fenced, exempted, or changed *with* its parser, sized at step entry; a format change here reaches `orient.ts` and its tests, which this seam does not carry, so surface it rather than sprawl. Landing the comma marker also makes `docs/voice/voice.md`'s provisional parenthetical ("stands until that format is decided separately") stale; flagging it for Rob's pen is part of this step ([C2 (voice-stays-shut)](#c2)).
10. [x] docs(skills): sweep the skills prose — **done when:** `skills/*/SKILL.md` carry zero em-dashes (147 today) and every reworded instruction still reads as an instruction
    - seam: `skills/`
    - model: fable — instructions must survive the re-punctuation with their imperative force intact
11. [x] chore(prose): sweep the src/lib doc comments — **done when:** vale reports zero EmDash findings over `src/lib/` outside its tests (231 today); runtime strings untouched
    - seam: `src/lib/` (comments only, `__tests__` excluded)
    - model: sonnet — comment asides are short and the mapping covers nearly all of them
12. [x] chore(prose): sweep the src/verbs doc comments — **done when:** vale reports zero EmDash findings over `src/verbs/` outside its tests (213 today); runtime strings untouched
    - seam: `src/verbs/` (comments only, `__tests__` excluded)
    - model: sonnet — the same mapping and the same shape as step 11
13. [x] chore(prose): sweep the test, entrypoint, and script comments — **done when:** vale reports zero EmDash findings over `src/**/__tests__/`, `src/cli.ts`, `src/cli-core.ts`, and `scripts/` (99 today); test titles are string literals and never surface
    - seam: `src/__tests__/`, `src/lib/__tests__/`, `src/verbs/__tests__/`, `src/cli.ts`, `src/cli-core.ts`, `scripts/check-refs.ts`
    - model: sonnet — the remainder, almost all of it one-line comment asides
14. [ ] docs(prose): exempt the receipts, sweep or exempt the essays — **done when:** `docs/evals/*` carries its `Repo.EmDash = NO` stanza and one-line why ([D9 (receipts-are-records)](#d9)); `docs/generation-loss.md` (42) and `docs/attention-first-development.md` (3) are each either swept by the human's own hand or carry the same per-file stanza ([D6 (exemption-over-forgery)](#d6)); nothing baselined
    - seam: `.vale.ini`, `docs/generation-loss.md`, `docs/attention-first-development.md`
    - model: sonnet — the model's share is at most the exemption stanzas; the sweep half, if chosen, is the human's pen (build it by hand and land it with `/plumbbob:verify`)
15. [ ] chore(gate): raise the em-dash rule to error and record it — **done when:** `EmDash.yml` rides at `error`, the full `pnpm check` is green repo-wide with `checkride.baseline.json` still absent ([C1 (no-baseline)](#c1)), and `docs/decisions.md` carries the rule and its exemption policy as the next free number
    - seam: `.vale/styles/Repo/EmDash.yml`, `docs/decisions.md`
    - model: opus — the decisions entry is the durable record; the sweep's calls compress into it

## Open questions

*(Holes you could NOT resolve on paper — the one section that expands rather than
compresses. Do not guess them into Decisions; a genuine fork goes to a SPIKE, with
the verdict recorded below and in Decisions.)*

- <a id="q1"></a>**Q1 (who-holds-the-pen)**: *resolved:* 2026-08-12, the model re-punctuates under the written mapping with every hunk read at the pause; became [D7 (model-holds-the-pen)](#d7)
  - *plain:* The precedent cuts both ways. The citations build's D18 note says fixes are hand edits, never a model style pass over model prose, and `docs/generation-loss.md` is the argument: model passes over model prose compound into a register nobody chose. But that burn-down was 59 findings; this one is roughly 1,200, and hand-editing all of it is exactly the swamp that note warned would justify splitting a build. The distinction available: a tone pass rewords, while this sweep applies a four-way mapping the voice itself wrote down (brackets, semicolon, colon, comma), which is closer to mechanical transform than to style. What is at stake in getting it wrong: either Rob spends hours on punctuation a rule already determines, or a thousand model choices quietly uniform the repo's rhythm.
  - *lean:* the model re-punctuates under the written mapping, file by file, with every hunk read by the human at each step's pause; the checkpoint is the human pass ([D4 (sweep-by-surface)](#d4) sizes each to be readable). Any site where the mapping is not enough and the sentence needs rewording is flagged, not fixed. The two hand-written essays are excluded outright and stay Rob's ([D6 (exemption-over-forgery)](#d6), step 12); `docs/voice/` is already carved out of the lint and out of every seam.
- <a id="q2"></a>**Q2 (format-markers)**: *resolved:* 2026-08-12, change both (comma before `*because*`, colon in the definition headers); became [D8 (comma-and-colon)](#d8)
  - *plain:* Vale's patterns are Go RE2, which has no lookaround, so a flag-every-em-dash rule cannot cleanly except one marker; keeping the formats means either regex contortion or a rule that permanently under-covers the two files where the voice matters most. Keeping them also keeps the em-dash alive in every future decision line a build writes. Changing them touches the 79 headers and the template's decision format, and `docs/voice/voice.md` explicitly left the marker standing "until that format is decided separately" — this is that decision, and if it changes, the voice file's parenthetical goes stale and only Rob's pen may fix it ([C2 (voice-stays-shut)](#c2)).
  - *lean:* change both. The decision line takes a plain comma (`D7 (skip-test-profile): the gate profile is a skip list, not an only list, *because* vitest is 52.7s of the 54.7s`), which is ordinary English subordination and keeps `*because*` greppable. The definition header takes the colon the voice already prescribes when the second half names the first: `**D74 (glossed-citations): A citation carries its slug.**` The refs scanner is indifferent to both (its regex stops at the slug parens, [C4 (scanner-stays-green)](#c4)), and the rule then needs no exception at all.

## Verdicts

*(Filled in as spikes and forks resolve — the audit trail of "these were my calls.")*

- (none yet)
