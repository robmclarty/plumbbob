# Implement Plumbline v1 from the spec

**STATE:** DESIGN
**Phase:** decide
**Size:** medium

<!-- Bootstrap note: this session was scaffolded BY HAND because the tool it
builds does not exist yet. Steps 1–5 run under the heavy gate only (`pnpm
check`); from step 5's live probe onward, the tool enforces its own build. -->

## Frame

- **Problem:** The process exists only as prose (`docs/plumbline-README.md`).
  Nothing enforces the deciding/executing boundary, so today it runs on
  willpower — the exact failure mode the method exists to remove.
- **Smallest thing that solves it:** The README's v1 surface, no more: the
  `plumbline` CLI verbs, the session-gated hooks (pre-edit muzzle+seam-guard,
  light post-edit feedback), the five skills, and a global installer — working
  on this machine, for one user, dogfooded on its own build.
- **Done looks like:** This repo's own build session is finished through its
  own `finish` gate, with the report archived in `.plumbline/archive/`; an e2e
  test drives start → build → done → finish in a fixture repo; a live probe
  shows the muzzle blocking an out-of-seam edit; `pnpm check` is green.
- **Explicitly NOT doing:** Ridgeline integration; archive indexing/retrieval;
  plugin packaging (it would rename `/park` to `/plumbline:park`); Windows;
  multi-user; an adversarial-proof muzzle (it is a fence, not a wall — see Q4);
  spike timebox enforcement.

## Architecture sketch

```
 editor terminal (human-only verbs)      chat pane (human-triggered skills)
 ┌─────────────────────────────────┐    ┌──────────────────────────────────┐
 │ plumbline CLI — TS, node>=24,   │    │ /plumbline-interrogate    (opus) │
 │ zero runtime deps               │    │ /park → shells `plumbline park`  │
 │  start build review done revert │    │                          (haiku) │
 │  park finish spike status mode  │    │ /plumbline-triage|report|docs    │
 │  setup                          │    │                           (opus) │
 └───────────────┬─────────────────┘    └───────┬──────────────────────────┘
                 │ reads/writes                 │ pre-inject !`plumbline status`
                 ▼                              ▼
        .plumbline/ sidecar  ◄── greps ──  hooks (POSIX sh, global,
          STATE SEAM STEP checkpoints      session-gated: no STATE → allow)
          intent.md build-log.md             pre-edit.sh   muzzle+seam-guard
          report.md archive/                 bash-guard.sh per Q4
                 │                           post-edit.sh  light feedback
                 ▼
        git — additive only: baseline, `plumbline: step n done`
        checkpoints, reset --hard reverts to recorded SHAs
```

## Decisions

- D1: CLI in TypeScript, run natively by Node ≥ 24 (`erasableSyntaxOnly`,
  `node:` builtins only, zero runtime deps, hand-rolled argv dispatch) —
  *because* the CLI parses intent.md and JSON-merges settings.json (painful in
  sh) and native type-stripping kills the build step.
- D2: Hooks stay POSIX sh with a pure-sh dormant fast path (`test -f` before
  any JSON parsing) — *because* they fire on every edit and the no-session
  path must stay at microseconds.
- D3: Hooks are built from the official hooks docs, not the README pseudocode
  — *because* the pseudocode's `$EDIT_PATH` env var does not exist; real input
  is JSON on stdin (`tool_input.file_path`), deny is exit 2 + stderr-to-model.
- D4: SEAM holds repo-root-relative exact file paths, one per line; `build <n>`
  normalizes when writing; the hook canonicalizes the incoming absolute path
  against the discovered root before `grep -qFx` — *because* as specced
  (absolute vs relative) the guard would block every in-seam edit.
- D5: The pre-edit matcher covers `Edit|Write|MultiEdit|NotebookEdit` —
  *because* `Edit` alone leaves two editing tools unmuzzled.
