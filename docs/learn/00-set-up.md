# Set Up Your Workbench

Before you can keep a plan true you need a repo that can say when code is done,
because PlumbBob's pause measures a check it did not write. This lesson makes that
repo, your workbench, puts a check gate in it, commits the scaffold, installs the
plugin, and reads `doctor` once. Every lesson after this one changes this repo and
its plan. About fifteen minutes.

## What You Need

- **Node 24 or newer.** Check with `node -v`.
- **pnpm 11 or newer.** The scaffold detects it and pins everything else.
- **git.**
- **Claude Code 2.1.163 or newer**, since you type every skill into it.

Nothing in this lesson calls a model except the one prompt at the end, which is what
every "With Your Agent" prompt in the course does.

## Make the Repo

```sh
mkdir -p ~/learn/sift
cd ~/learn/sift
git init -b main
pnpm dlx checkride@0.20.0 init --shape flat --name sift
```

`git init -b main` names the branch up front; without `-b`, git prints its hint
about the default branch instead. The last line runs checkride, the gate the pause
will measure, pinned to 0.20.0 because pnpm's `minimumReleaseAge` setting can hold
a fresh release back for a day or two, and a pin says what you got. It prints three
lines:

```text
checkride init: generated a flat project (32 files).
  package manager: pnpm (detected)
  next: pnpm install && pnpm run check
```

The 32 files are a `package.json` with every version pinned, the TypeScript, vitest,
oxlint, ast-grep, fallow, markdownlint, and cspell configs, a starter module
`src/sift.ts` with its smoke test, an `AGENTS.md` carrying checkride's stanza with a
`CLAUDE.md` that imports it, and `checkride.config.json`, which names the checks.

## Run the Gate

```sh
pnpm install
pnpm check
```

The check prints one line per slot, then its verdict. The timings below are from one
run on a warm machine; yours will differ, and the shape will not:

```text
  ✔ types             387ms  [config]
  ✔ lint             1021ms
  ✔ struct            369ms
  ✔ dead              595ms
  ✔ test             4074ms
  ✔ docs             1070ms
  ✔ links              18ms
  ✔ spell            2633ms
  ✔ typecheck-tests  1281ms  [custom]
✔ all checks passed in 4468ms
report: .check/summary.json
```

Nine `✔` lines and `all checks passed` are the lines to check for. Exit 0 here is the
definition of done that every pause in this course will use, decided by a tool
PlumbBob did not write. Vitest is 4074 ms of the 4468; every other slot is under a
second.

One line of config first. The scaffold's markdownlint globs every `.md` file, hidden
folders included, and the plan and log PlumbBob will write under `.plumbbob/` from its
templates trip rules the scaffold keeps on, so the gate would go red on your record
rather than your prose. Open `.markdownlint-cli2.jsonc` and put `.plumbbob/**` first in
its `ignores` list, which is what PlumbBob's own repo does:

```text
"ignores": [".plumbbob/**", "**/node_modules/**", "dist/**", ".check/**", "CHANGELOG.md", "**/test/fixtures/**"]
```

Now commit the scaffold, with one file PlumbBob would otherwise write for itself:

```sh
mkdir -p .plumbbob
printf '{}\n' > .plumbbob/settings.json
git add -A
git commit -qm "chore: scaffold with checkride"
git status --short
```

`plumbbob start` seeds `.plumbbob/settings.json` as `{}` when the file is absent,
and a file it seeds would show on step 1's seam row as a stray. Writing it now puts
it in the scaffold commit instead. The commit holds 34 files: the 32, the lockfile,
and the settings file. `git status --short` must print nothing; `.check/`, `dist/`,
`coverage/`, and `*.tsbuildinfo` are already ignored. A dirty tree is the first
thing `start` refuses, so this line ends every lesson.

## Install the Plugin

PlumbBob is a Claude Code plugin in the `agent-tools` marketplace. Inside Claude
Code, in any folder:

```text
/plugin marketplace add robmclarty/agent-tools
/plugin install plumbbob@robmclarty
```

