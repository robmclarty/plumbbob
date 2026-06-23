#!/usr/bin/env node
// plumbbob CLI — hand-rolled argv dispatch, zero runtime deps, node: builtins
// only (D1/C2). Functional/procedural: no classes, no `this`, no default
// export (C1). Verbs are wired up build step by build step.

import { start } from './verbs/start.ts'
import { status } from './verbs/status.ts'
import { park } from './verbs/park.ts'
import { build } from './verbs/build.ts'
import { review } from './verbs/review.ts'
import { done } from './verbs/done.ts'
import { check } from './verbs/check.ts'
import { checkpoint } from './verbs/checkpoint.ts'
import { revert } from './verbs/revert.ts'
import { spike } from './verbs/spike.ts'
import { wrap } from './verbs/wrap.ts'
import { finish } from './verbs/finish.ts'
import { reset } from './verbs/reset.ts'
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
  { name: 'check', summary: 'run the heavy check and report; no state change' },
  { name: 'checkpoint', summary: 'checkpoint [<n>]: gate on green, commit/record SHA, mark step done, STATE=DESIGN (executor-agnostic)' },
  { name: 'revert', summary: 'revert [--to n]: git reset --hard to a checkpoint SHA; STATE=DESIGN' },
  { name: 'park', summary: 'park "<text>": append a raw line to the park list' },
  { name: 'spike', summary: 'spike "<slug>" | spike done: throwaway worktree experiment' },
  { name: 'wrap', summary: 'set STATE=FINISH so /plumbbob-report and /plumbbob-docs can run' },
  { name: 'finish', summary: 'refuse unless a report is archived; archive; clear; muzzle off' },
  { name: 'reset', summary: 'v2 close-out: archive intent+log+report (no gate), clear the sidecar, STATE off' },
  { name: 'setup', summary: 'install hooks + skills; register them (self-contained per-project by default; --global for ~/.claude)' },
]

// Plumbbob v2 (D1/D10/D13): the deciding/executing boundary is no longer a lock,
// so there is nothing to defend — every verb runs the same whether a human or the
// model triggers it. The old human-only `mode` escape hatch and its CLAUDECODE
// in-session refusal are gone; what keeps the human the decider is the pause at
// the step boundary (the skills), not a refusal here.

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
    case 'park':
      return park(cwd, rest)
    case 'build':
      return build(cwd, rest)
    case 'review':
      return review(cwd)
    case 'done':
      return done(cwd)
    case 'check':
      return check(cwd)
    case 'checkpoint':
      return checkpoint(cwd, rest)
    case 'revert':
      return revert(cwd, rest)
    case 'spike':
      return spike(cwd, rest)
    case 'wrap':
      return wrap(cwd)
    case 'finish':
      return finish(cwd)
    case 'reset':
      return reset(cwd)
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

  try {
    return dispatch(verb, process.cwd(), rest)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`plumbbob: ${verb} failed: ${message}\n`)
    return 1
  }
}

process.exit(run(process.argv.slice(2)))
