// The heavy check (D16/D24): the full gate that `review` and `done` refuse to
// advance past while red. The command is the `check` setting, resolved through
// the ladder (flag → settings.local.json → settings.json → default, D7) so
// non-pnpm repos gate too; tests point it at a stub (`true`/`false`) since a
// real `pnpm check` would recurse into vitest (D14).

import { spawnSync } from 'node:child_process'
import { resolveString } from './settings.ts'

const DEFAULT_CHECK = 'pnpm run check'

// Runs the configured check in `root`, streaming its output to the terminal so
// the human sees what failed. Returns the exit code (0 = green). `flag` is the
// optional CLI override at the top of the settings ladder.
export function runCheck(root: string, flag?: string): number {
  const command = resolveString(root, 'check', DEFAULT_CHECK, flag)
  const result = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit' })
  return result.status ?? 1
}
