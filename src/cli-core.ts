// plumbbob CLI core — argv dispatch and the help table, separated from the bin
// entry (cli.ts) so the routing/help logic is unit-testable in-process without
// the top-level process.exit. Node builtins plus the deliberate few (D1/C2 —
// currently checkride alone, via check.ts). Functional/procedural: no classes,
// no `this`, no default export (C1).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { start } from './verbs/start.ts'
import { status } from './verbs/status.ts'
import { park } from './verbs/park.ts'
import { build } from './verbs/build.ts'
import { handoff } from './verbs/handoff.ts'
import { check } from './verbs/check.ts'
import { checkpoint } from './verbs/checkpoint.ts'
import { revert } from './verbs/revert.ts'
import { spike } from './verbs/spike.ts'
import { use } from './verbs/use.ts'
import { finish } from './verbs/finish.ts'
import { init } from './verbs/init.ts'
import { doctor } from './verbs/doctor.ts'
import { agent } from './verbs/agent.ts'
import { turn } from './verbs/turn.ts'

type Verb = {
  readonly name: string
  readonly summary: string
}

const VERBS: ReadonlyArray<Verb> = [
  { name: 'start', summary: 'scaffold .plumbbob/; open the session; record the baseline commit' },
  { name: 'status', summary: 'print the orientation dashboard, or NO ACTIVE SESSION' },
  { name: 'build', summary: 'build [<n>]: write the seam from step n, or the next undone step (in-flight, not a lock)' },
  { name: 'handoff', summary: 'print the standardized build hand-off block (pause or post-checkpoint); read-only' },
  { name: 'check', summary: 'run the heavy check and report; no state change (--bail --only a,b … narrow the checkride gate)' },
  { name: 'checkpoint', summary: 'checkpoint [<n>]: gate on green, commit/record SHA, mark step done (executor-agnostic)' },
  { name: 'revert', summary: 'revert [--to n]: git reset --hard to a checkpoint SHA' },
  { name: 'park', summary: 'park "<text>": append a raw line to the park list' },
  { name: 'spike', summary: 'spike "<slug>" | spike done: throwaway worktree experiment' },
  { name: 'use', summary: 'use <slug>: re-point the active-build cursor and resume that build' },
  { name: 'finish', summary: 'close-out: report + final commit (no gate), clear the control state, close the session' },
  { name: 'init', summary: 'link plumbbob into Claude Code as an in-place plugin (~/.claude/skills/plumbbob); --uninstall to undo' },
  { name: 'doctor', summary: 'diagnose the plugin link + detect a legacy flat sidecar; doctor --migrate moves it into builds/ (staged, not committed)' },
  { name: 'agent', summary: 'agent list | run <name> [--step N] [--mode before|build|after]: list or spawn a user-authored agent' },
  { name: 'turn', summary: 'turn: UserPromptSubmit hook machinery — tick the turn ledger from stdin (not a user verb)' },
]

// PlumbBob (D1/D10/D13): the deciding/executing boundary is a pause, not a lock,
// so there is nothing to defend — every verb runs the same whether a human or the
// model triggers it. There is no human-only `mode` escape hatch and no CLAUDECODE
// in-session refusal; what keeps the human the decider is the pause at
// the step boundary (the skills), not a refusal here.

export function formatHelp(): string {
  const width = Math.max(...VERBS.map((v) => v.name.length))
  const rows = VERBS.map((v) => `  ${v.name.padEnd(width)}  ${v.summary}`)
  return ['plumbbob — attention-first build process', '', 'Usage: plumbbob <verb> [args]', '', 'Verbs:', ...rows, ''].join(
    '\n',
  )
}

// The package version, read from the package.json that ships one level above the
// compiled CLI (dist/cli-core.js → ../package.json; in tests src/cli-core.ts →
// ../package.json, the repo root). Builtins only (C2); an absent or malformed
// manifest degrades to 'unknown' rather than throwing, so `--version` never errors.
export function readVersion(): string {
  try {
    const raw = readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
    return (JSON.parse(raw) as { version?: string }).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

// Async because checkride is: `check` and `checkpoint` await the gate (D32),
// `start` awaits the plan-time detection probe (research/07 2a); every other
// verb returns synchronously through the same Promise-typed seam.
async function dispatch(verb: string, cwd: string, rest: ReadonlyArray<string>): Promise<number> {
  switch (verb) {
    case 'start':
      return start(cwd, rest)
    case 'status':
      return status(cwd, rest)
    case 'park':
      return park(cwd, rest)
    case 'build':
      return build(cwd, rest)
    case 'handoff':
      return handoff(cwd, rest)
    case 'check':
      return check(cwd, rest)
    case 'checkpoint':
      return checkpoint(cwd, rest)
    case 'revert':
      return revert(cwd, rest)
    case 'spike':
      return spike(cwd, rest)
    case 'use':
      return use(cwd, rest)
    case 'finish':
      return finish(cwd, rest)
    case 'init':
      return init(rest)
    case 'doctor':
      return doctor(cwd, rest)
    case 'agent':
      return agent(cwd, rest)
    case 'turn':
      return turn(cwd, rest)
    default:
      process.stderr.write(`plumbbob: unknown verb '${verb}'. Run 'plumbbob help' for the verb table.\n`)
      return 1
  }
}

export async function run(argv: ReadonlyArray<string>): Promise<number> {
  const verb = argv[0] ?? 'help'
  const rest = argv.slice(1)

  if (verb === 'help' || verb === '--help' || verb === '-h') {
    process.stdout.write(`${formatHelp()}\n`)
    return 0
  }

  if (verb === 'version' || verb === '--version' || verb === '-v') {
    process.stdout.write(`plumbbob ${readVersion()}\n`)
    return 0
  }

  try {
    return await dispatch(verb, process.cwd(), rest)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`plumbbob: ${verb} failed: ${message}\n`)
    return 1
  }
}
