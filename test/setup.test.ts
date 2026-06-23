// `plumbbob setup` — two install shapes. The global shape (--global, or the auto
// default when plumbbob is not a project-local dep) copies hooks + skills under
// ~/.claude and registers absolute paths. The self-contained shape (--local /
// --project) writes NOTHING under ~/.claude: it copies skills into
// <repo>/.claude/skills with the bin resolved to the project-local binary, and
// registers the hooks in place under node_modules via $CLAUDE_PROJECT_DIR. HOME
// is pinned to a throwaway dir per test so the real ~/.claude is never touched;
// the repo scopes use a fixture git repo. Subprocess-driven (D14).

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, makeNonGitDir, runCli } from './helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

type Cmd = { readonly command: string }
type Entry = { readonly matcher?: string; readonly hooks?: ReadonlyArray<Cmd> }
type Parsed = { hooks?: { PreToolUse?: Entry[]; PostToolUse?: Entry[] }; model?: unknown }

const JUDGMENT_SKILLS = ['plumbbob-interrogate', 'pb-park', 'pb-harvest', 'plumbbob-report', 'plumbbob-docs']
const DRIVER_SKILLS = ['pb-start', 'pb-build', 'pb-review', 'pb-done', 'pb-revert', 'pb-wrap', 'pb-finish', 'pb-spike']
const SKILLS = [...JUDGMENT_SKILLS, ...DRIVER_SKILLS]
const HOOKS = ['post-edit.sh']

function setupIn(repo: string, home: string, ...flags: string[]): ReturnType<typeof runCli> {
  return runCli(repo, ['setup', ...flags], { HOME: home })
}
function homeSettings(home: string): string {
  return join(home, '.claude', 'settings.json')
}
function repoSettings(repo: string): string {
  return join(repo, '.claude', 'settings.json')
}
function repoLocalSettings(repo: string): string {
  return join(repo, '.claude', 'settings.local.json')
}
function readJson(path: string): Parsed {
  return JSON.parse(readFileSync(path, 'utf8')) as Parsed
}
// Every registered command that points into our hooks dir — matches both the
// global (~/.claude/plumbbob/hooks) and self-contained (node_modules/plumbbob/
// hooks) command forms.
function ourCommands(s: Parsed): string[] {
  const pre = s.hooks?.PreToolUse ?? []
  const post = s.hooks?.PostToolUse ?? []
  return [...pre, ...post]
    .flatMap((e) => (e.hooks ?? []).map((h) => h.command))
    .filter((c) => c.includes('plumbbob/hooks/'))
}
function skillBody(base: string, name: string): string {
  return readFileSync(join(base, '.claude', 'skills', name, 'SKILL.md'), 'utf8')
}

describe('plumbbob setup — global shape', () => {
  it('installs hooks + skills under ~/.claude and registers absolute paths', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    expect(setupIn(repo, home, '--global').status).toBe(0)

    for (const h of HOOKS) {
      const hookPath = join(home, '.claude', 'plumbbob', 'hooks', h)
      expect(existsSync(hookPath)).toBe(true)
      expect(statSync(hookPath).mode & 0o100).not.toBe(0) // owner-executable
    }
    for (const sk of SKILLS) {
      expect(existsSync(join(home, '.claude', 'skills', sk, 'SKILL.md'))).toBe(true)
    }

    const s = readJson(homeSettings(home))
    expect(ourCommands(s)).toHaveLength(1)
    expect(ourCommands(s).every((c) => c.startsWith(home))).toBe(true) // absolute, under this home
    expect(existsSync(repoSettings(repo))).toBe(false) // repo untouched

    expect((s.hooks?.PostToolUse ?? [])[0]?.hooks?.[0]?.command).toMatch(/post-edit\.sh$/)
  })

  it('resolves the skill bin placeholder to a bare `plumbbob`', () => {
    const home = makeNonGitDir()
    setupIn(makeFixtureRepo(), home, '--global')
    const park = readFileSync(join(home, '.claude', 'skills', 'pb-park', 'SKILL.md'), 'utf8')
    expect(park).toContain('!`plumbbob status`')
    expect(park).not.toContain('__PLUMBBOB_BIN__')
  })

  it('falls back to global with no flag when plumbbob is not a project-local dep', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupIn(repo, home)

    expect(existsSync(homeSettings(home))).toBe(true)
    expect(existsSync(repoSettings(repo))).toBe(false)
    expect(existsSync(repoLocalSettings(repo))).toBe(false)
  })

  it('merges into existing hooks, preserving foreign hooks and unrelated keys', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(
      homeSettings(home),
      `${JSON.stringify(
        {
          model: 'opus',
          hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/usr/local/bin/audit.sh' }] }] },
        },
        null,
        2,
      )}\n`,
    )
    setupIn(repo, home, '--global')

    const s = readJson(homeSettings(home))
    const allPre = (s.hooks?.PreToolUse ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command))
    expect(allPre).toContain('/usr/local/bin/audit.sh') // foreign hook preserved
    expect(ourCommands(s)).toHaveLength(1) // ours added alongside
    expect(s.model).toBe('opus') // unrelated key preserved
  })

  it('is idempotent: a second run is byte-identical', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupIn(repo, home, '--global')
    const first = readFileSync(homeSettings(home), 'utf8')
    setupIn(repo, home, '--global')
    expect(readFileSync(homeSettings(home), 'utf8')).toBe(first)
  })

  it('--uninstall strips our registration, leaving foreign hooks intact', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(
      homeSettings(home),
      `${JSON.stringify(
        { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/opt/foreign.sh' }] }] } },
        null,
        2,
      )}\n`,
    )
    setupIn(repo, home, '--global')
    expect(ourCommands(readJson(homeSettings(home)))).toHaveLength(1)

    setupIn(repo, home, '--global', '--uninstall')
    const s = readJson(homeSettings(home))
    expect(ourCommands(s)).toHaveLength(0)
    expect((s.hooks?.PreToolUse ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command))).toContain('/opt/foreign.sh')
  })
})

