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

  docs/*.md, README, CONTRIBUTING   [**D26 — tracked build folder**](decisions.md#d26)
  skills/, templates/               [D26 — tracked build folder](https://github.com/…#d26)
                                     └─ absolute: docs/ is NOT shipped in the package
  src/ runtime strings              (D32 — checkride is the gate)
                                     └─ gloss only; a terminal cannot click

  scripts/check-refs.ts  ──►  reads docs/decisions.md for the valid anchors
        │                     scans the surfaces above
        │                     4 rules: linked · anchor matches the number ·
        │                              gloss non-empty · one gloss per number
        └──► wired as a custom `refs` check LAST (step 8), once the tree is clean

THE GATE — two gates, deliberately different

  every file-touching turn   checkride gate  ──►  gate profile {skip: [test]}   ~2s
                             (.claude/settings.json, checkride-owned)     ↑ says so, every time
  verify / checkpoint        plumbbob check  ──►  pnpm check, FULL         ~55s
                             (.plumbbob/settings.json "check")            ↑ unchanged, still binding
```

## Decisions

*(One line each — settled, not re-litigated in the chat. Grows as you resolve the
holes `/plumbbob:refine` surfaces, and as blockers fold in during BUILD.)*

- <a id="d1"></a>**D1 — em-dash-in-the-link**: a citation renders as one link carrying its gloss, `[D26 — tracked build folder](…#d26)` — *because* the gloss must travel wherever the link is copied, and two adjacent paren groups read worse than one unit.
- <a id="d2"></a>**D2 — gloss-compresses**: the gloss is a 2–4 word compression, not the definition's full title — *because* it sits mid-sentence and must not hijack the line.
- <a id="d3"></a>**D3 — checker-authored-first-wired-last**: `scripts/check-refs.ts` is written and unit-tested in step 3 but only joins `checkride.config.json` in step 8, after the sweep — *because* a red gate would refuse the very checkpoints that clean it up ([D32 — checkride is the gate](../../../docs/decisions.md#d32)).
- <a id="d4"></a>**D4 — absolute-urls-off-repo**: `skills/` and `templates/` cite by absolute GitHub URL, never a relative path — *because* `docs/` is absent from the package's `files` list, which is why today's `../../docs/decisions.md#d68` is broken in every installed plugin.
- <a id="d5"></a>**D5 — terminal-gloss-only**: strings plumbbob prints carry the gloss with no link — *because* markdown in a terminal is noise, and the gloss alone is what jogs the memory.
- <a id="d6"></a>**D6 — records-stay**: historical `.plumbbob/builds/*/intent.md` are not retrofitted and the scanner skips them — *because* a finished build folder is the record of what shipped ([C4 — never destroy](../../../docs/decisions.md#c4)).
- <a id="d7"></a>**D7 — skip-test-profile**: the gate profile is `{"skip": ["test"]}`, not an `only` list — *because* vitest is 52.7s of the 54.7s, and a skip-list stays correct as slots are added while an only-list silently stops covering them.
- <a id="d8"></a>**D8 — checkpoint-is-the-full-check**: plumbbob's own gate is untouched; `pnpm check` (test included) stays what `verify`/`checkpoint` run — *because* that is exactly checkride's intended shape, fast gate per turn and the full check binding at commit ([D24 — the check is configurable](../../../docs/decisions.md#d24)).
- <a id="d9"></a>**D9 — consistency-is-a-rule**: the scanner fails when the same number is glossed two different ways across the repo — *because* the gloss is only a memory aid if it is the same aid every time.
- <a id="d10"></a>**D10 — tags-stay-in-test-titles**: the 116 D-tags in test titles stay bare and test files are excluded from the scanner — *because* a tag in a test title is a grep anchor, not prose a reader browses cold ([Q1](#open-questions), resolved 2026-07-31).
- <a id="d11"></a>**D11 — this-repo-takes-the-hook**: `checkride hooks add gate,dirty,protect` runs here and `.claude/settings.json` becomes a tracked file — *because* the `gate` key is read only by `checkride gate`, so without the hook the profile is config nobody executes ([Q2](#open-questions), resolved 2026-07-31).

## Constraints

*(Hard rules the build must honor. `/plumbbob:verify` and `/plumbbob:refine` read against these.)*

- <a id="c1"></a>**C1 — no-new-deps**: the scanner is node builtins only; the runtime allowlist stays `checkride` alone ([C2 — a few deliberate deps](../../../docs/decisions.md#c2)).
- <a id="c2"></a>**C2 — the-gate-stays-honest**: the fast profile never becomes the checkpoint gate, and checkride's "NOT the full check" disclosure is never suppressed.
- <a id="c3"></a>**C3 — no-record-rewrites**: no historical build folder, no CHANGELOG entry, no version bump.
- <a id="c4"></a>**C4 — links-must-resolve**: every citation link resolves from where it is *installed*, not only from the repo root — checked by the `links` slot in-repo and by [D4 — absolute-urls-off-repo](#d4) outside it.

## Steps

*(The build plan. Drive `/plumbbob:build` until done.)*

1. [ ] chore(deps): upgrade checkride to 0.10.2 — **done when:** `pnpm check` is green on 0.10.2 and the always-on-adapter coupling probes cover the new always-on `build` slot
   - seam: `package.json`, `pnpm-lock.yaml`, `src/lib/check.ts`, `src/lib/__tests__/check.test.ts`, `src/verbs/__tests__/doctor.test.ts`
   - model: opus — five minors of API drift to read against a programmatic consumer
   - notes: three known drifts to handle. (a) `SLOTS` gained `build` (opt-in, no `detect`), so it resolves an adapter in *any* repo — `ALWAYS_ON_ADAPTERS` in `check.ts:68` must gain it or `gateDetectsTools` green-lights a repo with no code tools. (b) `runChecks({only: []})` now **throws** instead of selecting nothing (0.9.3 contract) — confirm plumbbob's flag parsing can never hand it an empty array. (c) `RunFlags` gained `strict` (the vacuous-green refusal we hand-rolled) and `concurrency`; adopt `strict: true` alongside our own links-only refusal, keep both.
2. [ ] chore(gate): run a test-less checkride profile on every turn — **done when:** a file-touching turn's gate finishes in ~2s and its verdict names the profile in words; `pnpm check` still runs vitest and is still what `checkpoint` refuses on
   - seam: `checkride.config.json`, `.claude/settings.json`
   - model: sonnet — mechanical once step 1 lands
   - notes: the `gate` key is inert without the hook that reads it — this repo has no `.claude/settings.json` at all, so run `checkride hooks add gate,dirty,protect` (writes the entry, the `dirty` edit marker, and the two `permissions.deny` rules). See [Q2 (gate-hook-install)](#q2).
3. [ ] feat(refs): flag a citation that is bare, mislinked, or unglossed — **done when:** unit tests pin all four rules over fixtures, and running the scanner over the repo prints the full violation list that steps 4–7 burn down
   - seam: `scripts/check-refs.ts`, `test/integration/check-refs.test.ts`, `tsconfig.json`
   - model: opus — the rules and the surface split are the design
   - notes: reads the valid anchors from `docs/decisions.md`. Four rules — linked, anchor matches the cited number, gloss non-empty, one gloss per number ([D9 — consistency-is-a-rule](#d9)) — plus the src variant ([D5 — terminal-gloss-only](#d5)): gloss required, link forbidden. Skips `.plumbbob/`, `research/`, `CHANGELOG.md`, and test titles. NOT wired into `checkride.config.json` yet ([D3 — checker-authored-first-wired-last](#d3)).
4. [ ] docs(refs): gloss every decision citation in the docs — **done when:** the scanner reports zero violations under `docs/`, `README.md`, `CONTRIBUTING.md`
   - seam: `docs/decisions.md`, `docs/cli-reference.md`, `docs/agents.md`, `docs/architecture.md`, `docs/troubleshooting.md`, `docs/happy-path.md`, `docs/state-and-git.md`, `docs/techniques.md`, `docs/skills-reference.md`, `docs/faq.md`, `docs/install.md`, `docs/local-model-review.md`, `docs/attention-first-development.md`, `README.md`, `CONTRIBUTING.md`
   - model: sonnet — mechanical, but 175 linked sites plus ~40 bare ones; the gloss for each number comes from its definition's own title
5. [ ] docs(skills): point the skills' citations at the published decisions — **done when:** zero violations under `skills/` and `templates/`, every link absolute, and the broken `../../docs/decisions.md#d68` is gone
   - seam: `skills/plan/SKILL.md`, `skills/build/SKILL.md`, `skills/verify/SKILL.md`, `skills/step/SKILL.md`, `skills/refine/SKILL.md`, `skills/spike/SKILL.md`, `templates/intent.md`, `templates/build-log.md`
   - model: sonnet — mechanical
   - notes: `templates/intent.md` is copied into a *user's* repo, where plumbbob's own `D9`/`D62` collide with the user's build-local numbering — mark those as plumbbob's, e.g. `[plumbbob D9 — 72-char subjects](https://…#d9)`.
