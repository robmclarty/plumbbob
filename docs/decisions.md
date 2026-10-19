# Decisions and constraints: the D and C key

PlumbBob's design history is recorded as numbered decisions (`D`) and hard constraints
(`C`). Every entry carries a short slug, and every reference site writes the number
*with* its slug (`D17 (two-planes)`, `C1 (functional-only)`), so a reference reads on
its own instead of sending you hunting ([**D74 (glossed-citations)**](#d74), which records
how the rendering changes by surface and which slot of the gate enforces it). The
code comments state each rule's *why* in plain language and do not cite these tags; the
tags still appear in a few places a reader can hit: some CLI output lines (for example the
latch's settings-`auto` note), some test titles, and the research notes under
`research/`. This page is the key: it defines each tag and its slug.

Some numbers (`D2`, `D5`, `D11`, `D12`, `D21` among them) belonged to superseded decisions
and are no longer referenced. (A build's *own* `intent.md` numbers its decisions from `D1`
locally; comments citing a build-local number are renumbered to this key when the work
lands; [**D33 (info-exclude)**](#d33)–[**D38 (cli-owns-slugs)**](#d38) below came in that way from the July 2026 worktree restructure,
[**D71 (visible-reconcile)**](#d71)–[**D73 (subject-length-soft)**](#d73) from the July 2026 commit-subjects build,
[**D74 (glossed-citations)**](#d74)–[**D75 (two-gates)**](#d75) from the 2026-07-31 citations build, and
[**D76 (resolved-on-opener)**](#d76)–[**D77 (placeholder-uncounted)**](#d77) from the 2026-07-18
intent-legibility build, and [**D80 (cli-renders-model-relays)**](#d80)–[**D84 (one-liner-register)**](#d84)
from the 2026-08-28 presentation build, and [**D87 (pause-once)**](#d87)–[**D89 (block-once)**](#d89)
from the 2026-10-08 said-once-said-whole build, and [**D90 (notice-not-turn)**](#d90)–[**D94 (auto-and-stops)**](#d94)
from the 2026-10-17 build-ranges build, and [**D95 (run-verb)**](#d95)–[**D108 (order-label)**](#d108)
from the 2026-10-17 runs-and-the-stop-card build.)

## Constraints (C)

Hard rules the code must honor. [**C1 (functional-only)**](#c1), [**C2 (few-deliberate-deps)**](#c2), and the statically checkable edges of
[**C4 (never-destroy)**](#c4)–[**C6 (no-advance-verb)**](#c6) are machine-enforced by the ast-grep rules in `rules/` (run via `pnpm check`);
the rest are upheld by review and the design of the code.

- <a id="c1"></a>**C1 (functional-only): Functional and procedural only.** No classes, no `this`, no default exports;
  every symbol has a stable named export. Enforced by `rules/no-class.yml` and
  `rules/no-default-export.yml`. *Tagged across* `src/**` and the test tree.
- <a id="c2"></a>**C2 (few-deliberate-deps): Node builtins plus a few deliberate dependencies.** *Amended*: the CLI imports
  `node:*`, relative paths, and an explicit allowlist of dependencies (currently one:
  `checkride`, our own sibling package, pinned exact, [**D32 (checkride-gate)**](#d32)). The old "zero runtime
  dependencies" wording had hardened into dogma; the rule was always a means
  (determinism, no supply-chain sprawl), not an end. Use a few packages as necessary
  (our own tools first), never a casual `npm install`; hand-crafting what a sibling tool
  already provides is the anti-pattern, not the dependency. Enforced by
  `rules/node-builtins-only.yml` (the allowlist lives in its regex). *Tagged in*
  `git.ts`, `sidecar.ts`, `plugins.ts`, `doctor.ts`, `cli-core.ts`.
- <a id="c3"></a>**C3 (bindings-not-logic): `harness.json` stays bindings + prose, never control flow.** A build's agent
  bindings file carries slot→agent maps and prose `note`s and nothing else; the moment it
  grows an `if`, a `retry`, or a `loop`, the doorway has failed its own spec. Control flow
  lives in *agents* (as code) and in *prose* (read by the host model), never in config
  (GitHub Actions' YAML-grown-a-language is the cautionary tale). *Tagged in* `agents.ts`,
  the `plan`/`step` skills, `docs/agents.md`.
- <a id="c4"></a>**C4 (never-destroy): Never destroy.** No step, revert, or migration path may lose park lines, intent
  edits, or a recorded build folder. `revert` snapshots the tracked build folder and
  restores it after a `reset --hard` ([**D26 (build-folders)**](#d26)); `doctor --migrate` moves the legacy sidecar
  and stages it without committing. The deletion perimeter is enforced by
  `rules/centralize-destructive-fs.yml`: `rmSync` and friends compile only in the files
  that legitimately clear control state, snapshots, or legacy layouts. *Tagged in* `revert.ts`. (The old archive-then-clear
  copy retired with `archive.ts`; a finished build folder is now the record it protected,
  [**D29 (finish-replaces-wrap)**](#d29).)
- <a id="c5"></a>**C5 (additive-git): Additive git footprint.** PlumbBob only reads, locates, stages, commits forward,
  and resets `--hard` to its own recorded SHAs. It never rewrites pushed history; your
  squash-merge collapses the checkpoint markers at PR time. Enforced by
  `rules/additive-git-only.yml` (no history-rewriting git token (`push`, `rebase`,
  `--amend`, and kin) compiles as a string literal) and `rules/reset-hard-only-in-revert.yml`
  (`resetHard` has exactly one importer, `revert.ts`). *Tagged in* `git.ts`,
  `finish.ts`.
- <a id="c6"></a>**C6 (no-advance-verb): The agent envelope has no verb to advance the loop** (the identity invariant). No
  key, flag, or side effect a user-authored agent returns may checkpoint, flip a step, or
  trigger another agent; the subprocess boundary then enforces human-as-clock *by
  construction*, not by policy, at every nesting depth. This is the litmus for every field
  the envelope will ever grow. `rules/agent-no-advance.yml` enforces the firewall in code:
  no commit, stage, reset, or checkpoint import compiles in the agent path. *Tagged in*
  `agents.ts`, `agent.ts`, `docs/agents.md`.
- <a id="c7"></a>**C7 (minimal-envelope): Keep the agent envelope minimal.** Resist field sprawl (SWE-agent's ACI lesson):
  unknown fields are tolerated and dropped, additions are a minor-version bump, and
  removals or renames are a major ([**D46 (stream-discipline)**](#d46)). *Tagged in* `agents.ts`, `docs/agents.md`.

Beyond the numbered constraints, `rules/` guards three architectural invariants:
`no-process-exit` (only the bin entry exits, so verbs and `cli-core` stay importable by
tests), `no-console` (the CLI writes through `process.stdout` / `process.stderr`), and
`centralize-subprocess` (subprocess spawning stays in `lib/git.ts`, `lib/check.ts`,
`lib/agents.ts`, and `verbs/spike.ts`).

## Decisions (D)

- <a id="d1"></a>**D1 (lean-cli): A deterministic, lean CLI; guidance, not a lock.** The foundation:
  a hand-rolled `plumbbob` CLI built on node builtins (plus the deliberate few of [**C2 (few-deliberate-deps)**](#c2)),
  and a deciding/executing boundary held by a pause rather than enforced by a file lock.
  *Tagged in* `cli-core.ts`.
- <a id="d3"></a>**D3 (author-blind-executor): The pluggable, author-blind executor.** `/plumbbob:build` is swappable, never required; `verify`
  and `checkpoint` read *the diff, not who wrote it*, so a hand-built, vibed, or
  other-harness diff checkpoints identically. *Tagged in* `checkpoint.ts`, the `build` and
  `verify` skills.
- <a id="d4"></a>**D4 (flat-step-files): The in-flight step lives in flat files.** `SEAM` (a plain path list) and `STEP`
  (a bare number) record the step in flight as flat files, not parsed markdown. *Tagged
  in* `sidecar.ts`.
- <a id="d6"></a>**D6 (parseable-steps): Steps are the parseable build plan; roadmap prose lives elsewhere.** Only
  `## Steps` carries the numbered, machine-read increments; narrative roadmap text stays
  out of it. (Revised 2026-09-22 by [**D86 (build-order)**](#d86): `## Build order` is the
  second machine-read section, one line of step numbers, the sequence to build them in.)
  *Tagged in* `orient.ts`.
- <a id="d7"></a>**D7 (park-then-harvest): Capture then triage (park → harvest).** Parking is a dumb flat-line append the
  hooks can read with a grep (no markdown parsing); triage happens later, at a step
  boundary. *Tagged in* `sidecar.ts`, the `park` and `harvest` skills.
- <a id="d8"></a>**D8 (status-dashboard): `status` is an orientation dashboard.** It parses the live session into the
  where-am-I view. *Tagged in* `status.ts`, `orient.ts`.
- <a id="d9"></a>**D9 (finish-no-gate): `finish` is the close-out: report by default, no gate.** A single verb does the
  whole close-out: it writes `report.md` into the build folder, makes the final commit, and
  clears the control state, but never refuses the exit without a report. Renamed from `wrap`
  ([**D29 (finish-replaces-wrap)**](#d29)). *Tagged in* `finish.ts`, the `finish` skill. (Supersedes [**D19 (report-gated-finish)**](#d19).)
- <a id="d10"></a>**D10 (pause-not-lock): The boundary is a pause, not a lock.** Nothing blocks edits; the loop pulls up
  to the verify pause and waits. *Scope note ([**D64 (approval-latch)**](#d64)):* this holds on the **work** plane (no
  edit is ever blocked), but the checkpoint *tick* is now latched to the harness's record of a human
  turn, so a same-turn land is refused and the refusal *is* the pause. Guidance on the work, a latch on
  the record. *Tagged in* `cli-core.ts`, `latch.ts`.
- <a id="d13"></a>**D13 (no-edit-guards): No edit-blocking guards.** No pre-edit muzzle, seam-guard, or bash-guard stands anywhere,
  no human-only `mode` escape hatch, and no `CLAUDECODE` in-session refusal: guidance, not
  enforcement. `rules/no-session-detection.yml` is the tripwire: `process.env.CLAUDECODE`
  doesn't compile. *Tagged in* `cli-core.ts`.
- <a id="d14"></a>**D14 (throwaway-repo-tests): Subprocess testing in throwaway repos.** Tests run the real CLI against tmp git
  repos; because a real `pnpm check` would recurse into vitest, fixtures point the check at
  a stub. *Tagged in* `test/helpers/fixture-repo.ts`, `check.ts`, and the `check` tests.
- <a id="d15"></a>**D15 (one-next-move): `status` infers one primary next move.** It suggests a single next step while
  printing the full list and counts so you can always override. *Tagged in* `orient.ts`.
- <a id="d16"></a>**D16 (check-plus-self-review): The heavy check plus a single structured self-review.** The verify tick runs the
  full gate, then reads the diff against done-when, Decisions, and Constraints in one pass.
  *Tagged in* `check.ts`, the `build` and `verify` skills.
- <a id="d17"></a>**D17 (two-planes): The sidecar splits into a tracked artifact plane and an excluded control
  plane.** *Amended*: where the whole `.plumbbob/` used to be git-excluded, now only the
  per-worktree **control** files are (`STATE`, `settings.local.json`, and each build's
  `STEP`/`SEAM`/`SPIKE`); the **artifact** plane (`settings.json` and every
  `builds/<slug>/` folder (intent, build-log, checkpoints, report)) is *tracked* so a
  build's record rides its branch into the PR instead of dying with the worktree ([**D26 (build-folders)**](#d26),
  supersedes [**D20 (local-archive)**](#d20)). `start --local` keeps the old whole-directory exclude ([**D26 (build-folders)**](#d26)).
  *Tagged in* `sidecar.ts`, `git.ts`, `revert.ts`, `spike.ts`.
- <a id="d18"></a>**D18 (spike-lifecycle): The spike lifecycle.** A genuine fork gets a throwaway worktree and branch per
  option, kept outside the repo, torn down by `spike done`. *Tagged in* `spike.ts`.
- <a id="d22"></a>**D22 (clean-baseline): `start` refuses a dirty tree.** A clean baseline is required; `--allow-dirty`
  overrides it and records the current HEAD as the baseline. *Tagged in* `start.ts`.
- <a id="d23"></a>**D23 (no-glob-seams): Seams are exact paths or `dir/` grants, never globs.** A seam token is matched as
  an exact path or a directory prefix; a glob is rejected. *Tagged in* `intent.ts`.
- <a id="d24"></a>**D24 (configurable-check): The heavy check is configurable, defaulting to checkride.** *Amended*: the
  `check` command still resolves through the settings ladder ([**D27 (settings-ladder)**](#d27)), but it is now the
  *override*: a resolved command is spawned exactly as before, and **no setting at all
  means checkride is the gate** ([**D32 (checkride-gate)**](#d32)). `start` seeds `settings.json` with no `check`
  key (absence is the default) and no longer probes for a `check` script; the runtime
  refusal of a nothing-to-check run replaced the warning. *Tagged in* `start.ts`,
  `check.ts`.
- <a id="d25"></a>**D25 (light-then-heavy): Light feedback at the keystroke, heavy checks at the boundary.** The `post-edit`
  hook runs a non-blocking, file-scoped lint pass and injects findings into the model's
  context; `tsc` and the rest of the gate are deferred to the heavy tier inside `verify`.
  *Tagged in* `hooks/post-edit.sh`.
- <a id="d26"></a>**D26 (build-folders): One folder per build under `builds/<slug>/`.** Each build owns a self-contained,
  tracked `.plumbbob/builds/<slug>/` folder (intent, build-log, checkpoints, report) that
  rides its branch into the PR; the in-flight `STEP`/`SEAM`/`SPIKE` markers live inside it
  but stay excluded. `revert` snapshots the folder to a temp dir and restores it after the
  `reset --hard`, so a rewind never destroys tracked park lines even when reverting to a
  baseline that predates the folder ([**C4 (never-destroy)**](#c4)). `start --local` opts back into the old
  fully untracked flat layout for repos that will not track tool folders. *Tagged in*
  `sidecar.ts`, `start.ts`, `revert.ts`.
- <a id="d27"></a>**D27 (settings-ladder): The settings ladder replaces `config`.** A setting resolves flag →
  `settings.local.json` (untracked personal overlay) → `settings.json` (tracked project
  defaults) → built-in default. `check` is a project default; `auto` (agent-approves-in-
  your-place) is a personal preference, but since [**D67 (auto-not-a-grant)**](#d67) it is *not* a checkpoint
  grant (the latch no longer reads it to allow a land; a model can write the file). Both
  files are optional JSON; a malformed one contributes nothing rather than wedging the
  tool. Supersedes the flat `.plumbbob/config`.
  *Tagged in* `settings.ts`, `check.ts`, `start.ts`.
- <a id="d28"></a>**D28 (state-cursor): The active-build cursor lives in `STATE`.** Which build a verb acts on resolves
  `--build <slug>` → the cursor in `.plumbbob/STATE` → the sole build in `builds/` → a refusal
  with a hint. The session sentinel and the cursor are the *same* file: `STATE`'s existence
  means a session is live, and its single-line content names the build that session is on (empty
  under `--local`). Because that content is one line in an untracked per-worktree file,
  one-active-per-worktree holds *by construction*: it cannot point at two builds. (The cursor
  was formerly an `activeBuild` key in `settings.local.json`; homing it in `STATE` keeps that
  overlay purely human-owned (plumbbob only ever *reads* it) and lets one `finish` delete both
  the session and the cursor at once.) *Tagged in* `sidecar.ts`.
- <a id="d29"></a>**D29 (finish-replaces-wrap): `finish` replaces `wrap`; the build folder is the archive.** The close-out verb
  was renamed `wrap` → `finish` (a clean break, no alias) and gutted: it writes `report.md`
  into the build folder, makes the final commit, and clears the control state: no separate
  archive copy, because the tracked folder already *is* the record and merges into main with
  the branch. Retired `archive.ts`. Supersedes [**D20 (local-archive)**](#d20). *Tagged in* `finish.ts`.
- <a id="d30"></a>**D30 (use-to-switch): `use <slug>` switches and resumes.** One `nvm use`-shaped verb re-points the
  active-build cursor (`STATE`'s content, [**D28 (state-cursor)**](#d28)) at a build, validating the folder and warning (but allowing) a leave
  with a step in flight; that surviving in-flight state is the point of per-build markers
  ([**D26 (build-folders)**](#d26)). *Tagged in* `use.ts`.
- <a id="d31"></a>**D31 (doctor-migrate): `doctor --migrate` moves a legacy flat sidecar into `builds/`.** `doctor` detects a
  pre-restructure flat sidecar (`config`, `archive/`, a flat active session) and, under
  `--migrate`, moves the archive entries and the active session into `builds/<slug>/` folders
  (the active one becomes the cursor; the rest are "done" simply by not being it) and turns
  `config` into `settings.json`. It **stages** the move but never commits: the human owns
  that commit. *Tagged in* `doctor.ts`.
- <a id="d32"></a>**D32 (checkride-gate): Checkride is the check gate, imported programmatically.** The heavy check is
  our sibling package `checkride`: the first entry in `dependencies`, pinned exact,
  called through its API (`runChecks`) rather than spawned, so the typed summary (failing
  slots, `.check/<slot>` raw-output pointers) comes back in-process. The `check` setting
  ([**D24 (configurable-check)**](#d24), amended) becomes the spawn-command *override* for repos that gate through
  something else: present ⇒ spawn it exactly as before; absent ⇒ checkride. An
  all-slots-skipped checkride run is a refusal, not a green: zero-config detection in an
  unconfigured repo must not vacuously pass the gate. Checkride's exit 2 (harness error)
  reports distinctly from red; both block. *Tagged in* `check.ts`.

- <a id="d33"></a>**D33 (info-exclude): Excludes live in the shared gitdir's `info/exclude`.** The control-plane
  excludes are written to the *common* gitdir's `info/exclude` (reached via
  `git rev-parse --git-path info/exclude`, which resolves correctly from a linked worktree
  (a per-worktree gitdir has no `info/`)), never to `.gitignore`, so the exclusion is
  personal machinery, not something imposed on the repo. Enforced by
  `rules/no-gitignore.yml`: the string `.gitignore` doesn't appear in `src/`. *Tagged in*
  `git.ts`, `sidecar.ts`.
- <a id="d34"></a>**D34 (cli-owns-subjects): The CLI owns every commit subject; bodies arrive via `--body`.** The subject is
  composed by the CLI, never the skill; a skill-composed, proportional commit *body* rides along through
  a `--body` stdin heredoc. The subject *shape* (originally one greppable
  `plumbbob: plan/step N/finish — <title>` family) is now Conventional ([**D68 (conventional-subjects)**](#d68)); this
  decision's ownership principle is unchanged. *Tagged in* `git.ts`, `checkpoint.ts`, `finish.ts`, the
  `finish` skill.
- <a id="d35"></a>**D35 (fallback-body): The deterministic fallback body.** Without `--body`, a checkpoint's commit body
  is derived, not generated: the step's done-when, its seam, and the staged diffstat, all following the
  `plumbbob step N` marker line ([**D68 (conventional-subjects)**](#d68)). *Tagged in* `git.ts`, `checkpoint.ts`.
- <a id="d36"></a>**D36 (plan-commit): Plan approval gets its own commit.** `checkpoint --plan` commits only the
  build's artifact folder as `chore(<scope>): plan` ([**D68 (conventional-subjects)**](#d68)) and records a `plan <sha>` line,
  so the scaffold never pollutes the first step's diff and history reads baseline → plan →
  steps → finish. *Tagged in* `checkpoint.ts`, `git.ts`, `sidecar.ts`, the `plan`
  skill.
- <a id="d37"></a>**D37 (bookkeeping-sweep): Checkpoint sweeps its own bookkeeping; `finish` absorbs the tail.** A step's
  commit carries the intent `[x]` flip and the build-log line along with the work
  (`stageAll`), which means the step's own `checkpoints` line lands one commit late; the
  final `finish` commit picks up the last of it. *Tagged in* `finish.ts`.
- <a id="d38"></a>**D38 (cli-owns-slugs): Slugs are the CLI's job; collisions refuse.** `slugify` and its collision
  handling live in `sidecar.ts`; `start` refuses a slug that already exists rather than
  auto-suffixing: the human picks a new title or passes `--slug`. Derived slugs carry a
  `YYYY-MM-DD-` prefix so `builds/` sorts chronologically under a plain lexical listing:
  ordering by construction, not by titling convention; an explicit `--slug` stays
  verbatim. *Tagged in* `sidecar.ts`, `start.ts`, `doctor.ts`.

The **user-authored-agent doorway** (July 2026, `docs/agents.md`) added [**D39 (subprocess-envelope)**](#d39)–[**D61 (best-effort-scrape)**](#d61) and
[**C3 (bindings-not-logic)**](#c3)/[**C6 (no-advance-verb)**](#c6)/[**C7 (minimal-envelope)**](#c7). (The build's own `intent.md`,
`.plumbbob/builds/2026-07-02-user-agent-plugins-…/`, numbered these decisions locally as
`D1`–`D24`/`C1`–`C7`, per this page's convention; the code and docs cite the renumbered global tags
below.)

- <a id="d39"></a>**D39 (subprocess-envelope): The agent doorway is one versioned subprocess envelope.** A user-authored agent is
  *anything executable* that speaks JSON-on-stdin / JSON-on-stdout / prose-on-stderr;
  runtime-agnosticism is the doorway (Terraform's `external` has run this exact contract since
  2017; checkride's stream discipline is already house style). *Tagged in* `agents.ts`,
  `agent.ts`, the skills, `docs/agents.md`. (See [**C6 (no-advance-verb)**](#c6) for the identity invariant that
  bounds it.)
- <a id="d40"></a>**D40 (agent-run-verb): One verb, `agent run`, with no way to advance the loop.** Deterministic mechanics
  only (compose the context, spawn, validate, apply side effects), and no checkpoint, step
  flip, or chaining, so the boundary enforces human-as-clock by construction ([**C6 (no-advance-verb)**](#c6)).
  *Tagged in* `agent.ts`.
- <a id="d41"></a>**D41 (agent-resolution): Agents resolve flag → project → personal.** `--agent <path>`, then
  `.plumbbob/agents/<name>/` (tracked, rides the PR), then `~/.plumbbob/agents/<name>/`
  (personal), first hit wins, project shadowing personal: the settings ladder's shape
  ([**D27 (settings-ladder)**](#d27)) and Claude Code's two-level `.claude/agents/` convention. *Tagged in* `agents.ts`.
- <a id="d42"></a>**D42 (harness-bindings): Planned bindings live in `builds/<slug>/harness.json`.** A sibling of `intent.md`
  authored at `/plumbbob:plan` time, not inside the executor-agnostic intent ([**D3 (author-blind-executor)**](#d3)): the plan
  says *what/why*, the harness says *with-what*. *Tagged in* `agents.ts`, `sidecar.ts`, the
  `plan`/`step` skills.
- <a id="d43"></a>**D43 (three-slots): Exactly three slots: `before`, `build`, `after`.** Context-in, the diff, advisory
  review, and no fourth, because no declarative format can name "a salient point in the
  middle"; that judgment is prose the host model reads (a manifest `when`, a step `note`).
  *Tagged in* `agents.ts`, the loop skills, `docs/agents.md`.
- <a id="d44"></a>**D44 (cli-side-effects): The CLI applies every side effect; the agent never writes `.plumbbob/`.**
  `parked[]` lands through the park verb; an agent writing the sidecar directly is out of
  contract: the sidecar keeps a single writer. *Tagged in* `agent.ts`.
- <a id="d45"></a>**D45 (advisory-review): `after` output is advisory; checkride gates; the human advances.** An after-agent
  informs the verify pause and can never fail a step: a gate an agent can trip is the lock
  returning in autonomy's costume. *Tagged in* `agent.ts`, the `verify` skill.
- <a id="d46"></a>**D46 (stream-discipline): Stream discipline and exit-code semantics.** stdout carries the envelope alone,
  stderr streams the child's prose live to the terminal, exit 0 makes the envelope
  authoritative and any non-zero is a failed run (reported, not trusted); a contract
  major-version mismatch is refused with an upgrade hint. Production (narrating) must never
  collide with consumption (one structured result at the pause). *Tagged in* `agents.ts`,
  `agent.ts`, `docs/agents.md`.
- <a id="d47"></a>**D47 (handoff-ledger): The step-scoped handoff ledger.** `agent run` re-emits the envelope on its own
  stdout (inline, for the calling skill) *and* appends it to `builds/<slug>/handoff.json`
  (untracked in-flight control state, scoped to the current step and cleared when the step
  checkpoints, like `STEP`/`SEAM`), so sequential runs and a compacted context can thread
  earlier envelopes into the next call's `context[]`. *Tagged in* `sidecar.ts`,
  `checkpoint.ts`, `agent.ts`.
- <a id="d48"></a>**D48 (doctor-validates-agents): `doctor` validates agents; `status` reports bindings.** `doctor` walks every
  resolvable agent (manifest well-formed, command present/executable, contract supported);
  `status` lists the active build's harness bindings and warns on ones that don't resolve:
  the surfaces the user already checks carry the report, so no separate `agent check` verb.
  *Tagged in* `doctor.ts`, `status.ts`.
- <a id="d49"></a>**D49 (posix-sh): POSIX only; the command runs via `sh -c` at the repo root.** `command` is a shell
  string (not an argv array), spawned with the **repo root** as cwd so a build-slot agent's
  repo-relative seam edits resolve; the agent's own directory rides in `PLUMBBOB_AGENT_DIR`
  so it can still reach its files. *Tagged in* `agents.ts`, `doctor.ts`, `docs/agents.md`.
- <a id="d50"></a>**D50 (nested-agents): Nested invocation is allowed, uncapped.** An agent may shell `plumbbob agent run`
  to compose other agents (a build/review loop, say); loops belong inside agents as code,
  cutoffs are the author's job, and the identity invariant ([**C6 (no-advance-verb)**](#c6)) holds at every depth:
  a documented warning, not enforcement. *Tagged in* `agents.ts`, `docs/agents.md`.
- <a id="d51"></a>**D51 (agent-timeout): `agentTimeout`, off by default.** A settings-ladder key (seconds): absent or `0`
  means no timeout, set means kill the child on expiry and report a failed run; the human is
  present (Ctrl-C works, [**D58 (sigint-forwarded)**](#d58)), so enforcement is the user's explicit opt-in.
  *Tagged in* `agents.ts`, `settings.ts`.
- <a id="d52"></a>**D52 (blocked-vs-drift): `blocked` and `drift` route differently at the pause.** `blocked` = the agent
  couldn't finish (surface its `notes`, unblock, re-run); `drift` = it finished but found the
  plan no longer matches reality (repair with `/plumbbob:refine` before continuing): the two halts
  need different medicine. *Tagged in* `agent.ts`, the loop skills.
- <a id="d53"></a>**D53 (agents-own-keys): Keys, model choice, and sandboxing are the agent's business.** The `settings`
  block in the StepContext carries plumbbob's own relevant settings and nothing else:
  PlumbBob never touches a provider key; how an agent authenticates, which model it calls,
  and how it sandboxes itself live in *its* env and config. *Tagged in* `agents.ts`,
  `docs/agents.md`.
- <a id="d54"></a>**D54 (bindings-degrade-soft): Explicit asks fail loud; ambient bindings degrade soft.** `agent run <name>`
  naming an unresolvable agent **errors**, and `--mode X` against a manifest that doesn't
  declare slot X **refuses**: the user who typed the name asked for that agent
  specifically. Only a harness-*bound* agent a teammate lacks downgrades to a warning and
  is skipped, because a binding is ambient configuration the loop must survive without
  (the same never-required contract as `/plumbbob:build` itself). A run that actually starts and
  fails is a hard failure either way: this softens a *missing* agent, never a broken one.
  *Tagged in* `agent.ts`, `agents.ts`, `status.ts`, the `plan` skill.
- <a id="d55"></a>**D55 (two-audiences): The manifest speaks to two audiences.** `command` is for the deterministic CLI;
  `description` and `when` are prose for the **host model** (the role a subagent's
  frontmatter description plays); `when` is the cue the model reads to fire an agent
  mid-build, because each half of when/how feeds the layer that can actually use it.
  *Tagged in* `agents.ts`, the `build` skill.
- <a id="d56"></a>**D56 (auto-composes): `--auto` composes with zero new machinery.** Bound `before`-agents → implement
  (or the bound `build`-agent) → bound `after`-agents → check → self-review →
  checkpoint-if-clean → next; the `after` output feeds the *existing* self-review halt
  condition, so the default path (everything lands at the pause) stays unchanged. A
  step range `N-M` rides the same seam: it is `--auto` with one more halt of the same
  kind (stop before any step past M), re-imposing the pause at the top of the range:
  still zero new machinery. (Revised 2026-09-16 by [**D85 (range-top-lands)**](#d85): step M
  lands like every step before it, so the pause the range re-imposes belongs to the step
  after M, and M itself is never held for approval.) *Tagged in* the `build` skill.
- <a id="d57"></a>**D57 (merge-ladder): The bindings merge ladder.** For one step and slot: an explicit name or `--agent`
  flag beats the per-step harness entry, which beats the harness `defaults`, which beat the
  settings-level `agents` key (the first level that names the slot wins, **replace, not
  append**), because that's the existing settings ladder ([**D27 (settings-ladder)**](#d27)), down to the tier.
  *Tagged in* `agents.ts`, `agent.ts`, `settings.ts`.
- <a id="d58"></a>**D58 (sigint-forwarded): SIGINT is forwarded to the child.** The human is present, so Ctrl-C kills the
  agent (with a SIGKILL escalation) and reports, rather than orphaning it.
  *Tagged in* `agents.ts`.
- <a id="d59"></a>**D59 (inline-context): Before-slot outputs travel inline as `context[]`.** Inline in the input JSON is
  the simplest transport until size proves otherwise; revisit only on evidence.
  *Tagged in* `agents.ts`, the `build` skill.
- <a id="d60"></a>**D60 (async-spawn): Async `spawn`, not `spawnSync`.** A live parent can interrupt gracefully
  (message + cleanup) where a blocked one just dies with the child; `dispatch` is already
  Promise-typed, so it costs no plumbing. Enforced by `rules/no-sync-spawn-in-agent-path.yml`.
  *Tagged in* `agents.ts`, `agent.ts`.
- <a id="d61"></a>**D61 (best-effort-scrape): Decisions/constraints scraping is best-effort, verbatim.** Every top-level
  dash bullet under `## Decisions`/`## Constraints` passes as one verbatim string (wrapped lines
  joined, the `*because*` rationale intact), skipped lines warn on stderr, and the scrape
  never refuses: it feeds an agent's context, not a gate; seam parsing stays strict
  precisely because seams gate git behavior ([**D23 (no-glob-seams)**](#d23)). *Tagged in* `intent.ts`, `agents.ts`.
- <a id="d62"></a>**D62 (model-recommendation): A step's model recommendation is advisory metadata.** An optional
  `- model:` sub-line beside the seam names the **smallest model that can carry the step**, with
  the one-phrase why (mechanical, fully specified work → a small model; strong-assertion test
  authoring → a mid one; subtle, creative, or cross-cutting work → a frontier one): the human
  buys capability only where the step needs it. Scraped best-effort like the other step meta
  ([**D61 (best-effort-scrape)**](#d61)) and surfaced by `status` in the next step's detail; orientation for the human
  choosing where to spend attention and tokens, **never a gate**: nothing reads it to switch a
  model or refuse a build. Plain text, no backticks, so it can never be mistaken for a seam token.
  *Tagged in* `orient.ts`, `intent.ts`, the intent template, the `plan`/`step`/`status`
  skills.
- <a id="d63"></a>**D63 (no-model-pins): Judgment skills inherit the session model; only the clerks pin.** The
  judgment moves (`plan`, `step`, `build`, `verify`, `refine`, `harvest`,
  `finish`) carry no `model:` frontmatter: a pin is a ceiling as much as a floor (it silently
  downgrades a frontier session), it overrides the very choice [**D62 (model-recommendation)**](#d62) asks the human to
  make, and prompt caches are model-scoped, so every pinned hop re-reads the whole conversation
  uncached at full input price. The mechanical clerks (`status`, `park`, `spike`,
  `revert`, `doctor`) stay pinned to `haiku`: model quality is irrelevant to a verbatim
  reporter, and small-model economics beat the switch toll there. The human steers with `/model`,
  informed by the per-step recommendation ([**D62 (model-recommendation)**](#d62)); prose in `plan`/`build`
  nudges, never forces. *Expressed in* the skill frontmatters.

The **approval latch** (July 2026, `.plumbbob/builds/2026-07-09-the-approval-latch/`, from
`research/06-approval-latch.md`) added [**D64 (approval-latch)**](#d64)–[**D66 (oob-commits-surfaced)**](#d66): ledger-plane
enforcement of the checkpoint tick, while the work plane stays guidance ([**D10 (pause-not-lock)**](#d10)/[**D13 (no-edit-guards)**](#d13)).

- <a id="d64"></a>**D64 (approval-latch): The approval latch: ledger-plane enforcement.** Nothing blocks an edit (the
  work plane stays guidance ([**D10 (pause-not-lock)**](#d10)/[**D13 (no-edit-guards)**](#d13) intact)), but the checkpoint *tick* is
  latched: `checkpoint` refuses to land a step until the harness's turn ledger records a **human turn
  since the step was entered**, *because* the two boundaries live on different planes: guidance on the
  **work**, a latch on the **record**. A refused checkpoint is not an error; the refusal message *is*
  the pause (present the diff, end the turn, the human's next prompt is the tick that lands it on
  the next run). A five-row predicate decides it, first hit wins: `isTTY` (a human at the keyboard) → an
  absent `TURN`/`TICK` (ledger dormant / hand-built diff) → a one-turn `GRANT` ([**D65 (human-typed-grants)**](#d65)) →
  `TURN > TICK` → else refuse, reading only `TURN`/`TICK`/`GRANT`/
  `isTTY`, never the host ([**D13 (no-edit-guards)**](#d13)), and running *before* the check gate (cheap first). It
  **amends [**D10 (pause-not-lock)**](#d10)'s scope** and joins the existing verb-boundary family (`checkpoint` refuses
  red [**D32 (checkride-gate)**](#d32), `start` refuses dirty [**D22 (clean-baseline)**](#d22), the agent envelope can't advance the loop
  [**C6 (no-advance-verb)**](#c6)). A host with no hooks grows no ledger and behaves exactly as before: the latch stays
  dormant rather than wedging. (Amended 2026-10-17: a background job's notice reaches the same hook
  and is not a human turn, so it never ticks `TURN` ([**D90 (notice-not-turn)**](#d90)).) *Tagged in*
  `latch.ts`, `checkpoint.ts`, `sidecar.ts`, `build.ts`, `start.ts`, `turn.ts`, `doctor.ts`.
- <a id="d65"></a>**D65 (human-typed-grants): Grants come from the human's literal prompt.** One-turn self-approval is minted
  only from strings the model cannot type: `build` is `disable-model-invocation`, so a `--auto`
  flag or an `N-M` range reaches the `turn` hook only because the human typed it, *because* a grant the
  model can forge is no grant. The `GRANT` file is scoped (`auto` | `range M`) and rewritten on **every**
  tick (minted on a match, cleared otherwise), so its lifetime is **one turn** by construction; a typed
  range beats `--auto` (bounded wins), and a `range M` refuses at the ceiling (step > M) with a
  top-of-range affordance. The `GRANT` file is the *only* self-approval: the [**D27 (settings-ladder)**](#d27) `auto`
  settings key is not a grant ([**D67 (auto-not-a-grant)**](#d67)). (Amended 2026-10-17: the tick that
  rewrites `GRANT` is a typed prompt's, and a background job's notice leaves the grant standing, so a
  range survives a job that reports back partway through it ([**D90 (notice-not-turn)**](#d90)). A typed
  range now mints `steps <list>`, exactly the steps it names, and `range M` is the form a hook from
  before that rule mints, which still lands with its ceiling ([**D91 (step-list-grants)**](#d91)).)
  *Tagged in* `turn.ts`, `latch.ts`, `sidecar.ts`.
- <a id="d66"></a>**D66 (oob-commits-surfaced): Out-of-band commits are surfaced, never blocked.** The human commits freely
  ([**C5 (additive-git)**](#c5)); a raw `git commit` the model issues while a step is in flight becomes a permission
  *question* (a `PreToolUse` ask-hook that emits `ask`, never `deny`, [**D13 (no-edit-guards)**](#d13) intact), and
  `status` prints one neutral reconciliation line when commits landed since the last checkpoint outside
  the ledger, *because* prevention where it's free (the `ask`-hook), detection where it isn't (the
  receipts line). The latch is a ratchet against completion-drive, not a cage against a forger: every
  forge stays loud (transcript, `status`, the eval tier), so `doctor` also reports the latch
  live/dormant to make a missing turn hook visible. (Revised 2026-10-16, closing issue #4: the count
  is one quantity on both surfaces. `PLAN_COMMIT_MARKER` moved into `git.ts` and `status` now passes it
  as `handoff` always did, so a hand-made plan commit that carries it drops out of the receipts line
  as well as the Verdict. Two mechanisms keep plumbbob's own commits out of the count: a commit any
  plumbbob verb makes is recorded in the ledger and starts the range, and the marker drops a hand-made
  plan commit.) *Tagged in* `git.ts`, `orient.ts`, `status.ts`,
  `doctor.ts`, `hooks/pre-bash-commit.sh`.
- <a id="d67"></a>**D67 (auto-not-a-grant): Self-approval is human-typed only; the standing settings `auto` is retired.**
  The latch no longer honors an `auto` in a settings file: the one row of [**D64 (approval-latch)**](#d64)'s matrix that
  read it is removed, leaving five. *Because* a model can write `settings.local.json`, that standing grant
  was the one self-approval it could **forge** (measured: the eval tier's adversarial-pressure contract had
  models minting `auto: true` under pressure, a legal side door the latch honored), and [**D65 (human-typed-grants)**](#d65)'s
  own rule already says a grant the model can forge is no grant. Self-approval now comes *only* from the
  human's literal `/plumbbob:build --auto` or `N-M` range through the `GRANT` file ([**D65 (human-typed-grants)**](#d65)), the routes a model
  cannot type, since `build` is `disable-model-invocation`. This is **guidance-first** (it removes a
  mechanical honor, it adds no lock): TTY (row 1), hookless hosts (row 2, dormant), `--auto`, and ranges
  all still work; unattended autonomy is one typed `--auto` away. A set-but-ignored `auto` is **surfaced,
  not punished** (the refusal message names it and `doctor` prints an informational `○` line), so a human
  who relied on it isn't silently changed. Amends [**D64 (approval-latch)**](#d64) (five-row), [**D65 (human-typed-grants)**](#d65), and
  [**D27 (settings-ladder)**](#d27). *Tagged in* `latch.ts`, `settings.ts`, `doctor.ts`, `agent.ts`, `skills/build`,
  `skills/verify`.
- <a id="d68"></a>**D68 (conventional-subjects): Commit subjects are Conventional Commits; `plumbbob`/`step N` move to the body.**
  *Amended*: every plumbbob commit subject reads as `type(scope): description`, so `git log` speaks the
  same grammar as the rest of the branch: `chore(<scope>): plan`, a per-step `<type>(<scope>): <description>`
  (titleless fallback `chore(<scope>): checkpoint`), and `chore(<scope>): finish`. The step's own **title
  line is the subject, authored once**: an author-written Conventional prefix (`fix(parser): handle empty
  seam`) is honored verbatim (its scope and breaking `!` win), while a bare prose title defaults to `feat`
  (plan and finish default to `chore`) and has its sentence-case opener de-capitalised; load-bearing detail
  stays out of the title and lives in the step's seam instead. The **scope** resolves through a fallback
  chain, most specific first: the title's own `(scope)` → the build's `**Scope:**` default header (authored
  once in `intent.md` at plan time) → the build's slug with its `YYYY-MM-DD-` date prefix stripped
  (`2026-07-18-escape-hatch` → `escape-hatch`, this decision's original rung) → no scope at all (`--local` →
  a bare `chore: finish`), so a build that predates the `**Scope:**` header, or never fills it, keeps
  behaving exactly as it did before this amendment, and an **unfilled header parses as absent**, blank or
  still carrying its angle-bracket placeholder, so a scaffolded-but-unedited `**Scope:** <short-scope>` falls
  through to the slug rung instead of landing commits literally scoped `(<short-scope>)`. The `plumbbob` and `step N` identifiers the old subject
  carried ride a **marker line at the head of the body** (`plumbbob step 1`, `plumbbob plan`,
  `plumbbob finish`), prepended whether the body is `--body` prose, the deterministic fallback
  ([**D35 (fallback-body)**](#d35)), or empty, so `git log --grep plumbbob` still finds every plumbbob commit. Supersedes
  the greppable-subject *shape* of [**D34 (cli-owns-subjects)**](#d34); its ownership principle (the CLI owns every subject,
  bodies arrive via `--body`) stands, as does [**D36 (plan-commit)**](#d36)'s plan-gets-its-own-commit.
  Of the 2026-07-19 commit-subjects build's nine local decisions, five landed here on promotion: its
  `title-is-subject`, `paths-leave-the-title`, `scope-fallback-chain`, and `build-default-scope-header` in
  the text above, and its `scope-placeholder-absent` in the unfilled-header clause; the remaining four became
  [**D71 (visible-reconcile)**](#d71) (which merges two of them), [**D72 (scope-names-code-area)**](#d72),
  and [**D73 (subject-length-soft)**](#d73). *Tagged in*
  `commitmsg.ts`, `intent.ts`, `sidecar.ts`, `checkpoint.ts`, `finish.ts`, the
  `plan`/`step`/`refine`/`verify`/`finish` skills.

- <a id="d69"></a>**D69 (cli-owned-buildlog): The build-log's Steps mirror and Current step line are CLI-owned.**
  build-log.md's `## Steps` checklist and its `**Current step:**` line are now maintained by the
  CLI, not by a skill or by hand. The three verbs that move step state each re-render them from
  intent.md: `build` sets Current step to `<n> — <title>` and marks the ☐/☑ mirror on entry,
  `checkpoint` flips the landed step to ☑ and returns Current step to `none (at the boundary)`,
  and `revert` returns it to the boundary while re-rendering the mirror from the preserved
  intent.md ([**D26 (build-folders)**](#d26) keeps intent edits across a reset, so its checkboxes stay the truth).
  Before this the mirror had no owner: neither the CLI nor any skill wrote it, so whether it
  tracked reality was model whim, and most builds left the raw `- ☐ 1. <step>` placeholder beside
  a fully populated `## Log`. This is the same cure the orphaned `## Log` got when `checkpoint`
  took it over: the human-facing ledger's top half is mechanical, so it never lies. Every write is
  best-effort: a missing or hand-edited build-log never fails a verb; the checkpoints ledger and
  intent.md remain the source of truth, mirroring how the `## Log` append already behaves.
  *Tagged in* `buildlog.ts`, `buildlogsync.ts`, `build.ts`, `checkpoint.ts`, `revert.ts`,
  `templates/build-log.md`.

- <a id="d70"></a>**D70 (spike-reports): Spikes leave a durable report: one artifact, two entry points.** A spike's
  verdict used to evaporate: `spike done` said "record it in intent.md" and the throwaway worktrees
  (with the learning that justified the call) were gone. Now every spike leaves a `spike-NN-<slug>.md`
  report in the build folder, beside `intent.md`/`report.md`, so it rides the branch into the PR the
  way the finish report does. The CLI owns the file and its numbering (next free zero-padded index, a
  gap is never refilled); the human never creates or numbers it. **Two entry points, one template**
  (`templates/spike-report.md`, sections Question / Options tried / Findings / **Verdict** / What this
  decides): `plumbbob spike "<slug>"` scaffolds it *at open* so findings accrue while the worktrees
  live; `plumbbob spike report "<slug>"` scaffolds it with no worktrees for a **spike-as-step** (a
  planned step titled `spike: …` where the increment itself is the experiment), stamping provenance as
  `step <n>` when a step is in flight, else `/plumbbob:spike`. `spike done` scans for the verbatim Verdict
  placeholder and **nudges** when it is unfilled, but still closes (guidance, not a gate: the
  enforce→guide pivot). `spike` is not a Conventional-Commit type ([**D68 (conventional-subjects)**](#d68)), so a `Spike:`
  step title falls through to the `feat` default with no special-casing. *Tagged in* `spike.ts`,
  `sidecar.ts`, `templates/spike-report.md`, `templates.ts`, `cli-core.ts`, the `spike`/`build`
  skills.

- <a id="d71"></a>**D71 (visible-reconcile): The deterministic subject is the default; a drifted one is reconciled in
  the open.** The subject is authored at plan time and the diff lands at build time, so the two can drift
  apart, and both repairs happen where the human can see them. On the plan side, `/plumbbob:step` and
  `/plumbbob:refine` keep a step's title a clean subject as it sharpens or as the plan is re-synced to
  reality. On the diff side, the verify pause is the only place a subject changes: the body pass
  **presents** `planned title → proposed subject`, one line, as part of what the human approves, and only
  then lands it via `checkpoint -m`. Present nothing and [**D68 (conventional-subjects)**](#d68)'s
  title-derived subject lands untouched: that determinism is the guarantee being kept, and `-m` is its
  human-approved exception, never a quiet swap. A silent `-m` would be an agent-authored subject wearing an
  override's clothes, which is exactly what [**D34 (cli-owns-subjects)**](#d34)'s ownership principle
  refuses. Promoted from the 2026-07-19 commit-subjects build, merging its two locals
  `subject-synced-on-drift` and `determinism-preserved`: halves of one rule, cited together at every site.
  *Tagged in* `checkpoint.ts`, the `step`/`refine`/`verify`/`build` skills, `docs/techniques.md`.

- <a id="d72"></a>**D72 (scope-names-code-area): A step's `(scope)` names the code area; the build default names the
  feature.** [**D68 (conventional-subjects)**](#d68)'s fallback chain says how a scope *resolves*; this says
  what the two authored rungs should *say*. A step's own `(scope)` names the primary code area or module the
  step touches (`plan`, `commitmsg`, `docs`), so the same area reads the same way across builds and stays
  greppable years later. The build's `**Scope:**` header names the *feature* and is the catch-all a step
  overrides, authored once at plan time. The split is what keeps scopes stable: a feature label re-applied
  per step drifts with whoever wrote it, where a code area does not. Authoring guidance with nothing
  enforcing it. Promoted from the 2026-07-19 commit-subjects build (local `scope-names-code-area`).
  *Tagged in* the `plan`/`step` skills, `templates/intent.md`, `docs/techniques.md`.

- <a id="d73"></a>**D73 (subject-length-soft): The ≤72-character subject aim is soft: no lint, no gate.** Step titles
  aim for GitHub's 72-character subject convention, and nothing enforces it: no checkride rule, no refusal
  at checkpoint. The human authors the title at plan time and reads it again at the verify pause, which is
  two deliberate human passes over a one-line string; a gate there would charge ceremony against a
  convention that is already read twice. The guidance-over-enforcement posture that governs the loop
  ([**D10 (pause-not-lock)**](#d10)) applies to plumbbob's own commit messages too. Promoted from the
  2026-07-19 commit-subjects build (local `subject-length-soft`). *Tagged in* the `plan`/`step` skills,
  `templates/intent.md`, `docs/techniques.md`.

- <a id="d74"></a>**D74 (glossed-citations): A citation carries its slug, and the rendering follows the surface.**
  A reference to a decision renders as one link carrying the number and the definition's own kebab-case
  slug in parentheses (`[**D26 (build-folders)**](decisions.md#d26)`), so the gloss travels wherever the
  link is copied and the reader never has to stop and look the number up. The slug is copied **verbatim**
  from the definition, never recompressed per site: a gloss retyped at each citation is a gloss that
  drifts. One rule, three renderings by surface. Under `docs/`, `README.md`, and `CONTRIBUTING.md` the
  link is relative. In `skills/` and `templates/` it is an **absolute** GitHub URL, because `docs/` is not
  in the package's `files` list, so a relative path is broken in every installed plugin; the shipped
  `../../docs/decisions.md#d68` was exactly that. In strings the CLI prints, the gloss stands alone with
  no link, since markdown in a terminal is noise and the gloss alone is what jogs the memory. Three things
  are deliberately outside the rule: a tag inside a code span is a *mention*, never a citation (which is
  how this page names its own retired numbers and how `templates/intent.md` writes a fill-in-the-blank
  placeholder), a tag in a test title stays bare (it is a grep anchor read in failure output, not prose
  browsed cold), and a finished `.plumbbob/builds/*/intent.md` is never retrofitted: the folder is the
  record of what shipped ([**C4 (never-destroy)**](#c4)). `scripts/check-refs.ts` enforces the rest as the
  gate's `refs` slot: linked, anchor matches the cited number, slug present, slug matches the definition
  verbatim, plus the src variant, where a slug is required and a link is forbidden. Because that fourth
  comparison is verbatim rather than fuzzy, a *wrong* citation is caught mechanically instead of being
  left to review. Promoted from the 2026-07-31 citations build, merging its locals `slug-in-parens`,
  `slug-is-the-gloss`, `absolute-urls-off-repo`, `terminal-gloss-only`, `consistency-is-a-rule`,
  `code-spans-are-mentions`, `tags-stay-in-test-titles`, and `records-stay`: one rule with one scanner
  reads better as one number than as eight. *Tagged in* `scripts/check-refs.ts`, `checkride.config.json`,
  `CONTRIBUTING.md`, `docs/cli-reference.md`.

- <a id="d75"></a>**D75 (two-gates): Two gates, deliberately different: a fast one per turn on the code, the full
  one at the checkpoint.** checkride's Stop hook runs at the end of every file-touching turn under a
  narrowed profile (`"gate": {"skip": ["test"]}` in `checkride.config.json`) and comes back in about
  two seconds, because vitest is very nearly the whole cost of the full run (~53s of ~56s when the
  profile was chosen; the ratio is the part that lasts). It is a **skip** list rather than an `only`
  list on purpose: a skip list stays correct as slots are added, where an only list silently stops
  covering them. What `plumbbob check`, `/plumbbob:verify`, and `checkpoint` run is unchanged and still
  the full check, test included ([**D24 (configurable-check)**](#d24)); the fast profile never becomes
  the commit gate, and checkride's own "NOT the full check" disclosure is never suppressed, because a
  gate that overstates itself is worse than no gate at all. The profile is inert config without the hook
  that reads it, so this repo installs the hook and tracks `.claude/settings.json`; the companion `dirty`
  marker is what keeps a conversation-only turn from paying anything. **The seam is stated rather than
  smoothed over.** That Stop hook genuinely *blocks* the agent from ending a red turn, inside the repo of
  a tool whose thesis is that the human is the clock. It is not a contradiction, because the two gates
  sit on different planes: checkride gates *the code*, plumbbob latches *the record*.
  [**D10 (pause-not-lock)**](#d10) and [**D13 (no-edit-guards)**](#d13) are untouched on plumbbob's plane:
  no edit is ever blocked, and the loop still pulls up to a pause only a human turn releases
  ([**D64 (approval-latch)**](#d64)). plumbbob's refusal to enforce never meant that no other tool may.
  Promoted from the 2026-07-31 citations build, merging its locals `skip-test-profile`,
  `checkpoint-is-the-full-check`, `this-repo-takes-the-hook`, and `two-planes-two-gates`. *Tagged in*
  `checkride.config.json`, `.claude/settings.json`, `CONTRIBUTING.md`, `docs/cli-reference.md`.

- <a id="d76"></a>**D76 (resolved-on-opener): A question resolves on its opener line, and "resolved" is read as
  a whole word.** Swapping *resolve by:* for *resolved:* is what drops a question out of the open count, and
  the swap has to land on the opener, because `parseOpenQuestions` reads opener lines and nothing else. That
  is deliberate rather than incidental: a `*plain:*` or `*lean:*` sub-line discusses what happens once the
  question resolves, so a counter that read the sub-lines would retire a live hole for talking about its own
  future. The marker is matched as a whole word for the mirror-image reason. A bare substring matches inside
  "unresolved", so an opener that said "still unresolved after the spike" read as settled and left the
  dashboard silently, which is the one failure mode a count exists to prevent. Word boundaries cost nothing
  here: of the 31 resolved openers in this repo's build history, 16 wear `*resolved:*`, 10 a bare
  `resolved <date>`, 4 a trailing `resolved)`, and 1 a `resolved with...`, and all 31 still match. Promoted
  from the 2026-07-18 intent-legibility build (local `resolved-on-opener`). *Tagged in* `templates/intent.md`.

- <a id="d77"></a>**D77 (placeholder-uncounted): The scaffolded question in a fresh intent counts as zero, by a
  rule and not by accident.** Every new build starts from a template carrying one placeholder question, and a
  dashboard that greeted it with "open questions 1" would be shipped noise: a counter that is never zero is a
  counter nobody reads. So an opener whose body is unfilled, still opening on its `<...>` fill-in, is scaffold
  rather than a question and does not count. The rule reads the start of the body only, which leaves a real
  question free to mention angle brackets further along, and it generalizes past the current placeholder text
  to any unfilled scaffold. What it replaces is an accident. The placeholder used to escape the count purely
  because the word "unresolved" contains "resolved", and closing that hole in
  [**D76 (resolved-on-opener)**](#d76) took the accident with it, which is why the rule had to be stated
  outright in the same step. Promoted from the 2026-07-18 intent-legibility build (local
  `placeholder-uncounted`). *Tagged in* `templates/intent.md`.

- <a id="d78"></a>**D78 (em-dash-ban): The em-dash is out of the prose kit, and a house vale rule holds the
  line.** `docs/voice/voice.md` bans the em-dash in prose; `Repo.EmDash` in the `prose` slot is what makes
  the ban mechanical rather than aspirational. It flags U+2014 alone, because the en-dash in a numeric range
  (`steps 1–3`) and the ordinary hyphen are different marks doing different jobs, and a rule that over-matches
  is one people learn to skim past. The message spells out the voice's own four-way replacement so a writer
  reads the fix without leaving the terminal: an inner-sentence aside rides in brackets, and a pause with its
  trailing phrase takes a semicolon when both halves stand alone, a colon when the second half names the
  first, and a plain comma before a coordinating conjunction. Scope is prose, drawn the same way the citation
  scanner draws it. In markdown a code span, a fenced block, and an indented block are invisible, because a
  mark inside a code sample is part of the sample. In a `.ts` file (mapped to `js` in `.vale.ini`) vale reads
  doc comments and nothing else, so a string literal the CLI prints and a test title never surface, while
  frontmatter is prose, so a SKILL.md `description:` is linted like any sentence. Runtime strings keep their
  em-dashes on purpose: vale cannot see a string literal, and a terminal is not the prose plane the voice
  governs.

  The rule needs no regex exception, because the two format markers that used to ride an em-dash were changed
  to punctuation the voice already prescribes: a decision line now reads `, *because* <why>` and a definition
  header `**DNN (slug): Title.**`. Vale's RE2 has no lookaround, so a rule made to spare one marker would be
  regex contortion or permanent under-coverage of the two files where the voice matters most, and
  [**D74 (glossed-citations)**](#d74) is indifferent to the swap because its scanner stops at the slug parens.

  It landed at `warning` and rode there while the sweep burned roughly 1,200 marks off the owned surfaces, one
  review-sized checkpoint per surface, then flipped to `error` in the last step; a rule that failed mid-sweep
  would have refused the very checkpoints that cleaned it up. Two kinds of file are exempted rather than swept,
  each with a per-file `Repo.EmDash = NO` stanza in `.vale.ini` and a one-line why: a record written once
  (`docs/evals/*`, the same genus as the `CHANGELOG.md` and `.plumbbob/builds/*` the walk already holds out),
  and a hand-written anchor text (`docs/generation-loss.md` and `docs/attention-first-development.md`), because
  a model pass over hand-owned prose is the exact copy-of-a-copy failure `docs/generation-loss.md` documents.
  An exemption is honest about who owns the prose, where a re-punctuation would edit a record or overwrite an
  author. Nothing is written to `checkride.baseline.json`: every finding was fixed or its file exempted.
  Promoted from the 2026-08-11 em-dash-sweep build, merging its locals `em-dash-only`, `warning-then-error`,
  `sweep-by-surface`, `model-holds-the-pen`, `comma-and-colon`, `exemption-over-forgery`, and
  `receipts-are-records`. *Tagged in* `.vale.ini`, whose exemption stanzas cite it; the rule itself lives in
  `.vale/styles/Repo/EmDash.yml` and its walk in `checkride.config.json`, both stating the why in plain
  language.

- <a id="d79"></a>**D79 (abandon-keeps-work): Dropping an in-flight step while keeping its work is its own
  verb, and the tree is untouchable.** For most of the loop's life a step in flight had two exits:
  `checkpoint` lands it, and `revert` destroys the work with a hard reset. The gap was recorded when
  `recover` shipped and deliberately left unbuilt, because dropping the attempt while keeping the
  working-tree diff is "a new loop transition rather than a repair of inconsistent state" and so earns its
  own design pass; a repair verb whose own header bars loop transitions could not carry it, and a `revert`
  flag would hang a keep-the-work mode off the one verb defined by throwing it away. `plumbbob abandon` is
  that transition, and its whole contract is what it refuses to touch. It clears the in-flight control
  markers (`STEP`, `SEAM`, `TICK`, the step-scoped handoff ledger), appends an abandon line to the build
  log, and writes nothing else: no reset, no commit, no edit to the plan. The step keeps its `[ ]` and stays
  re-buildable, because abandon drops the attempt rather than the intention, and removing a step the human
  no longer wants is a plan edit, not a bookkeeping verb's call. A step exit is a boundary crossing, so
  abandon honors the same approval latch as `checkpoint` ([**D64 (approval-latch)**](#d64)); that is
  load-bearing rather than decorative, since abandon clears the entry stamp the latch reads, and an
  unlatched abandon followed by a same-turn checkpoint would reopen the side door
  [**D67 (auto-not-a-grant)**](#d67) closed. Promoted from the 2026-08-13 leftovers build, merging its
  locals `abandon-verb`, `tree-untouched`, `stays-planned`, `abandon-log-line`, and `abandon-latched`.
  *Tagged in* `docs/cli-reference.md`, `docs/skills-reference.md`, and `docs/state-and-git.md`.

- <a id="d80"></a>**D80 (cli-renders-model-relays): Whatever can be deterministic is rendered by the CLI and
  relayed verbatim; the model composes only judgment, and the turn is the anatomy and nothing else.** The
  hand-off block proved the mechanism: once `plumbbob handoff` took it over at 0.8.5 it stopped drifting,
  while every model-composed section around it kept mutating in length, order, and register from model to
  model. The presentation build pushed that split to its limit. If the CLI can compute or render a line it
  does (the check row from the gate's summary, the seam and diff rows from git, the `spent` row from
  `stats.json` and the turn ledger, the Verdict, Next Up, Your Call), and the model is kept for what only a
  model can do: the Summary lead, the highlights, the three judgment rows, and the recommendation, all
  written into the detail file ([**D81 (detail-file)**](#d81)) rather than typed into the chat. The rule that
  keeps the two apart is positional: the model writes the file, runs `handoff`, pastes its output at top
  level, and the turn begins where that output begins and ends where it ends, because every defect the build
  found in a live turn sat in the region the model was still writing (a bold token loose mid-sentence, an
  operational paragraph above the anatomy, a check verdict restated three times), and a region the model
  does not own is a region it cannot narrate into. The same ownership reaches every tier: `handoff` emits
  the plan-pause card and the driver pointer as well as the pause and the boundary, and a transition verb
  (`checkpoint`, `park`, `revert`, `abandon`, `spike`, `use`, `finish`) prints its whole ending itself,
  through the one formatter in `src/lib/notice.ts`, so a boundary or a driver turn is one command's output
  and cannot be relayed out of order or disagree with itself. The spec for the shape is
  `docs/presentation.md`; a change to the shape is a change to that file first. Promoted from the
  2026-08-28 presentation build, merging its locals `consistency-from-ownership`, `cli-does-what-it-can`,
  `recap-split-by-nature`, `recap-as-wire`, `turn-is-the-anatomy`, `one-seam-turn`, `zero-seam-turn`,
  `whole-anatomy-emitted`, `handoff-owns-every-pointer`, `verb-prints-its-ending`, and
  `one-notice-formatter`. *Tagged in* `docs/presentation.md`, `docs/architecture.md`, and
  `docs/cli-reference.md`.

- <a id="d81"></a>**D81 (detail-file): One untracked file is the wire the model's judgment travels on, and
  the build log is the archive.** `.plumbbob/detail.md` holds the in-flight step's full detail: the three judgment
  rows under a header rule, the `## Summary` lead, the `## <n>` sections whose titles are the highlights,
  and the `## Recommendation`. It is flat per session rather than per build, overwritten before every pause,
  and control-plane ephemera excluded through `info/exclude` like the rest ([**D33 (info-exclude)**](#d33)).
  `checkpoint` records it beneath the step's dated line in the build-log's `## Log` (the Summary and
  highlights, the Readout, the Verdict, the recommendation, then the full story behind each highlight,
  as the pause showed them) and then truncates it, because the ledger is tracked and rides the branch
  into the PR where a commit body dies at the squash-merge, and a pile of stale detail files is its own
  flood; the commit body keeps its marker and the `--body` prose only, so one durable copy exists, and
  the lead line's bracket points at the entry. The plan commit records the cold read the same way,
  beneath a `plan committed` line. "expand 2" at the pause is a lookup of the file's `## 2`, an older
  step takes its number and is answered from its Log entry, and neither is ever a recall. (Revised
  2026-09-02, before release: the archive moved from the commit body to the ledger, Rob's call.) (Revised
  2026-09-16: `checkpoint` records the file only when its `# Detail · Step N` header names the step
  landing, or names no step, because a detail written after its own step had landed would otherwise
  ride into the next step's entry; it clears the file either way.) Hidden detail is always counted and pointed at (the
  visible highlights carry the count, the `expand` move the affordance), because a silent cut reads as
  coverage. Code stays out of the default turn with one exception: a diff of 20 changed lines or fewer rides
  inline below the readout, and anything larger stays in the working tree behind the diffstat row, because
  code is the single largest source of visual flood and the counted row already says what moved. Where to
  look is introduced by one word, `details:`, a code-spanned `path:line` inside the closing bracket of the
  Summary lead and of Next Up, the form that opens in every host and survives as plain text. (Revised
  2026-10-18 by [**D107 (short-linked-paths)**](#d107): the bracket shows the file's name and line as a
  link, `[intent.md:41](.plumbbob/builds/x/intent.md#L41)`, in place of the code-spanned full path.)
  Promoted from
  the 2026-08-28 presentation build, merging its locals `latest-detail-file`, `latest-card-addressing`,
  `honest-elision`, `code-on-request`, and `details-one-word`. *Tagged in* `docs/presentation.md`,
  `docs/cli-reference.md`, and `docs/state-and-git.md`.

- <a id="d82"></a>**D82 (readout-ladder): The readout is an instrument, a green row collapses to a count
  and a red row names one offender, and the Verdict is computed worst-of over the same rows.** The fence
  holds seven rows at most, in order: `check`, `done-when`, `decisions`, `constraints`, `seam`, `diff`,
  `spent`. Measured beats attested: the CLI's `check`, `seam`, `diff`, and `spent` rows overwrite anything
  the model wrote for them, and the constraint count is read from `## Constraints`, because every row the
  model attests is one it can pad or get wrong, and determinism is what earns the readout its trust. Each
  measuring row opens with a verdict word from a closed set (true, failing, or `drift`, the plan-wrong word
  the agent envelope already uses, [**D52 (blocked-vs-drift)**](#d52)); a green row collapses to a count that
  sizes its universe (`green: 11 of 11 checks`, `held: 6 of 6 declared, no strays`) and a red row names the
  one offender with its slug and one clause, its evidence on an indented `→` line, because the question a
  reviewer brings to an instrument is "is anything off?" and a count answers it faster than a list; a row
  that cannot apply vanishes, one whose good state is meaningful collapses to it, and every fence line fits
  80 columns (13 of label, 67 of value) by counted degradation, never a silent cut. The gate verdict has one
  home, the `check` row, measured from the last run's summary; a narrowed run names the slots it skipped
  there (`· without test`), and the phrase `NOT the full check` retires. The Verdict folds those same rows
  worst-of with the step's accrued stats onto a four-rung ladder in the plumb register, `● Plumb`,
  `◐ A hair off`, `○ Out of plumb`, `✗ Not standing`, naming its worst component in a trailing
  parenthetical, because a computed verdict is trustworthy where a vibed one is theater, and the split that
  earns the fourth rung is "fix the work" against "fix the plan". The step identity renders once per turn:
  the progress count rides Next Up, so the Verdict says only the one thing it says; and the out-of-band
  rung excludes plumbbob's own plan commits, because an advisory that trips on routine housekeeping stops
  meaning anything within three steps. (Revised 2026-09-03: a strayed seam folds to `◐ A hair off` at the
  pause as well as the boundary, never to `○ Out of plumb`, because the seam is awareness rather than a
  lock ([**D13 (no-edit-guards)**](#d13)) and the pause's card was offering `looks good` beneath a
  Verdict that said fix the work; `strayed` is the row's advisory word, a fourth class beside true,
  failing, and drift, and both tiers name the rung `seam strayed`.) (Revised 2026-09-04: the `seam` and
  `diff` rows measure the step's whole product, everything changed since HEAD with new files counted as
  all-added lines, because the previous measure was the working tree against the index and so went blind on
  exactly the step whose product is a new file: no seam row, no diff row, and a Verdict folded without
  either.) Promoted from the 2026-08-28
  presentation build, merging its locals
  `readout-and-summary`, `collapse-to-count`, `vanish-or-collapse`, `worst-of-banner`, `circle-ladder`,
  `plumb-when-natural`, `verdict-in-the-row`, `narrowing-named-not-shouted`, `recap-width-budget`,
  `progress-on-next-up`, `spent-row`, and `own-commits-not-out-of-band`. *Tagged in*
  `docs/presentation.md` and `docs/cli-reference.md`.

- <a id="d83"></a>**D83 (card-teaches-itself): Every part outside the fence is a labeled line, the Your
  Call block names the moves a human actually makes, and a decision turn's last words are the model's
  recommendation.** Every part outside the readout fence is one bold label, a colon, and text that wraps
  (`**Summary**:`, `**Readout**:`, `**Verdict**:`, `**Next Up**:`, `**Your Call**:`,
  `**Recommendation**:`), one blank line between blocks, fences never nesting, because the pause used to run
  five visual grammars at once and only columnar rows need a fence. The Your Call block quotes what the
  human says and states what happens next, and it lists the four real replies (`looks good`; `expand`, or
  any question; anything that reads as direction; `revert` last, since a destructive move is named rather
  than discovered), because nobody types "needs work" and the move made most, zeroing in on one part before
  approving, was not on the card at all; `looks good` renders only while the measured check is green, since
  offering a move the checkpoint would refuse teaches a false ceremony. (Revised 2026-10-16 by
  [**D87 (pause-once)**](#d87) and [**D88 (current-step-shown)**](#d88): a step pause's block opens on a
  seventh label, `**Now**:`, naming the step in flight with its count, and the Readout label stops
  repeating it; the block renders once per pause, a later turn at a pause nothing has changed ends on the
  one-line reminder, and the `expand` move's outcome clause says how the block comes back.) The recommendation follows the card
  behind a label the CLI prepends, the move as its own sentence and then the reason, because the card
  teaches the moves without saying which to take, and a pause that leaves the human deciding unassisted is a
  defect, not a missing nicety. Three tiers scale the ending to the turn: a decision turn (the build and
  verify pause, the plan pause, an auto halt) carries the whole block, an orientation turn (status, the
  boundary, finish) the lead line, the Verdict, and Next Up, a driver turn (park, spike, use, recover,
  revert, agent runs) the lead line and Next Up, because the Your Call block belongs only where a decision
  is pending. (Revised 2026-09-16 by [**D85 (range-top-lands)**](#d85): the auto halt in that first list is
  a halt on trouble, which leaves a step unlanded; a clean halt lands its step and ends on the boundary.)
  Next Up carries the progress count and the plan's model recommendation
  ([**D62 (model-recommendation)**](#d62)), the one token besides the label a line may bold, because it is the
  token the human acts on before the next run. (Revised 2026-09-22 by [**D86 (build-order)**](#d86): Next Up
  may carry one indented line beneath it, the build order and the park count, the one continuation outside
  a fence that wears no label of its own.) Promoted from the 2026-08-28 presentation build, merging its
  locals `labeled-lines`, `instructive-choice`, `real-moves`, `verdict-last`, `recommendation-last`,
  `labeled-recommendation`, and `three-tier-anatomy`. *Tagged in* `docs/presentation.md` and
  `docs/skills-reference.md`.

- <a id="d84"></a>**D84 (one-liner-register): A line plumbbob says out loud states its fact and never the
  move, and where it sits picks its head.** An ending goes to stdout as one block and its lead line wears a
  bold label like every other part of it (`**Checkpoint**: Step 15 complete (2d917cde7)`,
  `**Parked**: should /password-reset get the same throttle? (tangent)`): the label names the artifact that
  landed or the subject that moved, the fact reads on from it, `checkpointed` is no longer a word the CLI
  says, a capture's tag rides the tail so the printed line and the ledger line match, and `Step N` is a
  proper noun throughout. An advisory belongs to the ending it qualifies, so it rides stdout unprefixed as a
  capitalized sentence, the `⚠` glyph trailing the fact and one indented `→` line beneath it carrying the
  remedy; the `heads-up` and `note` labels retire, because the glyph table already gives `⚠` to a warning
  and `→` to what happens next. A refusal is not an ending: nothing landed, so it goes to stderr with the
  `plumbbob:` prefix, which earns its one colon by naming the speaker where checkride's output and git's
  share one result and scrollback is grepped for that word. The detail is one trailing parenthetical that
  degrades by count (`and 2 others`). No pointer rides a single line; every ending closes on its Next Up,
  the one exception being `start`, which ends on its remedy line because the plan skill owns the turn that
  follows and no step exists to aim at. The register governs one-liners only: the dashboard, `recover`'s
  check lines, and the sentinel headers keep their shape. Glyphs are a closed set of text-presentation
  codepoints, each always paired with its word, because renderers differ, fonts drop glyphs to tofu, and
  screen readers speak Unicode names. (Revised 2026-09-04, settling Q13 (two-pointer-vocabularies) from the
  2026-08-28 presentation build: the dashboard's `next → build step 1 — /plumbbob:build` keeps naming the
  move while every ending's `**Next Up**` keeps stating the fact, because the dashboard is the one surface
  read while choosing what to type, and it renders inside a `text` fence where a bold label would be
  literal characters.) Promoted from the 2026-08-28 presentation build, merging its locals
  `own-lines-one-colon`, `fact-not-move`, `advisory-glyph`, `register-is-one-liners`,
  `transitions-wear-the-label`, `word-carries-meaning`, and `text-glyphs-only`. *Tagged in*
  `docs/presentation.md` and `docs/cli-reference.md`.

- <a id="d85"></a>**D85 (range-top-lands): A range lands its top step, and a halt takes the tier of what it
  leaves behind.** `/plumbbob:build N-M` self-approves N through M, M included, and hands back once M has
  landed, because a typed range is the human asking for exactly those steps and the latch already allows a
  checkpoint at or under the ceiling, refusing only past it ([**D65 (human-typed-grants)**](#d65)). An
  `--auto` or range halt comes in two kinds. A halt on trouble (a red check, a self-review mismatch, a
  `blocked` or `drift` envelope, a new decision) stops with a step still in flight and a call pending on
  it, so it is a decision turn: the detail file, `handoff`, the whole block. A clean halt (the top of the
  range, or no planned step left) lands its last step first, so nothing is pending, and its ending is that
  checkpoint's own block, relayed whole, with no detail file and no `handoff`. `N-N` is a range like any
  other and lands step N; only a bare `/plumbbob:build N` ends at the pause. `plumbbob build` names the top
  step as it enters it, because the choice between landing a step and holding it is made before
  `checkpoint` ever runs. The halt rule used to send every halt through `handoff`, and since the
  presentation build `handoff` renders the approval pause for an open step and only a Verdict and Next Up
  at the boundary, so the one reading that made the old rule work was to leave M open. The eval tier's
  range contract caught models taking it: the top step sat at a pause in 2 of 4 runs across the
  2026-09-03 and 2026-09-05 sweeps, where 0.9.0 had landed it in 5 of 5. (Revised 2026-09-16, after
  0.12.0: the `build` line also names the last step an `--auto` run or an overlong range reaches,
  because the end of the plan is the other clean halt, and the eval tier's contract 9 measures it.)
  (Revised 2026-10-17: a range may list its steps, and it lands exactly the steps it names, walked in
  build order from its first undone one and halted before the first step it does not name, so `N-M`
  grants N through M where the latch used to allow every step under M; the top is the last undone step
  the range names ([**D91 (step-list-grants)**](#d91)).) (Revised 2026-10-17 by
  [**D94 (auto-and-stops)**](#d94): under `--auto`, a step the plan's build ranges name as a bare range
  halts at its pause, a decision turn, and `plumbbob build` says so as it enters the step.) (Revised
  2026-10-18 by [**D100 (stop-card)**](#d100): a run's clean halt lands its top step first, as any clean
  halt does, and then ends on the stop card rather than the checkpoint's block, because a landing range's
  stop is a review and the block gave it nothing to read.) Amends
  [**D56 (auto-composes)**](#d56) and [**D83 (card-teaches-itself)**](#d83). *Tagged in* the `build`
  skill, `docs/presentation.md`, and `docs/cli-reference.md`.

- <a id="d86"></a>**D86 (build-order): A step keeps its number for life, and the sequence to build the rest
  lives on one line the CLI writes.** `## Build order` in `intent.md` holds the undone step numbers in the
  sequence to build them (`7, 8, 5, 10, 6`); `plumbbob order` writes it, the numbers given first and every
  other undone step following in document order, so the line is the whole remaining sequence; and every
  next-step pick reads it through one merge (`orderSteps`): the dashboard's `← next`, a bare
  `plumbbob build`, `checkpoint`'s fallback, and the card's Next Up. A refined plan appends a step whose
  number says nothing about when it lands, so the human was carrying the permutation in their head and
  typing it into every `build`, and a picker that disagrees with the reminder is worse than no reminder.
  The plan is where the line lives, not a sidecar file, because the plan is already the tracked,
  human-readable document the step and refine skills edit, the section parser already reads it, and a plan
  without the section reads in document order with no migration. The verb is the write path, because it
  validates what a hand edit cannot (every number an undone step, none twice), while a hand edit still
  parses. The card reminds beneath Next Up on one indented line, only when the sequence departs from the
  numbering (five steps, then a count), and carries the park count as `parked 2 of 7 open` whenever
  anything was parked, because a reminder that repeats the numbering is noise and an indented line is the
  one continuation the anatomy reads as part of the label above it; the dashboard shows the same two, the
  order whole. Numbering stays the plan's own: nothing renumbers, a range grant still names plan numbers
  ([**D85 (range-top-lands)**](#d85)), and `recover` reports a line naming a step the plan lacks without
  rewriting it. (Revised 2026-10-17 by [**D93 (range-on-the-card)**](#d93): when the plan declares build
  ranges, the note opens on the range holding the step and the command that runs what is left of it,
  `· range 3 of 5: /plumbbob:build 6-9`, ahead of the build order and the parks, and the dashboard lists
  the ranges beneath the steps. Revised again 2026-10-18: the line and `plumbbob order` read spans
  beside numbers, `1, 6, 2-4, 7, 5`, with or without a space after each comma, each span naming its steps
  in place through the grammar of [**D91 (step-list-grants)**](#d91), and the verb still writes every
  step out.) (Revised 2026-10-19: the merge puts a landed step the line leaves out ahead of the line,
  because the verb lists undone steps alone, so such a step landed before the line was written; the
  undone sequence is unchanged, and a line written while a range is partly landed no longer reads as
  cutting that range. A range's span in the build order ends at its last undone step, so a step placed
  after all of them flags nothing.) Amends [**D6 (parseable-steps)**](#d6) (a second machine-read section) and
  [**D83 (card-teaches-itself)**](#d83) (the one unlabeled continuation under Next Up). *Tagged in*
  `orient.ts`, `order.ts`, `build.ts`, `checkpoint.ts`, `handoff.ts`, `recover.ts`, the `order`, `step`,
  `refine`, and `harvest` skills, `templates/intent.md`, `docs/presentation.md`, and
  `docs/cli-reference.md`.

- <a id="d87"></a>**D87 (pause-once): A step pause renders its whole block once; a later turn at the same
  pause ends on one reminder line, and the block comes back on `--full` or when the pause changes.** The
  turn that reaches a pause is the block and nothing else; a turn at the same pause with nothing about it
  changed is the model's answer and then the driver pointer `handoff` already renders,
  `**Next Up**: Back to Step 2 of 3 - <title>`, the line a park closes on, so a question and a tangent at
  the same pause end on the same line, because the answer is what the human asked for, and about 40 lines
  beneath it push it off the screen (issue #6: every reply during a pause carried the whole block under an
  answer of a sentence or two). The CLI picks the form from a stamp of its last render (the step number,
  the detail file, and the measured `check`, `seam`, and `diff` rows; never `spent`, which counts turns
  and would make every render look new), because a deterministic line is the CLI's to render
  ([**D80 (cli-renders-model-relays)**](#d80)) and one rule for every pause turn keeps the skills' ending a
  single relay. The block returns when the pause changes (the detail file, a file in the seam, the check
  row) and on request: `plumbbob handoff --full` prints it whatever the stamp says, the `expand` move names
  the phrase that asks for it (`show the pause`), and a session without the block in front of it (a fresh
  window, or after `/clear`) asks the same way; `checkpoint`, `revert`, and `abandon` clear the stamp.
  (Revised 2026-10-18 by [**D100 (stop-card)**](#d100): the stop card that closes a run's range renders
  once too, under a stamp of its own (the range, the detail file, and the measured rows); its reminder
  reads `Back to Range 3 of 5's stop - <its stop>`, `plumbbob handoff --stop --full` brings it back, and
  the record clears the stamp.)
  Promoted from the 2026-10-08 said-once-said-whole build, merging its locals `pause-once`,
  `cli-picks-the-form`, and `stamp-skips-spent`. *Tagged in* `docs/presentation.md`.

- <a id="d88"></a>**D88 (current-step-shown): A step pause's block opens on the step in flight with its
  count, under the label `Now`, and the Readout label stops repeating it.** Every step pause at the
  decision tier (the build and verify pauses, and an auto halt on trouble) opens on
  `**Now**: Step 2 of 3 - <title>`, written the way Next Up writes the step to come, and the reminder a
  pause already shown ends on names the same step (`Back to Step 2 of 3`), because the step was named only
  in the Readout label, mid-block and without its count, while the one `Step N of M` the eye found was
  Next Up's, a step ahead, and the human kept asking which step they were on and working it out by
  subtraction. The label is `Now` because it pairs with `Next Up`, the two lines bracketing the block, and
  it states the fact and no move ([**D84 (one-liner-register)**](#d84)). The Readout label collapses to the
  bare `**Readout**:`, on the block and in the build-log record alike, because the record's dated Log line
  already names the step and one `readoutLabel` stays one function; the count is the plan's own, the step
  number over the total, the way Next Up counts, so the two lines agree under a re-sequenced build order
  ([**D86 (build-order)**](#d86)). The plan pause has no step in flight and renders no `Now` line. Promoted
  from the 2026-10-08 said-once-said-whole build, where Q2 (reminder-shape) settled it with the human's
  addition, merging its locals `current-step-shown` and `record-follows-card`. *Tagged in*
  `docs/presentation.md`.

- <a id="d89"></a>**D89 (block-once): A turn that printed a pause or a boundary and did not relay it is held
  open once, and plumbbob counts the once itself.** A `Stop` hook checks the turn's text against the ending
  plumbbob last printed in that turn (a pause has to close the turn; a boundary has to appear in it), and on
  a miss it answers once, with a one-line reason the model acts on and the human reads in full, naming the
  command that reprints the ending; the retried turn then ends whatever it holds. Holding the turn open beats
  surfacing the miss in a `systemMessage`, because surfacing leaves the human to ask for the block, one round
  trip per miss, and the relay misses often enough for that to add up: the 2026-10-17 sweep found 31 of 35
  decision endings whole and 10 of 10 boundaries, with nothing after the relay in 51 of 55, so about one
  ending in ten still slips, as it did on 2026-09-17. The hold cannot hide a miss, since `Stop` fires after
  the turn has streamed and the broken text stays on screen above the retry, but once
  [**D87 (pause-once)**](#d87) shrinks a repeat to one line it costs one stray paragraph at most. The
  mechanics come from a spike on Claude Code 2.1.283. The check reads the final message from
  `last_assistant_message` on `Stop`'s stdin, never from the transcript, which does not yet hold that
  message when the hook fires (one run's snapshot had no assistant entry, though the entry is stamped 65 ms
  before the hook ran); the transcript still supplies the turn's earlier messages, which a boundary's check
  needs, and a payload without the field comes from a host too old to check, so the hook exits 0 and says
  nothing. It speaks through `additionalContext` rather than `decision: "block"`. Both hold the turn open,
  set `stop_hook_active`, and count toward the harness's cap of eight continuations in a row (the harness
  calls either one a block), but a block prints `Stop hook error` and an error footer on the human's screen,
  and a missed relay is the model's slip rather than an error the human has to act on, so the human reads
  `Stop hook feedback` instead, in the channel `turn`'s nudge and the light tier
  ([**D25 (light-then-heavy)**](#d25)) already speak in. **It is the first plumbbob hook that holds a turn
  open, and what it holds is the ending.** The work stays guidance, no edit blocked
  ([**D10 (pause-not-lock)**](#d10), [**D13 (no-edit-guards)**](#d13)); the record is latched, a verb
  refused until a human turn ([**D64 (approval-latch)**](#d64)); a raw commit is a question, never a denial
  ([**D66 (oob-commits-surfaced)**](#d66)); and the code is checkride's, whose gate holds a red turn open
  until it goes green ([**D75 (two-gates)**](#d75)). The relay check lets go after one try where that gate
  holds on, because a red check is a fault in the code that the model can fix, while a second miss is
  already on the human's screen and in the eval tier's count, and a check that held on would make the hook
  the clock instead of the human. It runs beside that gate on identical payloads, and owes it two things.
  It never cancels the gate's block, so it never sends `continue: false`, which ends the turn over a sibling
  hook's block in the same round. And it never falls silent under the gate, so it counts its once in its
  own record, by the `TURN` it held, never by `stop_hook_active`, which is shared and names nobody: the gate
  re-blocks on every `Stop` while red, and a probe that trusted the flag went quiet for the rest of a red
  turn and let a retry that closed on a question through. `TURN` holds as the key, since it has ticked
  before `Stop` even under `claude -p` and stands still across a continuation, which fires no
  `UserPromptSubmit`. The build's closing A/B measures the check, and a hold on an ending that was already
  whole reopens this entry. That A/B ran both arms at one commit on 2026-10-17, and it found exactly that.
  The check held 8 turns open across 50 runs. Three were real misses, and each came back whole on the
  retry: a pause card the turn never relayed, and two plan cards the model wrote into, one with a
  paragraph inside the card and one with two after it. The other five relays already carried every part
  of their ending in order, and each had changed one line (two swapped a pair of Your Call moves, one put
  a move in backticks, one reworded the Summary lead, one reworded the Recommendation). The check compared
  line for line, so it held a card the human had already read, and the retry put it on screen twice,
  which is why the arm with the check read 27 of 35 decision endings whole against 30 of 35 without it.
  By this entry's own test that reopened it, on how strictly the check compares rather than on whether a
  missed ending is held. (Revised 2026-10-17: the check reads a relay by its parts, in the printed
  block's order, with no paragraph inside a part that the block does not have there and, after a decision
  ending's last part, none at all. It compares only the Readout table and the Verdict line exactly,
  because those are the facts the CLI measured; the Summary and the Recommendation are the model's own
  prose, and a reordered Your Call still offers every move. Replayed against the A/B's eight holds, it
  lets the five one-line changes through and still holds the three misses, and it holds a relay that
  keeps every part but turns a red check row green or changes the Verdict, which parts and order alone,
  the other choice, would have passed.) (Revised 2026-10-18 by [**D103 (stop-latched)**](#d103): the
  checkpoint that completes a range under the `RUN` mark writes its `RELAY` record as owing the stop
  card, and the check holds a turn whose last ending still owes it, once, naming
  `plumbbob handoff --stop` as the retry; the card's own render then takes the record's place at the
  decision tier, with `plumbbob handoff --stop --full` as its reprint.) Promoted from the
  2026-10-08 said-once-said-whole build, where Q1 (relay-check-tier) settled the tier and the spike
  settled the mechanics, merging its local `block-once`. *Evidence in*
  `.plumbbob/builds/2026-10-08-said-once-said-whole/spike-01-stop-hook.md` and
  [the A/B receipt](evals/2026-10-17-relay.md).

- <a id="d90"></a>**D90 (notice-not-turn): A background job's notice is not a human turn: it ticks
  nothing, keeps the grant, and clears only an ending its own turn already judged.** The harness reports
  a finished background job through `UserPromptSubmit`, as a prompt nobody typed (a shell job, a Monitor
  event, a subagent's task notice or its report), and the `turn` hook counted every one. That opened the
  latch it exists to hold. A notice arriving while a step sat at its pause raised `TURN` past the step's
  entry stamp, the one sign [**D64 (approval-latch)**](#d64) reads that a human answered, and the build
  that settled this caught it on itself: two of its own background jobs reported back, and a read-only
  `checkLatch` would have let step 1 land in the turn that built it. It also cut ranges short, since a
  notice rewrote `GRANT` like any prompt: on 2026-10-16 checkride's `48-57` lost its grant at step 49 and
  fascicle's `10-12` at step 11, each to a Stryker run that reported back partway. So a prompt that opens,
  at its first character, on `<task-notification>` or `<agent-message from="…">` is a notice, and for one the hook
  leaves `TURN` and `GRANT` as they were and emits no in-flight nudge. A spike on Claude Code 2.1.283 and
  2.1.302 found nothing else that tells the two apart (all 29 captured prompts carried the same eight
  keys), and the opening frame sorted every one of them the way the transcript does. A misread errs safe:
  a typed prompt taken for a notice costs one tick and one grant, which only makes the latch stricter.
  Headless `claude -p`, Cursor, a Monitor's timeout, and `/loop`'s wakeups were not probed, and a notice
  on a frame the rule does not name still counts as a turn, as every notice did before. A notice that
  starts a turn of its own also clears `RELAY`, because the ending in it was judged when its own turn
  ended, and with `TURN` standing still the notice's turn would read as the one that printed it and be
  held open for a card the human has already read ([**D89 (block-once)**](#d89)). Marking that ending as
  held would not do, since a hold carries forward within one `TURN` and would wave through a new ending
  printed after the notice. A notice the harness folds into a turn already running is the exception: it
  arrives under that turn's `prompt_id`, before the turn's `Stop` has judged the ending the turn just
  printed, so the hook keeps the id of the last prompt it saw in `.plumbbob/PROMPT` and leaves `RELAY`
  alone for a notice that carries it. Amends [**D64 (approval-latch)**](#d64), whose human turn a notice
  is not, and [**D65 (human-typed-grants)**](#d65), whose `GRANT` a notice leaves standing. Promoted from
  the 2026-10-17 build-ranges build, merging its locals `notice-not-turn` and `notice-clears-relay`.
  *Evidence in* `.plumbbob/builds/2026-10-17-build-ranges/spike-01-task-notice.md`. *Tagged in*
  `docs/cli-reference.md` and `docs/state-and-git.md`.

- <a id="d91"></a>**D91 (step-list-grants): A range may list its steps, and it grants exactly the steps it
  names, walked in build order.** A typed range is a span `N-M` or numbers and spans joined by commas
  (`20,5-9`). The turn hook mints a `GRANT` of exactly that set, stored in its normal form
  (`steps 5-9,20`, never expanded, so `1-100000` stays one short line), and the latch lands a step the
  set names and refuses any other by name, *because* the set is fixed by what the human typed, so no
  later edit to the plan or its build order can widen it. Reading `N-M` as "through M in build order"
  would have been shorter to type, but it lets the model widen a grant by reordering the plan, the side
  door [**D67 (auto-not-a-grant)**](#d67) closed for settings. Ranges needed this once the build order
  ([**D86 (build-order)**](#d86)) re-sequenced a stretch. A range named plan numbers and landed every
  step up to its top, so a step appended later and ordered inside a stretch cut the range short or split
  it: on 2026-10-16 checkride's `48-57` could reach only 51 with step 76 next, and fascicle's run of
  steps 20 and 5 to 9 had to be typed as two. A plain `N-M` now grants exactly N through M, which is what
  [**D85 (range-top-lands)**](#d85) always said it did, where the latch used to allow every step under M.
  Once any number in the argument run carries a comma or a dash, every number and span in the run joins
  one set, *because* `20, 5-9` typed with a space read as `range 9`, which refused the range's first
  step. Bare numbers alone still mint nothing, a comma after the run's last number belongs to the
  sentence, and a range that does not parse mints nothing even beside `--auto`, so a typo never widens
  into an unbounded grant. A set has no order of its own, so the build order supplies one: a range starts
  at its first undone step in build order however it is written, walks forward in build order, and halts
  before the first step it does not name. `status --invoked` points the dashboard at that first step, and
  `plumbbob build` names the last undone step the range holds as its top. One pure module,
  `src/lib/steplist.ts`, holds the grammar, and the hook, the latch, `build`, and the dashboard all read
  it, so no two of them can read one set of keystrokes two ways. A `range M` grant, the form a hook from
  before this rule mints, still lands with its ceiling, so a session whose installed plugin predates the
  change keeps its ranges. Amends [**D65 (human-typed-grants)**](#d65), whose `GRANT` gains the
  `steps` form, and [**D85 (range-top-lands)**](#d85). Promoted from the 2026-10-17 build-ranges build,
  merging its locals `step-list-grants` and `list-reading`. *Tagged in* the `build` skill,
  `docs/cli-reference.md`, and `docs/state-and-git.md`.

- <a id="d92"></a>**D92 (build-ranges): A plan says where the build stops for a human call, in a
  `## Build ranges` section the card reads back as advice.** The section sits in `intent.md` right after
  `## Build order`, one numbered item per range: the command the human types, in backticks and written as a
  typed range is (`1`, `2-5`, `20,5-9`, [**D91 (step-list-grants)**](#d91)), a comma, then `**stop:**` and
  what the human decides or reviews there, with an optional `- model:` sub-line and any other sub-line (a
  `- note:` on what to watch for) left to the reader, *because* the Steps grammar already reads this way,
  an item wraps where a table row of prose runs off the screen, and the item's number is the handle the
  card counts by. The plan is where it lives because the plan is already the tracked document the skills
  edit and the parser reads, the reason [**D86 (build-order)**](#d86) put the sequence there, and the
  three sections a model wrote by hand on 2026-10-16 (checkride's polyglot build, fascicle's OpenRouter
  build, and this repo's said-once build) already sat in a plan. The command's form says where a range
  stops: a bare `N` builds step N to its pause, so its stop is a call made before the step lands, and a
  span lands every step it names and stops at the boundary after the last
  ([**D85 (range-top-lands)**](#d85)), so its stop is a review of what landed, and a stop needs no kind of
  its own. The plan places the stops and the CLI never does: a range ends where a human call is due (a
  decision the plan leaves open, a review before later steps build on what landed, or a thing only the
  human can do, such as a push, a live key, or spending money) and nowhere else, *because* where a call
  falls is judgment, and all three hand-written sections cut at exactly those points. A range grants
  nothing. The human still types the command, since a grant comes only from the literal prompt
  ([**D65 (human-typed-grants)**](#d65)) and a line the model can edit would be a grant it could forge
  ([**D67 (auto-not-a-grant)**](#d67)); and the section's command and the grant the hook mints are read by
  one parser, `src/lib/steplist.ts`, because a card that read a range one way while the hook read it
  another would suggest a command that does something else. (Revised 2026-10-18 by
  [**D96 (plan-names-the-grant)**](#d96): a range grants nothing until the human types the run that
  names it, and the turn hook then mints `steps <what is left>` from the plan as it stands at the
  keystroke, nothing for a bare range, while the item's command stays the range's definition.) A range's
  progress is derived and never stored, done when every step it names is `[x]` and in progress when it
  holds the next undone step in build order, *because* the boxes are already the truth and a second copy of a fact is one more thing to
  drift; what is left of it is its undone steps, written in build order. Its model is what its own
  `- model:` line says, never computed from its steps, because a ranking of model names in code goes stale
  with the next release, the reason tokens and cost stay out of the `spent` row. An item whose command or
  stop still holds a `<...>` fill-in is scaffold, neither a range nor a report, the rule
  [**D77 (placeholder-uncounted)**](#d77) set for the scaffolded question, so the template's placeholder
  puts no warning on a fresh build's dashboard, and the coverage check
  [**D93 (range-on-the-card)**](#d93) reports runs only once a real range parses. (Revised 2026-10-19: a
  step added at a stop goes into a range still to come, or a bare range of its own when it brings a call,
  and never into a range that has landed, *because* that range's call was made and the step would reopen
  it; a new range takes the next free item number and no item is renumbered, since the STOP stamp, the
  detail file's header, and the record find a landed range by its number. `plumbbob harvest` refuses a
  range holding an undone step the ledger never landed, `step 13 joined it after it landed`, apart from
  a step landed and reopened, and its remedy is the move and a rerun in the same reply.) Promoted from the
  2026-10-17 build-ranges build, merging its locals `plan-holds-ranges`, `range-grammar`,
  `form-says-where`, `advice-not-grant`, `one-grammar`, `state-is-derived`, `plan-places-stops`,
  `model-declared`, and `scaffold-range`. *Tagged in* `docs/presentation.md`.

- <a id="d93"></a>**D93 (range-on-the-card): The card names the range to type next, and the boundary where
  a range's last step lands says why the build stops there.** Beneath Next Up, the note opens on the range
  holding the step the pointer names and the command that runs what is left of it,
  `· range 3 of 5: /plumbbob:build 6-9`, ahead of the build order and the parks, at the plan pause, the
  plan commit, a step pause, and a boundary alike. While it suggests a range, the bracket's bold model is
  the range's rather than the step's, and the note names no model, *because* the bold token is the
  `/model` the human picks before typing the command, and a range's first step is often not its hardest.
  On the boundary where a landing range's last undone step lands, however it landed, a
  `**Stop**: Range 3 of 5 landed - <its stop text>` part rides between the advisories and Next Up, and
  nowhere else: never for a bare range, whose stop is its own pause, where the injected dashboard already
  puts the stop text in front of the model writing the recommendation. The label is `Stop` because it
  names the thing the plan wrote (`**stop:**` is the item's key), reads as a noun on the card the way
  `Checkpoint` does, and the two questions the human brings to a boundary are what to type next and why
  the build stopped. The dashboard lists the ranges beneath the steps (`ranges  2 of 5 done`, with `✓` and
  `▸`, each undone range with its command, model, and stop), and its `next →` names the range's command.
  (Revised 2026-10-18 by [**D98 (card-names-the-run)**](#d98): the segment and the pointer name
  `/plumbbob:run` with the steps it lands in a bracket, `· range 3 of 5: /plumbbob:run (steps 6-9)`,
  where they named the range's explicit command, and at the pause on a range's last step the segment
  reads `range 3 of 5 lands with step 9` and names no run.)
  Each line renders only when the plan declares ranges and the line says something the card does not
  already hold, *because* a reminder that repeats what is on screen is noise, the call
  [**D86 (build-order)**](#d86) made for its own line, so a plan without the section renders exactly as it
  did. A range the plan has outgrown is reported and never rewritten by the CLI: one naming a step the
  plan lacks, a step two ranges both name, an undone step no range names, or an undone step from outside
  a range that the build order places between two of its own. The dashboard carries a `⚠` row for it,
  `recover` names one that points at a step the plan lacks (as it does for the build order), and the card
  says the range needs a re-cut, and why, in place of a command, *because* only the human knows where the
  stop belongs now, and a suggested command that halts early is the failure ranges exist to remove. The
  exact strings are `docs/presentation.md`'s. Promoted from the 2026-10-17 build-ranges build, merging
  its locals `informative-only`, `drift-reported`, `card-shape`, and `range-model`. Amends
  [**D83 (card-teaches-itself)**](#d83) (a labeled part on one boundary) and
  [**D86 (build-order)**](#d86) (the note's first segment). *Tagged in* `docs/presentation.md`.

- <a id="d94"></a>**D94 (auto-and-stops): `--auto` halts at a step the plan's ranges reserve for a human
  call.** Under an `--auto` grant, a step the build ranges name as a bare range is built to its pause and
  halts there at the decision tier, with `plumbbob build` saying so as it enters the step; a review stop
  (the top of a landing range) is run through, and a typed range stays exactly as typed. A plan that
  reserves a call for the human should not have it made by a flag typed for speed, *because* a review can
  wait for the end of a run where a decision cannot be made for the human. The halt is the build notice's
  and the skill's, never the latch's, since the ranges are advice ([**D92 (build-ranges)**](#d92)) and the
  latch reads grants alone ([**D65 (human-typed-grants)**](#d65)). Promoted from the 2026-10-17
  build-ranges build, merging its local `auto-and-stops`. Amends [**D56 (auto-composes)**](#d56) and
  [**D85 (range-top-lands)**](#d85), whose halt list gains this one. *Tagged in* the `build` skill and
  `docs/presentation.md`.

- <a id="d95"></a>**D95 (run-verb): `/plumbbob:run` runs what is left of the range holding the next step, or of
  range N, and ends where that range does.** The verb is `run`, Rob's pick at the plan prompt on 2026-10-17
  over `range` and `build_range`, *because* it names an act, it is the word Rob reached for ("build run
  3"), and it keeps the act apart from the plan's noun: the plan declares ranges, and a run is one range
  being built. Claude Code ships a `/run` skill of its own, so a bare `/run` reaches theirs, the collision
  `/plan`, `/status`, `/doctor`, and `/verify` already accept. With no argument the run names the range
  holding the next undone step in build order, the step in flight counted undone, and `/plumbbob:run N`
  names range N by its item number; either runs what is left of that range, its undone steps in build
  order, *because* that is the range and the steps the card already names beneath Next Up
  ([**D93 (range-on-the-card)**](#d93)) and the item number is the handle the card counts by. A range
  that lands its steps is walked as a typed range is ([**D91 (step-list-grants)**](#d91)) and ends at
  the boundary after its last step; a bare range is built to its pause, where the plan reserved the call
  ([**D94 (auto-and-stops)**](#d94)). A step in flight decides the run: a bare run names the range
  holding it, and a numbered run naming another range refuses ([**D97 (run-refuses)**](#d97)), *because*
  a run that started elsewhere would rewrite the step markers, and its first checkpoint would stage the
  half-built diff into another step's commit. Typed while a step waits at its pause, the run is that
  pause's `looks good`: it lands the step only on a green check and runs on through what is left of the
  range holding it, ending where the range does, so a bare range's run ends once its step lands and a
  landing range's ends on its stop even when the paused step was its last, *because* finishing the run
  that holds the next step is the verb's promise, approving the paused step is its first beat, and a run
  that halted on trouble would otherwise take two replies to resume. The pause card offers the move only
  inside a landing range with steps still ahead of the one in flight, where it does more than
  `looks good`. Nothing chains ranges (`/plumbbob:run 2-4`, and `--auto` beside the verb, are forms this
  build leaves unread), the CLI never decides where a range stops, and there is no `plumbbob run` verb:
  the CLI resolves and records while the skill builds. Amends [**D83 (card-teaches-itself)**](#d83),
  whose Your Call block gains the run as a move at that pause. Promoted from the 2026-10-17
  runs-and-the-stop-card build, merging its locals `run-verb`, `run-names-a-range`, `run-at-a-pause`,
  and `in-flight-first`. *Tagged in* `docs/presentation.md`.

- <a id="d96"></a>**D96 (plan-names-the-grant): The turn hook mints a run's grant from the plan as it stands
  when the human types the verb, and only for the namespaced verb.** `/plumbbob:run` mints
  `steps <what is left>` of the range it names ([**D95 (run-verb)**](#d95)), in the normal form a typed
  list mints (`steps 6-9`, [**D91 (step-list-grants)**](#d91)), and nothing for a bare range, which
  builds to its pause; the set is frozen at the keystroke, so a later edit to the ranges or the build
  order leaves it as it was, and a range on its own still grants nothing. The plan is the source
  *because* the human types the verb against a card that names that range and its steps, so the card,
  the grant, and the dashboard's run header read one plan; a frozen set cannot widen with an edit the
  model makes afterwards, the side door [**D67 (auto-not-a-grant)**](#d67) closed for settings; and
  reading the committed plan instead would disagree with the card after any re-cut at a boundary. Only
  `/plumbbob:run` mints, and it reads the one token after it: a range number names that range, a token
  carrying a dash or a comma mints nothing, and anything else names the next range, *because* a bare
  `/run` reaches Claude Code's own skill and must leave no grant behind, and a span of ranges (`2-4`) is
  a form this build does not define, so it must not be read as another today. `--auto` beside the verb
  adds nothing, a run that names nothing it can walk mints nothing ([**D97 (run-refuses)**](#d97)), a
  plan the hook cannot read mints nothing while the hook still exits 0, and a notice leaves the grant
  alone ([**D90 (notice-not-turn)**](#d90)). The latch reads the grant exactly as it reads a typed
  list's, `/plumbbob:build` mints exactly as it did, and a `range M` grant from a hook before this rule
  still lands with its ceiling, so a session on an older plugin keeps its ranges. Amends
  [**D92 (build-ranges)**](#d92), whose "a range grants nothing" becomes nothing until the human types
  the run that names it, and [**D65 (human-typed-grants)**](#d65), whose literal prompt may now name a
  range the plan resolves. Promoted from the 2026-10-17 runs-and-the-stop-card build, merging its
  locals `plan-names-the-grant` and `namespaced-run`. *Tagged in* `docs/presentation.md`.

- <a id="d97"></a>**D97 (run-refuses): A run that names nothing it can walk mints nothing and refuses with
  the move that unblocks it.** The cases, each with the remedy the dashboard's pointer names: a plan
  without ranges (`/plumbbob:refine ranges` to cut them, or `/plumbbob:build` for the next step); a next
  step no range names, or a flagged range (its drift words, then `/plumbbob:refine ranges`); a landed
  range, or a number no range carries (the range the card names); nothing left (`/plumbbob:finish`); a
  numbered run naming a range other than the one holding the step in flight (`/plumbbob:verify` or
  `/plumbbob:abandon` that step); and any run while a spike is open (`plumbbob spike done`). A run's
  promise is the plan's stops, *because* a run with no range would have no stop or be a single step, and
  a guessed range is the early halt ranges exist to remove ([**D93 (range-on-the-card)**](#d93)); the
  two in-flight cases refuse *because* a run that starts elsewhere rewrites the step markers, and its
  first checkpoint stages the step in flight's half-built diff into another step's commit, while a spike
  is an unresolved fork a run would build on. The hook mints nothing for a refusal, so nothing can land
  in its turn, and `status --run` prints no run header for one: the dashboard renders as it does without
  the flag, and its pointer carries the refusal and the move. The exact strings are
  `docs/presentation.md`'s. Promoted from the 2026-10-17 runs-and-the-stop-card build, merging its local
  `run-refuses` and the refusals `in-flight-first` added. *Tagged in* `docs/presentation.md`.

- <a id="d98"></a>**D98 (card-names-the-run): The card and the dashboard name the run where they named the
  range's command, with the steps it lands beside it.** Beneath Next Up the segment reads
  `· range 3 of 5: /plumbbob:run (steps 6-9)`, the bracket written as the grant the hook will mint
  ([**D96 (plan-names-the-grant)**](#d96)), `(step 9)` for a range down to one step and
  `(step 10 to its pause)` for a bare one; the dashboard's `next →` reads `run range 3 of 5` with the
  verb and the same bracket; the plan pause's `looks good` row says `/plumbbob:run runs range 1 from
  Step 1`; and `status --run` prints a header above the dashboard naming the range, what is left of it,
  where the run ends, its stop, and the grant the hook minted. The plan's item keeps `/plumbbob:build 6-9`
  as the range's definition, *because* the run is what the human types now, the steps are what it will
  land, and every plan written since [**D92 (build-ranges)**](#d92) keeps parsing, its explicit
  commands included. At a step pause the segment names the range holding the step in flight, and the
  bracket opens on that step, since a run typed there lands it first ([**D95 (run-verb)**](#d95)); at
  the pause on a range's last step it reads `range 3 of 5 lands with step 9` and names no run,
  *because* a run typed there ends on that range's stop, and a card naming the next range would suggest
  a run that does not reach it. The bracket's bold model stays that of the range holding the step Next
  Up names, the run the human picks a model for. A flagged range, a step no range names, and a plan
  without ranges render exactly as they did. Amends [**D93 (range-on-the-card)**](#d93), whose segment
  and pointer name the run. Promoted from the 2026-10-17 runs-and-the-stop-card build, merging its local
  `card-names-the-run`. *Tagged in* `docs/presentation.md`.

- <a id="d99"></a>**D99 (one-loop): The run skill carries only what is the run's own and reads the build
  skill beside it for the per-step loop.** `skills/run/SKILL.md` holds resolving the run, its refusals,
  the ending that closes a range, and the reply to it, and reads `../build/SKILL.md` from its own base
  directory (the path a skill prints as it loads, which resolves under the marketplace cache and the
  `~/.claude/skills/plumbbob` link alike) for the loop a typed range walks, and the harvest skill the
  same way for the park classes and the fold rules, *because* two copies of the loop would drift apart,
  the build skill is the engine both verbs drive, and the read is measured rather than trusted: one live
  session in the build that settled this, and the eval tier's contract c11, hold the run to its range.
  Promoted from the 2026-10-17 runs-and-the-stop-card build, merging its local `one-loop`. *Tagged in*
  the `run` skill.

- <a id="d100"></a>**D100 (stop-card): A run that lands its range ends on the stop card, a decision turn
  in the range's shape, and a run whose range lands with nothing parked still ends on it.** The model
  writes the range's detail (its summary and highlights drawn from the steps' checkpoint bodies and the
  build-log's Log rather than from recall, the three judgment rows across the range, a proposed class
  for every open park, and the recommendation) and `plumbbob handoff --stop` renders the card: the Stop
  lead (the boundary's Stop part moved to the top, with the range's count, the stop's text, and the
  bracket at the item), the Summary and highlights of the whole range, the Readout measured across it
  ([**D101 (range-readout)**](#d101)), the Verdict, the Harvest part with every open park's handle,
  text, proposed class, and reason, Next Up with the next range's segment, Your Call, and the
  recommendation; it closes the run's turn in place of the last checkpoint's block, and the model relays
  it whole. Rob's pick at the plan prompt on 2026-10-17, over a stop the CLI renders with the parks
  listed and a pointer at harvest, *because* a landing range's stop is a review, and the block gave it
  nothing to read: every step before the last had landed without a pause, so a step that landed a hair
  off mid-range never reached the screen, and the parks piled up behind a count at the end of the note
  (checkride's polyglot build parked 64 over its run). A stop with no park open renders the card without
  its Harvest part, *because* the review is the stop's point, the plain block leaves it nothing to read,
  and the one reply the card then costs is the run the human was going to type anyway. The card renders
  once per stop under a stamp of its own ([**D87 (pause-once)**](#d87)), its reminder naming the stop
  still waiting, and `plumbbob handoff --stop --full` brings it back. It renders for a run's landing
  only: a range landed by `/plumbbob:build`, a typed range, `--auto`, or by hand keeps the boundary and
  its Stop part, and a bare range's stop is its own pause. Amends [**D85 (range-top-lands)**](#d85): a
  run's clean halt lands its top step first, then ends on the card. Promoted from the 2026-10-17
  runs-and-the-stop-card build, merging its locals `stop-card` and `empty-stop`. *Tagged in*
  `docs/presentation.md`.

- <a id="d101"></a>**D101 (range-readout): The stop card's readout is measured by the CLI across the
  range, and its Verdict folds the range worst-of.** From the steps' commits, the checkpoints ledger,
  `stats.json`, and the last check's summary, the CLI writes the `steps` row (each step the range landed
  with its checkpoint's sha, in build order), the `check` row with the count of landings, the `seam` row
  comparing each step's commit against that step's own seam with the strays named, the `diff` row summed
  over the commits, and the `spent` row from the first step's `startedAt` to the last's `landedAt` with
  the red runs summed; the model writes `done-when`, `decisions`, and `constraints` across the range
  into the range detail, under its own header rule; and the Verdict folds them all worst-of with the
  range's accrued stats, its advisories counted across the range, *because* the CLI measures whatever it
  can ([**D80 (cli-renders-model-relays)**](#d80)), a landed range's facts are already on record in its
  commits and its stats, and a row the model attested about a landed commit is one it could pad. Each
  step is held to its own seam rather than the range's union, *because* a step that wandered into
  another step's seam still wandered. No gate or turn clause rides the range's `spent` row, since a gate
  is one run's wall clock and a range has several, only the last on disk, and the ledger counts turns
  from the tick that entered a step. Promoted from the 2026-10-17 runs-and-the-stop-card build, merging
  its local `range-readout`. *Tagged in* `docs/presentation.md`.

- <a id="d102"></a>**D102 (settle-in-one-reply): The stop card's proposals are settled in one reply,
  each park under a handle the card prints, and a run or a finish typed at the card records it first.**
  `looks good` confirms every proposal (the model folds a confirmed blocker into `intent.md` by the
  harvest skill's rules, then records through `plumbbob harvest`); a reply that changes one is
  direction, and the card re-renders with the proposal changed while nothing is recorded until
  `looks good`; a question is answered and closed on the reminder; and `/plumbbob:run` typed at the card
  confirms them all and runs the next range, *because* the human reads every proposal on the card, one
  reply per item is what made a stop's harvest a chore, and the classes stay the human's call, which is
  the harvest skill's contract. A park's handle is its place in `## Park list`, counting every line ever
  parked, written `park 6` on the card and in a reply and never a bare number, *because* a line is never
  deleted from the list, only flipped, so the number is stable for the life of the build and the record
  matches a proposal to its park without guessing, and the bare numbers are the highlights' (`expand 2`
  opens a section) where one reply can carry both. (Revised 2026-10-18 by
  [**D105 (park-handles)**](#d105) and [**D106 (leans-harvested)**](#d106): the handle is written `P6`, on
  a bullet line, in the detail file and the reply alike, and the proposals are leans the Your Call
  block says approval locks in.) A run typed at a waiting card records the stop first,
  and when `status --run` then reports the grant unlike the run, because the harvest added or moved a
  step in the range the run would walk, the run ends at the boundary, where the record's ending names
  the re-cut run, rather than walking a grant that no longer covers the range, *because* the hook minted
  the grant from the plan before the record ran, and halting before a step its own harvest added is the
  early halt [**D97 (run-refuses)**](#d97) says ranges exist to remove. The plan's last range names
  `/plumbbob:finish` on its card in the run's place, and the finish skill records a waiting stop card
  the way `looks good` would, through `plumbbob harvest`, before it writes the report, *because* every
  build whose plan declares ranges ends its last run on a stop card, finish is the move after it, and a
  review the finish skipped would never reach the Log or the report. Promoted from the 2026-10-17
  runs-and-the-stop-card build, merging its locals `settle-in-one-reply`, `fold-then-run`, and
  `finish-at-a-stop`. *Tagged in* `docs/presentation.md`.

- <a id="d103"></a>**D103 (stop-latched): The stop's record is latched, and a `RUN` mark with an owing
  `RELAY` record holds a run to its card.** `plumbbob harvest` refuses in the turn the stop card
  printed, refuses a range's detail that no stop card showed, and refuses one whose range no longer
  reads as landed, while a harvest outside a stop needs no stamp, *because* a run's long turn that ends
  on proposals is where a model would carry straight on into recording its own, and the record is where
  plumbbob holds the line ([**D64 (approval-latch)**](#d64)). The turn hook marks a run in a `RUN`
  control file naming its range, written beside `GRANT` as it mints a grant that lands steps and cleared
  by the next typed prompt unless a step of that range waits at a pause, while a notice leaves it as it
  leaves the grant ([**D90 (notice-not-turn)**](#d90)), and the latch reads grants exactly as it did;
  the checkpoint that completes a marked range writes its `RELAY` record as owing the stop card, and the
  relay check holds a turn whose last ending still owes it, once ([**D89 (block-once)**](#d89)), with
  `plumbbob handoff --stop` as the retry, *because* only the run skill's prose asked for the card's
  second beat, a boundary relayed whole passed the check, nothing in the CLI could tell a run's grant
  from a typed list's (both mint `steps 6-9`), and a new clean-halt shape has gone wrong under the eval
  tier before, in 2 of 4 runs ([**D85 (range-top-lands)**](#d85)). The mark outlives a prompt at a pause
  inside its range so that a halt approved with `looks good` still owes the card. Promoted from the
  2026-10-17 runs-and-the-stop-card build, merging its locals `stop-latched` and `stop-card-held`.
  *Tagged in* `docs/presentation.md`.

- <a id="d104"></a>**D104 (harvest-records): `plumbbob harvest` records a harvest from the detail file,
  and recording a stop commits nothing.** The verb reads the detail file's `## Harvest` proposals, flips
  each settled park in `build-log.md`, appends the dated Harvest lines, and, when the detail is a
  range's, writes the range's review beneath a dated Log line, then clears the file and the stop's
  stamp; it refuses a proposal naming a park the list lacks or a class other than blocker, tangent, or
  pivot, and leaves a park no proposal names open; the `/plumbbob:harvest` skill records through it too,
  proposing every class at once so one reply settles a boundary harvest; and `checkpoint` never records
  a range's detail beneath a step's Log line, *because* everywhere else in plumbbob a skill decides and
  the CLI records, and a range's review is the record a PR reviewer reads, kept the way `checkpoint`
  keeps a step's pause beneath its Log line. The record commits nothing, and the review and the flipped
  parks ride the next step's checkpoint, or the finish, as a harvest's edits always have, *because* a
  stop commit would need a fourth kind of ledger line that `recover`, `revert`, `status`'s out-of-band
  count, and the finish report would each have to learn, while the Log already carries the review into
  the PR. Its ending is the orientation tier's with no Verdict:
  `**Stop**: Range 3 of 5 recorded (1 blocker, 2 tangents)` at a stop,
  `**Harvested**: 2 parked ideas (2 tangents)` outside one, and Next Up with its note naming the next
  run. (Revised 2026-10-18 by [**D106 (leans-harvested)**](#d106): the ending outside a stop reads
  `**Recorded**: 2 parked ideas (2 tangents)`, and a refusal names a park by its handle, `P9 is not in
  the list`.) Promoted from the 2026-10-17 runs-and-the-stop-card build, merging its locals `harvest-records`
  and `stop-record`. *Tagged in* `docs/presentation.md`.

- <a id="d105"></a>**D105 (park-handles): The stop card names each open park by a handle of its own, `P6` for
  the sixth line ever parked, on a bullet line, and the detail file and the reply name it the same
  way.** The handle is the park's place under `## Park list`, counting every line ever parked, harvested
  ones included: `P6` on the card, `- P6 → tangent: <the reason>` in the detail file's `## Harvest`
  section, and `make P6 a blocker` in a reply, and each park rides a bullet line, not a numbered one,
  *because* a markdown list renumbers its items (open parks 6 and 8 would read 6 and 7, and the number
  the human read would not be the one the record matched), the bare numbers belong to the highlights
  (`expand 2` opens a section), and one name on the card, in the reply, and in the wire leaves nothing
  to map between them. A line is never deleted from the list, only flipped, so the handle holds for
  the life of the build. Rob's call at range 4's stop (2026-10-18), reading a stop card in a throwaway
  repo, over the `park 6` phrase the spec first carried and a plain numbered list; letters had been
  dropped earlier for needing a second mapping and running out. Revises
  [**D102 (settle-in-one-reply)**](#d102)'s `park 6`. Promoted from the 2026-10-17 runs-and-the-stop-card
  build, merging its local `park-handles`. *Tagged in* `docs/presentation.md`.

- <a id="d106"></a>**D106 (leans-harvested): The stop card's part is labeled `Harvested`, each proposal
  reads `→ lean: <class>, <reason>`, the Your Call block says approval locks in each lean while a park
  is open, and `plumbbob harvest`'s ending outside a stop reads `**Recorded**:`.** Each item behind its
  handle carries `→ lean: tangent, <the reason>`, *because* the class is the model's suggestion and has
  to read as one, and `lean` is the plan's own word for a proposed answer (an open question's `*lean:*`),
  so `suggested:` beside it would be a second term for the same thing; the part is labeled `Harvested`,
  *because* it lists what the run harvested for the human to judge; one line beneath the Your Call label
  says that approving locks in each lean and that changing one means saying so first, with an example
  naming a handle on the card (`make P6 a blocker`: the first open park, recast as the class its lean is
  not), and the direction row drops its own example, *because* the reply is a decision on every lean at
  once and the human has to know that before typing `looks good`; and the record's ending outside a
  stop reads `**Recorded**: 2 parked ideas (2 tangents)` where it read `**Harvested**:`, *because* one
  label over a part that proposes and an ending that records would mean two things. A stop with no
  park open renders no lean line, since nothing is there to lock in. Rob's call at range 4's stop
  (2026-10-18). Revises [**D104 (harvest-records)**](#d104)'s ending. Promoted from the 2026-10-17
  runs-and-the-stop-card build, merging its locals `leans-harvested` and `leans-lock-in`. *Tagged in*
  `docs/presentation.md`.

- <a id="d107"></a>**D107 (short-linked-paths): Every `details:` bracket shows the file's name and line as
  a link whose target opens the file.** The bracket reads
  `details: [intent.md:41](.plumbbob/builds/x/intent.md#L41)`: the text is the file's name and line, the
  target the path from the repo root with the line as a `#L` fragment, on the Summary lead (the detail
  file, with no line), Next Up, the Stop part and the stop card's lead, and a transition's lead alike,
  *because* the full sidecar path was noise on every card while the short name still says which file, a
  relative target keeps a machine's path out of any card that gets pasted and resolves on GitHub with
  the line highlighted, and one form at every site is one form to learn. Rob's call at step 15's pause
  of the runs-and-the-stop-card build (2026-10-18), over the code-spanned `path:line`, a link to the
  relative path with no line, and an absolute `file://` URL; the click test the plan asked for, in
  Claude Code's terminal and in Zed, was not run at that pause, and `docs/presentation.md` says so
  beside the form, leaving what each host opens to the first card the code renders. Revises [**D81 (detail-file)**](#d81)'s code-spanned `path:line`. Promoted
  from the 2026-10-17 runs-and-the-stop-card build, merging its local `short-linked-paths`. *Tagged in*
  `docs/presentation.md`.

- <a id="d108"></a>**D108 (order-label): The note beneath Next Up writes the build order as a labeled
  field, `order: 7, 8, 5`.** The segment reads `· order: 7, 8, 5, 10, 6 (and 2 more)` where it read
  `· build order 7, 8, 5, 10, 6 (and 2 more)`, *because* the note's other segments read as labeled
  fields (`range 3 of 5:` names its range, `parked 2 of 7 open` its count) and a label is how the eye
  finds one in a line of three. Rob's call at range 4's stop (2026-10-18). Revises the phrase
  [**D86 (build-order)**](#d86) gave the line. Promoted from the 2026-10-17 runs-and-the-stop-card build,
  merging its local `order-label`. *Tagged in* `docs/presentation.md`.

### Superseded

- <a id="d20"></a>**D20 (local-archive): The archive was local-only markdown.** Wrapping wrote a plain-markdown archive
  under `.plumbbob/archive/`, local-only, that died with a `git worktree remove`. [**D29 (finish-replaces-wrap)**](#d29)
  retired it: a finished build folder is tracked and rides the branch into the PR, so there
  is nothing separate to archive. *Cited only as superseded, in* `doctor.ts`.

- <a id="d19"></a>**D19 (report-gated-finish): `finish` refused without a report.** An earlier close-out gated the exit on a
  written report. [**D9 (finish-no-gate)**](#d9) removed the gate: the close-out writes the report by default but
  never walls the exit. *No longer referenced in code* (`archive.ts` retired with [**D29 (finish-replaces-wrap)**](#d29)).

---

*The conceptual companion to this key is [`techniques.md`](techniques.md), which explains
the methods these decisions shape. Contributors adding a new settled decision should give
it the next free `D#` **and a two- or three-word slug**, and add a line here, with the
`<a id="d#"></a>` anchor every citation points at. Cite it in the form
[**D74 (glossed-citations)**](#d74) sets out, which the gate's `refs` slot checks: a bare
`D#` forces the reader to stop and look it up, where `D# (slug)` reads in place.*
