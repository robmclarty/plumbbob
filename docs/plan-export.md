# The plan as data: `plan.json`

A plan written for one builder can leave a great deal unsaid. When plumbbob walks the steps
one at a time, in build order, the order itself keeps two steps that touch the same file
from ever running together, and nobody has to write that down. Hand the same plan to a
second crew, one that lays several courses at once, and everything the order kept quiet has
to be said out loud: which step waits on which, where the work stops for a person, and how
hard each step should be worked.

`plan.json` is the plan said out loud. It sits beside a build's `intent.md`, in the shape
runciter's scheduler reads, `runciter.plan/1`, and it is derived from `intent.md` every
time, never written by hand. Runciter owns that shape (its
`docs/plan-protocol.md`, approved at commit `9b40f0f`); plumbbob only writes it. This page gives the three step lines
the export reads, what a step exports when it has none of them, how every other field is
filled, the checks a plan must pass before anything is written, and what keeps the file
current once it exists.

**A plan with none of the new lines exports fully serial.** Every line on this page is
optional, and the defaults say what plumbbob already does: one step after another, in build
order, with a stop at the end of each range. A plan only runs anything in parallel once a
person writes an `after:` line that says it may.

## The three step lines

A step in `## Steps` already carries sub-lines (`- seam:`, `- model:`, `- note:`). The
export reads three more, each at most once per step, each a plain value with no backticks:

| Line | Takes | Absent means |
| --- | --- | --- |
| `- after:` | step numbers and spans, comma-separated (`2, 4-5`), or `none` | the step before it in build order |
| `- stop:` | `planned` or `structural` | `planned` on a range's last step, `none` elsewhere |
| `- effort:` | `low`, `medium`, `high`, `xhigh` or `max` | `null`, which leaves the rung to the builder |

A worked step, from a plan where step 4 waits on steps 2 and 3 but not on whatever the build
order puts before it:

```markdown
4. [ ] feat(plan): derive runciter.plan/1 from intent.md, **done when:** `derivePlan` turns an intent into the contract's object, and the vendored example round-trips
   - seam: `src/lib/plan.ts`, `src/lib/__tests__/plan.test.ts`
   - model: opus (the contract's shape, where a wrong default is a parallel run)
   - after: 2-3
   - stop: structural
   - effort: high
   - note: vendor the schema and the example from runciter at `9b40f0f`.
```

It exports as:

```json
{
  "id": "step-4",
  "title": "feat(plan): derive runciter.plan/1 from intent.md",
  "range": "2",
  "depends_on": ["step-2", "step-3"],
  "seam": ["src/lib/plan.ts", "src/lib/__tests__/plan.test.ts"],
  "stop": "structural",
  "effort": "high",
  "done_when": "`derivePlan` turns an intent into the contract's object, and the vendored example round-trips",
  "context": ["vendor the schema and the example from runciter at `9b40f0f`."]
}
```

### `- after:`

The steps this one waits on, by plan number. The value is read by the same grammar a typed
range is (`src/lib/steplist.ts`): numbers and spans joined by commas, a span never running
backward, spaces after the commas allowed. `none` says the step waits on nothing, which is
how a plan lets a step start at once. A step with an `after:` line depends on exactly what
it names, and the default no longer applies to it.

