# The eval tier

**Phase** (your own bookkeeping while framing): build
**Size:** medium

## Frame

- **Problem:** The product's core behavior — the prose contracts (the pause, red
  refusal under pressure, ranges, park discipline, verify-never-builds) — has no
  test. The README skeptic section promises a "forthcoming" eval report, and spec
  06's exit criteria (prose-only baseline vs. latched pass rates) are the
  unfinished half of the latch story. Every prose/skill/model change lands
  unmeasured until this exists.
- **Smallest thing that solves it:** A `test/evals/` tier outside the default
  vitest run: fascicle's `claude_cli` provider drives scripted headless sessions
  against fixture repos with the plugin loaded; plain mechanical assertions over
  git + sidecar state; N runs per contract; pass rates committed as a dated
  report under `reports/evals/`.
- **Done looks like:** A committed baseline + latched sweep report (pass rate
  per contract, model + date stamped) and the README skeptic stub linking it.
- **Explicitly NOT doing:** No LLM-judged assertions. No CI wiring (sweeps are a
  deliberate act on the plan-05 cadence). No new skills or verbs. No fascicle in
  the CLI (eval driver only — research 03/06). No retries on behavioral failure.

## Architecture sketch

```
test/evals/
  helpers/driver.ts    openSession({repo, sweep, model}) -> {turn(prompt), close()}
                       one fascicle engine per fixture (default_cwd), each turn
                       = a FRESH `claude -p` session; the worktree TURN/GRANT/
                       TICK ledger makes cross-session turns real human turns
  helpers/plugin.ts    resolvePluginDir('latched'|'baseline')
                       latched = repo root; baseline = temp copy with
                       UserPromptSubmit + PreToolUse stripped from hooks.json
  helpers/fixture.ts   makeEvalFixture({steps, gate, seedDiff?}) on top of
                       test/helpers/fixture-repo.ts; gates: green | always-red |
                       red-during-step-2; settings.json {"check":"node check.js"}
  helpers/assert.ts    snapshot / checkpointLines / intentBoxes / parkLines /
                       unledgeredCommits / worktreeFingerprint / gateIsRed /
                       dirtyPathsIn — all mechanical, zero judging
  helpers/report.ts    JSONL append + markdown table render
  contracts/c1..c7-*.eval.ts   pinned prompts + required/informational checks
  run.ts               N runs, pass|fail|invalid, infra-only retry, cost ledger
reports/evals/         runs-<date>-<sweep>.jsonl + <date>.md (committed)
```

## Decisions

- D1: The runner is plain node, not vitest — *because* the output unit is a pass
  rate + cost ledger, and `pnpm test` must be structurally unable to burn money.
- D2: Each scripted human turn is a fresh `claude -p` session — *because* the
  latch ledger is per-worktree filesystem state, so no session resume is needed
  and the turn model matches the product's own.
- D3: `git commit` stays in the allowed tools for both sweeps — *because*
  contract 2 measures whether the prose routes around a refusal; a permission
  denial would measure the harness instead.
- D4: Baseline = hooks-stripped plugin copy (UserPromptSubmit + PreToolUse
  removed, PostToolUse kept) — *because* the latch is dormant-by-design when
  TURN never ticks, so prose-only needs zero code changes.
- D5: Outcomes are pass | fail | invalid, and infra errors retry once (stamped)
  while behavioral failures never retry — *because* rerunning a failed behavior
  is p-hacking.
- D6: `setting_sources: ['project','local']` only — *because* the user-level
  marketplace plumbbob install would double-tick TURN (dual-install
  contamination).

## Constraints

- C1: Assertions are mechanical reads of git + sidecar only; a string probe on
  the transcript may be *informational*, never required for pass.
- C2: `test/evals/**` is excluded from the default vitest run AND eval files are
  named `*.eval.ts` (defense in depth); helpers get model-free coverage in the
  default run.
- C3: Contract prompts are pinned exported constants; changing one is a
  reviewed diff.
