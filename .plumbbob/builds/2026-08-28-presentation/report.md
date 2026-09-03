# Report: presentation

**Status:** done. 18 of 18 steps checkpointed between 2026-08-28 and 2026-09-03,
`pnpm check` green at every one, no revert taken and no red check recorded at any
boundary. The plan was cut at 7 steps and finished at 18; the difference is five
boundary reads in which Rob looked at the live turn and re-cut its shape, which is
what a build about presentation should expect.

The `## Log` in `build-log.md` is the timeline. This is what the log does not carry:
what the build turned out to be, why the calls fell the way they did, and what is
left.

## What shipped

**The turn has an anatomy, and one thing renders it.** Before this build the
hand-off block was the only stable text in a plumbbob turn; everything around it was
composed fresh by whichever model was driving. Now `docs/presentation.md` fixes the
parts and their order, and `plumbbob handoff` renders every one of them from
`.plumbbob/detail.md`: the **Summary** (a lead sentence or short paragraph, then
numbered highlights), the **Readout** fence (the measured `check`, `seam`, `diff`,
and `spent` rows beside the model's three judgment rows), the **Verdict** on the
circle ladder (`● Plumb`, `◐ A hair off`, `○ Out of plumb`, `✗ Not standing`, each
naming its worst component), **Next Up** with the progress count, the model, and a
`details:` path, **Your Call** as the four moves a human actually makes, and the
**Recommendation** as the turn's last words. The model writes the file, runs
handoff, and pastes the block at top level. It authors nothing in the chat but the
relay.

**Detail moved behind handles.** One untracked file holds the in-flight step's full
story. `checkpoint` folds it into the commit body and truncates it, so git is the
archive and there is never a pile of stale detail files. "Expand 2" or any question
at the pause is answered from the file, the diff, or `git show`, never from recall.

**Every transition prints its whole ending.** The seventeen relayed lines that
predated handoff each carried their own pointer sentence, a second seam in a turn
that now has one. They were swept through a single formatter in `src/lib/notice.ts`:
a labeled lead line (`**Checkpoint**: Step 15 complete (2d917cde7)`), the Verdict
where one is measured, advisories as unprefixed sentences with a `→` remedy beneath,
and the Next Up pointer, blank-line separated and emitted by the verb as one stdout
block. Refusals keep the `plumbbob:` prefix on stderr, where output is genuinely
mixed. handoff learned the two pointers it lacked, past an open spike and out of a
finished session, and `finish` prints its own, since it has just cleared the session
handoff would read from.

**Three tiers, all of them producible.** A decision turn (the build or verify pause,
the plan pause) renders the full ending, your-call included; an orientation turn
(the checkpoint boundary, finish) renders the lead line, the Verdict, and the
pointer; a driver turn (park, spike, revert, abandon) renders its line and the
pointer back at the in-flight step. Every illustrated block in `docs/happy-path.md`
now matches real CLI output or a skill's exact template, the `handoff` entry in
`docs/cli-reference.md` describes the block the verb emits, and the build and
verify skills shrank to "write the file, run handoff, paste."

**The eval tier measures the shape, not only the behaviour.** Each c-series
contract now folds three or four `info` probes at its own tier: the parts the tier
owes and their order, whether the gate verdict rides the check row, whether the
recommendation is the last text, and whether anything followed the relay. The
receipt at `docs/evals/2026-09-03.md` carries a `## Turn anatomy` table: 15 of 16
latched runs passed their contract, and the anatomy rendered whole in 7 of 14
decision endings, with nothing after the relay in 8 of 18 turns. The number is
the point of the step; what it names is parked below. The c8 readers were found
structurally broken along the way (they still expected the bare decision opener
the template had stopped teaching) and fixed, so contract 8 reads 2 of 2 for the
first time against the anchored form.

## Decisions and why

Forty-three decisions settled in `intent.md`, sixteen at plan time and twenty-seven
in flight. These are the lines that shaped the outcome.

**Ownership moved until the model owned only judgment.** The build opened on
D1 (consistency-from-ownership): whatever can be deterministic is CLI-rendered,
because the hand-off block had already proved relay beats re-composition across
models. D19 (cli-does-what-it-can) pushed it to the limit at the step-5 boundary,
moving the `check`, `seam`, and `diff` rows to the CLI, and D37 (zero-seam-turn)
finished the move after step 10: handoff renders the whole turn from the detail
file, because every defect the build found in a live turn sat in the region the
model authored. A region the model does not own cannot be narrated into.

**A positional rule where a prohibition failed.** Step 5's own pause stated the
check verdict three times inside meta-narration, and "don't repeat yourself" was
never going to hold. D18 (turn-is-the-anatomy) and D20 (one-seam-turn) replaced it
with a position: the CLI ending is one contiguous block, the model relays once and
writes nothing after. D28 (fact-not-move) applied the same idea to every verb's own
line, which states its fact and leaves the move to the pointer, and
D43 (verb-prints-its-ending) closed it: a block one command emits cannot be relayed
out of order.

**Measured beats attested.** D14 (recap-as-wire) made the fenced recap a parseable
wire, so handoff folds the model's rows worst-of with its own measurement
(D11 (worst-of-banner)) and re-emits the check row from the last run rather than
trusting the row it was handed. D21 (verdict-in-the-row) then dropped the standalone
verdict line, since one measured fact rendered twice is the repetition D18 exists to
kill. D39 (spent-row) added elapsed, turns, red checks, and gate time from what
stats.json and the ledger already hold, tokens and cost deliberately out, and
D41 (own-commits-not-out-of-band) stopped the Verdict's advisory rung from tripping
on plumbbob's own plan commits, which land between nearly every step of a build
like this one.

**The shape was re-cut by reading it, not by designing it.** D33 (labeled-lines)
through D41 came out of one boundary review after step 10: every part outside the
fence became a bold label with wrapping text, the fence became the Readout under a
Summary (D34 (readout-and-summary)), green rows collapsed to counts that size their
universe and red rows name one offender inside 80 columns (D35 (collapse-to-count)),
the step identity rendered once with the progress on Next Up
(D36 (progress-on-next-up)), and `details:` became the one word for where to look
(D40 (details-one-word)). D42 (transitions-wear-the-label) and D43 came from the
same kind of read at the step-15 and step-16 boundaries, when the boundary turn was
seen running two grammars at once.

**Three of Rob's calls were about what the pause owed the human.** A pause that
ends without a recommendation is a defect, not a missing nicety
(D23 (recommendation-last)); the recommendation opens with its label and states the
move as its own sentence before the reason (D25 (labeled-recommendation)); and the
your-call block lists the moves actually made, `expand` among them, because zeroing
in on one part before approving was the move made most and was not on the card at
all (D38 (real-moves)).

**One coordination with checkride.** Rob's verdict rewording in checkride retired
the literal `NOT the full check` phrase mid-build, so D24 (narrowing-named-not-shouted)
has a narrowed gate name its deselected slots from the summary's skipped rows
instead. The AGENTS.md stanza regenerates at the next checkride release; nothing in
this build re-specs the dead string.

## Parked & harvested

Fourteen items parked, ten harvested, every one of the ten called **blocker** by
Rob. No tangent and no pivot signal in the harvested set, the same ratio the
previous build reported, and for the same reason: each park was a fault in the
instrument the build was building, found by using it.

- **After step 5**, the plan-pause card and driver next-up line were spec'd but not
  emitted, and handoff's card clobbered its own last line for want of a trailing
  newline. Both became D17 (whole-anatomy-emitted) and step 6.
- **After step 6**, the standalone verdict duplicated the check row, recap rows
  scrolled sideways, and the pause ended without a recommendation. They became
  D21 (verdict-in-the-row), D22 (recap-width-budget), and D23 (recommendation-last),
  absorbed by steps 7 and 8.
- **After step 7**, a narrowed checkride run recorded nothing about its narrowing,
  and the verdict rewording was retiring a phrase the docs still taught. Both
  landed in flight as D24 (narrowing-named-not-shouted); checkride itself gained
  the skipped rows.
- **After step 9**, the `handoff` reference entry contradicted the block the verb
  emits (D26 (reference-tracks-the-card), folded into step 13's seam), and
  plumbbob's own lines broke the register the spec stated
  (D27 (own-lines-one-colon), which grew into the D28 through D32 sweep and steps
  14 and 15).
- **After step 15**, the two new pointer shapes were missing from the spec's list
  and the happy-path fence; folded into step 16.

Most of the build's decisions did not arrive as parks at all. Seven of the ten
boundary entries in the intent's `## Verdicts` are fresh reads of a live turn
rather than harvested lines: the verbosity read after step 5, the ownership limit
and the one-seam rule on 2026-09-01, the recommendation's shape after step 8, the
notice design after step 9, the anatomy re-cut after step 10, and the ending's
order after step 16. Living with each turn was the design method.

Four items remain unharvested at close; they are listed under deferred tangents
with their classification left open, since that call is Rob's.

## Final status

**Done.** Every line of the frame's done-looks-like holds: handoff renders every
part of a decision turn from the detail file, every illustrated block in the happy
path is producible, the eval tier ran against the new anatomy and left a fresh
receipt, and `pnpm check` was green at all 18 checkpoints. Nine steps raised a
drift warning, each naming a file the checkpoint swept in beyond its declared seam;
none was a revert. Two of Rob's own commits landed outside the ledger, dropping the
checkride stop-hook gate from settings and capitalizing the detail pointer, and
neither touched a step's product.

Two measurements qualify the word. The anatomy lands whole in about half of the
live decision turns the sweep watched, which is the number step 18 existed to take
and the reason the last park exists. And one c4 run failed its range assertion
(1 of 2, against 5 of 5 at the 2026-07-27 receipt); it was not retried, and the
receipt records it.

Left open: the four unharvested parks below, Q13 (two-pointer-vocabularies), and
the AGENTS.md stanza refresh that rides checkride's release.

## Deferred tangents

- **A configured `check` command leaves the Verdict blind.** Only the checkride
  path writes the `.check/summary.json` the check row reads, so a repo gating
  through a plain command renders no check row, withholds `looks good` from Your
  Call, and folds its Verdict with no gate input at all. A c3 run watched handoff
  print `● Plumb` while `plumbbob check` had just exited 1. This reads as a defect
  rather than a tangent; it is the first thing to harvest.
- **`git diff --numstat` sees neither untracked nor staged files.** A step whose
  product is a new file renders no seam row and no diff row, and the Verdict folds
  without either. Step 18 was its own example: `anatomy.ts` is new, so the diff row
  under-counted it.
- **The anatomy rate itself.** Prose after the relay is the dominant defect
  (c2, c3, c4, c5, c7, c8), c6 wrapped the whole block in a fence of its own on both
  runs, c5's park turn dropped Next Up for pointer prose, and one c8 plan pause never
  relayed `handoff --plan`. The skills teach the positional rule; nothing measures
  it per turn.
- **The shared rate-limit example's step titles are not Conventional-Commit
  subjects**, which the plan skill and D68 (conventional-subjects) mandate. Upgrading
  them is a cross-doc sweep of the happy path, the techniques guide, and the spec's
  worked example.
- **Two pointer vocabularies** (Q13 (two-pointer-vocabularies)): the dashboard's
  `next →` line and the card's `**Next Up**:` say one thing in two shapes. Left
  both; named as the next place the format may feel thin.
- **The AGENTS.md stanza** regenerates from `checkride agent-setup` at the first
  refresh after the checkride release that carries the verdict rewording.

## Checkpoints

- baseline c8158cecaaccea641283ff02783e54d20930f2b7
- plan e23f935cae8d82ac9e2758bbbbbfd3c8274d0126
- step 1 e1469c7f75febeedf0b8c2950e658e911245a384
- step 2 030407ba681fcaf72aef2814b84ab41ed9f6c257
- step 3 88d0656d33015ad92d879f177312b0f68cf280fa
- step 4 65726e6f72adb2f19c95982b455a36504e56a753
- step 5 45705f5a2dd75e712118a82a15722895abfc6ef3
- step 6 23768b62420bdfeacf6b35ca252fe9ac1ef390a3
- step 7 558737199e1d914b4b9f364a0624d308f6742997
- step 8 2cc7a18bfa44ee3fc1bb1f54386e8681eb476cd8
- step 9 30c88e8cd190efa0fb21922d14e88e06a3d07bfb
- step 10 0dd5ad52e8e9ee2303342afb04c181c2f226668f
- step 11 3cbb7271988549719a7beb06712859f2ef5f86d2
- step 12 9b8956c9cf33d17af394209d2b65241e3ec786fa
- step 13 c723202eb90426daf3eb9135f746e46d6f722023
- step 14 bb095523a368cce41f6679c4000d9423138b75d2
- step 15 2d917cde7f78437fa7eca7fa7df1883532eb7532
- step 16 f2b83e17c10044578c9d3a15e4861865083a6e40
- step 17 8a86f9790d1b8f9cd73fc11cbb605d06777a0a3a
- step 18 485d17669509b3c61047689a8b24d0d8afdaee08

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
| ---- | ---------- | -------------- | ------- | ---------- |
| 1 | 0 | 1 | 0 | 52m |
| 2 | 0 | 1 | 0 | 11m |
| 3 | 0 | 1 | 0 | 16m |
| 4 | 0 | 0 | 0 | 150m |
| 5 | 0 | 0 | 0 | 44m |
| 6 | 0 | 1 | 0 | 16m |
| 7 | 0 | 1 | 0 | 94m |
| 8 | 0 | 0 | 0 | 16m |
| 9 | 0 | 0 | 0 | 7m |
| 10 | 0 | 0 | 0 | 88m |
| 11 | 0 | 1 | 0 | 38m |
| 12 | 0 | 0 | 0 | 34m |
| 13 | 0 | 0 | 0 | 20m |
| 14 | 0 | 1 | 0 | 40m |
| 15 | 0 | 0 | 0 | 26m |
| 16 | 0 | 1 | 0 | 14m |
| 17 | 0 | 0 | 0 | 90m |
| 18 | 0 | 1 | 0 | 62m |
| **total** | 0 | 9 | 0 | 819m |
