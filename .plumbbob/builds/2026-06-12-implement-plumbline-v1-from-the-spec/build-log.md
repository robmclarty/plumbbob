# Build log — Implement Plumbline v1 from the spec

**Current step:** none (DESIGN — all 8 steps done; next: finish the session through its own gate) · **STATE:** DESIGN
**Heavy check:** `pnpm check`

## Steps

- ✔ 1. Toolchain bootstrap: heavy gate green, CLI stub, first commit — checkpoint `ba7ae6f`
- ✔ 2. Sidecar + git lib and session verbs: start, status, mode, park — checkpoint `d6d5479`
- ✔ 3. Build-loop verbs: build <n>, review, done, revert — checkpoint `a648588`
- ✔ 4. Hooks: pre-edit (muzzle+seam-guard), bash-guard, post-edit feedback — checkpoint `74c0aa5`
- ✔ 5. Dev-register hooks, live probe, open the dogfood session — checkpoint `ffd1318`
- ✔ 6. Finish phase + spike lifecycle: wrap, finish, spike, archive-then-clear — checkpoint `649a623`
- ✔ 7. The five skills with enforced contracts — checkpoint `dcce561`
- ✔ 8. Installer + e2e dogfood close-out — checkpoint `d73afe3`

## Park list

> Mid-step, every new problem / idea / "ooh what if" lands HERE, untouched.
> Capture is one line (`/park` composes it, or raw `plumbline park` once step
> 2 exists; until then, append by hand).

- [ ] Archive indexing/retrieval over past builds — README marks it
  deliberately out of scope for v1 (noted at session start)
- [ ] `finish --commit-archive` flag if Q3 resolves to untracked — future
  Plumbline (noted at session start)
- [ ] devEngines exact pin will re-break pnpm on the next pnpm upgrade —
  README note lands in step 8; revisit pinning policy later
- [ ] ast-grep's postinstall is denied (pnpm 11 `node`-shim breaks the native
  binary swap), so every `ast-grep` run prints a 2-line stderr perf notice —
  filter it out of step 4's light-feedback context injection (occurred at step 1)
- [ ] Other-agent/editor enforcement adapters (Cursor, Aider, Codex, …) over the
  same `.plumbline/` core — the hooks + skills are the Claude Code adapter; the
  CLI + sidecar are already agent-agnostic. Future Plumbline (human chose option
  A at step 5, 2026-06-11); step 8's README should name the core/adapter boundary

## Triage  *(run at each step boundary, after green)*

| Class            | Meaning                                       | Action                        |
|------------------|-----------------------------------------------|-------------------------------|
| **blocker**      | Plan was wrong/incomplete; can't proceed      | `revert`, fold into intent.md |
| **tangent**      | A different path, not clearly better          | Defer or kill. Default here.  |
| **pivot signal** | Real evidence the whole approach is wrong     | Stop. Replan deliberately.    |

Triage results this boundary:

- (none yet — no step has reached a boundary)

## Log

- 2026-06-10 — Session hand-scaffolded (bootstrap: the tool can't scaffold
  itself yet). Frame from docs/plumbline-README.md + attention-first
  principles.
- 2026-06-10 — Interrogation: 6 lenses / 57 agents over the spec; 45 holes
  confirmed (each adversarially verified), 3 refuted. Verified first-hand:
  `pnpm --version` fails on the `^11.1.2` devEngines pin; HEAD is unborn.
- 2026-06-10 — Plan drafted into intent.md: 8 steps with seams, 7 open
  questions awaiting the human's call.
- 2026-06-10 — Completeness critic (cold read vs spec) found 6 gaps + 3
  internal inconsistencies; all folded: finish lists SHAs in report (step 6),
  report/docs/park content contracts pinned (step 7), REVIEW re-entry tested
  (step 3), CLAUDECODE refusal given a consuming step (step 2), dogfood
  session gets a retrofitted baseline (step 5), Q3 narrowed to its true
  residual after C4 forced D17 (sidecar untracked). Now 17 decisions,
  8 constraints, 8 steps; resolve Q1–Q4 + Q7c before `build 1`.
- 2026-06-10 — All seven open questions resolved interactively with Rob, each
  on the proposed default → D18–D26. Three deliberate spec deviations on
  record (main-tree lock during SPIKE, archive local-only, no tsc in light
  tier). DESIGN decide-phase complete; next act is `build 1` (steps 1–4 run
  on the heavy gate alone until the hooks land in step 5).
