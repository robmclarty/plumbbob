# Report — The approval latch

*Guidance on the work, a latch on the record.* Distilled from
`research/06-approval-latch.md`; built over six checkpointed steps (see `## Log` in
`build-log.md` for the timeline).

## What shipped

A ledger-plane latch on the checkpoint tick — the one boundary the product is named
after — while the work plane stays pure guidance (D10/D13 untouched). End to end:

- **A turn ledger the model never writes.** A `UserPromptSubmit` hook runs a new
  `plumbbob turn` verb that ticks `.plumbbob/TURN` once per human prompt and rewrites a
  one-turn `.plumbbob/GRANT` from the literal prompt. No session above cwd ⇒ silent
  no-op; malformed input ⇒ exit 0 (a broken hook never wedges prompting).
- **A per-build entry stamp.** `build <n>` and `start` write `builds/<slug>/TICK` = the
  current `TURN` (only when `TURN` exists); `checkpoint` clears it alongside
  `STEP`/`SEAM`/handoff.
- **The latch itself** — a six-row predicate in `checkpoint`, evaluated before the check
  gate, first hit wins: `isTTY` → absent `TURN`/`TICK` (dormant / hand-built) → standing
  `auto` → one-turn `GRANT` (with a `range M` ceiling) → `TURN > TICK` → else refuse,
  exit 1, the refusal message *being* the pause affordance. Covered row-by-row by
  deterministic subprocess tests — no model, no cost.
- **A git-commit ask-hook.** A `PreToolUse` hook turns a model-issued `git commit` with a
  step in flight into a permission *question* (`ask`, never `deny`); plumbbob's own commit
  spawn never trips it.
- **Receipts.** `status` prints one neutral line when commits landed since the last
  checkpoint outside the ledger; `doctor` reports the latch live/dormant with a
  hook-wiring hint for both install kinds.
- **The prose.** `pb-build`/`pb-plan`/`pb-verify` now name the latch (a refused
  checkpoint *is* the pause — present, end the turn, never route around it with a raw
  `git commit`), pinned by contract tests; `decisions.md` gained D64–D66 and a D10 scope
  note; the `plugin.json` tagline, happy-path, and README skeptic answer all carry the
  two-plane framing.

## Decisions and why

- **D64 — The approval latch: ledger-plane enforcement.** The checkpoint *tick* is
  latched to the harness's record of a human turn, *because* guidance and enforcement
  belong on different planes: the work plane stays free (a denial mid-edit has no legal
  move — the v1 mistake), the record plane latches (the commit is rare, at a turn
  boundary, and a denial there simply *is* the pause). Amends D10's scope; joins the
  existing verb-boundary family (refuse-red, refuse-dirty, C6-by-construction).
- **D65 — Grants come from the human's literal prompt.** `auto` / `range M`, one-turn
  lifetime by construction, minted only from strings the model cannot type
  (`pb-build` is `disable-model-invocation`) — *because* a grant the model can forge is
  no grant. The D27 `auto` key stays the standing personal grant; a typed range beats
  `--auto`.
- **D66 — Out-of-band commits are surfaced, never blocked.** Prevention where it's free
  (the ask-hook), detection where it isn't (the receipts line + `doctor` probe) —
  *because* the latch is a ratchet against completion-drive, not a cage against a forger;
  every forge stays loud.

Scope held to the spec: no work-plane enforcement, no latch on the hand-built
`/pb-verify` path, no new dependency (reuses `runGit`), no new user-facing verb (`turn`
is machinery), no `CLAUDECODE` sniffing, no version/CHANGELOG bump.

## Parked & harvested

None. The build ran clean — no strays parked, no open questions.

## Final status

**Done.** All six steps checkpointed and green (`pnpm run check`: types, lint, struct,
dead, test+coverage, docs, links). The D13 no-session-detection tripwire stays green.
The latch governed its own final two steps — each checkpoint was refused until a human
turn ticked the ledger, the shipped behavior proving itself in the build.

## Deferred tangents (future work)

- **The before/after eval receipt (plan 05).** The review-hardening eval harness lands
  separately, baselines the prose-only build, then re-sweeps after this latch — the
  before/after delta is the receipt the README skeptic stub points at. A plan-05 concern,
  not this build's.
- **Reinstall the on-PATH CLI.** The running `plumbbob` binary predates steps 5–6, so a
  live `status`/`doctor` won't render the receipts line or latch probe until reinstalled
  from this checkout; behavior is fully proven by the in-process test suite.

## Checkpoints

- baseline f4b3b40fc1e1abc47b47a75cb5db333921827b1e
- plan 92bba72cd9e7464f8a40248e2eeba8e73b09d482
- step 1 17ea758bed1ef364c9c54fdf8ba8fd3c316a203a
- step 2 11d2040db446f9a26565985cf7d27592354d0c6f
- step 3 13fbedcfb3cd2df46a49e4eba7d8f270387ea677
- step 4 32a29e40e338a6a5d353545531a3830c76ff3116
- step 5 600f5c7e0984c5143025dca10be70f61fd5340d0
- step 6 b69c9bea9f5247a74be559783ce6f7c881d852c2
