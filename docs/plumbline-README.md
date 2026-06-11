# Plumbline

A manual, attention-first process for building software *with* an LLM instead of
being dragged behind one. The layer below Ridgeline: where Ridgeline runs
autonomously without you, Plumbline keeps you in the driver's seat for the small-
to-medium work that doesn't justify a full autonomous build — a feature, a bug, a
refactor — while staying deliberate rather than vibing.

> Ridgeline is the line. Plumbline establishes *true* before you build.
> The LLM is a hand, not a head.

## The one law

**Vibe to execute, never vibe to decide.**

Vibing is fine — *once every decision being carried out was already made on a
surface outside the chat.* It becomes a slot machine only when the deciding
happens inside the stream while code is flowing. The whole job of Plumbline is to
keep decisions and execution from fusing:

- The **human** owns convergence. You decide, choose, pick the branch.
- The **LLM** owns divergence in design (finding holes, generating options) and
  convergence *only* in build (executing a decided step).
- The **boundary** between deciding and executing is enforced by tooling, not by
  willpower.

If you feel tired and lost, those two activities have fused again. The fix is
never "prompt better." It's "stop, leave the chat, go decide, come back."

## Why it works: get the plan out of your head

The exhaustion is a working-memory problem. You can't *produce* intent and
*consume* the model's output at once — consuming overwrites producing. So
Plumbline externalizes your plan onto two flat files that survive the flood:

- `intent.md` — what you decided, before any code. Your canonical intent.
- `build-log.md` — the live ledger of steps, parked ideas, and decisions.

When the model floods you, you read the page, not your memory. The chat is
ephemeral; the docs persist. **The chat is a hand; the docs are the head.**

## The mode machine

Plumbline is a small state machine. The current mode lives in one word in
`.plumbline/STATE`, and the hooks read it. The machine encodes exactly one fact
the hooks care about — *are code edits allowed right now?* — so it stays small.

| STATE    | What's happening                                          | Code edits      |
|----------|-----------------------------------------------------------|-----------------|
| `DESIGN` | Frame, interrogate, decide, triage — code-locked doc work | ❌ (docs only)  |
| `BUILD`  | Executing one step; edits confined to the SEAM            | ✅ seam only    |
| `REVIEW` | Reading the diff cold against `intent.md`; check is green | ❌              |
| `SPIKE`  | Timeboxed throwaway experiment in a worktree              | ✅ throwaway    |
| `FINISH` | Reporting, optional docs, archive                         | ❌              |

**The muzzle rule:** *code edits are allowed iff `STATE ∈ {BUILD, SPIKE}`.* Every
other state mechanically refuses them. `intent.md` and `build-log.md` are always
editable so DESIGN and FINISH can do their work.

`DESIGN` deliberately absorbs framing, interrogating, deciding, and triaging.
They're mechanically identical (code-locked, editing docs), and the real loop
bounces between them (interrogate → decide → new question → interrogate) rather
than marching in a line. The fine-grained phase label lives as a field in
`intent.md`, not as machine state.

**You almost never set STATE by hand.** It's a side effect of the verbs you type
and the skills you invoke. You think "build step 2" or "I'm done with this step,"
never "set state to BUILD." A raw `plumbline mode <x>` exists as a hidden escape
hatch for when reality and the machine desync, but it's not part of the flow.

## The verb contract

What you actually type. Mechanical verbs are a dumb `plumbline` CLI run from the
integrated terminal; the judgment work is skills invoked from the chat pane. Both
live inside one editor — the split is judgment-vs-mechanism, not app-vs-app.

| Verb / skill              | Does                                                                    | Kind          |
|---------------------------|-------------------------------------------------------------------------|---------------|
| `plumbline start "<t>"`   | scaffold `.plumbline/`; `STATE=DESIGN`; baseline commit recorded        | CLI           |
| `/plumbline-interrogate`  | `DESIGN`; attack the frame for holes; **no code**                       | skill (Opus)  |
| `plumbline build <n>`     | write `SEAM` from step n; `STATE=BUILD` (re-entering a step just flips) | CLI           |
| `plumbline review`        | run the heavy check; if green → `STATE=REVIEW` (muzzle back on)         | CLI           |
| `plumbline done`          | ensure check green; **checkpoint commit** + record SHA; `STATE=DESIGN`  | CLI           |
| `plumbline park "<text>"` | append a raw line to the park list; model never sees it                 | CLI (dumb)    |
| `/park`                   | compose one tidy tagged line, you approve/edit, then append             | skill (Haiku) |
| `/plumbline-triage`       | `DESIGN`; classify the park list blocker/tangent/pivot                  | skill (Opus)  |
| `plumbline revert [--to n]`| `git reset --hard` to a checkpoint SHA; `STATE=DESIGN`                  | CLI           |
| `/plumbline-report`       | `FINISH`; synthesize the conclusion from intent + log                   | skill (Opus)  |
| `/plumbline-docs`         | `FINISH`; update `docs/` from canonical intent (optional)               | skill (Opus)  |
| `plumbline finish`        | **refuse unless a report is archived**; archive; clear; muzzle off      | CLI           |
| `plumbline mode <x>`      | escape hatch: set STATE directly (not part of the normal flow)          | CLI (hidden)  |

