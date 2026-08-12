# Contributing to PlumbBob

Thanks for your interest. PlumbBob is a small, deliberately constrained tool — a lean
TypeScript CLI (one deliberate runtime dependency: [checkride](https://www.npmjs.com/package/checkride))
plus a set of Claude Code skills. This guide covers the setup, the conventions the code
holds itself to, and how to get a change merged.

If you are changing anything non-trivial, it helps to know the design vocabulary first:
[`docs/architecture.md`](docs/architecture.md) for how the layers hang together,
[`docs/techniques.md`](docs/techniques.md) for the methods, and
[`docs/decisions.md`](docs/decisions.md) for the `D#` / `C#` tags the code references.

## Getting set up

PlumbBob uses **pnpm** and runs on **Node ≥ 22.18** (it relies on native TypeScript
type-stripping, so the source runs without a build step).

```sh
pnpm install
pnpm check      # the full gate — run this before every push
pnpm build      # emit dist/ (what the published bin runs); not needed for tests
```

The CLI runs straight from source in development (`node src/cli.ts`), and the tests do the
same, so you rarely need `pnpm build` — only when you want to exercise the published
`dist/cli.js` bin.

## The check gate

`pnpm check` is the one gate, and it must be green before a change lands. It is
[checkride](https://www.npmjs.com/package/checkride) ([**D32 (checkride-gate)**](docs/decisions.md#d32) — our sibling package, and
plumbbob's one runtime dependency), which runs the tools this repo configures, in order:

| Slot | Tool | What it guards |
|------|------|----------------|
| `types` | `tsc --build` | types |
| `lint` | `oxlint` | correctness lint |
| `struct` | `ast-grep scan` | the structural constraints (see below) |
| `dead` | `fallow` | dead code, unused exports/deps, cycles, complexity |
| `test` | `vitest` | the test suite |
| `docs` | `markdownlint-cli2` | the docs |
| `links` | built-in | relative markdown links resolve |
| `refs` | `scripts/check-refs.ts` | every `D#` / `C#` citation is linked and glossed (see below) |

Raw tool output lands in `.check/` (`summary.json` is the index). Narrow the loop while
iterating: `pnpm check --bail`, `pnpm check --only types,lint`. An opt-in `mutation` slot
(Stryker) audits test quality — `pnpm check --include mutation` — and is kept out of the
default gate so the loop stays fast. This repo has no CI yet —
**run `pnpm check` locally** before opening a pull request.

**A second gate runs faster, and it is not this one.** checkride's Stop hook runs at
the end of every turn that touched a file, under the narrowed profile in
`checkride.config.json`'s `gate` key — everything above except `test`, back in about two
seconds. It catches a broken build while you are still in the conversation that broke it;
it is not the full check and never claims to be. `pnpm check` — what `plumbbob checkpoint`
also refuses on — stays the binding one ([**D75 (two-gates)**](docs/decisions.md#d75)). If a
turn ends red, that hook will say so before you get a chance to forget.

## Code conventions

The constraints are real, and the `ast-grep` rules in `rules/` enforce several of them
automatically. Full key in [`docs/decisions.md`](docs/decisions.md); the load-bearing ones:

- **[C1 (functional-only)](docs/decisions.md#c1) — functional and procedural only.** No classes, no `this`, no default exports. Use
  plain functions and named exports so every symbol has a stable name. `ast-grep` fails the
  build on a class or a default export.
- **[C2 (few-deliberate-deps)](docs/decisions.md#c2) — node builtins plus a few deliberate dependencies.** Import nothing outside
  `node:*` and the explicit allowlist (currently `checkride` alone) in `src/`; `ast-grep`
  flags any other import. A new runtime dependency is a design decision to argue for —
  our own tools first, never a casual install; dev-only tooling is fine.
- **[C4 (never-destroy)](docs/decisions.md#c4) / [C5 (additive-git)](docs/decisions.md#c5) — never destroy, additive git only.** Nothing may lose park lines, intent
  edits, or a build's record: `revert` snapshots the tracked build folder across its
  `reset --hard`, `finish` leaves the folder in place as the archive, and every reset
  targets only plumbbob's own recorded SHAs; it never rewrites pushed history. `ast-grep`
  backs both: deletions compile only in their sanctioned files, no history-rewriting git
  token (`push`, `rebase`, `--amend`, …) appears as a string literal, and `resetHard`
  imports only in `revert.ts`.

`rules/` also enforces three architectural invariants: `no-process-exit` (only the bin
entry exits, so verbs stay testable), `no-console` (write through `process.stdout` /
`process.stderr`), and `centralize-subprocess` (spawn only in `lib/git.ts`, `lib/check.ts`,
`lib/agents.ts`, `verbs/spike.ts`) — plus decision-level tripwires: the agent path can't
import loop-advancing verbs ([C6 (no-advance-verb)](docs/decisions.md#c6)) or sync spawns ([D60 (async-spawn)](docs/decisions.md#d60)), excludes never touch
`.gitignore` ([D33 (info-exclude)](docs/decisions.md#d33)), and no `CLAUDECODE` session-sniffing guard can return ([D13 (no-edit-guards)](docs/decisions.md#d13)).
If the gate rejects an edit for one of these, that is by design.

When you make a genuinely new design decision, give it the next free `D#` and a short
slug, and add an entry to [`docs/decisions.md`](docs/decisions.md) carrying the
`<a id="d#"></a>` anchor every citation will point at. Cite it as one link that carries
that slug verbatim — [**D75 (two-gates)**](docs/decisions.md#d75), not a bare `D75` — with
an absolute GitHub URL from `skills/` and `templates/`, which ship without `docs/`, and
with the gloss alone in anything the CLI prints, where a markdown link is noise. The
`refs` slot checks all of that; the full rule, and the three places it deliberately does
not reach, are [**D74 (glossed-citations)**](docs/decisions.md#d74).

## Tests

The layout encodes intent — match it when you add tests:

- **Unit tests** sit in a `__tests__/` folder **next to the module they cover** (for example
  `src/lib/__tests__/git.test.ts`). Verbs are pure `(cwd, args) => number` functions, so
  they unit-test in-process.
- **Multi-module tests** live under `test/` in labeled folders: `test/integration/` (tests
  that spawn the real CLI), `test/e2e/` (full-session lifecycles), and `test/contract/`
  (static checks like the SKILL.md frontmatter contract).
- **Shared helpers** go in `test/helpers/` (`fixture-repo.ts` for subprocess tests,
  `temp-repo.ts` and `capture-io.ts` for in-process ones).

`vitest` discovers both `src/**/*.test.ts` and `test/**/*.test.ts`. The build excludes
`src/**/__tests__/**`, so colocated tests never ship in `dist/`. Add or update tests with
any behavior change — `fallow` will also flag an export that nothing (including a test)
references.

## Documentation

Docs are hand-written markdown under `docs/` (plus this file and the `README`).
`markdownlint-cli2` enforces structure; line length is intentionally unrestricted, so wrap prose
naturally. If you change a verb's behavior or output, update
[`docs/cli-reference.md`](docs/cli-reference.md), and check whether
[`docs/happy-path.md`](docs/happy-path.md) shows the affected output.

## Commits and releases

- **Conventional commits.** Use `type(scope): summary` — `feat`, `fix`, `refactor`, `docs`,
  `chore`, `test`, `build`, and so on. Keep the summary in the imperative mood. The repo's
  history is the style reference.
- **TIL lines (optional).** This repo records genuine lessons as a `TIL:` line in the
  commit body — use one when a change taught you something non-obvious, skip it otherwise.
- **Releases.** Versioning follows semver with a Keep a Changelog `CHANGELOG.md`; the
  in-repo `/version` skill bumps `package.json` and adds the changelog entry. Don't bump the
  version in a feature PR — that's a separate release step.

## Submitting a change

1. Branch off `main`.
2. Make the change, with tests, keeping the constraints above.
3. Run `pnpm check` until it is green.
4. Open a pull request with a conventional-commit-style title and a short description of the
   *why*.

Small, focused changes are easier to review and merge — the same calibration discipline the
tool itself preaches: size the change to the work.
