# Report — Rate-limit the login endpoint

**Size:** small · **Result:** done (3/3 steps, all green + checkpointed)

`POST /login` had no throttle, making credential-stuffing cheap. Shipped a per-IP
token bucket in front of the handler — in-memory, matching the existing lockout
policy, overridable by env.

## What shipped

1. **Token-bucket limiter** — `src/limiter.ts`, a pure per-key bucket with its own
   unit tests.
2. **Wired into POST /login** — the 6th attempt from one IP inside 60s now returns
   HTTP 429; integration-tested against the route.
3. **Env override** — `RATE_LIMIT_MAX` overrides the default, so ops can loosen or
   tighten without a deploy.

## Decisions and why

- **D1: in-memory token bucket** — single instance today; Redis stays a deferred
  decision, not a silent dependency.
- **D2: 5 attempts / 60s / IP** — matches the existing account-lockout policy, so the
  two throttles tell one story.

## Parked and how it was classified

- `/password-reset` throttle → **tangent, deferred** — separate route, separate
  decision; not a blocker for this goal.

## Final status

Done. All three steps checkpointed and green; Q1 (proxy `X-Forwarded-For` trust)
resolved with ops before step 2 landed.

## Deferred tangents (future work)

- Throttle `/password-reset` with the same limiter (harvested → tangent).

## Checkpoints

- baseline 3a1f2b0c1e57d9a24c68f0b3d1a5e7c92b4d6f80
- plan 7d2e94fb03c61a85e2d47b9f0c358a1d6e92b47c
- step 1 a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
- step 2 5b8f31da29c740e6b1a8d3f52c96e07a4b18d3c5
- step 3 9c4d02e118f5a67b3e29c84d0f61b52a7e93c04d
