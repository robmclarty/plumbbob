# sift: the destination spec

This is the target, not a script: the vibing at `B3` should land within a sentence of it, and
a spec that differs in wording but keeps these seven headings and "The pieces" is the same
spec. If the conversation runs past its budget, the fence below is pasted into `docs/spec.md`
whole, and `P4` carries on from there.

````markdown
# sift: a list that forgets

## Problem

A to-do list grows until it is a list of guilt. Most of the lines on mine are things I meant to do one week and did not, and a month later they are still there, so the list stops being readable. I want a list where every item has a shelf life and quietly falls off when it is past.

## The smallest thing

A command-line tool, `sift`, with two commands. `sift add <text> --for <days>` adds an item with a shelf life written in days, as `3d`. Bare `sift` prints the items still alive, oldest first, with the days each has left, and the rest fall off. No edit, no done, no priorities.

## Done looks like

```sh
sift add "return library book" --for 3d
sift add "call the dentist" --for 10d
sift
```

```text
return library book   3d left
call the dentist     10d left
```

Four days later, `sift` prints one line, the dentist's.

## Not doing

- No sync, no server, no sharing.
- No editing and no marking done: an item is alive until it is not.
- No recurring items.
- One unit of shelf life: days. A day is the smallest thing worth forgetting.

## The pieces

A parser for a shelf life, a test for whether an item is alive at a given time, a JSON file store, the `add` command, the bare `sift` command, and two calls the questions below decide: the default life and the fate of a fallen item.

## Rules of the build

- Node built-ins only; no runtime dependencies.
- The list is one JSON file at `$SIFT_FILE`, default `~/.sift.json`.
- The core is pure functions over a list and a clock passed in. Only `src/bin.ts` reads the real clock, the real file and `process`; it reads `SIFT_NOW` when set, so a day can be faked.
- `pnpm check` is green at every step: coverage 70% or better, no default exports, `.js` extensions on imports, unit tests under `src/__tests__/`, every export reachable from `src/index.ts` or the bin.

## Still open

- How long does an item live when `--for` is left off? Lean: 7 days.
- Is an item that falls off deleted or archived to a second file? Lean: deleted, because a list that forgets should forget.
````

Two things in it are load-bearing and the rest is taste. "The pieces" is what makes a
seven-step plan the obvious plan without writing the plan for the model. And the `2w` line is
nowhere in it, so the surprise lands at range 2's stop and not before.
