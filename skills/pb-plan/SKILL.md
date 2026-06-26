---
name: pb-plan
description: Frame a fresh goal and author the whole plan — Frame, Decisions, Constraints, and all Steps — before any code. Three input modes: no arg interviews you; a file path absorbs a spec; any other text expands your inline intent.
disable-model-invocation: true
model: opus
allowed-tools: Read, Edit, Write, Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ start:*)
---

# Plumbbob — plan a goal (the whole-goal move)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status 2>/dev/null || echo "plumbbob CLI not found - install the dep and re-run: npx plumbbob setup"`

`/pb-plan` is the **whole-goal** move — it opens a session and gets the deciding out
of your head and onto `intent.md` *before* any code. By default it authors the
**complete plan, including all the Steps**, so the happy path afterward is just
`/pb-build` until done. (Revising a single increment later is the separate `/pb-step`
move; do not confuse the two.)

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

1. **Scaffold.** If there is no active session, run `__PLUMBBOB_BIN__ start "<title>"`
   to create `.plumbbob/` (STATE=DESIGN, baseline recorded). If a session already
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
   ```

   Every step needs a **done-when** `/pb-verify` can check and a **seam** (the exact
   paths it touches). Later steps may be fuzzier than the first — that's fine; they get
   sharpened just-in-time when you reach them with `/pb-step`. Keep each small enough to
   verify in one review pass.
5. **Offer to stress-test it.** Suggest `/pb-refine` to attack the frame for holes (or
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
