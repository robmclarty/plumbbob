# Report — User agent plugins: envelope, agent verb, harness.json

**Status:** done (8/8 steps checkpointed) · **Size:** medium · **Phase:** DESIGN → shipped

The half-built seam is now a doorway. `check.ts` already spawned an arbitrary user
command and trusted its exit code; checkride already carried the stream discipline
(stdout = machine JSON, stderr = human prose). This build added the four missing
pieces — the envelope, the homes, the plan artifact, and one verb — so a
user-authored agent can be dropped in, planned per-step, and run, without ever
gaining a way to advance plumbbob's loop.

## What shipped

- **Envelope + manifest module** (`src/lib/agents.ts`) — the contract-1 types,
  `agent.json` validation (name, slots ⊆ {before,build,after}, command, contract),
  output-envelope validation (status ∈ {done,blocked,drift}), unknown fields
  tolerated, and a contract major-version mismatch refused with a hint.
- **Resolver + `plumbbob agent list`** — resolution walks `--agent <path>` →
  `.plumbbob/agents/<name>/` → `~/.plumbbob/agents/<name>/`, first hit wins; `list`
  prints name, origin tier, slots, and description for every resolvable agent.
- **StepContext composition** — the input JSON is composed deterministically from
  `intent.md` + settings; `intent.ts` gained a best-effort decisions/constraints/
  title/done-when scrape (verbatim bullet strings, wrapped lines joined, stderr
  warning on skipped lines, never refuses — seam parsing stays strict).
- **`plumbbob agent run <name> [--step N] [--mode …]`** — composes the input,
  async-spawns (`spawn`, not `spawnSync`) the manifest command via `sh -c` at repo
  root with `PLUMBBOB_AGENT_DIR` in the env and JSON on stdin, streams the child's
  stderr live, forwards SIGINT to kill the child, honors an opt-in `agentTimeout`,
  validates the stdout envelope, re-emits it on its own stdout with the human
  summary on stderr, appends it to `builds/<slug>/handoff.json` (untracked, cleared
  at checkpoint), applies `parked[]` via the park verb — and has no code path to
  checkpoint or step state.
- **`harness.json` bindings** — per-step slots + `note`, settings-level `defaults`
  merged under and the `--agent` flag over; a missing bound agent downgrades to a
  warning.
- **Doctor + status** — `doctor` validates every resolvable agent (manifest,
  executable command, supported contract); `status` reports the active build's
  bindings and warns on ones that don't resolve. No separate `agent check` verb.
- **Skills learned the slots** — pb-plan offers harness authoring at plan time,
  pb-step revises bindings just-in-time, pb-build runs before-agents into
  `context[]` and delegates to a build-slot agent, pb-verify presents after-output
  as advisory at the pause; the `blocked`/`drift` routing is named in prose.
- **Docs, example, decision log** — `docs/agents.md` (the author contract),
  `docs/cli-reference.md` (`agent run|list` + `agentTimeout`), `docs/decisions.md`,
  a README pointer, and a minimal working example agent under `examples/`.

## Decisions and why

The build's spine held: **one versioned JSON envelope** (D1), **one verb with no way
to advance the loop** (D2) — the subprocess boundary enforces human-as-clock by
construction, not policy — and **exactly three slots** (D5, before/build/after)
because no declarative format can name "a salient point in the middle"; that's
judgment, and prose is the orchestration language with the host model as the
workflow engine. Side effects flow through existing verbs, never the agent (D6),
and `after` is advisory — checkride gates, the human advances (D7).

Refinement (Q6–Q12, resolved 2026-07-03) settled the mechanics: **repo root as cwd**
with the agent's dir via `PLUMBBOB_AGENT_DIR` (D18, amended — the original
agent-dir cwd broke build-slot agents editing repo-relative seams); **hybrid
handoff** — inline stdout for the calling skill *and* an untracked `handoff.json`
that survives context compaction (D20); **explicit asks fail loud, ambient
bindings degrade soft** (D21); **async spawn for graceful SIGINT** (D22);
**best-effort verbatim parsing** for the agent's context, strictness reserved for
seams that gate git (D23); and **`blocked` vs `drift` route differently** at the
pause — unblock-and-re-run vs `/pb-refine` repair (D24).

## Parked & harvested

One item parked, resolved in place: `agent.ts`'s private `readHarness` was deduped
into `lib/agents.readHarnessFile` during step 6, at Rob's direction, rather than
deferred. Nothing was left on the park list; the harvest boundary is clean.

## Final status

Done. All eight steps checkpointed (baseline `6bb8910` → step 8 `7106f3c`), each a
greppable `plumbbob: step N — <title>` commit. `pnpm run check` was green at step 8.
No version/CHANGELOG bump (C7 — Rob cuts releases via `/version`).

## Deferred tangents

None carried forward. The scope fence held: no loop-advancing envelope verb, no
control flow in `harness.json`, no fascicle inside plumbbob (it visits via the
subprocess boundary), no provider keys, no marketplace. The one revisit flagged in
the plan is **D15** — before-slot outputs travel inline as `context[]`; revisit only
if payload size proves it needs a file, on evidence.

## Checkpoints

- baseline 6bb8910fdcd2f3f7310f6c5860c4738fc5cb7e8b
- step 1 af4962628fb79d6d0230229e3bb0f5b36f226323
- step 2 1d0439c8a6d4df2b05fbdb5b01612af98ce32002
- step 3 e06c2cf1d6c7e53093647971a93059dc83edbde7
- step 4 c6bb5ce3d6496f144887a50925c46041e0c003cc
- step 5 a8a7e77c033d60f09e6b90d4afbdb9ca8201477f
- step 6 944deeb57a774542cdb4796d0d3005fa3d39f1f3
- step 7 723d1271ef5d5361902f408692e442d552f5913c
- step 8 7106f3c2d1bc505964b762e0bb1acf75972aba07
