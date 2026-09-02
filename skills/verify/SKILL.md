---
name: verify
description: "The verify tick: run the check, self-review the diff against intent, validate the step's done-when, pause for your approval, then checkpoint. Executor-agnostic: it reads the diff, not who wrote it."
disable-model-invocation: true
allowed-tools: Read, Write, Bash(plumbbob status:*), Bash(plumbbob handoff:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(plumbbob agent:*), Bash(git diff:*), Bash(git status:*)
---

# PlumbBob: verify a step (the tick)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

This is the **tick**: the one beat where the human is the clock. Whatever produced
the current diff (`/plumbbob:build`, your own hands, a vibe session, another harness),
this skill verifies it the same way: **it reads the diff, not the author**
([D3 (author-blind-executor)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d3)).

## What this skill does, in order

1. **Check.** Run `plumbbob check` (the heavy gate: checkride unless the repo
   configures a `check` override). If it comes back **red**, stop here: the gate
   names the failing slots and where each tool's raw output landed: read
   `.check/summary.json`, then the failing slot's own file (`.check/<slot>.json` or
   `.check/<slot>.stdout.txt`) for the actual diagnostics instead of scraping
   scrollback. Report what failed and do **not** pause for approval; there is
   nothing to approve yet. The human fixes it and re-invokes. (Exit 2 means the gate
   itself broke: a harness problem to surface, not a code failure.)
