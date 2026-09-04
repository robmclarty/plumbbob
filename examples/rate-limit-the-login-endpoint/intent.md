<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.
-->

# Rate-limit the login endpoint

**Phase** (bookkeeping while in DESIGN): plan approved 2026-07-03
**Size:** small

## Frame

- **Problem:** the login route has no throttle; credential-stuffing against
  `POST /login` is cheap and invisible until it succeeds.
- **Smallest thing that solves it:** a per-IP token bucket in front of the login
  handler. In-process, no new infrastructure.
- **Done looks like:** the 6th attempt from one IP inside a minute returns HTTP 429;
  the limit is overridable by env for ops.
- **Explicitly NOT doing:** distributed/multi-instance limits (single instance today);
  CAPTCHA; touching any route other than `POST /login`.

## Architecture sketch

```
request → [ limiter (per-IP token bucket) ] → login handler
                 │ empty bucket
                 └────────────→ 429 Too Many Requests
```

## Decisions

- D1 (in-memory-bucket): in-memory token bucket — *because* single instance today; Redis is a deferred
  decision, not a requirement.
- D2 (five-per-minute): 5 attempts / 60s / IP — *because* it matches the existing account-lockout policy.

## Constraints

- C1 (no-new-deps): no new runtime dependencies.

## Steps

1. [x] feat(limiter): add a token-bucket limiter — **done when:** `test/limiter.test.ts` passes
   - seam: `src/limiter.ts`, `test/limiter.test.ts`
2. [x] feat(login): wire the limiter into POST /login — **done when:** the 6th request in 60s returns 429
   - seam: `src/routes/login.ts`, `test/login.rate.test.ts`
3. [x] feat(config): make the limit configurable via env — **done when:** `RATE_LIMIT_MAX` overrides the default in a test
   - seam: `src/limiter.ts`, `src/config.ts`, `test/limiter.config.test.ts`

## Open questions

- Q1: does the reverse proxy already set `X-Forwarded-For` reliably? — *resolved:*
  ask — confirmed with ops 2026-07-03; the proxy strips and re-sets it, safe to trust.

## Verdicts

- (none — no forks needed a spike this build)
