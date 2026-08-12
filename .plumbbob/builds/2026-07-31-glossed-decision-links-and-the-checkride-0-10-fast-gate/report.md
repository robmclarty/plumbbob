# Report — glossed decision links and the checkride 0.10 fast gate

**Status:** done. 18 of 18 steps checkpointed between 2026-08-01 and 2026-08-12, the full
`pnpm check` green across the 9 slots that run (`spell` is disabled in config). No revert
was taken at any boundary.

The `## Log` in `build-log.md` is the timeline, step by step and dated. This is the part the
log does not carry: what the build turned out to be, why the calls went the way they did,
and what is deliberately left open.

## What shipped

The build was framed as two unrelated papercuts batched because they land in the same files.
It finished as four things, and the last two are worth naming as growth rather than pretending
they were planned. Steps 1 through 11 are the original frame; 12 through 18 arrived after it.

**The citation rule.** A `D` or `C` reference now renders as one link carrying the
definition's own kebab-case slug, `[D26 (build-folders)](docs/decisions.md#d26)`, so it reads
without a lookup and the gloss travels wherever the link is copied. One rule, three renderings
by surface: relative links under `docs/`, absolute GitHub URLs in `skills/` and `templates/`,
and gloss with no link in strings the CLI prints. The absolute form is not a style preference.
`docs/` is not in the package's `files` list, so the one relative cross-package link the repo
shipped was broken in every installed plugin. `scripts/check-refs.ts` enforces it as the gate's
`refs` slot: linked, anchor matches the number, slug present, slug matches the definition
verbatim, plus the inverted rule for `src/` where a slug is required and a link is forbidden.

Because that fourth comparison is verbatim rather than fuzzy, the scanner catches a *wrong*
citation, not just a missing one. Q3 had declined to build exactly that, on the reasoning that
correctness is a review call; the amendment to D2 made it fall out for free.

**The gate.** checkride went from 0.5.2 to 0.10.2 and then to 0.12.1, five minors and then two
more. A Stop-hook gate now runs on every file-touching turn under a `{"skip": ["test"]}`
profile and comes back in about two seconds, because vitest is roughly 53s of the full check's
56s. What `plumbbob check`, `/plumbbob:verify`, and `checkpoint` run is untouched and still the
whole thing, test included. The profile is a skip list rather than an `only` list so that it
stays correct as slots are added.

**The prose plane.** This was not in the frame at all; it entered through Q8 and took five of
the seven added steps. `docs/voice/` holds the hand-owned exemplars, seeded by selection from
prose that had already survived a human pass rather than by generation. checkride's `prose`
slot points its `exemplars` key at that folder, and its first run's 59 findings across 22 files
were burned down by hand with nothing written to the baseline. A root `CLAUDE.md` carrying
`@AGENTS.md` is what makes any of it reach a session, since Claude Code reads `CLAUDE.md` and
not `AGENTS.md`.

**Two product defects, found while dogfooding.** `checkpoint --body` guarded its stdin read on
`isTTY` alone; under an agent harness stdin is a socket, so the read blocked for an EOF that
never came and the CLI hung, twice on two machines, once for 27 minutes with the work staged
and uncommitted. The same invocation dropped the body silently, which is the half you cannot
see. And `parseOpenQuestions` filtered opener lines on a bare `/resolved/i`, which matches
inside "unresolved", so any genuinely open question whose opener said "still unresolved" read
as settled and left the dashboard. Both arrived as parked lines and were promoted into the plan
by the human's call, which is the route the park list exists to make possible.

## Decisions and why

Nineteen decisions were settled in `intent.md`. These are the ones that shaped the outcome.

**Two amendments paid for themselves by landing early.** D1 and D2 were written with an
em-dash rendering and a per-site compressed gloss. Q9 reversed both *before* step 5 ran: the
parenthetical slug, copied verbatim from the definition. Deciding it after the sweep would have
cost re-rendering roughly 175 already-correct sites into a second convention. D19 was amended
the same way, after the step 14 harvest showed its mechanism was right and its delivery was
loading into nothing.

**The checker was authored first and wired last** (D3). `scripts/check-refs.ts` was written and
unit-tested in step 4 but did not join `checkride.config.json` until step 10, after the sweep,
because a red gate would have refused the very checkpoints that clean it up. The same bargain
was applied to prose as `optIn: true`, and the step 14 harvest caught that a staging flag is
exactly the kind of thing that becomes permanent by being nobody's job to remove.

**Nothing was grandfathered** (D18). The prose slot's first 59 findings were fixed by hand, 52
reworded and 7 turned into code spans in `docs/generation-loss.md`, which had been quoting the
words the new rules ban. A voice rule that reads green while the drift it was installed to
catch sits untouched is worse than no rule.

**The gate that enforces was kept, and the seam was stated out loud** (D75, from Q7). checkride's
Stop hook genuinely blocks the agent from ending a red turn, inside the repo of a tool whose
thesis is that the human is the clock. That is not a contradiction, because the two gates sit
on different planes: checkride gates the code, plumbbob latches the record. Writing that down
was the condition for keeping it.

**Records were never rewritten** (D6, D17, C3). Two dependency bumps landed as new steps rather
than as edits to the step that pinned the older version, historical build folders were not
retrofitted, and when a step was inserted mid-build and renumbered everything after it, the two
now-stale references were left standing with a reconciliation line instead of being corrected.
A checkpoint whose own account of itself is false is worth less than a slightly awkward one.

