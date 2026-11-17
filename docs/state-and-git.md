# State files and git

PlumbBob keeps a handful of small files under `.plumbbob/` that are deliberately never
committed, and it keeps them out of your commits by appending 20 lines to one local git
file. This page is the full account: what those files hold, why they have to exist,
exactly what gets written inside `.git`, and the honest answers to the objections that
follow, including "why are you touching my git at all?"

If you just want the layout, [`cli-reference.md`](cli-reference.md#the-plumbbob-sidecar)
has the tree. This page is the *why*.

## The short version

- PlumbBob writes exactly one file inside `.git`: **`info/exclude`**, git's own
  per-clone ignore list. It appends 20 lines, once: at `plumbbob setup`
  (`/plumbbob:setup`) if you run it, else at the first `start`.
- It **never** writes your `.gitignore`; that file is tracked, and nothing
  PlumbBob-specific belongs in a file your whole team commits.
- That is the only file it writes *directly* inside `.git`. Everything else it does to git
  goes through ordinary porcelain: commits that advance your branch, worktrees for spikes
  (all listed [below](#what-else-does-plumbbob-do-to-my-git)), never a hand-edited
  `.git/config`, hook, or remote.
- The write is append-only and idempotent: it adds only the patterns that are missing,
  never duplicates, reorders, or deletes a line it didn't write.
- To undo it: delete those lines. Nothing breaks; the control files show up as untracked
  in `git status` until the next `checkpoint` or `finish` re-applies the block on its way
  into `git add -A`. Under `--local` the line that matters is the blanket `.plumbbob/`:
  delete it and that same `add -A` sweeps the build record into your next commit.

Audit any of this yourself:

```sh
cat "$(git rev-parse --git-path info/exclude)"   # every line, including yours
git check-ignore -v .plumbbob/STATE              # which file ignored it, and on what line
git status --ignored                             # what is being hidden from you
```

## Why there are state files at all

PlumbBob has no daemon and no memory. The CLI is a process that starts, does one thing,
and exits. Between two invocations (usually between two *human turns*, sometimes across a
context compaction, a new terminal, or a reboot), every fact about the session has to be
sitting on disk somewhere or it is gone. That somewhere is `.plumbbob/`.

The sidecar splits by **lifetime**, not by importance ([D17 (two-planes)](decisions.md#d17)/[D26 (build-folders)](decisions.md#d26);
the sidecar has a tracked artifact plane and an excluded control plane):

- The **artifact plane** is *tracked on purpose*. `intent.md`, `build-log.md`,
  `checkpoints`, `report.md`, `stats.json`, `harness.json`, and each spike's
  `spike-NN-<slug>.md` (the decisions and the record) ride the branch into the PR,
  because "what did we decide, and why" is exactly the thing that normally evaporates.
  Two derived files ride with them when a build has them: `plan.json`, the plan as data
  ([`plan-export.md`](plan-export.md)), and `reach.json`, what atis answered for each
  step's seam ([`reach.md`](reach.md); [D155 (reach-is-computed)](decisions.md#d155)).
  `reach.json` is tracked because a landed step's record was measured against it, and a
  reviewer on another machine, with no atis, should see the same split.
  `research.md` rides with them too, when the plan ran a research pass: what it checked
  before it was approved, under a stamp of the date, the lockfiles and the versions it was
  checked against ([`research.md`](research.md);
  [D158 (research-is-dated)](decisions.md#d158)). It is tracked because a finding is part
  of why a Decision was made, and the stamp is only worth reading if it travels with the
  plan it dates.
- The **control plane** is what this page is about: facts about *your working copy at this
  instant*. Which step is mid-flight. How many times you've pressed enter. These are true
  for you, in this worktree, for the next ten minutes.

Committing the second kind would be pure noise: a diff on every step, a conflict on every
merge, and a `STATE` file that says something different for every person who checks out the
branch.

### The control-plane files

| File | What it holds | Written by | Cleared |
| --- | --- | --- | --- |
| `.plumbbob/STATE` | Session sentinel (its *presence* means a session is live), and its content is the active-build cursor ([D28 (state-cursor)](decisions.md#d28): the cursor lives in STATE, not settings) | `start` | `finish` |
| `.plumbbob/TURN` | Monotonic count of human turns in this repo. A background job's notice reaches the same hook and is not a turn, so it never ticks ([D90 (notice-not-turn)](decisions.md#d90)) | the `UserPromptSubmit` hook | never (it's a counter) |
| `.plumbbob/GRANT` | A one-turn self-approval, minted only when *you* typed `/plumbbob:build --auto` (`auto`), a step range (`steps 5-9,20`, exactly the steps it names; [D91 (step-list-grants)](decisions.md#d91)), or `/plumbbob:run` (the steps its range has left, read from the plan as you typed it; [D96 (plan-names-the-grant)](decisions.md#d96)) | the same hook | your next prompt (a notice leaves it) |
| `.plumbbob/RUN` | The range a run you typed is landing, so the checkpoint that completes it owes the stop card ([D103 (stop-latched)](decisions.md#d103)); the latch never reads it | the same hook | your next prompt, unless a step of that range waits at its pause (a notice leaves it) |
| `.plumbbob/PROMPT` | The id of the last prompt the hook saw, typed or not, so a notice folded into a running turn is told from one that starts its own ([D90 (notice-not-turn)](decisions.md#d90)) | the same hook | the next prompt overwrites it |
| `.plumbbob/settings.local.json` | Your personal settings overlay (for example a per-worktree `"check"` command) | you, by hand | you |
| `.plumbbob/detail.md` | The in-flight step's full detail, written by the model before each pause, or a landed range's at its stop; `handoff` renders the turn from it ([D81 (detail-file)](decisions.md#d81)) | the model | `checkpoint`, which records a step's in the build log's Log first (unless its header names another step), or `plumbbob harvest`, which records a range's |
| `.plumbbob/RELAY` | The ending the CLI printed last: its tier, its render, the command that reprints a pause, the `TURN` it printed in, and the text itself, so the `Stop` check can tell whether the turn closed on it ([D89 (block-once)](decisions.md#d89)), and, once the check has held a turn open over it, that `TURN` too, so it holds at most once a turn. Written only while `TURN` keeps a count | `handoff` and every verb that prints an ending; the hold, `relay` | the next ending overwrites it; the turn hook clears it when a notice starts a turn of its own |
| `builds/<slug>/STEP` | The step number in flight; its presence *is* the BUILD phase | `build` | `checkpoint` / `revert` / `abandon` |
| `builds/<slug>/SEAM` | The step's declared paths, one per line (awareness, not a lock) | `build` | `checkpoint` / `revert` / `abandon` |
| `builds/<slug>/SPIKE` | Marker: a spike fork is open | `spike` | `spike done` / `finish` |
| `builds/<slug>/TICK` | The `TURN` value at the moment the step was entered, or the session opened, so the plan commit waits for a human turn too | `build`, and `start` for the plan commit | `checkpoint` / `abandon` |
| `builds/<slug>/PAUSE` | Which card has shown: the step whose pause card showed (`2`, or `2 plan:<hash>` when that card showed a plan edit, so an edit made since brings the card back) or, after a checkpoint, the step whose boundary did (`landed 2`, `landed 2 answered` when that landing answered step 2's pause card, which shortens the stop card after it), so a repeat prints its one line whatever changed since ([D110 (reply-after-the-card)](decisions.md#d110)) | `handoff`, `checkpoint` | `revert` / `abandon` |
| `builds/<slug>/STOP` | The range whose stop card has shown and the `TURN` it printed in, so a repeat prints the reminder and `plumbbob harvest` records only a range a card showed, a turn later ([D103 (stop-latched)](decisions.md#d103), [D110 (reply-after-the-card)](decisions.md#d110)) | `handoff --stop` | `plumbbob harvest` |
| `builds/<slug>/MARK` | The plan as PlumbBob last knew it approved: a copy of `intent.md` under the `TURN` it was taken in and the step whose entry settled it. A later `intent.md` is compared with it, so a plan edited during a step is counted and shown at that step's pause. While an edit waits it also holds a hash of the plan as it stood at your last typed prompt, which is the edit a checkpoint will land ([D162 (plan-edit-shown)](decisions.md#d162)) | `start`, `checkpoint` (the first plan commit, and each landing after its tick), `build`, `turn` at each typed prompt, and `order` and `defer` after their own writes | `finish` |
| `builds/<slug>/BASE` | The plan as it stood when you typed a grant with `--plan-edits`: a copy of `intent.md` under that `TURN`, the steps that have landed a plan edit since, and whether a card has listed them. While `TURN` still reads that turn, a plan edit lands; the next card lists the run's edits against this copy, and your prompt after that drops it ([D163 (plan-edits-grant)](decisions.md#d163)). | `turn`, at a prompt whose grant carries `--plan-edits`; `checkpoint`, which adds a step that landed an edit; `handoff`, which marks it shown | `turn` at the prompt after a card showed it, and `finish` |
| `builds/<slug>/handoff.json` | Ledger of agent runs for this step, so a later call can thread earlier results ([D47 (handoff-ledger)](decisions.md#d47)) | `agent run` | `checkpoint` / `revert` / `abandon` |
| `builds/<slug>/evidence/<n>/` | What an agent saved for you to look at while step `n` was open: screenshots, traces, the diff a reviewer read ([D157 (evidence-is-shown)](decisions.md#d157)) | an agent, under `agent run` | never; it is yours to clear |
| `.check/` | The check gate's raw tool output | checkride | overwritten each run |

`TURN` and `TICK` are the least obvious pair, and they justify the whole mechanism. The
approval latch ([D64 (approval-latch)](decisions.md#d64); the checkpoint tick refuses until a human turn
lands) needs to know one thing: *has a human taken a turn since this step began?* That is a
fact about a conversation, and a conversation leaves no other durable trace. A counter file
and a stamp file are the entire implementation. Delete them and the latch reads "ledger
dormant" and stands down: it fails open, it never wedges.

`MARK` is the one control file that holds a copy of something tracked, and it is the same
kind of fact as the pair above: what the plan said the last time a person stood behind it.
Git cannot answer that. `HEAD` holds the plan as of the last commit, and a plan refined at a
boundary, with you there, is ahead of `HEAD` and still approved. So the CLI keeps its own
copy and moves it only at the moments it knows the plan is sanctioned: its own writes, a
landing, and the prompt you type, since the plan as it stands when you speak is the plan you
are speaking over. A step's entry does not move it on a host that counts turns, so what
changed after your last prompt rides into the step. The file blocks nothing. An `intent.md` that differs from it is reported at the pause, in the Readout's
`plan` row and the diff beneath it, and a build started before the mark existed has none and
reports nothing until its next step is entered. `abandon` and `revert` leave the mark where
it is, so a step dropped and entered again is still measured against the plan as approved,
and an edit a dropped step never showed outlasts your next prompt and is shown at the next
entry. Like the ledger pair, the mark fails open: delete the file and the build has no mark,
reports nothing, and gains a fresh one from the plan as it stands at the next entry or
landing. That loss is silent, so a missing `MARK` in the middle of a step is worth a look at
`git diff` on `intent.md`.

Phase is **derived, not stored**: SPIKE present ⇒ SPIKE, STEP present ⇒ BUILD, otherwise
DESIGN. No status field exists to drift out of sync with reality, which is why these are
mostly empty marker files rather than a state blob.

A step in flight has three exits, and each settles these markers differently.
`checkpoint` lands the step and clears them on its way; `revert` resets the working tree
to a recorded SHA and clears the step markers with it; `abandon` clears the markers and
writes a build-log line, touching neither the tree nor git, so the diff stays put and the
step keeps its `[ ]` in the plan ([D79 (abandon-keeps-work)](decisions.md#d79)).

### The evidence folder

**Evidence is excluded, and the build log keeps what it showed.** An agent can save a file
for you to look at and name it in its envelope ([the contract](agents.md#evidence-something-to-look-at));
the files land in `builds/<slug>/evidence/<n>/`, one folder a step. It is the one entry in
the table above that holds neither a marker nor a counter, and the one PlumbBob never
clears. It sits on the control plane for a plainer reason than the rest: a screenshot
tracked with the build folder rides every PR and swells the repo for good, where one that
is excluded costs nothing and dies with the clone.

What survives is the line. When `agent run` keeps a piece of evidence it appends one line
to the build log's `## Log`, which is tracked:

```text
- 2026-11-13 — step 3 evidence from walkthrough · `.plumbbob/builds/rate-limit/evidence/3/01-login.png` — the form, filled
```

The path rides in a code span, never a link, since in any other clone the file is not
there. The record says what was seen after the image is gone. No verb deletes the folder,
at a checkpoint, a revert, an abandon or a finish
([C4 (never-destroy)](decisions.md#c4)), so it stays until you remove it.

## How the ignoring works

Git reads ignore patterns from three places, in this order of specificity:

1. **`.gitignore`**: tracked, committed, shared with everyone who clones.
2. **`.git/info/exclude`**: local to your clone, never committed, never pushed. Git's
   documented home for "patterns you want, that don't belong to the project."
3. **`core.excludesFile`**: your personal global ignores, across every repo on the machine.

PlumbBob uses the middle one ([D33 (info-exclude)](decisions.md#d33); excludes are personal machinery,
never the repo's tracked ignore file). The rule is enforced in the codebase, not just
documented: `rules/no-gitignore.yml` fails the build if a string literal under `src/` so
much as names `.gitignore` (a comment may; the tests are exempt).

Here is the complete block it appends:

```text
.plumbbob/STATE
.plumbbob/settings.local.json
.plumbbob/TURN
.plumbbob/GRANT
.plumbbob/RUN
.plumbbob/PROMPT
.plumbbob/detail.md
.plumbbob/RELAY
.plumbbob/builds/*/STEP
.plumbbob/builds/*/SEAM
.plumbbob/builds/*/SPIKE
.plumbbob/builds/*/TICK
.plumbbob/builds/*/PAUSE
.plumbbob/builds/*/STOP
.plumbbob/builds/*/MARK
.plumbbob/builds/*/BASE
.plumbbob/builds/*/handoff.json
.plumbbob/builds/*/evidence/
.plumbbob/evidence/
.check/
```

Note what is *not* there: no `.plumbbob/`. The build folders and `settings.json` stay
visible to git, because they're meant to be committed.

**When it's written.** `plumbbob start` writes it when it opens a session, and
`doctor --migrate` rewrites it when converting a legacy flat layout. `checkpoint` and
`finish` then re-apply it on their way into `git add -A`,
which self-heals the one gap that could bite: a PlumbBob upgraded *mid-build* can introduce a
control file the running session's exclude list never learned about (`TICK`, `GRANT`,
`handoff.json`, `detail.md`, `MARK`, and `BASE` all arrived that way), and staging with `-A` would sweep
it into a commit. `agent run` re-applies it too, before it spawns the agent, since that is
the moment a file is about to be saved into the evidence folder and a build started on an
older PlumbBob has no line for it. Every one of those calls appends only what's missing, so
the common case is a read and no write.

**Worktrees.** The path is resolved with `git rev-parse --git-path info/exclude`, which
returns the *common* gitdir's copy: the only one git actually reads. A linked worktree's
gitdir has no `info/` directory at all, so a naive path join would fail there. This is why
excludes behave identically from every worktree, including the throwaway ones `spike`
creates.

## Objections

### "Why are you modifying my git state?"

Because the alternative is making you configure it by hand, and the cost is smaller than it
sounds. Be precise about what "git state" means here: `info/exclude` is a **local
preferences file**. It is not history, not refs, not config, not anything that leaves your
machine. It's untracked by construction (git will not let you commit it), so no teammate,
no CI run, and no push is affected by what's in it.

The write is append-only and idempotent. PlumbBob adds the patterns that are missing and
leaves every other line alone, including yours. Exactly one place *removes* a
line: `doctor --migrate`, dropping the legacy blanket `.plumbbob/` exclude from an old
flat-layout repo so the build folders can become trackable, and it only ever removes its
own line.

And it's reversible. Delete the block and the consequence is a noisier `git status`, until
the next `checkpoint` or `finish` puts it back. PlumbBob reads `info/exclude` for two
decisions, both small. `refreshExcludes` looks for the blanket `.plumbbob/` line, to tell a
`--local` layout from a tracked one before it re-applies the narrow patterns, and
`checkpoint --plan` probes whether git ignores the build folder, because an ignored folder
lands its plan commit record-only. The narrow patterns are a courtesy to your `git status`;
the blanket line carries weight, since `keep it local`
([D117 (publish-on-the-card)](decisions.md#d117)) rests on nothing else.

### "Why not just put it in `.gitignore`?"

Because `.gitignore` is tracked, and that changes everything about the decision.

Writing there would commit PlumbBob into your repo. It shows up in a PR diff as an unrelated
change. It becomes a thing to argue about in review. It conflicts when two branches each add
their own tool's lines. Most of all, it imposes your tool choice on every teammate who
clones, including the ones who will never run PlumbBob and now carry its patterns forever.

A tool you might drop in a week has no business leaving a permanent mark on a shared file.
Uninstalling PlumbBob should be `rm -rf .plumbbob` plus deleting some local lines: not a
commit, not a PR, not a conversation.

### "Then why not ship a `.plumbbob/.gitignore`?"

This is the obvious alternative and it fails the same test, just less visibly. A nested
`.gitignore` only helps a teammate if it is **committed**, so it's the same imposition
wearing a smaller hat, and it puts a file in your PR diff on day one. It also can't express
the `--local` layout, where the whole directory is untracked and there is nothing to commit
a `.gitignore` *into*. `info/exclude` covers both layouts with the same mechanism and leaves
no trace in the repo.

### "Why can't the state live in `~/.plumbbob/` or an XDG directory?"

Four reasons, in rough order of how much they hurt:

1. **It's per-worktree, not per-user.** Two worktrees of the same repo are two live sessions
   with two different steps in flight. A home directory store has to key on *something*,
   and a path key breaks the moment you move, rename, clone, or mount the repo somewhere
   else, silently, with the tool cheerfully reporting the wrong step.
2. **Its neighbours are tracked on purpose.** `intent.md` and `build-log.md` sit in the same
   folder and are *meant* to be committed. Splitting the sidecar across two filesystems to
   relocate 19 control files would complicate every path in the tool to save you 20 lines
   in one local file.
3. **It has to be inspectable and disposable.** `cat .plumbbob/builds/*/STEP` answers "where
   was I?" without a tool. `rm -rf .plumbbob` is a complete, obvious uninstall. A home
   directory cache is the opposite: invisible, accumulating state for repos you deleted
   months ago, and impossible to reason about from inside the project.
4. **The shell hooks read them without a parser.** `pre-bash-commit.sh` reads `STATE` and
   `STEP`, and `post-edit.sh` reads `STATE`: a `head -n1` and a file test, with no
   markdown to parse and no table that maps a repo to a home directory folder. `SEAM` is a
   plain list of paths for the same reason, though its readers are `handoff` and
   `checkpoint`, not a hook.

The split isn't dogma, though; it's by lifetime, and it cuts both ways. Personal *agents*
genuinely are per-user, and those **do** live in `~/.plumbbob/agents/`
(see [`agents.md`](agents.md)). Per-user config goes home; per-worktree state stays with the
worktree.

### "My team won't accept a tool folder in the repo at all."

Use `plumbbob start --local`. The whole `.plumbbob/` directory is excluded with a single
blanket line and the artifacts live flat at its root. Typed while a session is already open
and its plan not yet committed, the same command keeps the folder where it is, at
`builds/<slug>/`, and adds only the blanket line: the `keep it local` move the plan card
offers ([D117 (publish-on-the-card)](decisions.md#d117)). Once the plan has landed it
refuses, since an exclude cannot take a folder back out of a commit. The cost is real and
worth stating: the build record dies with the worktree instead of riding into the PR, so
nobody reviewing the change sees the intent behind it.

### "What else does PlumbBob do to my git?"

The complete list. It **reads** (`rev-parse`, `status`, `ls-files`, `rev-list`,
`check-ignore`, `for-each-ref`, `worktree list`, `diff-tree`, and `diff` in three shapes:
`--cached`, `--numstat` or a patch against `HEAD`, and `--no-index` against `/dev/null`
for an untracked file), it **stages** (`add -A`, or a single path for the plan commit), it
**commits forward**, it opens **worktrees and branches** for spikes (`worktree add -b
spike/<slug>-<opt>`) and takes them down on `spike done` (`worktree remove`, `worktree
prune`, and `branch -D` on every `spike/*` branch, the only branches it ever deletes), and
`revert` runs **`reset --hard`**, only ever to a SHA it recorded in that build's own
`checkpoints` file.

It never rewrites pushed history: no `push`, no `rebase`, no `--amend`. That's
[C5 (additive-git)](decisions.md#c5) (an additive git footprint), and like the `.gitignore` rule it's
machine-enforced: `rules/additive-git-only.yml` fails the build if a history-rewriting git
token appears in the source at all, and `resetHard` is importable by exactly one file.

A plan commit you make by hand declares itself with a `plumbbob plan` line in its body, and
`status` and `handoff` both leave such a commit out of the count of commits that landed
outside the ledger ([D66 (oob-commits-surfaced)](decisions.md#d66)).

## Removing everything

```sh
plumbbob finish                    # or just delete the directory; nothing depends on a clean exit
rm -rf .plumbbob .check
$EDITOR "$(git rev-parse --git-path info/exclude)"   # delete the block shown above
```

The commits PlumbBob made are ordinary commits on your branch and stay exactly as they are;
your normal squash-merge collapses them at PR time. See
[`faq.md`](faq.md#what-ends-up-in-my-git-history) for what those look like.
