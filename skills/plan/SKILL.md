---
name: plan
description: "Frame a fresh goal and author the whole plan (Frame, Decisions, Constraints, and all Steps) before any code. Three input modes: no arg interviews you; a file path (or @-mention) absorbs a spec; any other text expands your inline intent."
argument-hint: "[spec-path | intent]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob handoff:*), Bash(plumbbob start:*), Bash(plumbbob checkpoint:*), Bash(plumbbob agent list:*)
---

# PlumbBob: plan a goal (the whole-goal move)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/plumbbob:plan` is the **whole-goal** move; it opens a session and gets the deciding out
of your head and onto `intent.md` *before* any code. By default it authors the
**complete plan, including all the Steps**, so the happy path afterward is just
`/plumbbob:build` until done. (Revising a single increment later is the separate `/plumbbob:step`
move; do not confuse the two.)

A model note: this skill **inherits the session model**; nothing pins or switches
it. Planning is where frontier-class judgment pays for itself, so if the session is
running a small model, suggest `/model opus` (or better) before framing: the
human's call, never a gate.

## Three input modes (disambiguated for you; no quotes needed)

Look at the argument the human gave and pick the mode yourself:

1. **No argument → interview.** Walk the human through a short, friendly Q&A to draw
   the plan out of their head (see *The interview* below).
2. **The argument points at a file → absorb the spec.** A bare path, an `@spec.md`
   mention, or a path wrapped in a sentence all count. Strip any leading `@` and probe
   the token with the `Read` tool; if Claude Code has already injected the referenced
   file's contents into your context, treat that as the spec rather than re-fetching.
   Read the spec and distill it into `intent.md`, **retaining enough detail that
   `intent.md` stands on its own**; don't just link to the source. Add a one-line
   provenance (`*Source: <path>*`) and, for anything sizable, a `## Source` appendix
   preserving the original text. Any prose wrapped around the reference (for example "absorb
   @spec.md") is extra intent; fold it in. (If the token isn't a real file, fall to
   mode 3.)
3. **Any other text → expand the inline intent.** Treat the text as the human's
   rough plan, expand it into the full `intent.md`, and ask only about what is
   genuinely ambiguous.

All three modes converge on the **same artifact**: a complete, standalone `intent.md`
an agent can follow with `/plumbbob:build`. The argument only seeds how you get there.

## What this skill does

1. **Scaffold.** If there is no active session, run `plumbbob start "<title>"`
   to create `.plumbbob/` (baseline recorded, session opened). If a session already
   exists, say so and edit the existing `intent.md` rather than starting over.
   - **If `start` warns that the gate sees no code checks**, surface that to the
     human now (while they're still deciding, not at the first refused
     checkpoint) and offer to set the `check` key in `.plumbbob/settings.json`
     (for example `"check": "npm test"`) before any step is built.
2. **Frame** (`.plumbbob/intent.md`), with the human: the **Problem** in plain words,
   the **smallest thing** that solves it, what **done looks like**, and what you are
   **explicitly NOT doing**. This is the human's convergence: propose wording, but
   the human decides every line.
3. **Decisions & Constraints.** Record the settled calls (one line each, with the
   *because*) and the hard rules the build must honor. **Anchor and slug each at birth**:
   mint a two- or three-word slug where the item is born and give it an anchor for
   references to land on (`- <a id="d1"></a>**D1 (default-waves)**: …`,
   `- <a id="c1"></a>**C1 (no-new-deps)**: …`), then cite it everywhere else in the file
   as `[D4 (default-waves)](#d4)`, carrying that slug verbatim: **never a bare
   `D4`/`C6`/`Q2` reference, and never a linkless one**: one link to the definition,
   one glance at the gloss, so a cold reader never has to hunt the number down.
   An unresolved hole goes to **Open questions**, never guessed into a Decision,
   and it goes in the expanded form the template shows: an anchored, slugged opener
   (the hole as a question, `- <a id="q1"></a>**Q1 (default-waves)**: …`, so
   `[Q1 (default-waves)](#q1)` has somewhere to land), a `*plain:*` sub-line (what's at
   stake, in plain words, enough to judge it cold), then a `*lean:*` sub-line (your
   proposed resolution: one answer to react to, not a menu), so the human settles it in
   one pass without a round-trip. (A tiny, obvious question may stay one bare line; the
   sub-lines earn their keep only when a human decision genuinely waits on it.)
