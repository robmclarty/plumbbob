# runciter.plan/2, vendored

These two files are copied byte for byte from runciter, which owns the
`runciter.plan/2` contract and is not published, so the conformance test in
`../plan-json.test.ts` cannot import them.

- `runciter.plan.schema.json` is runciter's `schema/runciter.plan.schema.json`.
- `runciter.plan.example.json` is runciter's `schema/examples/runciter.plan.example.json`.

Both were first copied from runciter commit `9b40f0f`, the contract as it was approved on
2026-11-12 (`runciter.plan/1`), and copied again on 2026-11-13 for `runciter.plan/2`, which
gives a step `landed` and turns its `done_when` into `proof`. The second copy is runciter
commit `e64109e`. They were copied a third time, later on 2026-11-13, for a step's `like`,
which `/2` took before it was released. That copy matches runciter commit `be5c513` byte for
byte.
Never edit them here. To refresh them, copy both files again from a later runciter commit,
name that commit in place of the one above, and run the test.