Why this split, mechanically: invoking a skill *is* invoking the model, so there
is no model-free skill. The truly dumb capture path is therefore the terminal
`plumbline park`, not a skill. Three reinforcing layers encode judgment-vs-
mechanism, so the philosophy holds without willpower:

- terminal CLI vs skill → mechanism vs needs-a-model
- `` !`...` `` pre-injection vs compose-confirm → transition vs composition
- Haiku vs Opus → transcription vs judgment
- and `disable-model-invocation: true` on every skill → *you* own every trigger;
  the model never decides to converge.

## The loop

### Design phase — `DESIGN`, no code

1. **Frame** *(you, on paper / TextEdit, chat closed)* — the problem, the smallest
   thing that solves it, what "done" looks like, what you are explicitly NOT doing.
   Sketch the architecture by hand. The slowness is the feature: it forms your
   model before the LLM's can colonize it. This is the one mode with no mechanical
   backing — framing-before-chat is yours to keep.
2. **Interrogate** *(`/plumbline-interrogate`, Opus)* — hand it the frame, ask it
   to attack: ambiguities, edge cases, hidden assumptions, collisions with
   existing code. The only divergence you want this early, and it's in the
   *problem* space, not the solution space.
3. **Decide** *(you, editing `intent.md`)* — resolve each hole to one line.
   Unresolvable holes become explicit Open Questions, never guesses.
4. **Seams** *(you)* — for each step, which files it may touch, the interface, and
   what stays untouched. Each step's seam is what `build <n>` writes into `SEAM`.

Then flip to BUILD — and only then. Everything above happens code-locked.

### Build phase — one verified step at a time

1. **`build <n>`** writes `SEAM` for step n and unlocks edits to those paths only.
   The model writes the step; the seam-guard refuses edits anywhere else.
2. **`review`** runs the heavy check; green flips to muzzle-on `REVIEW`. You read
   the diff *as an editor against `intent.md`*, edits locked, so reading can't
   slide into editing. Found a fix? `build <n>` re-enters BUILD (same seam, no new
   checkpoint), fix, review again. Skippable for trivial steps.
3. **`done`** guarantees the check is green, takes the checkpoint commit, records
   its SHA, and returns to `DESIGN` ready for the next step or finish.
4. **Capture, don't chase.** Every new problem/idea mid-step goes to the park
   list, untouched — `/park` (Haiku composes a legible line) when heads-down and
   you want it written for you, or raw `plumbline park` when you don't want a model
   turn at all. Acting on ideas the instant they arrive is the disease.
5. **Triage at the boundary.** After a step is green, `/plumbline-triage` proposes
   a class for each parked item and *you* call it: **blocker** (plan was wrong →
   fold into `intent.md`, handle now), **tangent** (different, not clearly better →
   defer or kill; the default), **pivot signal** (evidence the whole approach is
   wrong → stop and replan). Almost everything that feels like a pivot is a tangent.

**The blocker path.** A true blocker can't wait for the boundary — there's no
green to reach. Treat hitting the wall as a boundary: `plumbline revert` to the
last done-checkpoint (discarding the half-done step), flip to DESIGN, fold the new
decision into `intent.md`, revise the step, and `build <n>` again. The seam-guard
blocking an edit *outside* the declared seam is often how a blocker first reveals
itself — it caught scope drift and turned it into a deliberate decision.

### The spike protocol — genuine forks only

For a real fork the design phase couldn't settle — two viable approaches, can't
tell on paper which wins — flip to `SPIKE`: timeboxed throwaway in a `git
worktree` per option, compare, pick one, **delete the rest**. Record the verdict
in `intent.md` and return to BUILD. Accidental drift becomes a bounded experiment
with a forced end.

### Finish phase — `FINISH`

Three parts, in order, because two read from `.plumbline/` before it resets:

1. **`/plumbline-report`** reads `intent.md` + `build-log.md` and writes the
   conclusion: what shipped, the decisions and why, what was parked and how each
   was triaged, final status, and the deferred tangents that become future
   Plumblines. The "yeah, I did that" artifact.
2. **`/plumbline-docs`** *(optional)* updates real documentation in `docs/` from
   the canonical parts of `intent.md`. Conservative by design — a bug fix usually
   shouldn't spawn a doc.
3. **`plumbline finish`** *(run last)* **refuses unless a report exists** — the
   closing gate, symmetric with the step gate, so you can't walk away without
   capturing what happened. It then archives `intent.md` + `build-log.md` + report
   to `.plumbline/archive/<date>-<slug>/`, clears the active files, and deletes
   `STATE` and `SEAM`. Deleting `STATE` last is what switches the muzzle off
   exactly when the session ends.

