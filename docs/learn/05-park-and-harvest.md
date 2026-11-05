# A Surprise Goes on the List, Then into the Plan

You own a fourth thing: a passport that needs renewing in two weeks. Add it
the way you think about it and the tool refuses you. The spec said days, the
plan decided days (`D1 (days-only-unit)`), and nobody wrote weeks down as a
thing to refuse, because nobody thought of it. This is the unknown unknown,
met at the one place the plan said a human should look, and the next ten
minutes are what the course is for. The surprise pulls the plan off plumb; by
the end of the lesson the plan reads true again with the surprise inside it,
as a step with a number, a reason, and a place in a range still to come.
About twenty-five minutes.

## Meet It

In the terminal from lesson 4, with the alias and `SIFT_FILE` still set:

```sh
sift add "renew passport" --for 2w
echo $?
```

```text
sift: a shelf life is written in days, like 3d (got "2w")
1
```

The sentence in the middle is step 1's done-when, the one you held the card to
in lesson 3; the `sift:` prefix and the bracket are the bin's, and yours may
differ there. The refusal is deterministic because a test pins it. What you
do next is not.

## Park It, Do Not Chase It

The reflex is to turn to the agent and say "make `2w` work". That reflex lays
the next brick by eye. Nothing is in flight, so no step is at risk, but the plan is: a
change made from the chat leaves no line, no date, and no because. Capture it
instead:

```text
/plumbbob:park 2w is refused: the parser knows days, and weeks are how I think about passports
```

The skill composes one tagged line and shows it to you before it writes
anything:

```text
2w is refused by the parser, and weeks are how I think about passports (tangent)
```

Say `ok`. The tag is the parker's guess, and `tangent` is the default for
anything unsure; the harvest proposes the class that counts. The verb prints
the capture and the pointer forward:

```text
**Parked**: 2w is refused by the parser, and weeks are how I think about passports (tangent)

**Next Up**: **Step 6** on Haiku - feat(cli): give an item the default life when --for is left off (details: [intent.md:45](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L45))
```

The line is now the last item under `## Park list` in `build-log.md`, as
`- [ ]` and your words. Its handle is `P` plus its place in that list,
harvested lines counted: range 2's park was `P1`, so this one is `P2`. If your
range 2 parked nothing, yours is `P1`, and if it parked two, `P3`. Read the
handle off the card in a moment rather than assuming it.

## Harvest at the Boundary

```text
/plumbbob:harvest
```

A harvest runs at a boundary and never mid-step, and this is one. The skill
walks the open parks, proposes one class for each, writes the proposals into
`.plumbbob/detail.md` under `# Detail · Harvest`, and renders them as the
lean table. Roughly:

````markdown
**Harvested**: **1** of 2 parked ideas open

