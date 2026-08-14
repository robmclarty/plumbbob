# State files and git

PlumbBob keeps a handful of small files under `.plumbbob/` that are deliberately never
committed, and it keeps them out of your commits by appending a dozen lines to one local
git file. This page is the full account: what those files hold, why they have to exist,
exactly what gets written inside `.git`, and the honest answers to the objections that
follow, including "why are you touching my git at all?"

If you just want the layout, [`cli-reference.md`](cli-reference.md#the-plumbbob-sidecar)
has the tree. This page is the *why*.

## The short version

- PlumbBob writes exactly one file inside `.git`: **`info/exclude`**, git's own
  per-clone ignore list. It appends about a dozen lines, once.
- It **never** writes your `.gitignore`; that file is tracked, and nothing
  PlumbBob-specific belongs in a file your whole team commits.
- That is the only file it writes *directly* inside `.git`. Everything else it does to git
  goes through ordinary porcelain: commits that advance your branch, worktrees for spikes
  (all listed [below](#what-else-does-plumbbob-do-to-my-git)), never a hand-edited
  `.git/config`, hook, or remote.
- The write is append-only and idempotent: it adds only the patterns that are missing,
  never duplicates, reorders, or deletes a line it didn't write.
- To undo it: delete those lines. Nothing breaks; the control files simply start showing
  up as untracked in `git status`.

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
  `checkpoints`, `report.md` (the decisions and the record) ride the branch into the PR,
  because "what did we decide, and why" is exactly the thing that normally evaporates.
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
| `.plumbbob/TURN` | Monotonic count of human turns in this repo | the `UserPromptSubmit` hook | never (it's a counter) |
| `.plumbbob/GRANT` | A one-turn self-approval, minted only when *you* typed `/build --auto` or a step range | the same hook | the next turn |
| `.plumbbob/settings.local.json` | Your personal settings overlay (for example `{"auto": true}`) | you, by hand | you |
| `builds/<slug>/STEP` | The step number in flight; its presence *is* the BUILD phase | `build` | `checkpoint` / `revert` / `abandon` |
| `builds/<slug>/SEAM` | The step's declared paths, one per line (awareness, not a lock) | `build` | `checkpoint` / `revert` / `abandon` |
| `builds/<slug>/SPIKE` | Marker: a spike fork is open | `spike` | `spike done` |
| `builds/<slug>/TICK` | The `TURN` value at the moment the step was entered | `build` | `checkpoint` / `abandon` |
| `builds/<slug>/handoff.json` | Ledger of agent runs for this step, so a later call can thread earlier results ([D47 (handoff-ledger)](decisions.md#d47)) | `agent run` | `checkpoint` / `abandon` |
| `.check/` | The check gate's raw tool output | checkride | overwritten each run |

`TURN` and `TICK` are the least obvious pair, and they justify the whole mechanism. The
approval latch ([D64 (approval-latch)](decisions.md#d64); the checkpoint tick refuses until a human turn
lands) needs to know one thing: *has a human taken a turn since this step began?* That is a
fact about a conversation, and a conversation leaves no other durable trace. A counter file
and a stamp file are the entire implementation. Delete them and the latch reads "ledger
dormant" and stands down: it fails open, it never wedges.

Phase is **derived, not stored**: SPIKE present ⇒ SPIKE, STEP present ⇒ BUILD, otherwise
DESIGN. No status field exists to drift out of sync with reality, which is why these are
mostly empty marker files rather than a state blob.

A step in flight has three exits, and each settles these markers differently.
`checkpoint` lands the step and clears them on its way; `revert` resets the working tree
to a recorded SHA and clears the step markers with it; `abandon` clears the markers and
writes a build-log line, touching neither the tree nor git, so the diff stays put and the
step keeps its `[ ]` in the plan ([D79 (abandon-keeps-work)](decisions.md#d79)).

## How the ignoring works

Git reads ignore patterns from three places, in this order of specificity:

1. **`.gitignore`**: tracked, committed, shared with everyone who clones.
2. **`.git/info/exclude`**: local to your clone, never committed, never pushed. Git's
   documented home for "patterns you want, that don't belong to the project."
3. **`core.excludesFile`**: your personal global ignores, across every repo on the machine.

PlumbBob uses the middle one ([D33 (info-exclude)](decisions.md#d33); excludes are personal machinery,
never the repo's tracked ignore file). The rule is enforced in the codebase, not just
documented: `rules/no-gitignore.yml` fails the build if the string `.gitignore` so much as
appears in `src/`.

Here is the complete block it appends:

```text
.plumbbob/STATE
.plumbbob/settings.local.json
.plumbbob/TURN
.plumbbob/GRANT
.plumbbob/builds/*/STEP
.plumbbob/builds/*/SEAM
.plumbbob/builds/*/SPIKE
.plumbbob/builds/*/TICK
.plumbbob/builds/*/handoff.json
.check/
```

Note what is *not* there: no `.plumbbob/`. The build folders and `settings.json` stay
visible to git, because they're meant to be committed.

**When it's written.** `plumbbob start` writes it when it opens a session, and
`doctor --migrate` rewrites it when converting a legacy flat layout. `checkpoint` and
`finish` then re-apply it on their way into `git add -A`,
which self-heals the one gap that could bite: a PlumbBob upgraded *mid-build* can introduce a
control file the running session's exclude list never learned about (`TICK`, `GRANT`, and
`handoff.json` all arrived that way in earlier versions), and staging with `-A` would sweep
it into a commit. Every one of those calls appends only what's missing, so the common case
is a read and no write.

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

And it's trivially reversible. Delete the block and the only consequence is a noisier
`git status`. Nothing in PlumbBob reads `info/exclude` to decide how to behave; the excludes
are a courtesy to your `git status`, not a load-bearing part of the tool.

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
   relocate four marker files would complicate every path in the tool to save you ten lines
   in one local file.
3. **It has to be inspectable and disposable.** `cat .plumbbob/builds/*/STEP` answers "where
   was I?" without a tool. `rm -rf .plumbbob` is a complete, obvious uninstall. A home
   directory cache is the opposite: invisible, accumulating state for repos you deleted
   months ago, and impossible to reason about from inside the project.
4. **The hooks read them with a grep.** `SEAM` is a plain list of paths precisely so a shell
   hook can check it without parsing markdown or resolving which repo maps to which
   home directory folder.

The split isn't dogma, though; it's by lifetime, and it cuts both ways. Personal *agents*
genuinely are per-user, and those **do** live in `~/.plumbbob/agents/`
(see [`agents.md`](agents.md)). Per-user config goes home; per-worktree state stays with the
worktree.

### "My team won't accept a tool folder in the repo at all."

Use `plumbbob start --local`. The whole `.plumbbob/` directory is excluded with a single
blanket line and the artifacts live flat at its root. The cost is real and worth stating:
the build record dies with the worktree instead of riding into the PR, so nobody reviewing
the change sees the intent behind it.

### "What else does PlumbBob do to my git?"

The complete list. It **reads** (`rev-parse`, `status`, `ls-files`, `diff --cached`,
`rev-list`), it **stages** (`add -A`, or a single path for the plan commit), it **commits
forward**, it creates and removes **worktrees** for spikes (`worktree add/remove/prune`),
and `revert` runs **`reset --hard`**, only ever to a SHA it recorded in that build's own
`checkpoints` file.

It never rewrites pushed history: no `push`, no `rebase`, no `--amend`. That's
[C5 (additive-git)](decisions.md#c5) (an additive git footprint), and like the `.gitignore` rule it's
machine-enforced: `rules/additive-git-only.yml` fails the build if a history-rewriting git
token appears in the source at all, and `resetHard` is importable by exactly one file.

## Removing everything

```sh
plumbbob finish                    # or just delete the directory; nothing depends on a clean exit
rm -rf .plumbbob .check
$EDITOR "$(git rev-parse --git-path info/exclude)"   # delete the block shown above
```

The commits PlumbBob made are ordinary commits on your branch and stay exactly as they are;
your normal squash-merge collapses them at PR time. See
[`faq.md`](faq.md#what-ends-up-in-my-git-history) for what those look like.
