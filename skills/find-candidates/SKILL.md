---
name: find-candidates
description: "Survey an issue tracker team's backlog and shortlist which tickets are good plumbbob candidates: a scoped code fix worth planning, versus one that needs a product decision first, is too small to step through, or is blocked. For the shortlist, also points at who git history says knows the affected code. Read-only against the tracker and the repo; makes no changes to either. Takes a team and an optional assignee filter (defaults to unassigned)."
argument-hint: "[team] [assignee]"
disable-model-invocation: true
allowed-tools: Read, Bash(git grep:*), Bash(git log:*), Bash(git shortlog:*), Bash(grep:*), Bash(find:*)
---

# PlumbBob: find candidates (the sourcing move)

`/plumbbob:find-candidates` answers a question that comes *before* `/plumbbob:plan`: out of
everything sitting in the backlog, what is actually worth a plan? It reads a team's
tickets from whatever issue-tracker MCP is connected, checks the ones that look
promising against the code that is actually on disk, and hands back a short, sorted
list instead of a raw dump.

## No session needed

This skill does not read or write `.plumbbob/`, and it never shells `plumbbob`. Run it
before a session exists, between builds, or in a repo you have not planned anything in
yet; there is nothing to refuse. Once you pick a candidate, the next move is
`/plumbbob:plan`, handed the ticket's title, link, and the concrete fix it named.

## Arguments

Disambiguate what the human gave you the same way `/plumbbob:plan` disambiguates its
own input, no quotes required:

1. **No argument.** List the teams the tracker knows about and ask which one. Default
   the assignee filter to unassigned once a team is picked; say so.
2. **One token.** Treat it as the team. Default the assignee filter to unassigned.
3. **Two tokens.** The first is the team, the second the assignee filter: a name, an
   email, `me`, or an explicit override like `any` (every assignee) or `unassigned`
   (the default, named explicitly). If the second token does not resolve to a person
   the tracker knows, say so and ask rather than guessing.

## What it does

1. **Resolve the team and pull the backlog.** List issues for the resolved team and
   assignee filter, with enough fields to triage without a second round trip per
   ticket: title, description, priority, status, labels, and link.
2. **Drop what cannot be planned.** Filter out completed, canceled, and duplicate
   tickets by default; they are not actionable, and a done ticket recommended as a
   candidate wastes the read. Say how many were dropped and why, so the count in your
   final list is not mistaken for the tracker's whole backlog.
3. **Hydrate the ones worth a closer look.** For any ticket whose title or summary
   names a concrete symptom or a specific fix, fetch its full description. Skip this
   for tickets that are obviously out of scope on their title alone (a duplicate test
   ticket, a one-line typo report) rather than spending a fetch on every row.
4. **Check the code before you claim it.** A ticket can cite a file, a function, or a
   table that was renamed or deleted since it was filed. Before calling anything a
   strong candidate, grep the current repo for the names it cites (`git grep`, `grep`,
   `find`) and note whether they still resolve. A ticket whose cited code has moved is
   not disqualified, but say so instead of repeating a stale claim as fact.
5. **Bucket every ticket you did not drop in step 2**, one line of reasoning each:
   - **Strong candidate**: a scoped code fix, more than a trivial edit, with a clear
     done-when (a bug with an identified cause, a refactor with named files, a
     security or data fix with a concrete remediation) and no open product question
     standing in front of it.
   - **Needs a decision first**: the fix is real but the ticket itself leaves a choice
     unmade (two competing approaches, a scope call only the human can make). Still
     worth planning; say what `/plumbbob:plan`'s interview would need to settle before
     stepping.
   - **Not a good fit**, with the specific reason: blocked or on hold, no root cause
     identified yet (needs investigation before it can be planned), the actual diff is a
     one-line config change even if the ticket's effort estimate is large, or the
     symptom cannot be reproduced or fixed from the code alone (a native-app bug that
     needs a device, a design-only request).
6. **Surface who to talk to, for the shortlist only.** For every ticket that landed in
   *strong candidate* or *needs a decision first* (never for one dropped as not a good
   fit; the lookup only pays for itself where the ticket might actually get built), run
   the files confirmed in step 4 through `git shortlog -sne` bounded to a recent window
   (a year is a reasonable default) for who has the most commits there, and `git log -1`
   for who touched the file most recently. Report both as one line per ticket: most
   commits by whoever it names, most recently touched by whoever it names (naming both
   even when they are the same person), and skip the line entirely for a file with no
   history worth reading (new, generated, or vendored). If a file's top committer's most
   recent touch is old, say so; it is the clearest sign they may have moved off this
   area or the team.
7. **Report the buckets**, most actionable first, each entry carrying the ticket ID,
   title, a link, the one line of reasoning that put it there, and (for the shortlist)
   the who-to-talk-to line from step 6. Close with the dropped count from step 2 so the
   totals reconcile.

## The hard contracts

- **Read-only against the tracker.** List and fetch only. Never create, update,
  comment on, assign, or re-triage a ticket; that is the human's call, made in the
  tracker itself.
- **Read-only against the repo.** `git grep`, `git log`, `git shortlog`, `grep`, and
  `find` only, to confirm a citation still resolves and to read who touched the file.
  No `Edit`, no `Write`, no code change: sourcing is not building.
- **Confirm before you claim.** A ticket only earns "strong candidate" once its cited
  files or functions have actually been checked against the repo in front of you, not
  assumed from the ticket text.
- **A pointer, not an assignment.** The who-to-talk-to line is a heuristic read off
  commit history, not confirmation that a person still owns, wants, or is even still on
  the team for this code. Report it as "git history points to," never as who is
  responsible or who should be pinged; that call is the human's, made with more context
  than a commit log carries.
- **Size to the backlog.** A team with three open tickets gets three lines of
  reasoning, not three sections of ceremony; a team with eighty gets the same triage,
  just longer.
