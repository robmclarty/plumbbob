<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.
-->

# check gate becomes checkride

**STATE:** DESIGN
**Phase** (bookkeeping while in DESIGN): plan approved — Rob signed off on every step 2026-07-02
**Size:** medium

## Frame

- **Problem:** `lib/check.ts` hand-rolls what checkride (Rob's sibling package,
  `checkride@0.1.6` on npm) already is: the definition of done. Plumbbob spawns an
  opaque shell command and gets back a bare exit code — no slot detail, no
  machine-readable failure pointers for the agent, no `--bail`/`--only` iteration
  loops. Meanwhile the zero-dep stance had hardened into dogma; Rob's actual rule
  is "use a few packages as necessary", and hand-crafting against his own tool is
  the anti-pattern, not the dependency.
- **Smallest thing that solves it:** import checkride's programmatic API
  (`runChecks`, `runDoctor`) as plumbbob's first runtime dependency. The settings
  ladder's `check` key survives as the spawn-command *override* for non-checkride
  repos; absence of the key means checkride is the gate. Red reports name the
  failing slots and their `.check/<slot>.json` raw output so `pb-verify` reads
  diagnostics instead of scraping stdout.
- **Done looks like:** `plumbbob check` runs checkride in-process and reports
  per-slot; `checkpoint` still refuses on red; a repo with nothing to check gets a
  refusal, not a vacuous green; `plumbbob check --bail --only types,lint` works;
  `doctor` folds in checkride's slot report; docs/skills updated; plumbbob's own
  repo dogfoods the gate through checkride with fallow replacing knip; suite green.
- **Explicitly NOT doing:** version/CHANGELOG bump (Rob cuts releases via
  `/version`); removing the spawn override (non-TS repos still gate through any
  command); adopting checkride's `init`/scaffolding surface (only the run/doctor
  API); mutation/security opt-in slots for plumbbob's own gate.

## Architecture sketch

```
runCheck(root, flags?)                       — now async
  ├─ settings ladder resolves `check` (flag → local → project → ABSENT)
  │    ├─ resolves to a command string  → spawnSync it (legacy path, unchanged;
  │    │                                   fixtures' `check: "true"` stubs keep working)
  │    └─ absent                        → runChecks({ cwd: root, ...flags })   [checkride]
  │         ├─ all slots skipped → refuse: "checkride found nothing to check…" (exit 1)
  │         ├─ exitCode 2        → "check gate ERROR (misconfigured harness)…"
  │         └─ red               → list failing slots + .check/<slot> output files
  └─ callers: verbs/check.ts (flags pass through), verbs/checkpoint.ts (full gate)

async ripple: check/checkpoint/doctor verbs → dispatch() → run() → cli.ts awaits

dogfood (this repo): settings.json drops "check" → gate is checkride
  knip retired → fallow (checkride's blessed `dead` adapter, fallow.toml)
  package.json "check": "checkride" alias stays for humans/CI
```

## Decisions

- D1: checkride is imported programmatically, not spawned — *because* Rob owns
  both packages, the typed `RunResult`/`Summary` comes back in-process (no
  `.check/summary.json` disk-read dance), and reinventing the wheel against his
  own sibling tool is waste. This is plumbbob's first `dependencies` entry,
  pinned exact — pre-1.0 API churn across two repos is "bump them together"
  discipline.
- D2: the dependency doctrine is amended, not deleted — *because* the constraint
  was always a means (determinism, no supply-chain sprawl), not an end. New
  wording: node builtins plus a few deliberate dependencies — Rob's own tools
  first — never a casual `npm install`.
- D3: `check` setting absent ⇒ checkride; present ⇒ spawn that command —
  *because* the ladder (repo D27) already models "project override beats
  built-in default", non-checkride repos still need a gate, and the D14 test
  fixtures (`check: "true"`) keep working untouched.
- D4: all-slots-skipped is a refusal, not a green — *because* checkride's
  zero-config mode skips slots with no detected tool, so an unconfigured repo
  would otherwise green-light every checkpoint vacuously. Exit 1 with a
  configure-or-override message.
- D5: checkride exit 2 (harness error) reports distinctly from exit 1 (red) —
  *because* a misconfigured gate must not read as broken code; both still block.
- D6: `plumbbob check` forwards `--bail --only --skip --include --changed --all`
  onto `RunFlags`; `checkpoint`'s gate takes no flags — *because* iteration wants
  a narrowed loop but the commit gate is always full-fat. Flags warn and are
  ignored on the spawn-override path.
- D7: `start` stops seeding `"check"` into settings.json (seeds `{ auto: false }`
  only) — *because* absence now *means* checkride (D3); seeding the old default
  would freeze every new repo onto the legacy path. The old "no check script"
  warning dies; D4's runtime refusal is the sharper replacement.
- D8: `doctor` calls checkride's `runDoctor` and prints the slot/adapter table —
  *because* "detected but tool missing" is the likely footgun and checkride
  already diagnoses it.
