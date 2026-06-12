#!/usr/bin/env node
// plumbline CLI — hand-rolled argv dispatch, zero runtime deps, node: builtins
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

type Verb = {
  readonly name: string
  readonly summary: string
}

const VERBS: ReadonlyArray<Verb> = [
  { name: 'start', summary: 'scaffold .plumbline/; STATE=DESIGN; record the baseline commit' },
  { name: 'status', summary: 'print the session state, or NO ACTIVE SESSION' },
  { name: 'build', summary: 'build <n>: write SEAM from step n; STATE=BUILD' },
  { name: 'review', summary: 'run the heavy check; if green flip to STATE=REVIEW' },
  { name: 'done', summary: 'ensure check green; checkpoint commit + record SHA; STATE=DESIGN' },
  { name: 'revert', summary: 'revert [--to n]: git reset --hard to a checkpoint SHA; STATE=DESIGN' },
  { name: 'park', summary: 'park "<text>": append a raw line to the park list' },
  { name: 'spike', summary: 'spike "<slug>" | spike done: throwaway worktree experiment' },
  { name: 'finish', summary: 'refuse unless a report is archived; archive; clear; muzzle off' },
  { name: 'mode', summary: 'mode <x>: set STATE directly (hidden escape hatch)' },
  { name: 'setup', summary: 'install hooks + skills globally; merge ~/.claude/settings.json' },
]

// D21: deciding/transition verbs are human-only. In a Claude Code session
// (CLAUDECODE set) the dispatch refuses them so the model cannot drive a state
// transition. `park` and `status` are the deliberate exceptions — dumb capture
// and read-only inspection are model-safe.
const TRANSITION_VERBS: ReadonlySet<string> = new Set([
  'start',
  'build',
  'review',
  'done',
  'revert',
  'spike',
  'finish',
  'mode',
])

function formatHelp(): string {
  const width = Math.max(...VERBS.map((v) => v.name.length))
  const rows = VERBS.map((v) => `  ${v.name.padEnd(width)}  ${v.summary}`)
  return ['plumbline — attention-first build process', '', 'Usage: plumbline <verb> [args]', '', 'Verbs:', ...rows, ''].join(
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
    case 'finish':
    case 'setup':
      process.stderr.write(`plumbline: '${verb}' is not implemented yet — it lands in a later build step.\n`)
      return 1
    default:
      process.stderr.write(`plumbline: unknown verb '${verb}'. Run 'plumbline help' for the verb table.\n`)
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

  if (TRANSITION_VERBS.has(verb) && process.env.CLAUDECODE) {
    process.stderr.write(
      `plumbline: '${verb}' is a deciding verb — only the human runs it (you appear to be in a Claude Code session). ` +
        `Do not retry. Ask the human to run \`plumbline ${verb}\` in their terminal.\n`,
    )
    return 1
  }

  try {
    return dispatch(verb, process.cwd(), rest)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`plumbline: ${verb} failed: ${message}\n`)
    return 1
  }
}

process.exit(run(process.argv.slice(2)))
