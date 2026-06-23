---
name: pb-plan
description: Frame a fresh goal — scaffold the session and author the intent's Frame, Decisions, and Constraints before any code. Steps stay empty; they come one at a time from /pb-step.
disable-model-invocation: true
model: opus
allowed-tools: Read, Edit, Write, Bash(__PLUMBBOB_BIN__ status:*), Bash(__PLUMBBOB_BIN__ start:*)
---

# Plumbbob — frame a goal (the whole-goal move)

Current session state (injected when this skill runs): !`__PLUMBBOB_BIN__ status`

`/pb-plan` is the **whole-goal** move — it opens a session and gets the deciding out
of your head and onto `intent.md` *before* any code. (Planning a single increment is
the separate `/pb-step` move; do not confuse the two.)

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
4. **Leave `## Steps` empty.** Steps are planned just-in-time (D6) — one at a time
   with `/pb-step` — so do not write the build plan here.

## The hard contracts

- **Deciding before code.** `/pb-plan` writes `intent.md` only — never source.
- **The human converges.** You surface options and draft wording; the human picks.
  An unresolved hole is an Open question, not a guessed Decision.
- **Size to the work.** A small change fills Frame + a couple of Decisions and stops;
  ceremony on a one-liner is the failure mode, not thoroughness.
