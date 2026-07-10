# PlumbBob upgrades — Spec 6: the approval latch

> Question: should the approval boundary be mechanically enforced, or is skill
> prose good enough? The v1 enforcement was removed because it wedged the model
> mid-turn (`94c8056` — the pre-edit muzzle, seam-guard, and bash-guard). Can we
> have enforcement *and* no wedge?
>
> Answer: yes, because the two live on different planes. The old locks gated the
> **work plane** (every edit, mid-step), where a denial fires mid-thought, false
> positives block legitimate work (`55dd7bb`, `43e696f`), and the model has no
> legal move left. The approval boundary lives on the **ledger plane** (the
> checkpoint commit) — a single, rare action at a natural turn boundary, fired
> only when the step is done, the check is green, and the self-review is written.
> A denial there cannot wedge the work, because the work is finished; the denial
> *is* the pause. PlumbBob already enforces at verb boundaries without anyone
> minding — `checkpoint` refuses red, `start` refuses dirty, C6 holds
> human-as-clock at the agent envelope *by construction*. The enforce→guide pivot
> was right about the work plane and overcorrected on the ledger plane. This spec
> extends the existing verb-boundary family to the one boundary the product is
> named after: **guidance on the work, a latch on the record.**
>
> Date: 2026-07-09. Companions: [`05-review-hardening-plan.md`](./05-review-hardening-plan.md)
> (the eval tier that measures this before and after), `docs/decisions.md`
> (D10/D13 — the work-plane guidance this spec does *not* touch).
> Sequencing: land plan 05's eval harness first and take a **baseline sweep** of
> the prose-only build; land this; re-sweep. The delta is the receipt.

## The recommendation in one screen

1. **A turn ledger the model doesn't write.** A `UserPromptSubmit` hook runs
   `plumbbob turn`, which ticks a monotonic counter (`.plumbbob/TURN`) — the
   harness's own record that the human spoke.
2. **The latch.** `start` and `build <n>` stamp the tick at entry
   (`builds/<slug>/TICK`); `checkpoint` refuses when no human turn has occurred
   since — and the refusal message *is the pause affordance*: present the diff,
   end the turn; the human's next message is the tick.
3. **Grants come from the human's literal words.** The same hook greps the raw
   prompt for `/pb-build --auto` or a range `N-M` and mints a one-turn, scoped
   grant (`auto`, or `range M` — the ceiling rides in the grant). `pb-build` is
   `disable-model-invocation: true`, so those strings exist only because the
   human typed them. Natural-language pressure cannot mint a grant; the model's
   only move is to ask the human to re-fire with the flag by name — which is
   verbatim what the prose already demands.
4. **Routing-around becomes a question, not a wall.** A PreToolUse hook turns a
   model-issued `git commit` while a step is in flight into a
   `permissionDecision: "ask"` — the human clicking yes *is* the approval. The
   human's own terminal commits never pass through hooks and stay untouched.
5. **Receipts, degradation, honesty.** `status` surfaces commits that landed
   outside the ledger (never blocks — the human commits freely, D3/C5);
   `doctor` reports latch health; no ledger ⇒ the latch is dormant and today's
   guidance-only behavior holds (non-Claude hosts, pure-CLI users, a human at a
   TTY). No `CLAUDECODE` sniffing — the D13 tripwire stays green.

## Threat model — drift, not adversary

The latch is a ratchet against the model's completion-drive (the actual reason
prose pauses erode), not a cage against a determined forger. A model with
filesystem access can always write `TURN` itself or bypass the CLI — but every
forge is *loud*: the write is in the transcript, the out-of-band commit shows in
`status`, and the eval tier (plan 05, contract 2) exists to catch exactly this.
Prevention where it's free, detection where it isn't, measurement over both.

## Mechanics

### Files (flat, D4; excluded via `info/exclude`, D33)

| File | Plane | Written by | Content |
|---|---|---|---|
| `.plumbbob/TURN` | worktree control | `plumbbob turn` only | bare monotonic integer |
| `.plumbbob/GRANT` | worktree control | `plumbbob turn` only | `auto` \| `range <M>`, or absent |
| `.plumbbob/builds/<slug>/TICK` | per-build control | `start`, `build <n>`; cleared by `checkpoint` | the TURN value at entry |

`GRANT` is rewritten on every tick — minted when the prompt matches, cleared
otherwise — so its lifetime is one turn *by construction*. `TICK` is stamped
**only when `TURN` exists**: a host with no hooks never grows a ledger, and the
latch stays dormant there rather than wedging. (Known seam: the very first
`/pb-plan` of a session runs `start` before the hook has ever ticked, so that
one plan commit stays guidance-governed. Documented, accepted.)

