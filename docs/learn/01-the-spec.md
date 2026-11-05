# The Spec Comes Before the Plan

`/plumbbob:plan` absorbs a spec, so the quality of the plan is set by a file you write
before the model has seen anything. This lesson writes that file for `sift`: one page
under seven short headings, each a decision the plan will inherit. You type it or
paste it into `docs/spec.md`, run the docs checks on it, and commit it on its own.
About twenty minutes.

## Say the Problem in a Paragraph

Create `docs/spec.md` and open it on the problem. The fences in this lesson, joined
in order, are the whole file.

```markdown
# sift: a list that forgets

## Problem

A to-do list grows until it is a list of guilt. Most of the lines on mine are things I meant to do one week and did not, and a month later they are still there, so the list stops being readable. I want a list where every item has a shelf life and quietly falls off when it is past.
```

A problem is one paragraph in plain words, before any solution, and it names what
the tool is for. The plan's Frame opens on this paragraph, and every later argument
about scope comes back to it: a feature that does not make the list more readable is
not in the problem.

## Name the Smallest Thing

```markdown
## The smallest thing

A command-line tool, `sift`, with two commands. `sift add <text> --for <days>` adds an item with a shelf life written in days, as `3d`. Bare `sift` prints the items still alive, oldest first, with the days each has left, and the rest fall off. No edit, no done, no priorities.
```

Two commands and three refusals, in four sentences. The smallest thing is the
hardest section to write, because every instinct adds a third command, and the last
sentence is where you hold the line.

## Write What Done Looks Like

````markdown
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
````

A sample session is the one part of a spec a model cannot misread. It fixes the flag
name, the unit, the column layout, and the sort, and it hands step 5's test its
expected output before step 5 exists. Every fence in the spec carries a language,
`sh` or `text`, because the scaffold's docs check lints `docs/` and a bare fence
fails it.

## Write What You Are Not Doing

```markdown
## Not doing

- No sync, no server, no sharing.
- No editing and no marking done: an item is alive until it is not.
- No recurring items.
- One unit of shelf life: days. A day is the smallest thing worth forgetting.

## The pieces

A parser for a shelf life, a test for whether an item is alive at a given time, a JSON file store, the `add` command, the bare `sift` command, and two calls the questions below decide: the default life and the fate of a fallen item.
```

What you are not doing is the section a builder crosses first, because each line is
a feature someone would have added without asking. Writing the line costs nothing
now and buys a refusal later. The pieces are the one place the spec talks about
structure: five nouns and two calls, in build order, which is seven steps without
being told how.

## Rules of the Build and Still Open

```markdown
## Rules of the build

- Node built-ins only; no runtime dependencies.
- The list is one JSON file at `$SIFT_FILE`, default `~/.sift.json`.
- The core is pure functions over a list and a clock passed in. Only `src/bin.ts` reads the real clock, the real file and `process`; it reads `SIFT_NOW` when set, so a day can be faked.
- `pnpm check` is green at every step: coverage 70% or better, no default exports, `.js` extensions on imports, unit tests under `src/__tests__/`, every export reachable from `src/index.ts` or the bin.

## Still open

- How long does an item live when `--for` is left off? Lean: 7 days.
- Is an item that falls off deleted or archived to a second file? Lean: deleted, because a list that forgets should forget.
```

The rules become the plan's Constraints, and every pause measures the diff against
them, so each one is checkable: a dependency count, a file path, a function shape, a
green check. The last rule names what the scaffold's gate enforces (the coverage
threshold, the ast-grep rules, the dead-export check), so a small model meets the
gate's rules in the spec before it meets them as a red check.

The two questions stay questions. Each carries a lean, one answer to react to, so
settling it in lesson 2 costs one reply; a question without a lean costs a round
trip.

The headings here are deliberately not the names of `intent.md`'s sections (Frame,
Decisions, Constraints, Open questions). When the plan absorbs a spec it appends the
original under `## Source`, and a heading repeated inside one file fails
markdownlint's duplicate-heading rule. Lesson 0 kept `.plumbbob/` out of this repo's
lint, but a config that reads it would fail the plan on your spec's headings.

## Check It and Commit It

```sh
pnpm check --only docs,spell,links
git add docs/spec.md
git commit -qm "docs: add the spec"
git status --short
```

Three checks, green in about two seconds, and the status line empty. The spec gets a
commit of its own so the plan commit in lesson 2 holds nothing but the plan, and
history reads scaffold, spec, plan, steps.

## With Your Agent

This is the lesson's one model call, and it is optional. Ask:

> Read docs/spec.md and give it a cold read: three holes a builder would have to guess through, one sentence each. Don't write anything, don't fix anything. Then stop.

Check that it names the default life and the fate of a fallen item, the two holes you
left open on purpose. A third hole is fine to hear and fine to leave; if it points at
something you did not plant, hold that thought, because a later lesson is about what
happens when the build runs into one.

## Try It

1. Delete the `## Done looks like` section and ask for the cold read again; watch
   what the agent invents for the output format. Then put the section back:

   ```sh
   git checkout -- docs/spec.md
   ```

2. Add a fifth rule under `## Rules of the build`, `no process.exit outside
   src/bin.ts`, and run the three checks again: a rule is a line, and the gate reads
   it like any other. Then put the file back, so the plan in lesson 2 inherits four
   Constraints and every readout reads `4 of 4`:

   ```sh
   git checkout -- docs/spec.md
   ```

## Remember

- A spec is decisions, not code: a paragraph of problem, a sample session, and a
  list of refusals.
- What you are not doing is the line a builder will cross first, so write it down.
- A question with a lean costs one reply; a question without one costs a round trip.

[← Set Up Your Workbench](./00-set-up.md) · [The Plan Is a File →](./02-the-plan.md)
