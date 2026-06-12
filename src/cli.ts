#!/usr/bin/env node
// plumbline CLI — hand-rolled argv dispatch, zero runtime deps, node: builtins
// only (D1/C2). Functional/procedural: no classes, no `this`, no default
// export (C1). This step-1 stub knows the full verb table and serves `help`;
// each verb is wired up in a later build step.

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

function formatHelp(): string {
  const width = Math.max(...VERBS.map((v) => v.name.length))
  const rows = VERBS.map((v) => `  ${v.name.padEnd(width)}  ${v.summary}`)
  return [
    'plumbline — attention-first build process',
    '',
    'Usage: plumbline <verb> [args]',
    '',
    'Verbs:',
    ...rows,
    '',
  ].join('\n')
}

function isKnownVerb(verb: string): boolean {
  return VERBS.some((v) => v.name === verb)
}

function run(argv: ReadonlyArray<string>): number {
  const verb = argv[0] ?? 'help'
  if (verb === 'help' || verb === '--help' || verb === '-h') {
    process.stdout.write(`${formatHelp()}\n`)
    return 0
  }
  if (isKnownVerb(verb)) {
    process.stderr.write(`plumbline: '${verb}' is not implemented yet — it lands in a later build step.\n`)
    return 1
  }
  process.stderr.write(`plumbline: unknown verb '${verb}'. Run 'plumbline help' for the verb table.\n`)
  return 1
}

process.exit(run(process.argv.slice(2)))
