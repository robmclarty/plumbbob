---
name: build
description: "The default engine: read the next planned step from intent, implement it (its proof, seam, Decisions, Constraints), then verify it through to the approval pause. Swappable: build by hand/vibed/another harness and run /plumbbob:verify instead. `--auto` self-approves and chains to done; a step range like `1-3`, or a list like `20,5-9`, self-approves exactly the steps it names, in build order, then stops."
argument-hint: "[step-number | step-range | step-list] [--auto] [--plan-edits]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob build:*), Bash(plumbbob handoff:*), Bash(plumbbob check:*), Bash(plumbbob checkpoint:*), Bash(plumbbob park:*), Bash(plumbbob defer:*), Bash(plumbbob agent:*), Bash(plumbbob spike:*), Bash(git diff:*), Bash(plumbbob export:*)
---

# PlumbBob: build a step (the default engine)

Current session state (injected when this skill runs): !`plumbbob status --invoked "$ARGUMENTS" 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

**The invocation outranks the injected state.** The dashboard above is computed from
the plan; the arguments you were invoked with are the human's explicit ask. When they
name a step, build that step, whatever any `next →` line suggests. The CLI already
repoints the dashboard at an explicit step number when it can see one (`--invoked`),
so a surviving mismatch means the invocation text never reached it, and the typed
number still wins.

This is the **bundled executor**: the default engine, not the only one. It is
**swappable**: you can implement any step by hand, in a vibe session, or with
another harness and go straight to `/plumbbob:verify` instead; plumbbob does not care how
the diff appeared. When you do run it, it reads the plan, writes the step, and
carries straight through to the verify pause.

Since `/plumbbob:plan` lays down the whole step list up front, the happy path is to run
`/plumbbob:build` once per step until done: each run builds the next undone step in build order and stops
at the pause for your approval. **Running `/plumbbob:build` again is itself the clock tick.**

A model note: this skill **inherits the session model**; nothing pins or switches
it. If the step you're about to build carries a `- model:` recommendation that
differs from the model you're running as, say so before implementing; the human can
switch with `/model` and rerun to honor it, or wave you on. Advisory, never a gate.

## Read on demand

Three parts of this skill sit beside it, in files you read only when the build needs them.
Read each whole, from this skill's base directory (`<base directory>/auto.md`), before the
step it applies to, and never from memory:

- **`auto.md`** when you were invoked with `--auto`, a step range or a step list, or by
  `/plumbbob:run`: who the clock is, the halt list, and how a range is walked.
- **`agents.md`** when the dashboard shows a `harness bindings:` block: the before, build
  and after slots, and how an envelope is routed.
- **`orchestration.md`** when the dashboard shows the line
  `orchestration  host: a step may be built by sub-agents, inside its seam`: how the step's
  slices go to sub-agents and come back as one step.

Without its cue a file does not apply, so leave it unread.

## What this skill does, in order

1. **Pick the step.** Use the number you were invoked with (for example `/plumbbob:build 4`), or,
   if you were given a range like `/plumbbob:build 1-3` or a list like `/plumbbob:build 20,5-9`,
   start at its first undone step in build order, the one the dashboard above marks
   `← requested`, and land only the steps it names, by the range rules in `auto.md` (below).
   With no argument, don't resolve the next step yourself; the CLI does: bare `plumbbob build`
   (step 2) enters the next undone step in build order (the `## Build order` line when the
   plan has one, else the numbering) and refuses with a `/plumbbob:step` nudge when every
   step is checkpointed.
