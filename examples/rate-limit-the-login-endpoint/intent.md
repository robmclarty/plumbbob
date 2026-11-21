<!--
intent.md: your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.
-->

# Rate-limit the login endpoint

**Phase** (your own bookkeeping while framing): plan approved 2026-07-03
**Size:** small

## Frame

- **Problem:** the login route has no throttle; credential-stuffing against
  `POST /login` is cheap and invisible until it succeeds.
- **Smallest thing that solves it:** a per-IP token bucket on POST /login. In-process,
  no new infrastructure.
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

- **D1 (in-memory-bucket)**: in-memory token bucket, *because* single instance today; defer Redis.
- **D2 (five-per-minute)**: 5 attempts / 60s / IP, *because* it matches the existing lockout policy.

## Constraints

- **C1 (no-new-deps)**: no new runtime dependencies.

## Steps

1. [x] feat(limiter): add a token-bucket limiter
   - seam: `src/limiter.ts`, `test/limiter.test.ts`
   - proof: `pnpm vitest run limiter` passes
   - model: opus (strong-assertion test authoring)
2. [x] feat(login): wire the limiter into POST /login
   - seam: `src/routes/login.ts`, `test/login.rate.test.ts`
   - proof: the 6th request in 60s returns 429
   - model: sonnet (mechanical wiring, fully specified)
3. [x] feat(config): make the limit configurable via env
   - seam: `src/limiter.ts`, `src/config.ts`, `test/limiter.config.test.ts`, `.env.example`, `test/config.test.ts`
   - proof: a test shows `RATE_LIMIT_MAX` overriding the default

## Build order

## Build ranges

Run step 1 alone to settle how the bucket refills, then run the rest straight through.

1. `/plumbbob:build 1`, **stop:** at step 1's pause, pick refill-on-read or a timer before the route leans on it
   - model: opus
2. `/plumbbob:build 2-3`, **stop:** try six logins yourself, then `/plumbbob:finish`
   - model: sonnet

## Open questions

- **Q1 (proxy-trust)**: resolved 2026-07-03: the reverse proxy strips and re-sets `X-Forwarded-For`, so the limiter keys on it (confirmed with ops).

## Verdicts

- (none: no fork needed a spike this build)
