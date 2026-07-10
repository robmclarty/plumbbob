---
name: pb-plan
description: "Frame a fresh goal and author the whole plan — Frame, Decisions, Constraints, and all Steps — before any code. Three input modes: no arg interviews you; a file path absorbs a spec; any other text expands your inline intent."
argument-hint: "[spec-path | intent]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob start:*), Bash(plumbbob checkpoint:*), Bash(plumbbob agent list:*)
---

# PlumbBob — plan a goal (the whole-goal move)

Current session state (injected when this skill runs): !`plumbbob status 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/pb-plan` is the **whole-goal** move — it opens a session and gets the deciding out
of your head and onto `intent.md` *before* any code. By default it authors the
**complete plan, including all the Steps**, so the happy path afterward is just
`/pb-build` until done. (Revising a single increment later is the separate `/pb-step`
move; do not confuse the two.)

A model note: this skill **inherits the session model** — nothing pins or switches
it. Planning is where frontier-class judgment pays for itself, so if the session is
running a small model, suggest `/model opus` (or better) before framing — the
human's call, never a gate.

## Three input modes (disambiguated for you — no quotes needed)

Look at the argument the human gave and pick the mode yourself:

1. **No argument → interview.** Walk the human through a short, friendly Q&A to draw
   the plan out of their head (see *The interview* below).
2. **The argument is a path to a file that exists → absorb the spec.** Read that file
   and distill it into `intent.md`, **retaining enough detail that `intent.md` stands
   on its own** — don't just link to the source. Add a one-line provenance
   (`*Source: <path>*`) and, for anything sizable, a `## Source` appendix preserving
   the original text. (Probe with the `Read` tool; if it isn't a real file, fall to
   mode 3.)
3. **Any other text → expand the inline intent.** Treat the text as the human's
   rough plan, expand it into the full `intent.md`, and ask only about what is
   genuinely ambiguous.

All three modes converge on the **same artifact**: a complete, standalone `intent.md`
an agent can follow with `/pb-build`. The argument only seeds how you get there.

## What this skill does

1. **Scaffold.** If there is no active session, run `plumbbob start "<title>"`
   to create `.plumbbob/` (baseline recorded, session opened). If a session already
   exists, say so and edit the existing `intent.md` rather than starting over.
2. **Frame** (`.plumbbob/intent.md`), with the human: the **Problem** in plain words,
   the **smallest thing** that solves it, what **done looks like**, and what you are
   **explicitly NOT doing**. This is the human's convergence — propose wording, but
   the human decides every line.
3. **Decisions & Constraints.** Record the settled calls (one line each, with the
   *because*) and the hard rules the build must honor. An unresolved hole goes to
   **Open questions**, never guessed into a Decision.
4. **Author the Steps.** Write the **full build plan** under `## Steps` — each step a
   small, verifiable increment in the exact format the parser reads:

   ```markdown
   1. [ ] <title> — **done when:** <criterion, ideally a test or check result>
      - seam: `<file>`, `<file>`
      - model: <optional — smallest that can carry it, with the one-phrase why>
   ```

   Every step needs a **done-when** `/pb-verify` can check and a **seam** (the exact
   paths it touches). Later steps may be fuzzier than the first — that's fine; they get
   sharpened just-in-time when you reach them with `/pb-step`. Keep each small enough to
   verify in one review pass.

   **Recommend a model per step where the signal is clear** *(optional)*: the
   `- model:` sub-line names the **smallest model that can carry the step**, with the
   one-phrase why — the human buys capability only where the step needs it. E.g.
   `model: sonnet — mechanical, fully specified by the done-when` for rote edits;
   `model: opus — strong-assertion test authoring` where the tests do the thinking;
   `model: fable — subtle cross-cutting design` for judgment-heavy or creative work.
   It is advisory metadata for the human — `/pb-status` surfaces it before each build —
   never a gate, and nothing switches models automatically. Write it plain (no
   backticks) and omit it when any model would do.
5. **Offer harness bindings** *(optional)*. If the build will lean on
   user-authored agents, author `harness.json` in the build folder (beside `intent.md`)
   and review it at the **same plan pause**, alongside the steps — bindings are
   plan-adjacent configuration, so they converge with the plan. It binds agents to a
   step's three lifecycle slots — `before` (context in), `build` (the diff), `after`
   (advisory review) — with an optional prose `note`; a `defaults` block binds every
   step. Run `plumbbob agent list` to see what's resolvable, per step:

   ```json
   {
     "contract": 1,
     "defaults": { "after": ["reviewer"] },
     "steps": { "3": { "before": ["context-loader"], "note": "watch the auth seam" } }
   }
   ```

   Keep it **bindings + prose only, never a conditional**: the file says *which*
   agent, not *when* — the host model reads each manifest's `when` prose and a step's
   `note` and decides when to fire one mid-build. Skip the file entirely when no step
   uses an agent — the loop runs identically without it. The plan commit picks it
   up automatically (it lives in the build folder).
6. **Commit the plan.** Once the human approves the frame and steps, run
   `plumbbob checkpoint --plan` to commit the scaffold on its own — subject
   `plumbbob: plan — <title>`, only `.plumbbob/builds/<slug>/`, a `plan <sha>` line in
   `checkpoints`. This keeps the first step's diff clean, so history reads
   baseline → plan → steps. Pass a proportional `--body` (the single-quoted stdin
   heredoc) when the rationale is worth carrying; skip it for a small plan. Do this
   only on the human's approval — the plan is their convergence.
   - **The plan commit is latched too (D64).** Like a step, `checkpoint --plan` refuses
     to land in the same turn `start` stamped it: present the plan, **end the turn**, and
     the human's approving message is the tick that lets it commit on re-fire — the
     refusal *is* the plan pause. Never route around it with a raw `git commit`. (One
     documented seam: the very first plan of a brand-new session runs `start` *before*
     the turn hook has ever ticked, so that single commit predates the ledger and stays
     guidance-governed — it lands without a refusal.)
7. **Offer to stress-test it.** Suggest `/pb-refine` to attack the frame for holes (or
   to repair the plan as it drifts). Optional, the human's call.

## The interview (mode 1)

Make it easy and non-intrusive:

- **Triage size first.** A tiny change earns a 3-line Frame and one Step, fast — never
  ceremony on a one-liner. Scale the questions to the work.
- **Propose, don't interrogate.** Offer concrete suggestions the human can **accept as-is
  without typing** ("done-when: the 6th request in 60s returns 429 — good?"), while
  taking arbitrary detail when they want to give it, including pointers to other files.
- **Let them double back.** They will revise as the picture sharpens; that's expected.
  They can also edit `intent.md` by hand at any time, or call `/pb-refine` to repair it.

## The hard contracts

- **Deciding before code.** `/pb-plan` writes `intent.md` only — never source.
- **The human converges.** You surface options and draft wording; the human picks.
  An unresolved hole is an Open question, not a guessed Decision.
- **Stands on its own.** Whatever the input mode, the finished `intent.md` carries
  enough detail to be followed without the chat or the external source.
- **Size to the work.** A small change fills Frame + a couple of Decisions + a step or
  two and stops; ceremony on a one-liner is the failure mode, not thoroughness.