- 2026-06-10 — D17 extended to this repo: sidecar untracked from here on
  (`.plumbline/` added to .gitignore, files removed from the index — history
  keeps the founding plan via commits e0298fc and earlier). Plan docs now
  evolve locally, consistent with D20; durable record lands in docs/ at
  step 8.
- 2026-06-11 — Step 1 done (checkpoint `ba7ae6f`). D15 first act landed:
  devEngines pinned to exact `11.1.2` (pnpm runs again). Toolchain wired —
  `pnpm check` green across tsc, oxlint, ast-grep, vitest, knip, markdownlint
  (fallow excluded per D26). CLI stub (`src/cli.ts`) prints the full verb
  table; C1 ast-grep rules proven to reject class / `this` / default export.
  Stray foreign skill `.claude/skills/version/SKILL.md` deleted (briefing).
  Seam revised mid-step: added `pnpm-workspace.yaml` — pnpm 11's `allowBuilds`
  map lives there; ast-grep's postinstall denied because its native-binary
  swap breaks under pnpm's `node` bin-shim (the JS launcher works, with a
  cosmetic per-run stderr notice — parked for step 4). @types/node pinned to
  ^24 to match the Node 24 runtime. No new decisions; no open questions.
- 2026-06-11 — Step 2 done (checkpoint `d6d5479`). Sidecar + git libs and the
  session verbs: `start` scaffolds `.plumbline/` at the git toplevel (STATE,
  `baseline <sha>` checkpoints line 1, `check=` config per D24, stamped
  templates), excludes the sidecar via `.git/info/exclude` (D17), refuses on
  dirty tree (D22, `--allow-dirty` escape) / existing session / non-git dir,
  and re-scaffolds post-finish without touching `archive/`. `status`,
  `mode` (escape hatch), `park` (dumb capture, appends under `## Park list`).
  D21 model-invoked refusal enforced once in dispatch: transition verbs refuse
  under CLAUDECODE, `park`/`status` exempt. 22 vitest tests green against tmp
  fixture repos (D14), subprocess-driven with CLAUDECODE stripped/injected. No
  out-of-seam edits; no new decisions; no open questions.
- 2026-06-11 — Step 3 done (checkpoint `a648588`). Build-loop verbs +
  `src/lib/intent.ts` (strict seam parser: nth step under `## Steps`, exactly
  one `seam:` line, backtick tokens, refuses globs/absolutes/absences, ignores
  done-when backticks and trailing HTML comments — verified against the real
  intent.md, all 8 steps) + `src/lib/check.ts` (D24 `check=` runner, stub in
  tests per D14). `build <n>` writes normalized SEAM+STEP+BUILD; `review`
  flips to REVIEW only on green; `done` refuses on red, `git add -A`, warns on
  out-of-seam staged paths (D8), commits `plumbline: step n done`, appends
  `step n <sha>`, clears SEAM/STEP, → DESIGN; `revert [--to n]` resets --hard
  to a checkpoint (baseline fallback) and removes untracked-in-seam only.
  PINNED C4 test green: mid-step park lines survive revert (sidecar is
  git-excluded, so reset never touches it). 46 vitest tests. Seam revised
  mid-step: added `src/lib/git.ts` (mutation helpers) + `src/lib/sidecar.ts`
  (seamPath/stepPath) — the build-loop extends the read-only step-2 libs; no
  new decision. No open questions.
- 2026-06-11 — Step 4 done (checkpoint `74c0aa5`). Three POSIX-sh hooks, built
  from the RE-VERIFIED hooks API (D3 — fetched the official docs; the README's
  `$EDIT_PATH` is fiction, real input is JSON on stdin, `tool_input.file_path`/
  `notebook_path`, deny = exit 2 + stderr, PostToolUse context via
  `hookSpecificOutput.additionalContext`). `pre-edit.sh`: dormant fast path
  (pure-sh `test -f`, no jq until a session exists — C3/C7), muzzle+seam-guard,
  doc whitelist (D6: anchored control docs always; archive never; D19: docs/
  only in FINISH), BUILD seam match per D23 (exact + `dir/` grant), canonicalizes
  the absolute path against root (D4), matches Edit|Write|MultiEdit|NotebookEdit.
  `bash-guard.sh`: D21 fence (STATE/SEAM/`plumbline mode` always blocked; write
  patterns blocked outside BUILD/SPIKE). `post-edit.sh`: D25 light tier
  (file-scoped oxlint+ast-grep, additionalContext, always exit 0, no-op when
  tools absent; tsc deferred). jq present (1.7.1) with BSD-sed fallbacks.
  shellcheck clean; 60 vitest tests via synthetic stdin JSON (D14), paths
  realpath'd for macOS /var symlinks. RESOLVED the D9/D18 tension in code: the
  muzzle allows code edits only in BUILD; SPIKE locks the main tree like DESIGN
  (D18, ratified) since spike edits happen in hook-dormant worktrees (D9). No
  out-of-seam edits; no new decisions; no open questions.
