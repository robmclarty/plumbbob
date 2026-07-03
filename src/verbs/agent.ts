// `plumbbob agent <subcommand>` — the doorway to user-authored agents (D1/D3).
// Step 2 ships `agent list`: walk the two agent tiers and print each resolvable
// agent's name, origin, slots, and description. `agent run` (step 4) spawns and
// lands later; until then an unknown or absent subcommand reports the usage.
// A thin read-write shell — resolution and rendering live in lib/agents.ts.

import { findRepoRoot } from '../lib/git.ts'
import { formatAgentList, listAgents } from '../lib/agents.ts'

export function agent(cwd: string, args: ReadonlyArray<string> = []): number {
  const [sub, ...rest] = args
  if (sub === 'list') return list(cwd, rest)
  const known = 'Available subcommands: list.'
  const message = sub === undefined ? `plumbbob agent <subcommand>. ${known}` : `plumbbob: unknown 'agent' subcommand '${sub}'. ${known}`
  process.stderr.write(`${message}\n`)
  return 1
}

function list(cwd: string, _args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write('plumbbob: not inside a git repository.\n')
    return 1
  }
  process.stdout.write(`${formatAgentList(listAgents(root))}\n`)
  return 0
}
