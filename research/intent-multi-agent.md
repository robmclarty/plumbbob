<!--
intent.md — your canonical intent, written in DESIGN before any code. This is the
head; the chat is the hand. When the model floods you, read this, not your memory.

Size to the work: a small change fills Frame + a couple of Decisions and deletes
the rest; a medium feature fills it all. Opinionated where decided, explicit where
open. If the implementor (you-later, or the LLM) has to guess, the doc failed.
-->

# Add plumbbob init --host targets for Codex, Cursor, and Zed

**STATE:** DESIGN
**Phase** (bookkeeping while in DESIGN): steps authored
**Size:** medium

## Frame

- **Problem:** `plumbbob init` only links into Claude Code (`~/.claude/skills/plumbbob`).
  The npm package was deliberately built as the **agent-neutral carrier** (the whole
  reason we chose npm over a Claude marketplace), and the prior goal left
  `init --host codex|cursor|zed` as the explicit next step — but it isn't built. Users
  on Codex / Cursor / Zed can't get plumbbob.
- **Smallest thing that solves it:** Add `plumbbob init --host <tool>` that links the
  same skills into the dir that tool reads. Per the research, **Codex, Cursor, and Zed
  all read the shared `~/.agents/skills/` standard** (the user already uses it —
  `~/.claude/skills/firecrawl` → `~/.agents/skills/firecrawl`), so ideally **one
  symlink at `~/.agents/skills/plumbbob` serves all three**. Claude stays the default
  no-flag path, unchanged.
- **Done looks like:** `plumbbob init --host codex` (and `cursor`, `zed`, or `all`)
  links plumbbob into that tool; the skills load and are invocable there; `--uninstall`
  reverses it; `doctor` reports per-host link health; the same one set of skills serves
  every host; docs note the multi-host flow. `pnpm check` green.
- **Explicitly NOT doing:** full **hook parity** — the post-edit hook is Claude-specific
  (`hooks.json`); other hosts get **skills only** until each tool's hook story is
  designed (open question). **VS Code** (mostly project-scoped skills) is deferred.
  Forking the skills per-tool (only if the spike proves the shared form can't load).

## Architecture sketch

```
one package, one set of skills (the agent-neutral carrier)
                       │  plumbbob init --host <tool>  (symlink, per host)
        ┌──────────────┼───────────────┬────────────────┐
   (default)        codex            cursor             zed
 ~/.claude/skills/    └──────── ~/.agents/skills/plumbbob ────────┘   ← shared standard
   plumbbob → pkg            (one symlink → the package; the 3 tools read it)

  Claude:  /plumbbob:plan   (namespaced plugin)        ← already shipped
  Codex/Cursor/Zed:  load the same SKILL.md from ~/.agents/skills/  (invocation TBD by spike)

 Caveat to verify: the `!`plumbbob status`` pre-render injection is CLAUDE-ONLY.
 Other tools may show it literal / not pre-render → may need a portable fallback.
```

## Decisions

- D1: **`init --host` is additive; Claude stays the default.** Bare `plumbbob init`
  keeps its current Claude link unchanged; `--host codex|cursor|zed|all` adds the
  others — *because* we must not regress the shipped Claude path.
- D2: **One shared set of skills, not per-tool forks.** Link the *same* `skills/` into
  each host — *because* the carrier was designed agent-neutral and `disable-model-invocation`
  (the human-is-the-clock law) is honored by 4 of 5 hosts (research/02). Fork only if
  the spike proves a tool can't load the shared form.
- D3: **Prefer the shared `~/.agents/skills/` standard.** Codex/Cursor/Zed read it, so
  one symlink there may serve all three — *because* it's the cross-tool convention the
  user already uses (firecrawl), minimizing per-tool surface. (Confirm in the spike.)
- D4: **Host-only reasoning, unchanged.** No fascicle/model calls — plumbbob still rides
  whatever subscription model the host provides (the standing decision).

## Constraints

- C1: **Do not regress the Claude path** — bare `plumbbob init` and the
  `~/.claude/skills/plumbbob` link behave exactly as shipped.
- C2: Keep **zero runtime deps**, functional/procedural, `node:` builtins (C1/C2 house
  style); `init` stays **idempotent + reversible** and **never edits any tool's
  settings/config**.
- C3: **Be honest about partial support.** Per host, state what works (skills) and what
  doesn't yet (the post-edit hook; namespaced `/plumbbob:*` is a Claude plugin feature —
  other tools invoke their own way). `doctor` and docs must not overclaim.
