# glossed decision links and the checkride 0.10 fast gate

**Phase** (your own bookkeeping while framing): frame
**Size:** medium
**Scope:** refs

## Frame

*(You, on paper first. The problem in plain words — before any solution.)*

- **Problem:** Two unrelated papercuts, batched because they land in the same files.
  **(a) Citations are unreadable.** A reader who hits `D14` or `C5` has to stop and go
  look the number up. Today the repo has three inconsistent styles: `docs/` links but
  never glosses (175 sites of `[**D26**](#d26)` — a click, not a jog to memory);
  `skills/` and `templates/` are bare or slug-only (87 sites); the CLI's own output
  prints raw tags (`plumbbob doctor — check gate (D32)`). Worse, the one existing
  cross-package link — `../../docs/decisions.md#d68` in `skills/plan/SKILL.md` — is
  **broken for every installed plugin**, because `docs/` is not in the npm package's
  `files` list.
  **(b) The turn gate costs 55 seconds.** The full check is 54.7s, and 52.7s of that is
  vitest. checkride 0.10.2 (we are five minors behind, on 0.5.2) added the `gate` key
  precisely for this: a narrowed per-turn gate, with the full check still binding at
  commit.
- **Smallest thing that solves it:** One rendering rule — `[D26 — tracked build
  folder](docs/decisions.md#d26)` — applied everywhere a tag is cited, with a scanner
  that fails the check when a citation goes bare, plus the checkride upgrade and a
  `{"gate": {"skip": ["test"]}}` profile in `checkride.config.json`.
- **Done looks like:** `pnpm check` is green on checkride 0.10.2 with a new `refs` slot;
  no bare `D`/`C` tag survives in `docs/`, `skills/`, `templates/`, `README.md`,
  `CONTRIBUTING.md`, or anything plumbbob prints; a file-touching turn's gate finishes in
  ~2s and says in words that it ran a profile, not the full check.
- **Explicitly NOT doing:** No version bump, no CHANGELOG entry (Rob cuts releases with
  `/version`). No retrofit of the 13 historical `.plumbbob/builds/*/intent.md` records.
  No new plumbbob setting — the gate profile is checkride's config key, not a
  `.plumbbob/settings.json` key. No change to what `verify`/`checkpoint` run.

## Architecture sketch

*(Hand-drawn is best. Photograph it in, or describe the boxes and arrows.)*

```
CITATIONS — one rule, three renderings by surface

  docs/*.md, README, CONTRIBUTING   [**D26 — tracked build folder**] → decisions.md#d26
  skills/, templates/               [D26 — tracked build folder] → https://github.com/…#d26
                                     └─ absolute: docs/ is NOT shipped in the package
  src/ runtime strings              (D32 — checkride is the gate)
                                     └─ gloss only; a terminal cannot click

  scripts/check-refs.ts  ──►  reads docs/decisions.md for the valid anchors
        │                     scans the surfaces above
        │                     4 rules: linked · anchor matches the number ·
        │                              gloss non-empty · one gloss per number
        └──► wired as a custom `refs` check LAST (step 10), once the tree is clean

THE GATE — two gates, deliberately different

  every file-touching turn   checkride gate  ──►  gate profile {skip: [test]}   ~2s
                             (.claude/settings.json, checkride-owned)     ↑ says so, every time
  verify / checkpoint        plumbbob check  ──►  pnpm check, FULL         ~55s
                             (.plumbbob/settings.json "check")            ↑ unchanged, still binding
```

## Decisions

*(One line each — settled, not re-litigated in the chat. Grows as you resolve the
holes `/plumbbob:refine` surfaces, and as blockers fold in during BUILD.)*

