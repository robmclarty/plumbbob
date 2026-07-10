// Drive the POSIX-sh hooks with synthetic stdin JSON (D14). Paths are resolved
// against the repo's physical path so macOS /var -> /private/var symlinks do not
// break the hook's `pwd -P` prefix matching.

import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOKS_DIR = fileURLToPath(new URL('../../hooks/', import.meta.url))

type HookResult = {
  readonly stdout: string
  readonly stderr: string
  readonly status: number
}

function runHook(hook: string, cwd: string, input: object): HookResult {
  const result = spawnSync('sh', [join(HOOKS_DIR, hook)], { cwd, input: JSON.stringify(input), encoding: 'utf8' })
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? -1 }
}

export function postEdit(repo: string, opts: { rel: string; tool?: string }): HookResult {
  const root = realpathSync(repo)
  return runHook('post-edit.sh', root, {
    hook_event_name: 'PostToolUse',
    tool_name: opts.tool ?? 'Edit',
    tool_input: { file_path: join(root, opts.rel) },
    tool_result: 'ok',
  })
}

// Drive the git-commit ask-hook with a synthetic PreToolUse Bash payload — just the
// command string the model would run.
export function preBashCommit(repo: string, command: string): HookResult {
  return runHook('pre-bash-commit.sh', realpathSync(repo), {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
  })
}