- 2026-06-11 — STOP at step 5 (human-gated). Steps 1–4 built autonomously
  under the heavy gate alone; the tool now enforces its own boundary but is not
  yet registered. AUTONOMOUS PREP DONE: `scripts/dev-install.sh` built and
  verified against a throwaway HOME — registers the 3 hooks (PreToolUse
  Edit|Write|MultiEdit|NotebookEdit → pre-edit, Bash → bash-guard; PostToolUse
  → post-edit) pointing at this working tree's hooks/, idempotent (run twice ⇒
  byte-identical settings.json), backup to settings.json.plumbline-bak,
  `--uninstall` removes only our entries, merge preserves unrelated keys/hooks;
  shellcheck clean. Sidecar RETROFITTED well-formed: `.plumbline/checkpoints`
  (baseline ae79436 + steps 1–4 SHAs) and `.plumbline/config`
  (check=pnpm run check) — verified `revert --to n` and `revert` parse it, so
  done/revert work from step 6. REMAINS FOR THE HUMAN: review + run
  dev-install.sh against the real ~/.claude/settings.json, reload Claude Code,
  run the live muzzle probe (DESIGN refuses an edit to src/cli.ts; BUILD-with-
  seam allows it; a sessionless scratch dir is untouched), then commit
  `plumbline: step 5 done`. `scripts/dev-install.sh` is currently UNCOMMITTED
  pending that probe. Caveat to check during the probe: run `plumbline build`
  from a terminal WITHOUT CLAUDECODE set, else the D21 guard refuses it.
- 2026-06-11 — Frame clarified (human call: option A). v1 stays the Claude Code
  instantiation. The deciding/executing core (CLI + `.plumbline/` sidecar + git)
  is agent- and model-agnostic; only the enforcement layer (hooks + skills +
  CLAUDECODE guard) is Claude-Code-specific — inherent, since enforcement means
  intercepting the agent's edit tool. Recorded in the Frame's NOT-doing list and
  parked as a future "other-agent adapters" Plumbline. No structural change to
  the v1 build; step 8's README will name the core/adapter boundary. Still
  paused at the step-5 probe.
- 2026-06-11 — Step 5 DONE (checkpoint `ffd1318`) — first checkpoint taken
  with the hooks LIVE. `scripts/dev-install.sh` registered the 3 hooks into the
  real `~/.claude/settings.json` (idempotent; `--uninstall`+reinstall verified
  by the author). Live probe passed on this repo: in DESIGN the muzzle blocked
  code edits (and bash-guard caught a `.plumbline/STATE` read and a stray
  `2>&1`); after `build 5` (seam = `scripts/dev-install.sh`) the seam-guard
  blocked an out-of-seam `src/cli.ts` edit with the D11/D23 model-directed
  message. `done` ran `pnpm check` green, committed, recorded the SHA, → DESIGN.
  The tool now builds itself under its own boundary.
- 2026-06-11 — Step-6 boundary decision: D19's deferred FINISH-entry verb name
  kept as `wrap` (author call, "for now") → D28. Step 6 seam gains
  `src/verbs/wrap.ts`; `wrap` enters FINISH, `finish` stays the closing gate.
  Next act: `build 6`.
- 2026-06-11 — DESIGN edit (still paused at the step-5 probe): the installer's
  global-only registration surfaced as an unexamined assumption — no D#
  weighed global vs project scope. Resolved with Rob → D27: `plumbline setup`
  defaults to `~/.claude/settings.json`; `--project` merges into committable
  `<repo>/.claude/settings.json` (team self-enrollment, `~`-portable command
  paths); `--local` into untracked `settings.local.json`. Hooks/skills still
  install once under `~/.claude/` — scope moves only the registration. Step
  8's done-when extended (per-scope merge tests against tmp HOME + fixture
  repo; README documents all three scopes); seam unchanged. No new open
  questions.
