# sift: the target plan

Two fences: the plan the model should converge on at `B4`, before the surprise, and the plan
as it should stand after the harvest, the sharpen, and both hand edits (`B13`). Read the live
plan against the first at a glance; paste either over `intent.md` only when the live one is
malformed past a cheap direction, then fix the dates (`NN` is the day of the workshop) and
run `! plumbbob status` to prove it parses. A plan that differs in wording, or in a step's
seam, is not malformed; the beats key on the range holding step 1 and on range 2's stop.

## After the plan card

Header `**Size:** small`, `**Scope:** sift`. The scaffold's `src/sift.ts` starter and its
smoke test are replaced in step 5, and the plan says so in that step's seam. `Q1` and `Q2`
are open and the Build order line is empty.

````markdown
# sift: a list that forgets

**Phase**: frame
**Size:** small
**Scope:** sift

*Source: docs/spec.md*

## Frame

- **Problem:** a to-do list grows until it is a list of guilt; lines I meant to do one week are still there a month later, so the list stops being readable.
- **Smallest thing that solves it:** a command-line tool, `sift`, with two commands: `sift add <text> --for <days>` adds an item with a shelf life in days, and bare `sift` prints what is still alive, oldest first, with the days each has left.
- **Done looks like:** add "return library book" for 3d and "call the dentist" for 10d, run `sift`, see two lines; four days later, run `sift` and see one line, the dentist's.
- **Explicitly NOT doing:** sync, a server, sharing; editing or marking done; recurring items; any unit of shelf life but days.

## Decisions

- <a id="d1"></a>**D1 (days-only-unit)**: a shelf life is `<n>d`, *because* days are the only unit the problem names and one unit keeps the parser one function.
- <a id="d2"></a>**D2 (oldest-first)**: bare `sift` prints alive items oldest first with days left, *because* the item nearest falling off is the one to act on.

## Constraints

- <a id="c1"></a>**C1 (no-runtime-deps)**: Node built-ins only; no runtime dependencies.
- <a id="c2"></a>**C2 (one-json-file)**: the list is one JSON file at `$SIFT_FILE`, default `~/.sift.json`.
- <a id="c3"></a>**C3 (pure-core-injected-clock)**: the core is pure functions over a list and a clock passed in; only `src/bin.ts` reads the real clock, the real file, and `process`, and it reads `SIFT_NOW` when set.
- <a id="c4"></a>**C4 (check-green-every-step)**: `pnpm check` is green at every step: coverage 70% or better, no default exports, `.js` extensions on imports, unit tests under `src/__tests__/`, every export reachable from `src/index.ts` or the bin.

## Steps

1. [ ] feat(life): parse a shelf life written in days, **done when:** `parseLife('3d')` yields 3 days and `'3'`, `'x'` yield the refusal `a shelf life is written in days, like 3d`, under test
   - seam: `src/life.ts`, `src/__tests__/life.test.ts`
   - model: haiku (one function, fully specified)
2. [ ] feat(item): tell a live item from one past its life, **done when:** an item added at day 0 for 3d is alive at day 2 and not at day 4, and `daysLeft` reads 1 at day 2
   - seam: `src/item.ts`, `src/__tests__/item.test.ts`
   - model: haiku (pure arithmetic on an injected clock)
3. [ ] feat(store): keep the list in one JSON file, **done when:** `save` then `load` through a temp dir returns the same items, and a missing file loads as an empty list
   - seam: `src/store.ts`, `src/__tests__/store.test.ts`
   - model: sonnet (fs and temp dirs)
4. [ ] feat(cli): add an item with sift add, **done when:** `main(['add','milk','--for','3d'], deps)` writes one item with a 3-day life, and `node dist/bin.js add` does the same against `SIFT_FILE`
   - seam: `src/cli.ts`, `src/bin.ts`, `src/index.ts`, `src/__tests__/cli.test.ts`, `package.json`
   - model: sonnet (argv, deps, and the bin wiring)