### `plumbbob turn` (new verb — hook machinery)

Reads the `UserPromptSubmit` JSON on stdin, extracts `prompt`. No `.plumbbob/`
session above cwd ⇒ silent no-op. Otherwise: increment `TURN` (create at 1),
then rewrite `GRANT`: a `/pb-build`-shaped invocation (`/pb-build`,
`/plumbbob:pb-build`) carrying `--auto` mints `auto`; one carrying a `\d+-\d+`
range token mints `range <M>`; a range beats `--auto` when both appear (bounded
wins); no match clears. **Always exits 0** — a broken hook must never wedge
prompting (the D27 malformed-contributes-nothing philosophy). Listed in
`plumbbob --help` on one line, marked as hook machinery.

### The latch (in `checkpoint`, before the check gate; step and `--plan` alike)

Evaluate in order; first hit wins:

1. `process.stdin.isTTY === true` → **allow.** A human at the keyboard is their
   own approval (the same plumbing `bodyArg` already uses).
2. `TURN` or `TICK` absent → **allow.** Ledger dormant (no hooks) or no stamped
   entry (hand-built diff, no `build <n>`) — guidance governs, exactly today.
3. Settings-ladder `auto` is `true` (D27) → **allow.** The standing personal
   grant, visible in `status`.
4. `GRANT auto` → **allow.** `GRANT range M`: step ≤ M → **allow**; step > M →
   **refuse** with the top-of-range affordance ("the range you granted ends at
   step M — pause here; re-fire to continue").
5. `TURN > TICK` → **allow.** A human turn intervened since entry.
6. Otherwise → **refuse**, exit 1:
   > plumbbob: checkpoint refused — no human turn since this step began. This
   > is the pause: present the diff and the self-review, then end the turn; the
   > human's next message is the tick. (An explicit `/pb-build --auto` or a
   > step range in the human's own prompt grants self-approval; `auto: true`
   > in settings.local.json is the standing grant.)

The latch precedes `runCheck` (cheap first; the gate already ran in the verify
tick). `--auto` chains work unchanged: each `build <n>` re-stamps `TICK`, the
`auto`/`range` grant covers every checkpoint that turn, and red still refuses
at the gate. `checkpoint --plan` uses the `TICK` that `start` stamped.

### The git-commit ask-hook (PreToolUse on Bash)

When the active build has a step in flight (its `STEP` exists) and the command
matches a `git … commit` invocation, emit
`{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision":
"ask", "permissionDecisionReason": "plumbbob: a step is in flight — checkpoint
owns the landing. Approve only if you asked for this commit."}}`. Never `deny`
— the human decides; C5 stays intact. `plumbbob checkpoint`'s own internal
`git commit` spawn never passes through hooks, so nothing self-trips. Root
discovery mirrors `post-edit.sh` (the `activeBuild` cursor).

### Receipts

- **`status`/`orient`:** when `git rev-list <last-checkpoint-sha>..HEAD --count`
  is positive, one neutral line — *"N commit(s) since the last checkpoint landed
  outside plumbbob's ledger."* Informational; the human's own commits are
  legitimate (D3 already records a clean-tree HEAD as the checkpoint).
- **`doctor`:** a latch probe — *"latch: live (turn 42)"* or *"latch: dormant —
  guidance only (turn ledger absent; is the UserPromptSubmit hook wired?)"*,
  covering both marketplace (`hooks/hooks.json`) and `init`-style installs.

## Steps

1. **[ ] The turn ledger.** — done when: `plumbbob turn` ticks `TURN` and
   mints/clears `GRANT` from hook JSON on stdin; no session ⇒ no-op; malformed
   input ⇒ exit 0; grant parsing covers `--auto`, ranges, range-beats-auto, the
   namespaced skill form; `hooks/hooks.json` registers `UserPromptSubmit`; the
   verb appears in help as machinery.
   - seam: `src/verbs/turn.ts` (new), `src/lib/sidecar.ts`, `src/cli-core.ts`,
     `hooks/hooks.json`, `src/verbs/__tests__/turn.test.ts` (new)
