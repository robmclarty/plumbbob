// `plumbbob setup` — the production installer (D27, replacing dev-install.sh).
// Copies the hooks to ~/.claude/plumbbob/hooks/ and the skills to
// ~/.claude/skills/, then merges the hook registration into the settings file the
// chosen scope selects:
//   (default)   ~/.claude/settings.json            — global, this machine
//   --project   <repo>/.claude/settings.json       — committable, enrolls the team
//   --local     <repo>/.claude/settings.local.json — personal, untracked
// Hooks and skills always install once under ~/.claude/; only the registration's
// location and command-path form vary by scope. `--uninstall` strips the
// registration (the installed files are left in place). The hooks are
// session-gated, so a global registration is safe in every repo (C7).

import { chmodSync, cpSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findRepoRoot } from '../lib/git.ts'
import { mergeRegistration, readSettings, stripRegistration, writeSettings } from '../lib/settings.ts'

const HOOK_FILES: ReadonlyArray<string> = ['pre-edit.sh', 'bash-guard.sh', 'post-edit.sh']

type Scope = 'global' | 'project' | 'local'

export function setup(cwd: string, args: ReadonlyArray<string>): number {
  const scope = pickScope(args)
  const home = process.env.HOME ?? homedir()

  const settingsFile = resolveSettingsFile(scope, cwd, home)
  if (settingsFile === null) {
    process.stderr.write(
      `plumbbob: --${scope} writes <repo>/.claude/, but this is not a git repository. Run setup from inside the repo, or use the default global scope.\n`,
    )
    return 1
  }

  if (args.includes('--uninstall')) {
    writeSettings(settingsFile, stripRegistration(readSettings(settingsFile)))
    process.stdout.write(
      `plumbbob: removed the hook registration from ${settingsFile}. The installed hooks/skills under ~/.claude/ were left in place.\n`,
    )
    return 0
  }

  // Hooks + skills install once under ~/.claude/ regardless of scope.
  const installedHooksDir = join(home, '.claude', 'plumbbob', 'hooks')
  const installedSkillsDir = join(home, '.claude', 'skills')
  cpSync(packageDir('hooks'), installedHooksDir, { recursive: true })
  for (const file of HOOK_FILES) {
    chmodSync(join(installedHooksDir, file), 0o755)
  }
  cpSync(packageDir('skills'), installedSkillsDir, { recursive: true })

  // D27: global registers absolute command paths (its settings file is itself
  // under ~); the repo-scoped files register `~`-prefixed paths so committed
  // settings carry no machine-absolute home dir.
  const commandDir = scope === 'global' ? installedHooksDir : '~/.claude/plumbbob/hooks'
  writeSettings(settingsFile, mergeRegistration(readSettings(settingsFile), commandDir))

  process.stdout.write(
    `plumbbob: installed hooks → ${installedHooksDir}, skills → ${installedSkillsDir}.\n` +
      `plumbbob: registered the hooks in ${settingsFile} (${scope} scope).\n` +
      'plumbbob: restart Claude Code (or reload settings) for the hooks to take effect.\n' +
      "plumbbob: installed from npm, `plumbbob` (and its `pb` alias) is already on your PATH; from a dev checkout add `alias plumbbob='node <repo>/src/cli.ts'` so the skills' status pre-injection resolves.\n",
  )
  return 0
}

function pickScope(args: ReadonlyArray<string>): Scope {
  if (args.includes('--project')) {
    return 'project'
  }
  if (args.includes('--local')) {
    return 'local'
  }
  return 'global'
}

// The settings file the scope writes. Global lives under ~; the repo scopes need
// a git root and return null outside one so the verb can refuse with a clear note.
function resolveSettingsFile(scope: Scope, cwd: string, home: string): string | null {
  if (scope === 'global') {
    return join(home, '.claude', 'settings.json')
  }
  const root = findRepoRoot(cwd)
  if (root === null) {
    return null
  }
  return scope === 'project' ? join(root, '.claude', 'settings.json') : join(root, '.claude', 'settings.local.json')
}

// hooks/ and skills/ ship beside src/ in the package; resolve them off this
// module's URL the way `start` resolves templates/.
function packageDir(name: string): string {
  return fileURLToPath(new URL(`../../${name}/`, import.meta.url))
}
