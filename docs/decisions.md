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
intent-legibility build.)

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
  out of it. *Tagged in* `orient.ts`.
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
  still zero new machinery. *Tagged in* the `build` skill.
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
  dormant rather than wedging. *Tagged in* `latch.ts`, `checkpoint.ts`, `sidecar.ts`, `build.ts`,
  `start.ts`, `turn.ts`, `doctor.ts`.
- <a id="d65"></a>**D65 (human-typed-grants): Grants come from the human's literal prompt.** One-turn self-approval is minted
  only from strings the model cannot type: `build` is `disable-model-invocation`, so a `--auto`
  flag or an `N-M` range reaches the `turn` hook only because the human typed it, *because* a grant the
  model can forge is no grant. The `GRANT` file is scoped (`auto` | `range M`) and rewritten on **every**
  tick (minted on a match, cleared otherwise), so its lifetime is **one turn** by construction; a typed
  range beats `--auto` (bounded wins), and a `range M` refuses at the ceiling (step > M) with a
  top-of-range affordance. The `GRANT` file is the *only* self-approval: the [**D27 (settings-ladder)**](#d27) `auto`
  settings key is not a grant ([**D67 (auto-not-a-grant)**](#d67)). *Tagged in* `turn.ts`, `latch.ts`, `sidecar.ts`.
- <a id="d66"></a>**D66 (oob-commits-surfaced): Out-of-band commits are surfaced, never blocked.** The human commits freely
  ([**C5 (additive-git)**](#c5)); a raw `git commit` the model issues while a step is in flight becomes a permission
  *question* (a `PreToolUse` ask-hook that emits `ask`, never `deny`, [**D13 (no-edit-guards)**](#d13) intact), and
  `status` prints one neutral reconciliation line when commits landed since the last checkpoint outside
  the ledger, *because* prevention where it's free (the `ask`-hook), detection where it isn't (the
  receipts line). The latch is a ratchet against completion-drive, not a cage against a forger: every
  forge stays loud (transcript, `status`, the eval tier), so `doctor` also reports the latch
  live/dormant to make a missing turn hook visible. *Tagged in* `git.ts`, `orient.ts`, `status.ts`,
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
