// Local scaffolding for the lib unit tests: throwaway git repos in tmp. Kept
// separate from tests/helpers/fixture-repo.ts (which also wires the CLI
// subprocess) so the src/ tree never imports across into tests/. Node builtins
// only, functional/procedural — C1 (functional-only)/C2 (few-deliberate-deps).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const created: string[] = []

function git(dir: string, args: ReadonlyArray<string>): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
}

type RepoOptions = {
  // When false, the repo is initialised but has no commits yet (HEAD unborn) —
  // for exercising the no-commit branches of git.ts.
  readonly commit?: boolean
}

export function makeTempRepo(options: RepoOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'plumbbob-lib-'))
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { stdio: 'ignore' })
  git(dir, ['config', 'user.email', 'lib@example.com'])
  git(dir, ['config', 'user.name', 'Lib'])
  git(dir, ['config', 'commit.gpgsign', 'false'])
  if (options.commit !== false) {
    writeFileSync(join(dir, 'README.md'), '# fixture\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'initial commit'])
  }
  created.push(dir)
  return dir
}

// A plain tmp dir that is NOT a git repo.
export function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plumbbob-nogit-'))
  created.push(dir)
  return dir
}

export function cleanupTempRepos(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
}
