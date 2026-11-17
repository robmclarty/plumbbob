# User-authored agents: the doorway

PlumbBob's executor is **author-blind** ([**D3 (author-blind-executor)**](decisions.md#d3)): `/plumbbob:verify` and `checkpoint` read *the
diff, not who wrote it*, so a step's code can come from you, from `/plumbbob:build`, from a vibe
session, or from another harness entirely. This page is the contract for that last case:
the **doorway** a user-authored agent speaks to plug into the loop. An agent here is
**anything executable** that speaks one versioned JSON envelope: a program on disk, a
manifest that names it, and a plan artifact that binds it to a step. The contract needs no
SDK and no particular language: a 34-line POSIX `sh` script and an 8-line manifest are a
complete agent.

The rest of the docs are for driving PlumbBob. This one is for *extending* it. If you only
want to run the loop, you never need this page; the [skills](skills-reference.md)
work with no agents at all.

## The three invariants

Everything below is downstream of three rules. When you author an agent, hold these; when
you wonder why the contract refuses something, it's one of these:

1. **The envelope has no verb to advance the loop** ([**C6 (no-advance-verb)**](decisions.md#c6), the identity invariant).
   Nothing an agent returns can checkpoint, flip a step, or trigger another agent. The
   subprocess boundary enforces *human-as-clock by construction*, not by policy: an agent
   that could advance the loop would be autonomy wearing the loop's costume. This is the
   litmus for every field the envelope will ever grow.
2. **The CLI owns every side effect** ([**D44 (cli-side-effects)**](decisions.md#d44)). An agent *returns* concerns; PlumbBob
   *applies* them: `parked[]` lands as lines the verb itself appends to the build log's
   `## Park list`, untagged, never by the agent writing `.plumbbob/`. The sidecar keeps a
   single writer. The one folder under it an agent may write is its step's
   [evidence folder](#evidence-something-to-look-at), and a file saved there reaches the
   pause only when the CLI lists it.
3. **Review is advisory; checkride gates; the human advances** ([**D45 (advisory-review)**](decisions.md#d45)). An
   `after`-slot agent *informs* the verify pause. No code path lets it fail a step: a
   gate that an agent can trip is the lock returning in autonomy's costume.

## The envelope

The contract is a subprocess convention, run in production since Terraform's `external`
data source shipped it in 2017 and already house style here (checkride uses the same
stream discipline). Four streams, one shape:

```text
                 ┌───────────────────────────────────────────────┐
   stdin  ──────►│  the agent (any executable, run via `sh -c`)  │
   (StepContext  │  cwd = repo root   env: PLUMBBOB_AGENT_DIR     │
    JSON)        └───────────────────────────────────────────────┘
                        │ stdout (JSON)         │ stderr (prose)
                        ▼                        ▼
              the output envelope        streams LIVE to the terminal
              — consumed at the pause     — the human watches it work
```

- **stdin**: a single JSON object, the `StepContext` (below). Read it to EOF.
- **stdout**: a single JSON object, the output envelope (below), and **nothing else,
  ever**. This is the one structured result PlumbBob consumes. A stray `console.log`,
  a progress bar, a banner: anything non-envelope on stdout puts you out of contract.
- **stderr**: free-form prose, streamed live to the human's terminal as you run. This is
  where narration, logs, and reasoning go.
- **exit code**: `0` means the envelope on stdout is authoritative. **Any non-zero exit
  is a failed run**: PlumbBob reports it and stops, and does *not* trust the envelope of a
  child that failed. This is the attention-first split ([**D46 (stream-discipline)**](decisions.md#d46)): production narrates on
  stderr, consumption stays structured on stdout, and the two never collide.

### Input: the StepContext (stdin)

Composed deterministically by the CLI from the build's `intent.md` and settings, the whole
picture of the step you're running against:

```jsonc
{
  "contract": 1,                       // the contract major version (see "Versioning")
  "mode": "before",                    // the slot you're running in: before | build | after
  "build": { "slug": "2026-07-03-rate-limit-the-login-endpoint", "title": "Rate-limit the login endpoint" },
  "step": {
    "n": 3,
    "title": "Make the limit configurable via env",
    "proof": {                         // the step's `- proof:` line
      "command": "pnpm vitest run limiter",   // the code span that opens it, or null
      "text": "`pnpm vitest run limiter` passes; the limit reads from RATE_LIMIT_MAX, defaulting to 5"
    },
    "doneWhen": "`pnpm vitest run limiter` passes; the limit reads from RATE_LIMIT_MAX, defaulting to 5",   // proof.text again, kept for agents written before proof
    "seam": ["src/limiter.ts", "src/__tests__/limiter.test.ts"],  // exact paths / dir/ grants
    "like": ["src/throttle.ts"],       // the step's `- like:` line: files to copy the pattern from, [] when it names none
    "evidenceDir": ".plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/evidence/3"   // where this step's evidence goes, from the repo root
  },
  "decisions":   ["D1 (token-bucket): token bucket over sliding window — because …", "…"],  // verbatim intent bullets
  "constraints": ["C1 (no-new-deps): no new runtime deps — because …", "…"],
  "context":     ["<before-slot agent output threaded in as prose>", "…"],   // inline — D59 (inline-context)
  "settings":    { "auto": false, "agentTimeout": 0, "agent": {} } // plumbbob's own, plus this agent's agentConfig block — never a provider key — D53 (agents-own-keys)
}
```

Notes that matter to an author:

- `step.seam` is parsed **strictly** (it gates git behavior): exact paths or `dir/` grants,
  never globs. Everything else (title, proof, decisions, constraints) is **best-effort
  prose** scraped from `intent.md` ([**D61 (best-effort-scrape)**](decisions.md#d61)): a formatting quirk warns on stderr and is
  skipped, never wedges the run. `decisions`/`constraints` arrive verbatim, each intent
  bullet as one string with its *because* intact, so an agent sees the reasoning, not just
  the ruling.
- `step.proof.text` is the proof line as written, backticks included, and
  `step.proof.command` is the code span that opens it, or `null` for a proof that opens on
  words. `plumbbob checkpoint` runs the command; an agent only reads it. `step.doneWhen`
  carries the same string as `proof.text`, so an agent written against the older field
  keeps working ([**C7 (minimal-envelope)**](decisions.md#c7): the envelope only grows).
- `step.like` is the files the step names to copy the pattern from, in the order its
  `- like:` line gives them, and an empty list when the step has no such line. It is
  advice, read loosely: a token that is not a plain repo-relative path is left out, and a
  path here may not exist, so check before you read it. A builder reads these files before
  it edits; a reviewer judges the diff against the pattern they set
  ([**D156 (like-is-advice)**](decisions.md#d156)).
- `step.evidenceDir` is the folder this step's evidence goes in, as a path from the repo
  root, which is your working directory. PlumbBob names it and does not make it: create it
  when you have something to show, and name each file you saved in the envelope's
  `evidence[]` ([below](#evidence-something-to-look-at)). An agent that shows nothing
  ignores the field.
- `context[]` carries the output of `before`-slot agents, threaded in inline ([**D59 (inline-context)**](decisions.md#d59)): how
  a `build` agent sees what a `before` agent surfaced.
- `settings` is *plumbbob's* relevant configuration, plus one block that is yours: `settings.agent`
  carries this agent's `agentConfig.<name>` entry from the settings ladder (`{}` when none is set;
  the personal overlay replaces the project entry whole, with no deep merge). Provider keys,
  model choice, and sandboxing are still **your** agent's business ([**D53 (agents-own-keys)**](decisions.md#d53)): its env, its
  config; PlumbBob never touches a key.

### Output: the envelope (stdout)

A single JSON object. Two fields are required; the rest default to empty:

```jsonc
{
  "contract": 1,                       // required — must match the CLI's contract major
  "status": "done",                    // required — done | blocked | drift
  "summary": "Read RATE_LIMIT_MAX; default 5; added the default test.",  // required, non-empty
  "body": "…longer prose for the human at the pause…",   // optional
  "parked": ["the 429 body should be JSON, not text"],   // optional — appended to the build log's Park list
  "notes": "needs FOO in the env to run the integration test",  // optional
  "evidence": [                        // optional: files saved under step.evidenceDir, for the person to look at
    { "path": ".plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/evidence/3/01-login.png", "caption": "the form, filled" }
  ]
}
```

`status` is the routing signal, and the three values route differently at the pause
([**D52 (blocked-vs-drift)**](decisions.md#d52)):

| `status` | Meaning | What the human does |
| --------- | ------- | ------------------- |
| `done` | Finished. | Read the summary; continue the loop. |
| `blocked` | Couldn't finish: missing input, failed precondition. | Read `notes`, unblock, **re-run** the agent. |
| `drift` | Finished, but the plan no longer matches reality. | Repair the plan with `/plumbbob:refine` before continuing. |

The routing holds when nobody is pausing between steps. Inside a run, a typed range, or
`--auto`, a `blocked` or `drift` envelope halts the walk at that step's pause, the same card
a default build reaches, and the steps after it wait for the human's next run: an agent
can stop a range, never carry one past its trouble.

`parked[]` is how an agent captures a mid-run "ooh, what if" without acting on it: each
string becomes a `- [ ]` line the CLI appends to `build-log.md`'s `## Park list`, untagged; a build
log with no Park list warns once rather than losing the line ([**D44 (cli-side-effects)**](decisions.md#d44)). Unknown fields are
tolerated and dropped ([**C7 (minimal-envelope)**](decisions.md#c7), see Versioning); a malformed `parked` (non-strings,
blanks) is refused rather than silently dropped, because losing a parked concern is quiet
data loss.

### Evidence: something to look at

**An agent can hand the person something to look at.** A reviewer's summary is a claim; a
screenshot of the form after the sixth request is the thing itself. The agent saves the
file under `step.evidenceDir` and names it in `evidence[]`, each entry a `path` from the
repo root and a `caption`:

```jsonc
"evidence": [
  { "path": ".plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/evidence/3/01-login.png", "caption": "the form, filled" },
  { "path": ".plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/evidence/3/02-limit.png", "caption": "the 6th request, refused" }
]
```

`agent run` keeps the entries that sit under that step's folder and drops the rest, each
with one line on stderr naming the path:

```text
plumbbob: dropped evidence README.md (it must be a file under .plumbbob/builds/2026-07-03-rate-limit-the-login-endpoint/evidence/3/)
```

| An entry is dropped when | The line says |
| --- | --- |
| it has no string `path`, or no string `caption`, or either is blank | `each entry needs a string "path" and a string "caption"` |
| the path holds a line break or another control character, a backtick, or an angle bracket | `the path must be one line with no backtick or angle bracket` |
| the path is absolute | `the path must be relative to the repo root` |
| the path has a `..` segment, even one that lands back inside | `the path must not climb with ".."` |
| the path is the folder itself, another step's folder, a directory, or anywhere else | `it must be a file under <folder>/` |
| the path sits in the folder but a symlink carries it out, the folder or one above it being a link included | `it resolves outside <folder>/` |

An `evidence` that is not a list is ignored whole, with one line. Unlike a malformed
`parked[]`, none of this refuses the envelope: the status, the summary and the parks all
stand, because a picture the person never sees costs a look, where a lost park costs a
concern. A file that is not there yet is still listed; a path given twice keeps its last
caption. The first row is there because the path is written into the build log and onto
the pause as it stands, and a path that carried a line of its own would write one there; a
path dropped for it is printed in quotes, escaped, so the warning stays one line.

What happens to an entry that is kept:

- **The pause lists it.** The step's card carries an `**Evidence**:` part under the
  Readout, one link a line, the caption as the link's text
  ([the presentation spec](presentation.md#the-evidence-part)). A step whose agents showed
  nothing has no such part.
- **The build log records it.** One line in the `## Log`, with the step, the agent, the
  path and the caption, written when the agent runs.
- **Git never sees the file.** The evidence folder is excluded like the control files
  ([state and git](state-and-git.md#the-evidence-folder)), so a screenshot never rides a
  commit. The log line is what the record keeps once the file is gone.
- **Nothing removes it.** PlumbBob never deletes an evidence file
  ([**C4 (never-destroy)**](decisions.md#c4)); clearing the folder is yours to do. The
  pause stops listing it when the step lands, is abandoned or is reverted: `revert` winds
  the work back, so what was shown of it is no longer what you are deciding on.

Evidence is a link and nothing more. It cannot tick a step, pass a gate or fail one
([**C6 (no-advance-verb)**](decisions.md#c6)); the person looks, then decides
([**D157 (evidence-is-shown)**](decisions.md#d157)).

## The manifest: `agent.json`

An agent lives in its own directory holding an `agent.json` that names it and points at its
command:

```jsonc
// .plumbbob/agents/reviewer/agent.json
{
  "contract": 1,                       // required — the contract major this agent speaks
  "name": "reviewer",                  // required — non-empty
  "command": "node \"$PLUMBBOB_AGENT_DIR/review.mjs\"",  // required — the shell command PlumbBob spawns
  "slots": ["after"],                  // required — non-empty subset of before | build | after
  "description": "Flags silent failures and untested branches.",  // optional prose, for the host model
  "when": "after any step that adds error handling or a catch block"  // optional prose, for the host model
}
```

The manifest speaks to **two audiences** ([**D55 (two-audiences)**](decisions.md#d55)):

- `command` is for the **deterministic CLI**: the shell string PlumbBob runs.
- `description` and `when` are prose for the **host model**: the same role a subagent's
  frontmatter `description` plays. `description` says what the agent is; `when` is the cue
  the model reads to decide *whether* to fire this agent mid-build. PlumbBob's config never
  names *when* to run something (that's judgment, and there's always a frontier model in the
  room reading prose); the manifest's `when` is where that judgment gets its hint.

### How the command runs ([**D49 (posix-sh)**](decisions.md#d49), POSIX only)

- **Shell:** the `command` string is run through `sh -c`. It's a shell string, not an argv
  array: pipes, redirects, and `$VAR` all work. POSIX only (\*nix / macOS).
- **cwd:** the **repo root**, not the agent's directory. A `build`-slot agent edits
  repo-relative seam paths, so root is the only cwd that makes those paths resolve: the same
  reason `check` runs its command at root.
- **`PLUMBBOB_AGENT_DIR`:** because cwd is the repo root, the agent's own directory is exposed
  in the environment as `PLUMBBOB_AGENT_DIR`. Reference your own files through it
  (`"$PLUMBBOB_AGENT_DIR/review.mjs"`), never a relative path.

## Where agents live: resolution

Three tiers, plus a flag, resolved first-hit-wins ([**D41 (agent-resolution)**](decisions.md#d41): the settings ladder's shape, and
the same project-then-personal convention as Claude Code's `.claude/agents/`):

```text
--agent <path>              →   an explicit directory, top priority (an escape hatch)
.plumbbob/agents/<name>/    →   project tier: TRACKED, rides the PR — the team's agents
~/.plumbbob/agents/<name>/  →   personal tier: your own library, across every repo
<plumbbob>/builtin-agents/<name>/  →   built-in tier: the agents PlumbBob ships
```

**The nearer tier shadows the farther one.** A name defined in more than one resolves from
the first that holds it: project over personal, and either over a built-in. A tier "hits"
when it holds an `agent.json`: a *malformed* manifest there is surfaced as an error, never
silently skipped in favor of a different agent, so a broken project agent does not quietly
hand its name to the personal or the built-in one.

The built-in tier is the directory `builtin-agents/` inside the installed package
([**D159 (builtin-tier)**](decisions.md#d159)). It resolves last because what ships should
be a default: to replace a built-in, put an agent of the same name in your project or
personal tier, and yours runs. `agent list` and `doctor` show a built-in with the origin
`builtin`. Nothing ships in the tier yet, so today both print what they printed before it
existed.

Because the project tier is tracked, an agent you commit rides the branch into the PR: a
teammate gets it for free. An agent only in your **personal** tier is yours alone: if the
build's `harness.json` binds it and a teammate lacks it, the binding **downgrades to a
warning** and the loop runs without it ([**D54 (bindings-degrade-soft)**](decisions.md#d54)), the same never-required contract as
`/plumbbob:build` itself. (An agent you name *explicitly* is different; see "Fail loud vs degrade
soft.")

## Binding agents to steps: `harness.json`

You plan *which* agent runs at *which* lifecycle point in a build's `harness.json`, a sibling
of `intent.md` under `builds/<slug>/`, authored at `/plumbbob:plan` time ([**D42 (harness-bindings)**](decisions.md#d42)). Three slots,
and only three ([**D43 (three-slots)**](decisions.md#d43)):

- **`before`**: runs before you write the step's code; its envelope is **context in**
  (threaded into the next agent's `context[]`).
- **`build`**: authors the step's diff in your place (still verified the same way, [**D3 (author-blind-executor)**](decisions.md#d3)).
- **`after`**: runs at the verify pause as **advisory** review; it informs, never gates.

A fourth slot is deliberately absent: no declarative format can name "a salient point in the
middle of the work" ([**D43 (three-slots)**](decisions.md#d43)). That's judgment, and it's handled in *prose* (a manifest's
`when`, a step's `note`) by the host model, not by config.

```jsonc
// builds/2026-07-03-rate-limit-the-login-endpoint/harness.json
{
  "contract": 1,
  "defaults": { "after": ["reviewer"] },          // bind to every step
  "steps": {
    "2": { "before": ["schema-lister"],           // per-step slots override the defaults
           "note": "the limiter needs the existing middleware order — list it first" },
    "3": { "build": "codegen", "after": [] }       // a string or a list; [] explicitly binds nothing
  }
}
```

- **The merge ladder** ([**D57 (merge-ladder)**](decisions.md#d57)): for a given step and slot, a `--agent` flag beats a per-step
  entry, which beats `defaults`, which beats project-wide defaults in `settings.json`
  (`{"agents": {"after": ["reviewer"]}}`). First level that names the slot wins: **replace,
  not append**. A slot bound to `[]` is an explicit override to *nothing*. `plumbbob status`
  lists every level under `harness bindings:`, the settings defaults as `settings ·` rows,
  whether or not the build has a `harness.json`.
- **`note`** is prose the host model reads (like a manifest's `when`), never mechanics.
- **A binding may be a path** in place of a name ([below](#binding-by-path)).
- **`harness.json` stays bindings + prose only** ([**C3 (bindings-not-logic)**](decisions.md#c3)). The moment it grows an `if`, a
  `retry`, or a `loop`, the contract has failed its own spec. Control flow lives in *agents*
  (as code) and in *prose* (read by the model), never in config: GitHub Actions' YAML-grown-a-
  programming-language is the cautionary tale.

### Binding by path

**A binding is a name or a path, and a path names the agent's directory outright.** A slot
value that starts with `./`, `../` or `~/`, or is an absolute path, is read as a path;
anything else is a name and walks the tiers. A path walks none of them: it points at a
directory holding an `agent.json`, the way `--agent <path>` does
([**D160 (path-bindings)**](decisions.md#d160)).

```jsonc
{
  "contract": 1,
  "defaults": { "after": ["./tools/walk"] },      // from the repo root
  "steps": {
    "3": { "after": ["~/agents/strict-reviewer", "reviewer"] }   // from your home directory, then a name
  }
}
```

| The binding starts with | It resolves | A miss is |
| --- | --- | --- |
| `./` | from the repo root, and must stay inside the repo | an error |
| `../` | nowhere: it is refused, since it leaves the repo | an error |
| `~/` | from your home directory | a warning, and the binding is skipped |
| `/` (an absolute path) | as written | a warning, and the binding is skipped |

A `./` path is refused when it leaves the repo by any route: through `..` segments
(`./tools/../../elsewhere`), or through a symlink, whether the link is the folder, one
above it, or the `agent.json` itself. A link that stays inside the repo is fine.

A path has no name of its own, so the run takes the manifest's `name`: that is the label
on the summary line and in the handoff ledger, and the key its `agentConfig.<name>` block
is looked up by. Bind `./tools/walk` whose manifest says `"name": "walker"`, and the run
reads `agent "walker" reports done` and receives `agentConfig.walker`.

The settings-level defaults (`{"agents": {"after": ["./tools/walk"]}}`) take a path the
same way. A name typed at the terminal does not: `plumbbob agent run ./tools/walk` looks
for an agent of that name, and `--agent ./tools/walk` is the way to point a typed run at a
directory.

## Running an agent

The skills fire these for you; you rarely type them. The full surface is in the
[CLI reference](cli-reference.md#agent).

```sh
plumbbob agent list                          # every resolvable agent, its tier (project, personal, builtin), slots, description
plumbbob agent run reviewer --step 3         # run a named agent against step 3
plumbbob agent run --mode after --step 3     # run the step's harness-BOUND after-agents
plumbbob agent run reviewer --agent ./r      # --agent points at an explicit directory
```

`agent run` composes the `StepContext`, spawns the command, streams its stderr live, captures
and validates the envelope on stdout, appends any `parked[]` to the build log's Park list, keeps the
`evidence[]` that sits under the step's evidence folder (a Log line each), and records
the envelope in the step's **handoff ledger** (`builds/<slug>/handoff.json`: untracked,
step-scoped, cleared when the step checkpoints, [**D47 (handoff-ledger)**](decisions.md#d47)) so a later `agent run` or a
context-compacted session can thread earlier envelopes back into `context[]`. It re-emits the
validated envelope on **its own stdout** (machine, for the calling skill) with the human
summary on stderr. **No** code path here can checkpoint, flip a step, or chain agents
([**C6 (no-advance-verb)**](decisions.md#c6)).

### Fail loud vs degrade soft

The two ways an agent can go missing route differently ([**D54 (bindings-degrade-soft)**](decisions.md#d54)):

- **You named it**: `agent run reviewer` or `--mode after` against a manifest that doesn't
  declare `after`: **errors**. You asked for that agent specifically; a miss is loud.
- **A harness binding names it** and a teammate lacks it (personal-tier only): **warns and
  skips** ([**D54 (bindings-degrade-soft)**](decisions.md#d54)). A binding is ambient configuration the loop must survive without.
- **A harness binding points at it by path**, and the rule follows where the path points
  ([**D160 (path-bindings)**](decisions.md#d160)). `harness.json` is tracked, so a `./` path
  that is missing, holds a broken `agent.json`, or leaves the repo is a mistake everyone
  on the branch has: it **errors**, the batch exits 1, and the bindings beside it still
  run. A `~/` or absolute path names a place on one person's machine, so a missing or
  broken one **warns and skips**, as a missing name does.

```text
plumbbob: no agent.json at binding path ./tools/walk
plumbbob: binding path ../walk leaves the repo, and a relative binding must stay inside it
plumbbob: binding path ./linked resolves outside the repo, and a relative binding must stay inside it
plumbbob: no agent.json at binding path ~/agents/walk ⚠
  → skipping this binding, since the loop works without it
```

A run that actually *starts* and then fails (non-zero exit, a timeout, garbage on stdout)
is a hard failure either way. [D54 (bindings-degrade-soft)](decisions.md#d54) softens a *missing* agent, not a *broken* one.

### Interrupts and timeouts

- **Ctrl-C** stops the agent, then reports: a present human's interrupt never orphans the
  agent ([**D58 (sigint-forwarded)**](decisions.md#d58)).
- **Timeouts are off by default** ([**D51 (agent-timeout)**](decisions.md#d51)). Set `agentTimeout` (seconds) in the settings
  ladder to arm one; absent or `0` means no timeout. The human is present by default (Ctrl-C
  works), so enforcement is your explicit opt-in, not PlumbBob's guess. On expiry the agent is
  stopped and the run reported as failed.

**A stop asks first, and it reaches everything the agent started**
([**D161 (graceful-agent-stop)**](decisions.md#d161)). The agent runs as the leader of its
own process group. To stop it, PlumbBob sends the whole group SIGTERM, waits up to 5
seconds for the group to empty, then sends it SIGKILL, and reports once nothing is left.
An agent that starts an app server or a browser should trap TERM and close what it
opened. One that traps nothing is cleaned up all the same, since the signal goes to the
group and not to the shell alone.

```text
plumbbob: agent "walkthrough" timed out after 120s (stopped)
plumbbob: agent "walkthrough" timed out after 120s (given 5s to stop, killed)
```

The first line is an agent that went when it was asked. The second is one the SIGKILL had
to end.

Five things follow from that:

- **The run ends when the group is empty**, so an agent that exits on TERM costs no wait;
  the 5 seconds are spent only on a process that ignores the signal.
- **A second Ctrl-C skips the rest of the grace** and kills the group at once.
- **What an agent leaves running is swept when it exits.** The same stop runs after a
  clean exit and after a failed one, and the run keeps the result it had. A process meant
  to outlive the agent has to start in a session of its own.
- **PlumbBob passes the interrupt on.** The agent's group is not the terminal's, so a
  Ctrl-C reaches PlumbBob alone, and so do a SIGTERM and a SIGHUP; each one stops the
  agent the same way. A SIGKILL of PlumbBob itself cannot be caught, and it leaves the
  agent running.
- **An interrupt ends the whole run.** When a slot binds several agents, the ones after
  the stopped agent are not started. The run names them and exits 1.

## Composing agents (nested invocation)

An agent **may** shell `plumbbob agent run` to compose other agents: a build/review loop with
a cutoff, say ([**D50 (nested-agents)**](decisions.md#d50)). This is allowed with no environment guard, because:

- **Loops belong inside agents, as code.** A build-then-review-until-clean loop is legitimate
  composition; its cutoff is *your* job as the author (config never grew a `retry`, [**C3 (bindings-not-logic)**](decisions.md#c3)).
- **The identity invariant holds at every depth.** The envelope has no verb to advance
  PlumbBob's loop ([**C6 (no-advance-verb)**](decisions.md#c6)), so no nesting depth can smuggle one in. A composed agent can drive
  *its* children all it likes; it still cannot checkpoint your build.

The warning, not a wall: an uncapped nest is an infinite loop you wrote. Put the cutoff in.

## The fascicle trap: never route a trajectory to stdout

The single most common way to break the contract, called out because it's easy to hit when you
wrap an existing agent framework (fascicle, an SDK, a REPL agent): **their streaming trajectory
(tokens, tool calls, chain-of-thought) must go to stderr, and only the final envelope to
stdout.**

Frameworks default to writing their trajectory to **stdout** (it's "the output"). Piped
straight through, that trajectory *is* your stdout, and PlumbBob sees a stream of tokens where
it expects one JSON object: you're out of contract on the first byte. The fix is a one-line
redirect discipline:

```sh
#!/usr/bin/env sh
# Run the framework with ALL its narration on stderr (1>&2), capture nothing on stdout…
your-agent-framework --task "$(cat)" 1>&2
# …then emit the ONE envelope on stdout, and nothing else.
printf '%s\n' '{"contract":1,"status":"done","summary":"…"}'
```

stdout is a mailbox for exactly one letter, not a log. Everything the human should *watch* goes
to stderr (where it streams live); only the one structured *result* goes to stdout. Get this
backwards and every run fails validation with "the agent wrote non-JSON to stdout."

As of fascicle 0.8.11 the library enforces this discipline for you: `run_stdio` (from
`fascicle/stdio`) reads JSON from stdin, routes trajectory to stderr, disposes the engine, writes
exactly one JSON document to stdout, and exits 0 only when that document is authoritative (the
whole trap, closed at the source). A worked, in-contract agent built on it ships under
[`examples/agents/ollama-reviewer/`](../examples/agents/ollama-reviewer/).

## Versioning

The envelope, manifest, and `harness.json` all carry a `contract` integer. This PlumbBob speaks
**contract 1**. Within a major version the envelope only *gains* fields, so an older CLI can
read a newer minor; a **major mismatch is refused** with an upgrade hint pointing at whichever
side is behind ([**D46 (stream-discipline)**](decisions.md#d46)), because across a major the shapes may genuinely disagree. Keep your
envelope **minimal**; resist field sprawl (SWE-agent's ACI lesson): additions are a minor
bump, removals or renames are a major ([**C7 (minimal-envelope)**](decisions.md#c7)).

`evidence[]` and `step.evidenceDir` are additions of that kind
([**D157 (evidence-is-shown)**](decisions.md#d157)). The contract is still 1: an agent
written before them runs unchanged, and a PlumbBob that predates them drops an `evidence`
key it does not know, as it drops any other. The envelope `agent run` re-emits and records
carries `evidence` only when it kept an entry, so an agent that shows nothing prints the
bytes it printed before.

## A complete working example

A minimal agent that speaks the envelope end to end (reads the StepContext, narrates on
stderr, parks a stray idea, and returns `done`) ships under
[`examples/agents/echo-reviewer/`](../examples/agents/echo-reviewer/). Drop that directory
under `.plumbbob/agents/`, and:

```sh
plumbbob agent list                       # → echo-reviewer (project) [after] — …
plumbbob agent run echo-reviewer --step 1 # runs it against step 1, streams its prose, prints the envelope
```

It's a 34-line POSIX `sh` script and an 8-line manifest: the whole contract, with nothing to install.

The step up ships beside it under
[`examples/agents/ollama-reviewer/`](../examples/agents/ollama-reviewer/): the same
contract wrapping a real framework and a real local model (fascicle + Ollama), plus a
demo spec `/plumbbob:plan` can absorb to bind it into a build.

And the same review with a **switchable model provider** ships under
[`examples/agents/reviewer/`](../examples/agents/reviewer/): `claude_cli` by default (it
piggybacks the logged-in Claude session; no API key, no local model to pull) or `ollama`
for local, private compute, chosen through the settings ladder (`agentConfig.<name>`,
forwarded to the agent as `ctx.settings.agent`) rather than by editing the agent. It's the
worked example of config travelling the frozen envelope `settings` field; its README
carries the full provider matrix.

The last one looks at the app where the reviewers read the diff. It ships under
[`examples/agents/walkthrough/`](../examples/agents/walkthrough/): you start the app, and
at the pause a model drives it in a headless browser through the Playwright MCP server,
walks what the step's proof says, and returns `match` or `concerns` with a screenshot of
each page as [`evidence[]`](#evidence-something-to-look-at). It runs on Ollama, an
OpenAI-compatible server, Anthropic or OpenRouter, and costs 10 to 30 model turns a walk,
so bind it on the steps with a manual proof.

## See also

- [`skills-reference.md`](skills-reference.md#the-harness-slots): how `/plumbbob:plan`, `/plumbbob:step`,
  `/plumbbob:build`, `/plumbbob:run`, and `/plumbbob:verify` drive the slots for you.
- [`cli-reference.md`](cli-reference.md#agent): `agent list` / `agent run`, the `agentTimeout`
  setting, and the sidecar layout.
- [`decisions.md`](decisions.md): the `D#` / `C#` design-decision key the tags above cite.
