// `plumbbob setup` — the installer. Two install shapes:
//
//   self-contained (default when plumbbob is a project-local dep; --local /
//     --project to force) — NOTHING is written under ~/.claude. The hooks are
//     referenced in place at $CLAUDE_PROJECT_DIR/node_modules/plumbbob/hooks/,
//     and the skills are copied into <repo>/.claude/skills/ with their bin
//     invocation pointed at $CLAUDE_PROJECT_DIR/node_modules/.bin/plumbbob. The
//     registration lands in:
//       --local   (default) <repo>/.claude/settings.local.json  — personal, untracked
//       --project           <repo>/.claude/settings.json         — committable, enrolls the team
//     This is the "run it from the project root, no global install" shape.
//
//   global (--global, or the auto default when plumbbob is NOT a project-local
//     dep) — the original behavior: copy the hooks to ~/.claude/plumbbob/hooks/
//     and the skills to ~/.claude/skills/, register absolute command paths in
//     ~/.claude/settings.json, and leave the skills calling a bare `plumbbob`.
//
// `--uninstall` strips the registration from whichever settings file the same
// resolution selects; installed/copied files are left in place. The hooks are
// session-gated, so any registration is safe in every repo (C7).

import { chmodSync, cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findRepoRoot } from '../lib/git.ts'
import { mergeRegistration, readSettings, stripRegistration, writeSettings } from '../lib/settings.ts'

const HOOK_FILES: ReadonlyArray<string> = ['post-edit.sh']

// The placeholder every skill carries in place of its `plumbbob` invocation;
// setup substitutes it with the form the chosen install shape resolves.
const BIN_PLACEHOLDER = '__PLUMBBOB_BIN__'

// Self-contained installs address everything through Claude Code's project-root
// variable so committed/portable files carry no machine-absolute path.
const SELF_HOOKS_DIR = '$CLAUDE_PROJECT_DIR/node_modules/plumbbob/hooks'
const SELF_BIN = '$CLAUDE_PROJECT_DIR/node_modules/.bin/plumbbob'

type Mode =
  | { readonly kind: 'global'; readonly settingsFile: string }
  | { readonly kind: 'self'; readonly settingsFile: string; readonly repoRoot: string }

export function setup(cwd: string, args: ReadonlyArray<string>): number {
  const home = process.env.HOME ?? homedir()
  const mode = resolveMode(cwd, home, args)
  if (mode === null) {
    process.stderr.write(
      'plumbbob: a project-scoped install writes <repo>/.claude/, but this is not a git repository. ' +
        'Run setup from inside the repo, or use --global to install under ~/.claude.\n',
    )
    return 1
  }

  if (args.includes('--uninstall')) {
    writeSettings(mode.settingsFile, stripRegistration(readSettings(mode.settingsFile)))
    process.stdout.write(
      `plumbbob: removed the hook registration from ${mode.settingsFile}. The installed/copied hooks and skills were left in place.\n`,
    )
    return 0
  }

  return mode.kind === 'global' ? installGlobal(home, mode.settingsFile) : installSelfContained(mode)
}

// The original shape: hooks + skills copied under ~/.claude, absolute command
// paths, skills calling a bare `plumbbob` (which the global npm install puts on
// PATH).
function installGlobal(home: string, settingsFile: string): number {
  const hooksDir = join(home, '.claude', 'plumbbob', 'hooks')
  const skillsDir = join(home, '.claude', 'skills')
  cpSync(packageDir('hooks'), hooksDir, { recursive: true })
  for (const file of HOOK_FILES) {
    chmodSync(join(hooksDir, file), 0o755)
  }
  cpSync(packageDir('skills'), skillsDir, { recursive: true })
  substituteSkillBins(skillsDir, 'plumbbob')

  writeSettings(settingsFile, mergeRegistration(readSettings(settingsFile), hooksDir))

  process.stdout.write(
    `plumbbob: installed hooks → ${hooksDir}, skills → ${skillsDir}.\n` +
      `plumbbob: registered the hooks in ${settingsFile} (global scope).\n` +
      'plumbbob: restart Claude Code (or reload settings) for the hooks to take effect.\n' +
      "plumbbob: the skills call a bare `plumbbob`; the npm install puts it (and `pb`) on PATH. From a dev checkout add `alias plumbbob='node <repo>/src/cli.ts'`.\n",
  )
  return 0
}

