# Generation Loss

*Why AI output degrades when it feeds on itself, and why the hand still
matters.*

## The Rock, a hundred times

In the spring of 2025, a Reddit user handed ChatGPT a photograph of Dwayne
Johnson with the instruction "create the exact replica of this image, don't
change a thing" — then fed each result back in as the next input, a hundred
times. The first few copies pass for the photograph. Then the features begin
to exaggerate, the palette drifts orange, the proportions slide, and by
iteration 101 the image is bright abstract art with no face in it at all
([the experiment](https://www.techradar.com/computing/artificial-intelligence/viral-chatgpt-trend-gone-wrong-the-rock-is-turned-into-horrible-abstract-art-after-reddit-user-recreates-image-101-times),
[the short](https://www.youtube.com/shorts/vuqMUMh29t8),
[the trend](https://knowyourmeme.com/memes/replicate-this-image-100-times)).

The distortion is not noise. The model does not copy pixels; it describes the
image to itself and regenerates it from the description. Every pass is a lossy
re-encoding through the model's priors, so the errors all lean the same way —
toward what the model already believes a face looks like. That is why the
drift produces caricature rather than static.

The phenomenon is older than AI and already has a name:
[generation loss](https://en.wikipedia.org/wiki/Generation_loss). A photocopy
of a photocopy. A VHS dub of a dub. In 1969 Alvin Lucier recorded
[*I Am Sitting in a Room*](https://en.wikipedia.org/wiki/I_Am_Sitting_in_a_Room):
he read a text aloud, played the tape back into the room, re-recorded it, and
repeated until his words dissolved into the room's resonant frequencies.
Lucier, who stuttered, said the process would "smooth out any irregularities
my speech might have." It did. It erased his voice and kept the room's. In
2009, [Translation Party](https://movingimage.org/archived-events/translation-party/)
bounced English phrases through machine translation until they reached
"equilibrium" — a fixed point that belonged to the software, not the sentence
— and Patrick Liddell uploaded a video to YouTube, downloaded it, and
re-uploaded it [a thousand times](https://en.wikipedia.org/wiki/Patrick_Liddell)
until it was an unrecognizable smear.

The constant across all of them: iterate a message through a lossy medium and
you do not get a degraded copy of the message. You get the medium. The message
is the part that erodes.

## The same loop runs in a repository

The research version of this is *model collapse*: train a model on its own
output for enough generations and the distribution's tails vanish first — the
rare, the precise, the improbable-but-right — before the whole thing converges
to a narrow, repetitive core
([Shumailov et al., *Nature*, 2024](https://www.nature.com/articles/s41586-024-07566-y)).
But collapse-by-training is the slow, planetary version, and you do not need a
training run to reproduce it. The context window is a training set with a
horizon of one session.

Everything a model reads before it writes is a few-shot exemplar: the
templates, the README, the docstrings, the tone of the neighboring files.
Models match the register they find — that is much of what makes them useful —
and assistants amplify it on purpose: GitHub's own engineering blog describes
Copilot [pulling code from your open tabs into the prompt](https://github.blog/ai-and-ml/github-copilot/how-github-copilot-is-getting-better-at-understanding-your-code/)
precisely so suggestions imitate what is already there. The mechanism does not
distinguish your good habits from your bad ones, or your voice from its own.

Now consider what happens when the model wrote the repository's prose in the
first place. Session one generates the docs. Session ten reads them as context
— as ground truth — and writes more prose to match. A copy of a copy. Every
pass that "refreshes" a doc while touching the package is another re-encoding.
The repository is simultaneously the output of the last generation and the
prompt for the next, and the loop closes without a single gradient update.

And it drifts rather than holds, for the same reason the Rock's face did.
Imitation is lossy, and what it loses is not random: each pass regresses
toward the model's house style, the fluent median its tuning selects for.
Repetition is self-reinforcing inside a context window — the more a pattern
occurs, the more probable its next occurrence becomes
([arXiv 2504.01100](https://arxiv.org/abs/2504.01100)). And prose has no
compiler. Code drifts too, but tests and types anchor a program's semantics;
nothing mechanical anchors tone, so style drift goes unchecked by every gate
in the pipeline. The tails die first here as well — the precise word, the
odd-but-exact sentence, everything a probability distribution calls unlikely.
What accumulates is the average. A Hacker News commenter, in a thread asking
[why AI slop feels so bad to read](https://news.ycombinator.com/item?id=42909042),
put it exactly: "Differences in authorial voice, ideas, and personality all
get collapsed down into the average across all perceptual dimensions."

## What happened in this repository

PlumbBob is a case study. This document exists because of it.

Early on, the model drafted the seed prose: the first README, the examples,
the templates — including `templates/intent.md`, the file every build's plan
is born from. The drafts arrived in the model's period register, a chipper
silicon-valley dialect, and they were let stand, because the logic underneath
was right and the words seemed cosmetic.

But a template is a prompt wearing a filename. Every intent.md inherited the
voice. Every session that touched the package read that voice as the house
style and matched it — then leaned a notch further, the way a copy leans into
the previous copy's lean. Over months of the tool being used to build itself,
the dialect thickened: verbs pressed into service as nouns (`the ask`, `the
build`, `the lift`), nouns conscripted as verbs (`to action`, `to solution`),
fresh nominalizations nobody has ever said aloud. It compounded until the
tool's own output — plan prose, status lines, refreshed docs — was genuinely
harder to parse: a caricature of startup English at generation forty, the Rock
with his lips going blue.

The instinctive repair is to ask the model to fix the tone — a deliberate
style pass, guidance in the prompt, compute applied to voice. It helps less
than it should, because it is one more generation of the same copy: a model
repairing its own register still samples from that register. The
recursive-training literature has an unsettling version of this. When code
models gate their own retraining loop by reviewing their own output,
acceptance scores rise while benchmark correctness falls — a rubber-stamp
regime ([arXiv 2606.28438](https://arxiv.org/abs/2606.28438), preprint). The
model grading its own voice likes the drift just fine.

## The evidence

Three bodies of it, from three directions, in agreement.

### From the research literature

- **Shumailov et al., *Nature*, 2024** — [recursive training causes model
  collapse](https://www.nature.com/articles/s41586-024-07566-y) in two phases:
  the tails of the distribution (rare, distinctive content) disappear first,
  then later generations converge to narrow, repetitive output.
- **Alemohammad et al., ICLR 2024** — the
  ["Go MAD" result](https://arxiv.org/abs/2307.01850): "Without enough fresh
  real data in each generation of an autophagous loop, future generative
  models are doomed to have their quality (precision) or diversity (recall)
  progressively decrease." Cherry-picking for quality trades diversity away
  even faster.
- **Guo et al., Findings of NAACL 2024** — recursive fine-tuning on synthetic
  text [consistently shrinks lexical, syntactic, and semantic diversity](https://aclanthology.org/2024.findings-naacl.228/),
  steepest on creative tasks.
- **Padmakumar & He, ICLR 2024** — humans who wrote essays with a
  feedback-tuned model (but not a base model) [produced measurably more
  similar essays](https://arxiv.org/abs/2309.05196): the homogenization traces
  to alignment tuning — the same tuning that produces "AI voice."
- **Doshi & Hauser, *Science Advances*, 2024** — access to AI story ideas
  [raised individual novelty ~8% while making the stories significantly more
  similar to one another](https://www.science.org/doi/10.1126/sciadv.adn5290).
  Individual gain, collective sameness.
- **Liang et al., ICML 2024** — an estimated
  [6.5–16.9% of peer-review text](https://arxiv.org/abs/2403.07183) at major
  ML conferences was substantially LLM-modified; in ICLR 2024 reviews,
  `commendable`, `meticulous`, and `intricate` spiked 9.8×, 34.7×, and 11.2×.
- **Kobak et al., *Science Advances*, 2025** — at least
  [13.5% of 2024 PubMed abstracts](https://arxiv.org/abs/2406.07016) show LLM
  processing; `delves` ran at 28× its expected rate. The fingerprint is now in
  the corpus the next models will train on.
- **Juzek & Ward, COLING 2025** — the overused vocabulary is
  [best explained by human-feedback tuning](https://aclanthology.org/2025.coling-main.426/),
  not training data. The house style is an artifact of the process; every
  model has one.
- **"LLM as a Broken Telephone," 2025** — iterative LLM-to-LLM generation
  [accumulates distortion](https://arxiv.org/abs/2502.20258), and successive
  paraphrasing converges to fixed points: the text stops changing once it is
  fully the model's.
- **Code, specifically** — recursive fine-tuning of code LLMs
  [collapses fastest with no review](https://arxiv.org/abs/2606.28438); human
  and static gates slow it; model self-review rubber-stamps it (preprint).
  Structural self-repetition is a documented failure mode of code generation
  ([arXiv 2505.10402](https://arxiv.org/abs/2505.10402)).
- **The counterweight** — Gerstgrasser et al., 2024:
  [collapse presumes each generation *replaces* the last's data](https://arxiv.org/abs/2404.01413).
  When synthetic output *accumulates alongside* real data, error stays
  bounded. Collapse is a policy, not a fate — which is exactly why the
  practices below work.
- **And the lever** — style-imitation studies find models
  [revert to house style under bare instructions](https://arxiv.org/abs/2509.24930)
  but track a style dramatically better when given genuine examples of it —
  few-shot exemplars beat zero-shot instruction by an order of magnitude. The
  mechanism that degrades is the same mechanism you can point at an original.

### From industry

- **GitClear, 2025** — across 211 million changed lines,
  [copy/pasted code rose from 8.3% to 12.3%](https://www.gitclear.com/ai_assistant_code_quality_2025_research)
  of changes (2021–2024) while moved/refactored lines fell from ~25% to under
  10%; 2024 was the first year on record that within-commit copy/paste
  exceeded moved code. Codebases accumulating copies instead of abstractions.
- **DORA, 2024–2025** — a 25% increase in AI adoption was associated with
  [1.5% lower delivery throughput and 7.2% lower delivery stability](https://dora.dev/research/2024/dora-report/);
  individual productivity rose while system-level quality fell. The 2025
  report's framing: "AI is an amplifier" — of whatever regime already exists.
- **Stack Overflow, 2025** — [46% of developers actively distrust AI
  accuracy](https://survey.stackoverflow.co/2025/ai/) (trust fell year over
  year), and the top frustration, at 45%, is answers "almost right, but not
  quite." Meanwhile [new questions fell to roughly 2009 levels](https://blog.pragmaticengineer.com/stack-overflow-is-almost-dead/)
  — the supply of fresh human answers that trained the models is drying up.
- **The open web** — Ahrefs found
  [74.2% of 900,000 newly created pages](https://ahrefs.com/blog/what-percentage-of-new-content-is-ai-generated)
  contained AI-generated content; Graphite dates
  [the crossover](https://graphite.io/five-percent/more-articles-are-now-created-by-ai-than-humans)
  — more new articles machine-written than human-written — to November 2024.
  The next crawl is majority machine. Ilya Sutskever's NeurIPS 2024 framing:
  "we have but one internet" — data is the fossil fuel of AI, and it is spent.
- **The vocabulary the industry needed** — Simon Willison popularized
  ["slop"](https://simonwillison.net/2024/May/8/slop/) for unwanted AI content
  (Merriam-Webster's 2025 Word of the Year); Jathan Sadowski coined
  ["Habsburg AI"](https://x.com/jathansadowski/status/1625245803211272194) for
  a system "so heavily trained on the outputs of other generative AIs that it
  becomes an inbred mutant, likely with exaggerated, grotesque features"; and
  pre-2022 human text is now called
  [low-background steel](https://lowbackgroundsteel.ai/), after the
  uncontaminated shipwreck steel prized after atmospheric nuclear testing.
- **The working cost** — curl's maintainer reported AI-generated slop reaching
  [~20% of all vulnerability submissions](https://www.theregister.com/2025/07/15/curl_creator_mulls_nixing_bug/)
  while genuine reports fell to ~5%, and
  [ended the bug bounty](https://www.theregister.com/2026/01/21/curl_ends_bug_bounty/)
  to stop the flood. Unreviewed generated prose is an operational cost, not an
  aesthetic complaint.

### From the community

- **The averaging explanation** — HN on
  [why AI slop feels bad to read](https://news.ycombinator.com/item?id=42909042):
  voice collapses "down into the average across all perceptual dimensions";
  "the natural behaviour of AI models is to give you the median answer."
- **The tells, catalogued by exasperation** —
  ["I'm tired of formulaic, 'LLM house style' Show HN submissions"](https://news.ycombinator.com/item?id=44780249):
  the ubiquitous em-dash, `It's not just X — it's Y`, bullet lists that don't
  reduce what you have to read. And
  [tropes.md](https://tropes.fyi/tropes-md), a crowd-maintained file of forty-plus
  LLM writing tropes — meant to be pasted into system prompts, so the fix for
  machine style is itself another prompt, and the community knows it.
- **The style loop leaking backward** — threads on
  [detecting LLM text](https://news.ycombinator.com/item?id=47659807) note
  that humans now avoid legitimate words and constructions because readers
  treat them as AI fingerprints. The attractor is strong enough to bend human
  writing around it.
- **The original as the artifact** — Clayton Ramsey,
  ["I'd rather read the prompt"](https://claytonwramsey.com/blog/prompt/): he
  has "never seen any form of generative model output which I would rather
  see than the original prompt." The human's thought is the valuable thing;
  the expansion is inflation.
- **The commons** — Erik Hoel,
  ["Here lies the internet, murdered by generative AI"](https://www.theintrinsicperspective.com/p/here-lies-the-internet-murdered-by):
  today's viral slop is tomorrow's training data. What was fringe
  [Dead Internet theory](https://en.wikipedia.org/wiki/Dead_Internet_theory)
  now reads as a trendline: automated traffic passed human traffic in 2025.

## The principles that follow

**Anchor texts are load-bearing. Write them by hand.** A template is a prompt
wearing a filename; an example is a few-shot exemplar; the README is the
register a thousand future sessions will match. These few files repay craft
like nothing else in a repository, because everything downstream is a copy of
them. Seed them with slop and the slop compounds. Seed them with your voice
and the machine copies *you* — first-generation copies of a human original
instead of Nth-generation copies of its own. This repository keeps its own
plumb line for prose in [`voice/`](voice/voice.md): hand-owned register
exemplars, read by every writing session and edited by none of them.

**You are the fresh data.** The one reliable mitigation in the collapse
literature is real data in every generation — accumulated alongside the
synthetic, never replaced by it. At repository scale, the hand edit is that
fresh data. A human pass over generated prose injects original signal into
the loop; leave the words untouched and the loop runs closed, and closed
loops converge on the medium.

**Don't ask the model to repair its own voice.** A style pass by the model
over model prose is one more generation of the same copy, and self-review
rubber-stamps. If the model must be involved, hand it your own hand-written
exemplar to imitate — imitation of a real original works; instruction to
"improve the tone" reverts to house style. But the reliable repair is the
pen.

**Review prose the way you review code.** Style has no compiler, so the human
read is the only gate it will ever pass through. A minted noun, a verbified
noun, a sentence no one would say aloud — treat each as a failing test, not a
cosmetic, because every one you let land becomes ground truth for the next
session.

**The voice is a decision.** PlumbBob's one law is *vibe to execute, never
vibe to decide* — and tone, style, and voice sit on the deciding side of that
line. The intent can be entirely yours while the words are entirely the
machine's, and the words will still rot. Hand-writing, or hand-editing until
it reads like you, is not polish on top of the real work. It is half the
quality — the half no gate can check.

## The copy machine and the original

None of this is an argument against the machine. This repository is built
with one, and PlumbBob exists to structure that work, not to refuse it. It is
an argument about what the machine is: an excellent copier and a poor
original. Generation loss never argued against making copies — it argued for
protecting the master. In a loop where every output becomes the next input,
the only anti-entropy available is a human with taste touching the text, and
the only question is whether what the copier copies is an original of yours
or a copy of its own. Let it take the reins completely and the output
degrades into sand — fluent, plausible, and slipping through your fingers.

---

*Provenance, with the door open: this document was drafted by a model, from
sources gathered by models — a first generation working from human originals,
but a copy all the same. Its own thesis says what to do with it: read it with
a pen. Every line that survives should survive because a human decided it
sounds like them.*
