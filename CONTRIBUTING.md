# Contributing to Plumbbob

Thanks for your interest. Plumbbob is a small, deliberately constrained tool — a
zero-dependency TypeScript CLI plus a set of Claude Code skills. This guide covers the
setup, the conventions the code holds itself to, and how to get a change merged.

If you are changing anything non-trivial, it helps to know the design vocabulary first:
[`docs/techniques.md`](docs/techniques.md) for the methods, and
[`docs/decisions.md`](docs/decisions.md) for the `D#` / `C#` tags the code references.

## Getting set up

Plumbbob uses **pnpm** and runs on **Node ≥ 22.18** (it relies on native TypeScript
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

`pnpm check` is the one gate, and it must be green before a change lands. It runs six
tools in order:

| Step | Tool | What it guards |
|------|------|----------------|
| `check:tsc` | `tsc --noEmit` | types |
| `check:oxlint` | `oxlint` | correctness lint |
| `check:astgrep` | `ast-grep scan` | the structural constraints (see below) |
| `check:test` | `vitest run` | the test suite |
| `check:knip` | `knip` | dead code / unused exports |
| `check:md` | `markdownlint` | the docs |

Run a single step with `pnpm check:test`, `pnpm check:tsc`, and so on. There is no CI yet —
**run `pnpm check` locally** before opening a pull request.

## Code conventions

The constraints are real, and the `ast-grep` rules in `rules/` enforce several of them
automatically. Full key in [`docs/decisions.md`](docs/decisions.md); the load-bearing ones:

- **C1 — functional and procedural only.** No classes, no `this`, no default exports. Use
  plain functions and named exports so every symbol has a stable name. `ast-grep` fails the
  build on a class or a default export.
- **C2 — node builtins only, zero runtime dependencies.** Import nothing outside `node:*`
  in `src/`; `ast-grep` flags any non-`node:`, non-relative import. New runtime
  dependencies are a hard no; dev-only tooling is fine.
- **C4 / C5 — never destroy, additive git only.** Anything that closes or rewinds a session
  archives before it clears and only resets to its own recorded SHAs; it never rewrites
  pushed history.

`rules/` also enforces three architectural invariants: `no-process-exit` (only the bin
entry exits, so verbs stay testable), `no-console` (write through `process.stdout` /
`process.stderr`), and `centralize-subprocess` (spawn only in `lib/git.ts`, `lib/check.ts`,
`verbs/spike.ts`). If the gate rejects an edit for one of these, that is by design.

When you make a genuinely new design decision, give it the next free `D#`, reference it
inline where it is implemented, and add a one-line entry to
[`docs/decisions.md`](docs/decisions.md).

## Tests

The layout encodes intent — match it when you add tests:

- **Unit tests** sit in a `__tests__/` folder **next to the module they cover** (e.g.
  `src/lib/__tests__/git.test.ts`). Verbs are pure `(cwd, args) => number` functions, so
  they unit-test in-process.
- **Multi-module tests** live under `test/` in labeled folders: `test/integration/` (tests
  that spawn the real CLI), `test/e2e/` (full-session lifecycles), and `test/contract/`
  (static checks like the SKILL.md frontmatter contract).
- **Shared helpers** go in `test/helpers/` (`fixture-repo.ts` for subprocess tests,
  `temp-repo.ts` and `capture-io.ts` for in-process ones).

`vitest` discovers both `src/**/*.test.ts` and `test/**/*.test.ts`. The build excludes
`src/**/__tests__/**`, so colocated tests never ship in `dist/`. Add or update tests with
any behavior change — `knip` will also flag an export that nothing (including a test)
references.

## Documentation

Docs are hand-written markdown under `docs/` (plus this file and the `README`).
`markdownlint` enforces structure; line length is intentionally unrestricted, so wrap prose
naturally. If you change a verb's behavior or output, update
[`docs/cli-reference.md`](docs/cli-reference.md), and check whether
[`docs/happy-path.md`](docs/happy-path.md) shows the affected output.

## Commits and releases

- **Conventional commits.** Use `type(scope): summary` — `feat`, `fix`, `refactor`, `docs`,
  `chore`, `test`, `build`, etc. Keep the summary in the imperative mood. The repo's history
  is the style reference.
- **TIL lines (optional).** This repo records genuine learnings as a `TIL:` line in the
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
