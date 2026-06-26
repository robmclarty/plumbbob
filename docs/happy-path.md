# The happy path — one complete cycle

This is the workflow end to end: from framing a fresh goal, through letting the
automated `/pb-build` pick and ship each step, to wrapping up, archiving, and
starting the next task. It's a worked example, not reference docs — every command,
dashboard, and CLI line below is what you actually see.

The loop in one breath: **`/pb-plan` once, then per step `/pb-status` →
`/pb-step` → `/pb-build` → (the verify pause) → checkpoint, parking strays and
harvesting them at the boundary, then `/pb-wrap` once.** You never type the
`plumbbob` CLI by hand; the skills shell out to it and `/pb-status` always names
your next move.

> The example goal: **rate-limit the login endpoint** — a small feature touching a
> couple of modules, big enough to show the full cycle.

---

## 0. Frame the goal — `/pb-plan`

The deciding happens *before* any code, on a surface outside the chat. `/pb-plan`
scaffolds the session and helps you write your decisions into `intent.md` — it
writes intent only, never source.

```text
/pb-plan
```

Under the hood it runs `plumbbob start`, which records a baseline and drops you in
`DESIGN`:

```text
plumbbob: started "Rate-limit the login endpoint" — STATE=DESIGN, baseline 3a1f2b0c1.
Frame and decide in .plumbbob/intent.md; flip to BUILD only once the decisions are made.
```

You and the model fill in the **Frame**, the **Decisions** (each with its
*because*), and the **Constraints**. `## Steps` stays empty on purpose — steps are
planned just-in-time, one at a time. A trimmed `intent.md`:

```markdown
# Rate-limit the login endpoint

## Frame
- **Problem:** the login route has no throttle; credential-stuffing is cheap.
- **Smallest thing that solves it:** a per-IP token bucket on POST /login.
- **Done looks like:** the 6th attempt inside a minute returns HTTP 429.
- **Explicitly NOT doing:** distributed/multi-instance limits; CAPTCHA.

## Decisions
- D1: in-memory token bucket — *because* single instance today; defer Redis.
- D2: 5 attempts / 60s / IP — *because* matches the existing lockout policy.

## Constraints
- C1: no new runtime dependencies.

## Steps
*(empty — planned one at a time with /pb-step)*
```

---

## 1. Orient — `/pb-status`

Whenever you're unsure what's next, ask. `/pb-status` is read-only; it prints the
dashboard and the single next move.

```text
Plumbbob — Rate-limit the login endpoint   [DESIGN]

  (no steps planned yet)

last checkpoint  none yet
parked 0 · open questions 0

next → plan the first step — `/pb-step`
```

---

## 2. Plan the next increment — `/pb-step`

`/pb-step` proposes **one** small step: a title, a **done-when** criterion
`/pb-verify` can actually check, and a **seam** (the files it touches). You approve
it; it's appended to `## Steps`.

```text
/pb-step
```

```markdown
## Steps
1. [ ] Add a token-bucket limiter — **done when:** `test/limiter.test.ts` passes
   - seam: `src/limiter.ts`, `test/limiter.test.ts`
```

Now the dashboard knows there's a planned step waiting, and points straight at the
executor:

```text
Plumbbob — Rate-limit the login endpoint   [DESIGN]

  steps  0/1 done
  ▸ 1  Add a token-bucket limiter   ← next

last checkpoint  none yet
parked 0 · open questions 0

next → build step 1 — `/pb-build`
```

---

## 3. Build it — `/pb-build` (the automated executor)

`/pb-build` is the bundled executor. Called bare, **it picks the next undone,
planned step automatically** — you don't pass a number unless you want a specific
one (`/pb-build 2`). It reads the step's done-when, seam, Decisions, and
Constraints, implements *only that step*, then carries straight through the verify
tick to the pause.

```text
/pb-build
```

It enters `BUILD`, recording the seam for orientation (not a lock in v2):

```text
plumbbob: building step 1 — STATE=BUILD. Seam (for orientation; not a lock in v2):
  src/limiter.ts
  test/limiter.test.ts
```

It writes the code, runs the heavy gate, and self-reviews the diff against the
plan:

```text
plumbbob: check green.
```

Then it **stops at the pause** and waits for you — this is the one human-convergence
beat. Nothing is committed yet.

```text
── verify: step 1 — Add a token-bucket limiter ──
check        green (tsc, oxlint, ast-grep, vitest, knip, markdownlint)
done-when    met — test/limiter.test.ts: 4 passing
decisions    D1 (in-memory), D2 (5/60s) honored
constraints  C1 honored — no new deps

PAUSE — read the diff as an editor. Approve to checkpoint, or send fixes.
```

> **This pause is the product.** You read the diff and say "yes, this matches what
> I intended." It reads the *diff, not the author* — a step you wrote by hand or
> vibed in another session verifies exactly the same way (see *The pluggable
> executor* below).

You approve. Only then does it checkpoint — committing the work, recording the SHA,
flipping the step to `[x]`, and returning to `DESIGN`:

```text
plumbbob: step 1 checkpointed — a1b2c3d4e. STATE=DESIGN.
```

---

## 4. Park strays mid-build — `/pb-park`