describe('plumbbob setup — self-contained shape (--local / --project)', () => {
  const SELF_CMD_PREFIX = 'sh "$CLAUDE_PROJECT_DIR/node_modules/plumbbob/hooks/'

  it('--local writes only <repo>/.claude/settings.local.json, nothing under ~/.claude', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    expect(setupIn(repo, home, '--local').status).toBe(0)

    expect(existsSync(repoLocalSettings(repo))).toBe(true)
    expect(existsSync(repoSettings(repo))).toBe(false)
    expect(existsSync(homeSettings(home))).toBe(false) // global settings untouched
    expect(existsSync(join(home, '.claude', 'skills'))).toBe(false) // no global skills copy
    expect(existsSync(join(home, '.claude', 'plumbbob'))).toBe(false) // no global hooks copy

    const cmds = ourCommands(readJson(repoLocalSettings(repo)))
    expect(cmds).toHaveLength(1)
    expect(cmds.every((c) => c.startsWith(SELF_CMD_PREFIX))).toBe(true) // portable, sh-invoked, in node_modules
  })

  it('copies the skills into the repo with the bin resolved to the project-local binary', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupIn(repo, home, '--local')

    for (const sk of SKILLS) {
      expect(existsSync(join(repo, '.claude', 'skills', sk, 'SKILL.md'))).toBe(true)
    }
    const park = skillBody(repo, 'pb-park')
    expect(park).toContain('!`$CLAUDE_PROJECT_DIR/node_modules/.bin/plumbbob status`')
    expect(park).not.toContain('__PLUMBBOB_BIN__')

    const build = skillBody(repo, 'pb-build')
    expect(build).toContain('$CLAUDE_PROJECT_DIR/node_modules/.bin/plumbbob build')
  })

  it('--project writes a committable <repo>/.claude/settings.json, nothing under ~/.claude', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupIn(repo, home, '--project')

    expect(existsSync(repoSettings(repo))).toBe(true)
    expect(existsSync(repoLocalSettings(repo))).toBe(false)
    expect(existsSync(homeSettings(home))).toBe(false)

    const cmds = ourCommands(readJson(repoSettings(repo)))
    expect(cmds).toHaveLength(1)
    expect(cmds.every((c) => c.startsWith(SELF_CMD_PREFIX))).toBe(true) // no machine-absolute path
  })

  it('is idempotent: a second --local run leaves the settings file byte-identical', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupIn(repo, home, '--local')
    const first = readFileSync(repoLocalSettings(repo), 'utf8')
    setupIn(repo, home, '--local')
    expect(readFileSync(repoLocalSettings(repo), 'utf8')).toBe(first)
  })

  it('--uninstall strips the registration from the repo settings file', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupIn(repo, home, '--local')
    expect(ourCommands(readJson(repoLocalSettings(repo)))).toHaveLength(1)

    setupIn(repo, home, '--local', '--uninstall')
    expect(ourCommands(readJson(repoLocalSettings(repo)))).toHaveLength(0)
  })

  it('refuses --local outside a git repo', () => {
    const result = setupIn(makeNonGitDir(), makeNonGitDir(), '--local')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not a git repository')
  })

  it('refuses --project outside a git repo', () => {
    const result = setupIn(makeNonGitDir(), makeNonGitDir(), '--project')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not a git repository')
  })
})
