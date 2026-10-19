# Report: Runs and the stop card

**Status:** done. 16 of 16 steps checkpointed between 2026-10-18 and 2026-10-19, the gate
green at every landing (step 4 went red once on the way, over three findings it fixed
before landing).
Four steps landed a hair off, each with a named stray outside its seam: 4, 9, and 10 put
their new flag or verb in `docs/cli-reference.md` and `site/api.html` because the docs
contract demands it, and 14 carried two doc fixes harvested at the stop before it. Eight
ranges drove the build, all typed as `/plumbbob:build` under the installed hook. Steps 15
and 16 were added at range 4's stop and ran before 12 by the build order.

The `## Log` in `build-log.md` is the timeline. This is what the log does not carry: what
the build turned out to be, why the calls fell the way they did, and what is left.

## What shipped

**`/plumbbob:run` runs the range holding the next step, and the plan names its steps.**
`resolveRun` in `src/lib/orient.ts` is the one reading the hook, `status --run`, and the
card all share: with no number it names the range holding the step in flight, or else the
next undone step in build order, and with one it names that range. What is left of it is
written as the grant the hook mints at the keystroke (`steps 6-9`), beside a `RUN` mark
naming the range. A bare range mints nothing and builds its one step to its pause. Every
case that names nothing walkable mints nothing and refuses with the dashboard's move. The
card's segment reads `range 3 of 5: /plumbbob:run (steps 6-9)` where it named the range's
command, and the bracket is the grant, so the card and the hook cannot disagree. Step 6's
one live session landed a two-step range through the new skill in 26 seconds for $0.30,
which settled the build's one untested bet early.

