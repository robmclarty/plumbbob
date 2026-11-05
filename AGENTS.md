<!-- checkride:begin hash=v11553d53f492ebf1f -->

## Checkride: the definition of done

`pnpm check` is the single source of truth for "done". Exit 0 means the work is
complete; any other exit code means it is not. Never claim a task is finished while
`pnpm check` is red.

When it fails:

1. Read `.check/summary.json` to see which check failed.
2. Read that check's raw output: `.check/<slot>.json` or `.jsonl`, `.check/<slot>.stdout.txt`,
   or `.check/<slot>.stderr.txt`, where a check refused before it ran says why. A
   target's check writes under `.check/<target>/` instead.
3. Fix the root cause, then re-run.

`pnpm check --digest` prints a capped excerpt of what failed below its report,
each section naming the raw file that holds the rest, so start from that.

`pnpm exec checkride triage` runs this procedure in full and reads `.check/` for you
(`/checkride:check` and `/checkride-check` are the same thing as a skill).

Tight feedback loops: `pnpm check --bail`, `pnpm check --only types,lint`, and
`pnpm check --changed`.

If a stop-gate hook is configured (`.claude/settings.json` or `.cursor/hooks.json`),
it runs the check when a turn ends — so while iterating, prefer the narrow commands
above rather than running the full check yourself every loop. Read the gate's verdict
rather than assuming it covered everything: a repo can narrow the gate with `gate` in
`checkride.config.json`, and a narrowed one names its narrowing (`only …`, `without …`,
`affected-only`) in every verdict. That green is not the "done" defined above; run
`pnpm check` in full before you claim the work is finished.

### Baseline

If `checkride.baseline.json` is present, checkride grandfathers the diagnostics it
lists: a slot is green as long as only baselined findings remain, while a genuinely
new diagnostic still fails it. Fixing a baselined finding prunes it from the file —
the ratchet, so the baseline only ever shrinks. Never add to the baseline to make a
check pass; fix the finding.

### Module boundaries

The `struct` check runs whatever ast-grep rules `sgconfig.yml` points at
(`rules/` by default). Those files are this repo's boundary convention —
read them rather than assuming one.

### Prose voice

Before writing or editing prose (markdown, doc comments), read the exemplars in
`docs/voice` and imitate their voice — sentence rhythm, word choice, register.
They are hand-written and human-owned: never edit, rewrite, or add to them, and
never generate new ones. When your draft and an exemplar disagree about how a
sentence should sound, the exemplar wins.

Active checks in this repo: lint, struct, dead, links, refs, intent, types, docs, spell, prose, build, test.

<!-- checkride:end -->

## Keyframes

This project's intent is in `keyframes.md`. Read it before you change code.

- **Constraints (C)** must always hold. If a change would break one, stop and ask.
- **Scenarios (S)** must keep working.
- **Decisions (D)** are settled. Don't reverse one without asking.
- **Questions (Q)** are open. Raise them; don't settle them on your own.
- **Ideas (I)** aren't agreed yet. Don't build one unless a person asks.
- **Principles (P)** decide judgment calls the plan doesn't cover.
- **Taste (T)** is preference. Follow it unless you have a reason, and say what the reason was.
- **Map (M)** says where things live. Put new code in the part it belongs to.
- When your work relies on an item, cite it as `[C3 (slug)]` in your summary or commit message.
- Don't edit `keyframes.md` unless a person asks you to. If it looks wrong or incomplete, say so
  and propose the change.
- After changing anything the plan points at, run `pnpm exec keyframes check --strict`.

In this repo, `pnpm check` runs it as the `intent` check, and `pnpm check --only intent` is the
narrow loop. Each Constraint and Decision in `keyframes.md` keeps the number and slug of its entry
in `docs/decisions.md`, which stays the log.
