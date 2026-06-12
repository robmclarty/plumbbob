// The heavy check (D16/D24): the full gate that `review` and `done` refuse to
// advance past while red. The command is read from `.plumbbob/config` (`check=`)
// so non-pnpm repos gate too; tests point it at a stub (`true`/`false`) since a
// real `pnpm check` would recurse into vitest (D14).

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { configPath } from './sidecar.ts'

const DEFAULT_CHECK = 'pnpm run check'

function readCheckCommand(root: string): string {
  let config = ''
  try {
    config = readFileSync(configPath(root), 'utf8')
  } catch {
    return DEFAULT_CHECK
  }
  const line = config.split('\n').find((l) => l.startsWith('check='))
  return line === undefined ? DEFAULT_CHECK : line.slice('check='.length).trim()
}

// Runs the configured check in `root`, streaming its output to the terminal so
// the human sees what failed. Returns the exit code (0 = green).
export function runCheck(root: string): number {
  const command = readCheckCommand(root)
  const result = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit' })
  return result.status ?? 1
}