"Reset for the next task" means **archive-then-clear, never destroy.** Because the
archive lives inside `.plumbline/`, history accumulates while the active files
reset. The archive is plain markdown; indexing past builds for retrieval is a
possible later step, deliberately out of scope here.

## Hooks — mechanize the boundaries

Three hooks, all **session-gated**: each one's first act is to check for
`.plumbline/STATE` and short-circuit to *allow* if there's no session. "Always
runs" is not "always enforces" — the check is a microsecond `test -f`. So a quick
fix in a repo with no active session behaves like plain Claude Code; the process
is opt-in per task, not per repo. The hook walks up from cwd to find `.plumbline/`
the way git finds `.git`, so it works from subdirectories. Register globally in
`~/.claude/settings.json`; it sleeps until you `start`.

1. **Muzzle** — `PreToolUse` on `Edit`/`Write`. No session → allow. Path is
   `intent.md`/`build-log.md` → allow (doc whitelist). `STATE ∈ {BUILD, SPIKE}` →
   allow. Else block.
2. **Seam-guard** — `PreToolUse` on `Edit`/`Write`. In BUILD, block any path not
   listed in `.plumbline/SEAM`. The sidecar is a plain path list precisely so the
   hook is a trivial grep with no markdown parsing.
3. **Light feedback** — `PostToolUse`, **non-blocking**. Incremental `tsc` +
   `oxlint` + `ast-grep` on changed files; injects failures into the model's
   context so it self-corrects in flow. It never blocks the edit — you constantly
   have intentionally-broken intermediate states mid-step.

```sh
# combined pre-edit hook (pseudocode)
root=$(find_up .plumbline) || exit 0          # no session anywhere: allow
[ -f "$root/.plumbline/STATE" ] || exit 0     # dormant: allow
case "$EDIT_PATH" in
  */intent.md|*/build-log.md) exit 0 ;;       # docs always editable
esac
mode=$(cat "$root/.plumbline/STATE")
case "$mode" in
  BUILD|SPIKE) grep -qFx "$EDIT_PATH" "$root/.plumbline/SEAM" && exit 0
               echo "blocked: $EDIT_PATH outside SEAM" >&2; exit 2 ;;
  *) echo "blocked: edits not allowed in $mode" >&2; exit 2 ;;
esac
```

## Gates — two tiers, different jobs

The light tier *serves the model*; the heavy tier *gates the human's boundaries*.
Don't conflate them — your editor's LSP already gives you live diagnostics, so the
light hook exists only because Claude can't see those.

- **Light** — the non-blocking `PostToolUse` feedback above. Runs the checks whose
  violations *compound* if the model leaves them (type errors, your
  no-class / no-default-export ast-grep rules). Per changed file. Never blocks.
- **Heavy** — the full `pnpm check` (tsc, oxlint, ast-grep, vitest, knip,
  markdownlint, fallow). Not a hook: it runs *inside* `review` and `done`, which
  **refuse to advance if red.** Putting the hard gate on the deliberate boundary
  verb is what keeps it from being per-keystroke slowness. Run `tsc` incremental
  or via a persistent daemon so even the heavy tier stays snappy.

## Git footprint — additive only

Plumbline commits, and it resets to its own commits. **It never rewrites history.**
The checkpoint commits (`plumbline: step n done`) are cheap WIP markers on your
feature branch; your normal squash-merge collapses them at PR time. `start`
records the baseline HEAD so the session has a known origin. `revert [--to n]`
does `git reset --hard` to a recorded SHA. `finish` lists the SHAs in the report
and clears the sidecar — it does not touch git. Nothing Plumbline does is
destructive to pushed history.

## The `.plumbline/` folder

```
.plumbline/
  STATE          # one word: DESIGN | BUILD | REVIEW | SPIKE | FINISH
  SEAM           # allowed edit paths for the current step (one per line)
  checkpoints    # "step N <git-sha>", one per verified done
  intent.md      # canonical intent (see intent.template.md)
  build-log.md   # live ledger    (see build-log.template.md)
  archive/
    <date>-<slug>/
      intent.md
      build-log.md
      report.md
```

## Calibration: size everything to the work

The fastest way to abandon this is ceremony on a one-liner. The discipline is
*decisions before code*, not *always produce three files*.

- **Tiny** (typo, one-liner): no session. Just fix it; the hooks stay dormant.
- **Small** (a contained bug/change): `start`; a frame + 2–3 decisions; skip
  `interrogate` if there are no holes; one or two steps; skip `review` on trivial
  steps and go BUILD-green → `done`.
- **Medium** (a feature touching a few modules): the full loop above.
- **Large / architectural**: that's Ridgeline's job, not Plumbline's.

Calibration is the skill. When in doubt, smaller.

## The shape, in one line

The human owns convergence in design; the LLM owns divergence in design and
convergence only in implementation; and the boundary between deciding and
executing is a one-word state file that a hook refuses to let you cross with code
in hand.