5. [ ] feat(cli): print what is still alive with bare sift, **done when:** with the clock at day 5 a 3d item is absent and a 10d item prints as `call the dentist   5d left`, oldest first per [D2 (oldest-first)](#d2)
   - seam: `src/sift.ts` (replaces the scaffold's starter), `src/cli.ts`, `src/__tests__/sift.test.ts` (replaces the smoke test)
   - model: sonnet (two modules meet)
6. [ ] feat(cli): give an item the default life when --for is left off, **done when:** `sift add milk` stores the life [Q1 (default-life)](#q1) settles, under test
   - seam: `src/cli.ts`, `src/life.ts`, `src/__tests__/cli.test.ts`
   - model: haiku (one branch)
7. [ ] feat(store): settle what happens to an item that falls off, **done when:** after bare `sift` runs past an item's life the item is gone from the list file and its fate is the one [Q2 (fall-off-fate)](#q2) settles, under test
   - seam: `src/store.ts`, `src/sift.ts`, `src/__tests__/sift.test.ts`
   - model: sonnet (two files change together)

## Build order

## Build ranges

Run step 1 alone to settle what a shelf life looks like, then the core and both commands together, then the two steps the questions wait on.

1. `/plumbbob:build 1`, **stop:** at step 1's pause, approve the shape of a shelf life (`3d`, days only, and the refusal text) before anything leans on it
   - model: haiku
2. `/plumbbob:build 2-5`, **stop:** add three things you own and read `sift` once before the default and the fall-off build on it; settle Q2 here
   - model: sonnet
3. `/plumbbob:build 6-7`, **stop:** fake four days with `SIFT_NOW`, read `sift` again, then `/plumbbob:finish`
   - model: sonnet

## Open questions

- <a id="q1"></a>**Q1 (default-life)**: How long does an item live when `--for` is left off?, *resolve by:* decide
  - *plain:* every `sift add` without a number needs an answer, and the number is the one most people will live with.
  - *lean:* 7 days; a week is the span most things I mean to do fall into.
- <a id="q2"></a>**Q2 (fall-off-fate)**: Is an item that falls off deleted or archived to a second file?, *resolve by:* decide
  - *plain:* deleting is one line and forgets for good; an archive is a second file and a second path to keep.
  - *lean:* deleted, because a list that forgets should forget.
````

The module contracts the small model builds to, all pure, injected, no classes, no default
exports: `src/life.ts` exports `parseLife(text)` returning `{ days }` or `{ error }`;
`src/item.ts` exports `Item` as `{ text, addedAt, days }`, `isAlive(item, now)`, and
`daysLeft(item, now)`; `src/store.ts` exports `load(path)` (a missing file is `[]`) and
`save(path, items)`; `src/sift.ts` exports `sift(items, now)` returning `{ alive, fallen }`
and `render(alive, now)`; `src/cli.ts` exports `main(argv, deps)` with
`deps = { now, file, archive, stdout }`; `src/bin.ts` is the three-line entry reading
`SIFT_FILE`, `SIFT_ARCHIVE`, `SIFT_NOW`, and `process.argv`; `package.json` carries
`"bin": { "sift": "dist/bin.js" }`.

## After the harvest and the hand edits

Steps 1 to 5 landed. `D3` reads 5 days by the hand edit at `B6`; `archive-not-delete` is
the hand edit at `B13`; `weeks-are-days` and step 8 are the harvest at `B11`, and step 8's
done-when is as `B12` sharpened it. The Build order line reads `8, 6, 7` and range 3 is
re-cut to match. The fence numbers them `D4` and `D5` as the course does; the live plan
numbers them as they arrive, the harvest taking the next free D and the pen the one after,
and the harvest's origin names the park's handle. On paste, renumber both lines, their
anchors, and the citations in steps 7 and 8 to the live plan's, and put the handle the lean
table showed in place of `P2`.

````markdown
# sift: a list that forgets

**Phase**: build
**Size:** small
**Scope:** sift

*Source: docs/spec.md*

## Frame

- **Problem:** a to-do list grows until it is a list of guilt; lines I meant to do one week are still there a month later, so the list stops being readable.
- **Smallest thing that solves it:** a command-line tool, `sift`, with two commands: `sift add <text> --for <days>` adds an item with a shelf life in days, and bare `sift` prints what is still alive, oldest first, with the days each has left.
- **Done looks like:** add "return library book" for 3d and "call the dentist" for 10d, run `sift`, see two lines; four days later, run `sift` and see one line, the dentist's.
- **Explicitly NOT doing:** sync, a server, sharing; editing or marking done; recurring items; any unit of shelf life but days.

## Decisions

- <a id="d1"></a>**D1 (days-only-unit)**: a shelf life is `<n>d`, *because* days are the only unit the problem names and one unit keeps the parser one function.
- <a id="d2"></a>**D2 (oldest-first)**: bare `sift` prints alive items oldest first with days left, *because* the item nearest falling off is the one to act on.
- <a id="d3"></a>**D3 (default-life)**: an item with no `--for` lives 5 days, *because* a work week is as long as I leave a thing before I stop seeing it.
- <a id="d4"></a>**D4 (archive-not-delete)**: a fallen item moves to `$SIFT_ARCHIVE`, default `~/.sift.archive.json`, *because* I want to look back once before it is gone (range 2's stop, by hand).
- <a id="d5"></a>**D5 (weeks-are-days)**: `w` is sugar for seven `d`, *because* the store keeps days and the parser stays one function (step 5's boundary, P2).

## Constraints

- <a id="c1"></a>**C1 (no-runtime-deps)**: Node built-ins only; no runtime dependencies.
- <a id="c2"></a>**C2 (one-json-file)**: the list is one JSON file at `$SIFT_FILE`, default `~/.sift.json`.
- <a id="c3"></a>**C3 (pure-core-injected-clock)**: the core is pure functions over a list and a clock passed in; only `src/bin.ts` reads the real clock, the real file, and `process`, and it reads `SIFT_NOW` when set.
- <a id="c4"></a>**C4 (check-green-every-step)**: `pnpm check` is green at every step: coverage 70% or better, no default exports, `.js` extensions on imports, unit tests under `src/__tests__/`, every export reachable from `src/index.ts` or the bin.

## Steps

1. [x] feat(life): parse a shelf life written in days, **done when:** `parseLife('3d')` yields 3 days and `'3'`, `'x'` yield the refusal `a shelf life is written in days, like 3d`, under test
   - seam: `src/life.ts`, `src/__tests__/life.test.ts`
   - model: haiku (one function, fully specified)
2. [x] feat(item): tell a live item from one past its life, **done when:** an item added at day 0 for 3d is alive at day 2 and not at day 4, and `daysLeft` reads 1 at day 2
   - seam: `src/item.ts`, `src/__tests__/item.test.ts`
   - model: haiku (pure arithmetic on an injected clock)
3. [x] feat(store): keep the list in one JSON file, **done when:** `save` then `load` through a temp dir returns the same items, and a missing file loads as an empty list
   - seam: `src/store.ts`, `src/__tests__/store.test.ts`
   - model: sonnet (fs and temp dirs)
4. [x] feat(cli): add an item with sift add, **done when:** `main(['add','milk','--for','3d'], deps)` writes one item with a 3-day life, and `node dist/bin.js add` does the same against `SIFT_FILE`
   - seam: `src/cli.ts`, `src/bin.ts`, `src/index.ts`, `src/__tests__/cli.test.ts`, `package.json`
   - model: sonnet (argv, deps, and the bin wiring)
5. [x] feat(cli): print what is still alive with bare sift, **done when:** with the clock at day 5 a 3d item is absent and a 10d item prints as `call the dentist   5d left`, oldest first per [D2 (oldest-first)](#d2)
   - seam: `src/sift.ts` (replaces the scaffold's starter), `src/cli.ts`, `src/__tests__/sift.test.ts` (replaces the smoke test)
   - model: sonnet (two modules meet)
6. [ ] feat(cli): give an item the default life when --for is left off, **done when:** `sift add milk` stores the 5 days [D3 (default-life)](#d3) settles, under test
   - seam: `src/cli.ts`, `src/life.ts`, `src/__tests__/cli.test.ts`
   - model: haiku (one branch)
7. [ ] feat(store): settle what happens to an item that falls off, **done when:** after bare `sift` runs past an item's life the item is gone from the list file and present in `$SIFT_ARCHIVE` per [D4 (archive-not-delete)](#d4), under test
   - seam: `src/store.ts`, `src/sift.ts`, `src/__tests__/sift.test.ts`
   - model: sonnet (two files change together)
8. [ ] feat(life): accept a shelf life written in weeks, **done when:** `parseLife('2w')` yields 14 days and `parseLife('1w')` yields 7, `'2x'` is still refused, and the refusal reads `a shelf life is written in days or weeks, like 3d or 2w`, per [D5 (weeks-are-days)](#d5), under test
   - seam: `src/life.ts`, `src/__tests__/life.test.ts`
   - model: haiku (one branch in one function)

## Build order

8, 6, 7

## Build ranges

Run step 1 alone to settle what a shelf life looks like, then the core and both commands together, then the two steps the questions wait on.

1. `/plumbbob:build 1`, **stop:** at step 1's pause, approve the shape of a shelf life (`3d`, days only, and the refusal text) before anything leans on it
   - model: haiku
2. `/plumbbob:build 2-5`, **stop:** add three things you own and read `sift` once before the default and the fall-off build on it; settle Q2 here
   - model: sonnet
3. `/plumbbob:build 8,6-7`, **stop:** fake four days with `SIFT_NOW`, read `sift` again, then `/plumbbob:finish`
   - model: sonnet

## Open questions

- <a id="q1"></a>**Q1 (default-life)**: How long does an item live when `--for` is left off?, *resolved:* 2026-11-NN, 5 days
  - *plain:* every `sift add` without a number needs an answer, and the number is the one most people will live with.
  - *lean:* 7 days; a week is the span most things I mean to do fall into.
- <a id="q2"></a>**Q2 (fall-off-fate)**: Is an item that falls off deleted or archived to a second file?, *resolved:* 2026-11-NN, archived to a second file
  - *plain:* deleting is one line and forgets for good; an archive is a second file and a second path to keep.
  - *lean:* deleted, because a list that forgets should forget.
````

Range 2 keeps its `2-5` after the harvest, and the reason is worth saying in the room: a
range that has landed never takes a step, because its call was made and the step would
reopen it ([D109 (ranges-follow-the-order)](../docs/decisions.md#d109)). Step 8 joins the
range it builds ahead of, which is range 3, and the item's command is rewritten in the
order it builds. The stop, the model, and the item's number stay as the plan wrote them.
