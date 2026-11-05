# Running PlumbBob with only the CLI

The skills shell out to the CLI, so in the loop you rarely type it. It is a first-class
path on its own: every verb runs from a terminal, and a few (`use`, `handoff`, `defer`,
`check`, `agent`) have no skill of their own. This page drives one build that way, start
to finish. Every flag and exit code is in [`cli-reference.md`](cli-reference.md); what a
stop card means is in [`runs.md`](runs.md) and [`presentation.md`](presentation.md).

## What you keep and what you give up

**The verbs and the record are the same; the hooks and the prose are gone.** A build
driven from a terminal writes the same tracked folder (`intent.md`, `build-log.md`,
`checkpoints`, `stats.json`, `report.md`), and `checkpoint` runs the same full gate
before every landing. Four hooks do not run. `plumbbob turn` (`UserPromptSubmit`) ticks
the turn ledger the approval latch reads; without it the ledger is dormant and the latch
stands down. `plumbbob relay` (`Stop`) checks that a turn ended on its card; nothing
checks a terminal. The post-edit lint runs oxlint and ast-grep on each edited file; the
substitute is one narrow gate run:

```sh
plumbbob check --bail --only lint,struct
```

The fourth asks before a raw `git commit` while a step is in flight. Nothing asks now;
land the step through `checkpoint`, the one commit that records it.

## Before you start

**Install the CLI globally and skip the plugin link.** A marketplace plugin puts
`plumbbob` on `PATH` only inside a Claude Code session ([`install.md`](install.md)); a
plain terminal needs the npm package:

```sh
npm i -g plumbbob
plumbbob doctor
```

`plumbbob init` links the plugin into Claude Code; skip it. `doctor` reports
`not linked` and exits 1 only when no plugin is linked at all, neither a skills-dir link
nor a marketplace install; on such a machine that line is expected. Beneath it, the slot
table says what a green gate covers here, and the latch line reads `○ latch: dormant`
until a hook has ticked the ledger. `start` refuses a directory that is not a git repo,
a repo with no commits, and a dirty tree (`--allow-dirty` overrides the last).

## The build, verb by verb

**The title comes first.** `start` takes every argument that does not begin with `--`
as positional, so a `--slug` written before the title makes the slug the title:

```sh
plumbbob start "Rate-limit the login endpoint"
plumbbob start "Rate-limit the login endpoint" --slug rate-limit
```

It writes the session sentinel, seeds `.plumbbob/settings.json` as `{}` when absent,
plants `.plumbbob/builds/<YYYY-MM-DD-slug>/` with `intent.md`, `build-log.md`, and
`checkpoints`, and narrows `.git/info/exclude`. Edit `intent.md` by hand (the next
section says which lines matter), read it as the plan card would, and commit it:

```sh
plumbbob status
plumbbob status --questions
plumbbob handoff --plan
plumbbob checkpoint --plan
```

