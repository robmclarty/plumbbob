# Report — the em-dash sweep and the skills prose walk

**Status:** done. 15 of 15 steps checkpointed between 2026-08-12 and 2026-08-13, the full
`pnpm check` green across the 10 slots that run (`spell` is disabled in config),
`checkride.baseline.json` absent throughout. No revert was taken at any boundary.

The `## Log` in `build-log.md` is the timeline, step by step and dated. This is what the
log does not carry: what the build turned out to be, why the calls went the way they did,
and what little is left.

## What shipped

The build paid three debts the citations build had named and deliberately left, all on
the prose plane.

**The ban has teeth now.** `.vale/styles/Repo/EmDash.yml` flags U+2014 in prose scope and
rides at `error`: a reintroduced em-dash reddens the full gate and the two-second turn
profile alike. The rule is narrow on purpose, U+2014 alone [the en-dash in `steps 1–3`
and the hyphen are different marks doing different jobs], and its message carries the
voice's four-way replacement so a writer reads the fix without leaving the terminal. It
landed at `warning` in step 4 and printed the queue; nine sweeps burned the queue down;
step 15 flipped one line to `error`. The severity ladder is the same bargain the
citations build struck with its scanner, authored first and wired to fail last, because a
rule that fails mid-sweep refuses the very checkpoints that clean it up.

**`skills/` is in the walk.** The most-read prose in the repo sat outside the prose slot
because vale parses SKILL.md frontmatter as YAML, and one unquoted colon in a description
raises an E201 that aborts the entire run. All 13 descriptions are quoted now, the safe
shape held by rule rather than by luck; the path joined the slot's list, and the ten
findings the walk surfaced were fixed the day it turned on. The harvest skill's stale
pre-anchor decision form went in the same opening move, so the one intent-writing skill
that taught the dangling-reference shape now teaches the anchored one.

**Roughly 1,200 marks left the owned surfaces.** Nine review-sized sweeps: the decisions
key, the guides, the reference docs, the front door, the templates, the skills, and the
`src/` doc comments split three ways. Two structural markers went with them, because
vale's RE2 has no lookaround and a rule that spares a marker is regex contortion or
permanent under-coverage: the decision line now reads `, *because*` and the definition
header `**DNN (slug): Title.**`, both punctuation the voice already prescribes. The
template's step-form separator changed *with* its parser, so a scaffolded build is born
clean and `parseSteps` reads the comma form beside the legacy dash.

**What is exempted is exempted out loud.** `docs/evals/*` is a dated record, the same
genus as `CHANGELOG.md` and the build folders the walk already holds out; the two
hand-written essays are anchor texts, and a model pass over a hand-written anchor is the
copy-of-a-copy failure `docs/generation-loss.md` documents. Each carries a per-file
`Repo.EmDash = NO` stanza in `.vale.ini` with a one-line why. Runtime strings keep their
em-dashes: vale cannot see a string literal, and the terminal is not the prose plane the
voice governs. Nothing was baselined.

**The key records it.** D78 (em-dash-ban) merged the build's seven locals into one
entry: the rule, its scope, the marker change, the severity ladder, and the exemption
policy. The build-local citations in `.vale.ini` and two test titles were renumbered to
the canonical tag when it landed.

## Decisions and why

Nine decisions settled in `intent.md`. These are the ones that shaped the outcome.

**The model held the pen, and the pause kept it honest** (D7, from Q1). Twelve hundred
sites is exactly the swamp the citations build's fixes-by-hand rule warned about, and the
distinction that resolved the fork: this sweep applies a four-way mapping the voice
itself wrote down, a punctuation transform rather than a tone pass. Every hunk was read
at a step's pause [D4 sized each step to be readable in one sitting], a site the mapping
could not settle without rewording was flagged rather than reworded, and the essays
stayed out entirely.

**Both format markers changed rather than being spared** (D8, from Q2). Keeping either
meant a rule with a hole in the two files where the voice matters most. The replacements
cost 79 definition headers and a template, and bought a rule with no exception list at
all.

**Exemption over forgery** (D6, D9). A file the sweep may not touch gets a stanza that
says so and says why, never a quiet model re-punctuation. An exemption is honest about
who owns the prose; a baseline entry would have been a debt pretending to be a decision.