2. **Run any bound `after`-agents** *(optional)*. If the build's `harness.json`
   binds agents to this step's `after` slot, run `plumbbob agent run --step <n> --mode
   after`. Their envelopes are **advisory input to the self-review, never a gate**;
   `plumbbob check` already gated in step 1, and an `after`-agent that could fail a step
   would be the old lock back in another form. Fold a `done` envelope's
   `summary`/`body` into the review below; route a non-`done` one by its status. A
   `blocked` agent couldn't finish: surface its `notes`, let the human unblock, re-run.
   A `drift` agent found the plan no longer matches reality: stop and send the human to
   `/plumbbob:refine` to repair the plan before checkpointing. No binding, or no harness, is a
   clean no-op.
3. **Self-review** *(a single structured read)*. Read `git diff` and
   `.plumbbob/intent.md`, then in one pass check the diff against:
   - the current step's **done-when** criterion: is it actually met?
   - the **Decisions**: does anything contradict a settled call?
   - the **Constraints**: are any violated?
   - any **`after`-agent findings** from step 2: advisory, weigh them, don't defer to them.
   A mismatch surfaces in exactly two places: as the failing word in its recap row, and
   as one highlight with its full story in a detail section, never as a freeform
   paragraph. When you cite a Decision or Constraint, carry its slug from `intent.md`
   (`C1 (no-new-deps)`, never a bare `C1`) so each finding reads on its own. You are
   reviewing, not building; do not fix anything.
4. **Validate.** Decide, yes or no, whether the step's done-when is met. That verdict and
   its evidence become the recap's `done-when` row, stated there and nowhere else.
5. **PAUSE.** Write the file, run handoff, paste, then **stop and wait for the human's
   explicit approval**. This is the convergence beat; the human is the clock. Never
   checkpoint without it. A verify pause is a decision turn, and the
   [turn anatomy](https://github.com/robmclarty/plumbbob/blob/main/docs/presentation.md)
   fixes it as one block. You author none of it in the chat. Your judgment goes into
   `.plumbbob/detail.md`; `plumbbob handoff` renders the whole turn from that file and its
   own measurements; you paste its output and write nothing before or after it. The rule
   is positional on purpose: with the relay as the turn's whole text, no line is left for
   "here is the pause", for reading the check verdict back in prose, or for a closing
   courtesy. Each fact appears once, in its part.

   *Write the detail file.* Before you call `plumbbob handoff`, overwrite
   `.plumbbob/detail.md`. It is the wire handoff parses, and it is the only path by which
   the judgment you formed in steps 2 through 4 reaches the turn:

   ```markdown
   # Detail · Step <N> · <the step title>

   ── recap · step <N> of <M> ──
   done-when    met
   decisions    honored: D1 (some-slug), D2 (another-slug)
   constraints  all honored

   ## Summary

   <what the diff does, not the activity: one sentence when one will do, a
   short paragraph when the step needs explaining>

   ## 1 <the first highlight: one sentence, one move>
   <the full story: what moved, why, what was tried and dropped>

   ## 2 ...

   ## Recommendation

   <The move.> <The reason, one or two sentences.>
   ```

   The three rows under the header rule are yours, and only those three; `check`, `seam`,
   `diff`, and `spent` are measured by the CLI, and a row you wrote for them would be
   overwritten. Keep the rows contiguous (the first blank line ends them). Each opens with
   a verdict word from the closed set in the turn anatomy (`met`, `not met`, `drift`;
   `honored`, `none exercised`, `bent`, `drift`; `all honored`, `bent`, `drift`); a cited
   decision or constraint carries its slug (`C1 (no-new-deps)`, never a bare `C1`); a row
   that cannot apply vanishes. A green row collapses to its word or its count and a red one
   names the one offender in a short clause, which is what keeps the whole row inside the
   fence's 80 columns (13 of label, 67 of value); two or more items break onto indented
   continuation lines opening with `-`, and a red row's evidence onto an indented `→` line.

   The `## Summary` lead and the `## <n>` section titles are the turn's opening block:
   handoff prints the lead behind the `**Summary**:` label, appends the `(details: …)`
   bracket, and renders the titles as the numbered highlights, so you type neither the path
   nor the list. Five highlights at most, each one move in plain English, drawn from the
   self-review. The numbers are handles: "expand 2" opens `## 2`, so every highlight has a
   section behind it. A judgment or a flag (a stray the seam row will name, a decision the
   diff bent, a doubt about the done-when) is one of those highlights, never a paragraph of
   its own. The recommendation is the last section: the move you would take as its own
   sentence, closed by a period, then the reason as a capitalized sentence or two. The lead
   and the recommendation are flowing prose and handoff unwraps both to the renderer's
   width, so never hard-wrap them; handoff also prepends the bold `**Recommendation**:`
   label, which you never type. This is the **one** file `/plumbbob:verify` writes, and it
   is turn presentation, never the diff under review; the author-blind contract below still
   holds. `checkpoint` folds this file into the commit body and then truncates it (the
   detail plane in the
   [turn anatomy](https://github.com/robmclarty/plumbbob/blob/main/docs/presentation.md)).

   *Paste the turn.* Run `plumbbob handoff` and paste its output whole, verbatim, at top
   level, trailing blank line included, then end the turn. Never nest it inside a fence of
   your own; it carries fences of its own and they cannot nest. It prints the Summary and
   its highlights, the Readout fence (its measured `check`, `seam`, `diff`, and `spent`
   rows folded with your three), a `diff` fence when the change is 20 lines or fewer, the
   Verdict folded worst-of from the same rows, Next Up, Your Call, and your recommendation
   last. At the pause the check row reads green, since a red one stopped you back at step
   1. The gate verdict's one home is that row: no standalone verdict line exists, and you
   never restate the verdict in prose. A narrowed run names the slots it skipped there
   (`· without test`), and that named narrowing is the whole disclosure. The notice
   checkride's Stop hook appends after your turn is not yours to relay or repeat; the
   trailing blank line you kept is what lands it on its own line. Relayed CLI strings keep
   their em-dashes; your own lines never use one, the write-versus-relay line of
   [D78 (em-dash-ban)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d78).

   *Then read the reply as an ask or a direction.* A message that **asks** ("expand 2",
   "what does that mean?", "why did the seam row flag that?") is an expand: answer it from the detail file, from
   `git diff`, or from `git show`, never from recall, then run `plumbbob handoff` again and
   paste it. The step is still in flight, so it renders the same pause, and the Your Call
   block stays the CLI's to render rather than yours to retype. A message that **directs**
   is needs-work: take it as what to change, and nothing lands until the human says
   `looks good`.

   - **Reconcile a drifted subject here, in the open.** The planned title *is* the
     checkpoint subject ([D68 (conventional-subjects)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d68)). If the diff drifted from it (the
     step landed something the title no longer describes), the body pass may propose a
     corrected subject, but it **presents** it at this pause for explicit approval: one
     highlight reading `planned title → proposed subject`, part of what the human OKs.
     That highlight is a `## <n>` section title in the detail file like any other.
     This is the exception, not the default: with **nothing presented**, the deterministic
     title-derived subject lands untouched. A silent `-m` swap is exactly the
     agent-authored subject [D68 (conventional-subjects)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d68) refuses, so a reconcile is
     *only ever* the visible, approved kind.
6. **Checkpoint** *(only after approval)*. Run `plumbbob checkpoint`: it makes the WIP
   commit, records the SHA, flips the step to done, appends the step to the build-log's
   `## Log`, and returns to DESIGN. The CLI owns the commit **subject** (a Conventional
   `<type>(<scope>): <description>` composed from the step title and the build slug) and
   leads the **body** with a `plumbbob step N` marker; you own the rest of the **body**.
   Compose a body *proportional to the step* (a one-liner for a trivial change, a short
   paragraph on the what/why for a meatier one) and pass it on stdin:

   ```bash
   plumbbob checkpoint <n> --body <<'BODY'
   <your proportional body: what changed and why, no ceremony>
   BODY
   ```

   Redirect the heredoc *into* the command (`--body <<'BODY'`). Do **not** pass it as
   an argument value (`--body "$(cat <<'BODY'…)"`): `--body` ignores an argument and
   always reads stdin. Under an agent harness that stdin is a socket, and `--body` now
   refuses rather than blocking on one; the refusal names this exact heredoc form.

   Do **not** run a TIL scan or reach for a separate commit skill; the body is yours to
   write in one breath. Omit `--body` entirely and the CLI writes a deterministic body
   (done-when + seam + diffstat) on its own. Either way, do **not** bump the version or
   touch the changelog; that is the human's `/version` call. And if step 5 surfaced a
   drifted subject the human approved, land *that* subject by adding `-m "<subject>"`,
   overriding the title-derived default for this one commit; unpresented, the CLI's
   deterministic subject stands.
7. **Hand off with the next model** *(once the checkpoint lands)*. `plumbbob checkpoint`
   prints `step N checkpointed (<sha>)` and returns to DESIGN; then
   run `plumbbob handoff` and relay its card. The turn is those two outputs and nothing
   written around them. With the step gone from in-flight the card drops to its
   orientation-tier form (the Verdict and Next Up only; no Your Call block, no
   recommendation)
   and points at the **next undone step**, carrying that step's `- model:` recommendation
   (the plan's smallest-model-that-fits call) so the human knows which `/model` to select
   before running `/plumbbob:build` again. This matters most across a context boundary: a fresh
   window inherits the *session's* model, not the plan's suggestion, so this line is what
   carries the recommendation over. The CLI owns the card, so it can't drift from what
   `plumbbob status` reports; no `- model:` line means any model will do. Guidance, never a
   gate.

## The latch makes the pause real

When this session runs under plumbbob's turn hook, `plumbbob checkpoint` **refuses to
land a step in the same turn it was entered**, and that refusal **is** this pause, not
an error to route around. If the checkpoint prints `checkpoint refused — no human turn
since this step began`, you have reached the pause the hard way: write the file, run
`plumbbob handoff`, paste its block as step 5 says, **end the turn there**, and the
human's next message is the tick that lets
the checkpoint land when you run it again. **Never reach for a raw `git commit` to force the
land**; that forges the very record the latch exists to keep honest, and the
commit-ask hook asks the human about it anyway. The refusal is a healthy latch doing its
job on the *record* while the *work* plane stays free; a `/plumbbob:build --auto` or
a typed step range in the human's own prompt is the only self-approval; **never write
`auto` into a settings file to unlock the land; the latch ignores a model-minted grant
([D67 (auto-not-a-grant)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d67)), so ask the human to type `/plumbbob:build --auto` again
instead.**

## The hard contracts

- **Never skip the pause.** Check → self-review → validate, then wait. Approval is
  the only thing that triggers the checkpoint.
- **Read the diff, not the author**. Verify identically whether the code was
  built by `/plumbbob:build`, by hand, vibed, or by another harness.
- **Red means stop, not pause.** A failing check is not an approval decision; report
  it and end your turn.
- **You review; you do not build.** If the self-review finds a problem, surface it
  and stop; fixing is a new build beat, not part of verify. The one file the tick writes
  is `.plumbbob/detail.md`, the turn's presentation; it never edits the diff under review.
- **`after`-agents advise; they never gate**. Their output feeds the
  self-review; checkride gates, the human approves. `blocked` → unblock and re-run;
  `drift` → `/plumbbob:refine` before checkpointing. No code path makes them blocking.
- **A refused checkpoint is the pause, never a workaround.** Under the turn
  hook a same-turn checkpoint is refused *by design*: write the file, run `plumbbob
  handoff`, paste its block, **end the turn there**, and let the human's next message
  re-tick it. Never route around it with a
  raw `git commit`; the latch guards the record, not the work.
- **Close with the next model.** After the checkpoint lands, run `plumbbob handoff` and
  relay its card with nothing written around it; it cites the completed step and the next
  undone step, and surfaces that next step's `- model:` recommendation when it has one,
  which is what a fresh context window needs to pick the right `/model`. Guidance, never a
  gate.
