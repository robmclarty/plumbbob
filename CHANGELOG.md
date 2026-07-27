# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-07-27

- **Changed (breaking):** the twelve skills dropped their `pb-` prefix and are now
  single words — `build`, `plan`, `step`, `verify`, `park`, `status`, `harvest`,
  `finish`, `refine`, `revert`, `spike`, `doctor` — invoked as `/plumbbob:<verb>`.
  Every `/pb-*` command is gone; update any muscle memory, scripts, or notes that
  name one. The prefix existed to work around a Claude Code bug: before v2.1.216 a
  plugin skill's frontmatter `name` replaced the *whole* command, so
  `/plumbbob:pb-build` never autocompleted and only the bare `/pb-build` appeared in
  the menu — with no namespace reaching the UI, `pb-` was the only thing keeping
  twelve generic verbs out of every other plugin's way. Claude Code 2.1.216 made
  `name` set just the last segment, the namespace came back, and the prefix stopped
  earning its keep.
- **Changed:** every example slash command in the README, docs, templates, examples,
  skill bodies, and the website now reads in its namespaced form (`/plumbbob:build`
  rather than `/build`), and so does every command the CLI itself names in its
  output. This is not cosmetic: a plugin skill's bare short name reaches the skill
  only where nothing else already owns that name, and four of the twelve — `plan`,
  `status`, `verify`, `doctor` — share one with a Claude Code built-in, which wins.
  `plumbbob status` was ending a run with ``next → finish step 2 — `/verify` ``, an
  instruction that ran Claude Code's command instead of plumbbob's.
- **Changed:** source comments no longer cite decision and constraint tags (`D3`,
  `C1`, and the like) inline — they state the rule's *why* in plain language
  instead. The tags still live in `docs/decisions.md` and the research notes; the
  code just stops pointing at them by number. A new ast-grep rule
  (`rules/function-doc-comment.yml`) requires a `/** */` doc comment above every
  top-level function going forward.
- **Fixed:** the approval latch's one-turn grant could be minted by a path that
  merely ended in `/build`. `/pb-build` was distinctive enough that no prompt hit it
  by accident, but `/build` is an ordinary path segment, and a prompt like
  `rerun src/build --auto` would have minted a self-approval nobody typed. The
  invocation must now start a token — a slash preceded by a word character, `/`,
  `.`, `-`, or `~` is read as a path, not a command.

## [0.8.18] - 2026-07-19

- **Fixed:** `plumbbob finish --body` could hang indefinitely when invoked as
  `--body "$(cat <<'BODY' ... BODY)"` — that form passes the body as an ignored
  argument while leaving the process's own stdin open with no EOF, so the
  blocking `readFileSync(0)` read never returned. `finish.ts` now shares the
  same interactive-TTY guard as `checkpoint.ts`'s `--body`, degrading to a
  subject-only commit instead of hanging when stdin will never send EOF. The
  `pb-finish` skill now shows the correct `--body <<'BODY' ... BODY` heredoc
  redirect explicitly, matching `pb-verify`/`pb-build`/`pb-plan`, and warns
  against the broken argument form.
- **Changed:** the `package.json` `homepage` field now points at the live
  GitHub Pages site instead of the README anchor, and the README links to the
  new website, docs guide, and API reference so they're discoverable from npm
  and GitHub.

## [0.8.17] - 2026-07-19

- **Fixed:** the static marketing site under `site/` no longer breaks CI. Its `<script>`-loaded
  JS (`support.js`, `stars.js`) was tripping the `lint` and `dead` checks — oxlint flagged the
  bundled `support.js` for unused expressions, and fallow reported both files as unused because
  its detection only follows the JS/TS module graph, not HTML `<script src>` references. Both
  checks now exclude `site/**`, mirroring the existing `examples/**` exclusion for non-source
  assets.

## [0.8.16] - 2026-07-19

- **Added:** a public marketing and documentation site under `site/` — a landing page, a
  task-focused docs guide, and a full CLI and skills API reference — rendered by the shared
  DC runtime and deployed to GitHub Pages via a new `.github/workflows/pages.yaml`. It mirrors
  the fascicle and checkride sites but carries a distinct indigo-violet palette and a
  plumb-line logo mark, frames the marketplace plugin as the primary install with the npm CLI
  as the power-user path, and leads the API reference with the `/pb-*` skills while presenting
  the lower-level CLI verbs as an advanced reference.

## [0.8.15] - 2026-07-19

- **Changed:** upgraded checkride to 0.5.2 (from 0.3.0). `checkride.config.json` now assigns
  each check an execution `order` — fast structural checks run first, `types`/`docs` follow,
  and `test` runs alone (`order: "single"`) since the suite saturates every core and
  shouldn't share a wave with anything else.
- **Changed:** checkride 0.5.0 ships built-in `pack`/`smoke`/`snippets` publish-bundle
  adapters that resolve on any package even without its own tool config — the same
  always-on trap as the existing `links`/`pnpm-audit`/`publint`/`attw` quartet. The
  plan-time gate probe's `ALWAYS_ON_ADAPTERS` list now includes them so an unconfigured
  gate doesn't read as configured.
- **Changed:** `fallow.toml` now excludes `examples/**` — standalone example packages carry
  their own dependency graph and aren't part of this project's source.

## [0.8.14] - 2026-07-19

