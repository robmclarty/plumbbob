<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.
-->

# The approval latch — guidance on the work, a latch on the record

**Phase** (bookkeeping while framing): plan authored — six steps carried from the spec; awaiting review at the plan pause
**Size:** medium

*Source: `research/06-approval-latch.md` (2026-07-09) — tracked in this repo;
distilled here so the build stands alone, with the full spec pointer retained under
## Source. The spec is the authority; this doc carries the mechanics an agent needs
to build without re-reading it.*

## Frame

- **Problem:** the approval boundary is the one thing the product is named after,
  yet today it is prose-only. v1's mechanical enforcement was removed (`94c8056`)
  because it gated the **work plane** — every edit, mid-step — where a denial fires
  mid-thought, false positives block legitimate work, and the model has no legal
  move left. That removal was right about the work plane and overcorrected on the
  **ledger plane**. The checkpoint commit is a single, rare action at a natural turn
  boundary, fired only when the step is done, the check is green, and the self-review
  is written. A denial there cannot wedge the work — the work is finished; **the
  denial *is* the pause.** PlumbBob already enforces at verb boundaries without anyone
  minding (`checkpoint` refuses red, `start` refuses dirty, C6 holds human-as-clock
  by construction). This build extends that verb-boundary family to the checkpoint.
- **Smallest thing that solves it:** a turn ledger the model doesn't write
  (`.plumbbob/TURN`, ticked by a `UserPromptSubmit` hook running a new `plumbbob turn`
  verb), a per-build stamp (`builds/<slug>/TICK`) written at step entry, and a small
  six-row predicate in `checkpoint` that refuses to land a step when no human turn has
  occurred since entry — with the refusal message *itself* being the pause affordance.
  Grants (`auto` | `range M`) are minted only from strings the human literally typed
  (`/pb-build --auto`, a `N-M` range), because `pb-build` is `disable-model-invocation`.
  A PreToolUse hook turns a model-issued `git commit` mid-step into a permission
  *question*, never a wall. ~150 lines; no rebuild, no new dependency.
- **Done looks like:** the six-row latch matrix is covered by deterministic subprocess
  tests in the default vitest run (no model, no cost); a refused checkpoint prints
  exit 1 with the affordance message; a human turn between entry and checkpoint
  allows the land; `--auto` / a typed range grant self-approval for one turn; a
  host with no hooks grows no ledger and behaves exactly as today (latch dormant);
  `status` surfaces out-of-band commits and `doctor` reports latch health; the skills,
  decisions log, README skeptic stub, and `plugin.json` tagline name the latch; the
  D13 `no-session-detection.yml` tripwire stays green; `pnpm run check` green.
- **Explicitly NOT doing:** no work-plane enforcement (no muzzle, no seam-guard, no
  bash write-patterns — D10/D13 and the seam-as-awareness stay exactly as they are);
  no latch on the hand-built `/pb-verify` path (a diff with no `build <n>` entry has
  no stamp and stays guidance-governed — a future `VERIFIED` tick could close this
  after the executor path proves out); no fascicle engine and no headless/suspend-
  resume harness (research 03 stays declined; fascicle is only the eval *driver* in
  plan 05); no thirteenth skill and no new user-facing verb (`turn` is machinery; the
  surface freeze holds); no `CLAUDECODE` sniffing; no version/CHANGELOG bump.

## Architecture sketch

```
  WORK PLANE — untouched (guidance only)         LEDGER PLANE — latched
  every edit, mid-step, D10/D13                  the checkpoint commit: rare, at a turn boundary
  awareness, never a lock                        D64: the tick is latched to a human turn
        │  no muzzle / seam-guard / bash lock            │
        ▼                                                ▼
   the model works freely                        plumbbob checkpoint  (latch runs BEFORE the check gate)
                                                   1. stdin.isTTY?          → allow  (a human at the keyboard)
   THE TURN LEDGER — the model doesn't write       2. TURN or TICK absent?  → allow  (dormant / hand-built)
   UserPromptSubmit hook ─► `plumbbob turn`        3. settings auto:true?   → allow  (standing personal grant, D27)
     .plumbbob/TURN   ++ on every human prompt     4. GRANT auto            → allow
     .plumbbob/GRANT  minted from literal prompt      GRANT range M: step≤M → allow · step>M → refuse (ceiling)
   entry stamps builds/<slug>/TICK = TURN          5. TURN > TICK?          → allow  (a human turn intervened)
     (start, build <n>); checkpoint clears it      6. else                  → REFUSE, exit 1  ── the pause
                                                                                    │
   a model-issued `git commit` mid-step ──► PreToolUse hook ──► permissionDecision "ask" (never deny)
                                                                                    ▼
                                              present the diff + self-review, end the turn;
                                              the human's next message is the tick.
```