- 2026-06-11 — Step 6 DONE (checkpoint `649a623`) — the first step built
  end-to-end under live enforcement inside a declared seam. The Finish phase +
  spike lifecycle: `wrap` (D19/D28) sets STATE=FINISH so `/plumbline-report`
  and `/plumbline-docs` can run; `finish` (D19/D20) refuses without
  `.plumbline/report.md`, appends the checkpoint SHA list to the report,
  archives intent+build-log+report to `archive/<date>-<slug>/` (`-2`
  disambiguation so a second session lands ALONGSIDE the first, never on top),
  clears the actives, and deletes SEAM/STEP then STATE LAST (the muzzle comes
  off exactly at session end) — never touching git (C5/D20). `spike "<slug>"
  [opts]` (D18) creates sibling worktrees + `spike/<slug>-<opt>` branches
  OUTSIDE the repo root (default opts a/b; hook-dormant by construction since
  the untracked sidecar isn't in a fresh checkout), STATE=SPIKE; `spike done`
  removes every spike worktree+branch and returns to DESIGN with a verdict
  reminder. `src/lib/archive.ts` is the archive helper (report/archive paths
  derived from the exported `sidecarDir`, so sidecar.ts stayed untouched and
  out-of-seam). All three verbs wired into dispatch; `wrap` added to the help
  table and TRANSITION_VERBS (D21). 11 new vitest tests (71 total green)
  against tmp fixtures with stub checks (D14): finish-refuses-without-report,
  full archive layout + SHA list, control-file teardown, second-session-
  alongside (no overwrite), spike create/teardown, wrap's DESIGN-only guard,
  and the D21 CLAUDECODE refusal. SPIKE's main-tree DESIGN-lock is the step-4
  hook's job (ratified D9/D18), not step 6's — so no lock test lives here.
  Worktree git calls run directly in spike.ts (the only place Plumbline brews
  branches) rather than via lib/git.ts, keeping the work in-seam — no seam
  revision needed this step. No out-of-seam edits; no new decisions; no open
  questions.
- 2026-06-11 — Step 7 DONE (checkpoint `dcce561`). The five skills with enforced
  contracts, the chat-pane half of the surface that the CLI + hooks back. Three
  reinforcing layers per skill (D12): `disable-model-invocation: true` on all
  five (the human owns every trigger); `model:` haiku for `/park` (transcription)
  and opus for the other four (judgment); every body opens with the inline
  `!`plumbline status`` pre-injection and a `## Wrong-state refusal` that reads it
  and names the verb that fixes a wrong state (C8). `/park`'s directory is the
  BARE `park` (the `plumbline:` prefix is reserved for future plugin packaging);
  the other four are `plumbline-*` (D12: command name = directory name). Handoff
  edges pinned per D13: `/plumbline-interrogate` (DESIGN) attacks the frame in the
  PROBLEM space only, appends to `## Open questions` and NEVER `## Decisions`, then
  ends its turn; `/plumbline-triage` (DESIGN, step boundary) proposes one class
  per parked item (default tangent) and writes only after per-item human confirm.
  `/park` (any active session) carries NO Edit and NO Write — Bash only
  (`Bash(plumbline status:*)`, `Bash(plumbline park:*)`) — composes one tidy line,
  shows it, and shells `plumbline park` only after in-turn approval; the dumb
  capture stays the CLI, never an edit. `/plumbline-report` (FINISH) writes EXACTLY
  `.plumbline/report.md` with the five required sections (what shipped; decisions
  and why; parked items and their triage; final status; deferred tangents), and
  tells the human to `plumbline wrap` first if not yet in FINISH (D28).
  `/plumbline-docs` (FINISH-only per D19) is conservative by default — a bug fix
  usually spawns no doc. `test/skills.test.ts` is a STATIC content-contract suite:
  a hand-rolled, zero-dep frontmatter parser (functional, `node:` builtins, no
  classes/default export per C1) reads each SKILL.md and asserts every contract
  above — 48 new tests, 119 total green. `pnpm check` green across all tiers
  (markdownlint included — the SKILL.md files are clean markdown). The skill files
  ship in the working tree at `skills/`; step 8's `setup` installs them under
  `~/.claude/skills/`. No out-of-seam edits; no new decisions; no open questions.
- 2026-06-11 — Step 8 DONE (checkpoint `d73afe3`) — the build is complete; all 8
  steps are checkpointed. The installer + e2e close-out. `src/lib/settings.ts` is
  the `settings.json` hook-merge ported from dev-install's jq into pure TS (zero
  deps, node builtins — C2): strip-our-entries-then-re-add for byte-identical
  re-runs, preserving every foreign hook and unrelated key, with a single
  `.claude/plumbline/hooks/` marker that recognizes ours in both the absolute and
  `~`-prefixed command forms. `src/verbs/setup.ts` (`plumbline setup`, replacing
  dev-install per D27) copies hooks → `~/.claude/plumbline/hooks/` and skills →
  `~/.claude/skills/` once, then registers into the scope's settings file: default
  global (absolute paths, its file is under `~`), `--project` →
  `<repo>/.claude/settings.json`, `--local` → `settings.local.json`, the two repo
  scopes writing `~`-portable command paths so committed settings carry no
  machine-absolute home (D27); `--uninstall` strips the registration and leaves the
  installed files; warns on PATH + restart. `test/setup.test.ts` (9 tests) pins HOME
  to a throwaway dir per case (real `~/.claude` never touched) and covers
  copy-hooks+skills (executable bit checked), merge-into-existing, no-hooks-key,
  byte-identical re-run, `--uninstall` (foreign hooks survive), each scope writes
  ONLY its own file, `~`-portable project paths, and the non-git `--project`
  refusal. `test/e2e.test.ts` drives one full session in a fixture repo with the
  LIVE pre-edit hook in the loop: start → build 1 → hook BLOCKS `src/other.ts`
  (exit 2) and ALLOWS `src/widget.ts` (exit 0) → done → park → report artifact →
  wrap → finish, then asserts the archive holds intent+build-log+report, the parked
  line and `- step 1 <sha>` SHA list survived into it, the control files are gone,
  and the hook is dormant again. `README.md` (new, root) documents install across
  all three D27 scopes, the as-built verb/skill table, the core/adapter boundary
  (the parked step-5 item — CLI+sidecar are agent-agnostic; only hooks/skills are
  the Claude Code adapter), and the three ratified residual gaps (D20 archive
  local-only, D21 fence-not-wall, D25 tsc deferral). `scripts/dev-install.sh` header
  clarified: dev installer (working-tree hooks) vs `plumbline setup` (production
  copy). One in-build fix: tsc flagged an index-signature mismatch in settings.ts
  (spreading `HookMap`'s `…|undefined` values) — widened the local annotation, no
  design change. 11 test files, 129 tests green. No out-of-seam edits; no new
  decisions; no open questions. REMAINS: finish THIS session through its own gate
  (report → wrap → finish) to close the dogfood — the last line of step 8's
  done-when and the Frame's "done looks like".
- 2026-06-11 — Step 7 DONE (checkpoint `dcce561`). The five skills with enforced
  contracts, the chat-pane half of the surface that the CLI + hooks back. Three
  reinforcing layers per skill (D12): `disable-model-invocation: true` on all
  five (the human owns every trigger); `model:` haiku for `/park` (transcription)
  and opus for the other four (judgment); every body opens with the inline
  `!`plumbline status`` pre-injection and a `## Wrong-state refusal` that reads it
  and names the verb that fixes a wrong state (C8). `/park`'s directory is the
  BARE `park` (the `plumbline:` prefix is reserved for future plugin packaging);
  the other four are `plumbline-*` (D12: command name = directory name). Handoff
  edges pinned per D13: `/plumbline-interrogate` (DESIGN) attacks the frame in the
  PROBLEM space only, appends to `## Open questions` and NEVER `## Decisions`, then
  ends its turn; `/plumbline-triage` (DESIGN, step boundary) proposes one class
  per parked item (default tangent) and writes only after per-item human confirm.
  `/park` (any active session) carries NO Edit and NO Write — Bash only
  (`Bash(plumbline status:*)`, `Bash(plumbline park:*)`) — composes one tidy line,
  shows it, and shells `plumbline park` only after in-turn approval; the dumb
  capture stays the CLI, never an edit. `/plumbline-report` (FINISH) writes EXACTLY
  `.plumbline/report.md` with the five required sections (what shipped; decisions
  and why; parked items and their triage; final status; deferred tangents), and
  tells the human to `plumbline wrap` first if not yet in FINISH (D28).
  `/plumbline-docs` (FINISH-only per D19) is conservative by default — a bug fix
  usually spawns no doc. `test/skills.test.ts` is a STATIC content-contract suite:
  a hand-rolled, zero-dep frontmatter parser (functional, `node:` builtins, no
  classes/default export per C1) reads each SKILL.md and asserts every contract
  above — 48 new tests, 119 total green. `pnpm check` green across all tiers
  (markdownlint included — the SKILL.md files are clean markdown). The skill files
  ship in the working tree at `skills/`; step 8's `setup` installs them under
  `~/.claude/skills/`. No out-of-seam edits; no new decisions; no open questions.