// The self-contained shape: nothing under ~/.claude. Hooks are referenced in
// place inside node_modules; only the skills are copied into the repo (Claude
// Code discovers skills under .claude/skills/, never from node_modules), with
// their bin invocation rewritten to the project-local binary.
function installSelfContained(mode: Extract<Mode, { kind: 'self' }>): number {
  const skillsDir = join(mode.repoRoot, '.claude', 'skills')
  cpSync(packageDir('skills'), skillsDir, { recursive: true })
  substituteSkillBins(skillsDir, SELF_BIN)

  writeSettings(mode.settingsFile, mergeRegistration(readSettings(mode.settingsFile), SELF_HOOKS_DIR, true))

  const note =
    existsSync(join(mode.repoRoot, 'node_modules', 'plumbbob', 'hooks'))
      ? ''
      : 'plumbbob: note — node_modules/plumbbob/ is not present in this repo yet. Add plumbbob as a dependency (e.g. `pnpm add -D plumbbob`) so the registered hooks resolve.\n'
  const scope = mode.settingsFile.endsWith('settings.local.json') ? 'local' : 'project'

  process.stdout.write(
    `plumbbob: copied skills → ${skillsDir} (bin → ${SELF_BIN}). Nothing was written under ~/.claude.\n` +
      `plumbbob: referenced the hooks at ${SELF_HOOKS_DIR} and registered them in ${mode.settingsFile} (${scope} scope).\n` +
      note +
      'plumbbob: restart Claude Code (or reload settings) for the hooks to take effect.\n' +
      'plumbbob: drive the workflow from the chat with the `pb-*` driver skills. Keep the transition verbs OUT of your settings allowlist — each driver skill self-authorizes its own verb, so a stray model-initiated transition still surfaces a permission prompt.\n',
  )
  return 0
}

// Resolve which install shape and settings file to use. Explicit flags win;
// with no flag, auto-detect — a project-local plumbbob installs self-contained
// (personal, into settings.local.json), anything else installs global. Returns
// null when a project scope is required but cwd is not in a git repo.
function resolveMode(cwd: string, home: string, args: ReadonlyArray<string>): Mode | null {
  const globalFile = join(home, '.claude', 'settings.json')
  if (args.includes('--global')) {
    return { kind: 'global', settingsFile: globalFile }
  }

  const wantsProject = args.includes('--project')
  const wantsLocal = args.includes('--local')
  const auto = !wantsProject && !wantsLocal && isProjectLocal(cwd)

  if (!wantsProject && !wantsLocal && !auto) {
    return { kind: 'global', settingsFile: globalFile }
  }

  const repoRoot = findRepoRoot(cwd)
  if (repoRoot === null) {
    return null
  }
  const file = wantsProject ? 'settings.json' : 'settings.local.json'
  return { kind: 'self', settingsFile: join(repoRoot, '.claude', file), repoRoot }
}

// plumbbob is project-local when its package directory lives inside this repo's
// node_modules (a `pnpm add` / `npm install` dependency), as opposed to a global
// install or a dev checkout.
function isProjectLocal(cwd: string): boolean {
  const repoRoot = findRepoRoot(cwd)
  if (repoRoot === null) {
    return false
  }
  return packageRoot().startsWith(join(repoRoot, 'node_modules') + sep)
}

// Rewrite the bin placeholder in every copied skill (both the `!`...`` status
// pre-injection and the allowed-tools patterns) to the resolved invocation.
function substituteSkillBins(skillsDir: string, bin: string): void {
  for (const name of readdirSync(skillsDir)) {
    const file = join(skillsDir, name, 'SKILL.md')
    if (!statSync(join(skillsDir, name)).isDirectory() || !existsSync(file)) {
      continue
    }
    const src = readFileSync(file, 'utf8')
    if (src.includes(BIN_PLACEHOLDER)) {
      writeFileSync(file, src.split(BIN_PLACEHOLDER).join(bin))
    }
  }
}

// The plumbbob package root (parent of hooks/ and skills/), off this module's URL.
function packageRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url))
}

function packageDir(name: string): string {
  return join(packageRoot(), name)
}
