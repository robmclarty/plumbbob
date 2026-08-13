# Architecture

> **Status: in progress.** This page sketches the broad strokes for contributors and
> executor authors. The parts marked *(research)* are direction, not contract; they
> track the working notes in [`research/`](../research/) and will firm up as those
> decisions land. The settled design record is [`decisions.md`](decisions.md).

## The three layers

PlumbBob splits judgment from mechanics from state, and the boundary between the
layers is the product:

```
  plumbbob skills        judgment — compose, propose, pause; the model reads and writes
       │                 prose, and every convergence waits for the human
       ▼  (shell out)
  plumbbob CLI           mechanics — deterministic verbs: parse, refuse, commit,
       │                 record; no model, no network, exit codes as the contract
       ▼  (read/write)
  .plumbbob/ sidecar     state — plain markdown + flat text files in your repo;
                         everything inspectable and hand-editable
```

Anything that must be *reliable* lives in the CLI (a checkpoint that refuses on red, a
revert that only targets recorded SHAs). Anything that requires *judgment* lives in a
skill (composing a park line, classifying a harvest, self-reviewing a diff). The state
between them is never hidden: the sidecar is the whole memory.

## The CLI (`src/`)

- `cli.ts`: the executable shell; the **only** `process.exit` in the codebase
  (enforced by `rules/no-process-exit.yml`), so everything below it is importable by
  tests.
- `cli-core.ts`: verb routing and the help table.
- `verbs/`: one file per verb, each a pure `(cwd, args) → exit code` function.
- `lib/`: the shared mechanics: `git.ts` (additive-only git, [C5 (additive-git)](decisions.md#c5)), `sidecar.ts` (paths,
  planes, excludes), `intent.ts` (step/seam parsing), `orient.ts` (the dashboard),
  `settings.ts` (the ladder, [D27 (settings-ladder)](decisions.md#d27)), `check.ts` (the gate), `buildlog.ts`, `plugins.ts`
  (install detection).

Structural invariants are machine-enforced by the ast-grep rules in `rules/`:
functional/procedural only ([C1 (functional-only)](decisions.md#c1)), node builtins plus the dependency allowlist ([C2 (few-deliberate-deps)](decisions.md#c2)),
subprocess spawning centralized, output through `process.stdout`/`stderr` only,
deletions confined to their sanctioned files ([C4 (never-destroy)](decisions.md#c4)), no history-rewriting git token and
`resetHard` importable only by `revert.ts` ([C5 (additive-git)](decisions.md#c5)), and no loop-advancing import in the
agent path ([C6 (no-advance-verb)](decisions.md#c6)).

## The two planes ([D17 (two-planes)](decisions.md#d17)/[D26 (build-folders)](decisions.md#d26))

The sidecar splits by lifetime. The **artifact plane** is tracked (`settings.json`
and each `builds/<slug>/` folder (intent, build-log, checkpoints, report)), so a
build's record rides its branch into the PR. The **control plane** is per-worktree
ephemera, excluded via the shared gitdir's `info/exclude` ([D33 (info-exclude)](decisions.md#d33)), never `.gitignore`:
`STATE` (its content is the active-build cursor, [D28 (state-cursor)](decisions.md#d28)), `settings.local.json` (the personal overlay), and each
build's in-flight `STEP`/`SEAM`/`SPIKE` markers. Phase is **derived, not stored**:
SPIKE marker ⇒ SPIKE, STEP present ⇒ BUILD, otherwise DESIGN.

## The check gate ([D32 (checkride-gate)](decisions.md#d32))

Two tiers with different jobs. The **heavy** gate runs inside the verify tick:
[checkride](https://www.npmjs.com/package/checkride) imported programmatically (the one
runtime dependency), or the `"check"` shell command from the settings ladder as the
override. Exit codes are the contract: 0 green, 1 red, 2 the-gate-itself-broke. The
**light** tier is the single post-edit hook: file-scoped, non-blocking lint feedback
injected into the model's context, gated on an active build.

## Distribution

The npm package *is* the Claude Code plugin: `.claude-plugin/plugin.json` plus
conventional `skills/` and `hooks/hooks.json`, delivered either by the marketplace or
by `plumbbob init`'s symlink into `~/.claude/skills/`. The two paths are co-equal and
mutually exclusive; `doctor` arbitrates. See [`install.md`](install.md).

## In progress *(research)*

- **User agent plugins**: a pluggable-executor contract beyond "run `/plumbbob:verify`
  yourself": executors as subprocesses speaking a JSON envelope, discovered under
  `.plumbbob/agents/<name>/`, with per-build wiring (before/build/after slots) in the
  build folder. The full analysis is
  [`research/04-user-agent-plugins.md`](../research/04-user-agent-plugins.md).
- **Multi-host**: `plumbbob init --host codex|cursor|zed` placing the same skills
  where other agents look; the npm package as the agent-neutral carrier
  ([`research/02-model-agnostic-standalone.md`](../research/02-model-agnostic-standalone.md)).
- **The reasoning seam**: how skills reach a frontier model from non-Claude hosts;
  evaluated and settled in
  [`research/03-reasoning-seam-and-fascicle-plan.md`](../research/03-reasoning-seam-and-fascicle-plan.md)
  (host-plugin tool; a local-model "fascicle" was declined).

---

*For the why behind these shapes, [`decisions.md`](decisions.md) is the key the source
cites; [`cli-reference.md`](cli-reference.md) documents the verb surface this
architecture serves.*
