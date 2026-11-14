# The reach: what a step's seam drags along

A step's seam is a guess made before any code exists. It names the files the step means to
change, and it is usually a little short: change the limiter and the server that wires it
moves too, though nobody wrote the server down. A reviewer who sees that file in the diff has
to decide, cold, whether the work wandered or the plan forgot something it should have
expected.

The reach is the answer to that question, worked out before the step is built. It is the ring
of files a change to the seam usually drags along, by import and by habit. With it, the pause
sorts every changed file into one of three bins, and only the last asks anything of you.

**The reach is computed, never written.** It comes from atis, a
separate tool that reads the repo's import edges and its commit history. The plan never carries a reach line, because a hand-written
ring is a second seam nobody checks
([D155 (reach-is-computed)](decisions.md#d155)).

## The seam and the reach

- The **seam** is the step's `- seam:` line: the exact paths, or `dir/` grants, the step is
  expected to touch. A person or a model writes it at plan time.
- The **reach** is what atis says a change to those paths would touch: the files that import
  them, hop by hop, and the files that have changed in the same commits often enough to
  count. Nobody writes it.

Neither is a lock. The seam is orientation
([D13 (no-edit-guards)](decisions.md#d13)), and the reach is advice about the seam.

## When plumbbob asks

plumbbob looks for `atis` on PATH and asks it at two moments:

- **When the plan is approved.** `plumbbob checkpoint --plan` asks once per undone step that
  has a seam, just before it stages the build folder, so the answers ride the plan commit.
- **When a step is entered with a changed seam.** `plumbbob build <n>` asks for that one
  step when nothing is stored for it, or when its seam is no longer the paths its stored
  answer was asked for. With a current answer, atis is not run at all.

Each pass runs `atis --version` once, then `atis reach --json -- <seam paths>` for each step in
turn, at the repo root. No other verb asks: `handoff`, `checkpoint <n>`, `order` and `defer`
only read what is stored.

## `reach.json`

The answers live in `.plumbbob/builds/<slug>/reach.json`, tracked beside `intent.md` like
the rest of the build's record:

```json
{
  "atis": "0.1.0",
  "steps": {
    "3": {
      "schema_version": 1,
      "kind": "atis.reach",
      "head": "9f3c2a1",
      "paths": ["src/limiter.ts", "src/__tests__/limiter.test.ts"],
      "new": [],
      "reach": [
        { "path": "src/server.ts", "by": "import", "hops": 1, "via": ["src/limiter.ts"] },
        { "path": "src/config.ts", "by": "cochange", "rate": 0.6, "support": 5, "with": "src/limiter.ts" }
      ],
      "muted": []
    }
  }
}
```

`atis` is the version that answered. Each entry under `steps` is keyed by step number and
holds atis's answer verbatim, every key as it came. plumbbob reads two of them: `paths`, to
tell whether the answer still speaks for the step's seam, and each `reach` entry's `path`.

The file is two-space JSON with a trailing newline, its steps in numeric order, and it is
rewritten only when its bytes would change. A landed step keeps its answer, since its record
was measured against it. A key that names no step of the plan is dropped on the next write.
A file that does not parse reads as no reach at all.

An answer is current while its `paths` are the step's seam as a set: order is ignored, a
leading `./` is dropped, and a trailing `/` counts. An answer asked for other paths is
stale, and the pause reads as though there were none.

## The plumb row

At the pause, a step with a current answer shows `plumb` where the Readout's `seam` row
would stand:

```text
plumb        seam 3 · reach 1 · out 1 (src/routes/admin.ts)
```

Each file in the step's diff lands in exactly one bin:

| bin | the file is | what it asks of you |
| --- | --- | --- |
| `seam` | covered by the step's seam | nothing; it was planned |
| `reach` | in the reach, not the seam | nothing; the ripple the plan could have expected |
| `out` | outside both | read it, then judge |

A file the seam covers counts as `seam` even when the reach lists it too. All three counts
always print, so a step that held reads `plumb        seam 1 · reach 1 · out 0`.

A file outside both is the only stray. One is named on the row; when its path would push the
value past 67 columns it moves to a `→` line beneath, and two or more take one `-` line
each. Any `out` above zero folds the Verdict to `◐ A hair off (seam strayed)`, the same
advisory rung and the same words a seam stray earns today, and never lower.

Two other places read the stored reach the same way:

- **The checkpoint's advisory.** Staged paths outside the seam and the reach print
  `Staged paths reach outside Step 3's seam and its reach ⚠`, with the paths. A file in the
  reach raises no advisory.
- **The stop card.** The range's `seam` row keeps its label and its wording, but a landed
  step with a current answer no longer counts a file in its reach as a stray.

## With no atis

atis is optional, and plumbbob says nothing about it during a build. When `atis` is not on
PATH, exits non-zero, runs past its time (5 seconds for the version, 20 for a step), or
answers anything other than `kind: "atis.reach"` at `schema_version: 1`, plumbbob writes no
file and prints no line. The `seam` row, the advisory and the stop card read exactly as they
did before there was a reach. A missing binary or a timeout ends the pass; any other bad
answer skips that one step and the pass goes on.

`plumbbob doctor` is the one place that mentions it, in its last section, and neither line
counts as a problem:

```text
plumbbob doctor — reach — D155 (reach-is-computed)
  ○ atis: not on PATH (optional; without it the pause reads a step's diff against its seam alone)
```

With atis found, the line reads
`✓ atis <version>: the pause splits a step's diff into seam, reach, and out`.

## It never refuses

No verb fails because of the reach. A file outside both rings is named and counted on the
advisory rung, and the checkpoint still lands it, exactly as it lands a seam stray. What to
do about one is the same call as before: read the named path, and widen the seam with
`/plumbbob:step` if the plan was the thing that was wrong.

Two limits are worth knowing. A stored answer was taken at the plan's commit (its `head`),
and nothing asks again as steps land unless the seam changes, so the ring ages with the
build. And a `build`-time answer rewrites `reach.json`, a tracked file, so a step that
changes nothing else still has that one file to commit.

## See also

- [`presentation.md`](presentation.md#the-readout): the Readout's rows and how the Verdict
  folds them.
- [`plan-export.md`](plan-export.md): the plan as data, where a step's seam is also read.
- [`state-and-git.md`](state-and-git.md): which build files are tracked, and why.
- [D155 (reach-is-computed)](decisions.md#d155): why the ring is computed and never written.
