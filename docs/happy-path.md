# The happy path: one complete cycle

This is the workflow end to end: from planning a fresh goal **all at once**, through
driving the automated `/plumbbob:build` step after step until done, to finishing up and
starting the next task. It's a worked example, not reference docs: every command,
dashboard, and CLI line below is what you actually see.

The loop in one breath: **`/plumbbob:plan` once to author the whole plan, then fire
`/plumbbob:build` per step (each builds the next step and stops at the verify pause for
your approval), parking strays and harvesting them at the boundary, then `/plumbbob:finish`
once.** In the loop you never type the `plumbbob` CLI by hand; the skills shell out to
it (only install, `plumbbob init` and `doctor`, is manual; even `plumbbob start` is
run for you by `/plumbbob:plan`), and
`/plumbbob:status` always names your next move.

> The example goal: **rate-limit the login endpoint**, a small feature touching a
> couple of modules, big enough to show the full cycle.

---

## 0. Plan the whole goal: `/plumbbob:plan`

The deciding happens *before* any code, on a surface outside the chat. `/plumbbob:plan`
scaffolds the session and authors the **complete** `intent.md` (Frame, Decisions,
Constraints, **and all the Steps**), so the build afterward is just `/plumbbob:build` until
done. It writes intent only, never source.

It takes whatever seed you give it and disambiguates the mode itself (no quotes
required):

```text
/plumbbob:plan                                  # interview: Q&A draws the plan out of your head
/plumbbob:plan docs/rate-limit-spec.md          # absorb an out-of-band spec into intent.md
/plumbbob:plan rate-limit POST /login, in-memory bucket, 5/min/IP, 429   # expand inline intent
```

Under the hood it runs `plumbbob start`, which records a baseline and drops you in
`DESIGN`:

```text
**Session**: started "Rate-limit the login endpoint" (baseline 3a1f2b0c1)
  → frame and decide in .plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/intent.md, then build a step
```

