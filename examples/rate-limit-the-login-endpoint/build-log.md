<!--
build-log.md: your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time. CLI-maintained: `build`,
              `checkpoint`, and `revert` keep this mirror and the Current step line
              in sync with intent.md; you never hand-edit them.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Harvest   : the boundary ritual that keeps you on one branch.
  Log       : the build's history. `plumbbob checkpoint` appends a line per step as it
              lands; feeds the /plumbbob:finish report, which rides the branch into the PR.
-->

# Build log: Rate-limit the login endpoint

**Current step:** none (at the boundary)
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status; CLI-maintained, not hand-edited.
`build`/`checkpoint`/`revert` re-render this from intent.md, and set the Current step
line above. Only ONE step is in flight; a step is done only after a checkpoint:
check green + checkpoint taken, via `/plumbbob:verify` or `/plumbbob:build`.)*

- ☑ 1. feat(limiter): add a token-bucket limiter
- ☑ 2. feat(login): wire the limiter into POST /login
- ☑ 3. feat(config): make the limit configurable via env

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/plumbbob:park` composes it). Harvest happens only at the boundary.

- [x] should /password-reset get the same throttle? (tangent)

## Harvest  *(run `/plumbbob:harvest` at each step boundary, after green)*

Classify each parked item as exactly ONE. Naming it before acting is what keeps you
from sprawling across branches.

| Class            | Meaning                                   | Action                               |
| ---------------- | ----------------------------------------- | ------------------------------------ |
| **blocker**      | Plan was wrong/incomplete; can't proceed  | `/plumbbob:revert`, fold into intent |
| **tangent**      | A different path, not clearly better      | Defer or kill. Default here.         |
| **pivot signal** | Evidence the whole approach is wrong      | Stop. Replan deliberately.           |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require a
> failed assumption, not a shinier idea, before you pivot.

Harvest results this boundary:

- 2026-07-03, at range 2 of 2's stop: 1 parked idea, classified.
- **tangent**: park 1 · should /password-reset get the same throttle? (tangent) → a separate route and a separate decision, not a blocker for this goal

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends an entry here
every time a step lands (via `/plumbbob:build` or `/plumbbob:verify`): the dated line,
and beneath it the pause as you approved it, so this fills in as you go, not at the
end, and an older step's detail is a scroll away. Add your own decision/event lines too: this is what
you point at to say "I did that: the LLM helped, but those were my calls."
`/plumbbob:finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*

- 2026-07-03 — plan committed · 7d2e94fb0

  **Recommendation**: Approve it. Every step carries a done-when a test can measure, the seams name files that exist, and each Decision states its because.

  **1.** Q1 (proxy-trust) is the one assumption the limiter keys on, and ops settled it.

  The bucket keys on `X-Forwarded-For`; the proxy strips and re-sets it, so a client cannot spoof its way to a fresh bucket.

- 2026-07-03 — step 1 checkpointed · a1b2c3d4e — feat(limiter): add a token-bucket limiter (22m)

  **Summary**: A per-IP token bucket now refuses the 6th attempt inside a minute.

  1. The bucket lives in memory, keyed by IP, refilling on read: five tokens a minute.
  2. The clock is injected, so the test advances time instead of sleeping on it.
  3. `test/limiter.test.ts` covers refill, exhaustion, and the per-IP split.

  **Readout**:

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

  **Recommendation**: Approve it, refilling on read. The gate is green and the seam held, and a bucket that refills when it is read needs no timer for the route to clean up.

  **1.** The bucket lives in memory, keyed by IP, refilling on read: five tokens a minute.

  Each read tops the bucket up by the time elapsed since the last one, so an idle IP costs nothing and no timer runs. D1 (in-memory-bucket) keeps it in process.

  **2.** The clock is injected, so the test advances time instead of sleeping on it.

  `createBucket({ now })` takes the clock; the test passes a counter it moves by hand.

  **3.** `test/limiter.test.ts` covers refill, exhaustion, and the per-IP split.

  Six takes inside a minute refuse the sixth, a minute later the bucket is full again, and two IPs never share tokens.

- 2026-07-03 — step 2 checkpointed · b2c3d4e5f — feat(login): wire the limiter into POST /login (16m)
- 2026-07-03 — step 3 checkpointed · e5f6a7b8c — feat(config): make the limit configurable via env (14m)
- 2026-07-03 — range 2 of 2's stop recorded — try six logins yourself, then `/plumbbob:finish`

  **Summary**: POST /login now answers the 6th attempt inside a minute with 429, and `RATE_LIMIT_MAX` moves the limit.

  1. The route takes one bucket per IP from the limiter step 1 built.
  2. `RATE_LIMIT_MAX` overrides the default of five, read once at startup.

  **Readout**:

  ```text
  steps        2 of 2 landed
               - 2 b2c3d4e · 3 e5f6a7b
  check        green: 7 of 7 checks, 2 landings
  done-when    met
  decisions    2 of 2 honored
  constraints  1 of 1 honored
  seam         held: 2 of 2 steps, no strays
  diff         +48 -6 across 5 files
  spent        31 min · green first run at every landing
  ```

  **Verdict**: ● Plumb

  **Harvested**: 1 of 1 parked idea open

  - P1 · should /password-reset get the same throttle? (tangent) → lean: tangent, a separate route and a separate decision, not a blocker for this goal

  **Recommendation**: Approve it, then try six logins yourself before you finish. The gate was green at both landings, and the one park is future work, not this goal's.

  **1.** The route takes one bucket per IP from the limiter step 1 built.

  Step 2 keys the bucket on `X-Forwarded-For`, which Q1 (proxy-trust) settled is safe to trust, and answers an empty bucket with 429 before the handler runs.

  **2.** `RATE_LIMIT_MAX` overrides the default of five, read once at startup.

  Step 3 reads the variable in `src/config.ts`, so a deployment changes the limit without a code change and the route never re-reads the environment.