4. **Author the Steps.** Write the **full build plan** under `## Steps` (each step a
   small, verifiable increment) in the exact format the parser reads:

   ```markdown
   1. [ ] feat(scope): <title>, **done when:** <criterion, ideally a test or check result>
      - seam: `<file>`, `<file>`
      - model: <optional; smallest that can carry it, with the one-phrase why>
   ```

   Every step needs a **done-when** `/plumbbob:verify` can check and a **seam** (the exact
   paths it touches). Later steps may be fuzzier than the first (that's fine); they get
   sharpened just-in-time when you reach them with `/plumbbob:step`. Keep each small enough to
   verify in one review pass.

   **The title *is* the commit subject; author it as one**
   ([D68 (conventional-subjects)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d68)): write each
   `<title>` as a plain, single-line Conventional-Commit subject,
   `type(scope): description`, and it lands in `git log` verbatim (its breaking `!`
   honored); this is how each step lands a *real* `feat`/`fix`/`chore` in the history.
   Keep load-bearing detail (file paths, module names) in `seam` and `done-when`; it is
   **never jammed into the title**, which has to read as plain English and as a clean
   subject at once. Aim for **≤72 characters** (GitHub's subject convention): soft
   guidance you eyeball at plan time, no lint, no gate.

   **Set the build's default scope, then let steps override it**: fill the
   `**Scope:**` header once with a short feature-level name (the catch-all every step
   inherits) and give a step its own `(scope)` when it touches a distinct code area
   (`plan`, `commitmsg`, `docs`). A step's `(scope)` names the *code area*; the header
   names the *feature*, so scopes stay consistent and greppable across builds. Scope
   resolves title-scope → `**Scope:**` default → build slug → bare, and type resolves
   title-type → `feat`, so a scopeless plain title still yields a clean
   `feat(<slug>): <title>` unchanged.

   **Recommend a model per step where the signal is clear** *(optional)*: the
   `- model:` sub-line names the **smallest model that can carry the step**, with the
   one-phrase why; the human buys capability only where the step needs it. E.g.
   `model: sonnet (mechanical, fully specified by the done-when)` for rote edits;
   `model: opus (strong-assertion test authoring)` where the tests do the thinking;
   `model: fable (subtle cross-cutting design)` for judgment-heavy or creative work.
   It is advisory metadata for the human (`/plumbbob:status` surfaces it before each build),
   never a gate, and nothing switches models automatically. Write it plain (no
   backticks) and omit it when any model would do.
5. **Offer harness bindings** *(optional)*. If the build will lean on
   user-authored agents, author `harness.json` in the build folder (beside `intent.md`)
   and review it at the **same plan pause**, alongside the steps; bindings are
   plan-adjacent configuration, so they converge with the plan. It binds agents to a
   step's three lifecycle slots, `before` (context in), `build` (the diff), and `after`
   (advisory review), with an optional prose `note`; a `defaults` block binds every
   step. Run `plumbbob agent list` to see what's resolvable, per step:

   ```json
   {
     "contract": 1,
     "defaults": { "after": ["reviewer"] },
     "steps": { "3": { "before": ["context-loader"], "note": "watch the auth seam" } }
   }
   ```

   Keep it **bindings + prose only, never a conditional**: the file says *which*
   agent, not *when*; the host model reads each manifest's `when` prose and a step's
   `note` and decides when to run one mid-build. Skip the file entirely when no step
   uses an agent; the loop runs identically without it. The plan commit picks it
   up automatically (it lives in the build folder).
6. **Commit the plan.** Once the human approves the frame and steps, run
   `plumbbob checkpoint --plan` to commit the scaffold on its own: subject
   `chore(<scope>): plan` (with a `plumbbob plan` body marker), only `.plumbbob/builds/<slug>/`,
   a `plan <sha>` line in
   `checkpoints`. This keeps the first step's diff clean, so history reads
   baseline → plan → steps. Pass a proportional `--body` (the single-quoted stdin
   heredoc) when the rationale is worth carrying; skip it for a small plan. Do this
   only on the human's approval; the plan is their convergence.
   - **The plan pause is a decision turn.** Present the framed plan for the human's call,
     then give it the cold read (**§ The cold read**), write the result into
     `.plumbbob/detail.md`, and relay `plumbbob handoff --plan`'s block whole: the CLI
     renders the your-call block with the moves that apply before anything is recorded and
     prints your recommendation last (the decision tier of the
     [turn anatomy](https://github.com/robmclarty/plumbbob/blob/main/docs/presentation.md)),
     so the moves are relayed, never hand-composed. *looks good* marks the plan decided and
     starts `/plumbbob:build` at the first undone step; a message that asks (`expand 2`, or
     any question) is answered from the detail file or `intent.md` and changes nothing; a
     message that directs is what to sharpen, cheap now, before any code. The revert move
     vanishes there on its own: nothing has landed to wind back.
   - **The plan commit is latched too.** Once the turn ledger exists, `checkpoint
     --plan` refuses to land in the same turn `start` stamped it: present the plan,
     **end the turn**, and the human's approving message is the tick that lets it
     commit on the next run; the refusal *is* the plan pause. Never route around it with a
     raw `git commit`. (One documented seam: the very first plan of a brand-new
     session runs `start` *before* the turn hook has ever ticked, so that single
     commit predates the ledger and stays guidance-governed; it lands without a
     refusal.)
   - **The plan commit prints its own close.** `plumbbob checkpoint --plan` emits the
     whole boundary ending: `**Plan**: committed (<sha>)`, any advisory, and the pointer at
     the step the build starts on. Relay that block whole and run no second command; the
     plan-pause card above is the one place `handoff` is still called, because no verb has
     run yet there.
   - **Say what the commit publishes.** The close-out line names the tracked folder:
     `.plumbbob/builds/<slug>/` now rides this branch into the PR, so teammates will
     see the plan and build record in review. In the same breath, offer the way out:
     a repo that won't track a tool folder can restart with `plumbbob start --local`
     (a fully untracked sidecar) before any steps are built.
     - **Record-only variant.** When the repo's own `.gitignore` excludes `.plumbbob/`,
       the folder can't ride the branch; `start` flags this up front, and the plan
       commit lands *record-only*: an empty commit whose message carries the plan
       (the `--body` earns its keep here), the files staying untracked. Say that
       instead: the rationale is published in `git log`, not the folder, so pass a
       fuller `--body` than you otherwise would, since the message is the whole record.
7. **Offer to stress-test it.** Suggest `/plumbbob:refine` to attack the frame for holes (or
   to repair the plan as it drifts). Optional, the human's call.

## The cold read

The plan pause ends on your recommendation, and the recommendation is an estimate made
with fresh eyes, not a re-reading of your own plan. Before you relay the card, give the
framed plan one bounded adversarial pass under a fixed lens, the pass `/plumbbob:refine`'s
attack mode makes, but without its writing: surface, never append. Edit nothing, add no
Open questions, and keep it to one screen of reading. The lens:

- an ambiguity a builder would have to guess through;
- an edge case or a hidden assumption no Decision settles;
- a collision with the existing code (read the files the seams name);
- a done-when no test or check can measure, or a seam that names a file that does not
  exist or misses one that must change;
- a step too large to review in one pass, or a Decision with no *because*.

Write what you found into `.plumbbob/detail.md`, overwriting whatever a past session
left, the findings first and the recommendation last:

```markdown
# Detail · Plan · <the title>

## 1 <the first hole: one sentence, naming where it sits in intent.md>
<what it is, and what closing it would take>

## 2 ...

## Recommendation

<The move.> <The reason, one or two sentences.>
```

The recommendation takes one of two shapes. A sound plan gets `Approve it.` and what the
read checked and found sound. A plan with a hole gets `Sharpen <the one worst hole> first.`
and why it matters; when the read found more than one, say how many sit behind `expand`
and name `/plumbbob:refine` as the move that writes them up as Open questions, with their
plain and lean sub-lines, for the human to settle. Three findings at most; the rest is
refine's. `plumbbob handoff --plan` prints the label and your recommendation as the turn's
last text, "expand 2" opens `## 2`, and `checkpoint --plan` records the read beneath the
plan's line in the build-log's `## Log`, the build's first entry. The cold read is the tip of refine: it makes the
full attack discoverable at the moment it would pay, and lets a sound plan skip it. Refine
is where the real adversary looks; this is an estimate, and it says so by staying short.

## The interview (mode 1)

Make it easy and non-intrusive:

- **Triage size first.** A tiny change earns a 3-line Frame and one Step, fast: never
  ceremony on a one-liner. Scale the questions to the work.
- **Propose, don't interrogate.** Offer concrete suggestions the human can **accept as-is
  without typing** ("done-when: the 6th request in 60s returns 429, good?"), while
  taking arbitrary detail when they want to give it, including pointers to other files.
- **Let them double back.** They will revise as the picture sharpens; that's expected.
  They can also edit `intent.md` by hand at any time, or call `/plumbbob:refine` to repair it.

## The hard contracts

- **Deciding before code.** `/plumbbob:plan` writes `intent.md` only, never source.
- **The human converges.** You surface options and draft wording; the human picks.
  An unresolved hole is an Open question, not a guessed Decision.
- **Stands on its own.** Whatever the input mode, the finished `intent.md` carries
  enough detail to be followed without the chat or the external source.
- **Size to the work.** A small change fills Frame + a couple of Decisions + a step or
  two and stops; ceremony on a one-liner is the failure mode, not thoroughness.