Four decisions were promoted out of build-local numbering into the repo key: D74 and D75
merged twelve of this build's locals into two entries, and D76 and D77 rescued two live format
rules that had been stranded in the 2026-07-18 build folder since it landed.

## Parked and harvested

Thirteen items captured mid-step, all thirteen classified across four boundaries. Six blockers,
seven tangents, zero pivot signals.

The six blockers went four different ways, which is the useful part: one was already fixed by
the step it had caused, two folded into the plan with no revert, two were one-line fixes taken
at the boundary in place, and one became a new step. That last one, the parked question of
whether the repo root wanted a `CLAUDE.md`, was proposed as a tangent and overturned by
checking it rather than assuming: without it, step 14's whole deliverable was loading into
nothing.

Of the seven tangents, three were adopted into the plan as steps 17 and 18 by the human's call,
three were deferred, and one was killed on inspection. The killed one is instructive: the claim
that `plumbbob check --only <slots>` was silently ignored turned out to be wrong, because this
repo configures `check` and therefore runs the documented override path. It was kept as a
killed line rather than deleted, because its residual is worth knowing.

## Deferred tangents

- **`skills/` prose is unlinted, and the em-dash rule has not landed.** vale parses SKILL.md
  frontmatter as YAML, and one unquoted colon in a description raises `E201`, which aborts the
  whole run rather than skipping the file. So `skills/`, among the most-read prose in the repo,
  sits outside the walk, and "prose is green" understates its coverage by exactly that much.
  This pairs with the one open question below into a single coherent next build.
- **`skills/harvest/SKILL.md` still teaches the pre-anchor Decision form.** It is the one
  intent-writing skill that neither step 7's sweep nor step 8's seam reached. The escalation is
  on the record: the `links` slot scans `.plumbbob/builds/*/intent.md`, so a blocker folded in
  by a future harvest can leave a dangling anchor and redden that build's own gate.
- **The nested plugin manifest wants one more look.** Q6 closed as far as this machine can
  show: nested plugin content is not discovered, so bundling stays. The residual is that no
  installed plugin currently ships a nested `.claude-plugin/plugin.json`, which is the exact
  artifact checkride adds. Re-check on the first packed install after release.
- **This repo's daily dogfood never exercises plumbbob's own in-process checkride path**,
  because configuring `check` routes around it. Left as a known gap, not a defect.

## Final status

Done, with one question deliberately still open.

Q10 asks whether the em-dash ban lands as a sweep, a baseline, or its own build, and its
recorded lean is defer. The voice bans the em-dash in prose, the repo is full of them,
`docs/attention-first-development.md` uses it as a structural device throughout, and
`templates/intent.md` writes `— *because*` into the decision format every future build
inherits. Deferring it kept the prose slot's high-value rules from waiting behind the largest
edit in the repo. It is open because it was chosen to be, not because it was missed, and it is
the natural subject of the next build alongside the `skills/` coverage gap above.

## Checkpoints

- baseline ef789b493d6b4f58b4b4a5079b6b4cda3dc1b1b2
- plan bfb0b4a1352f5c71c1f7309b1b812602e0494541
- step 1 ead5b60b79e7c1c5f462fb069da34fb7c4e8f425
- step 2 0581298be4b00a082dfe7b1dad9ec09e933a4aa3
- step 13 14ef4333fc268e1df3c8be15d573a18bc1db826a
- step 12 eb6fa00f7bfe73cd7e93672c52c4426e4fe5f3f3
- step 3 91ca7d427d41a86339ae6198d0a8b880aacf04e2
- step 4 4b5abb31d0d4fe9820cab08586787e161f36b1a2
- step 5 a89cdf9e23e39987fa8f2852fc27c3c96aecca27
- step 6 c03775e97639613a0d9cdc18490e1c3e8a6b14fa
- step 7 31ea13ffcc320c267b3b1aef855665395906dc8e
- step 8 82be65b9fa056d795d4ab5ecdaacf5b2b53653e7
- step 9 90115ca064356a05db6910a774ba6f665120a6ba
- step 10 4bed3f8231bd53d1fc2c057f09c935867a2f3d01
- step 11 bc39ce34895941806d406f0a60dad5eb00b07c37
- step 14 50bd46c80765d87aed71fcba76ab66ec07ed80ca
- step 15 82c89338910a2d785f7e9d56509ae418c7a0ec2b
- step 16 21b201d7de1d50c46be957727c6553f25fa74b69
- step 17 cb33b0e4025e64c53707029656db45907b207863
- step 18 ca24bacbf435c28953b1abce3779fbe0f0b26c3e

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
|------|------------|----------------|---------|------------|
| 1 | 2 | 1 | 0 | 21m |
| 2 | 0 | 1 | 0 | 19m |
| 3 | 0 | 1 | 0 | — |
| 4 | 0 | 0 | 0 | 46m |
| 5 | 0 | 1 | 0 | 13m |
| 6 | 0 | 0 | 0 | 12m |
| 7 | 0 | 1 | 0 | 47m |
| 8 | 0 | 0 | 0 | 37m |
| 9 | 0 | 0 | 0 | 6m |
| 10 | 0 | 0 | 0 | 5m |
| 11 | 0 | 0 | 0 | 41m |
| 12 | 0 | 0 | 0 | — |
| 13 | 0 | 0 | 0 | — |
| 14 | 0 | 1 | 0 | 21m |
| 15 | 0 | 0 | 0 | 6m |
| 16 | 0 | 0 | 0 | 22m |
| 17 | 0 | 1 | 0 | 35m |
| 18 | 0 | 0 | 0 | 9m |
| **total** | 2 | 7 | 0 | 341m |
