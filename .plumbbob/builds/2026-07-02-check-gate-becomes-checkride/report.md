# Report — check gate becomes checkride

**Size:** medium · **Result:** done (6/6 steps, all green + checkpointed)

Prompted by Rob's call (2026-07-02): checkride is his own package, plumbbob was
hand-crafting most of what it provides, and the zero-dep stance had hardened
into dogma — "there should not be a 'never ever use any package ever'; it
should be 'use a few packages as necessary'."

## What shipped

1. **Dependency doctrine + the dependency** — `checkride@0.1.6` (pinned exact)
   is plumbbob's first `dependencies` entry. C2 amended from "zero runtime
   dependencies" to "node builtins plus a few deliberate dependencies", with
   the ast-grep rule gaining an explicit allowlist so the doctrine stays
   machine-enforced. D32 records the design.
2. **The programmatic gate + async ripple** — `runCheck` routes per D24/D32: a
   `check` setting spawns exactly as before (the D14 stubs and non-checkride
   repos untouched); no setting means `runChecks` in-process. Red runs name the
   failing slots with their `.check/` raw-output pointers; a thrown harness
   (malformed `checkride.config.json`) maps to exit 2 and reports as a broken
   gate, not broken code; an all-slots-skipped run refuses instead of passing
   vacuously (including the links-only case — the built-in links slot alone
   proves nothing). `.check/` joined the exclude patterns so checkpoints never
   sweep raw tool output. `check`/`checkpoint`/`doctor` went async through the
   Promise-typed dispatch seam.
3. **Flag passthrough** — `plumbbob check --bail --changed --all --only a,b
   --skip a,b --include a,b` maps onto checkride's RunFlags; the spawn override
   warns-and-ignores them; checkpoint's gate stays full-fat.
4. **`start` + `doctor`** — `start` seeds `{ "auto": false }` (absence of
   `check` IS the checkride default) and drops the old no-check-script warning;
   `doctor` grew a check-gate section that names a configured override or
   prints checkride's slot/adapter table via `runDoctor`.
5. **Docs + skills** — D24 amended; cli-reference (flags, `.check/` contract,
   exit 2), troubleshooting (nothing-to-check, gate-itself-broke), README
   updated; pb-verify now reads `.check/summary.json` → failing slot's raw
   JSON on red; pb-build adds the narrowed iteration loop.
6. **Dogfood** — this repo's gate is checkride end-to-end: `settings.json`
   dropped `check`; knip retired for fallow (D9); markdownlint-cli → cli2;
   vitest runs with coverage through the test slot (D10); the six `check:*`
   scripts collapsed into `"check": "checkride"`. Steps 6's own checkpoint
   gated through the programmatic path — the refactor proved itself in the act
   of landing.

## Decisions and why

- **Import, don't spawn (D1/D32)** — Rob owns both packages; the typed
  `Summary` comes back in-process; reinventing the wheel against a sibling
  tool is waste. Pinned exact: pre-1.0 churn across two repos is
  bump-them-together discipline.
- **The `check` setting survives as the override (D3)** — non-checkride repos
  still gate through any command, and the D14 fixture stubs keep working
  untouched.
- **Vacuous green is a refusal (D4)** — zero-config checkride skips unseen
  slots; a repo it can't see must not green-light checkpoints.
- **knip → fallow (D9), tests through the slot (D10)** — Rob's calls, folded
  in from the approval message.

## Follow-ups (parked, not promised)

- A `plumbbob fix` verb riding checkride's `runFix` (oxlint --fix, fallow fix).
- cspell for the spell slot; mutation/security opt-ins for this repo's gate.
- checkride's `--changed` flag assumes `origin/main` — worth a checkride-side
  setting someday.

## Checkpoints

## Checkpoints

- baseline bbe5cbe12dbe18446d24533f1eb879e43db01f61
- plan 4cd319f37bd933d4ee8bad42d306364117899eda
- step 1 c0ce809f4e155518bcc22082eb3f3b5bfff48faf
- step 2 8a93c6e9c9e29c88a4db50f2600f44e0a640536c
- step 3 716b18e496787e25e3e19f6ccf10a405a89fec61
- step 4 f3e73ab0877faa30578e3a1cb3a7f794e2d52f1a
- step 5 b4250a928a18ab0333f208c91c544e41557c658a
- step 6 9514f532b572dd0427489f8970c42f4e43a74b34