**The surface joined before the rule existed** (D5). `skills/` entered the walk in step
3, one step ahead of the rule, so the rule met its whole surface once and no closed sweep
step was reopened by a growing walk.

## Parked and harvested

Four items, two boundaries, zero pivot signals.

After step 4, two blockers, both resolved with `/plumbbob:refine` on Rob's call: the eval
receipts carried 68 findings no step owned [folded in as D9, exempt as records], and step
11 measured 543 findings against D4's 150–250 review band [split three ways along the
directory seam; the plan grew from 13 steps to 15]. Both numbers came out of the queue
step 4 existed to print, which is the severity ladder paying for itself.

After step 15, two tangents. The per-surface queue counts had undercounted throughout
[vale collapses multi-line paragraphs when positioning findings; the decisions key's
listed 85 was 197 outside code spans]; it never blocked a step, because every sweep ran
to zero as verified by vale rather than to a predicted count. And the voice file's
decision-register passage still taught the retired marker; the park line said flag-only
under C2, Rob overrode it with a typed instruction, and the fix was two lines with the
file's em-dash count ending at zero.

## Deferred tangents

- **The packed-install manifest re-check stays parked for release time** (the citations
  build's Q6). Two builds are now stacked unreleased; the human cuts via `/version`.
- **The next prose sweep should size its queue with a mask-aware scan**, stripping code
  spans and fences before counting, rather than trusting vale's per-file totals. The
  method is recorded in the harvest.

## Final status

Done, nothing left open. The park list is empty, open questions zero, and the ban is
enforced from here on: an em-dash typed into any owned surface fails the fast gate in
about two seconds, with the four replacements named in the message it prints. The eval
receipts and the two hand-written essays remain exactly as their authors left them, which
is the point of the stanzas that exempt them.

## Checkpoints

- baseline 6a098deeac8afe66de3663bf381a414b33aba295
- plan 28487889689331e543f732e3db4baa0e7e825a32
- step 1 09f654835b2b19c504c3bef64e5872637ab7cbb0
- step 2 e3b5af42c611f095cbf481b98e20f5e448fec54c
- step 3 af0e781e3853dd18c039a10e9b10d34b3574d0af
- step 4 19e96e2068b60d1698bf993515c31d18c6ff9d8a
- step 5 89da5fe5ba6c71e9b72c762971ffec5b0a3ea816
- step 6 7a2fa3b358c42961bc64254d23c6be0a35e608af
- step 7 164460ed2e38f8d9f96863db7a7f5cdd3e09bd83
- step 8 a1caea2b8be67991049c2a5f4907a4db1fc5d3a9
- step 9 44ee1ed11e7840032fefa907ae967570bdd3feb7
- step 10 10bab962a08551ca3e2f6fdd40f6893765c683b6
- step 11 f98486bc88d5e2fde621db23d8f639367a818d49
- step 12 97323949a83407fe13932b8884e9a9d1e7d795a7
- step 13 e2546b69f9f1eb108e9572d2f6b4ec7f26e9ccc3
- step 14 9e7f40e983deb24c9bc5e802bc511726bd597812
- step 15 4ce90053a1c3fae5ec7a7c7b308c9018a5ffdcca

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
|------|------------|----------------|---------|------------|
| 1 | 0 | 0 | 0 | 7m |
| 2 | 0 | 0 | 0 | 6m |
| 3 | 0 | 0 | 0 | 8m |
| 4 | 0 | 0 | 0 | 9m |
| 5 | 0 | 0 | 0 | 33m |
| 6 | 0 | 1 | 0 | 66m |
| 7 | 0 | 0 | 0 | 27m |
| 8 | 0 | 0 | 0 | 19m |
| 9 | 0 | 1 | 0 | 38m |
| 10 | 0 | 0 | 0 | 35m |
| 11 | 0 | 0 | 0 | 26m |
| 12 | 0 | 0 | 0 | 18m |
| 13 | 0 | 0 | 0 | 60m |
| 14 | 0 | 0 | 0 | 7m |
| 15 | 0 | 1 | 0 | 18m |
| **total** | 0 | 3 | 0 | 377m |
