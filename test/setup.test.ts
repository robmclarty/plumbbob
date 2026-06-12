// `plumbbob setup` (D27): copies hooks + skills under ~/.claude/, then registers
// the hooks in the settings file the chosen scope selects — idempotently. HOME is
// pinned to a throwaway dir per test so the real ~/.claude is never touched; the
// repo scopes use a fixture git repo. These are subprocess-driven (D14).

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, makeNonGitDir, runCli } from './helpers/fixture-repo.ts'

afterAll(cleanupFixtures)

type Cmd = { readonly command: string }
type Entry = { readonly matcher?: string; readonly hooks?: ReadonlyArray<Cmd> }
type Parsed = { hooks?: { PreToolUse?: Entry[]; PostToolUse?: Entry[] }; model?: unknown }

const SKILLS = ['plumbbob-interrogate', 'park', 'plumbbob-triage', 'plumbbob-report', 'plumbbob-docs']
const HOOKS = ['pre-edit.sh', 'bash-guard.sh', 'post-edit.sh']

function setupIn(repo: string, home: string, ...flags: string[]): ReturnType<typeof runCli> {
  return runCli(repo, ['setup', ...flags], { HOME: home })
}
function homeSettings(home: string): string {
  return join(home, '.claude', 'settings.json')
}
function readJson(path: string): Parsed {
  return JSON.parse(readFileSync(path, 'utf8')) as Parsed
}
// Every registered command that points into our installed hooks dir.
function ourCommands(s: Parsed): string[] {
  const pre = s.hooks?.PreToolUse ?? []
  const post = s.hooks?.PostToolUse ?? []
  return [...pre, ...post]
    .flatMap((e) => (e.hooks ?? []).map((h) => h.command))
    .filter((c) => c.includes('.claude/plumbbob/hooks/'))
}

describe('plumbbob setup — global scope', () => {
  it('installs hooks + skills under ~/.claude and registers them in ~/.claude/settings.json', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    expect(setupIn(repo, home).status).toBe(0)

    for (const h of HOOKS) {
      const hookPath = join(home, '.claude', 'plumbbob', 'hooks', h)
      expect(existsSync(hookPath)).toBe(true)
      expect(statSync(hookPath).mode & 0o100).not.toBe(0) // owner-executable
    }
    for (const sk of SKILLS) {
      expect(existsSync(join(home, '.claude', 'skills', sk, 'SKILL.md'))).toBe(true)
    }

    const s = readJson(homeSettings(home))
    expect(ourCommands(s)).toHaveLength(3)
    // global registers ABSOLUTE command paths, all under this home
    expect(ourCommands(s).every((c) => c.startsWith(home))).toBe(true)

    // the matchers wire each hook to the right event/tool
    const pre = s.hooks?.PreToolUse ?? []
    expect(pre.find((e) => e.matcher === 'Bash')?.hooks?.[0]?.command).toMatch(/bash-guard\.sh$/)
    expect(pre.find((e) => e.matcher === 'Edit|Write|MultiEdit|NotebookEdit')?.hooks?.[0]?.command).toMatch(
      /pre-edit\.sh$/,
    )
    expect((s.hooks?.PostToolUse ?? [])[0]?.hooks?.[0]?.command).toMatch(/post-edit\.sh$/)
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
    setupIn(repo, home)

    const s = readJson(homeSettings(home))
    const allPre = (s.hooks?.PreToolUse ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command))
    expect(allPre).toContain('/usr/local/bin/audit.sh') // foreign hook preserved
    expect(ourCommands(s)).toHaveLength(3) // ours added alongside
    expect(s.model).toBe('opus') // unrelated key preserved
  })

  it('adds the hooks key when the settings file has none', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(homeSettings(home), `${JSON.stringify({ model: 'sonnet' }, null, 2)}\n`)
    setupIn(repo, home)

    const s = readJson(homeSettings(home))
    expect(s.hooks?.PreToolUse).toBeDefined()
    expect(ourCommands(s)).toHaveLength(3)
  })

  it('is idempotent: a second run is byte-identical', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupIn(repo, home)
    const first = readFileSync(homeSettings(home), 'utf8')
    setupIn(repo, home)
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
    setupIn(repo, home)
    expect(ourCommands(readJson(homeSettings(home)))).toHaveLength(3)

    setupIn(repo, home, '--uninstall')
    const s = readJson(homeSettings(home))
    expect(ourCommands(s)).toHaveLength(0)
    expect((s.hooks?.PreToolUse ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command))).toContain('/opt/foreign.sh')
  })
})

describe('plumbbob setup — D27 scopes write only their own settings file', () => {
  it('--project writes <repo>/.claude/settings.json with ~-portable command paths', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupIn(repo, home, '--project')

    const projectFile = join(repo, '.claude', 'settings.json')
    expect(existsSync(projectFile)).toBe(true)
    expect(existsSync(join(repo, '.claude', 'settings.local.json'))).toBe(false)
    expect(existsSync(homeSettings(home))).toBe(false) // global settings untouched

    const cmds = ourCommands(readJson(projectFile))
    expect(cmds).toHaveLength(3)
    // committable settings carry NO machine-absolute home dir
    expect(cmds.every((c) => c.startsWith('~/.claude/plumbbob/hooks/'))).toBe(true)
  })

  it('--local writes only <repo>/.claude/settings.local.json', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupIn(repo, home, '--local')

    expect(existsSync(join(repo, '.claude', 'settings.local.json'))).toBe(true)
    expect(existsSync(join(repo, '.claude', 'settings.json'))).toBe(false)
    expect(existsSync(homeSettings(home))).toBe(false)
  })

  it('the default (global) scope writes ~/.claude/settings.json, not the repo', () => {
    const home = makeNonGitDir()
    const repo = makeFixtureRepo()
    setupIn(repo, home)

    expect(existsSync(homeSettings(home))).toBe(true)
    expect(existsSync(join(repo, '.claude', 'settings.json'))).toBe(false)
    expect(existsSync(join(repo, '.claude', 'settings.local.json'))).toBe(false)
  })

  it('refuses --project outside a git repo (no <repo>/.claude/ to write to)', () => {
    const home = makeNonGitDir()
    const nonRepo = makeNonGitDir()
    const result = setupIn(nonRepo, home, '--project')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not a git repository')
  })
})
