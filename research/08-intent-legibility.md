# PlumbBob upgrades — Research 8: intent.md legibility

> Question: at the end of a pb-plan + pb-refine session in the checkride repo,
> a chat-side walkthrough of the 13 open questions ("plain-English explanation
> + where I'd land, per question") was far easier to act on than the raw
> `intent.md`, which reads machine-like. Why did the walkthrough work, which of
> its properties belong in the document itself, and how do we buy legibility
> without wasting tokens — or worse, forking a companion "plain English" doc
> that has to stay in sync?
>
> Date: 2026-07-18. Companions: `templates/intent.md` (the format under
> evaluation), `skills/pb-refine/SKILL.md` (the attack mode that authors open
> questions), `src/lib/intent.ts` + `src/lib/orient.ts` (what the machine
> actually reads). This is findings, not a plan — any adopted change gets its
> own `/pb-plan` intent.

## Why the walkthrough worked — four properties

Dissecting the checkride listing against the raw doc, the legibility gap comes
from four properties, in descending order of weight:

1. **Each question was self-contained.** The explanation restated its own
   background inline — what `npm pack --dry-run` actually runs, what `--bail`
   means, why two flags contradict. The reader never had to flip to another
   section or doc to load context before thinking. The raw one-line form
   (`- Q7: pack check isn't read-only`) assumes the context is already in the
   reader's head; three days later it isn't.
2. **Explanation preceded recommendation.** The plain-English paragraph set
   the reader up to *judge* the recommendation, not just accept it. That is
   what let the human "compose my answers without further back-and-forth" —
   the deliberation material and the proposal arrived together.
3. **Stakes were stated.** Not just what is ambiguous but what breaks and for
   whom ("a perfectly correct package gets flagged", "silently change behavior
   on upgrade"). Stakes are what let a human prioritize which questions
   deserve real thought.
4. **References carried a gloss.** The one direct complaint: bare labels
   ("amends C6's machinery") force a doc-flip mid-thought. The fix the human
   asked for — `C6 (subprocess-reaper)` — costs ~3 tokens and preserves
   linear reading.

None of these are chat-only properties. The question is where in the doc they
belong and what they cost.

## Root cause: the terseness is mandated, not emergent

Two findings in our own sources:

- `skills/pb-refine/SKILL.md` (attack mode): *"Append each as a **one-line
  question** under `## Open questions`"*. The machine-like open questions are
  literal instruction-following.
- `templates/intent.md` question format: `- Q1: <unresolved> — *resolve by:*
  decide | spike | ask`. There is **no slot for the model's proposed
  resolution**. The hard contract ("never guess a hole into a Decision") is
  right, but it leaves the model's recommendation homeless — so it gets
  delivered ephemerally in chat, which is exactly where the checkride session
  found it. The doc keeps the question; the chat keeps the thinking; the human
  needs both at once.

## What the machine actually reads (the real token surface)

The evaluation hinges on which sections are mechanically consumed, how often,
and how strictly. From `src/lib/intent.ts` and `src/lib/orient.ts`:

| Section | Mechanical consumer | Strictness | Read frequency |
|---|---|---|---|
| Steps: `seam:` line | `parseStepSeam` — gates git behavior | **Strict** (refuses on globs/absolute/duplicates) | every checkpoint |
| Steps: opener + done-when | `parseStepMeta`, orient | best-effort | every build/status |
| Decisions, Constraints | `scrapeBullets` → **injected into every user-agent envelope** (`agents.ts:432`) | best-effort; wrapped continuation lines joined | **per step, per agent** |
| Open questions | `parseOpenQuestions` (orient.ts:131) — **counts** `- Q\d+:` opener lines lacking "resolved" | opener line only | status display |
| Frame, sketch, Verdicts | none — host-model reading only | free-form | occasional full-file reads |

Three consequences:

1. **Decisions/Constraints are the one place compactness pays repeatedly.**
   Every bullet is re-injected into agent context per step. The one-line-with-
   *because* convention is correct there and should not loosen.
2. **Open questions have near-zero mechanical cost.** They are never scraped
   into agent envelopes — only *counted*, and the counter matches the trimmed
   opener line (`/^- Q\d+:/`). Indented sub-lines under a question are
   invisible to it. Expansion under a question opener is mechanically free.
3. **Expansion in Open questions is parser-safe today, no code change.**
   Verified against `parseOpenQuestions`: sub-bullets don't match the opener
   regex, so the open count stays correct. One existing sharp edge to
   document: the `*resolved:*` marker must land on the **opener line** for
   the count to drop (the regex tests each opener line in isolation).

## The economics: two audiences at two times

The token-waste worry dissolves once the doc is seen as having two reader
populations with opposite needs:

- **Settled sections** (Frame, Decisions, Constraints, Steps) are read
  *repeatedly, by machines and models, for the life of the build*. Compression
  pays on every read. Keep them tight.
- **Open questions** are read *primarily once, by the human, at the decision
  point* — the single most expensive reader in the loop. A question the human
  has to re-derive context for costs a chat round-trip (hundreds of tokens of
  re-explanation, which is precisely what the checkride session spent) or, at
  worst, a bad decision. Expansion pays exactly here.
- **The expansion is transient.** An open question resolves into a one-line
  Decision/Verdict and its explanatory scaffolding is deleted. The prose is
  formwork, not structure — the converged document is as compact as today's.

Rough accounting for the worst observed case: 13 questions × ~100 tokens of
plain-English expansion ≈ 1.3k tokens, present only while the plan is
converging, read in full a handful of times, never entering the per-step agent
envelope. Against one avoided "explain Q7 to me again" round-trip, it pays for
itself immediately.

**Verdict on the companion doc: reject.** A parallel "plain English" file is
the same information at a second address with a sync obligation and no
mechanism enforcing it — the classic doc-drift failure. Expand *in place*,
in the one section where expansion is cheap and self-collapsing, and the sync
problem never exists.

## Recommendations

### R1 — Expanded open-question entry (template change)

Replace the single-line Q format in `templates/intent.md` with an opener plus
two indented sub-lines:

```markdown
- Q7: the pack check isn't read-only — *resolve by:* decide
  - *plain:* `npm pack --dry-run` runs `prepack`/`prepare` first, and
    `"prepack": "npm run build"` is common — so the "just inventory the
    tarball" check can rebuild dist/ mid-wave while smoke and snippets are
    reading those same files.
  - *lean:* spawn pack with `--ignore-scripts`; the build slot at wave 10 is
    the sanctioned build step. (Amends C6 (subprocess-reaper) machinery.)
```

- `*plain:*` is the cold-reader explanation — written for a reader who does
  **not** have the session context loaded, stakes included. The bar, matching
  the template's existing motto: *if the decider has to re-derive the context,
  the question failed.*
- `*lean:*` is the model's proposed resolution and the one reason. It is
  **not** a Decision — it is a proposal parked inside the question, awaiting
  the human's call. This *strengthens* the "you propose, the human converges"
  contract rather than bending it: today the proposal lives only in ephemeral
  chat; on the record, the human approves or overrides wording that is
  actually written down.
- On resolution: verdict goes to Decisions/Verdicts as one line, the opener
  gains `*resolved:*` (on the opener line — see the parser edge above), and
  the sub-lines are **deleted**. The scaffolding comes down; the converged doc
  stays compact.
- Sizing rule unchanged: a tiny build's single obvious question can stay
  one line. The sub-lines earn their keep when the question is real enough to
  wait for a human decision.

### R2 — Glossed references as house style, slugs at birth

Every cross-reference to a numbered item carries a two-or-three-word gloss:
`D4 (default-waves)`, `C6 (subprocess-reaper)`, `Q2 (pnpm-pack-json)` — in
intent.md, build-log, report.md, and chat alike. To keep glosses consistent
rather than re-invented at each site, mint the slug **where the item is
born**:

```markdown
- D4 (default-waves): mutation gets its own default wave 30 — *because*
  stryker saturates cores and conflicts with a concurrent vitest run.
```

Reference sites copy the slug. `scrapeBullets` is indifferent to the extra
parenthetical, and the slug doubles as a retrieval anchor for the *model*
after context compaction — bare labels are exactly the tokens most likely to
misresolve once the surrounding definition has been summarized away. Dual
payer, ~3 tokens per site.

### R3 — pb-refine authors and presents the expanded form

Two edits to `skills/pb-refine/SKILL.md` attack mode:

1. Drop "one-line question"; append the R1 three-line form instead.
2. When surfacing holes in chat, present the checkride walkthrough shape —
   every question listed with its plain-English explanation and lean, closing
   with an invitation to answer or push back per question. The chat
   presentation and the doc entry are now the same content, so nothing is
   authored twice and nothing lives only in the transcript.

`skills/pb-plan/SKILL.md` gets the mirror one-liner where it writes Open
questions (step 3), plus the R2 house-style sentence where it writes Decisions.

### R4 — Keep Decisions/Constraints one-line; do not expand settled sections

Explicitly reaffirmed, because it is the countervailing half of the balance:
the per-step agent-envelope injection (`agents.ts:432`) makes these the one
surface where every token recurs. The existing convention — one line, with
the *because* — stands. A decision whose *because* genuinely needs a second
sentence may wrap (the scraper already joins continuations), but that is the
exception, not a new norm.

### R5 — State the compression principle in the template header

One added sentence to the `templates/intent.md` header comment so future
authors (human or model) size prose to the reader instead of to habit:

> *Compress what's settled; expand what's pending. Settled sections are read
> by machines every step — keep them one-line. Open questions are read by a
> human deciding — give each enough plain-English context to be judged cold,
> and delete the explanation when it resolves.*

### R6 — Same cold-reader test for park entries (minor)

Park-list items in the build log are harvested much later, by definition cold.
The same one-line-of-context rule applies (`- [ ] <item> — <why it was parked,
one clause>`). Worth a sentence in `skills/pb-park/SKILL.md` when it is next
touched; not worth its own build.

## Touchpoints if adopted

`templates/intent.md` (R1, R5), `skills/pb-refine/SKILL.md` (R3),
`skills/pb-plan/SKILL.md` (R2, R3), `skills/pb-park/SKILL.md` (R6, opportunistic),
`docs/techniques.md` (house-style note). **No parser changes** — verified
against `parseOpenQuestions` (orient.ts:131) and `scrapeBullets`
(intent.ts:202). One cheap regression worth pinning: a contract test asserting
the open-question count is unmoved by `*plain:*`/`*lean:*` sub-lines and that
`*resolved:*` on the opener drops it. Doc-and-skills work otherwise — a small
build, no new verbs, no envelope changes (the doorway freeze holds).
