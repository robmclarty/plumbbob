# Decisions and constraints — the D and C key

PlumbBob's design history is recorded as numbered decisions (`D`) and hard constraints
(`C`) — `D3`, `C1`, `D17`, and so on. The code comments state each rule's *why* in plain
language and do not cite these tags; the tags still appear in a few places a reader can
hit — some CLI output lines (e.g. the latch's settings-`auto` note), some test titles,
and the research notes under `research/`. This page is the key: a reader who hits
"`D17`" anywhere can look up what it means.

Some numbers (e.g. `D2`, `D5`, `D11`, `D12`, `D21`) belonged to superseded decisions
and are no longer referenced. (A build's *own* `intent.md` numbers its decisions from `D1`
locally — comments citing a build-local number are renumbered to this key when the work
lands; [**D33**](#d33)–[**D38**](#d38) below came in that way from the July 2026 worktree restructure.)

## Constraints (C)

Hard rules the code must honor. [**C1**](#c1), [**C2**](#c2), and the statically checkable edges of
[**C4**](#c4)–[**C6**](#c6) are machine-enforced by the ast-grep rules in `rules/` (run via `pnpm check`);
the rest are upheld by review and the design of the code.

- <a id="c1"></a>**C1 — Functional and procedural only.** No classes, no `this`, no default exports;
  every symbol has a stable named export. Enforced by `rules/no-class.yml` and
  `rules/no-default-export.yml`. *Tagged across* `src/**` and the test tree.
- <a id="c2"></a>**C2 — Node builtins plus a few deliberate dependencies.** *Amended* — the CLI imports
  `node:*`, relative paths, and an explicit allowlist of dependencies (currently one:
  `checkride`, our own sibling package, pinned exact — [**D32**](#d32)). The old "zero runtime
  dependencies" wording had hardened into dogma; the rule was always a means
  (determinism, no supply-chain sprawl), not an end. Use a few packages as necessary —
  our own tools first — never a casual `npm install`; hand-crafting what a sibling tool
  already provides is the anti-pattern, not the dependency. Enforced by
  `rules/node-builtins-only.yml` (the allowlist lives in its regex). *Tagged in*
  `git.ts`, `sidecar.ts`, `plugins.ts`, `doctor.ts`, `cli-core.ts`.
- <a id="c3"></a>**C3 — `harness.json` stays bindings + prose, never control flow.** A build's agent
  bindings file carries slot→agent maps and prose `note`s and nothing else — the moment it
  grows an `if`, a `retry`, or a `loop`, the doorway has failed its own spec. Control flow
  lives in *agents* (as code) and in *prose* (read by the host model), never in config
  (GitHub Actions' YAML-grown-a-language is the cautionary tale). *Tagged in* `agents.ts`,
  the `plan`/`step` skills, `docs/agents.md`.
- <a id="c4"></a>**C4 — Never destroy.** No step, revert, or migration path may lose park lines, intent
  edits, or a recorded build folder. `revert` snapshots the tracked build folder and
  restores it after a `reset --hard` ([**D26**](#d26)); `doctor --migrate` moves the legacy sidecar
  and stages it without committing. The deletion perimeter is enforced by
  `rules/centralize-destructive-fs.yml`: `rmSync` and friends compile only in the files
  that legitimately clear control state, snapshots, or legacy layouts. *Tagged in* `revert.ts`. (The old archive-then-clear
  copy retired with `archive.ts` — a finished build folder is now the record it protected,
  [**D29**](#d29).)
- <a id="c5"></a>**C5 — Additive git footprint.** PlumbBob only reads, locates, stages, commits forward,
  and resets `--hard` to its own recorded SHAs. It never rewrites pushed history; your
  squash-merge collapses the checkpoint markers at PR time. Enforced by
  `rules/additive-git-only.yml` (no history-rewriting git token — `push`, `rebase`,
  `--amend`, and kin — compiles as a string literal) and `rules/reset-hard-only-in-revert.yml`
  (`resetHard` has exactly one importer, `revert.ts`). *Tagged in* `git.ts`,
  `finish.ts`.
- <a id="c6"></a>**C6 — The agent envelope has no verb to advance the loop** (the identity invariant). No
  key, flag, or side effect a user-authored agent returns may checkpoint, flip a step, or
  trigger another agent — the subprocess boundary then enforces human-as-clock *by
  construction*, not by policy, at every nesting depth. This is the litmus for every field
  the envelope will ever grow. `rules/agent-no-advance.yml` enforces the firewall in code:
  no commit, stage, reset, or checkpoint import compiles in the agent path. *Tagged in*
  `agents.ts`, `agent.ts`, `docs/agents.md`.
- <a id="c7"></a>**C7 — Keep the agent envelope minimal.** Resist field sprawl (SWE-agent's ACI lesson):
  unknown fields are tolerated and dropped, additions are a minor-version bump, and
  removals or renames are a major ([**D46**](#d46)). *Tagged in* `agents.ts`, `docs/agents.md`.

Beyond the numbered constraints, `rules/` guards three architectural invariants:
`no-process-exit` (only the bin entry exits, so verbs and `cli-core` stay importable by
tests), `no-console` (the CLI writes through `process.stdout` / `process.stderr`), and
`centralize-subprocess` (subprocess spawning stays in `lib/git.ts`, `lib/check.ts`,
`lib/agents.ts`, and `verbs/spike.ts`).

## Decisions (D)

- <a id="d1"></a>**D1 — A deterministic, lean CLI; guidance, not a lock.** The foundation:
  a hand-rolled `plumbbob` CLI built on node builtins (plus the deliberate few of [**C2**](#c2)),
  and a deciding/executing boundary held by a pause rather than enforced by a file lock.
  *Tagged in* `cli-core.ts`.
- <a id="d3"></a>**D3 — The pluggable, author-blind executor.** `/build` is swappable, never required; `verify`
  and `checkpoint` read *the diff, not who wrote it*, so a hand-built, vibed, or
  other-harness diff checkpoints identically. *Tagged in* `checkpoint.ts`, the `build` and
  `verify` skills.
- <a id="d4"></a>**D4 — The in-flight step lives in flat files.** `SEAM` (a plain path list) and `STEP`
  (a bare number) record the step in flight as flat files, not parsed markdown. *Tagged
  in* `sidecar.ts`.
- <a id="d6"></a>**D6 — Steps are the parseable build plan; roadmap prose lives elsewhere.** Only
  `## Steps` carries the numbered, machine-read increments; narrative roadmap text stays
  out of it. *Tagged in* `orient.ts`.
- <a id="d7"></a>**D7 — Capture then triage (park → harvest).** Parking is a dumb flat-line append the
  hooks can read with a grep (no markdown parsing); triage happens later, at a step
  boundary. *Tagged in* `sidecar.ts`, the `park` and `harvest` skills.
- <a id="d8"></a>**D8 — `status` is an orientation dashboard.** It parses the live session into the
  where-am-I view. *Tagged in* `status.ts`, `orient.ts`.
- <a id="d9"></a>**D9 — `finish` is the close-out: report by default, no gate.** A single verb does the
  whole close-out — it writes `report.md` into the build folder, makes the final commit, and
  clears the control state — but never refuses the exit without a report. Renamed from `wrap`
  ([**D29**](#d29)). *Tagged in* `finish.ts`, the `finish` skill. (Supersedes [**D19**](#d19).)
- <a id="d10"></a>**D10 — The boundary is a pause, not a lock.** Nothing blocks edits; the loop pulls up
  to the verify pause and waits. *Scope note ([**D64**](#d64)):* this holds on the **work** plane — no
  edit is ever blocked — but the checkpoint *tick* is now latched to the harness's record of a human
  turn, so a same-turn land is refused and the refusal *is* the pause. Guidance on the work, a latch on
  the record. *Tagged in* `cli-core.ts`, `latch.ts`.
- <a id="d13"></a>**D13 — No edit-blocking guards.** There is no pre-edit muzzle, seam-guard, or bash-guard,
  no human-only `mode` escape hatch, and no `CLAUDECODE` in-session refusal — guidance, not
  enforcement. `rules/no-session-detection.yml` is the tripwire: `process.env.CLAUDECODE`
  doesn't compile. *Tagged in* `cli-core.ts`.
- <a id="d14"></a>**D14 — Subprocess testing in throwaway repos.** Tests run the real CLI against tmp git
  repos; because a real `pnpm check` would recurse into vitest, fixtures point the check at
  a stub. *Tagged in* `test/helpers/fixture-repo.ts`, `check.ts`, and the `check` tests.
- <a id="d15"></a>**D15 — `status` infers one primary next move.** It suggests a single next step while
  printing the full list and counts so you can always override. *Tagged in* `orient.ts`.
- <a id="d16"></a>**D16 — The heavy check plus a single structured self-review.** The verify tick runs the
  full gate, then reads the diff against done-when, Decisions, and Constraints in one pass.
  *Tagged in* `check.ts`, the `build` and `verify` skills.
- <a id="d17"></a>**D17 — The sidecar splits into a tracked artifact plane and an excluded control
  plane.** *Amended* — where the whole `.plumbbob/` used to be git-excluded, now only the
  per-worktree **control** files are (`STATE`, `settings.local.json`, and each build's
  `STEP`/`SEAM`/`SPIKE`); the **artifact** plane — `settings.json` and every
  `builds/<slug>/` folder (intent, build-log, checkpoints, report) — is *tracked* so a
  build's record rides its branch into the PR instead of dying with the worktree ([**D26**](#d26),
  supersedes [**D20**](#d20)). `start --local` keeps the old whole-directory exclude ([**D26**](#d26)).
  *Tagged in* `sidecar.ts`, `git.ts`, `revert.ts`, `spike.ts`.
- <a id="d18"></a>**D18 — The spike lifecycle.** A genuine fork gets a throwaway worktree and branch per
  option, kept outside the repo, torn down by `spike done`. *Tagged in* `spike.ts`.
- <a id="d22"></a>**D22 — `start` refuses a dirty tree.** A clean baseline is required; `--allow-dirty`
  overrides it and records the current HEAD as the baseline. *Tagged in* `start.ts`.
- <a id="d23"></a>**D23 — Seams are exact paths or `dir/` grants, never globs.** A seam token is matched as
  an exact path or a directory prefix; a glob is rejected. *Tagged in* `intent.ts`.
- <a id="d24"></a>**D24 — The heavy check is configurable, defaulting to checkride.** *Amended* — the
  `check` command still resolves through the settings ladder ([**D27**](#d27)), but it is now the
  *override*: a resolved command is spawned exactly as before, and **no setting at all
  means checkride is the gate** ([**D32**](#d32)). `start` seeds `settings.json` with no `check`
  key (absence is the default) and no longer probes for a `check` script — the runtime
  refusal of a nothing-to-check run replaced the warning. *Tagged in* `start.ts`,
  `check.ts`.
- <a id="d25"></a>**D25 — Light feedback at the keystroke, heavy checks at the boundary.** The `post-edit`
  hook runs a non-blocking, file-scoped lint pass and injects findings into the model's
  context; `tsc` and the rest of the gate are deferred to the heavy tier inside `verify`.
  *Tagged in* `hooks/post-edit.sh`.
- <a id="d26"></a>**D26 — One folder per build under `builds/<slug>/`.** Each build owns a self-contained,
  tracked `.plumbbob/builds/<slug>/` folder (intent, build-log, checkpoints, report) that
  rides its branch into the PR; the in-flight `STEP`/`SEAM`/`SPIKE` markers live inside it
  but stay excluded. `revert` snapshots the folder to a temp dir and restores it after the
  `reset --hard`, so a rewind never destroys tracked park lines even when reverting to a
  baseline that predates the folder ([**C4**](#c4)). `start --local` opts back into the old
  fully-untracked flat layout for repos that will not track tool folders. *Tagged in*
  `sidecar.ts`, `start.ts`, `revert.ts`.
- <a id="d27"></a>**D27 — The settings ladder replaces `config`.** A setting resolves flag →
  `settings.local.json` (untracked personal overlay) → `settings.json` (tracked project
  defaults) → built-in default. `check` is a project default; `auto` (agent-approves-in-
  your-place) is a personal preference — but since [**D67**](#d67) it is *not* a checkpoint
  grant (the latch no longer reads it to allow a land; a model can write the file). Both
  files are optional JSON; a malformed one contributes nothing rather than wedging the
  tool. Supersedes the flat `.plumbbob/config`.
  *Tagged in* `settings.ts`, `check.ts`, `start.ts`.
- <a id="d28"></a>**D28 — The active-build cursor lives in `STATE`.** Which build a verb acts on resolves
  `--build <slug>` → the cursor in `.plumbbob/STATE` → the sole build in `builds/` → a refusal
  with a hint. The session sentinel and the cursor are the *same* file: `STATE`'s existence
  means a session is live, and its single-line content names the build that session is on (empty
  under `--local`). Because that content is one line in an untracked per-worktree file,
  one-active-per-worktree holds *by construction* — it cannot point at two builds. (The cursor
  was formerly an `activeBuild` key in `settings.local.json`; homing it in `STATE` keeps that
  overlay purely human-owned — plumbbob only ever *reads* it — and lets one `finish` delete both
  the session and the cursor at once.) *Tagged in* `sidecar.ts`.
- <a id="d29"></a>**D29 — `finish` replaces `wrap`; the build folder is the archive.** The close-out verb
  was renamed `wrap` → `finish` (a clean break, no alias) and gutted: it writes `report.md`
  into the build folder, makes the final commit, and clears the control state — no separate
  archive copy, because the tracked folder already *is* the record and merges into main with
  the branch. Retired `archive.ts`. Supersedes [**D20**](#d20). *Tagged in* `finish.ts`.
- <a id="d30"></a>**D30 — `use <slug>` switches and resumes.** One `nvm use`-shaped verb re-points the
  active-build cursor (`STATE`'s content, [**D28**](#d28)) at a build, validating the folder and warning (but allowing) a leave
  with a step in flight — that surviving in-flight state is the point of per-build markers
  ([**D26**](#d26)). *Tagged in* `use.ts`.
- <a id="d31"></a>**D31 — `doctor --migrate` moves a legacy flat sidecar into `builds/`.** `doctor` detects a
  pre-restructure flat sidecar (`config`, `archive/`, a flat active session) and, under
  `--migrate`, moves the archive entries and the active session into `builds/<slug>/` folders
  (the active one becomes the cursor; the rest are "done" simply by not being it) and turns
  `config` into `settings.json`. It **stages** the move but never commits — the human owns
  that commit (Q8). *Tagged in* `doctor.ts`.
- <a id="d32"></a>**D32 — Checkride is the check gate, imported programmatically.** The heavy check is
  our sibling package `checkride` — the first entry in `dependencies`, pinned exact,
  called through its API (`runChecks`) rather than spawned, so the typed summary (failing
  slots, `.check/<slot>` raw-output pointers) comes back in-process. The `check` setting
  ([**D24**](#d24), amended) becomes the spawn-command *override* for repos that gate through
  something else: present ⇒ spawn it exactly as before; absent ⇒ checkride. An
  all-slots-skipped checkride run is a refusal, not a green — zero-config detection in an
  unconfigured repo must not vacuously pass the gate. Checkride's exit 2 (harness error)
  reports distinctly from red; both block. *Tagged in* `check.ts`.

- <a id="d33"></a>**D33 — Excludes live in the shared gitdir's `info/exclude`.** The control-plane
  excludes are written to the *common* gitdir's `info/exclude` — reached via
  `git rev-parse --git-path info/exclude`, which resolves correctly from a linked worktree
  (a per-worktree gitdir has no `info/`) — never to `.gitignore`, so the exclusion is
  personal machinery, not something imposed on the repo. Enforced by
  `rules/no-gitignore.yml`: the string `.gitignore` doesn't appear in `src/`. *Tagged in*
  `git.ts`, `sidecar.ts`.
- <a id="d34"></a>**D34 — The CLI owns every commit subject; bodies arrive via `--body`.** The subject is
  composed by the CLI, never the skill; a skill-composed, proportional commit *body* rides along through
  a `--body` stdin heredoc. The subject *shape* — originally one greppable
  `plumbbob: plan/step N/finish — <title>` family — is now Conventional ([**D68**](#d68)); this
  decision's ownership principle is unchanged. *Tagged in* `git.ts`, `checkpoint.ts`, `finish.ts`, the
  `finish` skill.
- <a id="d35"></a>**D35 — The deterministic fallback body.** Without `--body`, a checkpoint's commit body
  is derived, not generated: the step's done-when, its seam, and the staged diffstat — all following the
  `plumbbob step N` marker line ([**D68**](#d68)). *Tagged in* `git.ts`, `checkpoint.ts`.
- <a id="d36"></a>**D36 — Plan approval gets its own commit.** `checkpoint --plan` commits only the
  build's artifact folder as `chore(<scope>): plan` ([**D68**](#d68)) and records a `plan <sha>` line,
  so the scaffold never pollutes the first step's diff and history reads baseline → plan →
  steps → finish. *Tagged in* `checkpoint.ts`, `git.ts`, `sidecar.ts`, the `plan`
  skill.
- <a id="d37"></a>**D37 — Checkpoint sweeps its own bookkeeping; `finish` absorbs the tail.** A step's
  commit carries the intent `[x]` flip and the build-log line along with the work
  (`stageAll`), which means the step's own `checkpoints` line lands one commit late — the
  final `finish` commit picks up the last of it. *Tagged in* `finish.ts`.
- <a id="d38"></a>**D38 — Slugs are the CLI's job; collisions refuse.** `slugify` and its collision
  handling live in `sidecar.ts`; `start` refuses a slug that already exists rather than
  auto-suffixing — the human picks a new title or passes `--slug`. Derived slugs carry a
  `YYYY-MM-DD-` prefix so `builds/` sorts chronologically under a plain lexical listing —
  ordering by construction, not by titling convention; an explicit `--slug` stays
  verbatim. *Tagged in* `sidecar.ts`, `start.ts`, `doctor.ts`.

The **user-authored-agent doorway** (July 2026, `docs/agents.md`) added [**D39**](#d39)–[**D61**](#d61) and
[**C3**](#c3)/[**C6**](#c6)/[**C7**](#c7). (The build's own `intent.md` —
`.plumbbob/builds/2026-07-02-user-agent-plugins-…/` — numbered these decisions locally as
D1–D24/C1–C7, per this page's convention; the code and docs cite the renumbered global tags
below.)

- <a id="d39"></a>**D39 — The agent doorway is one versioned subprocess envelope.** A user-authored agent is
  *anything executable* that speaks JSON-on-stdin / JSON-on-stdout / prose-on-stderr —
  runtime-agnosticism is the doorway (Terraform's `external` has run this exact contract since
  2017; checkride's stream discipline is already house style). *Tagged in* `agents.ts`,
  `agent.ts`, the skills, `docs/agents.md`. (See [**C6**](#c6) for the identity invariant that
  bounds it.)
- <a id="d40"></a>**D40 — One verb, `agent run`, with no way to advance the loop.** Deterministic mechanics
  only — compose the context, spawn, validate, apply side effects — and no checkpoint, step
  flip, or chaining, so the boundary enforces human-as-clock by construction ([**C6**](#c6)).
  *Tagged in* `agent.ts`.
- <a id="d41"></a>**D41 — Agents resolve flag → project → personal.** `--agent <path>`, then
  `.plumbbob/agents/<name>/` (tracked, rides the PR), then `~/.plumbbob/agents/<name>/`
  (personal), first hit wins, project shadowing personal — the settings ladder's shape
  ([**D27**](#d27)) and Claude Code's two-level `.claude/agents/` convention. *Tagged in* `agents.ts`.
- <a id="d42"></a>**D42 — Planned bindings live in `builds/<slug>/harness.json`.** A sibling of `intent.md`
  authored at `/plan` time, not inside the executor-agnostic intent ([**D3**](#d3)) — the plan
  says *what/why*, the harness says *with-what*. *Tagged in* `agents.ts`, `sidecar.ts`, the
  `plan`/`step` skills.
- <a id="d43"></a>**D43 — Exactly three slots: `before`, `build`, `after`.** Context-in, the diff, advisory
  review — and no fourth, because no declarative format can name "a salient point in the
  middle"; that judgment is prose the host model reads (a manifest `when`, a step `note`).
  *Tagged in* `agents.ts`, the loop skills, `docs/agents.md`.
- <a id="d44"></a>**D44 — The CLI applies every side effect; the agent never writes `.plumbbob/`.**
  `parked[]` lands through the park verb; an agent writing the sidecar directly is out of
  contract — the sidecar keeps a single writer. *Tagged in* `agent.ts`.
- <a id="d45"></a>**D45 — `after` output is advisory; checkride gates; the human advances.** An after-agent
  informs the verify pause and can never fail a step — a gate an agent can trip is the lock
  returning in autonomy's costume. *Tagged in* `agent.ts`, the `verify` skill.
- <a id="d46"></a>**D46 — Stream discipline and exit-code semantics.** stdout carries the envelope alone,
  stderr streams the child's prose live to the terminal, exit 0 makes the envelope
  authoritative and any non-zero is a failed run (reported, not trusted); a contract
  major-version mismatch is refused with an upgrade hint. Production (narrating) must never
  collide with consumption (one structured result at the pause). *Tagged in* `agents.ts`,
  `agent.ts`, `docs/agents.md`.
- <a id="d47"></a>**D47 — The step-scoped handoff ledger.** `agent run` re-emits the envelope on its own
  stdout (inline, for the calling skill) *and* appends it to `builds/<slug>/handoff.json` —
  untracked in-flight control state, scoped to the current step and cleared when the step
  checkpoints (like `STEP`/`SEAM`) — so sequential runs and a compacted context can thread
  earlier envelopes into the next call's `context[]`. *Tagged in* `sidecar.ts`,
  `checkpoint.ts`, `agent.ts`.
- <a id="d48"></a>**D48 — `doctor` validates agents; `status` reports bindings.** `doctor` walks every
  resolvable agent (manifest well-formed, command present/executable, contract supported);
  `status` lists the active build's harness bindings and warns on ones that don't resolve —
  the surfaces the user already checks carry the report, so no separate `agent check` verb.
  *Tagged in* `doctor.ts`, `status.ts`.
- <a id="d49"></a>**D49 — POSIX only; the command runs via `sh -c` at the repo root.** `command` is a shell
  string (not an argv array), spawned with the **repo root** as cwd so a build-slot agent's
  repo-relative seam edits resolve; the agent's own directory rides in `PLUMBBOB_AGENT_DIR`
  so it can still reach its files. *Tagged in* `agents.ts`, `doctor.ts`, `docs/agents.md`.
- <a id="d50"></a>**D50 — Nested invocation is allowed, uncapped.** An agent may shell `plumbbob agent run`
  to compose other agents (a build/review loop, say); loops belong inside agents as code,
  cutoffs are the author's job, and the identity invariant ([**C6**](#c6)) holds at every depth —
  a documented warning, not enforcement. *Tagged in* `agents.ts`, `docs/agents.md`.
- <a id="d51"></a>**D51 — `agentTimeout`, off by default.** A settings-ladder key (seconds): absent or `0`
  means no timeout, set means kill the child on expiry and report a failed run — the human is
  present (Ctrl-C works, [**D58**](#d58)), so enforcement is the user's explicit opt-in.
  *Tagged in* `agents.ts`, `settings.ts`.
- <a id="d52"></a>**D52 — `blocked` and `drift` route differently at the pause.** `blocked` = the agent
  couldn't finish (surface its `notes`, unblock, re-run); `drift` = it finished but found the
  plan no longer matches reality (repair with `/refine` before continuing) — the two halts
  need different medicine. *Tagged in* `agent.ts`, the loop skills.
- <a id="d53"></a>**D53 — Keys, model choice, and sandboxing are the agent's business.** The `settings`
  block in the StepContext carries plumbbob's own relevant settings and nothing else —
  PlumbBob never touches a provider key; how an agent authenticates, which model it calls,
  and how it sandboxes itself live in *its* env and config. *Tagged in* `agents.ts`,
  `docs/agents.md`.
- <a id="d54"></a>**D54 — Explicit asks fail loud; ambient bindings degrade soft.** `agent run <name>`
  naming an unresolvable agent **errors**, and `--mode X` against a manifest that doesn't
  declare slot X **refuses** — the user who typed the name asked for that agent
  specifically. Only a harness-*bound* agent a teammate lacks downgrades to a warning and
  is skipped, because a binding is ambient configuration the loop must survive without
  (the same never-required contract as `/build` itself). A run that actually starts and
  fails is a hard failure either way — this softens a *missing* agent, never a broken one.
  *Tagged in* `agent.ts`, `agents.ts`, `status.ts`, the `plan` skill.
- <a id="d55"></a>**D55 — The manifest speaks to two audiences.** `command` is for the deterministic CLI;
  `description` and `when` are prose for the **host model** (the role a subagent's
  frontmatter description plays) — `when` is the cue the model reads to fire an agent
  mid-build, because each half of when/how feeds the layer that can actually use it.
  *Tagged in* `agents.ts`, the `build` skill.
- <a id="d56"></a>**D56 — `--auto` composes with zero new machinery.** Bound `before`-agents → implement
  (or the bound `build`-agent) → bound `after`-agents → check → self-review →
  checkpoint-if-clean → next; the `after` output feeds the *existing* self-review halt
  condition, so the default path — everything lands at the pause — stays unchanged. A
  step range `N-M` rides the same seam: it is `--auto` with one more halt of the same
  kind (stop before any step past M), re-imposing the pause at the top of the range —
  still zero new machinery. *Tagged in* the `build` skill.
- <a id="d57"></a>**D57 — The bindings merge ladder.** For one step and slot: an explicit name or `--agent`
  flag beats the per-step harness entry, which beats the harness `defaults`, which beat the
  settings-level `agents` key — the first level that names the slot wins, **replace, not
  append** — because that's the existing settings ladder ([**D27**](#d27)), down to the tier.
  *Tagged in* `agents.ts`, `agent.ts`, `settings.ts`.
- <a id="d58"></a>**D58 — SIGINT is forwarded to the child.** The human is present, so Ctrl-C kills the
  agent (with a SIGKILL escalation) and reports, rather than orphaning it.
  *Tagged in* `agents.ts`.
- <a id="d59"></a>**D59 — Before-slot outputs travel inline as `context[]`.** Inline in the input JSON is
  the simplest transport until size proves otherwise; revisit only on evidence.
  *Tagged in* `agents.ts`, the `build` skill.
- <a id="d60"></a>**D60 — Async `spawn`, not `spawnSync`.** A live parent can interrupt gracefully
  (message + cleanup) where a blocked one just dies with the child; `dispatch` is already
  Promise-typed, so it costs no plumbing. Enforced by `rules/no-sync-spawn-in-agent-path.yml`.
  *Tagged in* `agents.ts`, `agent.ts`.
- <a id="d61"></a>**D61 — Decisions/constraints scraping is best-effort, verbatim.** Every top-level
  dash bullet under `## Decisions`/`## Constraints` passes as one verbatim string (wrapped lines
  joined, the `*because*` rationale intact), skipped lines warn on stderr, and the scrape
  never refuses — it feeds an agent's context, not a gate; seam parsing stays strict
  precisely because seams gate git behavior ([**D23**](#d23)). *Tagged in* `intent.ts`, `agents.ts`.
- <a id="d62"></a>**D62 — A step's model recommendation is advisory metadata.** An optional
  `- model:` sub-line beside the seam names the **smallest model that can carry the step**, with
  the one-phrase why (mechanical, fully-specified work → a small model; strong-assertion test
  authoring → a mid one; subtle, creative, or cross-cutting work → a frontier one) — the human
  buys capability only where the step needs it. Scraped best-effort like the other step meta
  ([**D61**](#d61)) and surfaced by `status` in the next step's detail; orientation for the human
  choosing where to spend attention and tokens, **never a gate** — nothing reads it to switch a
  model or refuse a build. Plain text, no backticks, so it can never be mistaken for a seam token.
  *Tagged in* `orient.ts`, `intent.ts`, the intent template, the `plan`/`step`/`status`
  skills.
- <a id="d63"></a>**D63 — Judgment skills inherit the session model; only the clerks pin.** The
  judgment moves (`plan`, `step`, `build`, `verify`, `refine`, `harvest`,
  `finish`) carry no `model:` frontmatter — a pin is a ceiling as much as a floor (it silently
  downgrades a frontier session), it overrides the very choice [**D62**](#d62) asks the human to
  make, and prompt caches are model-scoped, so every pinned hop re-reads the whole conversation
  uncached at full input price. The mechanical clerks (`status`, `park`, `spike`,
  `revert`, `doctor`) stay pinned to `haiku`: model quality is irrelevant to a verbatim
  reporter, and small-model economics beat the switch toll there. The human steers with `/model`,
  informed by the per-step recommendation ([**D62**](#d62)) — prose in `plan`/`build`
  nudges, never forces. *Expressed in* the skill frontmatters.

The **approval latch** (July 2026, `.plumbbob/builds/2026-07-09-the-approval-latch/`, from
`research/06-approval-latch.md`) added [**D64**](#d64)–[**D66**](#d66): ledger-plane
enforcement of the checkpoint tick, while the work plane stays guidance ([**D10**](#d10)/[**D13**](#d13)).

- <a id="d64"></a>**D64 — The approval latch: ledger-plane enforcement.** Nothing blocks an edit — the
  work plane stays guidance ([**D10**](#d10)/[**D13**](#d13) intact) — but the checkpoint *tick* is
  latched: `checkpoint` refuses to land a step until the harness's turn ledger records a **human turn
  since the step was entered**, *because* the two boundaries live on different planes — guidance on the
  **work**, a latch on the **record**. A refused checkpoint is not an error; the refusal message *is*
  the pause (present the diff, end the turn, the human's next prompt is the tick that lands it on
  re-fire). A five-row predicate decides it, first hit wins — `isTTY` (a human at the keyboard) → an
  absent `TURN`/`TICK` (ledger dormant / hand-built diff) → a one-turn `GRANT` ([**D65**](#d65)) →
  `TURN > TICK` → else refuse — reading only `TURN`/`TICK`/`GRANT`/
  `isTTY`, never the host ([**D13**](#d13)), and running *before* the check gate (cheap first). It
  **amends [**D10**](#d10)'s scope** and joins the existing verb-boundary family (`checkpoint` refuses
  red [**D32**](#d32), `start` refuses dirty [**D22**](#d22), the agent envelope can't advance the loop
  [**C6**](#c6)). A host with no hooks grows no ledger and behaves exactly as before — the latch stays
  dormant rather than wedging. *Tagged in* `latch.ts`, `checkpoint.ts`, `sidecar.ts`, `build.ts`,
  `start.ts`, `turn.ts`, `doctor.ts`.
- <a id="d65"></a>**D65 — Grants come from the human's literal prompt.** One-turn self-approval is minted
  only from strings the model cannot type — `build` is `disable-model-invocation`, so a `--auto`
  flag or an `N-M` range reaches the `turn` hook only because the human typed it — *because* a grant the
  model can forge is no grant. The `GRANT` file is scoped (`auto` | `range M`) and rewritten on **every**
  tick (minted on a match, cleared otherwise), so its lifetime is **one turn** by construction; a typed
  range beats `--auto` (bounded wins), and a `range M` refuses at the ceiling (step > M) with a
  top-of-range affordance. The `GRANT` file is the *only* self-approval — the [**D27**](#d27) `auto`
  settings key is not a grant ([**D67**](#d67)). *Tagged in* `turn.ts`, `latch.ts`, `sidecar.ts`.
- <a id="d66"></a>**D66 — Out-of-band commits are surfaced, never blocked.** The human commits freely
  ([**C5**](#c5)); a raw `git commit` the model issues while a step is in flight becomes a permission
  *question* (a `PreToolUse` ask-hook that emits `ask`, never `deny` — [**D13**](#d13) intact), and
  `status` prints one neutral reconciliation line when commits landed since the last checkpoint outside
  the ledger — *because* prevention where it's free (the ask-hook), detection where it isn't (the
  receipts line). The latch is a ratchet against completion-drive, not a cage against a forger: every
  forge stays loud (transcript, `status`, the eval tier), so `doctor` also reports the latch
  live/dormant to make a missing turn hook visible. *Tagged in* `git.ts`, `orient.ts`, `status.ts`,
  `doctor.ts`, `hooks/pre-bash-commit.sh`.
- <a id="d67"></a>**D67 — Self-approval is human-typed only; the standing settings `auto` is retired.**
  The latch no longer honors an `auto` in a settings file — the one row of [**D64**](#d64)'s matrix that
  read it is removed, leaving five. *Because* a model can write `settings.local.json`, that standing grant
  was the one self-approval it could **forge** (measured: the eval tier's adversarial-pressure contract had
  models minting `auto: true` under pressure, a legal side door the latch honored), and [**D65**](#d65)'s
  own rule already says a grant the model can forge is no grant. Self-approval now comes *only* from the
  human's literal `/build --auto` or `N-M` range through the `GRANT` file (D65) — the routes a model
  cannot type, since `build` is `disable-model-invocation`. This is **guidance-first — it removes a
  mechanical honor, it adds no lock**: TTY (row 1), hookless hosts (row 2, dormant), `--auto`, and ranges
  all still work; unattended autonomy is one typed `--auto` away. A set-but-ignored `auto` is **surfaced,
  not punished** — the refusal message names it and `doctor` prints an informational `○` line — so a human
  who relied on it isn't silently changed. Amends [**D64**](#d64) (five-row), [**D65**](#d65), and
  [**D27**](#d27). *Tagged in* `latch.ts`, `settings.ts`, `doctor.ts`, `agent.ts`, `skills/build`,
  `skills/verify`.
- <a id="d68"></a>**D68 — Commit subjects are Conventional Commits; `plumbbob`/`step N` move to the body.**
  *Amended* — every plumbbob commit subject reads as `type(scope): description`, so `git log` speaks the
  same grammar as the rest of the branch: `chore(<scope>): plan`, a per-step `<type>(<scope>): <description>`
  (titleless fallback `chore(<scope>): checkpoint`), and `chore(<scope>): finish`. The step's own **title
  line is the subject, authored once**: an author-written Conventional prefix (`fix(parser): handle empty
  seam`) is honored verbatim — its scope and breaking `!` win — while a bare prose title defaults to `feat`
  (plan and finish default to `chore`) and has its sentence-case opener de-capitalised; load-bearing detail
  stays out of the title and lives in the step's seam instead. The **scope** resolves through a fallback
  chain, most specific first: the title's own `(scope)` → the build's `**Scope:**` default header (authored
  once in `intent.md` at plan time) → the build's slug with its `YYYY-MM-DD-` date prefix stripped
  (`2026-07-18-escape-hatch` → `escape-hatch`, this decision's original rung) → no scope at all (`--local` →
  a bare `chore: finish`) — so a build that predates the `**Scope:**` header, or never fills it, keeps
  behaving exactly as it did before this amendment. The `plumbbob` and `step N` identifiers the old subject
  carried ride a **marker line at the head of the body** (`plumbbob step 1`, `plumbbob plan`,
  `plumbbob finish`), prepended whether the body is `--body` prose, the deterministic fallback
  ([**D35**](#d35)), or empty — so `git log --grep plumbbob` still finds every plumbbob commit. Supersedes
  the greppable-subject *shape* of [**D34**](#d34); D34's ownership principle — the CLI owns every subject,
  bodies arrive via `--body` — stands, as does [**D36**](#d36)'s plan-gets-its-own-commit. *Tagged in*
  `commitmsg.ts`, `intent.ts`, `sidecar.ts`, `checkpoint.ts`, `finish.ts`, the
  `plan`/`step`/`refine`/`verify`/`finish` skills.

- <a id="d69"></a>**D69 — The build-log's Steps mirror and Current step line are CLI-owned.**
  build-log.md's `## Steps` checklist and its `**Current step:**` line are now maintained by the
  CLI, not by a skill or by hand. The three verbs that move step state each re-render them from
  intent.md: `build` sets Current step to `<n> — <title>` and marks the ☐/☑ mirror on entry,
  `checkpoint` flips the landed step to ☑ and returns Current step to `none (at the boundary)`,
  and `revert` returns it to the boundary while re-rendering the mirror from the preserved
  intent.md ([**D26**](#d26) keeps intent edits across a reset, so its checkboxes stay the truth).
  Before this the mirror had no owner — neither the CLI nor any skill wrote it, so whether it
  tracked reality was model whim, and most builds left the raw `- ☐ 1. <step>` placeholder beside
  a fully populated `## Log`. This is the same cure the orphaned `## Log` got when `checkpoint`
  took it over: the human-facing ledger's top half is mechanical, so it never lies. Every write is
  best-effort — a missing or hand-edited build-log never fails a verb; the checkpoints ledger and
  intent.md remain the source of truth — mirroring how the `## Log` append already behaves.
  *Tagged in* `buildlog.ts`, `buildlogsync.ts`, `build.ts`, `checkpoint.ts`, `revert.ts`,
  `templates/build-log.md`.

- <a id="d70"></a>**D70 — Spikes leave a durable report: one artifact, two entry points.** A spike's
  verdict used to evaporate — `spike done` said "record it in intent.md" and the throwaway worktrees
  (with the learning that justified the call) were gone. Now every spike leaves a `spike-NN-<slug>.md`
  report in the build folder, beside `intent.md`/`report.md`, so it rides the branch into the PR the
  way the finish report does. The CLI owns the file and its numbering (next free zero-padded index, a
  gap is never refilled) — the human never creates or numbers it. **Two entry points, one template**
  (`templates/spike-report.md`, sections Question / Options tried / Findings / **Verdict** / What this
  decides): `plumbbob spike "<slug>"` scaffolds it *at open* so findings accrue while the worktrees
  live; `plumbbob spike report "<slug>"` scaffolds it with no worktrees for a **spike-as-step** — a
  planned step titled `spike: …` where the increment itself is the experiment — stamping provenance as
  `step <n>` when a step is in flight, else `/spike`. `spike done` scans for the verbatim Verdict
  placeholder and **nudges** when it is unfilled, but still closes (guidance, not a gate — the
  enforce→guide pivot). `spike` is not a Conventional-Commit type ([**D68**](#d68)), so a `Spike:`
  step title falls through to the `feat` default with no special-casing. *Tagged in* `spike.ts`,
  `sidecar.ts`, `templates/spike-report.md`, `templates.ts`, `cli-core.ts`, the `spike`/`build`
  skills.

### Superseded

- <a id="d20"></a>**D20 — The archive was local-only markdown.** Wrapping wrote a plain-markdown archive
  under `.plumbbob/archive/`, local-only, that died with a `git worktree remove`. [**D29**](#d29)
  retired it: a finished build folder is tracked and rides the branch into the PR, so there
  is nothing separate to archive. *Cited only as superseded, in* `doctor.ts`.

- <a id="d19"></a>**D19 — `finish` refused without a report.** An earlier close-out gated the exit on a
  written report. [**D9**](#d9) removed the gate: the close-out writes the report by default but
  never walls the exit. *No longer referenced in code* (`archive.ts` retired with [**D29**](#d29)).

---

*The conceptual companion to this key is [`techniques.md`](techniques.md), which explains
the methods these decisions shape. Contributors adding a new settled decision should give
it the next free `D#`, reference it inline where it is implemented, and add a line here —
with the `<a id="d#"></a>` anchor the docs' `[**D#**](decisions.md#d#)` links point at.*