2. **[ ] Stamp at entry.** — done when: `build <n>` and `start` write `TICK` =
   current `TURN` when `TURN` exists (and skip when it doesn't); `checkpoint`
   clears `TICK` alongside `STEP`/`SEAM`/handoff; sidecar grows
   `turnPath`/`grantPath`/`tickPath` helpers.
   - seam: `src/verbs/build.ts`, `src/verbs/start.ts`, `src/verbs/checkpoint.ts`,
     `src/lib/sidecar.ts`, existing verb tests
3. **[ ] The latch.** — done when: the six-row matrix above is implemented (one
   small predicate, unit-testable) and subprocess-tested per row in fixture
   repos (write `TURN`/`TICK`/`GRANT` directly); refusal is exit 1 with the
   affordance message; range ceiling refuses past M; `--plan` latches on the
   `start` stamp; the latch precedes the check gate. **This makes plan 05's
   eval contracts 1, 2, 4, and 7's mechanical half deterministic vitest
   territory — no model, no cost.**
   - seam: `src/lib/latch.ts` (new), `src/verbs/checkpoint.ts`,
     `src/verbs/__tests__/checkpoint.test.ts`, `src/lib/__tests__/latch.test.ts` (new)
4. **[ ] The git-commit ask-hook.** — done when: a `git commit` command with a
   step in flight yields the `ask` JSON with the checkpoint-owns-the-landing
   reason; no step in flight, non-commit git, and no-session repos all pass
   silently; sh-level tests drive the hook with JSON stdin fixtures.
   - seam: `hooks/pre-bash-commit.sh` (new), `hooks/hooks.json`,
     `test/hooks.test.ts`
5. **[ ] Receipts.** — done when: `status` prints the out-of-band-commits line
   only when the count is positive; `doctor` reports latch live/dormant with
   the wiring hint for both install kinds.
   - seam: `src/lib/orient.ts`, `src/verbs/status.ts`, `src/verbs/doctor.ts`,
     matching tests
6. **[ ] Prose and docs.** — done when: `pb-build`/`pb-plan`/`pb-verify` name
   the latch (a refused checkpoint is the pause — present and end the turn;
   never route around it with a raw `git commit`); contract tests pin the new
   load-bearing sentences; `decisions.md` gains D64–D66 (below) and D10 gets a
   scope note; `plugin.json`'s description becomes "guidance on the work, a
   latch on the record"; happy-path gets one paragraph; the README skeptic
   section gets its answer stub pointing at the before/after eval report.
   - seam: `skills/pb-build/SKILL.md`, `skills/pb-plan/SKILL.md`,
     `skills/pb-verify/SKILL.md`, `docs/decisions.md`, `docs/happy-path.md`,
     `README.md`, `.claude-plugin/plugin.json`, `test/contract/skills.test.ts`

## Decisions to record (final numbering at land time)

- **D64 — The approval latch: ledger-plane enforcement.** The pause stays a
  pause and nothing blocks an edit (D10/D13 intact); the checkpoint *tick* is
  latched to the harness's record of a human turn. Amends D10's scope:
  guidance on the work plane, a latch on the record. Joins the existing
  verb-boundary family (refuse-red, refuse-dirty, C6-by-construction).
- **D65 — Grants come from the human's literal prompt.** One-turn lifetime by
  construction; scoped `auto` | `range M`; minted only from strings the model
  cannot type (`disable-model-invocation`). The D27 `auto` key remains the
  standing personal grant.
- **D66 — Out-of-band commits are surfaced, never blocked.** The human commits
  freely (D3, C5); the model's raw commit becomes a permission question, and
  the ledger reconciliation line is neutral either way.

## What this spec deliberately does not do

- **No work-plane enforcement.** No muzzle, no seam-guard, no bash write
  patterns — D13 and its `no-session-detection.yml` tripwire stay exactly as
  they are. The seam remains awareness, not a lock.
- **No latch on the hand-built path.** A diff with no `build <n>` entry has no
  stamp and stays guidance-governed; a future `VERIFIED` tick from `pb-verify`
  could close this, but only after the executor path proves out.
- **No fascicle engine, no headless mode.** Research 03 stays declined; a
  suspend/resume harness would enforce the pause structurally but costs a
  rebuild — the latch buys the same invariant for ~150 lines. Fascicle's role
  here is the eval *driver* (plan 05, item 1), nothing more.
- **No thirteenth skill, no new user-facing verb.** `turn` is machinery; the
  surface freeze (plan 05, item 4) holds.

## Exit criteria

- The latch matrix is fully covered by deterministic subprocess tests in the
  default vitest run — the flagship contract's test costs nothing and runs on
  every commit.
- Plan 05's eval report shows the before/after: prose-only baseline vs. latched
  pass rates per contract, model and date stamped. Contracts 5 and 6 (park
  judgment, verify-never-builds) remain the honest prose-governed numbers —
  they are where guidance is genuinely the right tool.
- The README skeptic answer for "prove the model actually pauses" links the
  report and states the mechanism in one sentence: *the pause is latched to the
  harness's own record of your turns — we don't ask the model nicely.*
