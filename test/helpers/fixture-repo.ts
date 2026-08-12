// Test scaffolding — D14 (throwaway-repo-tests): run real CLI verbs against throwaway git repos in tmp
// dirs. Fixtures never use the real `pnpm check` — a recursive vitest hangs.

import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

// Spawns the CLI with CLAUDECODE stripped by default so tests are deterministic
// regardless of the host environment. Pass `{ CLAUDECODE: '1' }` to simulate an
// in-session run; PlumbBob does not gate any verb on it.
export function runCli(
  dir: string,
  args: ReadonlyArray<string>,
  extraEnv: Record<string, string> = {},
  input?: string,
): CliResult {
  const env: Record<string, string | undefined> = { ...process.env }
  delete env.CLAUDECODE
  for (const [key, value] of Object.entries(extraEnv)) {
    env[key] = value
  }
  // spawnSync (not execFileSync) so stderr is captured on success too — verbs
  // emit warnings to stderr while still exiting 0.
  if (input === undefined) {
    const result = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env })
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 }
  }
  // `input` becomes the child's stdin, standing in for a `--body <<'BODY'`
  // heredoc — as a real file, not spawnSync's own `input` plumbing. On POSIX,
  // Node backs that with a unix-domain socket, the same fd-0 shape as an agent
  // harness's own (never-closing) stdin, so commitbody.ts's socket guard would
  // refuse it — a heredoc's actual shape is a regular file, which reads to EOF
  // exactly like a real one.
  const stdinDir = mkdtempSync(join(tmpdir(), 'plumbbob-stdin-'))
  const stdinPath = join(stdinDir, 'body')
  writeFileSync(stdinPath, input)
  const fd = openSync(stdinPath, 'r')
  try {
    const result = spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env, stdio: [fd, 'pipe', 'pipe'] })
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 }
  } finally {
    closeSync(fd)
    rmSync(stdinDir, { recursive: true, force: true })
  }
}

// The tracked artifact plane — D17 (two-planes) — lives under `.plumbbob/builds/<slug>/`; the
// control plane (session sentinel, settings) stays flat at `.plumbbob/`. These
// helpers mirror that split so a test can name a file without knowing which
// plane it is on: build-plane names resolve under the active build folder (named
// by STATE's content — D28 (state-cursor)), everything else stays flat. report.md rides
// with the build folder now: `finish` writes/commits it there so it merges into the
// branch and shows up in the PR (the local-only `archive/` retired), so it resolves
// under `builds/<slug>/` like the other artifacts.
const BUILD_PLANE = new Set(['intent.md', 'build-log.md', 'report.md', 'checkpoints', 'SEAM', 'STEP', 'SPIKE'])

// Mirror the CLI's readCursor (sidecar.ts): the cursor is STATE's single-line
// content, empty under --local, and the legacy `active` sentinel counts as unset.
function activeBuildSlug(dir: string): string | null {
  try {
    const content = readFileSync(join(dir, '.plumbbob', 'STATE'), 'utf8').trim()
    return content.length > 0 && content !== 'active' ? content : null
  } catch {
    return null
  }
}

function sidecarPath(dir: string, name: string): string {
  const slug = activeBuildSlug(dir)
  if (slug !== null && BUILD_PLANE.has(name)) {
    return join(dir, '.plumbbob', 'builds', slug, name)
  }
  return join(dir, '.plumbbob', name)
}

export function readSidecar(dir: string, name: string): string {
  return readFileSync(sidecarPath(dir, name), 'utf8')
}

export function writeSidecar(dir: string, name: string, content: string): void {
  writeFileSync(sidecarPath(dir, name), content)
}

export function sidecarExists(dir: string, name: string): boolean {
  return existsSync(sidecarPath(dir, name))
}

// The derived phase shown in the dashboard, parsed from the `[XXX]` label in
// `plumbbob status`. The phase is not stored — it is computed from the STEP
// file (BUILD) and the SPIKE marker (SPIKE), else DESIGN.
export function phase(dir: string): string {
  return /\[([A-Z]+)\]/.exec(runCli(dir, ['status']).stdout)?.[1] ?? 'NONE'
}
