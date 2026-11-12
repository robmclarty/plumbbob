# runciter.plan/1, vendored

These two files are copied byte for byte from runciter, which owns the
`runciter.plan/1` contract and is not published, so the conformance test in
`../plan-json.test.ts` cannot import them.

- `runciter.plan.schema.json` is runciter's `schema/runciter.plan.schema.json`.
- `runciter.plan.example.json` is runciter's `schema/examples/runciter.plan.example.json`.

Both are from runciter commit `9b40f0f`, the contract as it was approved on 2026-11-12.
Never edit them here. To refresh them, copy both files again from a later runciter commit,
name that commit in place of the one above, and run the test.
