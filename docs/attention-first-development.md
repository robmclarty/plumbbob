# Attention-First Development

*A middle ground between long-horizon autonomy and one-step-at-a-time vibing.*

## Two modes, and why both fail for work you care about

Most AI-assisted development swings between two poles.

At one pole is full autonomy: you write a specification, hand it to a harness that
plans, builds, and evaluates across hours of fresh context, and you review the
result at the end. The leverage is enormous. But you have delegated the thinking.
The artifact that comes back is the machine's, and your job was to audit it. That
is the right trade when the design is already settled and the work is large, yet
it removes you from the part that is supposed to be yours: the deciding.

At the other pole is vibing: you sit in the chat and work one prompt at a time,
generating and reacting in a continuous stream. It feels immediate and creative.
But deciding and executing fuse into a single activity. The model converges on an
implementation before you have made the design choices, so you spend your time
anchored to something you never chose, cleaning up after it, following it around.
New code arrives faster than you can absorb it, your plan dissolves into the
noise, and you end the day tired and unsure what you built.

The two failures look opposite but share a root. In autonomy you are *absent* from
the thinking. In vibing you are *present but overwhelmed*, trying to form intent
and absorb output at the same time. Neither lets you stay the author of the work
while the machine does the labor.

Attention-first development is the claim that there is a third mode, and that it
is the default for work you care about.

## The reframe: attention is the scarce resource

The usual framing optimizes the AI. How autonomous can it be, how many tokens, how
much throughput. Attention-first inverts the question. The model is cheap, fast,
and replaceable. Your attention is none of those things. It is the bottleneck and
the thing worth protecting, so you design the process around it rather than around
the machine's throughput.

Once attention is the resource you are optimizing, two things turn out to destroy
it, and the whole method follows from refusing them.

The first is the collision between producing and consuming. You cannot form your
own intent and absorb the model's output in the same moment. Reading overwrites
planning. When you try to track a long generation live while also holding your
plan in your head, the plan loses, every time. This is the specific source of the
exhaustion, and it is structural, not a matter of trying harder.

The second is premature convergence. When implementation arrives before the
decisions are made, you are committed to a shape you never chose. Every later step
inherits it, and most of your effort goes to compensating for a choice that was
never a choice at all. Vibing causes this by default, because the chat is the
place where deciding and converging happen at the same time.

## The principles that follow

Everything else is a consequence of protecting attention from those two
collisions.

**Separate deciding from executing, and keep yourself on the deciding side.**
Convergence is the human's job; execution is the machine's. Vibing fuses them;
autonomy separates them but takes you off convergence entirely. Attention-first
keeps you as the one who converges and puts a boundary around that act so the
execution stream cannot overrun it.

**Externalize the plan onto a durable surface.** The plan does not live in your
head, where the flood erases it, and it does not live in the chat, which is
ephemeral. It lives on a surface you can return to. That surface is what lets you
stop being a firefighter and become a reviewer, because the plan is still there
after the model has spoken.

**Make the unit of work a decision, not a diff.** Progress is measured in choices
resolved, not lines generated. Code is the derived output of settled decisions,
produced once they are settled rather than negotiated in the middle of writing it.
This is also what lets you look back and say the calls were yours: they were
written down, as decisions, before any code existed.

**Decouple generation from absorption in time.** The long turn is not the enemy;
tracking it live is. Let the machine run while you do your own thinking, then come
back and review its output as an editor, on your schedule, in a bounded pass with
a clear end. You stop reacting in real time and start judging on your terms.

**Capture, do not chase.** Attention has momentum, and the cost of breaking focus
to chase a new idea is far higher than the idea is worth in the moment. New
problems and possibilities go onto a parking surface, untouched, and get judged
cold at the next boundary. Most of them are still good ten minutes later, written
down, and the ones that were not cost you nothing.

**Size the process to the work.** Ceremony destroys attention too. A one-line fix
does not earn a design phase. The discipline is decisions before code, not
paperwork for its own sake, and knowing how much process a given task deserves is
itself the skill.

## Where it sits, and when to reach for it

The three modes are not ranked. Each is right for a band of work, and the axis
that sorts them is how much of the work is judgment, and how settled that judgment
is before you start.

- **Vibe** when judgment does not matter: throwaway prototypes, exploration,
  spikes you intend to delete. Speed and immediacy are the whole point, and there
  is nothing to protect.
- **Attention-first** when judgment is load-bearing and unsettled, and stays that
  way throughout: most real features, bugs, and refactors that you care about and
  that the design did not fully resolve up front. Your decisions matter at every
  step, so you stay in the loop, but deliberately, with your attention protected.
- **Full autonomy** when judgment is settled and the work is large: a
  specification firm enough that the machine can run for hours without your choices
  in the loop, and big enough that the leverage is worth giving up your
  moment-to-moment presence.

The poles are the special cases. The middle is where most work that matters lives,
which is why attention-first is a default posture rather than a compromise between
two better options.

## The posture

The shorthand for all of it is that the model is a hand, not a head. It is an
instrument your attention directs, and the directing is the part that does not
transfer to it. Used this way, the work stays yours in the only sense that
matters: the decisions were yours, made deliberately, on a surface you controlled,
while the machine did the typing. You can look back at what shipped and say you
built it, and mean it.

---

*Plumbbob is one concrete instantiation of this posture for small-to-medium work:
a small state machine and a handful of tools that put the deciding-and-executing
boundary under enforcement rather than willpower. The concept does not depend on
it. Any process that treats attention as the scarce resource, externalizes the
plan onto a durable surface, and keeps the human on the convergence side is
attention-first, whatever the tooling underneath.*