Then `/reload-plugins`, or restart Claude Code. Start it from inside `~/learn/sift`,
trust the folder when asked, and type:

```text
/plumbbob:doctor
```

The namespaced form matters: five of the eighteen skills share a name with a Claude
Code built-in (`plan`, `run`, `status`, `verify`, `doctor`), and the built-in wins a
bare `/doctor`. The report reads, roughly:

```text
plumbbob doctor — plugin install
  ✓ installed via marketplace (plumbbob@robmclarty) — skills load as /plumbbob:*, the CLI is on PATH from the plugin bin/. No init needed.

plumbbob doctor — check gate — D32 (checkride-gate)
  ✓ types ← tsc (7.0.2)
  ✓ lint ← oxlint (1.87.0)
  ✓ test ← vitest (5.0.3)
  …

plumbbob doctor — approval latch — D64 (approval-latch)
  ○ latch: dormant — guidance only (no turn ledger yet; it ticks on your first prompt when the UserPromptSubmit hook is wired — re-run after one to confirm)

plumbbob: all checks passed. If a skill still misbehaves, restart Claude Code (or /reload-plugins).
```

Three lines to check for. The install line says `installed via marketplace`, so the
skills load as `/plumbbob:*` and the CLI is on PATH inside this session. The check
gate section lists the scaffold's tools with a `✓` each, which is PlumbBob reading
`checkride.config.json` rather than guessing at a test command. And `latch: dormant`
is not a failure: the latch is the ledger that counts your prompts, and the ledger
does not exist until your first prompt ticks it. The four hooks (an ask before a raw
`git commit` while a step is in flight, a light lint after each edit, the prompt
tick, and a relay check when a turn ends) registered from the plugin's `hooks.json`
on their own; nothing was wired by hand.

## If Something Went Wrong

| What you see | What it means |
| --- | --- |
| `pnpm doctor` prints pnpm's own report | `pnpm doctor` is a pnpm built-in, and it shadows the scaffold's script. Run `pnpm exec checkride doctor` instead. |
| `/plan` or `/status` opens something that is not PlumbBob | A built-in won the bare name. Type the `/plumbbob:` form. |
| `plumbbob: command not found` in a terminal | The marketplace plugin puts the CLI on PATH only inside a Claude Code session. Prefix a verb with `!` in the session, or install the npm package per [`install.md`](../install.md). |
| `pnpm dlx` fetches an older checkride, or refuses | `minimumReleaseAge` is holding a fresh release back. The pin above sidesteps it. |
| `git status --short` is not empty after the commit | Something wrote to the tree after `git add`. Commit it or ignore it before lesson 2. |

## With Your Agent

Ask your agent, in the session you just opened:

> Read AGENTS.md and CLAUDE.md in this repo and tell me, in five lines, what the check gate runs and what you are not allowed to edit. Don't change anything.

Check that it names checkride and `pnpm check`, the nine checks, and
`checkride.baseline.json`, the one file the stanza tells it never to pad. If it
offers to fix something, it read the stanza as a to-do list; nothing is broken, so
say no.

## Try It

1. Open the smoke test under `src/__tests__/`, change the string it expects, and run
   the gate again. The `test` line goes red, the verdict says what failed, and the
   exit code is 1; `.check/summary.json` names the slot. Put the string back and run
   the gate once more before you go on, or lesson 2's `start` will refuse the dirty
   tree.
2. In the session, type `/plumbbob:status` before any plan exists and read
   `NO ACTIVE SESSION`. Every skill opens with that dashboard; this is what it says
   when nothing has started. Nothing to put back.

## Remember

- Exit 0 from `pnpm check` is the only definition of done a pause will use.
- The plugin's CLI is on PATH only inside a Claude Code session; outside one, prefix
  a verb with `!` or install the npm package.
- A dirty tree is the first thing `start` refuses, so end every lesson with
  `git status --short` empty.

[The Spec Comes Before the Plan →](./01-the-spec.md)