- D6: Doc whitelist is anchored to `<root>/.plumbline/intent.md` and
  `build-log.md` (never bare `*/intent.md` suffix match); `archive/**` is
  always blocked — *because* suffix matching would whitelist archived copies.
- D7: A `STEP` sidecar file holds the in-flight step number — *because* `done`
  needs it and control state must never require markdown parsing.
- D8: `done` stages `git add -A` (sidecar invisible to git per Q3) and warns,
  listing any committed paths outside the SEAM — *because* the checkpoint must
  capture the whole step while still surfacing scope drift.
- D9: SPIKE allows edits with no seam constraint (mode table, muzzle rule, and
  seam-guard prose agree; the pseudocode's `BUILD|SPIKE` seam-grep is a spec
  bug); spike worktrees live as siblings outside the repo and are
  hook-dormant by construction — *because* untracked sidecars don't exist in
  worktrees, so "throwaway" falls out of the session gate for free.
- D10: Templates ship inside the package (`templates/`); `docs/` keeps the
  canonical commented versions — *because* the global bin must scaffold any
  repo without reaching back into this one.
- D11: Every block message is written for the MODEL: state what was blocked,
  say "do not retry; park it or report to the human" — *because* hook denials
  are delivered to Claude, not the human, and a thrashing model is an
  attention event.
- D12: Skill layer per spec, confirmed implementable: five fixed names,
  `disable-model-invocation: true` on all, `model:` haiku for /park and opus
  for the rest, bodies open with a `!`plumbline status`` pre-injection and a
  wrong-state refusal; /park appends only by shelling `plumbline park`, never
  via Edit — *because* command name = directory name and the three reinforcing
  layers must hold mechanically.
- D13: Skill contracts pin the handoff edges: interrogate appends only to
  intent.md Open Questions (never Decisions) and ends its turn; triage
  proposes per item, default tangent, writes only after per-item human
  confirmation — *because* those two skills are where deciding would otherwise
  slide back into the chat.
- D14: Tests run CLI verbs and hook scripts against fixture git repos in tmp
  dirs (synthetic stdin JSON for hooks); fixture repos use a stub check
  command, never the real `pnpm check` — *because* vitest invoking itself
  recursively hangs the suite.
- D15: First acts of step 1: pin `devEngines` to exact `11.1.2` (the `^` range
  breaks every pnpm command today — verified) and create the initial commit
  (HEAD is currently unborn — verified; `start` needs a baseline) — *because*
  the repo cannot run anything at all until both land.
- D16: Heavy gate only ever runs inside `review`/`done`; light tier never
  blocks — *because* the gate belongs on the deliberate boundary, not the
  keystroke (spec, reaffirmed as a constraint below).
- D17: `.plumbline/` is untracked: `start` appends it to `.git/info/exclude`
  — *because* a tracked sidecar makes C4 unsatisfiable (`reset --hard` would
  wipe every park line and intent edit made after the checkpoint — destroying
  exactly the captured attention the revert exists to protect). The residual
  archive question stays open as Q3.

## Constraints