## Mechanics

*(Distilled from the spec's Mechanics section, verbatim where it is load-bearing.)*

### Control files (flat, D4; excluded via `info/exclude`, D33)

| File | Plane | Written by | Content |
|---|---|---|---|
| `.plumbbob/TURN` | worktree control | `plumbbob turn` **only** | bare monotonic integer |
| `.plumbbob/GRANT` | worktree control | `plumbbob turn` **only** | `auto` \| `range <M>`, or absent |
| `.plumbbob/builds/<slug>/TICK` | per-build control | `start`, `build <n>`; cleared by `checkpoint` | the `TURN` value at entry |

- `GRANT` is rewritten on **every** tick — minted when the prompt matches, cleared
  otherwise — so its lifetime is **one turn by construction**.
- `TICK` is stamped **only when `TURN` exists**: a host with no hooks never grows a
  ledger, and the latch stays dormant there rather than wedging.
- **Known seam (documented, accepted):** the very first `/pb-plan` of a session runs
  `start` before the hook has ever ticked, so that one plan commit stays
  guidance-governed.

### `plumbbob turn` (new verb — hook machinery)

Reads the `UserPromptSubmit` JSON on stdin, extracts `prompt`. No `.plumbbob/`
session above cwd ⇒ **silent no-op**. Otherwise: increment `TURN` (create at 1), then
rewrite `GRANT` from the raw prompt:

- a `/pb-build`-shaped invocation (`/pb-build`, `/plumbbob:pb-build`) carrying
  `--auto` mints `auto`;
- one carrying a `\d+-\d+` range token mints `range <M>` (the ceiling `M` rides in
  the grant);
- **a range beats `--auto`** when both appear (bounded wins);
- no match **clears** `GRANT`.

**Always exits 0** — a broken hook must never wedge prompting (the D27
malformed-contributes-nothing philosophy). Listed in `plumbbob --help` on one line,
marked as hook machinery. Grants are minted only because the human typed them:
`pb-build` is `disable-model-invocation: true`, so natural-language pressure cannot
mint a grant — the model's only move is to ask the human to re-fire with the flag by
name, which is verbatim what the prose already demands.

### The latch (in `checkpoint`, **before** the check gate; step and `--plan` alike)

Evaluate in order; **first hit wins**:

1. `process.stdin.isTTY === true` → **allow.** A human at the keyboard is their own
   approval (the same plumbing `bodyArg` already uses).
2. `TURN` or `TICK` absent → **allow.** Ledger dormant (no hooks) or no stamped entry
   (hand-built diff, no `build <n>`) — guidance governs, exactly as today.
3. Settings-ladder `auto` is `true` (D27) → **allow.** The standing personal grant,
   visible in `status`.
4. `GRANT auto` → **allow.** `GRANT range M`: step ≤ M → **allow**; step > M →
   **refuse** with the top-of-range affordance ("the range you granted ends at step
   M — pause here; re-fire to continue").
5. `TURN > TICK` → **allow.** A human turn intervened since entry.
6. Otherwise → **refuse, exit 1** with the message below.

The latch precedes `runCheck` (cheap first; the gate already ran in the verify tick).
`--auto` chains work unchanged: each `build <n>` re-stamps `TICK`, the `auto`/`range`
grant covers every checkpoint that turn, and red still refuses at the gate.
`checkpoint --plan` uses the `TICK` that `start` stamped.

### The refusal message (exact)

```
plumbbob: checkpoint refused — no human turn since this step began. This is the
pause: present the diff and the self-review, then end the turn; the human's next
message is the tick. (An explicit `/pb-build --auto` or a step range in the human's
own prompt grants self-approval; `auto: true` in settings.local.json is the standing
grant.)
```

### The git-commit ask-hook (PreToolUse on Bash)

When the active build has a step in flight (its `STEP` exists) **and** the command
matches a `git … commit` invocation, emit:

```json
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": "plumbbob: a step is in flight — checkpoint owns the landing. Approve only if you asked for this commit."}}
```

Never `deny` — the human decides; C5 stays intact. `plumbbob checkpoint`'s own
internal `git commit` spawn never passes through hooks, so nothing self-trips. Root
discovery mirrors `post-edit.sh` (the `activeBuild` cursor).

### Receipts

- **`status`/`orient`:** when `git rev-list <last-checkpoint-sha>..HEAD --count` is
  positive, one neutral line — *"N commit(s) since the last checkpoint landed outside
  plumbbob's ledger."* Informational; the human's own commits are legitimate (repo D3
  already records a clean-tree HEAD as the checkpoint).
- **`doctor`:** a latch probe — *"latch: live (turn 42)"* or *"latch: dormant —
  guidance only (turn ledger absent; is the UserPromptSubmit hook wired?)"*, covering
  both marketplace (`hooks/hooks.json`) and `init`-style installs.

## Decisions

*(Provisional numbers D64–D66; confirmed at land time. They cite existing repo
decisions — D3 clean-tree HEAD, D10 work-plane guidance, D13 no-session-detection,
D27 the `auto` settings key, D33 `info/exclude`, C5 the human commits freely.)*

- **D64 — The approval latch: ledger-plane enforcement.** The pause stays a pause and
  nothing blocks an edit (D10/D13 intact); the checkpoint *tick* is latched to the
  harness's record of a human turn — *because* the two boundaries live on different
  planes: guidance on the work plane, a latch on the record. **Amends D10's scope**
  and joins the existing verb-boundary family (refuse-red, refuse-dirty,
  C6-by-construction).
- **D65 — Grants come from the human's literal prompt.** One-turn lifetime by
  construction; scoped `auto` | `range M`; minted only from strings the model cannot
  type (`disable-model-invocation`) — *because* a grant the model can forge is no
  grant. The D27 `auto` key remains the standing personal grant; a typed range beats
  `--auto` (bounded wins).
- **D66 — Out-of-band commits are surfaced, never blocked.** The human commits freely
  (repo D3, C5); the model's raw commit becomes a permission *question*, and the
  ledger reconciliation line is neutral either way — *because* prevention where it's
  free, detection where it isn't; the latch is a ratchet against completion-drive,
  not a cage against a forger (every forge is loud — transcript, `status`, eval tier).

## Constraints

- **C1:** functional/procedural, **named exports** only — no classes (repo C1).
- **C2:** node builtins + checkride only — **this build adds NO new dependencies**
  (repo C2).
- **C3:** hooks **always exit 0** and never wedge prompting — a broken `turn` or
  ask-hook must never block the human from typing (the D27 malformed-contributes-
  nothing philosophy).
- **C4:** the latch **precedes the check gate** in `checkpoint` — cheap predicate
  first; the gate already ran in the verify tick.
- **C5:** **no session detection** — the latch reads `TURN`/`TICK`/`GRANT`/`isTTY`
  only, never sniffs the host; the D13 `no-session-detection.yml` (no-`CLAUDECODE`)
  tripwire stays green.
- **C6:** the **work plane stays untouched** — no edit-blocking of any kind (no
  muzzle, no seam-guard, no bash write-pattern); the seam remains awareness, not a
  lock (D10/D13 intact).
- **C7:** no version/CHANGELOG bump in this build (Rob cuts releases via `/version`).

## Steps

*(Carried from the spec's Steps section as-is — same order, same seams. The `model:`
sub-lines are advisory metadata for the human before each `/pb-build`, never a gate;
strike any you disagree with.)*

1. [x] The turn ledger — **done when:** `plumbbob turn` ticks `TURN` and
   mints/clears `GRANT` from hook JSON on stdin; no session ⇒ no-op; malformed input
   ⇒ exit 0; grant parsing covers `--auto`, ranges, range-beats-auto, the namespaced
   skill form; `hooks/hooks.json` registers `UserPromptSubmit`; the verb appears in
   help as machinery.
   - seam: `src/verbs/turn.ts` (new), `src/lib/sidecar.ts`, `src/cli-core.ts`, `hooks/hooks.json`, `src/verbs/__tests__/turn.test.ts` (new)
   - model: sonnet — mechanical stdin/regex work, fully enumerated by the done-when
2. [x] Stamp at entry — **done when:** `build <n>` and `start` write `TICK` =
   current `TURN` when `TURN` exists (and skip when it doesn't); `checkpoint` clears
   `TICK` alongside `STEP`/`SEAM`/handoff; sidecar grows `turnPath`/`grantPath`/
   `tickPath` helpers.
   - seam: `src/verbs/build.ts`, `src/verbs/start.ts`, `src/verbs/checkpoint.ts`, `src/lib/sidecar.ts`, existing verb tests
   - model: sonnet — rote wiring across existing verbs
3. [x] The latch — **done when:** the six-row matrix above is implemented (one
   small predicate, unit-testable) and subprocess-tested per row in fixture repos
   (write `TURN`/`TICK`/`GRANT` directly); refusal is exit 1 with the affordance
   message; range ceiling refuses past M; `--plan` latches on the `start` stamp; the
   latch precedes the check gate. **This makes plan 05's eval contracts 1, 2, 4, and
   7's mechanical half deterministic vitest territory — no model, no cost.**
   - seam: `src/lib/latch.ts` (new), `src/verbs/checkpoint.ts`, `src/verbs/__tests__/checkpoint.test.ts`, `src/lib/__tests__/latch.test.ts` (new)
   - model: opus — the load-bearing predicate; its correctness is the whole product
4. [x] The git-commit ask-hook — **done when:** a `git commit` command with a
   step in flight yields the `ask` JSON with the checkpoint-owns-the-landing reason;
   no step in flight, non-commit git, and no-session repos all pass silently; sh-level
   tests drive the hook with JSON stdin fixtures.
   - seam: `hooks/pre-bash-commit.sh` (new), `hooks/hooks.json`, `test/hooks.test.ts`
   - model: sonnet — a small hook script, fully specified by the done-when
5. [x] Receipts — **done when:** `status` prints the out-of-band-commits line
   only when the count is positive; `doctor` reports latch live/dormant with the
   wiring hint for both install kinds.
   - seam: `src/lib/orient.ts`, `src/verbs/status.ts`, `src/verbs/doctor.ts`, matching tests
   - model: sonnet — mechanical surface additions
6. [ ] Prose and docs — **done when:** `pb-build`/`pb-plan`/`pb-verify` name the
   latch (a refused checkpoint is the pause — present and end the turn; never route
   around it with a raw `git commit`); contract tests pin the new load-bearing
   sentences; `decisions.md` gains D64–D66 (above) and D10 gets a scope note;
   `plugin.json`'s description becomes "guidance on the work, a latch on the record";
   happy-path gets one paragraph; the README skeptic section gets its answer stub
   pointing at the before/after eval report.
   - seam: `skills/pb-build/SKILL.md`, `skills/pb-plan/SKILL.md`, `skills/pb-verify/SKILL.md`, `docs/decisions.md`, `docs/happy-path.md`, `README.md`, `.claude-plugin/plugin.json`, `test/contract/skills.test.ts`
   - model: opus — load-bearing contract prose the skills tests pin

## Open questions

*(none — the spec resolved the mechanics. Sequencing note: plan 05's eval harness
lands first and takes a baseline sweep of the prose-only build; this lands; re-sweep.
The before/after delta is the receipt — it is a plan-05 concern, not a step here.)*

## Source

Distilled from `research/06-approval-latch.md` (2026-07-09, tracked in this repo),
which carries the full argument (the two-planes rationale, the threat model —
drift-not-adversary, the exit criteria, and the README skeptic answer). Companions:
`research/05-review-hardening-plan.md` (the eval tier that measures this before and
after — land its harness first, baseline, then re-sweep) and `docs/decisions.md`
(D10/D13 — the work-plane guidance this build does *not* touch).
