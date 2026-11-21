# PlumbBob plan: writing a wide step's split

Read by the plan skill when `plumbbob status` shows the line
`orchestration  host: a step may be built by sub-agents, inside its seam`, before the
Steps are written.

## Write each wide step's split

**When status names `orchestration  host`, write each wide step's split.** That line
says the builder may hand a step's slices to the host's sub-agents
(D167 (host-orchestration)). So a step is cut as a domain, a part of the
work one orchestrator can own, and a step whose seam holds slices that can be built
apart carries its split in a `- note:` line: the slices by path, what one slice needs
from another, and what is agreed before they run apart.

```markdown
3. [ ] feat(limiter): rate-limit every auth route
   - seam: `src/limiter/`, `src/routes/auth/`, `docs/limits.md`
   - proof: `pnpm vitest run limiter auth` passes; the 6th request in 60s returns 429
   - note: split three ways: the limiter and its tests under `src/limiter/`; the
     routes under `src/routes/auth/`, built against the limiter's exported type; the
     page in `docs/`. The limiter's type is agreed first, then the three run apart.
```

Cut the slices along the seam's entries, so that no two share a file, and give the step
a proof that opens on a command, since nobody reads a diff this size line by line. A
step with one slice gets no note and is built by one model. The note is prose for the
builder: it names no agent, no tool and no order of calls beyond what must come first.
Without the line in status, write no split. The plan card names a step whose seam holds
two slices or more (a file and its test are one) and carries no note, under
`**Seams**:`: write its split, or, when the step is one piece of work after all, say so
in one line and leave it.
