<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.
-->

# Worktree-proof sidecar restructure

**STATE:** DESIGN
**Phase** (bookkeeping while in DESIGN): plan authored — awaiting human review
**Size:** medium

## Frame

- **Problem:** Four compounding failures surfaced by a user's field test (2026-07).
  (1) `start` crashes in linked worktrees — `excludeSidecar` writes to
  `$(git rev-parse --absolute-git-dir)/info/exclude`, which in a linked worktree is
  `.git/worktrees/<name>/info/exclude`: the dir doesn't exist (ENOENT), and even a
  successful write lands in a file git never reads. (2) The artifacts are local-only
  (repo D20), so a build's record — including the intent.md the tester called
  "better documentation than most human PRs" — dies with `git worktree remove` and never
  reaches the PR. (3) Checkpoint history is opaque: every commit is
  "plumbbob: step N done". (4) Config is a bespoke flat file with no
  project/personal split, so preferences like default `--auto` have nowhere to live.
- **Smallest thing that solves it:** split the sidecar into a **tracked artifact
  plane** (`builds/<slug>/`) and an **untracked control plane** (root `ACTIVE`
  pointer + per-build markers); fix the exclude path with `--git-path`; make
  checkpoint commits self-describing (title in the subject, proportional body via
  stdin); replace `config` with a settings ladder.
- **Done looks like:** `start` → steps → `finish` runs green **inside a linked
  worktree**; a finished build's folder merges with its branch and appears in the PR
  diff; `git log --oneline` over a session reads as a narrative
  (baseline → plan → titled steps → finish); `pnpm run check` green; docs and
  decisions.md updated.
- **Explicitly NOT doing:** folding `plumbbob start` into `/pb-plan` (ceremony
  reduction is its own future build); new `init --host` targets; any regression
  toward enforcement/locking (the pivot to guidance stands); version bump or release
  (Rob cuts releases via `/version`).

## Architecture sketch

```
.plumbbob/
├── settings.json          # tracked   — project defaults: {"check": "...", "auto": false}
├── settings.local.json    # untracked — personal overlay + the per-worktree cursor:
│                          #   {"auto": true, "activeBuild": "<slug>"}
└── builds/<slug>/         # tracked   — one self-contained folder per build
    ├── intent.md          #   rides the branch → shows up in the PR
    ├── build-log.md
    ├── report.md          #   written at finish
    ├── checkpoints        #   baseline/plan/step SHAs
    └── STEP, SEAM, SPIKE  # untracked in-flight markers (excluded via globs)

info/exclude (via `git rev-parse --git-path info/exclude`, common dir):
  .plumbbob/settings.local.json
  .plumbbob/builds/*/STEP
  .plumbbob/builds/*/SEAM
  .plumbbob/builds/*/SPIKE

build-target resolution (every verb):
  --build <slug> flag → activeBuild setting → sole entry in builds/ → refuse w/ hint

commit shape:  subject = "plumbbob: step N — <title>"   (CLI-owned, deterministic)
               body    = --body stdin heredoc (skill-composed, proportional)
                         | fallback: done-when + seam + diffstat (CLI-composed)
```

## Decisions

- D1: exclude via `git rev-parse --git-path info/exclude` — *because* per-worktree
  gitdirs have no `info/`, and git only ever reads the common file.
- D2: track `builds/<slug>/` artifacts, keep control state untracked — *because*
  artifacts must survive `git worktree remove` and ride the PR, while control state
  is per-worktree ephemera.
- D3: the cursor is `activeBuild` in `settings.local.json` — no `ACTIVE`/`STATE`
  file at all — *because* which build you're on is a user preference, so it lives
  with the other preferences; untracked keeps it per-worktree. The setting is the
  default the skills lean on; the `--build <slug>` flag keeps the CLI dumb and
  explicit (resolution: flag → setting → sole build in `builds/` → refuse).
- D4: `STEP`/`SEAM`/`SPIKE` live inside `builds/<slug>/` — *because* a paused build
  keeps its own in-flight state across `ACTIVE` switches; root markers can't say
  which build owns them.
- D5: the CLI always owns the commit subject; the body arrives via a `--body` flag
  reading a single-quoted stdin heredoc — *because* the CLI can't compose prose, and
  the heredoc mechanism already beat `-m` escaping and scratch-file handoff in
  commit-with-til.
