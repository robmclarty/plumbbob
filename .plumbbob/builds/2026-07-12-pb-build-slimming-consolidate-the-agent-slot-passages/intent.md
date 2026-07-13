# pb-build slimming: consolidate the agent-slot passages

**Phase:** DESIGN — plan pending
**Size:** small

*Source: research/07-remaining-hardening-builds.md § 3b (plan 05 item 4), deferred from
the 2026-07-12 reviewer build's close-out.*

## Frame

- **Problem:** `skills/pb-build/SKILL.md` interleaves roughly 30 lines of **agent-slot
  mechanics** through the default-path steps 3–5 — the `before` slot (`:41-46`), the
  `build` slot (`:52-55`), the `when`-prose mid-build cue (`:56-61`), status routing for a
  non-`done` envelope (`:62-67`), and the `after` slot (`:72-76`). The overwhelming majority
  of builds bind **no** agents, so most readers wade through machinery that never applies to
  them; the default path — the 99% case — reads far heavier than it is.
- **Smallest thing that solves it:** lift those five passages into **one** fenced
  `## Running bound agents` section, entered only when `plumbbob status` shows a
  `harness bindings:` block, and leave a single conditional pointer line in each affected
  default-path step. Same contracts, same words — **relocated, not rewritten**.
- **Done looks like:** the default path (steps 1–5) carries no slot mechanics, just a
  pointer; the new section holds all five passages intact; `--auto` and the hard-contracts
  reference it; a contract-test pin proves the default path is slim *and* the section
  exists; every existing `build`-block pin stays green; `pnpm check` passes.
- **Explicitly NOT doing:** **no contract changes** (before/build/after semantics, status
  routing, the latch, `--auto`, and ranges are byte-for-byte identical in meaning); **no CLI
  or `src/` change** (the `harness bindings:` status trigger already exists and is tested);
  **no touching the other 11 skills**; **no re-wording** the passages' substance beyond what
  relocation forces; **not editing the installed plugin-cache copy** (repo source only — it
  ships on the next release).

## Architecture sketch

```
BEFORE — default path carries the machinery inline
  ## What this skill does, in order
    3. Read the plan
       └─ • before-slot bullet ........... agent mechanics
    4. Implement
       ├─ • build-slot bullet ............ agent mechanics
       ├─ • when-prose bullet ............ agent mechanics
       └─ • status-routing bullet ........ agent mechanics
    5. Verify → pause
       └─ (after-slot passage inline) .... agent mechanics
  ## --auto   ## step range   ## hard contracts

AFTER — default path is slim; the machinery lives in one gated section
  ## What this skill does, in order
    3. Read the plan            → pointer: "if status shows `harness bindings:`, see §"
    4. Implement                → pointer (one line)
    5. Verify → pause           → pointer (one line)
  ## Running bound agents   ← NEW; entered only when status shows harness bindings
       before · build · when-prose · status-routing · after   (all five, verbatim)
  ## --auto (references §)   ## step range   ## hard contracts (references §)

trigger already exists: status.ts harnessSection() → [] when no harness.json,
so `harness bindings:` prints only when a harness is bound (pinned in status.test.ts).
```

## Decisions

- D1: **One `## Running bound agents` section**, not a separate file or five per-slot
  sections — *because* the five passages are one topic ("what changes when a harness binds
  agents") and a reader needs all of it or none; one section behind one trigger is the whole
  move (research/07 §3b).
- D2: **The entry trigger is the `harness bindings:` block** in the injected
  `plumbbob status` — *because* that block already prints only when a `harness.json` exists
  (`status.ts` `harnessSection` returns `[]` otherwise; the negative is pinned by
  `status.test.ts`), so it is a zero-cost, already-tested visible cue — no new signal is
  invented.
- D3: **Each affected default-path step keeps exactly one conditional pointer line** ("if
  `plumbbob status` shows `harness bindings:`, see § Running bound agents") — *because* the
  default path must stay complete and readable on its own for the no-agent 99% case, while
  the 1% gets a single hop to the details.
- D4: **Preserve every contract verbatim in substance** — `before` = context-in,
  `build` = delegate the diff, `when`-prose = fire mid-build on judgment, status routing
  (`blocked` → unblock/re-run, `drift` → `/pb-refine`, non-zero exit → stop), `after` =
  advisory, never gates — *because* 3b is a relocation, not a redesign; the surrounding
  contract tests and the c1–c7 evals must stay green untouched.
- D5: **Lock the new layout with one added contract-test pin** (the default-path region
  embeds no slot mechanics *and* the `## Running bound agents` section exists), alongside the
  unchanged existing `build`-block pins — *because* the existing pins check concepts by mere
  presence *anywhere* in the body, so only a location-aware pin actually guards the slimming
  from silently regressing.

## Constraints

- C1: **No contract changes** — slot semantics, status routing, the latch, `--auto`, and
  ranges mean exactly what they mean today; only the layout moves.
- C2: **No CLI/`src/` change** — skill-doc + test refactor only; the status trigger already
  exists, so `src/` stays untouched.
- C3: **Seam is exactly two files** — `skills/pb-build/SKILL.md` and
  `test/contract/skills.test.ts`; the other skills and the installed plugin cache are out of
  scope.
- C4: **Every existing pin in the `build` describe block stays green, unmodified** — the
  slimming may *add* a pin, never weaken or delete one.
- C5: **`pnpm check` green** — the docs + links slots and the full contract suite.

## Steps

1. [ ] Consolidate the agent-slot passages into `## Running bound agents`, gated on the
   status cue — **done when:** the five passages (before / build / when-prose /
   status-routing / after) are lifted out of default-path steps 3–5 into one new
   `## Running bound agents` section entered only when `plumbbob status` shows
   `harness bindings:`; each affected default step keeps exactly one conditional pointer line
   and no `plumbbob agent run` / `--mode` mechanics; the `--auto` section and the
   hard-contracts reference the new section; a new pin in `test/contract/skills.test.ts`
   asserts the `## Running bound agents` section exists **and** the default-path region
   embeds no slot mechanics; every existing `build`-block pin still passes; `pnpm check`
   green.
   - seam: `skills/pb-build/SKILL.md`, `test/contract/skills.test.ts`
   - model: opus — prose surgery that must preserve five interleaved contracts while keeping the default path readable, plus a non-brittle location-aware test

## Open questions

*(None — the trigger, the seam, and the contract-test shape are all settled above.)*

## Verdicts

*(None yet.)*