- C4: fascicle is a devDependency; nothing under `src/` may import it.

## Steps

1. [x] Spike: contract 1, once, for real — **done when:** a throwaway
   `test/evals/spike.ts` fires one real `claude -p` turn of `/plumbbob:pb-build`
   through fascicle with the repo root as plugin dir, prints a pass/fail verdict
   for "checkpoints still plan-only + box 1 still unchecked", and every spike
   unknown (hooks fire? slash command expands? PATH? permissions? result shape +
   cost) has a written answer in this build's log.
   - seam: `test/evals/spike.ts`, `package.json`, `pnpm-workspace.yaml`
   - model: sonnet — mechanical driver probe; the answers are boolean
2. [x] Driver + plugin-dir resolver + fixtures — **done when:** `openSession`/
   `turn`/`close` and `resolvePluginDir` exist; the baseline copy's hooks.json
   provably lacks UserPromptSubmit/PreToolUse; `makeEvalFixture` covers all
   three gate variants; vitest.config.ts excludes `test/evals/**`.
   - seam: `test/evals/helpers/driver.ts`, `test/evals/helpers/plugin.ts`,
     `test/evals/helpers/fixture.ts`, `vitest.config.ts`
3. [x] Assertion library, deterministically tested — **done when:** every
   assert.ts reader is covered by model-free vitest against runCli-driven
   fixtures in the default run.
   - seam: `test/evals/helpers/assert.ts`, `test/integration/eval-helpers.test.ts`
4. [x] Green-gate contracts (1, 4, 7) + runner skeleton — **done when:** each
   runs at `--n 1` end-to-end and emits structured checks; prompts pinned as
   exported constants.
   - seam: `test/evals/contracts/`, `test/evals/run.ts`
5. [x] Red-gate contracts (2, 3) — **done when:** both gate variants are
   red/green under plain vitest without a model, and both contracts run at
   `--n 1` including c2's pressure turn.
   - seam: `test/evals/contracts/`, `test/evals/helpers/fixture.ts`
6. [x] Prose-governed contracts (5, 6) — **done when:** park-line delta and
   worktree-fingerprint assertions run at `--n 1`; c6's seeded-flaw diff is a
   fixture function; informational checks render distinctly.
   - seam: `test/evals/contracts/`, `test/evals/helpers/fixture.ts`
7. [x] Aggregation, JSONL, infra-only retry, cost — **done when:**
   `pnpm eval:baseline -- --contract c1 --n 2` writes well-formed JSONL with
   outcomes/costs/stamps and the retry predicate is keyed on error class alone.
   - seam: `test/evals/run.ts`, `test/evals/helpers/report.ts`, `package.json`
8. [x] First committed sweep + report — **done when:** a real N=5 baseline AND
   latched sweep exist as JSONL + rendered `reports/evals/<date>.md`, and the
   README skeptic blockquote links it.
   - seam: `reports/evals/`, `README.md`
   - model: opus — the sweep runs the product's operating condition

## Open questions

- Q1: Does `claude -p` fire UserPromptSubmit hooks from `--plugin-dir` plugins,
  and does the typed `/plumbbob:pb-build` form expand headless? — *(resolved →
  Verdicts, 2026-07-10)*

## Verdicts

- 2026-07-10 — Q1 → YES to both, with three riders (full detail in the build
  log's step-1 entry): (a) the `-p` tick lands ~session-end, so fixtures need a
  warm-up turn before the first measured one; (b) fascicle 0.8.16 drops the
  typed `plugin_dirs`/`setting_sources` provider config (`run_cli` passes
  `provider_config: {}`) — the driver rides those flags through `extra_args`
  until fascicle fixes it; (c) `--max-turns` exhaustion exits 1 → runner
  classifies as `invalid`, never infra-retry. Contract 1 passed live through
  the full fascicle path (sonnet, 50s, ~$0.37 est.): built, went green,
  self-reviewed, paused, ledger untouched.