- C4: `pnpm check` stays green; new `init --host` paths are tested.

## Steps

1. [ ] SPIKE — verify per-tool loading by hand — **done when:** a symlink at
   `~/.agents/skills/plumbbob` (and per-tool dirs as needed) is tested in a real Codex,
   Cursor, and Zed session, recording per tool: do the skills load? how are they invoked
   (namespaced or bare)? does the `!`plumbbob status`` pre-render run or show literal?
   does `disable-model-invocation` hold? and does ONE `~/.agents/skills/` symlink serve
   all three? Results logged to `build-log.md`. (De-risks portability + the shared-dir
   hypothesis — the biggest unknowns.)
   - seam: a manual symlink + a throwaway probe skill; notes to `build-log.md`
2. [ ] Make the skill status-injection portable (only if the spike requires it) — **done
   when:** the `!`plumbbob status`` pre-render has a fallback that works without Claude's
   pre-render (e.g. the body instructs the model to run `plumbbob status` first), and the
   skills still load clean in all hosts incl. Claude (`claude plugin validate .`).
   - seam: `skills/*/SKILL.md` (shared, portable form)
3. [ ] Add `init --host codex|cursor|zed|all` — **done when:** each resolves the right
   global dir (the shared `~/.agents/skills/` where the spike confirms it), symlinks the
   package, is idempotent, supports `--uninstall`, and never touches any tool's config;
   bare `init` (Claude) is unchanged.
   - seam: `src/verbs/init.ts`, `src/cli.ts`
4. [ ] `doctor` reports per-host link health — **done when:** `doctor` lists which hosts
   are linked (Claude / Codex / Cursor / Zed) and the fix for any missing one, honest
   about hook/namespacing support per host.
   - seam: `src/verbs/doctor.ts`
5. [ ] Tests for `init --host` + doctor — **done when:** `init --host <tool>` link +
   `--uninstall` + idempotency + "no config touched" are covered, and `vitest` is green.
   - seam: `test/init.test.ts`, `test/doctor.test.ts`
6. [ ] Docs — **done when:** README + `docs/happy-path.md` document `init --host`, state
   per-host support honestly, and `markdownlint` passes.
   - seam: `README.md`, `docs/happy-path.md`

## Open questions

- Q1: Does **one `~/.agents/skills/plumbbob` symlink serve Codex + Cursor + Zed at once**,
  or does each need its own dir (e.g. `~/.codex/...`, `~/.cursor/...`)? — *resolve by:* spike
- Q2: The `!`plumbbob status`` **pre-render is Claude-only** — what's the portable fallback
  for hosts that don't pre-render (run-it-first prose? a different injection?)? —
  *resolve by:* spike → decide
- Q3: **Invocation surface per host** — Claude gives namespaced `/plumbbob:plan`; how do
  Codex / Cursor / Zed invoke a skill (bare name, their own prefix)? — *resolve by:* spike
- Q4: **Per-host hook story** — does the post-edit feedback have an equivalent in
  Codex/Cursor/Zed, or is it Claude-only for now? — *resolve by:* research/decide
- Q5: **VS Code** — in scope later? (skills are mostly project-scoped there.) — *resolve by:* decide

## Verdicts

*(filled in as the spike + open questions resolve)*