- D6: deterministic fallback body = done-when + seam + diffstat — *because*
  hand-built/vibed checkpoints deserve informative history without a model turn.
- D7: settings resolution is CLI flag → `settings.local.json` → `settings.json` →
  built-in default — *because* it's Ridgeline's proven ladder, and `auto` is a
  personal preference so it belongs in the local overlay. `.plumbbob/config`
  (`check=`) is deleted; `check` becomes the `"check"` key in `settings.json`, not a
  field in `intent.md` — *because* the check command is project-scoped
  infrastructure (D24), not a per-build decision, and `intent.md` is tracked
  per-build (D2) so stashing it there would mean hunting branches to change the
  gate. `build-log.md`'s `{{CHECK}}` header line stays as a documentation echo only;
  `check.ts` reads settings, never the template.
- D8: `archive/` is retired; a finished build folder IS the archive — *because* it
  merges into main with the branch instead of dying with the worktree (supersedes
  repo D20).
- D9: `wrap` renamed `finish`, gutted to report + final commit + clear `ACTIVE` —
  *because* "the build" is now the system's noun (plan → build → finish), and repo
  D19's problem was the gate, not the word.
- D10: `revert` snapshots `builds/<slug>/` to temp, resets, restores as uncommitted
  changes — *because* tracked artifacts would otherwise lose park lines to
  `reset --hard` (preserves C4/never-destroy, the original D17 rationale).
- D11: plan approval gets its own commit (`checkpoint --plan` →
  "plumbbob: plan — <title>") — *because* the first step's diff must not absorb the
  plan scaffold; history reads baseline → plan → steps.
