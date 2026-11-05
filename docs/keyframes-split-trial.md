# The keyframes split trial, and what replaced it

**The trial never ran.** plumbbob was to be the first project to split a
[keyframes](https://github.com/robmclarty/keyframes) plan by scope: Rob would write a root
plan by hand, an agent would draft the same split without sight of his, and the two would
be scored on where they agreed about the core. The keyframes prototype closed on
2026-11-02 without its pilots, so the protocol that stood on this page measured nothing,
and keyframes' `docs/pilots.md` still records plumbbob's entry as not run.

**A root plan landed anyway, as a gate slot.** On 2026-11-04 plumbbob wired
[`keyframes.md`](../keyframes.md) at the repo root into `pnpm check` as the `intent` slot:
`keyframes check --strict`, read-only and under a second, so the per-turn gate keeps it.
The plan holds the core and nothing else: 7 principles, 7 map parts, the constraints
[C1 (functional-only)](decisions.md#c1) to [C7 (minimal-envelope)](decisions.md#c7), and nine
decisions, every one keeping its number and slug from [`decisions.md`](decisions.md), and
every `held-by:` pointer resolving to a rule, a test, or an eval. It is 1,282 of its 2,000
words.

**The log stays the log.** `docs/decisions.md` holds 120 anchored decisions, up to `D125`,
and 7 constraints in 26,363 words; the plan cites it and copies nothing. The citation rule
carries one carve-out for the mirror: the root plan's items are checked by the `intent`
slot, not by the refs scanner ([D74 (glossed-citations)](decisions.md#d74)).

**Linked is not enforced.** A `held-by:` pointer that resolves proves the rule or test
exists, not that it ran: the ast-grep rules and vitest files it names run in their own slots
of the same gate, and the eval contracts run only under `pnpm eval:*`. A green `intent` row
means the plan is well formed and its pointers are live, no more.

**The split's limitation stands.** A part plan cannot cite the root plan: `check` reads the
citation as broken and resolves pointers from the part's folder. Nothing in plumbbob has
earned a part plan (the root plan carries that as its open question `Q1`), so the limitation
has cost nothing yet, and it is still the design note scoped plans wait on.