- <a id="d1"></a>**D1 — em-dash-in-the-link**: a citation renders as one link carrying its gloss — [D26 — tracked build folder](../../../docs/decisions.md#d26) — *because* the gloss must travel wherever the link is copied, and two adjacent paren groups read worse than one unit.
- <a id="d2"></a>**D2 — gloss-compresses**: the gloss is a 2–4 word compression, not the definition's full title — *because* it sits mid-sentence and must not hijack the line.
- <a id="d3"></a>**D3 — checker-authored-first-wired-last**: `scripts/check-refs.ts` is written and unit-tested in step 4 but only joins `checkride.config.json` in step 10, after the sweep — *because* a red gate would refuse the very checkpoints that clean it up ([D32 — checkride is the gate](../../../docs/decisions.md#d32)).
- <a id="d4"></a>**D4 — absolute-urls-off-repo**: `skills/` and `templates/` cite by absolute GitHub URL, never a relative path — *because* `docs/` is absent from the package's `files` list, which is why today's `../../docs/decisions.md#d68` is broken in every installed plugin.
- <a id="d5"></a>**D5 — terminal-gloss-only**: strings plumbbob prints carry the gloss with no link — *because* markdown in a terminal is noise, and the gloss alone is what jogs the memory.
- <a id="d6"></a>**D6 — records-stay**: historical `.plumbbob/builds/*/intent.md` are not retrofitted and the scanner skips them — *because* a finished build folder is the record of what shipped ([C4 — never destroy](../../../docs/decisions.md#c4)).
- <a id="d7"></a>**D7 — skip-test-profile**: the gate profile is `{"skip": ["test"]}`, not an `only` list — *because* vitest is 52.7s of the 54.7s, and a skip-list stays correct as slots are added while an only-list silently stops covering them.
- <a id="d8"></a>**D8 — checkpoint-is-the-full-check**: plumbbob's own gate is untouched; `pnpm check` (test included) stays what `verify`/`checkpoint` run — *because* that is exactly checkride's intended shape, fast gate per turn and the full check binding at commit ([D24 — the check is configurable](../../../docs/decisions.md#d24)).
- <a id="d9"></a>**D9 — consistency-is-a-rule**: the scanner fails when the same number is glossed two different ways across the repo — *because* the gloss is only a memory aid if it is the same aid every time.
- <a id="d10"></a>**D10 — tags-stay-in-test-titles**: the 116 D-tags in test titles stay bare and test files are excluded from the scanner — *because* a tag in a test title is a grep anchor, not prose a reader browses cold ([Q1](#open-questions), resolved 2026-07-31).
- <a id="d11"></a>**D11 — this-repo-takes-the-hook**: `checkride hooks add gate,dirty,protect` runs here and `.claude/settings.json` becomes a tracked file — *because* the `gate` key is read only by `checkride gate`, so without the hook the profile is config nobody executes ([Q2](#open-questions), resolved 2026-07-31).
- <a id="d12"></a>**D12 — promote-before-linking**: the nine build-local decisions of the 2026-07-19 commit-subjects build are promoted into the repo key before any skill or template citation is linked — *because* linking them as they stand would manufacture nine confidently wrong links, and `docs/decisions.md` already says a build-local number is renumbered into the key when the work lands ([Q4](#open-questions), resolved 2026-07-31).
- <a id="d13"></a>**D13 — code-spans-are-mentions**: a tag inside a code span is a mention, never a citation, and the scanner skips it — *because* the retired-number prose, the teach-by-bad-example line, and the template's `D1 (slug-here)` placeholder all need an escape, and they are already backticked ([Q5](#open-questions), resolved 2026-07-31).
- <a id="d14"></a>**D14 — bundle-stays-bundled**: checkride stays a `bundleDependencies` entry through the upgrade, megabyte and nested plugin manifest included, with the manifest verified inert — *because* determinism is why it is bundled, and a surprise is only a problem once it is real ([Q6](#open-questions), resolved 2026-07-31).
- <a id="d15"></a>**D15 — two-planes-two-gates**: checkride's blocking Stop gate and plumbbob's non-blocking pause coexist, and the seam is stated rather than smoothed over — *because* checkride gates *the code* while plumbbob latches *the record*, and plumbbob's refusal to enforce never meant no other tool may ([Q7](#open-questions), resolved 2026-07-31).

## Constraints

*(Hard rules the build must honor. `/plumbbob:verify` and `/plumbbob:refine` read against these.)*

- <a id="c1"></a>**C1 — no-new-deps**: the scanner is node builtins only; the runtime allowlist stays `checkride` alone ([C2 — a few deliberate deps](../../../docs/decisions.md#c2)).
- <a id="c2"></a>**C2 — the-gate-stays-honest**: the fast profile never becomes the checkpoint gate, and checkride's "NOT the full check" disclosure is never suppressed.
- <a id="c3"></a>**C3 — no-record-rewrites**: no historical build folder, no CHANGELOG entry, no version bump.
- <a id="c4"></a>**C4 — links-must-resolve**: every citation link resolves from where it is *installed*, not only from the repo root — checked by the `links` slot in-repo and by [D4 — absolute-urls-off-repo](#d4) outside it.

## Steps

*(The build plan. Drive `/plumbbob:build` until done.)*

1. [x] fix(cli): run the in-process CLI tests against a fixture repo — **done when:** a full `pnpm test` leaves the developer's own `git log` and build folder untouched, `checkpoint -m --help` refuses for want of a session rather than for want of a latch tick, and a gate invoked from inside a gate refuses with exit 2 instead of recursing
   - seam: `src/cli-core.ts`, `src/cli.ts`, `src/__tests__/cli-core.test.ts`, `src/lib/check.ts`, `src/lib/reentry.ts`, `src/lib/__tests__/reentry.test.ts`
   - model: opus — the isolation is mechanical, but the re-entrancy guard is a new invariant across both gate paths
   - notes: `run()` (`cli-core.ts:396`) dispatches with `process.cwd()` (line 438) and takes no root, so `run(['checkpoint', '-m', '--help'])` (`cli-core.test.ts:100`) checkpoints the *developer's* repo — the reflog holds four `--help` commits from it. `--help` there is the deliberate value of `-m`, so unknown-flag refusal ([b624e9b](https://github.com/robmclarty/plumbbob/commit/b624e9b)) never sees it and cannot help. `dispatch` already takes a root: give `run` an optional one (`src/cli.ts:10` is the only production caller) and point the mutating call sites at a temp repo, which restores the intent the test's own comment already states. Audit the other three (`--typo`, `--build x`, `park --not-a-flag`) — they refuse before dispatch today but sit on the same footing.
   - notes: **the structural half.** Isolation fixes these four call sites; a re-entrancy guard fixes the class. `runCheck` sets a marker on the environment it hands the gate (spawn path and in-process checkride alike) and refuses with exit 2 when it finds one already set on entry — so a gate can never run inside a gate, whoever calls it from wherever. Without it the failure mode is not a slow suite but a fork bomb: each nested `pnpm check` re-runs the suite, which spawns another, and the only reason this one ended was checkride's 600s cap. Node builtins only, no new dependency ([C1 — no-new-deps](#c1)).
2. [x] chore(deps): upgrade checkride to 0.10.2 — **done when:** `pnpm check` is green on 0.10.2 and the always-on-adapter coupling probes cover the new always-on `build` slot
   - seam: `package.json`, `pnpm-lock.yaml`, `src/lib/check.ts`, `src/lib/__tests__/check.test.ts`, `src/verbs/__tests__/doctor.test.ts`
   - model: opus — five minors of API drift to read against a programmatic consumer
   - notes: three known drifts to handle. (a) `SLOTS` gained `build` (opt-in, no `detect`), so it resolves an adapter in *any* repo — `ALWAYS_ON_ADAPTERS` in `check.ts:68` must gain it, **and `snippets-dist`**, since that list matches *adapter* names and the `snippets` slot now has two. Miss either and `gateDetectsTools` green-lights a repo with no code tools. (b) `runChecks({only: []})` now **throws** instead of selecting nothing (0.9.3 contract) — confirm plumbbob's flag parsing can never hand it an empty array. (c) `RunFlags` gained `strict` (the vacuous-green refusal we hand-rolled) and `concurrency`; adopt `strict: true` alongside our own links-only refusal, keep both. Before checkpointing, pack the tarball and confirm checkride's bundled `.claude-plugin/plugin.json` is inert ([D14 — bundle-stays-bundled](#d14)).
3. [ ] chore(gate): run a test-less checkride profile on every turn — **done when:** a file-touching turn's gate finishes in ~2s and its verdict names the profile in words; `pnpm check` still runs vitest and is still what `checkpoint` refuses on
   - seam: `checkride.config.json`, `.claude/settings.json`
   - model: sonnet — mechanical once step 1 lands
   - notes: give the `test` slot an explicit `timeout` rather than inheriting the default. Two different numbers are in play and they are easy to confuse: `DEFAULT_TIMEOUT_SECONDS` is **600s per check** (the cap that killed vitest at `exit_code: -1`), while the `timeout: 900` checkride writes is the **Claude Code Stop-hook** entry's own budget. A profile that skips `test` ([D7 — skip-test-profile](#d7)) means the cap only ever bites the full run — state the chosen number in the config so the next reader does not have to derive it.
   - notes: the `gate` key is inert without the hook that reads it — this repo has no `.claude/settings.json` at all, so run `checkride hooks add gate,dirty,protect` (writes the entry, the `dirty` edit marker, and the two `permissions.deny` rules). See [Q2 (gate-hook-install)](#q2).
4. [ ] feat(refs): flag a citation that is bare, mislinked, or unglossed — **done when:** unit tests pin all four rules over fixtures, and running the scanner over the repo prints the full violation list that steps 4–7 burn down
   - seam: `scripts/check-refs.ts`, `test/integration/check-refs.test.ts`, `tsconfig.json`
   - model: opus — the rules and the surface split are the design
   - notes: reads the valid anchors from `docs/decisions.md`. Four rules — linked, anchor matches the cited number, gloss non-empty, one gloss per number ([D9 — consistency-is-a-rule](#d9)) — plus the src variant ([D5 — terminal-gloss-only](#d5)): gloss required, link forbidden. A tag inside a code span is a mention and is never checked ([D13 — code-spans-are-mentions](#d13)); that one rule is also the false-positive escape, so the regex needs no allowlist. Skips `.plumbbob/`, `research/`, `CHANGELOG.md`, and test titles. NOT wired into `checkride.config.json` yet ([D3 — checker-authored-first-wired-last](#d3)).
5. [ ] docs(refs): gloss every decision citation in the docs — **done when:** the scanner reports zero violations under `docs/`, `README.md`, `CONTRIBUTING.md`
   - seam: `docs/decisions.md`, `docs/cli-reference.md`, `docs/agents.md`, `docs/architecture.md`, `docs/troubleshooting.md`, `docs/happy-path.md`, `docs/state-and-git.md`, `docs/techniques.md`, `docs/skills-reference.md`, `docs/faq.md`, `docs/install.md`, `docs/local-model-review.md`, `docs/attention-first-development.md`, `README.md`, `CONTRIBUTING.md`
   - model: sonnet — mechanical, but 175 linked sites plus ~40 bare ones; the gloss for each number comes from its definition's own title
6. [ ] docs(decisions): promote the commit-subject decisions into the repo key — **done when:** every tag cited in `skills/` and `templates/` resolves to an anchor that exists in `docs/decisions.md` and means what the citing sentence says it means
   - seam: `docs/decisions.md`
   - model: opus — a merge judgment, not a sweep: deciding which of the nine D68 already absorbed
   - notes: the nine locals of `2026-07-19-readable-commit-subjects…` are `title-is-subject`, `paths-leave-the-title`, `scope-fallback-chain`, `build-default-scope-header`, `subject-synced-on-drift`, `determinism-preserved`, `scope-placeholder-absent`, `scope-names-code-area`, `subject-length-soft`. [D68 — Conventional-Commit subjects](../../../docs/decisions.md#d68) already carries some of that text — fold those in rather than minting a duplicate number; the rest take D71 upward. This step allocates first, so step 11 takes whatever numbers are left ([D12 — promote-before-linking](#d12)).
7. [ ] docs(skills): point the skills' citations at the published decisions — **done when:** zero violations under `skills/` and `templates/`, every link absolute, and the broken `../../docs/decisions.md#d68` is gone
   - seam: `skills/plan/SKILL.md`, `skills/build/SKILL.md`, `skills/verify/SKILL.md`, `skills/step/SKILL.md`, `skills/refine/SKILL.md`, `skills/spike/SKILL.md`, `templates/intent.md`, `templates/build-log.md`
   - model: sonnet — a sweep once step 6 has settled every referent
   - notes: each citation resolves to the number step 6 assigned it, not the one written today. `templates/intent.md` is copied into a *user's* repo, where plumbbob's own numbers collide with the user's build-local ones — mark those as plumbbob's, e.g. `[plumbbob D71 — 72-char subjects](https://…#d71)`.
8. [ ] feat(intent): anchor and gloss the build-local citations — **done when:** a `Q` opener written in the anchored form still counts in `plumbbob status`, and `pnpm test` is green
   - seam: `templates/intent.md`, `src/lib/orient.ts`, `src/lib/__tests__/orient.test.ts`, `skills/plan/SKILL.md`, `skills/step/SKILL.md`, `skills/refine/SKILL.md`
   - model: opus — one parser regex is load-bearing for the status counter
   - notes: definitions gain `<a id="d1"></a>`, citations become `[D1 — slug](#d1)`. `parseOpenQuestions` (`orient.ts:160`) matches `/^- Q\d+(?: \([^)]+\))?:/` and would stop counting an anchored opener — widen it, with a regression test. `scrapeBullets` is format-agnostic and needs nothing.
9. [ ] docs(cli): gloss the D-tags in the CLI's own output — **done when:** no bare tag survives in anything plumbbob prints, and the scanner's src rule is green
   - seam: `src/verbs/doctor.ts`, `src/lib/latch.ts`, `src/verbs/finish.ts`, `src/verbs/agent.ts`, `src/lib/intent.ts`, and the tests asserting those strings
   - model: sonnet — nine strings, each with a test to update
10. [ ] chore(gate): wire the citation check into checkride and the fast profile — **done when:** `pnpm check` runs a green `refs` slot in wave 1, and the turn gate picks it up through [D7 — skip-test-profile](#d7)
   - seam: `checkride.config.json`
   - model: sonnet — one config entry
11. [ ] docs(decisions): record the citation convention and the gate profile — **done when:** `docs/decisions.md` carries the citation rendering rule and the two-gate split as the next two free numbers after step 5's promotion, both cited in the new form, and the `links` slot resolves every anchor
   - seam: `docs/decisions.md`, `docs/cli-reference.md`, `CONTRIBUTING.md`
   - model: opus — the wording is the deliverable
   - notes: the two-gate entry states the seam rather than smoothing it ([D15 — two-planes-two-gates](#d15)): checkride's Stop hook blocks a red turn on the *code* plane; [D10 — the boundary is a pause](../../../docs/decisions.md#d10) and [D13 — no edit-blocking guards](../../../docs/decisions.md#d13) still hold on plumbbob's, where the latch governs the *record*.

## Open questions

- Q1 (test-titles): do the 116 D-tags in test titles get glossed too, or stay bare? — *resolved:* 2026-07-31, stay bare; the scanner excludes test files
  - *plain:* 116 test titles carry tags like `it('D67: settings auto is not a grant', …)`. They are grep anchors — the way you find every test pinning a decision — and they are read in failure output, not browsed. Glossing them triples the churn of this build and lengthens every title; leaving them bare means the checker has one documented blind spot.
  - *lean:* leave them bare and exclude test files from the scanner. The tag in a test title is an identifier, not prose; the thing Rob reads cold is docs and CLI output, and both get glossed.
- Q2 (gate-hook-install): does this repo take checkride's Stop-gate hook, given the `gate` key does nothing without it? — *resolved:* 2026-07-31, yes — install all three hooks and track `.claude/settings.json`
  - *plain:* `{"gate": …}` is read only by `checkride gate`, which is the hook script. This repo has no `.claude/settings.json` at all, so the profile would be inert config. Installing it (`checkride hooks add gate,dirty,protect`) means a ~2s check at the end of every turn that edited a file, a tracked `.claude/settings.json`, and two `permissions.deny` rules protecting `.check/**` and the baseline. It runs alongside plumbbob's own three plugin hooks — no conflict, but it is a real change to how a session feels.
  - *lean:* install all three. `dirty` is what keeps a conversation-only turn from paying anything, and without the hook the whole second half of this build is a config file nobody reads.
- Q3 (gloss-source): should the scanner also check that a gloss actually *matches* its definition, not just that one exists? — *resolved:* 2026-07-31, no — presence and consistency are mechanical, correctness is a review call
  - *plain:* Rules 1–4 catch a missing or inconsistent gloss but not a *wrong* one — `[D26 — approval latch](#d26)` passes. A word-overlap rule against the definition's title would catch it, but titles compress badly (`C2 — Node builtins plus a few deliberate dependencies` → "a few deliberate deps" shares no whole word with "dependencies").
  - *lean:* no. Enforce presence and consistency mechanically; correctness is a review call. A wrong gloss that is wrong *consistently* is one edit to fix, and rule 4 makes it one place.

- Q4 (build-local-numbers): half the tags in `skills/` and `templates/` cite a *build-local* numbering universe that was never promoted into the repo key — what do those citations link to? — *resolved:* 2026-07-31, promote the nine into the repo key first (new step 6)
  - *plain:* This is the hole that breaks the skills sweep as written. `templates/intent.md` cites `(D4)` for the `**Scope:**` header, `(D7)` for the slug fallback, `(D9)` for the 72-char guidance, `(D2)` for paths-leave-the-title. In `docs/decisions.md` those numbers mean *the in-flight step lives in flat files*, *capture then triage*, *`finish` is the close-out*, and **nothing at all** (D2 is a retired number with no anchor). They are the local D1–D9 of the 2026-07-19 commit-subjects build, of which **only D68 was ever promoted** to the key — the renumbering `docs/decisions.md` says happens "when the work lands" was skipped. The two skills do not even agree with each other: `plan/SKILL.md:103` cites `D3` for the scope-fallback chain, `step/SKILL.md:49` cites `D8` for the same rule. Linking these mechanically would manufacture nine confidently wrong links — the exact failure this build exists to end, made permanent and clickable.
  - *lean:* promote them. Nine live rules the code actually enforces (`subjectFromTitle`, the scope fallback, the soft 72-char aim) deserve repo-key numbers; fold the ones D68's amended text already absorbs into D68 and give the rest D71+. It is a judgment pass, not a sweep — so it becomes its own step ahead of the skills sweep, which stops being mechanical. The cheap alternative is to strip the numbers from `skills/`/`templates/` and keep the gloss alone, which is defensible (a plugin user cannot look up `D8` anyway) but loses the skill→decision trace.
- Q5 (code-spans-are-mentions): how does a legitimately unlinked tag opt out of the scanner? — *resolved:* 2026-07-31, a tag in a code span is a mention, never checked
  - *plain:* Three places need an escape and today have none. `docs/decisions.md` names its own retired numbers in prose ("D2, D5, D11, D12, D21 belonged to superseded decisions") — there is no anchor to link them to. `skills/plan/SKILL.md:64` teaches the rule by quoting a bad example ("never a bare `D4`/`C6`/`Q2`"). And `templates/intent.md` uses `D1 (slug-here)` as a fill-in-the-blank placeholder. A scanner with no opt-out fails all three forever.
  - *lean:* one rule, no new syntax — **a tag inside a code span is a mention, not a citation**, and is never checked. All three cases above are already backticked, so they pass untouched, and it doubles as the false-positive escape for anything the regex over-matches later.
- Q6 (nested-plugin-manifest): checkride is a `bundleDependencies` entry, and 0.10.2 ships its own plugin manifest — does that land inside plumbbob's published plugin? — *resolved:* 2026-07-31, keep bundling; verify the nested manifest is inert in step 1
  - *plain:* checkride 0.10.2 carries `.claude-plugin/plugin.json` plus `skills/check` and `skills/qa`; plumbbob bundles checkride into its own tarball, so those files ride along inside `node_modules/checkride/`. If Claude Code discovers nested manifests, installing plumbbob quietly installs checkride's two skills too — surprising, and a name a user never asked for. The upgrade also roughly doubles the bundled weight: 880K installed today, 1.9M unpacked at 0.10.2.
  - *lean:* keep bundling (determinism is the whole reason it is bundled) and accept the megabyte, but verify the nested manifest is inert before step 1 checkpoints — one `plumbbob doctor` on a packed install answers it. If it is *not* inert, the fix is a `.npmignore`-style prune, not un-bundling.
- Q7 (second-clock): a blocking Stop gate in the repo of a tool whose thesis is that the human is the clock — is that a contradiction worth living with? — *resolved:* 2026-07-31, keep it and name the seam in the final decisions entry
  - *plain:* You already said install it, so this is a confirm, not a re-litigation. But note what arrives with it: checkride's Stop hook **blocks the agent from ending its turn** while the pipeline is red. plumbbob's own [D13 — no edit-blocking guards](../../../docs/decisions.md#d13) and [D10 — the boundary is a pause](../../../docs/decisions.md#d10) say the opposite for plumbbob's plane, and this build puts a second, genuinely enforcing clock into the dogfood repo. The distinction is real — checkride gates *the code*, plumbbob latches *the record* — but a reader of this repo will meet both and may not see the seam.
  - *lean:* keep it, and say so out loud in the final step's decisions entry: the two gates are on different planes, and plumbbob's refusal to enforce has never meant "no other tool may". The dogfood is more honest with it than without it.

## Verdicts

*(Filled in as spikes and forks resolve — the audit trail of "these were my calls.")*

- 2026-08-01 — [Q6 (nested-plugin-manifest)](#open-questions) closed as far as this machine can show. checkride 0.7.0 is installed as a plugin and carries a nested `node_modules/.pnpm/fallow@3.5.0/node_modules/fallow/skills` directory; none of fallow's skills are offered in a session. Nested plugin *content* is not discovered, so bundling stays ([D14 — bundle-stays-bundled](#d14)). The residual: no installed plugin currently ships a nested `.claude-plugin/plugin.json`, which is the exact artifact checkride 0.10.2 adds — the evidence covers `skills/`, and discovery is driven by marketplace registration pointing at a plugin *root*, so a manifest deeper in the tree has nothing pointing at it. Re-check on the first packed install after release rather than treating this as proven.
- 2026-08-01 — the flat re-entrancy flag was rejected by this repo's own gate before it landed, and the marker is scoped by root instead. Recursion is a repo re-entering *its own* gate; the suite gating a fixture repo is ordinary nested work. Both cases are pinned by tests in `reentry.test.ts`.