2. **Enter the step.** Run `plumbbob build <n>`, or bare `plumbbob build` to enter the
   next undone step (records the in-flight STEP + SEAM so `/plumbbob:status` shows the step in
   flight; the seam is awareness, not a lock). When it refuses with `no step entered` because
   a stop card is waiting for its reply, relay the refusal whole and end the turn: the card's
   reply is the human's, and no step is built until it records.
   - **Mirror the steps on the host's task list.** When your tools include a task list
     (`TaskCreate` and `TaskUpdate`, or `TodoWrite`), run `plumbbob status --json` once
     the step is entered and read its `tasks`: the steps of the range in play, in build
     order, each with a `subject` the CLI wrote and a `status`. Under a run, add
     `--run "<the run's arguments>"` so the list is the run's range. Put one entry on the
     list per task, its `subject` verbatim, and update an entry already there from an
     earlier turn rather than adding it twice. An entry is in progress while its step is
     in flight and complete once its checkpoint lands. Every task call comes before
     `plumbbob handoff`, and none after the turn's closing text. The list is a mirror for
     the eye: never read the build's state back from it, and with no such tool, skip it
     ([D130 (step-mirror)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d130)).
   - **Spike-as-step.** If the step's title opens with `spike:` / `Spike:`, the increment
     *is* the experiment: resolving a fork the plan couldn't settle on paper. After
     entering it, run `plumbbob spike report "<slug>"` (the CLI scaffolds a
     `spike-NN-<slug>.md` in the build folder, stamped `via: step <n>`), then work the
     experiment and record your **Findings** and **Verdict** there. A recorded verdict is
     what the step's proof should check; the report, not just the code, is the
     deliverable. This is the same artifact `/plumbbob:spike` produces for a mid-build fork
     ([D70 (spike-reports)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d70)).
3. **Read the plan.** Read the step's **proof**, its **seam**, and the
   **Decisions** and **Constraints** in `intent.md`. Build to *that*; the deciding
   already happened, off the chat.
   - **Read the step's `like` files before the first edit.** A `- like:` line names the
     files to copy the pattern from (the dashboard shows it as a `like:` row under the
     seam). Read each one whole and write the step the way they are written: their
     naming, their error handling, their test layout. A like file is an exemplar, not
     part of the seam, so do not edit it; one that does not exist is no blocker, so say
     so in the Summary and build from the nearest neighbor
     ([D156 (like-is-advice)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d156)).
   - **Bound `before`-agents load context first.** If `plumbbob status` shows a
     `harness bindings:` block, this build binds agents; read `agents.md` (below)
     and load their context in before you write. No bindings, no harness: just build.
4. **Implement** the step, and only that step, staying within the declared seam. A
   new problem or "ooh what if" that you notice mid-build is a park, **not** an edit:
   capture it by running `plumbbob park "<one tidy line>"`: **saying "let's defer
   that" writes nothing; only the park line in the build log is a capture.** When the
   *human* raises an idea without asking you to do it now ("we should someday…", a side
   thought), their message **is** the approval to park it; capture it right away, say
   what you parked, and stay on the step. **When the human asks you to make a change, make
   it.** Their explicit request is the decision, and plumbbob is a guide, not a police
   ([D168 (asked-is-made)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d168)): make it even when it reaches past the step or the
   seam, take the lean you would recommend where it leaves a choice open and name it, and
   name any path it touched outside the seam, so they can redirect. Recommend parking it
   as a step of its own when you think it belongs there, but never park it in place of
   making it. An open question
   the human sets aside to wait on other work is deferred, not parked: run
   `plumbbob defer Q3 "<what settles it>"`, because the card counts questions by the
   marker on each opener and never by the park list
   ([D123 (defer-records)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d123)).
   When `plumbbob park` warns that a question it names still counts as one to answer,
   defer it if the human said the work will settle it, and leave it to them otherwise. When
   the build folder's `reach.json` holds an answer for this step, a file it lists is the
   ripple the plan could have expected: touch it when the step needs it, without asking
   first, and the `plumb` row counts it as `reach`
   ([D155 (reach-is-computed)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d155)).
   If you genuinely cannot finish without touching a file outside both the seam and the
   reach (or outside the seam, when the step has no stored reach), that is scope drift:
   surface it to the human rather than sprawling.
   - **Bound agents can shape the build.** If `plumbbob status` shows a
     `harness bindings:` block, a `build`-slot agent may author the diff, a `when`-cue may
     fire an agent mid-build, and a non-`done` envelope routes by its status; see
     `agents.md` (below).
   - **The host's sub-agents can build it.** If `plumbbob status` shows an
     `orchestration  host` line, a step with slices to hand out is built by sub-agents;
     read `orchestration.md` (below). Without the line, you build it.