In interview mode it proposes wording you can accept without typing ("done-when: the
6th request in 60s returns 429, good?") and takes as much detail as you want to give.
The result is a plan an agent can follow, with **every step carrying a done-when and a
seam**:

```markdown
# Rate-limit the login endpoint

## Frame
- **Problem:** the login route has no throttle; credential-stuffing is cheap.
- **Smallest thing that solves it:** a per-IP token bucket on POST /login.
- **Done looks like:** the 6th attempt inside a minute returns HTTP 429.
- **Explicitly NOT doing:** distributed/multi-instance limits; CAPTCHA.

## Decisions
- <a id="d1"></a>**D1 (in-memory-bucket)**: in-memory token bucket, *because* single instance today; defer Redis.
- <a id="d2"></a>**D2 (five-per-minute)**: 5 attempts / 60s / IP, *because* it matches the existing lockout policy.

## Constraints
- <a id="c1"></a>**C1 (no-new-deps)**: no new runtime dependencies.

## Steps
1. [ ] Add a token-bucket limiter, **done when:** `test/limiter.test.ts` passes
   - seam: `src/limiter.ts`, `test/limiter.test.ts`
   - model: opus (strong-assertion test authoring)
2. [ ] Wire the limiter into POST /login, **done when:** the 6th request in 60s returns 429
   - seam: `src/routes/login.ts`, `test/login.rate.test.ts`
   - model: sonnet (mechanical wiring, fully specified)
3. [ ] Make the limit configurable via env, **done when:** `RATE_LIMIT_MAX` overrides the default in a test
   - seam: `src/limiter.ts`, `src/config.ts`, `test/limiter.config.test.ts`
```

> **Plan as far as you can see clearly.** Later steps may be fuzzier than the first;
> that's fine; they get sharpened just-in-time when you reach them. Before building,
> you can hand the frame to `/plumbbob:refine` to attack it for holes (or repair the plan
> later if a build contradicts it).

---

## 1. Review the plan: `/plumbbob:status`

Before building, glance at what's next. `/plumbbob:status` is read-only; it prints the
dashboard, surfaces the **next step's done-when, seam, and model recommendation** so
you can sanity-check it (and switch models before building, if you agree with the
recommendation), and names the single next move:

```text
PlumbBob — Rate-limit the login endpoint   [DESIGN]

  steps  0/3 done
  ▸ 1  Add a token-bucket limiter   ← next
        done when: `test/limiter.test.ts` passes
        seam: src/limiter.ts, test/limiter.test.ts
        model: opus (strong-assertion test authoring)
    2  Wire the limiter into POST /login
    3  Make the limit configurable via env

last checkpoint  none yet
parked 0 · open questions 0

next → build step 1 — `/plumbbob:build` (or `/plumbbob:step` to revise it first)
```

---

## 2. Sharpen the next step (optional): `/plumbbob:step`

The steps were planned up front, so `/plumbbob:step` is now a *revision* tool, not the way
steps are born. If the next step still looks right, skip it. If something changed,
fire it:

- **`/plumbbob:step` (no input)** auto-sharpens the next step: it re-reads what you've
  already built, the Decisions, and the Constraints, and syncs the step's done-when and
  seam to reality. The zero-effort "keep my next step honest" move.
- **`/plumbbob:step <what changed>`** makes a directed revision: tighten the done-when,
  adjust the seam, or split the step.

You approve the change; it's written back into `## Steps`. Most steps need nothing:
straight to `/plumbbob:build`.

---

## 3. Build each step: `/plumbbob:build`, fired until done

`/plumbbob:build` is the bundled executor. Called bare, **it picks the next undone step
automatically** (pass a number only to jump, for example `/plumbbob:build 3`; a range like
`/plumbbob:build 1-3` auto-approves through step 3, then pauses). It reads the step's
done-when, seam, Decisions, and Constraints, implements *only that step*, then carries
straight through the verify tick to the pause.

```text
/plumbbob:build
```

It goes in-flight, recording the seam for orientation (not a lock):

```text
plumbbob: building step 1 (next undone)
plumbbob: the seam is orientation, not a lock (2 paths)
  src/limiter.ts
  test/limiter.test.ts
```

It writes the code, runs the heavy gate, self-reviews the diff against the plan, and
then **stops at the pause**: the one human-convergence beat. Nothing is committed yet.
The whole turn is one block. The agent writes its judgment into `.plumbbob/detail.md`,
`plumbbob handoff` renders the turn from that file and its own measurements, and the
agent pastes the result and writes nothing around it (the
[turn anatomy](presentation.md) fixes every part of the shape):

````markdown
**Summary**: A per-IP token bucket now refuses the 6th attempt inside a minute. (details: `.plumbbob/detail.md`)

1. The bucket lives in memory, keyed by IP, refilling five tokens a minute.
2. The clock is injected, so the test advances time instead of sleeping on it.
3. `test/limiter.test.ts` covers refill, exhaustion, and the per-IP split.

**Readout**: Step 1 - Add a token-bucket limiter

```text
check        green: 7 of 7 checks
done-when    met
decisions    2 of 2 honored
constraints  1 of 1 honored
seam         held: 2 of 2 declared, no strays
diff         +61 -3 across 2 files
spent        22 min · 2 turns · 41s gate · green first run
```

**Verdict**: ● Plumb

**Next Up**: Step 2 of 3 - Wire the limiter into POST /login (model: **Sonnet**, details: `.plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/intent.md:20`)

**Your Call**:

- `looks good` → I checkpoint step 1; back to the boundary
- `expand`, or any question → I show more of what is there; nothing changes
- anything that reads as direction → I take it as what to change; nothing lands until you approve
- `revert` → I wind the work back to the last checkpoint

**Recommendation**: Approve it. The gate is green, the seam held, and every call the step made is one the plan already decided.
````

Every deterministic line there is measured, not composed: the check row comes from the
gate's own summary, the seam row from the declared seam against `git diff`, the diff and
`spent` rows from git and the step's receipts, and the Verdict is the worst of them all.
Only the Summary, the three judgment rows, and the recommendation are the agent's, and
they reach the turn through the detail file rather than the chat.

The four moves are the ones you actually make. `expand 2` (or any question at all) opens
the matching section of the detail file and changes nothing; anything that reads as
direction is taken as what to fix, and still nothing lands until you say `looks good`.

> **This pause is the product.** You read the diff and say "yes, this matches what I
> intended." It reads the *diff, not the author*: a step you wrote by hand or vibed in
> another session verifies exactly the same way (see *The pluggable executor* below).
>
> **The latch makes the pause real.** Nothing ever blocks an edit (the work plane is
> pure guidance), but the *record* is latched: when the session runs under plumbbob's
> turn hook, `checkpoint` refuses to land a step in the same turn it began, so the agent
> **cannot** self-checkpoint past you. That refusal *is* this pause: the agent presents
> the diff and ends its turn, and **your next message is the tick** that lets the
> checkpoint land. You don't have to trust the agent to stop; the ledger stops it. (Say
> the word by name, `/plumbbob:build --auto` or a range like `1-3`, and you grant it
> self-approval for that run; that grant can only come from a prompt *you* typed. See
> [D64 (approval-latch)](decisions.md#d64)–[D66 (oob-commits-surfaced)](decisions.md#d66).)

You approve. Only then does it checkpoint: committing the work, recording the SHA,
flipping the step to `[x]`, and returning to the `DESIGN` boundary, where it **stops**.
The boundary turn scales the anatomy down to what a landed step needs: the verb's line,
then the Verdict and Next Up, with no Your Call block, because no decision is pending.

```text
**Checkpoint**: Step 1 complete (a1b2c3d4e)

**Verdict**: ● Plumb

**Next Up**: Step 2 of 3 - Wire the limiter into POST /login (model: **Sonnet**, details: `.plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/intent.md:20`)
```

That Next Up line is what carries the plan's model recommendation across a context
window: a fresh window inherits the session's model rather than the plan's suggestion, so
the line names the `/model` to select before the next run. Guidance, never a gate.

Now **fire `/plumbbob:build` again** for step 2, and again for step 3. Each run builds the
next step and pulls up to its own pause: *re-firing `/plumbbob:build` is itself the clock
tick*. The dashboard tracks the march:

```text
  ✓ 1  Add a token-bucket limiter
  ▸ 2  Wire the limiter into POST /login   ← next
        done when: the 6th request in 60s returns 429
        seam: src/routes/login.ts, test/login.rate.test.ts
        model: sonnet (mechanical wiring, fully specified)
    3  Make the limit configurable via env
```

> **Unattended option: `/plumbbob:build --auto`.** When you'd rather not approve each step
> by hand, `/plumbbob:build --auto` lets the agent self-review and approve in your place,
> then chain straight to the next step until the plan is done. It **halts** the moment
> the check goes red or the self-review finds a mismatch, and hands back to you. A step
> range like `/plumbbob:build 1-3` bounds this: it self-approves through step 3, then pauses.
> The default (no flag) always waits at the pause.

---

## 4. Park strays mid-build: `/plumbbob:park`

The moment an "ooh, what if" arrives mid-step, you **capture it, you don't chase it**.
Say while building step 2 you think *"should password reset be throttled too?"*; hand it
to `/plumbbob:park`, inline or bare:

```text
/plumbbob:park should /password-reset get the same throttle?   # pass the idea inline
/plumbbob:park                                                  # or fire it bare — it uses the idea you just raised
```

`/plumbbob:park` never writes the line blind: it **composes one tidy, tagged line and shows it to
you for a quick OK** (confirm it as-is or tweak the wording), then captures it by shelling
`plumbbob park` under the hood. A park is a driver turn: the verb's line, then one
pointer back at the step it interrupted, and nothing else.

```text
**Parked**: should /password-reset get the same throttle? (tangent)

**Next Up**: Back to step 2 of 3 - Wire the limiter into POST /login
```

It's on the list, out of your head, and the step in flight stays protected. The
dashboard now counts it:

```text
parked 1 · open questions 0
```

---

## 5. Harvest at the boundary: `/plumbbob:harvest`

Once the last step is checkpointed, the dashboard surfaces the parked item; triage
happens **at a boundary**, back in `DESIGN`, never mid-step:

```text
next → harvest 1 parked idea — `/plumbbob:harvest`; then finish up — `/plumbbob:finish` (or `/plumbbob:step` to add another increment)
```

`/plumbbob:harvest` walks the list and proposes one class per item: **blocker** (plan was
wrong; fold into intent and handle now), **tangent** (different, not clearly better:
the default; defer or kill), or **pivot signal** (the whole approach is wrong; stop and
replan). You call each one:

```text
/plumbbob:harvest
```

It proposes, you decide, one item at a time (this is the agent's turn, not CLI output):

```text
Park list (1 open):

1. "should /password-reset get the same throttle?"
   proposed: tangent. It's a separate route and a separate decision, not a blocker
   for this goal. Defer it as future work?
```

You confirm **tangent → defer**. It's recorded under `## Harvest`, flipped to `[x]`,
and stops counting; it'll resurface in the finish report as deferred work.

---

## 6. Finish up: `/plumbbob:finish` (report + final commit + clear)

When the goal is done (every step checkpointed, the park list harvested), `/plumbbob:finish`
closes the build. It writes the report **by default** (there's no refuse-without-report
gate), makes the final commit, and clears the control state.

```text
/plumbbob:finish
```

First it writes `report.md` **into the build folder**: what shipped, the decisions and
why, what was parked and how it was classified, final status, and the deferred tangents
that become future work. The build-log's `## Log` is already the step-by-step history, so
the report synthesizes rather than re-narrates. This is the "yeah, I did that" artifact,
and because it lives in the tracked build folder it rides the branch into the PR:

```markdown
# Report — Rate-limit the login endpoint

## What shipped
POST /login is throttled by a per-IP token bucket, 5 attempts a minute, the 6th
answered 429; the limit reads from `RATE_LIMIT_MAX` where the deployment needs a
different number.

## Decisions and why
- D1 (in-memory-bucket): the bucket stays in process memory, because there is one
  instance today; Redis is deferred until there are two.
- D2 (five-per-minute): 5 attempts / 60s / IP, because it matches the lockout policy
  the account system already enforces.

## Parked & harvested
- "should /password-reset get the same throttle?" → tangent, deferred.

## Final status
Done. All three steps checkpointed and green.

## Deferred tangents
- Throttle /password-reset with the same limiter.
```

`plumbbob finish` appends `## Checkpoints` (the baseline and step SHAs) and `## Stats`
(the per-step receipts) to that file itself, so the written half stops at the five
sections above.

Then `plumbbob finish` appends the checkpoint SHAs to the report, makes the final commit
(subject `chore(rate-limit-the-login-endpoint): finish`, with a `plumbbob finish` body marker),
and clears the control state (`STATE`, the cursor,
the in-flight markers). It writes no separate archive copy: the tracked build folder *is*
the record now, so it merges into `main` with the branch:

```text
**Session**: finished (f3e9a1b2c, .plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/ rides your branch into the PR)

**Next Up**: Nothing planned - /plumbbob:plan
```

The record now lives (tracked, on the branch) at:

```text
.plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/
  intent.md
  build-log.md
  checkpoints
  stats.json
  report.md
```

Your checkpoint markers and the build folder stay on the feature branch; your normal
squash-merge collapses the markers at PR time while the folder lands in `main`.

---

## 7. Start the next task: `/plumbbob:plan`

The sidecar is clear and there's no active session. `/plumbbob:status` now reads
`NO ACTIVE SESSION`, and the cycle begins again with a fresh plan:

```text
/plumbbob:plan
```

```text
**Session**: started "Add structured request logging" (baseline a1b2c3d4e)
  → frame and decide in .plumbbob/builds/2026-07-14-add-structured-request-logging/intent.md, then build a step
```

And you're back at step 0 with a clean head and the previous goal safely on the shelf.

---

## The pluggable executor: `/plumbbob:build` is the default engine, not the only one

The happy path above used `/plumbbob:build` to write every step, but it's just *one* way to
turn a planned step into code. Implement the step by hand, in a vibe session, or with
another harness, and run `/plumbbob:verify` instead; it runs the same tick
(`check → self-review → validate → PAUSE → checkpoint`) and **reads the diff, not the
author**. PlumbBob is the harness-agnostic spine; how the diff appears is a slot you
fill however you like.

```text
/plumbbob:build      # automated: pick the next step, implement, verify to the pause
   — or —
(your edits)         # hand-built / vibed / another harness
/plumbbob:verify     # same pause, same checkpoint — author-blind
```

---

## The cycle, at a glance

```text
/plumbbob:plan                      author the whole plan (incl. all steps)   (once)
  └ per step:
       /plumbbob:status             review the next step (done-when + seam)
       /plumbbob:step   (optional)  sharpen/revise it first if needed
       /plumbbob:build  (or DIY)    implement it → verify → PAUSE → checkpoint
       /plumbbob:park               capture strays mid-build
       /plumbbob:harvest            triage them at the boundary
  /plumbbob:finish                  report + final commit + clear             (once)
  /plumbbob:plan                    plan the next goal                        (cycle repeats)
```

The human owns convergence; `/plumbbob:build` does the labor and **stops at the pause**;
you're the clock that advances it: one keystroke per step. See the root
[`README`](../README.md) for the philosophy and install,
[`techniques.md`](techniques.md) for each method on its own, and
[`attention-first-development.md`](attention-first-development.md) for why attention is
the scarce resource.
