# Report: Rate-limit the login endpoint

**Size:** small · **Result:** done (3 of 3 steps, all green and checkpointed)

`POST /login` had no throttle, which made credential-stuffing cheap. A per-IP token
bucket now sits in front of the handler: in memory, matching the existing lockout
policy, and overridable by env.

## What shipped

1. **Token-bucket limiter**: `src/limiter.ts`, a per-key bucket that refills on read,
   with its own unit tests and an injected clock.
2. **Wired into POST /login**: the 6th attempt from one IP inside 60s now returns
   HTTP 429, tested against the route.
3. **Env override**: `RATE_LIMIT_MAX` overrides the default of five, so ops can loosen
   or tighten the limit without a code change.

## Decisions and why

- **D1 (in-memory-bucket)**: the bucket stays in process memory, because there is one
  instance today; Redis is deferred until there are two.
- **D2 (five-per-minute)**: 5 attempts / 60s / IP, because it matches the lockout policy
  the account system already enforces, so the two throttles tell one story.

## Parked and harvested

| Park | What it is | Why it matters | Settled |
| --- | --- | --- | --- |
| P1 · reset throttle | should /password-reset get the same throttle? | it is the next brute-force target once login is closed | tangent, deferred at range 2's stop: a separate route and a separate decision |

## Final status

Done. Two runs: range 1 built step 1 to its pause, where the refill-on-read call was
made; range 2 landed steps 2 and 3 and ended on the stop card, settled in one reply.
Q1 (proxy-trust) was resolved with ops before the plan was approved.

## Deferred tangents

- Throttle `/password-reset` with the same limiter.

## Checkpoints

- baseline 3a1f2b0c1e57d9a24c68f0b3d1a5e7c92b4d6f80
- plan 7d2e94fb03c61a85e2d47b9f0c358a1d6e92b47c
- step 1 a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
- step 2 b2c3d4e5f6a7081928374655647382910abcdef1
- step 3 e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
| ---- | ---------- | -------------- | ------- | ---------- |
| 1 | 0 | 0 | 0 | 22m |
| 2 | 0 | 0 | 0 | 16m |
| 3 | 0 | 0 | 0 | 14m |
| **total** | 0 | 0 | 0 | 53m |