5. **Verify, through to the pause.** Run the verify tick exactly as `/plumbbob:verify`
   does: `plumbbob check` (on red, read `.check/summary.json` and the failing slot's
   raw output under `.check/` for the actual diagnostics; while iterating on a fix,
   narrow the loop with `plumbbob check --bail --only <slots>`; the checkpoint gate
   still runs everything; a red check named `plan` alone means `plan.json` is behind
   `intent.md`, so run `plumbbob export` and check again, and treat it as red only when
   the export refuses and names its findings) → self-review the diff against the proof, the Decisions,
   and the Constraints (a single structured read; cite each with its slug from
   `intent.md`: `C1 (no-new-deps)`, never a bare `C1`) → validate → **PAUSE
   for the human's approval** → only on approval, checkpoint with
   `plumbbob checkpoint <n> --body <<'BODY' … BODY`: a commit body **proportional to the
   step** (a line for a trivial change, a short paragraph for a meatier one; no TIL scan,
   no separate commit skill). The CLI owns the subject and appends this step to the
   build-log's `## Log`, so the history writes itself; you only supply the body (or omit
   `--body` for the deterministic proof + seam + diffstat fallback). Do **not** bump
   the version or changelog; that is the human's `/version` call.
   - **The checkpoint runs the proof.** When the step's `- proof:` line opens on a command
     in backticks, `plumbbob checkpoint` runs it at the repo root once the gate is green.
     A command that exits non-zero refuses the checkpoint and records nothing, the same as
     a red check: read `.check/proof.txt`, fix the code, and never edit the proof line to
     get past it. Run the command yourself while you build, so the `proof` row you write
     is one the checkpoint will confirm.
   - **The `plan` row is the CLI's.** `plumbbob handoff` measures `intent.md` against
     the plan as last approved. When it was edited during the step, the Readout gains a
     `plan` row counting the lines and a Plan Edit part beneath it shows the diff. It is
     the CLI's to show, so write no row for it
     ([D162 (plan-edit-shown)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d162)).
   - **`--body` reads stdin only.** Redirect the heredoc *into* the command (`--body
     <<'BODY'`). Do **not** pass it as an argument value (`--body "$(cat <<'BODY'…)"`):
     `--body` ignores an argument and always reads stdin. Under an agent harness that
     stdin is a socket, and `--body` now refuses rather than blocking on one; the
     refusal names this exact heredoc form. End that line at `<<'BODY'`, with no `2>&1`
     after it: Claude Code's permission checker cannot analyze the extra redirect, so it
     blocks the command or stops to ask instead of letting this skill's allowance cover it.
   - **A drifted subject is reconciled at the pause, never silently.** The planned
     title *is* the checkpoint subject ([D68 (conventional-subjects)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d68)). If the diff drifted
     from it, **present** a corrected subject at the pause (`planned title → proposed
     subject`, one line) for explicit approval, and only on approval land it by adding
     `-m "<subject>"` to the checkpoint. Present nothing and the deterministic
     title-derived subject lands untouched: the reconcile is the human-approved exception,
     not a quiet `-m` swap (which is the agent-authored subject [D68 (conventional-subjects)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d68)
     refuses).
   - **If `plumbbob status` shows a `harness bindings:` block**, fold any bound
     `after`-agents into that self-review as advisory input; see
     `agents.md`.

   **The latch makes this pause real.** On the default (non-`--auto`) path you
   build the step and reach the pause *in one turn*, so under plumbbob's turn hook the
   checkpoint at the end of that turn is **refused** ("no human turn since this step
   began"), and that refusal **is** the pause working as designed. Do exactly what the
   pause asks: write the detail file, run `plumbbob handoff`, paste its block, and **end
   the turn there**. The human's next
   message (their approval) is the human turn that lets the checkpoint land: on that turn
   you run `plumbbob checkpoint <n>` (now allowed) and **stop at the boundary**. Landing
   the checkpoint is its own deliberate beat (the thing approval triggers), never a side
   effect of starting the next step, and `/plumbbob:build` only ever starts the *next*
   step. **Never route around a refusal with a raw `git commit`**; the work plane stays
   free, but the *record* is latched on purpose.

   **Render the pause: write the file, run handoff, paste.** A build pause is a decision
   turn, and the
   [turn anatomy](https://github.com/robmclarty/plumbbob/blob/main/docs/presentation.md)
   fixes it as one block. You author none of it in the chat. Your judgment goes into
   `.plumbbob/detail.md`; `plumbbob handoff` renders the whole turn from that file and its
   own measurements; you paste its output and write nothing before or after it. The rule is
   positional on purpose: with the relay as the turn's whole text, no line is left for
   "here is the pause", for reading the check verdict back in prose, or for a closing
   courtesy. Each fact appears once, in its part.

   *Write the detail file.* Before you call `plumbbob handoff`, overwrite
   `.plumbbob/detail.md` for this step; never let a past step's detail linger. It is the
   wire handoff parses, and it is the only path by which your judgment reaches the turn:

   ```markdown
   # Detail · Step <N> · <the step title>

   ── recap · step <N> of <M> ──
   proof        met
   decisions    honored: D1 (some-slug), D2 (another-slug)
   constraints  all honored

   ## Summary

   <the outcome, not the activity: one sentence when one will do, a short
   paragraph when the step needs explaining>

   ## 1 <the first highlight: one sentence, one move>

   <the full story: what moved, why, what was tried and dropped>

   ## 2 ...

   ## Recommendation

   <The move.> <The reason, one or two sentences.>
   ```

   The three rows under the header rule are yours, and only those three; `check`, `seam`,
   `diff`, and `spent` are measured by the CLI, and a row you wrote for them would be
   overwritten. When the build folder's `reach.json` holds an answer for this step, the
   `seam` row prints as `plumb` (`seam 3 · reach 1 · out 1`): a changed file is in the
   seam, in the reach the plan could have expected, or outside both, and only an `out`
   file is a stray
   ([D155 (reach-is-computed)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d155)).
   Keep the rows contiguous (the first blank line ends them). Each opens with a
   verdict word from the closed set in the turn anatomy (`met`, `not met`, `drift`;
   `honored`, `none exercised`, `bent`, `drift`; `all honored`, `bent`, `drift`); a cited
   decision or constraint carries its slug (`C1 (no-new-deps)`, never a bare `C1`); a row
   that cannot apply vanishes. A green row collapses to its word or its count and a red one
   names the one offender in a short clause, which is what keeps the whole row inside the
   fence's 80 columns (13 of label, 67 of value); two or more items break onto indented
   continuation lines opening with `-`, and a red row's evidence onto an indented `→` line.

   The `## Summary` lead opens the card: handoff prints it behind the `**Summary**:` label.
   The `## <n>` sections stay in the detail file, where `expand 2` opens `## 2` and the
   build log's record keeps them; the card prints none of them and closes instead on a
   `[more details](…)` link to the file, which handoff writes, so you type no path. Five
   sections at most, each titled with one sentence and one move, plain English first, a
   path in backticks only when the name itself is the news. A judgment or a flag (a stray
   the seam row will name, or the `plumb` row count as `out`, a decision you had to bend, a doubt about the proof) is one
   of those sections, and the card carries it where it bears on the call: a bent row's `→`
   line points at it, and your recommendation names it when it changes the move. It is
   never a paragraph of its own. A caveat the human must see before they reply goes in the
   Summary or the recommendation, the two parts the card prints, and never in text you add
   around the card: a card you annotate or rewrite is caught by the relay check after it
   has shown, and since shown text cannot be taken back, the recovery prints the card twice. The recommendation is the last section: the move you would take as its own
   sentence, closed by a period, then the reason as a capitalized sentence or two. The lead
   and the recommendation are flowing prose and handoff unwraps both to the renderer's
   width, so never hard-wrap them; handoff also prepends the bold `**Recommendation**:`
   label, which you never type. A shell command you want the human to run never rides
   inside a sentence: end the sentence on a colon and give the command a fenced `sh` block
   of its own, one command to a line, which handoff keeps line for line. A slash command
   or a path stays in backticks in the sentence. `checkpoint` records this file beneath the step's dated
   line in the build-log's `## Log` and then truncates it, so the detail lands in the
   tracked ledger rather than piling up on disk. Write a relative link from `.plumbbob/`, where
   the file lives (`builds/<slug>/intent.md#d5`); the record re-aims it at the build folder.
   A decision cited by its slug in plain text (`D5 (no-link-no-reconnect)`) needs no link at all.

   **A bare range's pause is its stop.** When the injected dashboard's ranges block lists
   this step as a bare range (`/plumbbob:build 5`, its row marked `▸`), the plan reserved a
   call for this pause, and the `stop:` line beneath the row names it. The recommendation
   speaks to that call: the move you would take on the plan's question, and why, rather
   than a verdict on the diff alone.

   *Paste the turn.* Run `plumbbob handoff` and paste its output whole, verbatim, at top
   level, trailing blank line included, then end the turn. Never nest it inside a fence of
   your own; it carries fences of its own and they cannot nest. It prints the Summary, the
   Readout fence (its measured `check`, `seam`, `diff`, and `spent` rows folded with your
   three, the changed files listed beneath `diff`), a `diff` fence when the change is 20
   lines or fewer, an Evidence list when a bound agent saved something to look at, Your
   Call, the state table (the Verdict folded worst-of from the same
   rows, the Now row naming the step in flight, Next Up with the next range on its second
   line, and the Order and Parked rows when they apply), your recommendation, and the `more details` link last. Run it
   once: a second run at the same pause prints the one-line reminder instead of the card,
   so if that line comes back where the card belongs (you ran handoff earlier in this
   turn), run `plumbbob handoff --full` and paste that. The gate verdict's one home is that `check`
   row: no standalone verdict line exists, and you never restate the verdict in prose. A
   narrowed run names the slots it skipped there (`· without test`), and that named
   narrowing is the whole disclosure. The notice checkride's Stop hook appends after your
   turn is not yours to relay or repeat; the trailing blank line you kept is what lands it
   on its own line. Relayed CLI strings keep their em-dashes; your own lines never use
   one, the write-versus-relay line of
   [D78 (em-dash-ban)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d78).

   *Then answer the reply in your own words, after every tool call.* The card shows once
   ([D110 (reply-after-the-card)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d110)):
   every later turn at this pause is your reply, closed by one line. A message that
   **asks** ("expand 2", "what does that mean?", "why did the seam row flag that?") is an
   expand: answer it from the detail file, from `git diff`, or from the build-log's
   `## Log` for an older step, never from recall. A message that **directs** is needs-work:
   make the change, run the check, and say what moved and what the check found; when the
   change moves what the card said (a judgment row, the Summary, the recommendation), write
   the detail file again so the record matches what lands. Nothing lands until the human
   says `looks good`. Either way, every tool call comes before your reply and none after
   it ([D121 (reply-after-the-tools)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d121)):
   read, edit, run the check, write the detail file, and run `plumbbob handoff` last among
   them. At a pause whose card has shown it prints one line,
   `**Next Up**: Back to **Step N** on <Model> - <title>`, whatever changed since. Keep
   that line, then write your reply, and end the turn on the line, whole and verbatim. The
   turn is your tool calls, then your reply, then that line, and nothing after it: a
   client that folds text written before a tool call (Zed, through the agent bridge) shows
   the line and hides a reply written above the call. The CLI picks the form, never you:
   paste whichever one it prints, and never retype the card.

   The card comes back one way: the human asks to see it (`show the pause`, or any wording
   of it). Then run `plumbbob handoff --full` and paste its output whole, with nothing
   written around it. Never run `--full` to read the card for yourself, after a compaction
   or in a fresh session; what it prints is the turn's ending, and the relay check holds a
   turn that does not close on it. Read the detail file and `plumbbob status` instead.

   A change the human asks for at the pause is made, as one asked for mid-build is
   ([D168 (asked-is-made)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d168)): make it, name the lean you took where it left a
   choice open and any path outside the seam, and write the detail file again. Recommend a
   step of its own in the reply when you think it belongs there. An idea the human raises
   without asking for it now is a park, with no source edit for it.

   **Then hand off with the next model.** `plumbbob checkpoint` prints the whole boundary
   ending itself: `**Checkpoint**: Step N complete (<sha>)`, any advisory (a staged path
   outside the seam is the common one), and the state table: the Verdict the step earned,
   the Stop row when this landing completes a range (`| Stop | **Range 3** landed - <its
   stop> |`, the reason the build stops here), Next Up, and the rows beneath it. Relay that
   block whole, the table with the rest (the relay check holds a boundary that dropped a
   row), run no second command, and write nothing around it. A later turn at this boundary
   is your reply, in the same order as at a pause: a `plumbbob handoff` there prints Next
   Up's one line, since the boundary has shown, so run it last among your tool calls, then
   write your reply and end on that line, with no tool call after it. It is the
   orientation tier (no Your Call block, no recommendation), and its Next Up points at the
   next undone step carrying that step's `- model:` recommendation (the plan's
   smallest-model-that-fits call) so the human knows which `/model` to select before
   running `/plumbbob:build` again. It is what carries the plan's suggestion across a fresh
   context window, which inherits the session model, not the plan's. No `- model:` line
   means any model will do. Guidance, never a gate.

## The hard contracts

- **Swappable, never required.** The loop works without this skill; `/plumbbob:verify`
  checkpoints a hand-built or vibed diff just the same.
- **Build the decided step, not a new one.** Implement what `intent.md` settled. A
  new idea mid-build is captured with `plumbbob park`, not an edit: a promise to
  defer writes nothing; the park line does. You never edit `intent.md` during a step. If
  you find you must, stop and say so. The one exception is the human's to grant: when
  they typed `--plan-edits` with the range, the run or `--auto`, you may sharpen a step
  still ahead (its proof, its seam, a note, a step split in two) as the build learns, and
  the checkpoint lands it and lists it at the next card. It is never yours to add or to
  ask for mid-run, it does not reach the Decisions, the Constraints, or a step that has
  landed (an edit there still halts), and it permits sharpening the plan, not swapping the
  goal
  ([D163 (plan-edits-grant)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d163)).
- **Default ends at the pause.** Implement → verify → wait for approval; never
  checkpoint without it. Only an explicit `--auto` or a step range lets the agent approve
  in your place, and it still halts on a red check (one `plumbbob export` cannot clear),
  a red proof, a checkpoint refused for a plan edit, or any mismatch; a range
  also stops
  once its top step lands.
- **Agents feed the beat; they never advance it**. `before` loads context,
  `build` writes the diff, `after` is advisory; none can checkpoint, flip a step, or
  chain. `blocked` → unblock and re-run; `drift` → `/plumbbob:refine`. You are still the one
  who verifies and (bar `--auto`) the human is still the clock. `agents.md` has the mechanics.
- **A refused checkpoint is the pause, not an error.** Under plumbbob's turn
  hook a same-turn `checkpoint` is refused by design: write the file, run `plumbbob
  handoff`, paste its block, **end the turn there**; the human's approval on their next
  turn is what lets you land
  it, and landing it is a deliberate beat, not a side effect of the next `/plumbbob:build`.
  Never route around it with a raw `git commit`. An explicit `/plumbbob:build --auto` or a typed
  step range in the human's own prompt are the only self-approvals; **never write `auto`
  into a settings file yourself to unlock a checkpoint. A grant you mint is no grant (the
  latch ignores it; [D67 (auto-not-a-grant)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d67)); ask the human to type
  `/plumbbob:build --auto` again instead.**
- **Close with the next model.** When a step lands, `plumbbob checkpoint` prints the whole
  boundary ending; relay it with nothing written around it and no second command. It cites
  the completed step and the next undone step, and names that next step's `- model:`
  recommendation if it has one, which is what a fresh context window needs to pick the
  right `/model` before the next run. Guidance, never a gate.
