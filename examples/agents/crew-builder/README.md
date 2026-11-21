# crew-builder

A PlumbBob **`build`-slot agent**: a crew of models authors a step's diff, inside the
step's seam, and one candidate is kept. It is the worked example of the local road in
[D167 (host-orchestration)](../../../docs/decisions.md#d167): where a frontier model builds a
wide step with the host's sub-agents, a small local model gets narrow steps and a flow
that lets several attempts stand in for one good one.

The flow is code, written with [fascicle](https://github.com/robmclarty/fascicle), and
which flow runs is a setting. The agent never checkpoints, runs no plumbbob verb, and
writes no path the seam does not cover. The host model still runs the verify tick, and
the approval is still yours.

## Flows

| `flow` | What runs | fascicle composite |
| --- | --- | --- |
| `single` | one candidate, written to the tree | `step` |
| `proof` | N candidates; each is written in turn and the step's proof command is run against it; the first to pass is kept. When none passes, the best goes back to the builder with the command's output, to the round limit | `ensemble`, then `adversarial` |
| `tournament` | N candidates; a judge model picks pairwise | `tournament` |
| `adversarial` | a builder and a critic model, to the round limit | `adversarial` |
| `auto` (default) | `proof` when the step's proof opens on a command, else `tournament` | |

**A measured pick beats a judged one.** A small model's judgement of code is the weakest
thing it does, and the step already names a command that says whether the work is done.
So `proof` scores a candidate by that command's exit code, and a model is asked to judge
only when there is no command to run. This is why the agent pairs with `grain: fine` or
`coarse` plans whose proofs open on a command.

## Settings

Everything is read from this agent's block of the settings ladder, with an env var under
it and a default as the floor:

| Key | Env | Default | What it sets |
| --- | --- | --- | --- |
| `provider` | `PB_CREW_PROVIDER` | `ollama` | `ollama` (local, native transport) or `claude_cli` (the logged-in Claude session) |
| `model` | `PB_CREW_MODEL` | `qwen2.5-coder:7b`, or `sonnet` | the model that writes |
| `judgeModel` | `PB_CREW_JUDGE_MODEL` | the `model` | the model that judges or critiques |
| `baseUrl` | `OLLAMA_HOST` | `http://localhost:11434` | the Ollama server |
| `flow` | `PB_CREW_FLOW` | `auto` | one of the flows above |
| `candidates` | `PB_CREW_CANDIDATES` | `3` | how many candidates a crew writes, 1 to 5 |
| `rounds` | `PB_CREW_ROUNDS` | `2` | the round limit for a critic's loop or a repair, 1 to 5 |
| `proofTimeout` | `PB_CREW_PROOF_TIMEOUT` | `120` | seconds one run of the proof command may take |
| `callTimeout` | `PB_CREW_CALL_TIMEOUT` | `240` | seconds one model call may take; a call past it costs that candidate, not the crew |

The local profile, in `.plumbbob/settings.json` or your own `settings.local.json`:

```jsonc
{
  "grain": "fine",
  "agents": { "build": ["crew-builder"] },
  "agentConfig": { "crew-builder": { "provider": "ollama", "model": "qwen2.5-coder:7b", "flow": "proof" } }
}
```

With that in place every step of every build is authored by the crew, and
`/plumbbob:build` runs it for you. Bind it to single steps in a build's `harness.json`
when only some of the plan suits a local model.

## Install

```sh
cp -r examples/agents/crew-builder .plumbbob/agents/
cd .plumbbob/agents/crew-builder && npm install
ollama pull qwen2.5-coder:7b
plumbbob agent list        # crew-builder (project) [build]
```

It needs Node 24 or later. Its dependencies are `fascicle` and `zod` alone.

## Try it standalone

The agent's working directory is the repo it builds in, so try it in a scratch one:

```sh
mkdir /tmp/wrap && cd /tmp/wrap && git init -q && echo '{"type":"module"}' > package.json
node <path-to>/crew-builder/build.mjs < <path-to>/crew-builder/demo/stepcontext.json
```

Its narration is on stderr and its one envelope on stdout. With fascicle's span lines (`… step`,
`… engine.generate`) left out, a run on the 7B default reads:

```text
crew-builder: building step 1 of "A text-wrapping utility" with ollama · qwen2.5-coder:7b @ http://localhost:11434, flow proof
crew-builder: candidate b: 2 files (wrap.mjs, wrap.test.mjs)
crew-builder: candidate a: 2 files (wrap.mjs, wrap.test.mjs)
crew-builder: candidate a: proof fails
crew-builder: candidate b: proof fails
crew-builder: repair: proof fails
```

## What it returns

A `done` envelope whose body says how the candidate was chosen, whether the proof passes,
which files it wrote, and any path a model named outside the seam (refused, and never
written). **A proof that still fails is `done`, with `proof still red:` opening the
summary**: the best attempt stays in the tree for the host model or for you to finish,
and the checkpoint refuses a red proof whoever wrote the diff.

It returns `blocked`, having written nothing, when its dependencies are not installed,
the provider cannot be reached, a model is not pulled, the step has no seam, or no model
returned a file inside the seam.

## What it does not do

- It does not read past the seam. A model sees the files under the seam (12 per `dir/`
  grant, 60 kB in all) and the step's `like` files, and nothing else in the repo.
- It asks for whole files, never patches, which suits a small model and costs tokens on a
  large file. A step that edits a 2,000-line file is the wrong step for it.
- It does not run candidates in separate trees. They share the working tree, so the proof
  is run against one at a time and each is put back before the next.
- It does not stage or commit.

## How it is built

`build.mjs` is one outer `step` handed to fascicle's `run_stdio`, which owns the contract:
it validates the StepContext on stdin, sends the trajectory to stderr, validates the
envelope, and writes exactly one JSON document to stdout. Inside that step the engine is
made once the provider is known, the chosen composite is built from the same `write`
function, and it is run with fascicle's `run`. A provider is a descriptor in `PROVIDERS`,
as in [`../reviewer`](../reviewer/); adding one is one more entry.
