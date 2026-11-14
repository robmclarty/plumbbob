# The research pass: what a plan checks before it is approved

A plan is written from what the model remembers, and what it remembers has a date. The
library it leans on shipped a release since. The convention it invents already has an
exemplar three folders over. The idea it proposes was tried in March and decided against.
None of that is in the plan, and all of it is cheaper to learn before the first step than
after the third.

The research pass is where a plan looks before it is approved. It sits between the Frame and
the Steps in `/plumbbob:plan`, it reads through three lenses, and what it finds lands in one
file, `research.md`, beside `intent.md`.

**Research is a dated claim about the world.** A finding was true on the day it was found,
against the versions installed that day. So the file's first line is a stamp the CLI writes,
and the CLI can say when the world has moved out from under it
([D158 (research-is-dated)](decisions.md#d158)).

## The three lenses

| Lens | Asks | Reads |
| --- | --- | --- |
| Ecosystem | Is this buildable on the versions installed today? What changed, what is deprecated, what are the known gotchas? | official docs, changelogs and issue trackers, for each dependency the plan leans on |
| Codebase | What conventions apply, and which file is the exemplar? | the repo, `rules/`, keyframes.md's Map |
| Record | Was this tried, or decided against? | `docs/decisions.md`, keyframes.md, past builds' intent and parks |

The pass is sized to the work. A tiny plan runs none of them. A small plan runs the codebase
and record lenses, which need no web at all. A medium plan runs all three. Where the host can
run subagents the lenses run in parallel, one subagent each, the ecosystem lens with the
host's own web tools.

Whether the plan is the right thing to build is a different question, asked earlier. A plan
that absorbs a storyboard spec links that record from `research.md` and does not redo it.

## `research.md`

The file lives at `.plumbbob/builds/<slug>/research.md`, tracked with the rest of the build's
record. Under the stamp it holds one section per lens that ran, and every finding takes the
same three-part shape:

```md
Researched 2026-11-11 · pnpm-lock.yaml 3f9a1c2 · fascicle 0.18.0, checkride 0.20.0

## Ecosystem

- fascicle 0.18.0 ships `web_tools`, so a host without web access can still run this lens.
  - source: <https://example.com/fascicle/changelog#0180>
  - changes: an Open question, whether the pass should fall back to it

## Codebase

- A file in a build folder gets a pure half and a reading half.
  - source: `src/lib/reachfile.ts:1`
  - changes: `like:` `src/lib/reachfile.ts` on step 2

## Record

- A local-only archive was tried and retired.
  - source: `docs/decisions.md:2043`
  - changes: nothing
```

What was found, where (a URL or `file:line`), and what it changes: a proposed Decision, an
Open question, a `like:` path, or nothing. A finding never becomes a Decision by itself. The
plan skill turns findings into proposals in `intent.md`, and the person keeps or cuts each
one at the plan pause, the way they keep or cut anything else there.

## The stamp

```sh
plumbbob research --stamp fascicle checkride
```

writes the first line: the date, the short git blob hash of each lockfile present at the repo
root (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `go.sum`, `Cargo.lock`, `uv.lock`),
and each named dependency with the version in `node_modules`. A dependency it cannot read
there is listed by name alone and is not refused, so a Go module or a crate can still be
named. A segment with nothing in it is left out: a repo with no lockfile and no dependency
named gets `Researched 2026-11-11` and nothing more.

The verb owns that one line and nothing else. With no `research.md` it creates the file
holding the stamp alone. With one, it replaces the first line when that line is a stamp,
and otherwise puts the stamp above what is there: a finding that happens to open on
`Researched` is a finding, and a stamp edited until it no longer reads as one is kept for
you to read. The findings beneath are never rewritten
([C4 (never-destroy)](decisions.md#c4)). Run again with no dependency named,
it keeps the names the stamp already holds, so a restamp is `plumbbob research --stamp`.

`plumbbob research`, with no flag, prints the stamp and what has moved since, and writes
nothing.

## The staleness row

A stamped lockfile has moved when its blob hash is no longer the one on the stamp, or the
file is gone. From then on the dashboard carries one row under the last checkpoint:

```text
research predates a lockfile change: fascicle 0.18.0 → 0.19.2
```

and the plan card carries the same fact as the last row of its state table:

```text
| Research | predates a lockfile change: fascicle 0.18.0 → 0.19.2 |
```

The row names each stamped dependency whose installed version changed. When none did, it
names the lockfile (`research predates a lockfile change: pnpm-lock.yaml`), which says that
something under the plan moved without saying the plan leans on it.

A stamped dependency can also change with no stamped lockfile moving: an install that left
the lockfile alone, or a repo that has none. Then the row reads
`research predates a dependency change: fascicle 0.18.0 → 0.19.2`, and it rides the same two
places. A dependency whose version can no longer be read (a fresh clone with nothing
installed) says nothing.

When the row shows, `/plumbbob:refine` offers to run the ecosystem lens again and restamp.
The codebase and record findings do not age with a lockfile, so they stay.

## It never gates

No verb refuses because of research. A build with no `research.md`, or one whose first line
is not a stamp, prints exactly what it printed before there was a research pass, byte for
byte. A stale stamp adds its one row and changes nothing else: `build`, `checkpoint` and
`finish` do not read the file. What to do about a stale row is the person's call, and
"nothing, the change does not touch this plan" is a fine answer.

One limit is worth knowing. The stamp compares the working tree, so a lockfile edited and
not yet committed already reads as moved, and a version is read from `node_modules`, so it
is the version installed here and may differ from the one the lockfile names until the next
install.

## See also

- [`skills-reference.md`](skills-reference.md): where the pass sits in `/plumbbob:plan`, and
  what `/plumbbob:refine` offers when the row shows.
- [`cli-reference.md`](cli-reference.md#research): the verb.
- [`state-and-git.md`](state-and-git.md): which build files are tracked, and why.
- [D158 (research-is-dated)](decisions.md#d158): why research carries a stamp.
