// Test scaffolding (D14): run real CLI verbs against throwaway git repos in tmp
// dirs. Fixtures never use the real `pnpm check` — a recursive vitest hangs.

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../../src/cli.ts', import.meta.url))
const created: string[] = []

function git(dir: string, args: ReadonlyArray<string>): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
}

type FixtureOptions = {
  readonly withCheckScript?: boolean
  readonly dirty?: boolean
}

export function makeFixtureRepo(options: FixtureOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'plumbbob-'))
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { stdio: 'ignore' })
  git(dir, ['config', 'user.email', 'fixture@example.com'])
  git(dir, ['config', 'user.name', 'Fixture'])
  git(dir, ['config', 'commit.gpgsign', 'false'])
  writeFileSync(join(dir, 'README.md'), '# fixture\n')
  if (options.withCheckScript === true) {
    const pkg = { name: 'fixture', private: true, scripts: { check: 'true' } }
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  }
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'initial commit'])
  if (options.dirty === true) {
    writeFileSync(join(dir, 'README.md'), '# fixture (modified)\n')
  }
  created.push(dir)
  return dir
}

export function makeNonGitDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plumbbob-nogit-'))
  created.push(dir)
  return dir
}

export function cleanupFixtures(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

type CliResult = {
  readonly stdout: string
  readonly stderr: string
  readonly status: number
}

// Spawns the CLI with CLAUDECODE stripped (simulating the human's terminal) so
// transition verbs run. Pass `{ CLAUDECODE: '1' }` to exercise the D21 refusal.
export function runCli(dir: string, args: ReadonlyArray<string>, extraEnv: Record<string, string> = {}): CliResult {
  const env: Record<string, string | undefined> = { ...process.env }
  delete env.CLAUDECODE
  for (const [key, value] of Object.entries(extraEnv)) {
    env[key] = value
  }
  // spawnSync (not execFileSync) so stderr is captured on success too — verbs
  // emit warnings to stderr while still exiting 0.
  const result = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env })
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 }
}

export function readSidecar(dir: string, name: string): string {
  return readFileSync(join(dir, '.plumbbob', name), 'utf8')
}

export function sidecarExists(dir: string, name: string): boolean {
  return existsSync(join(dir, '.plumbbob', name))
}
