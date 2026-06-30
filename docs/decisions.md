# Decisions and constraints — the D and C key

The Plumbbob source is annotated with shorthand tags — `D3`, `C1`, `D17`, and so on —
that point back to settled design decisions (`D`) and hard constraints (`C`). They keep
the code comments terse without losing the *why*. This page is the key: it reconstructs
each tag from where it is referenced in the code, so a reader who hits "`D17`" in a comment
can look up what it means.

The list covers the tags **present in the v2 code**. Some numbers (e.g. `D2`, `D5`,
`D11`, `D12`, `D21`) belonged to earlier or superseded decisions and are no longer
referenced; a few entries below are v1 decisions kept only because a comment still cites
them, and they are marked as such.

## Constraints (C)

Hard rules the code must honor. **C1** and **C2** are machine-enforced by the ast-grep
rules in `rules/` (run via `pnpm check`); the rest are upheld by review and the design of
the code.

- **C1 — Functional and procedural only.** No classes, no `this`, no default exports;
  every symbol has a stable named export. Enforced by `rules/no-class.yml` and
  `rules/no-default-export.yml`. *Tagged across* `src/**` and the test tree.
- **C2 — Node builtins only, zero runtime dependencies.** The CLI imports nothing outside
  `node:*`; it runs natively on Node ≥ 22.18 with no install step. Enforced by
  `rules/node-builtins-only.yml`. *Tagged in* `git.ts`, `sidecar.ts`, `archive.ts`,
  `init.ts`, `doctor.ts`, `cli-core.ts`.
- **C4 — Archive-then-clear, never destroy.** Closing a session copies the active files
  into the archive *before* clearing them; nothing is deleted until it is safely recorded.
  *Tagged in* `wrap.ts`, `archive.ts`, and (for the sidecar's survival across a reset)
  `revert.ts`.
- **C5 — Additive git footprint.** Plumbbob only reads, locates, stages, commits forward,
  and resets `--hard` to its own recorded SHAs. It never rewrites pushed history; your
  squash-merge collapses the checkpoint markers at PR time. *Tagged in* `git.ts`,
  `wrap.ts`.

*(`C3` is not referenced in the current code.)*

Beyond the numbered constraints, `rules/` guards three architectural invariants:
`no-process-exit` (only the bin entry exits, so verbs and `cli-core` stay importable by
tests), `no-console` (the CLI writes through `process.stdout` / `process.stderr`), and
`centralize-subprocess` (subprocess spawning stays in `lib/git.ts`, `lib/check.ts`, and
`verbs/spike.ts`).

## Decisions (D)

- **D1 — A deterministic, zero-dependency CLI; guidance, not a lock.** The v2 foundation:
  a hand-rolled `plumbbob` CLI built on node builtins, and a deciding/executing boundary
  held by a pause rather than enforced by a file lock. *Tagged in* `cli-core.ts`.
- **D3 — The pluggable, author-blind executor.** `/plumbbob:pb-build` is optional; `verify`
  and `checkpoint` read *the diff, not who wrote it*, so a hand-built, vibed, or
  other-harness diff checkpoints identically. *Tagged in* `checkpoint.ts`, the `build` and
  `verify` skills.
- **D4 — The in-flight step lives in flat files.** `SEAM` (a plain path list) and `STEP`
  (a bare number) record the step in flight as flat files, not parsed markdown. *Tagged
  in* `sidecar.ts`.
- **D6 — Steps are the parseable build plan; roadmap prose lives elsewhere.** Only
  `## Steps` carries the numbered, machine-read increments; narrative roadmap text stays
  out of it. *Tagged in* `orient.ts`.
- **D7 — Capture then triage (park → harvest).** Parking is a dumb flat-line append the
  hooks can read with a grep (no markdown parsing); triage happens later, at a step
  boundary. *Tagged in* `sidecar.ts`, the `park` and `harvest` skills.
- **D8 — `status` is an orientation dashboard.** It parses the live session into the
  where-am-I view. *Tagged in* `status.ts`, `orient.ts`.
- **D9 — `wrap` is the v2 close-out: report by default, no gate.** One verb replaces v1's
  four-verb finish; it writes the report by default but never refuses the exit without one.
  *Tagged in* `wrap.ts`, `archive.ts`, the `wrap` skill. (Supersedes **D19**.)
- **D10 — The boundary is a pause, not a lock.** Nothing blocks edits; the loop pulls up
  to the verify pause and waits. *Tagged in* `cli-core.ts`.
- **D13 — Retire the v1 guards.** The pre-edit muzzle, seam-guard, and bash-guard, plus the
  human-only `mode` escape hatch and the `CLAUDECODE` in-session refusal, are all gone —
  guidance, not enforcement. *Tagged in* `cli-core.ts`.
- **D14 — Subprocess testing in throwaway repos.** Tests run the real CLI against tmp git
  repos; because a real `pnpm check` would recurse into vitest, fixtures point the check at
  a stub. *Tagged in* `test/helpers/fixture-repo.ts`, `check.ts`, and the `check` tests.
- **D15 — `status` infers one primary next move.** It suggests a single next step while
  printing the full list and counts so you can always override. *Tagged in* `orient.ts`.
- **D16 — The heavy check plus a single structured self-review.** The verify tick runs the
  full gate, then reads the diff against done-when, Decisions, and Constraints in one pass.
  *Tagged in* `check.ts`, the `build` and `verify` skills.
- **D17 — The sidecar is git-excluded.** `.plumbbob/` is appended to the repo's
  `info/exclude`, so it never shows as dirty and a `git reset --hard` never destroys park
  lines or intent edits. *Tagged in* `sidecar.ts`, `git.ts`, `revert.ts`, `spike.ts`.
- **D18 — The spike lifecycle.** A genuine fork gets a throwaway worktree and branch per
  option, kept outside the repo, torn down by `spike done`. *Tagged in* `spike.ts`.
- **D20 — The archive is local-only markdown.** Wrapping writes a plain-markdown archive
  under `.plumbbob/archive/`; nothing is pushed anywhere. *Tagged in* `archive.ts`.
  *(Originated in v1; still the v2 behavior.)*
- **D22 — `start` refuses a dirty tree.** A clean baseline is required; `--allow-dirty`
  overrides it and records the current HEAD as the baseline. *Tagged in* `start.ts`.
- **D23 — Seams are exact paths or `dir/` grants, never globs.** A seam token is matched as
  an exact path or a directory prefix; a glob is rejected. *Tagged in* `intent.ts`.
- **D24 — The heavy check is configurable, defaulting to `pnpm run check`.** `start`
  records `check=` in `.plumbbob/config` and warns when the target repo has no such script.
  *Tagged in* `start.ts`, `check.ts`.
- **D25 — Light feedback at the keystroke, heavy checks at the boundary.** The `post-edit`
  hook runs a non-blocking, file-scoped lint pass and injects findings into the model's
  context; `tsc` and the rest of the gate are deferred to the heavy tier inside `verify`.
  *Tagged in* `hooks/post-edit.sh`.

### Superseded

- **D19 — (v1) `finish` refused without a report.** v1 gated the close-out on a written
  report. **D9** removed the gate: v2 `wrap` writes the report by default but never walls
  the exit. *Still cited in* `archive.ts`.

---

*The conceptual companion to this key is [`techniques.md`](techniques.md), which explains
the methods these decisions shape. Contributors adding a new settled decision should give
it the next free `D#`, reference it inline where it is implemented, and add a line here.*
