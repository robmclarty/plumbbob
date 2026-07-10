<!--
build-log.md — your live ledger for execution. Append constantly; reorganize at
step boundaries. The antidote to "my plan got lost in the noise."

  Steps     : where you are. One step in flight at a time.
  Park list : where ideas go so you do not chase them. CAPTURE, never act inline.
  Harvest   : the boundary ritual that keeps you on one branch.
  Log       : the build's history. `plumbbob checkpoint` appends a line per step as it
              lands; feeds the /pb-finish report, which rides the branch into the PR.
-->

# Build log — The eval tier

**Current step:** 1 (spike)
**Heavy check:** checkride (set a "check" key in .plumbbob/settings.json to override)

## Steps

*(Mirror of intent.md's Steps, with live status. Only ONE step is in flight. A step
is done only after a checkpoint — check green + checkpoint taken, via `/pb-verify` or
`/pb-build`.)*

- ☐ 1. Spike: contract 1, once, for real
- ☐ 2. Driver + plugin-dir resolver + fixtures
- ☐ 3. Assertion library, deterministically tested
- ☐ 4. Green-gate contracts (1, 4, 7) + runner skeleton
- ☐ 5. Red-gate contracts (2, 3)
- ☐ 6. Prose-governed contracts (5, 6)
- ☐ 7. Aggregation, JSONL, infra-only retry, cost
- ☐ 8. First committed sweep + report

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched, and you
> go straight back to the step. Acting the instant an idea arrives is the disease.
> Capture is one line (`/pb-park` composes it). Harvest happens only at the boundary.

- [ ] pb-doctor's shell-`if` injection dies in `-p` mode (silent empty result) —
  reshape to the `cmd || echo` form the other skills use.
- [ ] fascicle 0.8.16: run_cli drops provider_config (plugin_dirs,
  setting_sources) — file/fix upstream in the fascicle repo, then drop the
  driver's extra_args workaround.

## Harvest  *(run `/pb-harvest` at each step boundary, after green)*

Classify each parked item as exactly ONE. Naming it before acting is what keeps you
from sprawling across branches.

| Class            | Meaning                                   | Action                          |
|------------------|-------------------------------------------|---------------------------------|
| **blocker**      | Plan was wrong/incomplete; can't proceed  | `/pb-revert`, fold into intent  |
| **tangent**      | A different path, not clearly better      | Defer or kill. Default here.    |
| **pivot signal** | Evidence the whole approach is wrong      | Stop. Replan deliberately.      |

> Reality check: almost everything that *feels* like a pivot is a tangent. Require a
> failed assumption, not a shinier idea, before you pivot.

Harvest results this boundary:

- (none yet)

## Log

*(The build's history, oldest first. `plumbbob checkpoint` appends a dated line here
every time a step lands — via `/pb-build` or `/pb-verify` — so this
fills in as you go, not at the end. Add your own decision/event lines too: this is what
you point at to say "I did that — the LLM helped, but those were my calls."
`/pb-finish` reads this for the report; `plumbbob finish` commits it with the build
folder, so it rides the branch into the PR.)*

- 2026-07-10 — step 1 spike answers (the five unknowns from intent Q1), each
  established with a live probe against claude CLI 2.1.206 / fascicle 0.8.16 /
  sonnet:
  1. **Hooks + plugin load in `-p`: YES.** With `--plugin-dir <repo>`, the
     UserPromptSubmit hook ticks `.plumbbob/TURN` once per session prompt, and
     the stream-json `init` event lists all twelve `plumbbob:pb-*` slash
     commands. Caveat discovered: when a skill's `!`…`` dynamic injection
     fails, the whole command aborts silently — zero-turn empty result AND no
     hook tick.
  2. **Typed `/plumbbob:pb-build` expands headless: YES** — ran the full skill
     (oriented via injected status, built the step, ran the gate, wrote the
     self-review, and paused with the affordance prose). Contract-1 shape held:
     checkpoints plan-only, box unflipped, commit count unchanged, seam dirty.
     `disable-model-invocation` is irrelevant to typed invocation (A/B-tested
     with a scratch plugin). **Found product bug (parked):** `pb-doctor`'s
     injection is a shell-`if` compound, which dies headless → `/pb-doctor`
     returns an empty zero-turn result in `-p` mode. The `cmd || echo fallback`
     shape (pb-build/pb-plan/pb-verify) works.
  3. **`plumbbob` is on PATH headless: YES** — the plugin bin/ rides into the
     session; the status injection and every `Bash(plumbbob …)` call resolved.
  4. **Permissions: `--permission-mode acceptEdits` + `--allowedTools` covered
     the whole build loop promptlessly.** PreToolUse-ask auto-deny not yet
     exercised (no raw-commit attempt occurred); contract 2 will show it.
     **Exhausting `--max-turns` makes the CLI exit 1** (empty stderr) — the
     runner must classify that as `invalid`, never as an infra retry.
  5. **fascicle shape:** `result.content` = final assistant text; real turns
     populate usage + a cost estimate (the spike's pb-build turn: 50s,
     ~$0.37-estimated at sonnet; trivial turns read 0 — the report must
     tolerate zeros); `provider_reported.claude_cli` = `{session_id,
     duration_ms}`; `--resume` exists via
     `provider_options.claude_cli.session_id` (unused — fresh-session turns
     are the design). **Found fascicle 0.8.16 bug:** `run_cli` hardcodes
     `provider_config: {}` when building argv (dist/index.js ~3232), silently
     dropping the typed `plugin_dirs` and `setting_sources` config. Workaround
     shipped in the driver: pass `--plugin-dir`/`--setting-sources` through
     `extra_args`, which flows. Upstream one-line fix for the fascicle repo:
     thread the real provider config into `run_cli`'s `build_cli_argv` call.
  6. **(New finding) The `-p` UserPromptSubmit tick lands ~session-end, not
     pre-turn** — TURN's mtime trailed STEP's by 30s in the spike run, so a
     fixture's FIRST session works against an absent ledger (no TICK stamp;
     latch dormant for that turn — the first-session seam, same as
     production's first `/pb-plan`). Driver adaptation: fixture prep fires one
     trivial warm-up turn so the ledger exists before any measured turn —
     production-faithful (the human has always spoken at least once, at plan
     approval, before a build turn). The end-of-session tick cannot unlatch a
     checkpoint mid-turn (nothing runs after the final message).
- 2026-07-10 — step 1 checkpointed · 133462543 — Spike: contract 1, once, for real

