# Report — pb-build slimming: consolidate the agent-slot passages

**Status:** ✅ Done — 1/1 steps checkpointed. `pnpm check` green.
**Source:** research/07-remaining-hardening-builds.md § 3b (plan 05 item 4), deferred from
the 2026-07-12 reviewer build's close-out.

## What shipped

`skills/pb-build/SKILL.md` interleaved ~30 lines of **agent-slot mechanics** through
default-path steps 3–5 — the `before`, `build`, `when`-prose, non-`done` status-routing,
and `after` passages. Since the overwhelming majority of builds bind **no** agents, the
99% case waded through machinery that never applied to it.

Step 1 lifted those five passages into **one** new `## Running bound agents` section,
entered only when `plumbbob status` shows a `harness bindings:` block. Each affected
default step now keeps exactly one conditional pointer line and no `plumbbob agent run` /
`--mode` mechanics; the `--auto` section and the hard contracts reference the new section.
The contracts were preserved **verbatim in substance** — this was a relocation, not a
rewrite. Net effect: the default path reads far lighter, and the 1% who bind agents get a
single hop to the full details.

A new **location-aware** contract pin in `test/contract/skills.test.ts` locks the layout:
it asserts the `## Running bound agents` section exists **and** that the default-path
region (heading-to-next-`##`) embeds no slot mechanics — a guard the existing
presence-anywhere pins could not provide.

## Decisions and why

- **D1 — one section, not five per-slot sections or a separate file:** the five passages
  are one topic ("what changes when a harness binds agents"); a reader needs all of it or
  none.
- **D2 — the entry trigger is the injected `harness bindings:` status block:** it already
  prints only when a `harness.json` exists (`status.ts` `harnessSection` → `[]` otherwise,
  pinned in `status.test.ts`), so it's a zero-cost, already-tested cue — no new signal
  invented, and no `src/` change needed.
- **D3 — one conditional pointer per affected step:** the default path stays complete and
  readable on its own for the no-agent case; the agent case gets a single hop.
- **D4 — preserve every contract verbatim in substance:** 3b is relocation, not redesign;
  the surrounding contract tests and the c1–c7 evals must stay green untouched.
- **D5 — lock the layout with one added, location-aware pin** alongside the unchanged
  existing `build`-block pins.

## Parked & harvested

None — no ideas were parked; nothing to harvest at the boundary.

## Final status

Done. Seam held to exactly the two planned files (`skills/pb-build/SKILL.md`,
`test/contract/skills.test.ts`); no CLI/`src/` change; every existing `build`-block pin
stayed green; all 8 checkride slots (types, lint, struct, dead, test+coverage, docs,
links; spell disabled) passed.

## Deferred tangents

None. This slimming shipped the repo source only — the installed plugin-cache copy picks
it up on the next release (a `/version` call, the human's to make).

## Checkpoints

- baseline 657bbeb88c0f7f9e96104c07a7888601ad9b6aea
- plan ff0daad7f32edd6ac748205ca7b245677773e808
- step 1 118956a31e141e3f18244e343c2417d91a50ad60

## Stats

| step | red checks | drift warnings | reverts | wall-clock |
|------|------------|----------------|---------|------------|
| 1 | 0 | 0 | 0 | 8m |
| **total** | 0 | 0 | 0 | 8m |