**A run's range ends on the stop card, and one reply settles it.** The CLI measures the
range across its commits (the steps and their shas, the check across the landings, each
step against its own seam, the diff summed, the time spent), and the model writes the
review and a lean for every open park into the range's detail file. `plumbbob handoff
--stop` renders the card once and stamps it. The checkpoint that completes a marked range
records its ending as owing the card, so the relay check holds a turn that relays the plain
boundary instead. `plumbbob harvest` records the reply: it flips the settled parks, writes
the dated Harvest lines and the range's review beneath a Log line, refuses in the card's own
turn, and commits nothing.

**The card's labels and links were reworked at range 4's stop, before the docs described
them.** Reading a stop card in a throwaway repo turned up five changes: each park named
`P6` on a bullet line, its proposal written `→ lean: tangent, <reason>` under a `Harvested`
label, a line above the moves saying approval locks every lean in, `order:` as a labeled
field, and every `details:` bracket a short link to the file and line. Rob clicked a
boundary card's link in Zed after step 16 and it opened the file at its line.

**The plan, the template, and the docs teach the run as the main loop:** plan, run a range
to its stop, settle it, run again, finish, with `/plumbbob:build` as the granular move.
Every card in the README and the happy path was rendered by `node src/cli.ts` driving the
example plan.

**Contract c11 holds the run to its range and its card, 5 of 5.** A run over two ranges with
one park open landed exactly steps 1 and 2, left step 3 untouched, printed the card from an
unchanged detail with a lean for the park, and recorded nothing, in five live opus sessions
for $2.38. Every turn-shape probe passed too, and no session needed the relay check's hold.

## Decisions and why

Twenty-five decisions settled in `intent.md`: twelve with the plan (two of them, the verb
and the stop card, Rob's calls at the plan prompt), eight at the plan pause and the refine
that closed its eight questions, and five at range 4's stop. These shaped the outcome.

- [D3 (plan-names-the-grant)](intent.md#d3): the hook mints a run's grant from the plan at
  the keystroke and freezes it, because the human typed against a card naming those steps,
  and a later edit to the ranges must not widen what was approved.
- [D4 (namespaced-run)](intent.md#d4): only `/plumbbob:run` mints; a bare `/run` reaches
  Claude Code's own skill and must leave no grant behind.
- [D6 (one-loop)](intent.md#d6): the run skill reads the build skill for the per-step loop
  rather than copying it, because two copies drift. Step 6's session and c11's five are what
  say the read holds.
- [D8 (stop-card)](intent.md#d8) and [D9 (range-readout)](intent.md#d9): a landing range's
  stop is a review, so it gets a card of its own, with the CLI measuring every row it can
  and the model judging the rest.
- [D10 (settle-in-one-reply)](intent.md#d10) and [D11 (stop-latched)](intent.md#d11): one
  reply per stop rather than one per park, because a stop's harvest was the chore, while the
  record stays latched, because a long turn ending on proposals is exactly where a model
  would carry on into recording its own.
- [D14 (stop-record)](intent.md#d14): recording a stop commits nothing, because a fourth kind
  of ledger line would reach four readers.
- [D16 (stop-card-held)](intent.md#d16): the `RUN` mark and an owing `RELAY` record hold a run
  to its card, because only the skill's prose asked for the card's second beat, and a new
  clean-halt shape had gone wrong under the eval tier before.
- [D17 (live-run-early)](intent.md#d17): one live session at step 6, so a broken read of the
  build skill would surface before seven steps built on it.
- [D19 (in-flight-first)](intent.md#d19): a step in flight decides the run, because a run
  starting elsewhere would sweep that step's half-built diff into another step's commit.
- [D21 (park-handles)](intent.md#d21) through [D25 (order-label)](intent.md#d25): Rob's calls
  at range 4's stop, made from a card rendered in a throwaway repo rather than from the spec.

They were promoted into `docs/decisions.md` as plumbbob D95 (run-verb) through D108
(order-label), with dated revision notes on D81 (detail-file), D85 (range-top-lands), D87
(pause-once), D89 (block-once), D92 (build-ranges), and D93 (range-on-the-card).

## Parked & harvested

Seven items were parked and all seven harvested, at six of the eight stops.

- **Blockers folded into the plan (2):** two run-header refusals `status --run` worded with
  no line in the spec went into step 7's done-when, and the range readout examples that read
  `192 min` where the CLI prints `3h 12m` went into step 13's.
- **Fixed at the boundary, at Rob's call (3):** `docs/faq.md` and
  `docs/attention-first-development.md` still counted fourteen and fifteen skills, and rode
  step 14's checkpoint; the holds reader could not see a stop card's holds, and the report's
  footnote left c11 out of the pre-armed contracts, both fixed in `47d0a91`.
- **Tangents deferred (2):** the plain dashboard could mark a waiting stop card, and the
  build log's dated Harvest lines still write `park 1 ·` where everything else says `P1`.

## Final status

Done, with one caveat on what this session could see. The `plumbbob` on this session's PATH
is the installed 0.13.1 plugin, which predates the run, so every range of this build was
typed as `/plumbbob:build` ([C8 (old-grants-land)](intent.md#c8)) and the cards at its own
boundaries are the old ones. The run, the stop card, and the record were checked through
`node src/cli.ts` in throwaway repos ([C6 (temp-repo-dogfood)](intent.md#c6)), and live in
six headless sessions with this checkout loaded as the plugin, $2.68 in all. One commit sits
outside the ledger, `47d0a91`, the two boundary fixes committed by hand at range 6's stop. No
version bump and no CHANGELOG entry, per [C5 (no-release)](intent.md#c5).

## Deferred tangents

- **Mark a waiting stop card on the plain dashboard**, a tail beside the landed range's row,
  where only `status --run` names it today.
- **Write `P1` in the build log's dated Harvest lines** (`harvestLines`,
  `src/lib/buildlog.ts`), so the handle's one name reaches the ledger.
- **Render a harvest outside a stop as a card of its own**, the stop card without its range
  parts, so every harvest ends on a Your Call the CLI wrote.
- **Gather the ranges' reviews into `finish`'s report**: what each range landed and where
  one stopped early. The build-ranges build deferred the same table.
- **A stop's markdown link prints raw** on the dashboard and in the run header.
- **Give `order`'s ending an advisory** when a new sequence breaks a range.
- **Reword `abandon`'s refusal for a list grant** (`src/verbs/abandon.ts:109`); a run's grant
  is a list.
- **A span of ranges** (`/plumbbob:run 2-4`) could run them back to back, halting at each bare
  range; [D4 (namespaced-run)](intent.md#d4) keeps the form unread until it is designed.
- **Render c11 in a receipt.** Its five runs sit in a targeted ledger
  (`reports/evals/runs-2026-10-19-c11-latched.jsonl`); the next full sweep puts it on the
  page beside c1 to c10.

## Checkpoints

- baseline 10c4b0ede287c05a6fa45d2db5b7723590d83435
- plan 15f16364f3c9bd2091b536cc0133ddc291f3d958
- step 1 a720041d18fd672887d5d9c8e23667ca91fcebe8
- step 2 d2bd150d9bc253036be68a118c7948792e2886dd
- step 3 aee679a7a2a52f63001c61e00927093ad018460d
- step 4 0129d351938ae307129df7d80f97bea289568747
- step 5 de0185e58579387fab6fa2535a976d880c235705
- step 6 ea396880891c885120bda8b7b8c05dd608991d50
- step 7 5080ad6f0a6a8a7e56bf6b7a8fbc0845b19e4b2b
- step 8 163a6b0257c3e080386982d0d6cc90a3275696bf
- step 9 921dc85c72e8b409fed7ead09b375d78c6ddd6af
- step 10 df2a0c000429bfc7ba400de745ae1fddd40eccb4
- step 11 38112dea28fc5eb331826c965ee6fc5d72d3156c
- step 15 ed4cbe20019ca3b719bd7e1e4aa75a050298e36e
- step 16 3a93b635598d247cbedce4f6dc94c5333718c8d7
- step 12 5fe5d3a9e2cccf3892f033d0d29650f7cb38b3cb
- step 13 00133b1f6561995a7257b283d002e77941927fa2
- step 14 b2a5660acfd7309cade06e49ca9eaa8a8f1604d0

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
| ---- | ---------- | -------------- | ------- | ---------- |
| 1 | 0 | 0 | 0 | 21m |
| 2 | 0 | 0 | 0 | 11m |
| 3 | 0 | 0 | 0 | 6m |
| 4 | 1 | 1 | 0 | 11m |
| 5 | 0 | 0 | 0 | 8m |
| 6 | 0 | 0 | 0 | 10m |
| 7 | 0 | 0 | 0 | 25m |
| 8 | 0 | 0 | 0 | 4m |
| 9 | 0 | 1 | 0 | 22m |
| 10 | 0 | 1 | 0 | 13m |
| 11 | 0 | 0 | 0 | 10m |
| 12 | 0 | 0 | 0 | 12m |
| 13 | 0 | 0 | 0 | 17m |
| 14 | 0 | 1 | 0 | 34m |
| 15 | 0 | 0 | 0 | 632m |
| 16 | 0 | 0 | 0 | 59m |
| **total** | 1 | 4 | 0 | 897m |
