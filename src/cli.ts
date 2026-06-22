#!/usr/bin/env node
// plumbbob CLI — hand-rolled argv dispatch, zero runtime deps, node: builtins
// only (D1/C2). Functional/procedural: no classes, no `this`, no default
// export (C1). Verbs are wired up build step by build step.

import { start } from './verbs/start.ts'
import { status } from './verbs/status.ts'
import { mode } from './verbs/mode.ts'
import { park } from './verbs/park.ts'
import { build } from './verbs/build.ts'
import { review } from './verbs/review.ts'
import { done } from './verbs/done.ts'
import { revert } from './verbs/revert.ts'
import { spike } from './verbs/spike.ts'
import { wrap } from './verbs/wrap.ts'
import { finish } from './verbs/finish.ts'
import { setup } from './verbs/setup.ts'

type Verb = {
  readonly name: string
  readonly summary: string
}

const VERBS: ReadonlyArray<Verb> = [
  { name: 'start', summary: 'scaffold .plumbbob/; STATE=DESIGN; record the baseline commit' },
  { name: 'status', summary: 'print the session state, or NO ACTIVE SESSION' },
  { name: 'build', summary: 'build <n>: write SEAM from step n; STATE=BUILD' },
  { name: 'review', summary: 'run the heavy check; if green flip to STATE=REVIEW' },
  { name: 'done', summary: 'ensure check green; checkpoint commit + record SHA; STATE=DESIGN' },
  { name: 'revert', summary: 'revert [--to n]: git reset --hard to a checkpoint SHA; STATE=DESIGN' },
  { name: 'park', summary: 'park "<text>": append a raw line to the park list' },
  { name: 'spike', summary: 'spike "<slug>" | spike done: throwaway worktree experiment' },
  { name: 'wrap', summary: 'set STATE=FINISH so /plumbbob-report and /plumbbob-docs can run' },
  { name: 'finish', summary: 'refuse unless a report is archived; archive; clear; muzzle off' },
  { name: 'mode', summary: 'mode <x>: set STATE directly (hidden escape hatch)' },
  { name: 'setup', summary: 'install hooks + skills; register them (self-contained per-project by default; --global for ~/.claude)' },
]

// D21 (revised): the human owns every transition — but the trigger surface is no
// longer "terminal vs chat", it is "human-initiated vs model-initiated". The
// human now fires transitions from the chat through the `pb-*` driver skills
// (`disable-model-invocation: true`, so the model can never invoke them) just as
// well as from a terminal, so the blanket in-session refusal is gone. The lone
// hold-out is `mode`, the hidden escape hatch for desyncs: it stays human-only,
// refused in-session (CLAUDECODE set) and also blocked from the model's shell by
// bash-guard.sh. A stray model-initiated transition is caught by Claude Code's
// permission prompt, since the transition verbs are deliberately kept out of the
// settings allowlist (only each driver skill self-authorizes its own verb).
const HUMAN_ONLY_VERBS: ReadonlySet<string> = new Set(['mode'])

function formatHelp(): string {
  const width = Math.max(...VERBS.map((v) => v.name.length))
  const rows = VERBS.map((v) => `  ${v.name.padEnd(width)}  ${v.summary}`)
  return ['plumbbob — attention-first build process', '', 'Usage: plumbbob <verb> [args]', '', 'Verbs:', ...rows, ''].join(
    '\n',
  )
}

function dispatch(verb: string, cwd: string, rest: ReadonlyArray<string>): number {
  switch (verb) {
    case 'start':
      return start(cwd, rest)
    case 'status':
      return status(cwd)
    case 'mode':
      return mode(cwd, rest)
    case 'park':
      return park(cwd, rest)
    case 'build':
      return build(cwd, rest)
    case 'review':
      return review(cwd)
    case 'done':
      return done(cwd)
    case 'revert':
      return revert(cwd, rest)
    case 'spike':
      return spike(cwd, rest)
    case 'wrap':
      return wrap(cwd)
    case 'finish':
      return finish(cwd)
    case 'setup':
      return setup(cwd, rest)
    default:
      process.stderr.write(`plumbbob: unknown verb '${verb}'. Run 'plumbbob help' for the verb table.\n`)
      return 1
  }
}

function run(argv: ReadonlyArray<string>): number {
  const verb = argv[0] ?? 'help'
  const rest = argv.slice(1)

  if (verb === 'help' || verb === '--help' || verb === '-h') {
    process.stdout.write(`${formatHelp()}\n`)
    return 0
  }

  if (HUMAN_ONLY_VERBS.has(verb) && process.env.CLAUDECODE) {
    process.stderr.write(
      `plumbbob: '${verb}' is the human's escape hatch, not a model action (you appear to be in a Claude Code session). ` +
        `Do not retry. Ask the human to run \`plumbbob ${verb}\` themselves.\n`,
    )
    return 1
  }

  try {
    return dispatch(verb, process.cwd(), rest)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`plumbbob: ${verb} failed: ${message}\n`)
    return 1
  }
}

process.exit(run(process.argv.slice(2)))