`status --questions` prints the questions table, or `no open questions in this plan`.
`checkpoint --plan` stages only the build folder and commits `chore(<scope>): plan`, so
the first step's diff does not absorb the scaffold
([D36 (plan-commit)](decisions.md#d36)); it runs no check gate.

Each step is the same five moves. Enter it:

```sh
plumbbob build 1
```

`build` takes one step number: no `--auto`, and a range such as `2-3` is refused, since
that is a `/plumbbob:build` range, a grant typed in a prompt. Write the code. A tangent
goes to the park list as one raw line:

```sh
plumbbob park "a Retry-After header on the 429 (tangent)"
```

Run the gate narrow while you iterate, then once in full before the pause:

```sh
plumbbob check --bail --only lint,struct
plumbbob check
```

It prints `plumbbob: check green.`, `check RED`, or `check ERROR`, exits 0, 1, or 2, and
changes nothing but `.check/`. A checkride that detects no tool refuses to call that
green; `{"check": "npm test"}` in `.plumbbob/settings.json` gates through another
command.

Review your diff against the done-when, the Decisions, and the Constraints, write
`.plumbbob/detail.md` (the shape is two sections down), and render the pause:

```sh
plumbbob handoff 1
```

Read the card, then land the step:

```sh
plumbbob checkpoint 1
```

`checkpoint` runs the full gate (no flags, ever), commits everything with `git add -A`
under `<type>(<scope>): <title>`, and only then writes its bookkeeping: the `[x]` in
`intent.md`, the `step 1 <sha>` line, the Log entry from your detail file, and
`stats.json`. The tree is dirty when the verb returns. Leave it so; the next landing
sweeps the tail up, and `finish` absorbs the last
([D37 (bookkeeping-sweep)](decisions.md#d37)); a hand commit of it is surfaced as an
out-of-band commit ([D66 (oob-commits-surfaced)](decisions.md#d66)). `build` is
optional: a diff written with nothing in flight renders through `handoff 1` and lands
through `checkpoint 1`.

After the last step, write `report.md` and close:

```sh
plumbbob finish
```

## The lines the CLI reads in `intent.md`

**The CLI machine-reads a handful of lines; everything else is yours.** Under `## Steps`:

```markdown
1. [ ] feat(login): count failed logins per account, **done when:** six failures in a
   minute return 429, covered by a test
   - seam: `src/login.ts`, `test/login.test.ts`
   - model: sonnet
```

The opener is the number, the box, a title that becomes the commit subject, and
`**done when:**`; a step without a done-when is not planned. The `seam:` line is exactly
one, its paths backticked, repo-relative, and never a glob
([D23 (no-glob-seams)](decisions.md#d23)); `build` refuses a step with no seam line, two
of them, an empty one, a glob, or an absolute path. The `model:` line is optional, and
one still holding the template's `<...>` fill-in reads as absent, as does the
`**Scope:**` header's `<short-scope>`, where the scope falls back to the slug without its
date. The template's two placeholder steps parse as real steps; replace or delete them.

Two sections are written for you. `## Build order` holds one line of numbers and spans;
write it with the verb, which re-cuts the ranges to follow it
([D109 (ranges-follow-the-order)](decisions.md#d109)):

```sh
plumbbob order 3 1
plumbbob order --reset
```

`## Build ranges` items keep the slash form even here: the parser reads only
`/plumbbob:build <list>` between the backticks, and `plumbbob build 2-3` there leaves
the range unread:

```markdown
1. `/plumbbob:build 1`, **stop:** decide the window first
2. `/plumbbob:build 2-3`, **stop:** try six logins yourself, then finish
```

An open question opens `- <a id="q1"></a>**Q1 (slug)**: …, *resolve by:* …`, and
leaving one to the work is a verb, not an edit
([D123 (defer-records)](decisions.md#d123)):

```sh
plumbbob defer Q1 "step 2's latency numbers"
```

## The four `detail.md` shapes

**One untracked file carries your judgment into the record**
([D81 (detail-file)](decisions.md#d81)). `.plumbbob/detail.md` sits beside `builds/`,
not inside it; `handoff` renders the card from it, and `checkpoint` records it under the
build-log's `## Log`, then clears it. A step's file:

```markdown
# Detail · Step 1 · feat(login): count failed logins per account

── recap · step 1 of 3 ──
done-when    met
decisions    honored: D1 (window-per-account)
constraints  all honored

## Summary

<the outcome, one sentence or a short paragraph>

## 1 <the first highlight>

<the full story: what moved, why, what was tried and dropped>

## Recommendation

<The move.> <The reason.>
```

The parsers are exact. The header must read `# Detail · Step N · <title>`; a header
naming another step is a leftover, and `checkpoint` deletes it without recording it. The
recap opener is `── recap · step N of M ──`, ruled in U+2500 box-drawing dashes and
separated by the U+00B7 middle dot; a hyphen or a period there and no row is read. The
rows are three, `done-when`, `decisions`, and `constraints`, the judged rows, each
opening with a verdict word from [the readout](presentation.md#the-readout)'s closed
set. `check`, `seam`, and `diff` are measured, so a row you write for any of them is
replaced. The rows are contiguous; the first blank line ends them. The headings match
whatever their case, and `handoff` pads each with a blank line.

The other three share the grammar. `# Detail · Plan · <title>` carries `## 1 …` holes
and a `## Recommendation`, no recap; `checkpoint --plan` records it as the cold read.
`# Detail · Harvest` carries a `## Harvest` section, one proposal per open park, its
handle the park's place in the list counting harvested lines too:

```markdown
## Harvest

- P1 → tangent: the header is a courtesy the plan did not ask for
  - title: Retry-After on the 429
  - why: clients back off sooner
```

`# Detail · Range N · <stop>` is a step's file written for a whole range: the opener
reads `── recap · range N of M ──`, the Summary covers every step the range landed, and
`## Harvest` rides before the Recommendation.

## The card's moves, as verbs

**The card's Your Call is worded for an agent; by hand each reply is a verb.** The pause
prints `looks good → I checkpoint Step 1`, and at a terminal "I" is you:

| The reply | By hand |
| --- | --- |
| `looks good` | `plumbbob checkpoint 1` |
| a direction | edit, `plumbbob check`, rewrite `detail.md`, then `plumbbob handoff 1 --full` |
| `revert` | `plumbbob revert` (the build folder survives) |
| keep the work, drop the step | `plumbbob abandon` ([D79 (abandon-keeps-work)](decisions.md#d79)) |
| `expand 2` | read `## 2` in `.plumbbob/detail.md` |

A card shows once. A second `handoff 1` prints one line, `**Next Up**: Back to
**Step 1**…`, and `--full` brings the card back.

## The latch without hooks

**The approval latch reads four things, and the first row that matches wins**
([D64 (approval-latch)](decisions.md#d64)). `checkpoint` reads the shape of stdin,
`.plumbbob/TURN`, `builds/<slug>/TICK`, and `.plumbbob/GRANT`, in this order:

| Row | What it reads | Outcome |
| --- | --- | --- |
| 1 | stdin is a terminal | allow: a human at the keyboard |
| 2 | `TURN` or `TICK` is absent | allow: the dormant ledger |
| 3 | a `GRANT` (`auto`, `steps <list>`, or `range <M>`) | allow inside its bounds; refuse a step past them |
| 4 | `TURN` is greater than `TICK` | allow: a human turn intervened |
| 5 | none of the above | refuse: `no human turn since this step began` |

A repo the hook has never ticked lives on row 2: `TURN` never exists, `build` stamps
`TICK` only when `TURN` does, and every landing passes, at a terminal, through a `--body`
heredoc, or from a script.

**A ledger once ticked is never cleared.** `finish` deletes `TICK`, `GRANT`, and `STATE`
and leaves `TURN`, so a repo that has run one hooked session keeps its count, `build`
stamps `TICK` equal to `TURN`, and the latch reads by stdin. A bare
`plumbbob checkpoint 1` at the terminal passes on row 1, where `--body` is ignored and
the deterministic body (done-when, seam, diffstat) is used. A `--body <<'BODY'` heredoc
moves stdin off the terminal, so the decision falls through: both files exist, no grant,
`TURN` equals `TICK`, refuse. The refusal is the pause, and it ends as it does in a
session, with a human turn. Record one, then land:

```sh
plumbbob turn
plumbbob checkpoint 1 --body <<'BODY'
Misses count; a success does not reset the window.
BODY
```

`plumbbob turn` at a terminal reads no stdin, adds one to `TURN`, and clears any grant.
It is the statement "I, the human, reviewed this", the tick your keystroke makes in a
session, and it is yours to type. It is not a bypass, and none exists: `checkpoint`
takes only `--plan`, `-m`, and `--body`, no environment variable opens the latch, and the
settings `auto` key grants nothing; set, it only decorates the refusal
([D67 (auto-not-a-grant)](decisions.md#d67)). `abandon` reads the same five rows, and
`harvest`'s stop record a cousin of them: a terminal, a dormant ledger, or a `TURN` past
the turn the card printed in.

## Between steps and at the end

**Parks are judged cold, at a boundary, and the verbs record the judgment**
([D7 (park-then-harvest)](decisions.md#d7)). Outside a stop, write a `# Detail · Harvest`
file with one proposal per open park, then render the lean table:

```sh
plumbbob handoff --harvest
```

Fold a blocker into `intent.md` yourself (a new step, and a Decision saying why), order
it, then record:

```sh
plumbbob order 4 3
plumbbob harvest
```

`harvest` flips each settled park to `- [x]`, appends the dated Harvest lines, clears the
detail file, and commits nothing; `handoff --harvest` refuses when no park is open.

A range that lands its steps ends on a stop card. Once its last step has landed, write
`# Detail · Range N · <stop>`, render it, then record:

```sh
plumbbob handoff --stop
plumbbob harvest
```

`handoff --stop` stamps `STOP` with the range and the turn it printed in, or `-` with no
ledger, and the record's lead reads `**Stop**: **Range 2** recorded (…)`. No `RUN` mark
is needed. [The stop card](presentation.md#the-stop-card) says what it asks;
[runs.md](runs.md#the-same-plan-by-hand) drives the same plan three ways.

At the end, write `.plumbbob/builds/<slug>/report.md` with five sections,
`## What shipped`, `## Decisions and why`, `## Parked & harvested`, `## Final status`,
and `## Deferred tangents`, and stop there: `finish` appends `## Checkpoints` and
`## Stats` itself, makes the `chore(<scope>): finish` commit, and deletes `SEAM`, `STEP`,
`SPIKE`, `TICK`, `GRANT`, and `STATE`. It refuses only with no session, so land or
abandon an in-flight step first, or its diff rides the commit under `finish`.

## What the skills do that the CLI cannot

**Every judgment in the loop is a skill's, and by hand it is yours.** The verbs record;
they do not decide. What the CLI leaves to you:

- the plan interview and the spec absorb: Frame, Decisions, Constraints, steps with
  done-when and seam, ranges, questions, the cold read (`/plumbbob:plan`)
- the adversarial pass, and the repair after a blocker (`/plumbbob:refine`,
  `/plumbbob:step`)
- the self-review, the recap's verdict words, the Summary, the highlights, the
  Recommendation, and a commit body sized to the step (`/plumbbob:build`,
  `/plumbbob:verify`)
- one proposal per park, with its reason (`/plumbbob:harvest`)
- a park line tidy enough to judge cold (`/plumbbob:park`); the verb takes raw text
- the whole remaining sequence from "7 and 8 before 5" (`/plumbbob:order`); the verb
  takes the steps you move and fills the rest in document order
- settling a waiting stop card, and the report (`/plumbbob:finish`)
- the experiment, and the report's verdict (`/plumbbob:spike`)

`status`, `doctor`, `recover`, `revert`, and `abandon` add nothing over their verbs. The
rest (the gate, the commits, the ledger lines, the re-cut ranges) is the CLI's, typed or
shelled.
