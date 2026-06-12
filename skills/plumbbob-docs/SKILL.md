---
name: plumbbob-docs
description: FINISH-phase, optional docs update — conservatively project canonical intent into real docs/, only when warranted.
disable-model-invocation: true
model: opus
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*)
---

# Plumbbob — update the docs

Current session state (injected when this skill runs): !`plumbbob status`

## Wrong-state refusal

`docs/` is writable **only in FINISH** (D19) — the muzzle blocks it everywhere else. Read the state injected above and **refuse if it is not `FINISH`**, naming `plumbbob wrap` as the verb that enters FINISH (the report skill runs first; this docs pass is the optional second Finish step). If the state is `NO ACTIVE SESSION` the hooks are dormant and there is nothing for this skill to gate — just edit docs the ordinary way.

## What this skill does

**Conservative by default.** Most sessions write no docs at all — **a bug fix usually shouldn't spawn a doc**. Update real documentation under `docs/` only when the work genuinely changed how the system should be described, and only from the **canonical** parts of `intent.md` (the Frame, the Decisions) — never from the chat transcript.

## The one hard contract

- Default to doing nothing. Open a doc edit only when you can name what changed for a reader of `docs/`.
- Project only from `intent.md`; the report is for the session, the docs are for the system.
- Stay inside `docs/` — and only in FINISH. An edit anywhere else, or in any other state, is the muzzle's job to refuse, not yours to attempt.
