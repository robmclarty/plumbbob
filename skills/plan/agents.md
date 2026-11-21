# PlumbBob plan: harness bindings

Read by the plan skill when the build will lean on user-authored agents, before the plan
pause.

## Offer harness bindings

If the build will lean on
user-authored agents, author `harness.json` in the build folder (beside `intent.md`)
and review it at the **same plan pause**, alongside the steps; bindings are
plan-adjacent configuration, so they converge with the plan. It binds agents to a
step's three lifecycle slots, `before` (context in), `build` (the diff), and `after`
(advisory review), with an optional prose `note`; a `defaults` block binds every
step. Run `plumbbob agent list` to see what's resolvable, per step:

```json
{
  "contract": 1,
  "defaults": { "after": ["reviewer"] },
  "steps": { "3": { "before": ["context-loader"], "note": "watch the auth seam" } }
}
```

Keep it **bindings + prose only, never a conditional**: the file says *which*
agent, not *when*; the host model reads each manifest's `when` prose and a step's
`note` and decides when to run one mid-build. Skip the file entirely when no step
uses an agent; the loop runs identically without it. The plan commit picks it
up automatically (it lives in the build folder). A binding may be a path in place of
a name: `./tools/walk` resolves from the repo root and must stay inside it, so an
agent kept in the repo outside `.plumbbob/agents/` is bound by its path and every
clone runs it, where a name only your personal tier holds is skipped with a warning
on a teammate's machine. `plumbbob agent list` walks the tiers, so an
agent bound by its path does not show there
(D160 (path-bindings)).
