---
name: step
description: "Revise the next increment just-in-time: sharpen the next undone step against what's now true, or (with input) re-cut, split, or add a step. Empty input runs an automatic sharpen. One at a time; the human approves."
argument-hint: "[what-changed]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob order:*), Bash(plumbbob agent list:*)
---

# PlumbBob: revise the next step (the single-increment move)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/plumbbob:plan` authors the **whole** step list up front, so `/plumbbob:step` is the
**just-in-time revision** move: it keeps the *next* undone step honest against what the
build has actually taught you, right before you `/plumbbob:build` it. (Framing the whole goal
is the separate `/plumbbob:plan` move.) It can also add or re-cut a step when scope genuinely
grew, but its everyday job is to sharpen, not to invent.

## Two ways to run it

- **`/plumbbob:step` (no input) → automatic sharpen.** Re-examine the next undone step
  against the completed code, the Decisions, the Constraints, and the build-log, then
  make the obvious revisions to its **done-when** and **seam** so it matches reality:
  for example a file moved, a decision narrowed the scope, an earlier step already did part of
  it. This is the zero-effort "keep my next step in sync" move: if the human does
  nothing else, the next step stays current.
- **`/plumbbob:step <what changed>` → directed revision.** Take the human's input and propose
  the matching change: tighten the done-when, adjust the seam, split the step in two, or
  add a new increment the plan was missing.

## What this skill does

1. **Read the plan and the reality.** Read `intent.md`'s Frame, Decisions, Constraints,
   and the steps already done, plus the next undone step, to see what it *should* now be.
2. **Propose the revision** (or the new/split step): a one-line **title**, a **done-when**
   `/plumbbob:verify` can validate, and a **seam** (exact paths, or a `dir/` grant). Keep it
   small enough to verify in one review pass. Show the before/after so the human can see
   what you changed and why. Re-check the optional `- model:` recommendation too:
   a step that sharpened into rote work can drop to a smaller model; one that grew subtle
   earns a frontier one. Advisory, plain text (no backticks), never a gate.
3. **Get the human's OK**, then write it into `## Steps` in the standard format:
   `N. [ ] <title>, **done when:** <criterion>` with a `- seam:` sub-line. Keep the
   sharpened `<title>` a plain, single-line Conventional-Commit subject,
   `type(scope): description`; it lands in `git log` verbatim, so as the step tightens
   keep load-bearing detail (file paths, module names) in `seam` and `done-when`,
   **never jammed into the title**. A sharpened step carries its own `(scope)`
   when it touches a distinct code area, one that **overrides the build-default**
   `**Scope:**` header; drop the scope and it falls back to that default → build slug →
   bare, and the type to `feat` ([D68 (conventional-subjects)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d68)). Aim for a soft
   ≤72 chars, no gate. Revise the existing step in place; only append when you are
   genuinely adding an increment. An appended step keeps the next free number for life;
   when it has to land before an existing undone step, place it by sequence, never by
   renumbering: shell `plumbbob order 7 8 5` with every undone step in the sequence to
   build them, and the `## Build order` line it writes is what `status`, a bare
   `/plumbbob:build`, and the card's Next Up then follow.

   **Keep the build ranges true.** When the plan carries `## Build ranges`, a step you add
   goes into a range: the one it builds with (`/plumbbob:build 6-9` becomes `6-10`, or
   `6-9,14` for a step numbered past the next range), or a bare range of its own when it
   brings a call the human has to make before it lands
   ([D92 (build-ranges)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d92)).
   Either way it is a range still to come, never a range that has landed, since that
   range's call was made and the step would reopen it. A new range takes the next free
   item number, and no item is renumbered, because the stop card's stamp, the detail
   file's header, and `plumbbob harvest` find a landed range by its number.
   A step the build order places between two of a range's steps belongs to that range. A
   split or re-cut that moves where a call falls moves the stop with it, so re-cut any
   range the edit breaks, and show the range edit in the same before/after, since it
   changes where the human will be asked. The edit lands on the item's command, the
   range's definition, not on the command the card names: the card names `/plumbbob:run`
   for the range, and the turn hook mints a run's grant from the plan as the human types
   the run, so the next run lands the range as you re-cut it, while a run already typed
   keeps the grant it minted
   ([D96 (plan-names-the-grant)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d96)).
   Then read `plumbbob status`: its ranges block carries a `⚠` row for any range still
   broken, and none once every undone step sits in exactly one range.
4. **Revise the step's harness bindings if they drifted too** *(optional)*. If the
   build carries a `harness.json` (beside `intent.md`) and the reality that moved the
   step also changed which agents it wants, sharpen that step's slot bindings
   (`before`/`build`/`after`) and `note` at the same time; this is the just-in-time
   counterpart to `/plumbbob:plan`'s plan-time binding. `plumbbob agent list` shows what's
   resolvable. Same rule as the plan move: bindings + prose only, never a conditional
  . Leave it untouched when the step's agents are still right, or when the build
   uses none.

## The hard contracts

- **One verifiable increment.** Each step carries a done-when `/plumbbob:verify` can check
  and a seam small enough to review in one pass.
- **Edit `## Steps` only**, in the standard format `status` and `build` parse, plus the
  `## Build ranges` items a step edit moves: never the Roadmap, never loose prose. A done
  step (`[x]`) is history; do not rewrite it. The `## Build order` line is
  `plumbbob order`'s to write, never yours to edit.
- **Cite the plan's own numbers in the linked form.** A `D`/`C`/`Q` you write into a
  step's done-when, seam, or notes reads `[D4 (default-waves)](#d4)`; the slug travels
  with the number, and the link lands on the `<a id="d4">` anchor minted where the item
  was born. Never a bare `D4`; if the item you want to cite has no anchor yet, that is a
  `/plumbbob:refine` repair, not something to invent here.
- **The human approves the revision** before it lands. You propose; they decide.
