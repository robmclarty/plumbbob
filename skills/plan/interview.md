# PlumbBob plan: the interview

Read by the plan skill when it is invoked with no argument (mode 1).

## The interview (mode 1)

Make it easy and non-intrusive:

- **Triage size first.** A tiny change earns a 3-line Frame and one Step, fast: never
  ceremony on a one-liner. Scale the questions to the work.
- **Propose, don't interrogate.** Offer concrete suggestions the human can **accept as-is
  without typing** ("proof: the 6th request in 60s returns 429, good?"), while
  taking arbitrary detail when they want to give it, including pointers to other files.
- **A fork with real alternatives can be a choice.** When the interview reaches a call
  with two to four concrete answers, and your tools include `AskUserQuestion`, ask it
  there, your suggestion first and marked `(Recommended)`, before any text in that turn.
  The tool's free-text choice carries whatever detail they want to give.
- **Let them double back.** They will revise as the picture sharpens; that's expected.
  They can also edit `intent.md` by hand at any time, or call `/plumbbob:refine` to repair it.
