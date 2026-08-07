<!--
docs/voice/ (the plumb line for prose).

Exemplars of this repo's register, kept as a folder so more can join this one
(a new register earns its own file). The contract, in four lines:

- Hand-owned. The model reads these files; it never edits them unprompted. An
  exemplar the model can rewrite is the copy-of-a-copy loop with extra steps
  (docs/generation-loss.md).
- Injected verbatim. When tooling anchors a prose-writing turn, it injects
  passages from here with one instruction: match this register, not the
  neighboring files.
- Small on purpose. Like Decisions, an exemplar re-injects, so its tokens
  recur; compress what's settled.
- Seeded by selection, not generation (2026-08-07): every passage below is
  quoted from prose that had already survived a human pass, re-punctuated by
  hand rule when the em-dash left the kit. It becomes the plumb line only
  after Rob's pen has been through it; prune, replace, and re-quote by hand.

The "what it never does" list below doubles as the seed list for the
checkride prose slot's vale rules: the exemplars are the positive space, the
reject rules the negative, one taste expressed twice.
-->

# Voice

The register in one line: a careful essayist explaining a tool they built;
complete sentences, concrete numbers, one governing metaphor carried all the
way through, and the reason stated right after the claim.

## The rules the exemplars demonstrate

What this voice does:

- States the principle in bold, then earns it in plain prose; never the
  reverse.
- Gives the number instead of the adjective: "vitest is 52.7s of the 54.7s,"
  not "tests are slow." Measured, not asserted.
- Carries one metaphor per piece (the flood and its banks, the plumb line)
  rather than a bouquet of them.
- Mints vocabulary deliberately, one term at a time, defined at birth (the
  latch, the seam, park, harvest), then uses that term everywhere, glossed at
  every reference site.
- Reaches for the short declarative when it matters: "Reading overwrites
  planning."

What it never does:

- Ambient startup dialect: verbs pressed into nouns ("the ask," "the lift,"
  "the spend"), nouns conscripted as verbs ("to action," "to solution").
  Deliberate coinage is the opposite of this, not an excuse for it.
- Hype adjectives (seamless, robust, powerful, game-changing) or any
  sentence shaped like "it's not just X, it's Y."
- Em-dashes in prose. An inner-sentence aside rides in brackets instead. A
  pause and its trailing phrase take a semicolon when both halves stand alone,
  a colon when the second half names or elaborates the first, and a plain
  comma before a coordinating conjunction.
- Bullet lists that do not shorten the reading.
- A tricolon out of reflex. Three parallel clauses are a choice, made rarely.

## Exemplars

### Essay register

From `docs/attention-first-development.md`:

> The model's output is water in flood: enormous power, but moving wherever
> it wants, almost impossible to coordinate from inside the current. New code
> arrives faster than you can absorb it, your plan washes downstream, and you
> end the day tired and unsure what you built.

### Principle register

From `docs/attention-first-development.md`:

> **Capture, do not chase.** Attention has momentum, and the cost of breaking
> focus to chase a new idea is far higher than the idea is worth in the
> moment. New problems and possibilities go onto a parking surface, untouched,
> and get judged cold at the next boundary. Most of them are still good ten
> minutes later, written down, and the ones that were not cost you nothing.

### Argument register

From `README.md`:

> A system prompt can *ask* a model to plan first and stop for review. What it
> can't do is **hold the line when the model doesn't**, and that mechanical
> half is what PlumbBob adds under the skills.

### Instructional register

From `templates/intent.md`:

> One rule runs through the whole doc: compress what's settled; expand what's
> pending. Decisions and Constraints stay one line each; they re-inject into
> every build step, so their tokens recur. Open questions expand into
> plain-then-lean prose; a human reads them once, to decide, and that
> legibility buys back a chat round-trip.

### Decision register

From a build's intent (2026-07-31), shown as source because source is what
the model writes; one line, the reason that mattered, the numbers plain. A
citation carries its slug in parentheses, never behind a dash, and the slug is
the definition's own, copied rather than reworded. (The `— *because*` is the
decision format's own marker, not prose punctuation, and stands until that
format is decided separately.)

```markdown
**D7 (skip-test-profile)**: the gate profile is `{"skip": ["test"]}`, not an
`only` list — *because* vitest is 52.7s of the 54.7s, and a skip-list stays
correct as slots are added while an only-list silently stops covering them.
```
