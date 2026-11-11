---
name: next
description: "The one command to remember: asks what to do next as a short list of choices, the moves open from where the build stands, then makes the one you pick. A move that lands work or starts a run stays typed, and its choice says what to type."
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash(plumbbob status:*), Bash(plumbbob start:*), Bash(plumbbob build:*), Bash(plumbbob handoff:*), Bash(plumbbob check:*), Bash(plumbbob park:*), Bash(plumbbob defer:*), Bash(plumbbob order:*), Bash(plumbbob agent:*), Bash(plumbbob spike:*), Bash(git diff:*), Bash(git status:*)
---

# PlumbBob: what next? (the one door)

Current session state as data (injected when this skill runs): !`plumbbob status --json 2>/dev/null || echo "plumbbob CLI not on PATH in this session. Marketplace install: confirm the plugin is enabled in /plugin, then /reload-plugins. Skills-dir/global install: npm i -g plumbbob && plumbbob init."`

`/plumbbob:next` is the one command a person has to remember. The line above is the build's
state as one JSON object: `state` names where the build stands, and `moves` lists every
move open from there, the likeliest first. You show those moves as choices, the human
picks one, and you make it
([D128 (one-door)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d128)).
The CLI wrote each move's `label` and `description`; you pass them through and compose
neither
([D127 (state-as-data)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d127)).

## 1. Ask first, before any text

When your tools include `AskUserQuestion` and `moves` holds two or more, call it as the
first thing in the turn, with no sentence before it: a client that folds text written
before a tool call would hide the sentence and show the question alone
([D129 (ask-first)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d129)).

- One question, `What next?`, with the header `Next move`.
- Its options are the first four `moves`, in the order given: each option's label is the
  move's `label` and its description the move's `description`, both verbatim. End
  the first label, the move whose `primary` is true, with the word `(Recommended)`.
- Never add, drop, reorder, or reword a move. A move past the fourth is reached through
  the tool's own free-text choice, where the human names what they want.

**No question tool, or fewer than two moves.** Some hosts have no `AskUserQuestion` (a
headless run, an older editor bridge). Do not try a second tool and do not ask in prose:
run `plumbbob status` and relay its dashboard whole, the way `/plumbbob:status` does. Its
`next →` line names the move. A state of `no-session` reads `NO ACTIVE SESSION` there;
tell the human to frame a goal with `/plumbbob:plan`. If the injected line is the
`not on PATH` notice, relay it and stop.

## 2. Make the move the human picked

Find the picked move in `moves` by its label and read its `typed` field.

**`typed` is false: make it.** The move's `command` names a skill (`/plumbbob:build 4`
names `build`, with `4` as its arguments). Read `../<skill>/SKILL.md` from this skill's
base directory (the path printed above this skill as its base directory) and follow it to
its own ending, as if the human had typed the command. Read the file every time, whole; a
copy from memory drifts. Three things differ from a typed invocation:

- The file's injected state line arrives unfilled. Run `plumbbob status` yourself in its
  place, or `plumbbob status --invoked "<arguments>"` for `build`, and read that dashboard
  where the skill says to read the one injected above.
- The move's `command` is the invocation: its arguments are the skill's arguments.
- A build made here is one step, to its pause. Never pass `--auto`, a range, or a list,
  whatever the human adds: a grant is minted from a typed command alone, and none was
  typed.

The `questions` move names no skill. Go through the open questions as section 3 says.

**`typed` is true: say what to type, and make nothing.** The latch and a run's grant
count typed prompts alone, so a choice cannot land a step, record a review, start a run,
close the build, or discard work. Run exactly one command and end the turn on its output:

- `state` is `paused`: run `plumbbob handoff`. It prints the one line that points back at
  the step's card.
- `state` is `stop-waiting`: run `plumbbob handoff --stop`. It prints the line that points
  back at the stop card.
- any other state: run `plumbbob status`.

Then write one sentence, the picked move's `description` verbatim, and end the turn on
the command's output, whole, with nothing after it. Every tool call comes before the
sentence and none after it
([D121 (reply-after-the-tools)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d121)).

**The human dismissed the question, or typed something else.** A dismissal is the
fallback above: relay `plumbbob status` and stop. Free text that names a move in the list
is that move. Anything else is the human talking to you: answer it, and make no move they
did not name.

## 3. The open questions, by choice

When the human picks the `questions` move, the `questions` array holds each open question
with its `why` and its `lean`; one whose `deferred` is set is left to the work and is not
asked. Ask the rest through `AskUserQuestion`, up to four questions in one call:

- The question text is the question's `id` and its `question`, with the `why` after it.
- Two options: `Take the lean`, whose description is the `lean` verbatim, and
  `Defer to the work`, whose description is `Leaves it open until the build settles it`.
  The tool's free-text choice is the human's own answer.

Then write what they chose. A lean taken, or an answer given, is recorded on the
question's opener line in `intent.md` as `*resolved:* <date>, <the answer>` in place of
its `*resolve by:*`, with the Decision it settles when it settles one. A deferral is
`plumbbob defer <id> "<what settles it>"`; ask what settles it when the human did not say.
End the turn on `plumbbob status --questions`, relayed whole, or on its
`no open questions` line.

## The hard contracts

- **A choice never lands work.** This skill never runs `plumbbob checkpoint`,
  `plumbbob harvest`, `plumbbob finish`, `plumbbob revert`, or `plumbbob abandon`, and its
  tools leave them out. Those moves are typed, and the choice for each says what to type
  ([D64 (approval-latch)](https://github.com/robmclarty/plumbbob/blob/main/docs/decisions.md#d64)).
- **The CLI names the moves.** You relay `label` and `description`; you never invent a
  move, and never offer one the list lacks.
- **The question comes first, the CLI's output last.** No text before the question; no
  tool call after the turn's closing text.
- **The skill you read still rules its own work.** Its contracts hold here, the pause
  included: a step built from a choice stops at its card, and nothing lands until the
  human types their approval.
