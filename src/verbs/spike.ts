// `plumbbob spike` (D18) — the spike lifecycle for a genuine fork the design
// phase couldn't settle. `spike "<slug>" [opt…]` creates a sibling git worktree +
// `spike/<slug>-<opt>` branch per option OUTSIDE the repo root (default opts a/b)
// and drops the SPIKE marker; the main tree stays put while you experiment in the
// worktrees, which are hook-dormant by construction — the untracked sidecar (D17)
// doesn't exist in a fresh checkout, so the hooks find no STATE there.
// `spike done` removes every spike worktree + branch and clears the marker.
//
// Worktree git calls run directly here rather than via lib/git.ts (which holds the
// shared additive read/commit helpers): worktree management is spike-local, and
// this is the only place Plumbbob creates branches.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { findRepoRoot } from '../lib/git.ts'
import { hasSession, inSpike, markSpike, clearSpike, resolveBuild, stepPath } from '../lib/sidecar.ts'

const DEFAULT_OPTIONS: ReadonlyArray<string> = ['a', 'b']

export function spike(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }
  const { build: buildSlug, rest } = resolveBuild(root, args)
  const positionals = rest.filter((a) => !a.startsWith('--'))
  if (positionals[0] === 'done') {
    return spikeDone(root, buildSlug)
  }
  return spikeStart(root, buildSlug, positionals)
}

function spikeStart(root: string, buildSlug: string | null, positionals: ReadonlyArray<string>): number {
  if (inSpike(root, buildSlug)) {
    process.stderr.write('plumbbob: already in a spike. Run `plumbbob spike done` to close it first.\n')
    return 1
  }
  if (existsSync(stepPath(root, buildSlug))) {
    process.stderr.write(
      'plumbbob: spike starts from a settled boundary, but a step is in flight. ' +
        'A spike is a deliberate fork — checkpoint or revert the current step first.\n',
    )
    return 1
  }
  const slug = sanitize(positionals[0] ?? '')
  if (slug.length === 0) {
    process.stderr.write('plumbbob: spike needs a slug. Try: plumbbob spike "auth-store" a b.\n')
    return 1
  }
  const explicit = positionals.slice(1).map(sanitize).filter((o) => o.length > 0)
  const options = explicit.length > 0 ? explicit : DEFAULT_OPTIONS

  const created: string[] = []
  for (const opt of options) {
    const path = join(dirname(root), `${basename(root)}-spike-${slug}-${opt}`)
    if (existsSync(path)) {
      process.stderr.write(`plumbbob: ${path} already exists — remove it or run \`plumbbob spike done\` first.\n`)
      return 1
    }
    git(root, ['worktree', 'add', '-b', `spike/${slug}-${opt}`, path, 'HEAD'])
    created.push(path)
  }

  markSpike(root, buildSlug)
  process.stdout.write(
    `plumbbob: spiking — the main tree stays put. Experiment in the throwaway worktrees:\n${created
      .map((p) => `  ${p}`)
      .join('\n')}\nWhen you've decided, record the verdict in intent.md and run \`plumbbob spike done\`.\n`,
  )
  return 0
}

function spikeDone(root: string, buildSlug: string | null): number {
  if (!inSpike(root, buildSlug)) {
    process.stderr.write('plumbbob: no active spike to close.\n')
    return 1
  }
  for (const path of spikeWorktrees(root)) {
    git(root, ['worktree', 'remove', '--force', path])
  }
  git(root, ['worktree', 'prune'])
  for (const branch of spikeBranches(root)) {
    git(root, ['branch', '-D', branch])
  }
  clearSpike(root, buildSlug)
  process.stdout.write(
    'plumbbob: spike closed — worktrees and branches removed, back at the boundary. ' +
      'Record the verdict (which option won, and why) in intent.md before you `build`.\n',
  )
  return 0
}

// Worktree paths whose checked-out branch is under spike/ — parsed from the
// porcelain output (blank-line-separated `worktree <path>` / `branch <ref>` blocks).
function spikeWorktrees(root: string): ReadonlyArray<string> {
  const out = git(root, ['worktree', 'list', '--porcelain'])
  const paths: string[] = []
  let current: string | null = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = line.slice('worktree '.length)
    } else if (current !== null && line.startsWith('branch refs/heads/spike/')) {
      paths.push(current)
    }
  }
  return paths
}

function spikeBranches(root: string): ReadonlyArray<string> {
  const out = git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/spike/'])
  return out.length === 0 ? [] : out.split('\n').filter((b) => b.length > 0)
}

function sanitize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function git(root: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
}
