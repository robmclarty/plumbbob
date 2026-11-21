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
     (D130 (step-mirror)).
   - **Spike-as-step.** If the step's title opens with `spike:` / `Spike:`, the increment
     *is* the experiment: resolving a fork the plan couldn't settle on paper. After
     entering it, run `plumbbob spike report "<slug>"` (the CLI scaffolds a
     `spike-NN-<slug>.md` in the build folder, stamped `via: step <n>`), then work the
     experiment and record your **Findings** and **Verdict** there. A recorded verdict is
     what the step's proof should check; the report, not just the code, is the
     deliverable. This is the same artifact `/plumbbob:spike` produces for a mid-build fork
     (D70 (spike-reports)).
3. **Read the plan.** Read the step's **proof**, its **seam**, and the
   **Decisions** and **Constraints** in `intent.md`. Build to *that*; the deciding
   already happened, off the chat.
   - **Read the step's `like` files before the first edit.** A `- like:` line names the
     files to copy the pattern from (the dashboard shows it as a `like:` row under the
     seam). Read each one whole and write the step the way they are written: their
     naming, their error handling, their test layout. A like file is an exemplar, not
     part of the seam, so do not edit it; one that does not exist is no blocker, so say
     so in the Summary and build from the nearest neighbor
     (D156 (like-is-advice)).
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
   (D168 (asked-is-made)): make it even when it reaches past the step or the
   seam, take the lean you would recommend where it leaves a choice open and name it, and
   name any path it touched outside the seam, so they can redirect. Recommend parking it
   as a step of its own when you think it belongs there, but never park it in place of
   making it. An open question
   the human sets aside to wait on other work is deferred, not parked: run
   `plumbbob defer Q3 "<what settles it>"`, because the card counts questions by the
   marker on each opener and never by the park list
   (D123 (defer-records)).
   When `plumbbob park` warns that a question it names still counts as one to answer,
   defer it if the human said the work will settle it, and leave it to them otherwise. When
   the build folder's `reach.json` holds an answer for this step, a file it lists is the
   ripple the plan could have expected: touch it when the step needs it, without asking
   first, and the `plumb` row counts it as `reach`
   (D155 (reach-is-computed)).
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
5. **Verify, through to the pause.** Run the verify tick as `/plumbbob:verify` does:
   `plumbbob check` → self-review the diff against the proof, the Decisions and the
   Constraints (one structured read, citing each by its slug from `intent.md`,
   `C1 (no-new-deps)`, never a bare `C1`) → validate → **PAUSE for the human's
   approval** → only on approval, `plumbbob checkpoint <n> --body <<'BODY' … BODY`.
   - **A red check.** Read `.check/summary.json` and the failing slot's raw output under
     `.check/`; narrow the loop with `plumbbob check --bail --only <slots>` while you fix
     it (the checkpoint still runs everything). A red `plan` slot alone means `plan.json`
     is behind `intent.md`: run `plumbbob export` and check again, and treat it as red
     only when the export refuses.
   - **The checkpoint runs the proof.** When the `- proof:` line opens on a command, the
     checkpoint runs it once the gate is green, and a non-zero exit refuses and records
     nothing: read `.check/proof.txt` and fix the code, never the proof line. Run the
     command yourself while you build.
   - **The body.** Proportional to the step: a line for a trivial change, a short
     paragraph for a meatier one. The CLI writes the subject and the build-log entry;
     omit `--body` for its proof, seam and diffstat fallback. `--body` reads stdin only:
     redirect the heredoc into it (`--body <<'BODY'`), never `--body "$(cat <<'BODY'…)"`,
     and end that line at `<<'BODY'` with no `2>&1`, which Claude Code's permission
     checker cannot analyze. Never bump the version or the changelog; that is the
     human's `/version`.
   - **A drifted subject is reconciled at the pause, never silently.** The planned title
     is the checkpoint subject (D68 (conventional-subjects)). If the diff drifted from it,
     present `planned title → proposed subject` in one line, and only on approval add
     `-m "<subject>"` to the checkpoint. A quiet `-m` swap is the agent-authored subject
     D68 (conventional-subjects) refuses.
   - **The `plan` row is the CLI's.** When `intent.md` changed during the step, handoff
     adds a `plan` row and a Plan Edit part; write no row for it
     (D162 (plan-edit-shown)).
   - **Bound `after`-agents** fold into the self-review as advisory input; see
     `agents.md`.

   **Render the pause: write the file, run handoff, paste, end the turn.** The pause is
   one block you author none of in chat: your judgment goes into `.plumbbob/detail.md`,
   `plumbbob handoff` renders the turn from it and its own measurements, and you paste the
   output with nothing before or after it. The latch refuses a checkpoint in the turn
   that built the step, and that refusal is the pause working: the human's next message
   is what lets it land.

   *Write the detail file.* Overwrite `.plumbbob/detail.md` for this step:

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

   - **The three rows are yours**, contiguous under the rule; `check`, `seam`, `diff` and
     `spent` are the CLI's. Each opens on a word from the closed set (`met`, `not met`,
     `drift`; `honored`, `none exercised`, `bent`, `drift`; `all honored`, `bent`,
     `drift`). A green row is its word or count; a red one names its one offender in a
     short clause, inside the fence's 80 columns, with further items on indented `-`
     lines and evidence on an indented `→` line. A row that cannot apply vanishes. When
     `reach.json` answers this step, the `seam` row prints as `plumb`
     (`seam 3 · reach 1 · out 1`), and only an `out` file is a stray
     (D155 (reach-is-computed)).
   - **The card prints the Summary and the Recommendation**; the `## <n>` sections stay in
     the file, which `expand 2` opens and the record keeps. Five at most, each titled with
     one sentence and one move. A judgment or flag (a stray, a bent decision, a doubt
     about the proof) is one of those sections; a caveat the human must see before they
     reply goes in the Summary or the Recommendation, never in text around the card,
     since the relay check catches an annotated card and the recovery prints it twice.
   - **The Recommendation is the last section**: the move as its own sentence, then the
     reason. Never hard-wrap the Summary or the Recommendation, and never type the
     `**Recommendation**:` label. A shell command for the human gets its own fenced `sh`
     block after a colon, never a place inside a sentence.
   - **Links and citations.** Write a relative link from `.plumbbob/`, where the file
     lives (`builds/<slug>/intent.md`); the record re-aims it. Cite the plan's items by
     slug in plain text (`D5 (no-link-no-reconnect)`), since the plan carries no anchors.

   **A bare range's pause is its stop.** When the dashboard lists this step as a bare
   range (its row marked `▸`), the Recommendation speaks to the call its `stop:` line
   names, not to the diff alone.

   *Paste the turn.* Run `plumbbob handoff` once and paste its output whole, verbatim, at
   top level, trailing blank line included, never inside a fence of your own, then end
   the turn. The `check` row is the verdict's one home, a narrowed run's skipped slots
   included, so never restate it. If handoff prints its one-line reminder where the card
   belongs (you ran it earlier this turn), run `plumbbob handoff --full` and paste that.
   The notice checkride's Stop hook appends is not yours to relay. Relayed CLI strings
   keep their em-dashes; your own lines never use one (D78 (em-dash-ban)).

   *Then answer the reply in your own words, after every tool call.* The card shows once
   (D110 (reply-after-the-card)), and every later turn at this pause is your reply:
   - A message that **asks** ("expand 2", "why did the seam row flag that?") is answered
     from the detail file, `git diff`, or the build log, never from recall.
   - A message that **directs** is made (D168 (asked-is-made)): make the change, even
     past the step or the seam, run the check, and say what moved, the lean you took
     where it left a choice open, and any path outside the seam. Recommend a step of its
     own when you think it belongs there. Write the detail file again when the change
     moves what the card said. An idea raised without asking for it now is a park, with
     no source edit for it.
   - Nothing lands until the human approves. Either way, every tool call comes before
     your reply and none after it (D121 (reply-after-the-tools)): run `plumbbob handoff`
     last among them. At a shown pause it prints one line,
     `**Next Up**: Back to **Step N** on <Model> - <title>`; end the turn on it, whole.
     The turn is your tool calls, then your reply, then that line, and nothing after it,
     since a client that folds text written before a tool call (Zed) would hide the reply.
   - The card comes back only when the human asks to see it (`show the pause`): run
     `plumbbob handoff --full` and paste its output whole, with nothing around it. Never
     run `--full` to read the card yourself; read the detail file and `plumbbob status`.

   **Then hand off with the next model.** On approval, `plumbbob checkpoint` prints the
   whole boundary ending: the checkpoint line, any advisory, and the state table with the
   Verdict, a Stop row when the landing completes a range, and Next Up carrying the next
   step's `- model:` line. Relay it whole, table included, with nothing around it and no
   second command. A later turn at the boundary is a reply in the same order: tool calls,
   `plumbbob handoff` last (it prints Next Up's one line), your reply, then that line.

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
  (D163 (plan-edits-grant)).
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
  latch ignores it; D67 (auto-not-a-grant)); ask the human to type
  `/plumbbob:build --auto` again instead.**