6. [ ] feat(intent): anchor and gloss the build-local citations — **done when:** a `Q` opener written in the anchored form still counts in `plumbbob status`, and `pnpm test` is green
   - seam: `templates/intent.md`, `src/lib/orient.ts`, `src/lib/__tests__/orient.test.ts`, `skills/plan/SKILL.md`, `skills/step/SKILL.md`, `skills/refine/SKILL.md`
   - model: opus — one parser regex is load-bearing for the status counter
   - notes: definitions gain `<a id="d1"></a>`, citations become `[D1 — slug](#d1)`. `parseOpenQuestions` (`orient.ts:160`) matches `/^- Q\d+(?: \([^)]+\))?:/` and would stop counting an anchored opener — widen it, with a regression test. `scrapeBullets` is format-agnostic and needs nothing.
7. [ ] docs(cli): gloss the D-tags in the CLI's own output — **done when:** no bare tag survives in anything plumbbob prints, and the scanner's src rule is green
   - seam: `src/verbs/doctor.ts`, `src/lib/latch.ts`, `src/verbs/finish.ts`, `src/verbs/agent.ts`, `src/lib/intent.ts`, and the tests asserting those strings
   - model: sonnet — nine strings, each with a test to update
8. [ ] chore(gate): wire the citation check into checkride and the fast profile — **done when:** `pnpm check` runs a green `refs` slot in wave 1, and the turn gate picks it up through [D7 — skip-test-profile](#d7)
   - seam: `checkride.config.json`
   - model: sonnet — one config entry
9. [ ] docs(decisions): record the citation convention and the gate profile — **done when:** `docs/decisions.md` carries D71 (the citation rendering rule) and D72 (the two-gate split), both cited in the new form, and the `links` slot resolves every anchor
   - seam: `docs/decisions.md`, `docs/cli-reference.md`, `CONTRIBUTING.md`
   - model: opus — the wording is the deliverable

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

## Verdicts

*(Filled in as spikes and forks resolve — the audit trail of "these were my calls.")*
