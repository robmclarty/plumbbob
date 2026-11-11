# Eval receipts

A receipt is a dated measurement of the skill-eval harness in
[`test/evals/`](../../test/evals/): one headless sweep of the loop against a fresh fixture
repo, every assertion a mechanical read of git and sidecar state, with the `baseline` arm
(the plugin with its latch hooks stripped) beside the `latched` arm (the plugin as shipped)
whenever both ran. Each file is written once by the driver and never edited afterwards, so
what it says is what was measured on that day, at that version.

Newest first:

- [2026-11-10-next.md](2026-11-10-next.md), plumbbob 0.14.3 with the uncommitted `/plumbbob:next` work: c14 (`/plumbbob:next` falls back to the dashboard with no question tool) beside c1, c4, c10, c11, c12, and c13, latched arm only, 5/5 each.
- [2026-10-31-short-stop.md](2026-10-31-short-stop.md), plumbbob 0.13.6: c11 (a run ends on its stop card) and c13 (a short stop card after an approved halt), latched arm only, 5/5 each.
- [2026-10-31-reply-order.md](2026-10-31-reply-order.md), 0.13.6: c10 (a question at the pause) and c12 (feedback at the pause), latched only, 5/5 each.
- [2026-10-27-show.md](2026-10-27-show.md), 0.13.4: c10 alone, latched only, 5/5.
- [2026-10-27-feedback.md](2026-10-27-feedback.md), 0.13.4: c10 and c12, latched only, 5/5 each.
- [2026-10-19.md](2026-10-19.md), 0.13.1: c1 to c11, latched only; c11 (a run ends on its stop card) 5/5 on its first sweep.
- [2026-10-17-relay.md](2026-10-17-relay.md), 0.12.1: c1 to c10, the plugin with its Stop hook stripped (`no-relay`) against latched.
- [2026-10-17.md](2026-10-17.md), 0.12.1: c1 to c10, latched only; c10 (a question at the pause) new.
- [2026-09-17.md](2026-09-17.md), 0.12.0: c1 to c9, latched only; c9 (auto lands the last step) new.
- [2026-09-05.md](2026-09-05.md), 0.11.3: c1 to c8, two runs each, latched only.
- [2026-09-03.md](2026-09-03.md), 0.10.3: c1 to c8, two runs each, latched only.
- [2026-08-14.md](2026-08-14.md), 0.10.0: c5 (park, don't chase) alone, baseline 3/5 against latched 5/5.
- [2026-08-07.md](2026-08-07.md), 0.9.4: c8 (legible intent) alone, both arms.
- [2026-07-27.md](2026-07-27.md), 0.9.0: c1 to c7, latched only.
- [2026-07-18.md](2026-07-18.md), 0.8.7: c1 to c7, both arms.
- [2026-07-11.md](2026-07-11.md), 0.7.1: c1 to c7, both arms, the first sweep; c2 (no checkpoint over red) 2/5 baseline against 5/5 latched.