| Park | Why it matters | Lean |
| --- | --- | --- |
| **P2**: [weeks as a unit](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/build-log.md#L35) | the list refuses the unit its owner thinks in | blocker: step 6 stores a life and step 7 judges one past, and both would document a unit the parser refuses |

**Your Call**:

Approving locks in each lean above; to change one, say so first (`make P2 a tangent`).

- `looks good` → I record every lean as proposed, folding a blocker into the plan
- anything that reads as direction → I change the lean and say what moved; nothing is recorded until you approve
- `expand`, or any question → I show more of what is there; nothing changes
````

Three columns. The handle and the link are the CLI's, read from the list, so
a row always points at the park it names; the title, the why, and the lean are
the model's ([D112 (lean-table)](../decisions.md#d112),
[D125 (linked-park-names)](../decisions.md#d125)). A park gets one of three
classes: blocker (the plan was wrong, so fold it in and handle it now),
tangent (different, not clearly better, and the default), or pivot signal
(the approach is wrong, so stop and replan).

Your model may lean tangent here, and tangent is the honest default when it
is unsure. You know more than it does: step 6 stores a life and step 7 judges
one past, and a unit the parser refuses is a hole both would document. Say so:

```text
make P2 a blocker
```

The agent rewrites that line of the detail file, says which lean moved, and
closes on one line. Nothing is recorded yet; ask to see the table again and
it comes back with the row rewritten. Then:

```text
looks good
```

## Watch the Plan Absorb It

Approval is where the plan moves, and it moves before the record lands. The
skill folds the blocker in by the harvest's rules: a Decision slugged at
birth, a step with the next free number, and a place in the order. You see
the two verbs' endings, the order first:

```text
**Build order**: 8, 6, 7

**Build ranges**: range 3 of 3 re-cut (steps 8,6-7)

**Next Up**: **Step 8** on Haiku - feat(life): accept a shelf life written in weeks (details: [intent.md:51](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L51))
```

Then the record:

```text
**Recorded**: 1 parked idea (1 blocker)

| **Next Up** | **Step 8** on Haiku - feat(life): accept a shelf life written in weeks (details: [intent.md:51](.plumbbob/builds/2026-11-04-sift-a-list-that-forgets/intent.md#L51)) |
| --- | --- |
|  | **Range 3** on Sonnet: /plumbbob:run (steps 8,6-7) |
| Order | 8, 6, 7 |
| Parked | **0** of 2 open |
```

Read what changed:

```sh
git diff -- .plumbbob/
```

Three places in `intent.md` grew. Your model's wording will differ; check for
the slug, the step's number, and the order line:

```markdown
- <a id="d5"></a>**D5 (weeks-are-days)**: `w` is sugar for seven `d`, *because* the store keeps days and the parser stays one function (step 5's boundary, P2)

8. [ ] feat(life): accept a shelf life written in weeks, **done when:** `parseLife('2w')` yields 14 days and `'2x'` is still refused, with the refusal naming both units
   - seam: `src/life.ts`, `src/__tests__/life.test.ts`
   - model: haiku (one more branch in one function)

## Build order

8, 6, 7

3. `/plumbbob:build 8,6-7`, **stop:** fake four days with `SIFT_NOW`, read `sift` again, then `/plumbbob:finish`
```

Three things to notice. The step is 8, not a renumbered 6: a step keeps its
number for life and takes its place through the order line, so every SHA,
Log entry, and citation that names a step stays true. It builds first because
step 6 stores a life and step 7 judges one past, and weeks are settled before
either. And it joined range 3, not range 2: range 2 has landed, its call was
made in lesson 4, and a step added to it would reopen it, so `plumbbob order`
re-cut range 3 to follow the order it wrote, changing the command alone and
leaving the stop, the model, and the item number as you wrote them
([D109 (ranges-follow-the-order)](../decisions.md#d109)). The record commits
nothing; the flipped park and the new lines ride step 8's checkpoint
([D104 (harvest-records)](../decisions.md#d104)).

In `build-log.md`, the park is `- [x]` now, and `## Harvest` carries the
record a reader will find next month:

```markdown
- 2026-11-04, at the step 5 boundary: 1 parked idea, classified.
- **blocker**: park 2 · 2w is refused by the parser, and weeks are how I think about passports (tangent) → step 6 stores a life and step 7 judges one past, and both would document a unit the parser refuses
```

## Read the Dashboard

```text
/plumbbob:status
```

```text
PlumbBob — sift: a list that forgets   [DESIGN]

  steps  5/8 done
  ✓ 1  feat(life): parse a shelf life written in days
  ✓ 2  feat(item): tell a live item from one past its life
  ✓ 3  feat(store): keep the list in one JSON file
  ✓ 4  feat(cli): add an item with sift add
  ✓ 5  feat(cli): print what is still alive with bare sift
    6  feat(cli): give an item the default life when --for is left off
    7  feat(store): settle what happens to an item that falls off
  ▸ 8  feat(life): accept a shelf life written in weeks   ← next
        done when: `parseLife('2w')` yields 14 days and `'2x'` is still refused, with the refusal naming both units
        seam: src/life.ts, src/__tests__/life.test.ts
        model: haiku (one more branch in one function)

  ranges  2 of 3 done
  ✓ 1  /plumbbob:build 1 · haiku
  ✓ 2  /plumbbob:build 2-5 · sonnet
  ▸ 3  /plumbbob:build 8,6-7 · sonnet   ← next
        stop: fake four days with `SIFT_NOW`, read `sift` again, then `/plumbbob:finish`

last checkpoint  step 5 · 7a4d2c9
build order  8, 6, 7
parked 0 of 2 open · open questions 1 deferred

next → run range 3 of 3 — `/plumbbob:run` (steps 8,6-7)
```

The steps list in document order and the arrow sits on 8, because the build
order says what builds next. The `build order` line prints only when the
order departs from the numbering, and range 3's command reads `8,6-7`, in the
order it builds. No `⚠` row appears: the order settled every step, so nothing
is left for you to re-cut. The plan is plumb again, with one more step in it
than the spec foresaw and a dated line saying why.

## With Your Agent

> Read the Park list and the Harvest section of build-log.md and tell me why
> the passport park became a blocker rather than a tangent, in the harvest's
> own words. Don't edit.

Check that it quotes the recorded `**blocker**` line and the reason after its
arrow, not the chat. The record is the harvest's own words; the chat is a
memory of them.

## Try It

1. Park a second idea and harvest it. Type
   `/plumbbob:park sift could print the date an item falls off instead of days left`,
   say `ok`, then `/plumbbob:harvest`. It should come back a tangent; say
   `looks good` and read `**Recorded**: 1 parked idea (1 tangent)`. Then:

   ```sh
   git diff --stat -- .plumbbob/
   ```

   Only `build-log.md` moved. A tangent is a line in the log, never a step.
   Nothing to put back.
2. Type `! plumbbob status` in the chat and find the `build order  8, 6, 7`
   line and range 3's re-cut command, `/plumbbob:build 8,6-7`. Then
   `! plumbbob status --questions`: the Deferred table still holds `Q2`,
   since a harvest touches no question. Nothing to put back.

## Remember

- Capture, do not chase: a park costs one line and protects the plan.
- The harvest proposes and you call it, and the record waits for
  `looks good`.
- A step keeps its number for life and takes its place through the order,
  never by renumbering; a landed range never takes it.

[← A Range Stops Where the Plan Said](./04-a-range.md) · [The Next Step Is Sharpened Just in Time →](./06-sharpen-the-next-step.md)