- C1: Functional/procedural only — no class/this/extends/inherits; no default
  exports (the repo's own ast-grep rules enforce both from step 1).
- C2: CLI has zero runtime dependencies; `node:` builtins only.
- C3: Hook dormant path adds no measurable latency to a no-session repo; no
  node startup inside pre-edit.
- C4: Never destroy captured attention: park-list lines and intent.md edits
  must survive `revert` (test-pinned); archive-then-clear, never delete.
- C5: Additive-only git: never rewrite history, never touch pushed commits;
  `finish` never touches git.
- C6: The tool stays out of Frame — framing-before-chat gets no mechanical
  backing, deliberately.
- C7: No session ⇒ zero behavior change anywhere (session-gating is the
  calibration mechanism: tiny work must stay free).
- C8: All block/refusal messages name the verb that fixes the situation.

## Steps

1. [ ] Toolchain bootstrap: heavy gate green, CLI stub, first commit —
   **done when:** `pnpm install` and `pnpm check` (tsc, oxlint, ast-grep,
   vitest, knip, markdownlint; fallow per the Q7c ruling) exit 0;
   `node src/cli.ts help` prints the verb table; `git rev-parse --verify HEAD`
   resolves (initial commit exists)
   - seam: `package.json`, `pnpm-lock.yaml`, `.gitignore`, `tsconfig.json`,
     `vitest.config.ts`, `knip.json`, `.oxlintrc.json`, `sgconfig.yml`,
     `rules/no-class.yml`, `rules/no-default-export.yml`,
     `.markdownlint.jsonc`, `src/cli.ts`, `test/cli.test.ts`
2. [ ] Sidecar + git lib and session verbs: `start`, `status`, `mode`, `park`
   — **done when:** vitest passes in fixture repos: `start` scaffolds
   `.plumbline/` at the git toplevel (STATE=DESIGN, templates copied,
   `baseline <sha>` line 1 of checkpoints, sidecar excluded per Q3), refuses
   on dirty tree / existing session / non-git dir, re-scaffolds after finish
   without touching `archive/`; `park` appends one raw line under the Park
   list; `status` prints state or NO ACTIVE SESSION; the Q4 ruling for
   model-invoked verbs is enforced once in dispatch (transition verbs refuse
   under CLAUDECODE, park exempt) and tested
   - seam: `src/lib/sidecar.ts`, `src/lib/git.ts`, `src/verbs/start.ts`,
     `src/verbs/status.ts`, `src/verbs/mode.ts`, `src/verbs/park.ts`,
     `src/cli.ts`, `templates/intent.md`, `templates/build-log.md`,
     `test/helpers/fixture-repo.ts`, `test/start.test.ts`,
     `test/session-verbs.test.ts`
3. [ ] Build-loop verbs: `build <n>`, `review`, `done`, `revert` —
   **done when:** vitest passes: the strict intent parser takes the nth item
   under `## Steps`, requires exactly one `seam:` sub-line of backtick tokens,
   refuses precisely on globs/absences; `build` writes normalized SEAM + STEP
   and STATE=BUILD; `review` flips to REVIEW only on check exit 0; `done`
   refuses on red, commits `plumbline: step n done`, appends `step n <sha>` to
   checkpoints, returns to DESIGN; `revert [--to n]` resets --hard to the
   recorded SHA (baseline fallback), removes untracked files under SEAM paths
   only, returns to DESIGN; `build <n>` from REVIEW re-enters BUILD with the
   same seam and no new checkpoint; a pinned test proves mid-step park lines
   survive revert
   - seam: `src/lib/intent.ts`, `src/lib/check.ts`, `src/verbs/build.ts`,
     `src/verbs/review.ts`, `src/verbs/done.ts`, `src/verbs/revert.ts`,
     `src/cli.ts`, `test/intent.test.ts`, `test/build-loop.test.ts`
4. [ ] Hooks: `pre-edit.sh` (muzzle+seam-guard combined), `bash-guard.sh`
   (per Q4), `post-edit.sh` (light feedback) — **done when:** hook tests pass
   via synthetic stdin JSON: dormant allow with no sidecar; DESIGN blocks a
   src/ write with a model-directed park message (exit 2); anchored doc
   whitelist allows the two docs in every state and blocks `archive/**`; BUILD
   allows an absolute path matching a SEAM line from a subdirectory cwd and
   blocks out-of-seam, with matching semantics per the Q6 ruling (exact lines,
   plus `dir/` prefix if adopted); MultiEdit/NotebookEdit matched;
   `post-edit.sh` always exits 0, reports file-scoped lint failures via
   additionalContext, no-ops when tools are absent
   - seam: `hooks/pre-edit.sh`, `hooks/bash-guard.sh`, `hooks/post-edit.sh`,
     `test/helpers/run-hook.ts`, `test/hooks.test.ts`
5. [ ] Dev-register the hooks globally and prove them live; open the dogfood
   session — **done when:** `scripts/dev-install.sh` is idempotent (run twice
   ⇒ identical `~/.claude/settings.json`, backup written, `--uninstall`
   works); in a live Claude Code session: DESIGN refuses an edit to
   `src/cli.ts`, BUILD-with-seam allows it, a sessionless scratch dir is
   untouched; this repo's hand-scaffolded sidecar is retrofitted well-formed
   (`checkpoints` file with `baseline <initial-commit-sha>` plus the SHAs of
   steps 1–4's commits as hand-recorded checkpoints) so `done`/`revert` work
   from step 6 on; the session is then live and steps 6–8 build under
   enforcement
   - seam: `scripts/dev-install.sh`
6. [ ] Finish phase + spike lifecycle: report gate, archive-then-clear, spike
   verbs — **done when:** vitest passes: `finish` refuses without
   `.plumbline/report.md`; with it, appends the checkpoint SHA list to the
   report (spec: "finish lists the SHAs in the report"), archives intent +
   build-log + report to `archive/<date>-<slug>/`, clears actives, deletes
   STATE/SEAM/STEP last, leaves git untouched; second session archives
   alongside the first; FINISH entry and spike verb behavior match the Q1
   ruling
   - seam: `src/verbs/finish.ts`, `src/verbs/spike.ts`, `src/lib/archive.ts`,
     `src/cli.ts`, `test/finish.test.ts`, `test/spike.test.ts`
7. [ ] The five skills with enforced contracts — **done when:**
   `test/skills.test.ts` parses each SKILL.md and asserts:
   `disable-model-invocation: true`; model pins per D12; /park's allowed-tools
   exclude Edit/Write and its body requires in-turn human approval of the
   composed line before shelling the append; every body opens with the status
   pre-injection and a wrong-state refusal; interrogate carries the
   Open-Questions-only contract and triage the propose-then-human-calls-it
   contract; report's body pins the required sections (what shipped, decisions
   and why, parked items and their triage, final status, deferred tangents)
   and writes exactly `.plumbline/report.md`; docs' body carries the
   conservative-by-default posture (a bug fix usually spawns no doc);
   `pnpm check` green
   - seam: `skills/plumbline-interrogate/SKILL.md`, `skills/park/SKILL.md`,
     `skills/plumbline-triage/SKILL.md`, `skills/plumbline-report/SKILL.md`,
     `skills/plumbline-docs/SKILL.md`, `test/skills.test.ts`
8. [ ] Installer + e2e dogfood close-out — **done when:** `plumbline setup`
   (replacing dev-install) copies hooks to `~/.claude/plumbline/hooks/` and
   skills to `~/.claude/skills/`, merges settings.json idempotently
   (tested against a tmp HOME: merge-into-existing-hooks, no-hooks-key,
   repeat-byte-identical), warns on PATH/restart; `test/e2e.test.ts` drives a
   full session in a fixture repo (start → build 1 → hook blocks out-of-seam,
   allows in-seam → done → park → report → finish → archive populated);
   README documents install, the as-built verb table, and the residual gaps
   ratified in Q4/Q7; this session itself is finished through its own gate
   - seam: `src/verbs/setup.ts`, `src/lib/settings.ts`, `src/cli.ts`,
     `test/setup.test.ts`, `test/e2e.test.ts`, `README.md`,
     `scripts/dev-install.sh`

## Open questions

*(The interrogation confirmed these as genuine forks the spec does not settle.
Each has a proposed default — resolve by striking or amending the line, then
fold into Decisions. Q1–Q4 shape the verb table and hook logic, and Q7c is
consumed by step 1: resolve all of those before `build 1`. Q5–Q6 and Q7a/b can
wait until the step that consumes them.)*

- Q1: **SPIKE/FINISH reachability** — the state table has five states but no
  verb sets SPIKE or FINISH (and the spec disclaims `mode` as not-the-flow).
  *Proposed:* add `plumbline spike "<slug>"` (sibling worktrees + spike/
  branches, STATE=SPIKE) and `plumbline spike done` (remove worktrees+branches,
  STATE=DESIGN, verdict reminder); for FINISH either collapse it into DESIGN
  (finish stays the gate) or keep it entered via a small verb the report skill
  instructs you to run — keeping it is only worth it if Q2 gives FINISH a
  mechanical difference (docs/ writable). Sub-fork: during SPIKE should the
  MAIN tree stay DESIGN-locked (spec says throwaway-allowed; locking protects
  the half-done step)? — *resolve by:* decide
- Q2: **Muzzle whitelist scope** — as specced, the muzzle blocks the report
  and docs/ writes that FINISH requires (confirmed contradiction).
  *Proposed:* always allow `<root>/.plumbline/{intent,build-log,report}.md`;
  allow `docs/**` only when STATE=FINISH; never repo-wide `*.md`. —
  *resolve by:* decide
- Q3: **Archive is local-only in v1** — D17 settles untracked (C4 forces it:
  a tracked sidecar makes revert destroy captured attention), which means the
  archive never enters version control, against one reading of the spec's
  "history accumulates". *Proposed:* accept local-only for v1, state it in the
  README; a `finish --commit-archive` flag is parked as a future Plumbline. —
  *resolve by:* decide (confirm or veto D17's consequence)
- Q4: **Threat model for Bash** — the muzzle is fully porous to Bash (`cat >`,
  `sed -i`, `plumbline mode BUILD`, even self-editing STATE/SEAM), and the
  model could self-certify `plumbline done`. *Proposed:* declare it an
  assistive fence, not a wall, in the README; add one cheap `bash-guard.sh`
  blocking commands that touch STATE/SEAM or invoke `plumbline mode`, plus
  obvious write-redirect patterns outside BUILD/SPIKE; transition verbs refuse
  under the CLAUDECODE env var (park exempt); document the residual gap. —
  *resolve by:* decide
- Q5: **Dirty tree at `start`** — baseline excludes uncommitted work, so
  revert-to-baseline would destroy it. *Proposed:* refuse by default;
  `--allow-dirty` records HEAD with a loud revert warning. — *resolve by:*
  decide (consumed by step 2)
- Q6: **SEAM grammar extension** — exact files mean new files must be named in
  advance. *Proposed:* exact repo-relative file lines, plus one extension: a
  line ending in `/` grants the directory by prefix match. — *resolve by:*
  decide (consumed by steps 3–4: the parser writes it, the guard matches it)
- Q7: **Check-stack policy** — (a) heavy check command: hardcode `pnpm run
  check` vs a `check=` line in `.plumbline/config` written by start;
  (b) light tier drops tsc (file-scoped oxlint+ast-grep only; tsc heavy-only
  until a daemon) against the spec's letter that type errors compound;
  (c) knip AND fallow are redundant in this repo's own check — keep which?
  *Proposed:* config line with pnpm default; bless the tsc deferral; keep knip,
  run fallow via MCP out-of-band. — *resolve by:* decide (Q7c consumed by
  step 1, so it joins the before-`build 1` group; Q7a by steps 2–3 — start
  writes the config line, review/done read it; Q7b by step 4)

## Verdicts

- 2026-06-10 — Interrogation run (6 lenses, 57 agents, every hole
  adversarially verified against the spec): 45 holes confirmed → folded into
  D3–D9/D15 and Q1–Q7; 3 claimed holes refuted — SPIKE-is-seamless is already
  settled by the spec's prose (→ D9), skills as sanctioned transition sources
  is already implied (→ Q1 mechanism), and interrogate's problem-space-only
  scoping is prompt-level by design (→ D13).
