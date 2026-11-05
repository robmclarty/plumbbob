# Learn PlumbBob

A course in eleven short lessons. You plan and build one small tool, `sift`, a to-do
list that forgets, with Claude Code and PlumbBob beside you, and partway through you
meet a surprise the plan never covered. The surprise is on purpose: folding it into
the plan without losing the plan is what the tool is for. You do not need to know how
PlumbBob works inside. You need a handful of words (frame, step, seam, pause, park,
harvest, range, stop), one habit, reading the file instead of your memory, and about
four hours; the lessons supply the first two.

## The One Idea

**The plan is a file you keep true.** The model is the hand and you are the head;
`intent.md` is where the head's decisions live: the frame, the decisions with their
reasons, the steps with what done looks like, and the places the build stops for you. A build is the history of keeping that
one file plumb while the code catches up to it. Every skill in the course changes the
file in a way you can read back: `plan` writes it, a pause measures the diff against
it, `park` and `harvest` fold a surprise into it, `step` sharpens it, your editor
changes it by hand, and `finish` reads it back out as a report.

Because every change goes through the file, every change has a line, a date, and a
*because*, and the folder that holds them rides the branch into the pull request
beside the code it explains. The part that makes "you say when" a mechanism rather
than a hope is the approval latch: a step lands only after a prompt you typed, and
nothing the model writes can stand in for one
([D64 (approval-latch)](../decisions.md#d64)). Every lesson is that one idea, seen
from another side.

## How the Course Works

- **You build as you go.** Lesson 0 makes a workbench: a git repo with a checkride
  gate and the PlumbBob plugin. Every lesson after it changes that repo and its plan.
- **Everything runs, and most of it is a card.** What you run is a skill; what you
  read is a card the CLI printed and the file it changed. After each verb the lesson
  shows the card and a `git diff` or `cat` of the plan, which plays the part a
  diagram would play.
- **Your output will differ.** A model wrote the code and the plan, so SHAs, dates,
  step wording, and the model's reasons will not match the lesson. Each lesson names
  the lines to check for instead.
- **It costs a little.** Lessons 0, 1, 7, 9, and 10 run no model past a With Your
  Agent prompt; lesson 2 plans on opus, the rest build on haiku or sonnet, and the
  whole course costs a few dollars at API pricing. On a subscription the cost is time.
- **Rejoin anywhere.** The control files are untracked, so no tag marks a lesson's
  end: reset to the scaffold and replay. The replays are short, and the plan you
  replay is the one you already wrote.
- **Your agent wears two hats.** The same Claude Code session is your pair (the
  "With Your Agent" prompts, read-only unless a prompt says otherwise) and the
  builder the skills drive. The prompts never ask it to run a skill; you type every
  skill yourself, which is what the skills' `disable-model-invocation` setting
  enforces.

## The Lessons

### Part 1: The Workbench

A repo that can say when code is done, before any plan.

| Lesson | After it, you can | Time |
| --- | --- | --- |
| [0. Set Up Your Workbench](./00-set-up.md) | scaffold a gated TypeScript repo, install the plugin, read `doctor` | 15 min |

### Part 2: The Plan

A spec, then the file the whole course keeps true.

| Lesson | After it, you can | Time |
| --- | --- | --- |
| [1. The Spec Comes Before the Plan](./01-the-spec.md) | write a spec PlumbBob can absorb; have the agent cold-read it without writing | 20 min |
| [2. The Plan Is a File](./02-the-plan.md) | run `/plumbbob:plan`, read the plan card, defer and settle questions, change one line by hand, commit the plan | 25 min |

### Part 3: The Loop

One step to its pause, then four steps to a stop.

| Lesson | After it, you can | Time |
| --- | --- | --- |
| [3. A Step Lands Only When You Say So](./03-one-step.md) | run a bare range to its pause, read the readout, approve, read the boundary | 20 min |
| [4. A Range Stops Where the Plan Said](./04-a-range.md) | run a span, read the stop card, settle it in one reply | 30 min |

### Part 4: When Things Change

The surprise, and the moves that fold it into the plan without losing the plan.

| Lesson | After it, you can | Time |
| --- | --- | --- |
| [5. A Surprise Goes on the List, Then into the Plan](./05-park-and-harvest.md) | meet `2w`, park it, harvest it as a blocker, watch a new step join a range still to come | 25 min |
| [6. The Next Step Is Sharpened Just in Time](./06-sharpen-the-next-step.md) | `/plumbbob:step`, settle a deferred question by hand, run the re-cut range | 30 min |
| [7. When the Design Will Not Settle](./07-spike-and-revert.md) | open a spike worktree, write its verdict, wind a junk edit back with `revert`, know `abandon` | 15 min |

### Part 5: The Record

What a teammate reads cold, a month later.

| Lesson | After it, you can | Time |
| --- | --- | --- |
| [8. The Record Is the Why, Beside the Code](./08-the-record.md) | finish, then read the history back from the build folder and `git log` | 20 min |

### Part 6: By Hand

The same loop with no skill in it.

| Lesson | After it, you can | Time |
| --- | --- | --- |
| [9. The CLI Is the Whole Loop, Typed](./09-by-hand.md) | drive one tiny second goal with verbs only, and feel the latch | 30 min |

### Part 7: Where It Sits

| Lesson | After it, you can | Time |
| --- | --- | --- |
| [10. Where PlumbBob Sits](./10-where-plumbbob-sits.md) | place PlumbBob among the tools before and after it | 10 min |

If you only have one sitting, lessons 0 to 5 are the core. By the end of lesson 5 you
have planned, built, met the surprise, and folded it into the plan.

## For Your Agent

Your agent needs no primer for this course. Its reference is the skills themselves,
which it reads when you type one, with
[`skills-reference.md`](../skills-reference.md),
[`cli-reference.md`](../cli-reference.md), and [`glossary.md`](../glossary.md) beside
them when a prompt sends it looking.

## Teaching Someone Else

[`workshop/README.md`](../../workshop/README.md) is the live-demo run of show for
`sift`, and it doubles as the session guide for teaching this course to someone
else: the beats, what to type at each, and what the room should see.

## If You Get Stuck

- [`troubleshooting.md`](../troubleshooting.md) maps the refusals and the odd cards
  to their causes.
- Hand your agent the card and the output of `plumbbob status`, and ask what
  happened before it changes anything.
- Bug reports and ideas are welcome as
  [issues on GitHub](https://github.com/robmclarty/plumbbob/issues).