- D12: checkpoint's `stageAll` sweeps the intent `[x]` flip and build-log line into
  the step's own commit — *because* self-describing commits are the point; the
  `checkpoints` SHA line landing one commit late is accepted (git log holds the
  truth; finish's final commit catches the tail).
- D13: `start --local` opts out into a fully-untracked sidecar (today's behavior) —
  *because* some team repos won't accept tool folders in-tree; tracked stays the
  default and the documented model.
- D14: `wrap` → `finish` is a clean break — no compatibility alias — *because*
  pre-1.0 with a tiny user base is the time to fix it now, not carry deprecation
  baggage.
- D15: finish's final commit subject is `plumbbob: finish — <title>` — *because* it
  mirrors the step-checkpoint format exactly (`plumbbob: step N — <title>`), keeping
  one greppable shape across the whole history.
- D16: switch/resume is the first-class verb `use <slug>` (Q10), which validates
  the folder and re-points `activeBuild` — *because* Rob
  wants it while we're rejigging everything (Q4). One-active-per-worktree is
  enforced **by construction**: the cursor is a single scalar key in an untracked
  file, so it cannot point at two builds (Q6). It warns — but allows — leaving a
  build with a step in flight (that surviving in-flight state is D4's payoff); the
  same build active in two worktrees is ordinary git branch divergence, not
  plumbbob's to prevent.
- D17: `slugify` (+ collision handling) moves into `sidecar.ts` before `archive.ts`
  dies; `start` derives the slug from the title and REFUSES on collision with a
  hint to retitle or pass `--slug` — *because* the CLI stays dumb and explicit
  (Q5): no silent `-2` suffixes; whatever the cursor stores is already
  disambiguated.
- D18: the dirty-window trade is accepted with eyes open (Q9): between checkpoints,
  artifact edits are ordinary uncommitted changes, exposed to the user's own
  `git stash -u`/`reset --hard` reflexes exactly like the code being written —
  *because* the plan commit + per-step sweeps (D11/D12) shrink the window to the
  same one the code lives in, and `--local` (D13) retains the old immunity
  wholesale. The stale invariant comment at `git.ts:42` dies in step 5.

## Constraints

- C1: functional/procedural, node builtins only, zero runtime deps (repo C1/C2).
- C2: git footprint stays additive — stage/commit forward, `reset --hard` only to
  recorded checkpoint SHAs (repo C5).
- C3: hooks keep reading flat, greppable files (repo D7); at most one indirection
  (`cat ACTIVE` → build dir).
- C4: never destroy — no step, migration, or revert path may lose park lines,
  intent edits, or archived sessions.
- C5: no version/CHANGELOG bump in this build.
- C6: every git-touching change gets a subprocess test in a throwaway repo (repo
  D14), including at least one test inside a `git worktree add` linked worktree.

## Steps

1. [x] Fix the linked-worktree exclude crash — **done when:** a subprocess test that
   creates a linked worktree and runs `start` inside it passes, and the exclude line
   lands in the common gitdir's `info/exclude` (with `mkdirSync` on the parent)
   - seam: `src/lib/git.ts`, `src/lib/sidecar.ts`, `src/lib/__tests__/sidecar.test.ts`, `src/verbs/__tests__/start.test.ts`
2. [x] Step titles in checkpoint subjects — **done when:** the checkpoint commit
   subject is `plumbbob: step N — <title>` (existing `titleForStep`; falls back to
   `plumbbob: step N done` when intent has no title) and `checkpoint.test.ts`
   asserts it via `git log -1 --format=%s`
   - seam: `src/verbs/checkpoint.ts`, `src/verbs/__tests__/checkpoint.test.ts`
3. [x] `--body` stdin flag + deterministic fallback body — **done when:**
   `plumbbob checkpoint N --body <<'BODY'` produces a subject+body commit; without
   `--body` the body carries done-when + seam + diffstat; tests assert `%b`; the
   pb-build/pb-verify skills instruct a proportional body (no TIL scan)
   - seam: `src/lib/git.ts`, `src/verbs/checkpoint.ts`, `src/verbs/__tests__/checkpoint.test.ts`, `skills/pb-build/SKILL.md`, `skills/pb-verify/SKILL.md`
4. [x] Settings ladder replaces `config` — **done when:** `.plumbbob/config` is gone;
   `check.ts` resolves `"check"` via flag → `settings.local.json` → `settings.json`
   → default, with tests; `start` scaffolds `settings.json` (not `config`) and still
   stamps `build-log.md`'s `{{CHECK}}` line as a human-readable echo only;
   `configPath` is deleted from `sidecar.ts`; `auto` is a documented key the skills
   read
   - seam: `src/lib/settings.ts`, `src/lib/check.ts`, `src/lib/sidecar.ts`, `src/verbs/start.ts`, `src/lib/__tests__/settings.test.ts`, `src/lib/__tests__/check.test.ts`, `src/verbs/__tests__/start.test.ts`
5. [x] Layout core: `builds/<slug>/` + settings cursor + narrowed excludes —
   **done when:** `start` creates `.plumbbob/builds/<slug>/` (intent, build-log,
   checkpoints inside), sets `activeBuild` in `settings.local.json`, refuses on
   slug collision (D17); excludes narrow to the control patterns; `start --local`
   scaffolds today's fully-untracked layout instead (D13); `sidecar.ts` gains
   `slugify` + `activeBuild(root)` (flag → setting → sole build → null); stale
   `isDirty` comment deleted (D18); sidecar + start tests green
   - seam: `src/lib/sidecar.ts`, `src/lib/settings.ts`, `src/lib/git.ts`, `src/verbs/start.ts`, `src/lib/__tests__/sidecar.test.ts`, `src/verbs/__tests__/start.test.ts`
6. [x] Verbs + hook follow the layout; the switch verb lands — **done when:** every
   verb accepts `--build <slug>` and otherwise resolves via the cursor; build/
   status/checkpoint/revert/spike resolve `STEP`/`SEAM`/`SPIKE` under the resolved
   build; `plumbbob use <slug>` re-points the cursor, validates the
   folder, warns on an in-flight step; `status` with no cursor lists `builds/`
   instead of refusing; `post-edit.sh` finds the root by grepping
   `settings.local.json` for `activeBuild` (the sed pattern the hook already uses
   for `file_path`); full suite green
   - seam: `src/lib/sidecar.ts`, `src/lib/settings.ts`, `src/verbs/use.ts`, `src/verbs/build.ts`, `src/verbs/status.ts`, `src/verbs/revert.ts`, `src/verbs/spike.ts`, `src/verbs/wrap.ts`, `src/cli-core.ts`, `hooks/post-edit.sh`, `src/verbs/__tests__/`, `src/__tests__/cli-core.test.ts`
7. [x] Tracked-artifact safety: revert snapshot/restore + drift whitelist —
   **done when:** tests cover revert-to-step AND revert-to-baseline (where the
   build folder does not exist at the target SHA), with park lines and the whole
   folder intact after both (Q7); scope-drift warnings ignore `.plumbbob/builds/`
   - seam: `src/verbs/revert.ts`, `src/verbs/checkpoint.ts`, `src/lib/intent.ts`, `src/verbs/__tests__/revert.test.ts`, `src/verbs/__tests__/checkpoint.test.ts`
8. [x] Plan-approval commit — **done when:** `plumbbob checkpoint --plan` commits
   only `.plumbbob/builds/<slug>/` as `plumbbob: plan — <title>` (accepts `--body`),
   records `plan <sha>` in `checkpoints`; pb-plan skill invokes it at plan approval
   - seam: `src/verbs/checkpoint.ts`, `src/lib/git.ts`, `src/verbs/__tests__/checkpoint.test.ts`, `skills/pb-plan/SKILL.md`
9. [x] `wrap` → `finish`: rename, gut, retire `archive/` — **done when:**
   `plumbbob finish` writes report + final commit (subject
   `plumbbob: finish — <title>`, D15) + clears `ACTIVE` and markers with no archive
   copy; no `wrap` alias remains anywhere (D14); `archive.ts` deleted;
   `skills/pb-wrap/` → `skills/pb-finish/`; templates and `cli-core.ts` updated;
   `start.ts`'s "plumbbob finish" message is correct again; suite green
   - seam: `src/verbs/wrap.ts`, `src/verbs/finish.ts`, `src/lib/archive.ts`, `src/cli-core.ts`, `src/verbs/start.ts`, `skills/pb-wrap/`, `skills/pb-finish/`, `templates/intent.md`, `templates/build-log.md`, `src/verbs/__tests__/`, `src/lib/__tests__/archive.test.ts`, `src/__tests__/cli-core.test.ts`
10. [x] Migration + docs + decision log — **done when:** `doctor` detects a legacy
    flat sidecar and offers the move (archive entries → `builds/`, active session →
    a build folder, old `config` → `settings.json`); migration STAGES the moved
    files but never commits — the human owns that commit (Q8); a migrated build is
    "done" simply by not being the cursor; decisions.md gains the new entries (D17
    amended, D20 superseded); README + cli-reference + happy-path updated; suite
    green
    - seam: `src/verbs/doctor.ts`, `src/verbs/__tests__/doctor.test.ts`, `docs/`, `README.md`

## Open questions

*(none — Q1–Q10 all resolved 2026-07-02, see Verdicts.)*

## Verdicts

- 2026-07-02 — Q1 (`--local` opt-out) → chose **ship the flag** because some team
  repos won't track tool folders; tracked stays the default → D13.
- 2026-07-02 — Q2 (`wrap` compat alias) → chose **clean break, no alias** ("fix it
  now") because pre-1.0 is the time to rename without baggage → D14.
- 2026-07-02 — Q3 (finish commit subject) → chose **`plumbbob: finish — <title>`**,
  the exact step-checkpoint format with `finish` in place of `step N` → D15.
- 2026-07-02 — Q4 (switch/resume in scope?) → chose **in scope now** ("we're here
  rejigging everything") → D16, folded into step 6.
- 2026-07-02 — Q5 (cursor home) → chose **`activeBuild` in `settings.local.json` +
  explicit `--build <slug>` param**; the ACTIVE file is dead before it was born;
  `slugify` moves to `sidecar.ts` → D3 rewritten, D17.
- 2026-07-02 — Q6 (enforce one-active-per-worktree?) → **enforced by construction**:
  a scalar settings key per worktree cannot point at two builds; switch re-points
  the one cursor rather than multiplying it → D16.
- 2026-07-02 — Q7 (revert-to-baseline deletes the folder) → folded into step 7's
  done-when: test reverts to baseline, folder + park lines survive → D10.
- 2026-07-02 — Q8 (migration commits history into git?) → **stage, never commit**;
  the human owns that commit → step 10.
- 2026-07-02 — Q9 (isDirty invariant lost) → confirmed lost and **accepted**: the
  exposure window equals the code's own; `--local` keeps the old immunity → D18.
- 2026-07-02 — Q10 (switch verb name) → chose **`use`** (`nvm use`-shaped; one word
  covers both switching and resuming) → D16, step 6.