Without the line, a step depends on the step before it in build order, and the first step in
build order depends on nothing ([D134 (serial-default)](decisions.md#d134)). Build order is
`## Build order` when the plan has one, and the numbering when it does not, the same order
every picker in plumbbob reads. A scheduler reads a missing dependency as "may run in
parallel", which is the unsafe reading, so the plan that says nothing exports the one
reading that is always safe.

`after:` never changes how plumbbob itself walks the plan. A range still lands its steps one
at a time, in build order; the line only tells a scheduler what it may overlap.

### `- stop:`

Where a scheduler stops for a person, taken after the step lands and before any step that
has not started. `planned` is a call the plan put there; `structural` marks a step that
changes a contract or would change a Decision or Constraint.

Without the line, the last step of each range in build order exports `planned`, and every
other step `none` ([D135 (range-end-stops)](decisions.md#d135)). plumbbob stops per range
and the contract stops per step, and a range's last step is where the same call falls. A
bare range (`/plumbbob:build 4`), whose call comes at the step's pause before it lands,
exports the same `planned` stop on step 4, taken after it lands on the integration branch
([D136 (bare-range-approximation)](decisions.md#d136)). The integration branch is not
`main`, and nothing builds on the step before the person reads it.

The line overrides the default in one direction only: it can add a stop, or make a range's
`planned` stop `structural`, but it cannot remove the stop at a range's end, since that
stop is the range's whole reason to exist.

### `- effort:`

The rung the step's builder starts on. Without the line it exports `null`. It is never
worked out from `- model:` ([D137 (effort-line)](decisions.md#d137)): a model names a seat
and a rung names how hard the seat works, and any table mapping one to the other goes stale
with the next model release.

## The rest of the mapping

Every other field is a fact plumbbob already parses, and a builder under runciter gets the
same context `plumbbob agent` hands one today ([D139 (field-mapping)](decisions.md#d139)):

| Field | From |
| --- | --- |
| `protocol` | always `runciter.plan/1` |
| `build.id`, `build.title` | the build's slug, and the title on `intent.md`'s first line |
| `source` | `intent.md`'s repo-relative path, and the sha256 of its bytes |
| `contract_paths` | always `[]`; contract paths and `contract.lock` are later work |
| `decisions`, `constraints` | the top-level bullets under `## Decisions` and `## Constraints`, verbatim, as the step context scrapes them |
| `steps[].id` | `step-<n>`, the step's plan number ([D133 (step-id)](decisions.md#d133)) |
| `steps[].title` | the step's title, before **done when:** |
| `steps[].range` | the item number of the `## Build ranges` entry naming the step, as a string, or `null` |
| `steps[].seam` | the step's seam tokens, as the strict seam parse reads them |
| `steps[].done_when` | the step's **done when:** text |
| `steps[].context` | the step's `- note:` lines, verbatim, in order |

A step's id is its number because plumbbob numbers a step for life: `plumbbob order`
rewrites the sequence in `## Build order` and never renumbers a step, so the id is as stable
as the number. Every step exports, landed or not, in plan-number order
([D140 (every-step)](decisions.md#d140)). The contract has no field for a landed step, and a
`plan.json` that dropped the landed ones would rewrite the dependency graph under the
person's feet.

The file is written one way ([D144 (bytes-compare)](decisions.md#d144)): two-space JSON,
keys in the contract's order (the order the table above lists them in, and within a step
`id`, `title`, `range`, `depends_on`, `seam`, `stop`, `effort`, `done_when`, `context`),
every default written out, and a trailing newline. "Current" means its bytes equal a fresh
derivation's.

## The seam grammar, now runciter's

A seam token is an exact repo-relative path or a `dir/` grant, as it always was
([D23 (no-glob-seams)](decisions.md#d23)). The parse now also refuses what runciter refuses,
so a plan plumbbob accepts is never one the scheduler rejects
([D138 (one-seam-grammar)](decisions.md#d138)). A leading `./` is still stripped before any
of these. A token that holds `*`, `?`, `[`, `]`, `{`, `}` or `!`, that holds a backslash,
that has an empty, `.` or `..` segment, or that starts with `/` prints, in that order:

```text
step 4's seam token `src/*.ts` is a glob; seams are exact paths or `dir/` grants, per D23 (no-glob-seams).
step 4's seam token `src\a.ts` holds a backslash; seams are POSIX paths, per D23 (no-glob-seams).
step 4's seam token `src//a.ts` has an empty, `.` or `..` segment; seams are plain repo-relative paths, per D23 (no-glob-seams).
step 4's seam token `/src/a.ts` is absolute; seams are repo-relative.
```

The last is unchanged, and the glob message trades its dash for a comma, so the three that
cite [D23 (no-glob-seams)](decisions.md#d23) read alike. The parse applies
everywhere a seam is read, not only at export: `plumbbob build` refuses such a step as it
enters it, which is where a glob was refused before.

## What the export refuses

`plumbbob export` derives the plan, runs every check below over it, and writes `plan.json`
only when nothing fails ([D143 (refuse-the-write)](decisions.md#d143)). On any failure it
prints each finding on its own line, then the tally, and exits 1, with the file untouched:

```text
plumbbob: step 5's `after:` names step 9, which the plan lacks.
plumbbob: steps 3 and 4, both in range 2, overlap at `src/lib/intent.ts`, and neither waits on the other; give one an `after:` line that reaches the other, or move one to another range.
plumbbob: export refused, 2 findings; plan.json not written.
```

A scheduler acting on a plan that fails these would run two steps at once that the plan
meant to order, so a failure is never a warning.

### The lines themselves

Before any check runs, each step's lines must read. A malformed or doubled `after:`,
`stop:` or `effort:` line is a finding that names the step, never a guess
([D141 (strict-fields)](decisions.md#d141)):

| When | Prints |
| --- | --- |
| `after:` holds anything else | ``step 4's `after:` line reads `2-`; it takes step numbers and spans, such as `2, 4-5`, or `none`.`` |
| `stop:` holds anything else | ``step 4's `stop:` line reads `soon`; it takes `planned` or `structural`.`` |
| `effort:` holds anything else | ``step 4's `effort:` line reads `hard`; it takes `low`, `medium`, `high`, `xhigh` or `max`.`` |
| a line is empty | ``step 4's `effort:` line is empty; it takes `low`, `medium`, `high`, `xhigh` or `max`.`` |
| a step has two of a kind | ``step 4 has more than one `after:` line.`` |

`none` stands alone: `after: none, 3` reads as malformed. A step whose seam will not parse,
or whose **done when:** is empty, fails here too, since the contract needs at least one seam
entry and a `done_when` on every step; the seam's words are the table above, and the other
prints ``step 4 has no **done when:** text; the contract needs one.``

### The contract's three rules

Runciter states three rules JSON Schema cannot express, and a planner checks them itself:

| Rule | Prints |
| --- | --- |
| 1. step ids are unique | ``two steps carry the number 4, so both would export as `step-4`; renumber one.`` |
| 2. every `depends_on` names a step of the plan | ``step-5 depends on `step-9`, which is not a step of the plan.`` |
| 3. `depends_on` has no cycle | ``steps wait on each other in a loop: step 3 → step 5 → step 3; one of their `after:` lines has to go.`` |

Rule 1 fires only on a plan edited by hand into two items with one number. Rule 2 is
plumbbob's check 1 read on the derived plan: a derived plan fails check 1 first, so rule 2
guards the derivation itself. A step whose `after:` names its own number is the shortest
loop rule 3 catches (`step 3 → step 3`).

### plumbbob's four checks

These belong to the planner, not the contract, and they run over the plan with the working
tree read in ([D151 (checks-at-export)](decisions.md#d151)):

| Check | Prints |
| --- | --- |
| 1. every `after:` names a step | ``step 5's `after:` names step 9, which the plan lacks.`` |
| 2. every undone step's seam path exists, or sits under a part that does | ``step 6's seam path `src/plan/export.ts` does not exist, nor does its folder `src/plan/`, and no part of keyframes.md's Map holds it.`` |
| 3. no two steps in one range share a seam unless one reaches the other | ``steps 3 and 4, both in range 2, overlap at `src/lib/intent.ts`, and neither waits on the other; give one an `after:` line that reaches the other, or move one to another range.`` |
| 4. no undone step's `after:` names a step that builds after it | ``step 3's `after:` names step 5, which builds after it; move step 5 earlier with `plumbbob order`, or drop it from the line.`` |

**Check 2** passes a path that exists, a path whose folder exists (a new file is the
ordinary case), and a path under an existing path that a part of the root `keyframes.md`'s
`## Map` names in its `- paths:` line ([D150 (under-a-part)](decisions.md#d150)). A `dir/`
grant's folder is the one it sits in, so `src/plan/` passes when `src/` exists. What fails
is a new file in a folder that does not exist yet, or a new folder outside every part, which
is usually a typo or a plan that drifted from the tree. "Its nearest existing ancestor"
would have been simpler, and it checks nothing, since that ancestor is always the repo root.
Landed steps are skipped: their seams are history, and a file a later step deleted is no
fault of theirs.

**Check 3** is the one a scheduler needs most, and the one ridgeline, the planner before
this one, never had. Two seams overlap by runciter's own test (`seams_overlap`): an entry of one equals an
entry of the other, or a `dir/` grant in either covers an entry of the other, so `src/lib/`
overlaps `src/lib/intent.ts` and `src/lib`, but not `src/library/a.ts`. Where the two
entries differ, the message names both (``overlap at `src/lib/` and `src/lib/intent.ts` ``).
The check passes when either step reaches the other through `depends_on`, directly or
through steps between ([D142 (reaches-not-names)](decisions.md#d142)): a chain serializes
two steps as surely as a direct edge, and demanding the edge would fill plans with
redundant `after:` lines. Steps that no range names are not grouped, so the check reads only
steps inside ranges. Under the serial default every step reaches every step before it, so
check 3 can only fire once an `after:` line has opened the plan up.

**Check 4** keeps the plan and plumbbob's own walk reading the order the same way
([D152 (no-forward-after)](decisions.md#d152)). If step 3 waits on step 5 but the build
order puts step 3 first, a scheduler holds step 3 until step 5 lands, while a range walked
by plumbbob builds step 3 first, before step 5 exists. One of the two is wrong about the
plan, and the fix is a person's: `plumbbob order` moves step 5 ahead, or the line drops it.
Landed steps are skipped, since their place in the order is history.

These checks bite at `plumbbob export` and at the check of a build that has a `plan.json`,
and not yet on the plan card; the card naming them belongs with the frontier card, which is
later work.

## Keeping `plan.json` current

**A build opts in by being exported once.** `plumbbob export` writes `plan.json` for the
active build, and `plumbbob export <slug>` for any build folder, a finished one included
([D145 (export-verb)](decisions.md#d145)). A build that has never been exported has no
`plan.json`, and it reads, renders, checks and commits exactly as it did before this page
existed ([D149 (opt-in-by-presence)](decisions.md#d149)): a person with no scheduler pays
nothing for one.

Once the file exists, two things keep it honest:

- **The CLI keeps up with its own writes.** `checkpoint` (its tick of the step's box),
  `plumbbob order` and `plumbbob defer` each write `intent.md`, and each re-exports right
  after, so a verb the person ran never turns the next check red
  ([D146 (cli-keeps-current)](decisions.md#d146)). The checkpoint stages the refreshed
  `plan.json` in the same commit as the tick that changed it.
- **The check catches every other edit.** `plumbbob check`, and the checkpoint gate with
  it, derives the plan afresh and compares bytes. A hand edit, or a model's edit through
  `/plumbbob:step` or `/plumbbob:refine`, leaves the file behind, and the check fails until
  `plumbbob export` runs again:

```text
plumbbob: plan.json is behind intent.md; run `plumbbob export` to bring it current.
```

Any byte counts, since `source.sha256` is the hash of the whole file: a typo fixed in the
Frame drifts the plan as surely as a new step does, which is what lets a reader tell a
stale plan from a current one. When the fresh derivation fails a rule or a check, the check
prints those findings in the words above instead, and `plumbbob export` refuses until they
are fixed.

## Conformance

The JSON Schema and the example are copied byte for byte from runciter at `9b40f0f` into
`test/contract/runciter-plan/`, with a README naming the commit and the source paths
([D148 (vendored-contract)](decisions.md#d148)); runciter is private and unpublished, so
the test cannot import it. The tests validate every derived plan against that schema with
`ajv`, a dev dependency the CLI never imports
([D147 (ajv-dev-dep)](decisions.md#d147)), check the three rules on each, and round-trip
the vendored example through both.