- **Changed:** a plumbbob step's title line is now authored as the Conventional Commit
  subject itself — one source of truth the human writes once — rather than a line-item the
  checkpoint assembler jams into a slug-scoped subject. Load-bearing detail (file paths,
  module names) moves out of the title into the step's `seam`, so the title reads as plain
  English and a clean subject at the same time, and titles aim for a soft ≤72 characters
  (GitHub's convention, no lint). The `pb-plan`, `pb-step`, and `pb-refine` skills and the
  intent template teach this, and `pb-refine`'s repair mode now treats a title that no
  longer describes the diff as drift to re-sync.
- **Changed:** the commit scope now resolves through a graceful fallback chain — the title's
  own `(scope)` → a per-build `**Scope:**` default header authored once in `intent.md` →
  the build slug → no scope at all. A step's `(scope)` names the code area it touches while
  the build-default names the feature as the catch-all; a build that sets neither keeps the
  prior slug-derived behavior, and an unfilled `**Scope:**` placeholder parses as absent so
  a freshly scaffolded build never lands `(<scope>)` commits (amends D68).
- **Changed:** when the diff drifts from the planned title before the verify pause,
  `/pb-build` and `/pb-verify` now present a reconciled subject (planned title → proposed
  subject) for explicit approval and land it via the existing `-m` override; with nothing
  presented, the deterministic title-derived subject stands — a silent swap would reopen the
  agent-authored subjects D68 refuses.
- **Changed:** `intent.md` open questions now author in an expanded plain/lean form — an
  opener slugged at birth, a `*plain:*` cold-reader explanation with stakes, and a `*lean:*`
  proposed resolution — so a hole can be decided without a round-trip back to the chat, and
  self-collapses to one line once resolved. Decisions and Constraints are slugged where they
  are born (`D1 (in-memory-bucket)`) and every reference copies the gloss rather than a bare
  `D4`, so a reference reads on its own. The `pb-plan`, `pb-refine`, and `pb-park` skills,
  the intent template, and `docs/techniques.md` all teach this, with the compression
  principle (compress what's settled, expand what's pending) written into the docs.
- **Fixed:** `parseOpenQuestions` reads through the slug-at-birth gloss on a question opener
  (`- Q2 (some-slug): …`) so the expanded plain/lean sub-lines never move the status count.

## [0.8.13] - 2026-07-19

- **Added:** every spike now leaves a durable `spike-NN-<slug>.md` report in the build
  folder, beside `intent.md` and `report.md`, so a fork's verdict rides the branch into the
  PR instead of evaporating when the worktrees are torn down. There are two entry points to
  one template: `plumbbob spike "<slug>"` scaffolds the report at open, so findings accrue
  while the throwaway worktrees are still live, and the new `plumbbob spike report "<slug>"`
  scaffolds one without worktrees for a spike-as-step — a planned step titled `spike: …`,
  stamped with `via: step <n>`. The CLI owns the file and its gap-free numbering; the human
  never creates or numbers it.
- **Changed:** build-log.md's `## Steps` mirror and its `**Current step:**` line are now
  maintained by the CLI rather than by hand or model whim. `build` sets the current step to
  `<n> — <title>` and marks the ☐/☑ mirror on entry, `checkpoint` flips the landed step to ☑
  and returns to the boundary, and `revert` resets it — each re-rendered from intent.md as a
  best-effort write that never blocks the verb.
- **Changed:** `plumbbob spike done` now points the verdict at the spike report rather than
  intent.md, and nudges when a report's verdict is still unrecorded — but it still closes the
  spike, keeping the guidance-not-a-gate posture.

## [0.8.12] - 2026-07-18

- **Changed:** plumbbob's plan, step, and finish commits now carry Conventional Commit
  subjects — `chore(<scope>): plan`, `<type>(<scope>): <description>` per step, and
  `chore(<scope>): finish` — in place of the old `plumbbob: <verb> — <title>` shape. The
  scope is drawn from the build slug (its `YYYY-MM-DD-` date prefix stripped), and a step's
  type comes from its title: an author-written Conventional prefix such as `fix(parser):` is
  honored verbatim, while a bare title defaults to `feat` and plan/finish default to `chore`.
- **Changed:** the `plumbbob` and `step N` identifiers that used to prefix the commit subject
  now ride a marker line at the head of the commit body, so subjects stay clean while
  `git log --grep plumbbob` still finds every plumbbob commit (D68 supersedes the
  greppable-subject shape of D34 while keeping its CLI-owns-the-subject principle).

## [0.8.11] - 2026-07-18

- **Changed:** the README now leads with the mechanical substrate — the gate that refuses a
  red check, the SHA-per-step ledger, the preservation-aware revert, the PR-riding build
  record, and the approval latch — as the thing a prompt cannot replicate, with the skeptic
  answers referencing that lead instead of restating it. The skill-eval blockquote is
  reframed for the shipped hardening: the adversarial-pressure side door is now closed by
  construction (D67 retired the model-writable settings `auto` grant), and park capture is
  named plainly as the remaining guidance-only gap.
- **Fixed:** the skill-eval harness no longer voids a valid run as a plugin-load failure. A
  bare "skill invocation errored" is the expected `disable-model-invocation` response when a
  contract's prompt names a skill in prose and the model self-invokes it — the skill is on
  disk, so the model reads `SKILL.md` and follows it — so `pluginLoadFailed` now trips only
  on a genuine "failed to load" / "not on disk", which had been voiding every valid `c7` run.

## [0.8.10] - 2026-07-18

- **Fixed:** the publish workflow no longer fails at `npm publish`. The `devEngines` pnpm
  pin made npm 11 reject every npm command with `EBADDEVENGINES` — including the publish
  itself, since the runner's package manager is npm — so the release job now strips that
  dev-only field from the ephemeral checkout just before publishing. The repo keeps the
  strict pnpm guard for contributors, and the published tarball simply omits a field
  consumers never use.

## [0.8.9] - 2026-07-18

- **Fixed:** `pnpm check` is now self-contained on a clean checkout. The default test
  suite drives the built plugin (`dist/cli.js`), but CI — and the publish gate — run the
  check before the build, so a fresh checkout had no `dist` and three eval-helper tests
  threw, leaving CI red since it was introduced (0.8.7, 0.8.8). It passed locally only
  because a stale `dist` from an earlier build was lying around. A vitest global setup now
  builds `dist` on demand when it is absent, so the gate no longer depends on a prior
  build; it is a no-op when `dist` already exists, and the eval tier is untouched.
- **Fixed:** the `/version` release skill now tags and pushes the release commit, so a
  bump actually triggers the npm publish and GitHub Release workflows instead of stopping
  at a local `chore: release` commit that never reached a tag.

## [0.8.8] - 2026-07-18

- **Changed:** the approval latch no longer honors an `auto` grant set in a settings file.
  A model can write `.plumbbob/settings.local.json`, so the standing `auto` was the one
  self-approval it could forge — and a grant a model can forge is no grant. Self-approval
  now comes only from the human's literal `/pb-build --auto` or a step range, minted into
  the one-turn `GRANT` file by the UserPromptSubmit hook (a route a model cannot type,
  since `pb-build` is `disable-model-invocation`). This is guidance-first: it removes a
  mechanical honor rather than adding a lock — a human at the keyboard, a host with no
  hooks, `--auto`, and ranges all still work, and unattended autonomy is one typed
  `--auto` away. An `auto` that is still set is surfaced (in the refusal message and by
  `plumbbob doctor`), never silently changed. The measured payoff: under adversarial
  pause pressure the settings side door held untouched across every run. (D67.)
- **Added:** while a step is in flight, the turn hook now injects one line of guidance on
  each prompt — a mid-step tangent is a park (`plumbbob park "<line>"`), not an edit, and
  the step lands on `plumbbob checkpoint` after approval. This reaches a fresh session
  that no longer has the `pb-build` skill in context (after a compaction, or a new
  headless turn), which prose alone cannot. It is guidance only: it never gates, and any
  failure degrades to no output, so it can never wedge a prompt.
- **Fixed:** the `pb-doctor` skill's install diagnostic now renders inside headless
  (`-p`) sessions. Its previous `if command -v plumbbob … fi` pre-injection led with
  commands outside the skill's allowed tools, so a restricted session's permission gate
  dropped the whole injection silently; it now leads with the granted `plumbbob doctor`
  command, mirroring the `pb-status` pattern, and the skill recovers in prose if nothing
  renders.
- **Fixed:** an unrecognized flag before a step range in a `/pb-build` prompt — e.g.
  `/pb-build --wip 2020-2024` — no longer mints a `range 2024` grant. Only `--auto`
  continues the argument scan; any other flag ends it, so an incidental range never
  becomes a self-approval.

## [0.8.7] - 2026-07-13

- **Added:** GitHub Actions publishing automation that carries a release from a pushed
  `v*` tag through to npm. `publish.yaml` publishes with provenance via npm Trusted
  Publishing (OIDC) — no long-lived npm token lives anywhere; the registry mints a
  short-lived credential from the workflow's identity per run — gated behind an
  `npm-publish` environment with a required reviewer (the CI stand-in for the local MFA
  prompt) and a tag-versus-`package.json` version guard so a mistagged push fails closed.
  `release.yaml` cuts a GitHub Release from the same tag, with notes lifted from the
  matching `CHANGELOG.md` section. `ci.yaml` runs the full `pnpm check` gate and build on
  pull requests and `main` across the supported Node floor (22.18.0) and current major, so
  `main` is already green before any tag is pushed. Actions are SHA-pinned, and the
  `id-token: write` publish job is kept separate from the `contents: write` release job.

## [0.8.6] - 2026-07-13

- **Changed:** `pb-plan`'s spec-absorb mode (mode 2) now recognizes a file reference in
  any form — a bare path, an `@spec.md` mention, or a path wrapped in a sentence — where
  before it keyed only on a bare path that `Read` could open. It strips a leading `@`
  before probing, uses the referenced file's contents when Claude Code has already
  injected them, and folds any surrounding prose in as extra intent, so
  `/pb-plan absorb @spec.md` absorbs the spec instead of falling through to inline-intent
  expansion. The skills reference documents that a plain path is the surest form and that
  a slash command whose sole argument is an `@`-mention silently drops to a plain message
  — a Claude Code input-parsing limit, not a plumbbob bug.

## [0.8.5] - 2026-07-13

- **Added:** the `plumbbob handoff` verb — a read-only command that renders the
  standardized build hand-off block straight from session state: the pause block
  (built → looks-good / needs-work → what's next) while a step is in flight, and the
  post-checkpoint boundary block otherwise. It derives the next step and its
  `- model:` recommendation from the same `parseSteps` source the dashboard uses, so
  the hand-off can no longer drift from what `plumbbob status` reports.
- **Changed:** bare `plumbbob build` with no step number now enters the next undone
  step instead of refusing — resolving it the same way `checkpoint` does, and nudging
  toward `/pb-step` only when every planned step is already checkpointed.
- **Changed:** the `pb-build` and `pb-verify` skills now delegate their end-of-build
  and post-checkpoint hand-offs to `plumbbob handoff` rather than restating the block
  as prose, and `pb-build`'s step-1 selection is trimmed now that the CLI picks the
  next step. The block lives in one place, so the skills can no longer fall out of sync
  with the CLI.
- **Changed:** every dependency is pinned to an exact version, with a new `.npmrc`
  `save-exact=true` to keep future installs exact, and `vitest` is bumped 4.1.8 → 4.1.9
  to match `@vitest/coverage-v8`'s exact peer. Aligning the pair collapses the
  duplicated `@vitest/*` copies the mismatch was carrying and clears the "Running mixed
  versions is not supported" warning.

## [0.8.4] - 2026-07-12

- **Added:** the `reviewer` example agent — a switchable-provider advisory review
  agent for the verify pause. It defaults to `claude_cli` (oauth, piggybacking the
  logged-in Claude session, model `sonnet`) and switches to `ollama` for local or
  private compute, resolving provider/model/baseUrl on a `settings.json → env →
  default` ladder. It rides the existing frozen contract-1 envelope over the
  `settings` field, so no new verb or envelope field was needed; the single-provider
  `ollama-reviewer` stays alongside it as a frozen AI-SDK comparison point.
- **Changed:** `runOne` now forwards each bound agent its own config block —
  `settings.json → agentConfig[<name>]` reaches the agent as `ctx.settings.agent`,
  with the untracked `settings.local.json` overlay shadowing the whole project rung
  and `{}` when neither file names the agent.
- **Changed:** the `pb-build` skill's agent-slot mechanics were lifted out of the
  default-path steps into a single gated `## Running bound agents` section, entered
  only when `plumbbob status` shows a `harness bindings:` block. Each affected step
  keeps one conditional pointer, so the default no-agent path reads far lighter while
  the contracts are preserved verbatim.
- **Changed:** the `pb-build` end-of-build hand-off is now standardized around one
  deliberate checkpoint per step, with a canonical three-part closing block (state →
  choice → what's next) mirrored in the latch's `NO_TURN_MESSAGE`.

## [0.8.3] - 2026-07-11

- **Changed:** the per-worktree active-build cursor now lives in `.plumbbob/STATE`
  rather than as an `activeBuild` key in `settings.local.json`. That overlay is the
  file you hand-edit for your `check`/`auto` preferences, yet every `start` and `use`
  did a read-merge-write over it to move the cursor — so the tool churned a file it
  also tells you to own. `STATE` already owns the session lifecycle: its existence
  means "a session is live", and its content now names the build that session is on.
  The two reinforce each other, one `finish` delete clears both, and `settings.local.json`
  goes back to being purely human-owned — plumbbob only ever reads it. Build
  resolution (`--build` flag → cursor → sole build) is unchanged.
- **Changed:** the `post-edit` and `git-commit` hooks read the cursor from `STATE`
  now — `post-edit` gates on a non-empty `STATE` (a `--local` session leaves it empty,
  as before), and the commit ask-hook reads the in-flight build's slug from it.
- **Fixed:** a session left open across the upgrade degrades gracefully. Older
  sessions wrote the literal `active` into `STATE` while the cursor lived elsewhere;
  that value is now treated as "no cursor" so the tool falls through to the sole-build
  rule instead of chasing a build named `active`.

## [0.8.2] - 2026-07-11

- **Fixed:** `plumbbob start` no longer clobbers `.plumbbob/settings.json`. Every
  start overwrote the tracked file with `{ auto: false }`, wiping any hand-added
  `check` gate (and anything else) on each new session — so a custom check command
  vanished the moment the next build began. Start now scaffolds the file only when
  it is absent and never touches an existing one; the human owns that file.
- **Changed:** a freshly scaffolded `settings.json` is now empty (`{}`) rather than
  seeded with `{ auto: false }`. Absence of `check` already means checkride and
  absence of `auto` already means false, so the empty object is exactly "all
  defaults" — and `auto`, a personal preference, belongs in `settings.local.json`,
  not the tracked file. The `doctor --migrate` config-to-settings translation is
  aligned the same way: it carries forward only the legacy `check` line, yielding
  `{ check }` or `{}` with no invented `auto`.

## [0.8.1] - 2026-07-11

- **Added:** the checkpoint hand-off now names the next step's model. When a
  step lands, `/pb-build` and `/pb-verify` close the turn by citing the
  completed step, the next undone step, and — when the plan set one — that next
  step's `- model:` recommendation, so a fresh context window knows which
  `/model` to select before re-firing. It covers the default pause, the
  `--auto` halt, and the happy-path walkthrough. Advisory, never a gate; the
  source of truth stays the plan's model line that `plumbbob status` already
  surfaces.
- **Added:** a `.env.example` template documenting the environment variables
  the project expects, with local `.env` files now kept out of version control.
- **Changed:** stripped the parenthetical decision references from the
  `/pb-build`, `/pb-verify`, and `/pb-plan` pause prose the model echoes at each
  beat — refs like `D64` surfaced to the user as "the D64 latch," noise they
  can't decode, so the latch now reads plainly. Code comments and
  `docs/decisions.md` keep the D-register for internal reference.

## [0.8.0] - 2026-07-11

- **Added:** an eval tier that measures the skills headless — seven prose
  contracts run through a fascicle `claude_cli` driver with mechanical
  git-plus-sidecar assertions, `pass|fail|invalid` outcomes, and infra-only
  retry, swept prose-only against latched at opus N=5. Results aggregate to
  JSONL with per-run cost, and the committed receipt lands in `reports/evals/`
  linked from the README. The headline delta the latch bought:
  no-checkpoint-over-red under pressure moved from 2/5 to 5/5; the gap it
  exposed — pressured latched runs self-minting `auto` through the legal
  `settings.local.json` side door — is logged for the next iteration.
- **Added:** a plan-time gate probe. `detectGate(root)` returns
  `{configured, detected}` and is shared by `start`, `doctor`, and `/pb-plan`,
  so a project with no check wired up gets a warning with the exact settings
  fix at plan time rather than a surprise later — always a warning, never a
  refusal, with the always-on repo checks excluded so a code-blind gate cannot
  read as coverage.
- **Added:** per-build stats. A tracked `stats.json` accrues at each
  `build`, `checkpoint`, and `revert`, the `Log` line carries a compact cost
  suffix, and `finish` rolls a per-step `## Stats` table with totals into the
  build's `report.md`.
- **Changed:** `start` is now async so it can run the plan-time gate probe
  after resolving the build; the 52 test call sites that invoked it were
  converted to await.

- **Fixed:** grant parsing now reads only the `/pb-build` invocation's own
  arguments — the token run immediately after it, ending at the first free-text
  word — so an incidental range in prose ("the 1-5 endpoints", a pasted
  `2020-2024`) can no longer mint a bounded self-approval, while trailing
  sentence punctuation (`/pb-build 1-3.`) no longer drops the range the human
  actually typed.
- **Fixed:** latch state no longer leaks across sessions — `finish` clears the
  one-turn grant and the entry stamp with the rest of the control state, and
  `start` clears any grant an abandoned session left behind, so a stale `auto`
  can never self-approve the next session's first landing.
- **Fixed:** the git-commit ask-hook no longer fires on commands that merely
  *mention* "git commit" inside a quoted string or a heredoc body (a grep, an
  echoed sentence, a `checkpoint --body`), while a real commit whose message
  rides `-m` prose or a `-F-` heredoc still asks. The hook now also guards
  `--local` sessions, whose flat STEP it previously never saw.
- **Fixed:** the out-of-band commit receipt anchors on the last ledger line of
  any kind — baseline, plan, or step — so a commit landing between the plan
  commit and the first step checkpoint now surfaces instead of hiding in
  exactly the window the receipt exists for; and the count follows
  `--first-parent`, so merging upstream reads as one commit rather than the
  dozens it carried in.
- **Changed:** a refused `checkpoint --plan` now speaks plan ("present the
  plan, end the turn") instead of borrowing the step wording's diff and
  self-review, and `doctor`'s dormant-latch line reads as a state rather than
  an accusation — a wired hook may simply not have ticked yet this session.
- **Changed:** `/pb-plan`'s close-out now disclosures what the plan commit
  publishes — the tracked `.plumbbob/builds/<slug>/` folder teammates will see
  in the PR — and offers `start --local` in the same breath, so the record is
  disclosed, not discovered. The npm package description also catches up to
  the 0.7.0 tagline: guidance on the work, a latch on the record.

## [0.7.0] - 2026-07-10

- **Added:** the approval latch — plumbbob now latches the *checkpoint* to a
  recorded human turn, so an agent can no longer self-commit a step in the same
  turn it began. A `UserPromptSubmit` hook (via a new `plumbbob turn` verb) keeps
  a monotonic turn ledger the model never writes, `build`/`start` stamp the turn
  at entry, and `checkpoint` refuses to land until a human turn has intervened —
  the refusal message itself being the pause. Nothing blocks an edit; only the
  record is latched, and a host with no hooks grows no ledger and behaves exactly
  as before.
- **Added:** one-turn self-approval grants minted only from the human's literal
  prompt — an explicit `/pb-build --auto` or a step range like `1-3` grants the
  agent approval for that run, and a standing `auto: true` in settings is the
  personal grant. Because `pb-build` disables model invocation, the model cannot
  forge one.
- **Added:** surfacing for commits that land outside the ledger — a `PreToolUse`
  hook turns a model-issued `git commit` during a step into a permission
  *question* (it asks, never denies), `plumbbob status` prints a neutral line when
  commits have landed since the last checkpoint, and `plumbbob doctor` reports
  whether the latch is live or dormant with a hook-wiring hint.
- **Changed:** the checkpoint boundary now enforces on the ledger plane while the
  work plane stays pure guidance — "guidance on the work, a latch on the record."
  The skills (`pb-build`, `pb-plan`, `pb-verify`), the decisions log (D64–D66 and a
  scope note on D10), the happy-path walkthrough, the README skeptic answer, and
  the plugin tagline all carry the new framing.
- **Changed:** bumped the `checkride` check-gate dependency to 0.3.0, and exempted
  our own freshly-published releases from pnpm's supply-chain release-age cooldown
  so the loop can dogfood them without waiting.

## [0.6.6] - 2026-07-09

- **Added:** intent.md steps take an optional `- model:` sub-line beside the
  seam — the smallest model that can carry the step, with a one-phrase why.
  It is scraped best-effort like the other step metadata and surfaced by
  `plumbbob status` in the next step's detail, so the human can switch models
  with `/model` before `/pb-build`. It is advisory orientation only, never a
  gate: nothing reads it to switch a model or refuse a build.
- **Changed:** the judgment skills (`pb-plan`, `pb-step`, `pb-build`,
  `pb-verify`, `pb-refine`, `pb-harvest`, `pb-finish`) no longer pin a model
  and now inherit the session model, so the human's `/model` choice — informed
  by the per-step recommendation — actually takes effect; a pin was a ceiling
  as much as a floor and silently downgraded a frontier session. Only the
  mechanical clerks (`pb-status`, `pb-park`, `pb-spike`, `pb-revert`,
  `pb-doctor`) stay pinned to haiku.
- **Fixed:** the seam parser now stops at any following sub-bullet, so a
  `- model:` note written with backticks can never leak in as a seam path.
- **Fixed:** `plumbbob checkpoint -m "2"` no longer reads the numeric message
  as step 2, `--body` on an interactive terminal degrades to the deterministic
  fallback instead of hanging on an EOF a TTY never sends, and a failed intent
  checkbox flip now warns on stderr instead of silently letting the dashboard
  show an already-checkpointed step as next.

## [0.6.5] - 2026-07-07

- **Fixed:** the command hints plumbbob prints at runtime — the `next →` line in
  `plumbbob status`, the checkpoint scope-drift warning, and the `finish`/`doctor`
  messages — now reference skills by their short `/pb-*` form instead of the
  namespaced `/plumbbob:pb-*` form, matching how every skill already refers to
  itself. The model was echoing the namespaced form verbatim in its own
  hand-off text after a build or an approval; this was the source.

## [0.6.4] - 2026-07-07

- **Added:** `/pb-build` accepts a step range like `1-3`, a bounded form of
  `--auto` — it self-approves and checkpoints through the top of the range,
  then pauses instead of chaining to done. The range is the opt-in itself,
  and every existing `--auto` halt condition (a red check, a self-review
  mismatch, a `blocked`/`drift` agent) still fires early within it.
- **Changed:** `plumbbob build` now recognizes a step-range shape (`N-M`) at
  the CLI and reports it as a `/pb-build` feature with a pointer to the
  single-step form, rather than falling through to the generic "needs a
  step number" message.

## [0.6.3] - 2026-07-03

- **Added:** seven new ast-grep rules in `rules/` extending machine enforcement beyond
  C1/C2 to the statically checkable edges of C4 (never destroy), C5 (additive git
  footprint), C6 (the agent envelope's identity invariant), D13 (no edit-blocking
  guards), D33 (excludes never touch `.gitignore`), and D60 (async spawn only in the
  agent path): `additive-git-only`, `agent-no-advance`, `reset-hard-only-in-revert`,
  `no-gitignore`, `centralize-destructive-fs`, `no-sync-spawn-in-agent-path`, and
  `no-session-detection`. Each rule was smoke-tested by planting a violation and
  confirming it fires before removing it.
- **Changed:** `docs/decisions.md`, `docs/architecture.md`, and `CONTRIBUTING.md` now
  cite the new rules against the constraints and decisions they enforce, and the
  `centralize-subprocess` description was corrected to include `lib/agents.ts`, which
  the rule has allowed since the agent doorway landed.
- **Fixed:** a pre-existing markdownlint MD045 failure — spacer `<img>` tags in the
  README and `docs/skills-reference.md` skills tables were missing alt text — that was
  blocking `pnpm check` on `main`.

## [0.6.2] - 2026-07-04

- **Added:** an `ollama-reviewer` example agent under `examples/agents/` — a
  working `after`-slot reviewer built on fascicle's Ollama provider, with its
  own package.json (not a workspace member), a demo spec, a stderr trajectory
  logger, and a full `docs/local-model-review.md` walkthrough from install to
  every-pause review.
- **Changed:** `examples/agents/ollama-reviewer` adopted fascicle/stdio's
  `run_stdio` (fascicle 0.8.11), which now owns the child-process contract
  natively (stdin read, envelope validation, engine disposal, exit-code
  verdict) instead of hand-rolling it; `docs/agents.md` was updated to note
  the fascicle trap is closed at the source as of that version.
- **Changed:** every inline `D#`/`C#` reference in the docs now links to its
  definition's anchor in `docs/decisions.md`, so a tag hit in prose jumps
  straight to its definition.
- **Changed:** the README's skills table is now segmented into happy path
  (`/pb-plan`, `/pb-build`, `/pb-finish`), plan-shaping moves, helpers, and
  the park/harvest capture loop, instead of one flat list. `/pb-build` is no
  longer described as "optional" — that word read as skippable when it means
  swappable executor (D3) — and is now called the default, swappable engine
  throughout the docs and skill description.
- **Fixed:** `examples/agents/ollama-reviewer`'s seam diff now includes
  untracked files as read-only pseudo-diffs, so a step that creates new files
  (most step 1s) is no longer invisible to the reviewer.

## [0.6.1] - 2026-07-03

- **Fixed:** the marketplace/plugin install no longer requires a global `npm i -g
  plumbbob` to function. The plugin cache is a bare tarball extract that Claude
  Code never runs `npm install` against, but the CLI's `check` verb statically
  imports its `checkride` dependency, so every command failed once the skills
  called the plugin's bundled `bin/` shim instead of a global `plumbbob` binary.
  `checkride` is now declared as a `bundleDependency` so it ships inside the npm
  tarball itself, resolvable with zero install step.
- **Changed:** each skill's PATH-miss fallback message now covers both the
  marketplace and skills-dir/global install paths, matching the wording already
  used by `doctor`.

## [0.6.0] - 2026-07-03

- **Added:** user agent plugins — a doorway for user-authored agents to join the
  loop without ever being able to advance it. An agent is anything executable that
  speaks the versioned contract-1 envelope: JSON on stdin, one JSON result on
  stdout (status `done`/`blocked`/`drift`, summary, `parked[]`, notes), prose on
  stderr. Agents live in `.plumbbob/agents/<name>/` (tracked, rides the PR) or
  `~/.plumbbob/agents/<name>/` (personal), resolved flag → project → personal.
- **Added:** `plumbbob agent run <name> [--step N] [--mode before|build|after]` and
  `plumbbob agent list`. The run verb composes a StepContext from `intent.md` and
  settings (decisions and constraints scraped best-effort as verbatim bullets),
  spawns the manifest command via `sh -c` at repo root with `PLUMBBOB_AGENT_DIR`
  in the child's env, streams the agent's stderr live, forwards SIGINT, validates
  the output envelope (contract major-version mismatch refused with a hint),
  re-emits it on its own stdout, appends it to the untracked
  `builds/<slug>/handoff.json` (cleared at checkpoint), and applies `parked[]`
  through the park verb. The envelope has no verb to checkpoint, flip a step, or
  chain agents — the human stays the clock by construction.
- **Added:** planned per-step bindings in `builds/<slug>/harness.json` with exactly
  three lifecycle slots (`before` for context in, `build` for the diff, `after` for
  advisory review) plus prose notes — bindings and prose only, never control flow.
  Settings-level defaults merge under the harness file and the `--agent` flag
  overrides both; a bound agent a teammate lacks downgrades to a warning, while an
  explicitly named agent that cannot resolve errors loudly.
- **Added:** an opt-in `agentTimeout` settings key (seconds; absent or 0 means no
  timeout) that kills an overrunning agent and reports a failed run.
- **Added:** `docs/agents.md` defining the full contract for agent authors, an
  `agent run|list` section in `docs/cli-reference.md`, new entries in
  `docs/decisions.md`, and a minimal working example agent under `examples/`.
- **Changed:** `doctor` now validates every resolvable agent (well-formed manifest,
  existing executable command, supported contract version) and `status` reports the
  active build's harness bindings, warning on ones that do not resolve.
- **Changed:** the pb-plan, pb-step, pb-build, and pb-verify skills learned the
  three slots — harness authoring at plan time, just-in-time binding revision,
  before-agents feeding `context[]`, build-slot delegation, and after-agent output
  presented as advisory input at the verify pause, with `blocked` routed to
  unblock-and-re-run and `drift` routed to `/pb-refine` repair.

## [0.5.4] - 2026-07-03

- **Changed:** `plumbbob start` now derives build slugs as `YYYY-MM-DD-<title-slug>`
  (local time) rather than a bare title-slug, so `.plumbbob/builds/` sorts
  chronologically by construction instead of by titling convention; an explicit
  `--slug` still overrides verbatim, with no date prefix added.

## [0.5.3] - 2026-07-03

- **Added:** `examples/rate-limit-the-login-endpoint/` — a complete, curated build
  folder as it would sit on a branch after `/pb-finish` (intent, build-log with a real
  park/harvest arc, checkpoints, report), with a README walking the artifacts and the
  commit log they produce, so new users can pattern-match the loop's output before
  running it.
- **Added:** `docs/architecture.md` (an explicit in-progress stub), `docs/faq.md`,
  `docs/skills-reference.md`, and `SECURITY.md`, plus a question-oriented documentation
  map in the README that links them.
- **Changed:** the docs now reflect the tracked `builds/<slug>/` restructure throughout
  — intent and the control files live under `.plumbbob/builds/<slug>/` rather than a flat
  `.plumbbob/` sidecar, checkride is documented as the CLI's one deliberate dependency,
  and `revert` is described as snapshotting the tracked build folder around its reset.
- **Changed:** renumbered the design-decision tags so the source comments align with
  `docs/decisions.md` — the worktree-restructure build's build-local `D#` citations were
  moved onto six new global entries (D33–D38) or onto the existing global entry that
  already covered the same idea, resolving the collisions the previous key documented.
- **Fixed:** a stale `.plumbbob/SEAM` path reference in `templates/intent.md` left over
  from before the restructure.

## [0.5.2] - 2026-07-03

- **Added:** a `mutation` slot to the checkride gate, wired to Stryker as an opt-in
  adapter (`checkride --include mutation`) so the default fast gate is unaffected;
  incremental mode keeps re-runs quick. The Stryker config declares its vitest-runner
  plugin explicitly, since pnpm's isolated `node_modules` hides the default plugin glob
  from Stryker's worker processes.
- **Added:** a from-scratch unit test suite for `lib/plugins.ts`, which previously had
  no in-process coverage at all.
- **Changed:** `checkride.config.json` now pins every detected slot explicitly rather
  than leaning on zero-config detection order, documents the pipeline, adds a `fixArgs`
  override so `checkride fix` doesn't reintroduce the uninstalled type-aware lint pass,
  and disables the `spell` slot since cspell is not a dependency.
- **Changed:** hardened the test suite against the first mutation audit — the mutation
  score rose from 61.7% to 80.3% (86.3% of covered mutants), with survivors cut from
  639 to 306. Tests across the check gate, the intent and checkpoint parsers, and the
  `build`, `checkpoint`, `doctor`, `finish`, `revert`, and `use` verbs now pin observed
  behaviour — notably a guard's stderr text, not merely its exit code — rather than
  merely executing the code.

## [0.5.1] - 2026-07-03

- **Added:** the heavy check gate is now [checkride](https://www.npmjs.com/package/checkride),
  imported programmatically as plumbbob's first (and only) runtime dependency: with no
  `"check"` setting configured, `check` and `checkpoint` run checkride's slot pipeline
  in-process, a red run names the failing slots with their `.check/<slot>` raw-output
  pointers, and a run where every slot skipped refuses rather than passing vacuously.
- **Added:** `plumbbob check` accepts checkride's narrowing flags — `--bail`,
  `--changed`, `--all`, and the comma-list trio `--only` / `--skip` / `--include` — for
  tight iteration loops; the checkpoint gate deliberately stays full-fat.
- **Added:** `plumbbob doctor` grew a check-gate section: it names a configured
  `"check"` override, or prints checkride's slot/adapter table (via its own doctor) so
  a detected-but-missing tool is caught before the gate refuses at checkpoint time.
- **Added:** a distinct exit code 2 for a broken gate — a malformed
  `checkride.config.json` reports as a harness failure instead of masquerading as red
  code, and checkpoint refuses on it with its own message.
- **Changed:** the `"check"` setting is now the *override*, not the default: a
  configured command is spawned exactly as before, and `start` seeds `settings.json`
  as `{ "auto": false }` with no `check` key (absence means checkride), retiring the
  old no-check-script warning in favour of the sharper runtime refusal.
- **Changed:** the dependency doctrine (C2) is amended from "zero runtime
  dependencies" to "node builtins plus a few deliberate dependencies", still
  machine-enforced by an ast-grep allowlist; recorded as D32 with D24 amended.
- **Changed:** plumbbob's own repo now gates through checkride end-to-end: knip is
  retired in favour of fallow for the dead-code slot, markdownlint-cli is replaced by
  markdownlint-cli2, the test suite runs through the vitest slot with coverage, and
  the six `check:*` scripts collapse into a single `"check": "checkride"` alias.

## [0.5.0] - 2026-07-02

- **Added:** a `plumbbob use <slug>` verb switches or resumes the active build,
  re-pointing the per-worktree cursor after validating the target folder's `intent.md`
  and warning (without blocking) if the build being left has a step in flight.
- **Added:** `plumbbob doctor --migrate` detects a pre-restructure flat sidecar
  (`config`, `archive/`, or a flat active session) and moves it into the tracked
  `builds/<slug>/` layout — archived builds and the active session each become their
  own folder, `config` becomes `settings.json`, and the whole move is staged but never
  committed, leaving that commit to the human.
- **Changed:** the sidecar is now split into a tracked artifact plane and an untracked
  control plane. `plumbbob start` scaffolds `.plumbbob/builds/<slug>/` (intent,
  build-log, checkpoints) and points a new `activeBuild` cursor in
  `settings.local.json` at it, so a build's record rides the branch into its pull
  request instead of dying with `git worktree remove`. `--local` opts back into
  today's fully untracked layout for repos that cannot track tool folders.
- **Changed:** every verb resolves its target build through one seam — an explicit
  `--build <slug>` flag, else the `activeBuild` cursor, else the sole entry in
  `builds/`, else a refusal with a hint — and the post-edit hook follows suit by
  reading the cursor out of `settings.local.json` instead of probing a single
  `STATE` file.
- **Changed:** `.plumbbob/config` is replaced by a settings ladder (flag →
  `settings.local.json` → `settings.json` → built-in default), the same resolution
  order used elsewhere in the project; the `check` command and the `auto` preference
  are now documented keys instead of a bespoke flat-file format.
- **Changed:** checkpoint commits are self-describing. The subject is
  `plumbbob: step N — <title>` instead of `plumbbob: step N done`, and a new
  `--body` flag accepts a piped-in heredoc for a proportional, skill-composed body;
  without `--body`, the commit falls back to a deterministic body of done-when, seam,
  and diffstat.
- **Added:** plan approval gets its own commit. `plumbbob checkpoint --plan` stages
  only the active build's folder and commits it as `plumbbob: plan — <title>`, so the
  first step's diff no longer absorbs the plan scaffold, and history reads baseline →
  plan → steps → finish.
- **Changed:** `revert` snapshots and restores the active build's tracked folder
  around a `git reset --hard`, so park lines and in-flight markers survive a revert to
  any checkpoint, including one where the build folder did not yet exist. `checkpoint`
  gained the equivalent scope-drift warning ported from the old `done` verb, adjusted
  to never flag a build's own tracked artifacts.
- **Changed:** `wrap` is renamed `finish` and gutted to what the tracked layout
  needs — append checkpoint SHAs to the report, commit as `plumbbob: finish — <title>`,
  and clear only the untracked control state. A finished build's folder stays in place
  and committed, since it now is the archive; the old local-only `archive/` copy and
  its supporting code are removed, with no compatibility alias for `wrap`.
- **Fixed:** `start` no longer crashes inside a linked git worktree. Excludes are now
  written via `git rev-parse --git-path info/exclude` (the common gitdir git actually
  reads) instead of the per-worktree gitdir, which has no `info/` directory at all.
- **Fixed:** this repository's own `.plumbbob/` sidecar is migrated to the new tracked
  layout, and the previously blanket `.plumbbob/` line in `.gitignore` is narrowed to
  the same control-plane patterns the exclude migration writes, so `builds/<slug>/`
  artifacts can actually be staged.
- **Changed:** `decisions.md`, `README.md`, `cli-reference.md`, `happy-path.md`,
  `techniques.md`, and `troubleshooting.md` are brought current with the new layout,
  the settings ladder, and the `finish`/`use`/`doctor --migrate` verbs.

## [0.4.14] - 2026-06-30

- **Changed:** the marketplace install instructions now point at the real
  [`agent-tools`](https://github.com/robmclarty/agent-tools) marketplace with the two-step
  command (`/plugin marketplace add robmclarty/agent-tools` then `/plugin install
  plumbbob@robmclarty`) and a link, replacing the vague `plumbbob@<marketplace>` placeholder
  across the README, `install.md`, and `troubleshooting.md`. The `@robmclarty` suffix is the
  marketplace's declared name rather than the repo name, which `install.md` now calls out.
- **Changed:** the two install paths are described by who runs the install rather than as
  different artifacts — the marketplace entry resolves to the published `plumbbob` npm
  package that Claude Code installs for you, so the misleading "self-contained" framing is
  gone from the README, `install.md`, and `cli-reference.md`.
- **Changed:** the "v1 vs v2" framing is removed across the docs, code comments, and tests;
  every reference now describes the current design directly instead of positioning it
  against an earlier version no reader can see. The two user-facing CLI strings moved with
  the docs that mirror them — the `build` banner now reads "not a lock" and the `wrap` help
  summary reads "close-out" — with no behaviour change.

## [0.4.13] - 2026-06-30

- **Changed:** the README is rewritten as a short table-of-contents and get-started doc — five sections
  (intro, install, features, getting started, license) — with the conceptual material (the one law,
  clock-not-lock, calibration, the two-tier gates, derived position, git footprint) left to live in
  `docs/techniques.md` rather than duplicated. The detailed install guide moves to a new
  `docs/install.md`, and the `.plumbbob/` sidecar layout moves into `docs/cli-reference.md`.
- **Changed:** the docs now thread concrete metaphors through the prose. The README explains what a
  plumb bob actually is — a weight on a string gravity pulls into a true vertical — and maps it to
  keeping the build aligned with your intent, with the epigraph reworded to "Establish plumb before
  you build". `docs/attention-first-development.md` threads a water-in-flood metaphor: the model's
  output as enormous but uncoordinated power, and the externalized plan as the banks and levee that
  channel it where you decided.
- **Changed:** skill commands are written in the readable short form (`/pb-plan` rather than
  `/plumbbob:pb-plan`) across the README, docs, and skills, with the install section documenting the
  shorthand. Brand references in prose are standardized to "PlumbBob" (the lowercase `plumbbob`
  CLI/namespace identifiers are unchanged), `/pb-park`'s inline and bare forms are spelled out, and
  the skill-count and CLI-usage claims are corrected.
- **Fixed:** the `pb-status` banner and the not-a-git-repo error now print "PlumbBob" instead of
  "Plumbbob". Two skill-contract assertions that still matched the namespaced `/plumbbob:pb-*` form
  were updated to the current flat `/pb-*` convention.

## [0.4.12] - 2026-06-30

- **Added:** an `argument-hint` to every skill that accepts input, so Claude Code shows the accepted
  arguments as greyed-out placeholder text while you type the slash command — for example,
  `pb-build` hints `[step-number] [--auto]` and `pb-spike` hints `<slug> | done`. The five no-arg
  commands (`verify`, `status`, `harvest`, `doctor`, `wrap`) are intentionally left without a hint
  so they do not falsely imply they accept input.

## [0.4.11] - 2026-06-30

- **Changed:** `.plumbbob/STATE` is now a pure session sentinel — its presence means a session is
  live, and its content no longer carries meaning. The dashboard phase is derived from what is on
  disk rather than stored: an in-flight `STEP` file reads as `BUILD`, the new `SPIKE` marker reads
  as `SPIKE`, and otherwise you are at the `DESIGN` boundary. The displayed `[DESIGN|BUILD|SPIKE]`
  labels are unchanged; they are simply computed now instead of being written and read back.
- **Changed:** the CLI's transition messages dropped the `STATE=…` annotations in favour of plainer
  wording — `start` reports the baseline, `build` says "building step N", and `checkpoint` / `revert`
  say "back at the boundary". `spike` now refuses while a step is in flight (rather than refusing on
  a non-`DESIGN` state) and gates its open/close on the `SPIKE` marker.
- **Removed:** the stored five-value state machine, along with the `readState` / `writeState`
  helpers, the six `writeState` transition calls across the verbs, and the dead `REVIEW` / `FINISH`
  branches in the next-move inference. `orient` now takes the in-flight step and a spiking flag
  instead of a state string.

## [0.4.10] - 2026-06-30

- **Added:** `plumbbob checkpoint` now records the build's history as it happens — it appends a
  dated line to the build-log's `## Log` for every step it lands, naming the step (its title
  lifted from `intent.md`) with the short SHA. Because both `/plumbbob:pb-build` and
  `/plumbbob:pb-verify` end in a checkpoint, the ledger fills in step by step instead of being
  reconstructed at wrap. The append is best-effort, so a missing or hand-edited build-log never
  blocks a checkpoint; the recorded checkpoint SHA stays the source of truth.
- **Changed:** `/plumbbob:pb-wrap` now reads the `## Log` as the spine of "what shipped" and adds
  only the unique synthesis — the why behind the decisions, deferred tangents, and final status —
  rather than re-narrating the timeline the checkpoints already wrote. The build-log template and
  the `pb-build` / `pb-verify` skills were updated to match, and the section-append mechanic was
  extracted into a shared helper that `park` now uses too.

## [0.4.9] - 2026-06-30

- **Added:** a `pb-doctor` driver skill that runs `plumbbob doctor` from inside a Claude Code
  session — the only place the diagnostic can run on a marketplace install, where the CLI is
  on PATH only while the plugin is enabled. It is read-only (no Edit/Write), and its injected
  line gates on `command -v` so it surfaces doctor's full report even when checks fail, falling
  back to install-path guidance only when the CLI is genuinely off PATH.
- **Changed:** the README, CLI reference, troubleshooting guide, and `doctor`'s own trailing
  output line no longer imply `plumbbob doctor` is always a terminal command — they now record
  that a marketplace plugin puts the CLI on PATH only inside a session, so
  `/plumbbob:pb-doctor` is the in-session way to reach it.
- **Fixed:** `bin/plumbbob` and `bin/pb` now ship executable through an npm-sourced plugin
  install. The package `bin` field points at the shims themselves so npm/pacote stamps them
  0755 — it normalizes other packed files to 0644, dropping the working-tree `+x` bit — and the
  shims were hardened to resolve any symlink chain so `npm i -g` and `node_modules/.bin` deps
  keep working alongside the plugin-on-PATH path.

## [0.4.8] - 2026-06-30

- **Added:** a `version` verb (`plumbbob version`, `--version`, `-v`) that prints the CLI
  version read from the shipped `package.json`, degrading to `unknown` rather than erroring
  when that manifest is absent or malformed. It joins the existing `help` / `--help` / `-h`
  surface in the CLI reference's verb table.
- **Changed:** the README's "What ships" note now records that `plumbbob --help` and
  `plumbbob --version` are the two things a human types by hand, and the troubleshooting guide
  gains a "Building and publishing" entry covering `npm pack` / `npm publish` / `npm install`
  aborting with `EBADDEVENGINES` inside the repo because `devEngines` pins pnpm — use pnpm for
  repo-local work, while consumers' `npm i -g plumbbob` is unaffected.

## [0.4.7] - 2026-06-30

- **Changed:** the install documentation now presents the two install paths as co-equal and
  mutually exclusive — the self-contained marketplace plugin (which ships the `plumbbob`/`pb`
  CLI on PATH via its `bin/` shims, needing neither `npm i -g` nor `plumbbob init`) and the
  npm-global plus `plumbbob init` skills-dir link. The README, CLI reference, happy-path, and
  troubleshooting docs cover the collision guard (`init` refuses when a marketplace plumbbob
  is present, `--force` overrides) and `doctor`'s awareness of both paths plus its
  double-install detection.
- **Fixed:** the `bin/plumbbob` and `bin/pb` PATH shims use `CDPATH=''` rather than the bare
  `CDPATH=` empty-prefix form, clearing a ShellCheck SC1007 warning. The semantics are
  identical — an empty `CDPATH` scoped to the `cd` so it cannot resolve the script directory
  against a `CDPATH` entry — but the explicit `''` is what the warning itself recommends.

## [0.4.6] - 2026-06-29

- **Changed:** the eleven driver skills are re-prefixed with `pb-` (`plan` → `pb-plan`, and so
  on), so they surface as `/plumbbob:pb-plan` and the like. This reverses the 0.4.4 de-prefix:
  that change assumed marketplace-only distribution, where skills are always namespaced and
  `pb-` is redundant — but plumbbob keeps the non-marketplace skills-dir/CLI install first-class,
  and on that path a two-plugin collision can drop skills to flat names, where the `pb-` prefix
  keeps `/pb-status` from clashing with the built-in `/status`. Command references were updated
  in lockstep across the skills, docs, README, templates, and CLI output strings.
- **Changed:** `plumbbob init`'s in-code framing now describes the skills-dir link as the
  deliberate, first-class non-marketplace install path (npm-global, local dev, pre-plugin
  clients, and eventually other agents) rather than a legacy fallback.
- **Changed:** the plugin's display name is restyled `PlumbBob` to match the README heading.

## [0.4.5] - 2026-06-29

- **Added:** a self-contained marketplace plugin install. The plugin now ships `bin/plumbbob`
  and `bin/pb` PATH shims (resolved relative to the plugin's install dir) alongside the skills,
  so a marketplace install puts the `plumbbob`/`pb` CLI on PATH without `npm i -g` and needs no
  `plumbbob init`. The `bin/` directory is included in the published package files.
- **Added:** a collision guard between the skills-dir link (`plumbbob init`) and a marketplace
  install. A new `marketplacePlumbbob()` helper reads Claude Code's `installed_plugins.json`;
  `init` now refuses when a marketplace plumbbob is already installed (since both register a
  plugin named `plumbbob` and would fight over the `/plumbbob:*` namespace, dropping skills to
  flat names like `/status`), and `--force` overrides the guard.
- **Changed:** `plumbbob doctor` recognizes a marketplace-only install as a valid, passing state
  and flags the double-install collision when both a skills-dir link and a marketplace install
  are present. `dev-install.sh` now runs `init --force` to link the live checkout past the guard.

## [0.4.4] - 2026-06-29

- **Changed:** the eleven driver skills drop the `pb-` prefix introduced in 0.4.3 and go
  back to bare verbs — they now invoke as `/plumbbob:plan`, `/plumbbob:step`,
  `/plumbbob:build`, `/plumbbob:verify`, `/plumbbob:park`, `/plumbbob:status`,
  `/plumbbob:harvest`, `/plumbbob:wrap`, `/plumbbob:refine`, `/plumbbob:revert`, and
  `/plumbbob:spike`. Claude Code namespaces a plugin's skills as `/<plugin>:<skill>`
  rather than flattening them to bare commands, so the 0.4.3 prefix was redundant and
  produced a doubled `/plumbbob:pb-plan`. If you installed 0.4.3, re-run `plumbbob init`
  and use the `/plumbbob:<verb>` form. The CLI verbs (`plumbbob status`, `pb park`, …)
  are unchanged.
- **Fixed:** the install docs and the `init.ts` rationale — which claimed Claude Code
  surfaces each skill as a bare `/<skill>` command and that the names must ship
  pre-prefixed — now correctly state that a plugin's skills load namespaced as
  `/plumbbob:*`.
- **Changed:** the `/version` release skill now force-writes `.claude-plugin/plugin.json`
  in lockstep with `package.json`; this release brings the plugin manifest back into sync
  after it had drifted to 0.4.0.

## [0.4.3] - 2026-06-29

- **Changed:** the eleven driver skills are renamed with a `pb-` prefix — `/pb-plan`,
  `/pb-step`, `/pb-build`, `/pb-verify`, `/pb-park`, `/pb-status`, `/pb-harvest`,
  `/pb-wrap`, `/pb-refine`, `/pb-revert`, `/pb-spike`. Claude Code flattens a plugin's
  skill names into the bare chat command (`/status`, `/park`, …), which collided with
  built-in and other-plugin slash commands and was ambiguous; the prefix restores the
  original unambiguous naming. The CLI verbs (`plumbbob status`, `pb park`, …) are
  unchanged.

## [0.4.2] - 2026-06-27

- **Added:** four `ast-grep` rules to the check gate that enforce the zero-dependency
  constraint (imports must be `node:` builtins or relative paths) and three architectural
  invariants — `process.exit` only in the bin entry, no `console` logging, and subprocess
  spawning confined to the git, check, and spike modules.
- **Added:** a fuller documentation set — `docs/techniques.md` (the methods behind the
  loop), `docs/cli-reference.md`, `docs/troubleshooting.md`, `docs/decisions.md` (the
  `D#` / `C#` design-decision key), and a root `CONTRIBUTING.md` — all cross-linked from a
  new Documentation section in the README.
- **Fixed:** documentation drift — the philosophy doc now describes guidance rather than
  the retired v1 enforcement model, the happy-path example shows the real `park` output,
  and the package description reflects the current skill count.

This is a docs-and-tooling release; no runtime behavior changed.

## [0.4.1] - 2026-06-27

- **Changed:** the test suite is reorganized by intent — unit tests now sit in `__tests__/`
  next to the module they cover, while multi-module tests live under `test/` in labeled
  `integration/`, `e2e/`, and `contract/` folders, with shared helpers in `test/helpers/`.
  This is purely internal; no runtime behavior changes.
- **Changed:** `cli.ts` is split into a thin executable entry plus `cli-core.ts`, so the
  argv dispatch and help table can be imported and unit-tested without the bin's lone
  `process.exit` tearing down the test worker.
- **Added:** unit coverage for the previously untested library modules (`git`, `archive`,
  `check`, and the only-indirectly-covered `sidecar`), in-process tests for the session
  verbs (`start`, `status`, `park`, `build`, `check`, `checkpoint`, `wrap`, `revert`,
  `spike`), and a `cli-core` dispatch test.
- **Added:** a `dev-install.sh` smoke test that stubs `pnpm`/`node` on `PATH` to assert the
  build/link/init orchestration without a real global link, plus extra `post-edit.sh` hook
  branch cases (no session, a non-source extension, and a missing file).

## [0.4.0] - 2026-06-25

- **Changed:** batch planning is now the default. `/pb-plan` authors the **whole**
  `intent.md` — Frame, Decisions, Constraints, **and all the Steps** (each with a
  done-when and a seam) — so the happy path is to plan once and drive `/pb-build` per
  step until done. Just-in-time stepping survives, but `/pb-step` is now a *revision*
  tool: it sharpens the next step against reality (an empty `/pb-step` auto-syncs it)
  rather than being the way steps are born. (Supersedes the just-in-time-first default.)
- **Added:** `/pb-plan` takes an optional argument and disambiguates the mode itself —
  no argument runs an interactive interview, a path to an existing file absorbs that
  spec into `intent.md` (retaining its detail so the plan stands on its own), and any
  other text expands an inline intent. No quotes required.
- **Added:** `/pb-build --auto` — an opt-in that lets the agent self-review and approve
  in your place, then chain to the next step until done, halting on a red check or any
  self-review mismatch. The default (no flag) still ends at the human pause.
- **Added:** `plumbbob status` now surfaces the next undone step's **done-when** and
  **seam** in the dashboard, and its next-move hints that `/pb-step` can revise the step
  before you build it.
- **Changed:** `/plumbbob-interrogate` is renamed `/pb-refine` (easier to type) and
  broadened — beyond attacking the frame for holes (appended as Open questions), it can
  now repair the plan to re-sync `intent.md` with reality, human-approved, at any point.
- **Fixed:** the `build-log.md` template's boundary section is now `## Harvest` (matching
  `/pb-harvest`, which writes there) instead of the stale `## Triage`, and a step's
  "done" wording drops the v1 `plumbbob done` for a checkpoint via `/pb-verify` or
  `/pb-build`. The `intent.md` template's Steps guidance now describes batch planning.

## [0.3.3] - 2026-06-25

- **Added:** a `docs/happy-path.md` worked walkthrough that follows one goal end to
  end — framing it, letting `/pb-build` pick and ship each step, then wrapping up,
  archiving, and starting the next task — linked from the README's loop section.
- **Changed:** the root `README.md` is now the single canonical overview, having
  absorbed the standalone `plumbbob-README` (the one law, why it works, calibration,
  the two gate tiers, STATE-as-orientation, git footprint, and the `.plumbbob/`
  layout). The live `templates/` were refreshed to the v2 surface: the step seam in
  `intent.md` now reads as orientation — awareness, not a lock — and `build-log.md`
  uses `/pb-wrap` and `plumbbob wrap` in place of the stale `/plumbbob-report` and
  `plumbbob finish` names.
- **Removed:** the now-duplicate `docs/plumbbob-README.md`, and the unreferenced,
  unshipped `docs/build-log.template.md` and `docs/intent.template.md` — stale copies
  of the live `templates/` pair that `plumbbob start` actually uses.

## [0.3.2] - 2026-06-25

- **Changed:** the close-out is renamed from `/pb-reset` to `/pb-wrap`, and the
  backing CLI verb from `reset` to `wrap`. "Reset" named the mechanism and read as
  destructive — like you were about to wipe your plans; "wrap" names the moment:
  finish up, archive safely, then clear for the next goal. Behaviour is unchanged —
  archive-then-clear, never destroy (C4); report by default, no gate (D9). (A
  separate `wrap` verb existed in v1's finish ceremony and was removed in 0.3.0;
  this reuses the name for the single close-out.)

## [0.3.1] - 2026-06-24

- **Fixed:** the self-contained install no longer breaks on a fresh npm install.
  `setup` had pointed every skill's bin at `$CLAUDE_PROJECT_DIR/node_modules/.bin/plumbbob`,
  but that variable is defined only in Claude Code's hook context and expands
  empty in a skill's bash, so the `/pb-*` status line collapsed to a bad path and
  failed silently. `setup` now resolves the bin when it runs: a `--local` install
  bakes the absolute path to the project-local binary, while `--project` keeps a
  portable bare `plumbbob` (resolved from the `node_modules/.bin` Claude Code
  prepends to `PATH`). The status injection also gained a fallback so a future
  misinstall fails loudly with a fix hint instead of an empty dashboard.
- **Added:** a `plumbbob doctor` verb that diagnoses an install end to end. It
  checks the four things that must be true — the skills are present, their bin
  resolves, the CLI is installed, and the post-edit hook is registered — and
  prints the exact fix for anything broken, including the unresolved placeholder
  and the legacy `$CLAUDE_PROJECT_DIR` bin a pre-0.3.1 install left behind.

## [0.3.0] - 2026-06-23

- **Changed:** PlumbBob shifts from enforcement to guidance — the lock becomes a
  clock. The deciding/executing boundary is no longer held by a hard file lock
  that refused edits; it is held by a pause you advance. `STATE` is demoted from a
  gate to pure orientation, and the verify pause — where you approve a step's diff
  before it is checkpointed — is what now keeps you the decider. The whole surface
  collapses to eight `pb-*` skills you drive from the IDE, so there are no step
  numbers to remember and no raw CLI to type.
- **Added:** the eight-skill surface — `/pb-plan`, `/pb-step`, `/pb-build`,
  `/pb-verify`, `/pb-park`, `/pb-status`, `/pb-harvest`, and `/pb-reset`.
  `/pb-status` is a rich orientation dashboard that names your next move;
  `/pb-verify` is an executor-agnostic tick (check, self-review, validate, pause,
  checkpoint) that reads the diff and not its author, so hand-written, vibed, or
  `/pb-build`-generated code all checkpoint the same way; `/pb-build` is now an
  optional engine that actually implements a planned step; and `/pb-reset` writes
  the report by default and archives with no gate. New `check`, `checkpoint`, and
  `reset` CLI verbs back them.
- **Removed:** the pre-edit muzzle, the seam-guard, and the `bash-guard` hook — the
  entire enforcement layer that only ever defended a lock. The `mode`, `review`,
  `done`, `wrap`, and `finish` verbs are gone, along with the v1 driver skills
  (`pb-start`, `pb-review`, `pb-done`, `pb-wrap`, `pb-finish`) and the
  `plumbbob-report` and `plumbbob-docs` judgment skills, all folded into the eight.

## [0.2.3] - 2026-06-22

- **Fixed:** `plumbbob revert` no longer discards plumbbob's own installed
  files. The verb does a repo-wide `git reset --hard` to the checkpoint, which
  reverted every tracked file — including the driver skills a self-contained
  install copies into `.claude/skills/pb-*`, so an out-of-seam skill edit or a
  `pnpm up plumbbob` re-setup was silently rolled back along with the half-done
  step. revert now snapshots plumbbob's own paths (the sidecar, plus each
  installed skill named in the bundled `skills/` dir) across the reset and
  restores them afterward. Only plumbbob's own skills are protected — a user's
  own `.claude/skills/<name>/` still follows the reset, and the git-excluded
  sidecar is covered too so revert stays robust even where `.plumbbob/` was
  tracked by mistake.

## [0.2.2] - 2026-06-22

- **Fixed:** the pre-edit muzzle no longer blocks writes outside the repository
  or to git-ignored files inside it. The seam-guard previously treated every
  path that was not a `.plumbbob/` control doc or a `docs/` file as code subject
  to the BUILD seam check, so Claude's own plan-mode scratch under
  `~/.claude/plans` was denied as "outside the seam", and ignored files (fallow
  data, `dist/`, `coverage/`) hit the same wall. The muzzle is now gated behind
  `git check-ignore`, so it governs only in-repo, non-ignored paths; `.plumbbob/`
  is itself git-ignored but stays muzzled via an explicit arm, so control state
  (STATE/SEAM) is never made writable.

## [0.2.1] - 2026-06-22

- **Fixed:** `bash-guard` no longer over-blocks read-only redirects outside
  BUILD/SPIKE. The guard previously denied any command containing `>`, which
  caught harmless forms that cannot write a real file — stderr merges (`2>&1`)
  and `/dev/null` sinks (`2>/dev/null`, `&>/dev/null`). These are now scrubbed
  before the write check, while any surviving `>` is still treated as a real
  write and blocked.

## [0.2.0] - 2026-06-22

- **Added:** a self-contained, project-level install shape so PlumbBob can run
  entirely from a project (`pnpm exec plumbbob setup --local`) with nothing
  written under `~/.claude`. The hooks are referenced in place at
  `$CLAUDE_PROJECT_DIR/node_modules/plumbbob/hooks/` (invoked via `sh`, so no
  execute bit is needed) and the skills are copied into `<repo>/.claude/skills/`
  with their bin invocation resolved to the project-local
  `node_modules/.bin/plumbbob`. `--local` writes `settings.local.json`,
  `--project` writes a committable `settings.json`, and a bare `setup`
  auto-detects a project-local dependency.
- **Added:** the eight `pb-*` driver skills (`/pb-start`, `/pb-build`,
  `/pb-review`, `/pb-done`, `/pb-revert`, `/pb-wrap`, `/pb-finish`, `/pb-spike`),
  thin human-fired chat triggers — each `disable-model-invocation: true` — that
  shell their transition verb and report it verbatim, so the whole loop can run
  from the agent window without leaving for a terminal. Every skill now carries a
  `__PLUMBBOB_BIN__` placeholder that `setup` substitutes at copy time.
- **Changed:** transition verbs now run inside a Claude Code session rather than
  being refused under `CLAUDECODE`. The deciding/executing boundary is reframed
  as human-initiated vs model-initiated (not terminal vs chat): the driver skills
  are the human's in-session trigger, and a stray model-initiated transition is
  caught by Claude Code's permission prompt because the verbs are kept out of the
  settings allowlist. `mode` is the lone hold-out — it stays human-only, refused
  in-session and blocked from the model's shell by the Bash guard.
- **Changed:** `plumbbob setup` defaults to the self-contained shape when
  PlumbBob is a project-local dependency; `--global` restores the original
  `~/.claude` install (copied hooks + skills, absolute command paths, bare
  `plumbbob` on `PATH`).

## [0.1.5] - 2026-06-22

- **Added:** a `/version` maintainer skill that bumps the `package.json` version
  by semver (major, minor, or patch), writes a dated Keep a Changelog entry
  summarizing the commits since the last release, and commits the result as
  `chore: release A.B.C`. It lives under `.claude/` rather than the published
  `skills/` directory so it ships to plumbbob's maintainers, not its end users.

## [0.1.4] - 2026-06-22

- **Fixed:** the published `bin` pointed at the raw TypeScript `src/cli.ts`, so a
  fresh `npm install -g plumbbob` only ran where `tsx` (or Node type-stripping)
  happened to be available. The package now compiles to `dist/` and the `bin`
  (`plumbbob` / `pb`) points at `dist/cli.js`, which runs under plain `node`.
- **Added:** `build` (`tsc -p tsconfig.build.json`) and `clean` scripts, a
  `prepack` hook that rebuilds `dist/` before every pack/publish, and
  `tsconfig.build.json` (emits to `dist/`, rewriting the `.ts` import specifiers
  to `.js`).
- **Changed:** the `files` whitelist ships `dist` instead of `src`; knip's entry
  is pinned to `src/cli.ts` now that `bin` resolves into `dist/`.

## [0.1.3] - 2026-06-12

- **Changed:** renamed the project, npm package, and CLI from `plumbline` to
  `plumbbob` (the npm name `plumbline` was already taken). The brand, the command
  (now `plumbbob`, with a `pb` alias), the `/plumbbob-*` skills, the `.plumbbob/`
  sidecar directory, and the `~/.claude/plumbbob/hooks/` install paths all moved
  with it; the `repository` / `homepage` / `bugs` URLs now point at
  `github.com/robmclarty/plumbbob`. The Bash guard still blocks `mode` under the
  legacy `plumbline` spelling as well as `plumbbob` and `pb`.

## [0.1.2] - 2026-06-12

- **Added:** Apache-2.0 `LICENSE` and a README License section; the npm publish
  surface — a `bin` entry for the CLI, a `files` whitelist (`src`, `hooks`,
  `skills`, `templates`), an `engines` Node floor (`>=22.18.0`), and
  `repository` / `homepage` / `bugs` / `keywords` metadata; and this changelog.
- **Changed:** license from `UNLICENSED` to `Apache-2.0`.
- **Removed:** the `private: true` flag, unblocking registry publication.

## [0.1.1] - 2026-06-12

- **Changed:** pinned `devEngines.packageManager` to an exact pnpm version
  (`11.1.2`) instead of a range, and documented that the pin needs manual bumps.

## [0.1.0] - 2026-06-11

- **Added:** initial `plumbbob` CLI (then named `plumbline`) — the verb set (`start`, `status`, `build`,
  `review`, `done`, `revert`, `park`, `spike`, `wrap`, `finish`, `mode`,
  `setup`), the pre-edit / post-edit / bash-guard hooks, skills, and templates
  that enforce the deciding/executing boundary.
