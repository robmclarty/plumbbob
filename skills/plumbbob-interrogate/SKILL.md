---
name: plumbbob-interrogate
description: DESIGN-phase frame interrogation — attack the plan for holes and append them as Open questions, without deciding anything.
disable-model-invocation: true
model: opus
allowed-tools: Read, Edit, Bash(plumbbob status:*)
---

# Plumbbob — interrogate the frame

Current session state (injected when this skill runs): !`plumbbob status`

## Wrong-state refusal

This skill runs in **DESIGN only**. Read the state injected above and **stop before touching anything** if it is not `DESIGN`:

- `STATE: BUILD` or `STATE: REVIEW` — you are mid-step. Return to DESIGN first: finish the step with `plumbbob done`, or drop a half-built step with `plumbbob revert`. Then re-invoke.
- `STATE: SPIKE` — close the experiment with `plumbbob spike done` first.
- `STATE: FINISH` — the session is wrapping up; there is nothing left to interrogate.
- `NO ACTIVE SESSION` — start one with `plumbbob start "<title>"`.

When the state is wrong, refuse in one line naming the verb above, and edit nothing.

## What this skill does

Hand the frame (the **Frame** and **Architecture sketch** in `intent.md`) a cold, adversarial read and **attack it for holes** — ambiguities, unhandled edge cases, hidden assumptions, and collisions with the existing code. This is the one place early divergence is wanted, and it is divergence in the **problem space only**: surface what is unclear, never propose a solution and never pick between options.

## The one hard contract

- Append every hole as a bullet under `intent.md`'s `## Open questions` section, and **nowhere else**.
- **Never append to `## Decisions`** — resolving a hole is the human's convergence, not yours (D13). You surface; you do not decide.
- One question per hole, phrased as a question, each standing on its own.
- Once the Open questions are appended, **end your turn**. Do not answer them, do not start the next step, do not slide from interrogating into deciding.
