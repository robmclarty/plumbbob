<!--
spike-report.md — the durable receipt for a spike (a fork the plan couldn't settle
on paper). One per spike, numbered and named `spike-NN-<slug>.md`, riding the build
folder into the PR beside intent.md / report.md. Fill it while the experiment is live
— the worktrees and their learnings are torn down at `spike done`, but this stays.

Two ways a spike is born, both landing here:
  - `/plumbbob:spike <slug>` — an explicit mid-build fork with throwaway worktrees.
  - a planned step titled `spike: …` — the increment IS the experiment.
Record the Verdict before you close the spike (or check off the step).
-->

# Spike — {{TITLE}}

**Via:** {{VIA}}
**Opened:** {{DATE}}

## Question

*(The fork this resolves, in one or two lines. What are we uncertain about, and what
would each answer commit us to?)*

## Options tried

*(Each path you actually ran, and what it took — one bullet each.)*

## Findings

*(What the experiment showed — evidence, not opinion. Numbers, errors, surprises.)*

## Verdict

**Verdict:** *(viable | not viable | partial — replace this line with the call and why)*

## What this decides

*(The intent.md Decision this feeds — which option won, what dies, and the one reason
that settled it. Copy the call into intent.md's Decisions / Verdicts too.)*
