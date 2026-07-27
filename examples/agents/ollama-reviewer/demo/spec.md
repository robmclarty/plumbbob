# wordwrap — a text-wrapping utility

A demo spec for the `ollama-reviewer` example agent. Feed it to `/plumbbob:plan` (it is a
spec file, so plan absorbs it into `intent.md`) from a scratch repo that has this
agent installed, then run `/plumbbob:build` and watch a local model review every step at the
verify pause. The task itself is deliberately small: three steps, plain JavaScript,
zero dependencies — the point is the loop, not the wrapping.

## Problem

There is no `wordwrap` utility in this repo: given a paragraph of text and a column
width, produce lines that fit. The smallest thing that solves it is a single pure
function plus a thin CLI over stdin.

## Done looks like

`wrap(text, width)` greedily breaks lines at the last space that fits, hard-splits
words longer than the width, preserves existing newlines, and is covered by
`node --test`. A `bin/wrap.js` CLI wraps stdin at the width given as its argument.

## Explicitly NOT doing

- No hyphenation, no locale-aware breaking, no ANSI-escape awareness.
- No published package, no build step — plain files runnable with `node`.

## Decisions

- D1: greedy line breaking over optimal (Knuth-Plass) — *because* it is what `fmt` and
  `fold` do and the simplest thing that satisfies done-when.
- D2: pure function first, CLI last — *because* the CLI is a thin shell once `wrap()`
  is trustworthy.

## Constraints

- C1: no runtime dependencies — *because* the demo must run anywhere Node runs.
- C2: `node:test` only — *because* the point is the loop, not a test framework.

## Steps

1. [ ] Greedy `wrap(text, width)` with tests — **done when:** `wrap()` breaks lines at
   the last space that fits and `node --test` passes
   - seam: `src/wrap.js`, `test/wrap.test.js`
2. [ ] Edge cases: overlong words and existing newlines — **done when:** words longer
   than `width` hard-split at the boundary, existing newlines are preserved, and the
   new tests pass
   - seam: `src/wrap.js`, `test/wrap.test.js`
3. [ ] `bin/wrap.js` CLI over stdin — **done when:** `echo "some long text" | node
   bin/wrap.js 20` prints wrapped lines
   - seam: `bin/wrap.js`

## Harness

This build uses the `ollama-reviewer` agent (a local-model reviewer — see its README)
as an advisory second opinion at every verify pause. When authoring the plan, write
`harness.json` beside `intent.md` binding it as the after-slot default:

```json
{ "contract": 1, "defaults": { "after": ["ollama-reviewer"] } }
```

Run `plumbbob agent list` first to confirm the agent resolves (it must be installed at
`.plumbbob/agents/ollama-reviewer/` or `~/.plumbbob/agents/ollama-reviewer/`, with
`npm install` run inside it); if it does not resolve, say so at the plan pause instead
of binding it.