The moment an "ooh, what if" arrives mid-step, you **capture it, you don't chase
it**. `/pb-park` composes one tidy tagged line and shelves it — then you go right
back to the step. Say while building step 2 you think *"should password reset be
throttled too?"*:

```text
/pb-park
```

```text
plumbbob: parked — "tangent: should /password-reset get the same throttle?"
```

It's on the list, out of your head, and the step in flight stays protected. The
dashboard now counts it:

```text
parked 1 · open questions 0
```

(Step 2 — *wire the limiter into POST /login* — is planned with `/pb-step` and
shipped with `/pb-build` exactly as step 1 was. Plan → build → pause → checkpoint,
once per increment.)

---

## 5. Harvest at the boundary — `/pb-harvest`

Parked items get triaged **at a step boundary** — after a checkpoint, back in
`DESIGN`, never mid-step. The dashboard tells you when there's something to harvest:

```text
next → harvest 1 parked idea — `/pb-harvest`; then plan the next step — `/pb-step`
       (or `/pb-wrap` to wrap up if you're done)
```

`/pb-harvest` walks the list and proposes one class per item — **blocker** (plan
was wrong; fold into intent and handle now), **tangent** (different, not clearly
better — the default; defer or kill), or **pivot signal** (the whole approach is
wrong; stop and replan). You call each one:

```text
/pb-harvest
```

```text
Park list (1 open):

1. "should /password-reset get the same throttle?"
   → proposed: tangent — it's a separate route and a separate decision, not a
     blocker for this goal. Defer as future work?

[awaiting your call]
```

You confirm **tangent → defer**. It's recorded under `## Harvest`, flipped to
`[x]`, and stops counting — it'll resurface in the wrap report as deferred work.

---

## 6. Wrap up — `/pb-wrap` (report + archive + clear)

When the goal is done — every step checkpointed, the park list harvested —
`/pb-wrap` closes the build. It writes the report **by default** (there's no
refuse-without-report gate), then archives and clears.

```text
/pb-wrap
```

First it writes `.plumbbob/report.md` — what shipped, the decisions and why, what
was parked and how it was classified, final status, and the deferred tangents that
become future work. This is the "yeah, I did that" artifact:

```markdown
# Report — Rate-limit the login endpoint

## What shipped
- Step 1: in-memory token-bucket limiter (`src/limiter.ts`).
- Step 2: wired into POST /login; 6th attempt in 60s → 429.

## Decisions and why
- D1: in-memory bucket — single instance today; Redis deferred.
- D2: 5/60s/IP — matches existing lockout policy.

## Final status
Done. Both steps checkpointed and green.

## Deferred tangents (future work)
- Throttle /password-reset with the same limiter (harvested → tangent).
```

Then `plumbbob wrap` appends the checkpoint SHAs, copies `intent.md`,
`build-log.md`, and `report.md` into a dated archive, and clears the sidecar —
**archive-then-clear, never destroy**. Git is untouched:

```text
plumbbob: wrap — archived to .plumbbob/archive/2026-06-25-rate-limit-the-login-endpoint.
Sidecar cleared. Run `/pb-plan` (or plumbbob start "<title>") to frame the next goal.
```

The record now lives at:

```text
.plumbbob/archive/2026-06-25-rate-limit-the-login-endpoint/
  intent.md
  build-log.md
  report.md
```

Your checkpoint markers stay on the feature branch; your normal squash-merge
collapses them at PR time.

---

## 7. Start the next task — `/pb-plan`

The sidecar is clear and there's no active session. `/pb-status` now reads
`NO ACTIVE SESSION`, and the cycle begins again with a fresh frame:

```text
/pb-plan
```

```text
plumbbob: started "Add structured request logging" — STATE=DESIGN, baseline a1b2c3d4e. …
```

And you're back at step 0 with a clean head and the previous goal safely on the
shelf.

---

## The pluggable executor — `/pb-build` is optional

The happy path above used `/pb-build` to write every step, but it's just *one* way
to turn a planned step into code. Implement the step by hand, in a vibe session, or
with another harness, and run `/pb-verify` instead — it runs the same tick
(`check → self-review → validate → PAUSE → checkpoint`) and **reads the diff, not
the author**. Plumbbob is the harness-agnostic spine; how the diff appears is a slot
you fill however you like.

```text
/pb-build      # automated: pick the next step, implement, verify to the pause
   — or —
(your edits)   # hand-built / vibed / another harness
/pb-verify     # same pause, same checkpoint — author-blind
```

---

## The cycle, at a glance

```text
/pb-plan                      frame the goal               (once)
  └ per step:
       /pb-status             "what's next?"
       /pb-step               plan the next increment
       /pb-build  (or DIY)    implement it → verify → PAUSE
       /pb-park               capture strays mid-build
       /pb-harvest            triage them at the boundary
  /pb-wrap                    report + archive + clear      (once)
  /pb-plan                    frame the next goal           (cycle repeats)
```

The human owns convergence; `/pb-build` does the labor and **stops at the pause**;
you're the clock that advances it. See the root [`README`](../README.md) for the
philosophy and install, and [`attention-first-development.md`](attention-first-development.md)
for why attention is the scarce resource.
