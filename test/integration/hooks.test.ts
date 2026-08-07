import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanupFixtures, makeFixtureRepo, runCli, writeSidecar } from '../helpers/fixture-repo.ts'
import { postEdit, preBashCommit } from '../helpers/run-hook.ts'

afterAll(cleanupFixtures)

function makeExecutable(dir: string, rel: string, script: string): void {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, script)
  chmodSync(path, 0o755)
}

// PlumbBob has no muzzle, no seam-guard, and no bash-guard — D1 (lean-cli)/
// D13 (no-edit-guards). The only edit-time hook is the PostToolUse light
// feedback: it never blocks and exists solely to give the model the diagnostics
// it cannot otherwise see — D25 (light-then-heavy).
describe('post-edit light feedback — D25 (light-then-heavy), the only edit-time hook', () => {
  it('no-ops (exit 0, no context) when the tools are absent', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Lint'])
    makeExecutable(dir, 'src/a.ts', 'export const a = 1\n')
    const result = postEdit(dir, { rel: 'src/a.ts' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('reports file-scoped failures via additionalContext, still exits 0', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Lint'])
    makeExecutable(dir, 'src/a.ts', 'export const a = 1\n')
    makeExecutable(dir, 'node_modules/.bin/oxlint', '#!/bin/sh\necho "a.ts:1 no-explicit-any" >&2\nexit 1\n')
    const result = postEdit(dir, { rel: 'src/a.ts' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('additionalContext')
    expect(result.stdout).toContain('no-explicit-any')
  })

  it('stays silent when the file-scoped check passes', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Lint'])
    makeExecutable(dir, 'src/a.ts', 'export const a = 1\n')
    makeExecutable(dir, 'node_modules/.bin/oxlint', '#!/bin/sh\nexit 0\n')
    const result = postEdit(dir, { rel: 'src/a.ts' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('no-ops when there is no active build (STATE absent / empty)', () => {
    const dir = makeFixtureRepo() // note: no `start`, so find_root finds no non-empty STATE and fails
    const result = postEdit(dir, { rel: 'src/a.ts' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('no-ops for a non-source file extension', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Lint'])
    const result = postEdit(dir, { rel: 'notes.md' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('no-ops when the edited path no longer exists', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Lint'])
    const result = postEdit(dir, { rel: 'src/ghost.ts' }) // never created
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })
})

// The git-commit ask-hook — D66 (oob-commits-surfaced): a raw `git commit` mid-step
// becomes a permission *question*, never a wall. checkpoint owns the landing; this
// only nudges the human to route through it. Always exits 0, never `deny`s —
// D13 (no-edit-guards) stays intact.
describe('git-commit ask-hook — D66 (oob-commits-surfaced), checkpoint owns the landing', () => {
  // Put a step in flight: `start` mints the STATE cursor + build folder, then
  // a STEP file (what `build <n>` would write) is the "in flight" signal the hook reads.
  function withStepInFlight(): string {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Latch'])
    writeSidecar(dir, 'STEP', '4\n')
    return dir
  }

  it('asks (never denies) on a git commit while a step is in flight', () => {
    const result = preBashCommit(withStepInFlight(), 'git commit -m "wip"')
    expect(result.status).toBe(0)
    const out = JSON.parse(result.stdout) as {
      hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string }
    }
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse')
    expect(out.hookSpecificOutput.permissionDecision).toBe('ask')
    expect(out.hookSpecificOutput.permissionDecision).not.toBe('deny')
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('checkpoint owns the landing')
  })

  it('asks on a git commit carrying global options before the subcommand', () => {
    const result = preBashCommit(withStepInFlight(), 'git -C sub -c user.name=x commit --amend')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"permissionDecision": "ask"')
  })

  it('stays silent for a non-commit git command while a step is in flight', () => {
    const result = preBashCommit(withStepInFlight(), 'git status --short')
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('does not fire on a git command that merely mentions commit in an option value', () => {
    const result = preBashCommit(withStepInFlight(), 'git log --grep=commit --oneline')
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('stays silent when the active build has no step in flight (no STEP)', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Latch']) // cursor + folder, but no STEP written
    const result = preBashCommit(dir, 'git commit -m "wip"')
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('no-ops in a repo with no active session (no STATE sentinel)', () => {
    const dir = makeFixtureRepo() // no `start`, so find_root finds no session
    const result = preBashCommit(dir, 'git commit -m "wip"')
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('stays silent when "git commit" is prose inside a quoted string, not an invocation', () => {
    const dir = withStepInFlight()
    for (const cmd of [
      'grep -rn "git commit" src/',
      "echo 'never route around it with a raw git commit -m wip'",
      'rg "plumbbob checkpoint|git commit -am" docs/',
    ]) {
      const result = preBashCommit(dir, cmd)
      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe('')
    }
  })

  it('stays silent when "git commit" appears only in a heredoc body', () => {
    const cmd = ["plumbbob checkpoint --body <<'BODY'", 'self-review: no raw git commit -m was used.', 'BODY'].join(
      '\n',
    )
    const result = preBashCommit(withStepInFlight(), cmd)
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  it('still asks on a real commit whose message rides a heredoc', () => {
    const cmd = ['git commit -F- <<MSG', 'wip: landing by hand', 'MSG'].join('\n')
    const result = preBashCommit(withStepInFlight(), cmd)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"permissionDecision": "ask"')
  })

  it('still asks on a commit whose -m message is quoted prose', () => {
    const result = preBashCommit(withStepInFlight(), 'git commit -m "docs: mention git commit etiquette"')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"permissionDecision": "ask"')
  })

  it('guards a --local session too (flat STEP, no activeBuild cursor)', () => {
    const dir = makeFixtureRepo()
    runCli(dir, ['start', 'Latch', '--local'])
    writeFileSync(join(dir, '.plumbbob', 'STEP'), '2\n')
    const result = preBashCommit(dir, 'git commit -m "wip"')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"permissionDecision": "ask"')
  })
})
