---
name: verify
description: "The verify tick: run the check, self-review the diff against intent, validate the step's done-when, pause for your approval, then checkpoint. Executor-agnostic: it reads the diff, not who wrote it."
disable-model-invocation: true
allowed-tools: Read, Bash(plumbbob status:*), Bash(plumbbob handoff:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(plumbbob agent:*), Bash(git diff:*), Bash(git status:*)
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
   Surface every mismatch plainly, and when you cite a Decision or Constraint, carry its
   slug from `intent.md` (`C1 (no-new-deps)`, never a bare `C1`) so each finding reads
   on its own. You are reviewing, not building; do not fix anything.
4. **Validate.** State, yes or no, whether the step's done-when is met, with the evidence.
5. **PAUSE.** Present the check result, the self-review (with any `after`-agent
   findings), and the validation, then
   **stop and wait for the human's explicit approval.** This is the convergence beat;
   the human is the clock. Never checkpoint without it.
   - **Reconcile a drifted subject here, in the open.** The planned title *is* the
     checkpoint subject ([D68 (conventional-subjects)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d68)). If the diff drifted from it (the
     step landed something the title no longer describes), the body pass may propose a
     corrected subject, but it **presents** it at this pause for explicit approval: show
     `planned title → proposed subject`, one line, as part of what the human OKs. This is
     the exception, not the default: with **nothing presented**, the deterministic
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
   <your proportional body — what changed and why, no ceremony>
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
   returns to DESIGN; then run `plumbbob handoff` and relay its boundary block. With the
   step gone from in-flight it renders `step N checkpointed — back at the boundary` and
   points at the **next undone step**, carrying that step's `- model:` recommendation (the
   plan's smallest-model-that-fits call) so the human knows which `/model` to select before
   running `/plumbbob:build` again. This matters most across a context boundary: a fresh window
   inherits the *session's* model, not the plan's suggestion, so this line is what carries
   the recommendation over. The CLI owns the block, so it can't drift from what `plumbbob
   status` reports; no `- model:` line means any model will do. Guidance, never a gate.

## The latch makes the pause real

When this session runs under plumbbob's turn hook, `plumbbob checkpoint` **refuses to
land a step in the same turn it was entered**, and that refusal **is** this pause, not
an error to route around. If the checkpoint prints `checkpoint refused — no human turn
since this step began`, you have reached the pause the hard way: present the diff and
the self-review, **end the turn**, and the human's next message is the tick that lets
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
  and stop; fixing is a new build beat, not part of verify.
- **`after`-agents advise; they never gate**. Their output feeds the
  self-review; checkride gates, the human approves. `blocked` → unblock and re-run;
  `drift` → `/plumbbob:refine` before checkpointing. No code path makes them blocking.
- **A refused checkpoint is the pause, never a workaround.** Under the turn
  hook a same-turn checkpoint is refused *by design*: present the diff, **end the
  turn**, and let the human's next message re-tick it. Never route around it with a raw
  `git commit`; the latch guards the record, not the work.
- **Close with the next model.** After the checkpoint lands, run `plumbbob handoff` and
  relay its block; it cites the completed step and the next undone step, and surfaces that
  next step's `- model:` recommendation when it has one, which is what a fresh context
  window needs to pick the right `/model`. Guidance, never a gate.