- D9: knip is retired in favour of fallow for the `dead` slot — *because* fallow
  is checkride's blessed default and Rob's call ("deprecate Knip in favour of
  fallow", 2026-07-02).
- D10: plumbbob's own unit tests run through checkride normally (the `test` slot
  → vitest) — Rob's call. The D14 anti-recursion rule lives where it always did:
  *fixture repos* stub their gate (`check: "true"` spawn override), so no test
  ever triggers a nested full gate.

## Constraints

- C1: functional/procedural, no classes/`this`/default exports (repo C1).
- C2: dependencies are checkride only — no transitive sprawl (checkride itself
  has zero runtime deps); everything else stays node builtins.
- C3: the spawn-override path's behavior is byte-for-byte today's: same command
  resolution, same inherited stdio, same exit-code return.
- C4: no version/CHANGELOG bump in this build.
- C5: every behavior change gets a subprocess test in a throwaway repo (repo D14).
- C6: git footprint stays additive (repo C5).

## Steps

1. [x] Dependency doctrine + the checkride dependency — **done when:**
   `package.json` carries `"checkride"` pinned exact under `dependencies` and the
   lockfile is updated; `docs/decisions.md`'s dependency wording (C2/D1 tags) is
   amended per D2; stale "zero runtime deps" comments in `src/cli-core.ts` and
   `src/lib/settings.ts` follow suit; suite green
   - seam: `package.json`, `pnpm-lock.yaml`, `docs/decisions.md`, `src/cli-core.ts`, `src/lib/settings.ts`
2. [x] The programmatic gate + async ripple — **done when:** `runCheck` is async
   and routes per D3 (absent → `runChecks`, present → today's spawn); the
   vacuous-green refusal (D4), exit-2 distinction (D5), and failing-slot report
   land; `check`/`checkpoint` verbs, `dispatch`, `run`, and `cli.ts` are async;
   new lib tests cover green/red/exit-2/all-skipped via fixture
   `checkride.config.json` custom checks, and existing spawn-override tests pass
   untouched
   - seam: `src/lib/check.ts`, `src/verbs/check.ts`, `src/verbs/checkpoint.ts`, `src/cli-core.ts`, `src/cli.ts`, `src/lib/__tests__/check.test.ts`, `test/helpers/fixture-repo.ts`
3. [x] Flag passthrough on `plumbbob check` — **done when:** `--bail`, `--only a,b`,
   `--skip a,b`, `--include a,b`, `--changed`, `--all` map onto `RunFlags`;
   flags on the spawn-override path warn-and-ignore (D6); verb tests assert a
   narrowed run and the warning
   - seam: `src/verbs/check.ts`, `src/lib/check.ts`, `src/verbs/__tests__/check.test.ts`
4. [x] `start` seeding + `doctor` gate report — **done when:** `start` seeds
   `{ "auto": false }` only and the no-check-script warning is gone (D7);
   `doctor` prints checkride's slot/adapter report and flags missing tools (D8);
   both verbs' tests updated
   - seam: `src/verbs/start.ts`, `src/verbs/doctor.ts`, `src/verbs/__tests__/start.test.ts`, `src/verbs/__tests__/doctor.test.ts`
5. [x] Docs + skills — **done when:** repo D24 is amended (checkride is the gate;
   `check` setting = spawn override) and a new decision records D1–D5 of this
   build; `docs/cli-reference.md`, `docs/troubleshooting.md`, `README.md`
   updated; `pb-build`/`pb-verify`/`pb-plan`/`pb-finish` skills point the agent
   at `.check/summary.json` → failing slot's raw JSON on red
   - seam: `docs/`, `README.md`, `skills/pb-build/SKILL.md`, `skills/pb-verify/SKILL.md`, `skills/pb-plan/SKILL.md`, `skills/pb-finish/SKILL.md`
6. [x] Dogfood: plumbbob's own gate through checkride, knip → fallow — **done
   when:** `.plumbbob/settings.json` drops `"check"`; knip (devDep, `knip.json`,
   `check:knip` script) is gone and fallow (devDep + `fallow.toml`) fills the
   `dead` slot (D9); the `check` script becomes the `checkride` alias with the
   per-tool `check:*` scripts retired where checkride covers them; unit tests
   run through the `test` slot normally (D10); `plumbbob check` on this repo is
   green end-to-end
   - seam: `package.json`, `pnpm-lock.yaml`, `.plumbbob/settings.json`, `knip.json`, `fallow.toml`, `checkride.config.json`

## Open questions

*(none — Rob approved steps 0–8 of the chat plan verbatim, plus the two
directives folded in as D9/D10.)*

## Verdicts

- 2026-07-02 — spawn vs import → **import** ("it is my own package… no point
  reinventing the wheel") → D1, D2.
- 2026-07-02 — checkride on npm? → **yes**, `checkride@0.1.6`
  (npmjs.com/package/checkride); the "publish first" step dissolves.
- 2026-07-02 — where do plumbbob's own unit tests run? → **from checkride
  normally** (the `test` slot) → D10.
- 2026-07-02 — dead-code adapter → **deprecate knip in favour of fallow** → D9.
