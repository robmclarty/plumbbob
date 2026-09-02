// `plumbbob spike`: the spike lifecycle for a genuine fork the design phase
// couldn't settle. `spike "<slug>" [opt…]` creates a sibling git worktree and a
// `spike/<slug>-<opt>` branch per option OUTSIDE the repo root (default options
// a/b) and drops the SPIKE marker: one of the untracked per-build control files
// under `.plumbbob/` that record what's in flight. The main tree stays put while
// you experiment in the worktrees, which are hook-dormant by construction: the
// untracked control files don't exist in a fresh checkout, so the hooks find no
// STATE (the session sentinel) there. `spike done` removes every spike worktree
// and branch and clears the marker.
//
// Every spike also leaves a durable report (`spike-NN-<slug>.md` beside
// intent.md in the tracked `builds/<slug>/` folder) so the verdict rides the
// branch into the PR instead of evaporating with the throwaway worktrees.
//
// Worktree git calls run directly here rather than via lib/git.ts (which holds the
// shared additive read/commit helpers): worktree management is spike-local, and
// this is the only place Plumbbob creates branches.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { findRepoRoot } from '../lib/git.ts'
import {
  buildFolder,
  clearSpike,
  hasSession,
  inSpike,
  listSpikeReports,
  markSpike,
  nextSpikeReportPath,
  resolveBuild,
  stepPath,
} from '../lib/sidecar.ts'
import { readTemplate, stampTemplate } from '../lib/templates.ts'
import { notice } from '../lib/notice.ts'

// Worktree/branch names when the caller lists none: a fork defaults to two arms.
const DEFAULT_OPTIONS: ReadonlyArray<string> = ['a', 'b']

/**
 * The verbatim Verdict placeholder from templates/spike-report.md: its presence
 * means the spike's call was never recorded, which `spike done` nudges on.
 */
const VERDICT_PLACEHOLDER = '*(viable | not viable | partial'

/**
 * Entry point for `plumbbob spike`: dispatches to open, `report`, or `done`.
 *
 * Requires an active session (the STATE sentinel) and resolves which build the
 * spike belongs to before dispatching.
 */
export function spike(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' }))
    return 1
  }
  const { build: buildSlug, rest } = resolveBuild(root, args)
  const positionals = rest.filter((a) => !a.startsWith('--'))
  if (positionals[0] === 'done') {
    return spikeDone(root, buildSlug)
  }
  if (positionals[0] === 'report') {
    return spikeReport(root, buildSlug, positionals.slice(1))
  }
  return spikeStart(root, buildSlug, positionals)
}

/**
 * `spike report "<slug>"`: scaffold a spike report WITHOUT worktrees.
 *
 * Serves the spike-as-step case: a planned step titled `spike: …`, where the
 * increment itself is the experiment. No boundary requirement and no SPIKE
 * marker: a step in flight is exactly when this runs. Provenance is stamped
 * `step <n>` when a step is in flight, else `/plumbbob:spike`.
 */
function spikeReport(root: string, buildSlug: string | null, positionals: ReadonlyArray<string>): number {
  const slug = sanitize(positionals[0] ?? '')
  if (slug.length === 0) {
    process.stderr.write(
      notice({ fact: 'spike report needs a slug', remedy: 'plumbbob spike report "auth-store"' }),
    )
    return 1
  }
  const inFlight = readInFlightStep(root, buildSlug)
  const via = inFlight !== null ? `step ${inFlight}` : '/plumbbob:spike'
  const path = scaffoldSpikeReport(root, buildSlug, slug, via)
  process.stdout.write(
    notice({
      fact: 'spike report scaffolded',
      detail: [relative(root, path)],
      remedy: 'record Findings and the Verdict there, which is what closes a spike step',
    }),
  )
  return 0
}

/**
 * Write a fresh spike report from the template at the next free
 * `spike-NN-<slug>.md` in the build folder, and return its path.
 *
 * Shared by the worktree-opening spike and the spike-as-step `spike report`:
 * one artifact, two entry points. The CLI owns the numbering; the human never
 * creates or numbers a report.
 */
function scaffoldSpikeReport(root: string, buildSlug: string | null, spikeSlug: string, via: string): string {
  const path = nextSpikeReportPath(root, buildSlug, spikeSlug)
  const date = new Date().toISOString().slice(0, 10)
  writeFileSync(path, stampTemplate(readTemplate('spike-report.md'), { TITLE: spikeSlug, VIA: via, DATE: date }))
  return path
}

/**
 * The build's in-flight step number, or null: reads the STEP marker `build`
 * writes.
 *
 * Used to stamp a spike-as-step report's provenance as `step <n>`.
 */
function readInFlightStep(root: string, buildSlug: string | null): number | null {
  try {
    const raw = readFileSync(stepPath(root, buildSlug), 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}

/**
 * Open a spike: one throwaway worktree + `spike/<slug>-<opt>` branch per option.
 *
 * Refuses when a spike is already open or a step is in flight: a spike is a
 * deliberate fork from a settled boundary, so the current step must exit first
 * (checkpoint, abandon, or revert). Marks the SPIKE control file and scaffolds
 * the report before returning.
 */
function spikeStart(root: string, buildSlug: string | null, positionals: ReadonlyArray<string>): number {
  if (inSpike(root, buildSlug)) {
    process.stderr.write(notice({ fact: 'already in a spike', remedy: 'plumbbob spike done to close it first' }))
    return 1
  }
  if (existsSync(stepPath(root, buildSlug))) {
    process.stderr.write(
      notice({
        fact: 'a step is in flight',
        detail: ['a spike is a deliberate fork from a settled boundary'],
        remedy: 'checkpoint, abandon, or revert the current step first',
      }),
    )
    return 1
  }
  const slug = sanitize(positionals[0] ?? '')
  if (slug.length === 0) {
    process.stderr.write(notice({ fact: 'spike needs a slug', remedy: 'plumbbob spike "auth-store" a b' }))
    return 1
  }
  const explicit = positionals.slice(1).map(sanitize).filter((o) => o.length > 0)
  const options = explicit.length > 0 ? explicit : DEFAULT_OPTIONS

  const created: string[] = []
  for (const opt of options) {
    const path = join(dirname(root), `${basename(root)}-spike-${slug}-${opt}`)
    if (existsSync(path)) {
      process.stderr.write(
        notice({
          fact: 'the spike worktree path already exists',
          detail: [path],
          remedy: 'remove it, or run plumbbob spike done first',
        }),
      )
      return 1
    }
    git(root, ['worktree', 'add', '-b', `spike/${slug}-${opt}`, path, 'HEAD'])
    created.push(path)
  }

  markSpike(root, buildSlug)
  // Scaffold the report NOW, while the worktrees live: findings accrue during the
  // experiment, not from memory after the teardown. Provenance names the worktrees.
  const report = scaffoldSpikeReport(root, buildSlug, slug, `/plumbbob:spike — worktrees (${options.join(', ')})`)
  // The notice states the fact; the throwaway worktrees are a list, so they ride
  // as a readout beneath it rather than crowding the line.
  process.stdout.write(
    notice({
      fact: 'spiking',
      detail: ['the main tree stays put', `${created.length} throwaway worktree${created.length === 1 ? '' : 's'}`],
    }) +
      `${created.map((path) => `  ${path}`).join('\n')}\n` +
      notice({
        fact: 'spike report scaffolded',
        detail: [relative(root, report)],
        remedy: 'record findings and the Verdict there, then run plumbbob spike done',
      }),
  )
  return 0
}

/**
 * Close the spike: remove every spike worktree and branch, clear the marker.
 *
 * Nudges (but never refuses) when a report's Verdict is still the template
 * placeholder: guidance, not a gate.
 */
function spikeDone(root: string, buildSlug: string | null): number {
  if (!inSpike(root, buildSlug)) {
    process.stderr.write(notice({ fact: 'no active spike to close' }))
    return 1
  }
  // Check for an unrecorded verdict BEFORE teardown. The reports live in the
  // build folder, not the spike worktrees, so they survive the removal, but the
  // learning that fills them does not, so this is the moment to nudge.
  const unfilled = spikeReportsMissingVerdict(root, buildSlug)

  for (const path of spikeWorktrees(root)) {
    git(root, ['worktree', 'remove', '--force', path])
  }
  git(root, ['worktree', 'prune'])
  for (const branch of spikeBranches(root)) {
    git(root, ['branch', '-D', branch])
  }
  clearSpike(root, buildSlug)

  process.stdout.write(notice({ fact: 'spike closed', detail: ['worktrees and branches removed'] }))
  // Guidance, not a gate: a missing verdict is a nudge, and the spike still
  // closes. It follows the line it qualifies, and names the reports so the
  // human knows where to write the call.
  if (unfilled.length > 0) {
    process.stderr.write(
      notice({
        fact: 'no verdict recorded',
        advisory: true,
        detail: unfilled,
        remedy: 'record which option won, and why, now the worktrees are gone',
      }),
    )
  }
  return 0
}

/**
 * The spike-report filenames in the build folder whose Verdict is still the
 * template placeholder: the ones `spike done` nudges on.
 *
 * Best-effort per file: an unreadable report is skipped rather than blocking
 * the close.
 */
function spikeReportsMissingVerdict(root: string, buildSlug: string | null): ReadonlyArray<string> {
  const dir = buildFolder(root, buildSlug)
  return listSpikeReports(root, buildSlug).filter((name) => {
    try {
      return readFileSync(join(dir, name), 'utf8').includes(VERDICT_PLACEHOLDER)
    } catch {
      return false
    }
  })
}

/**
 * Worktree paths whose checked-out branch is under spike/: parsed from the
 * porcelain output (blank-line-separated `worktree <path>` / `branch <ref>`
 * blocks).
 *
 * Exported for `recover`, which reports the ones this verb can no longer reach
 * (a spike interrupted before `spike done` strands them). Sharing the reader
 * keeps one definition of what counts as a spike worktree.
 */
export function spikeWorktrees(root: string): ReadonlyArray<string> {
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

/**
 * List the local `spike/<slug>` branch names.
 *
 * Exported alongside spikeWorktrees, for the same reason.
 */
export function spikeBranches(root: string): ReadonlyArray<string> {
  const out = git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/spike/'])
  return out.length === 0 ? [] : out.split('\n').filter((b) => b.length > 0)
}

/**
 * Slugify a raw spike name: lowercase, non-alphanumerics collapsed to dashes.
 */
function sanitize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Run a git command at `root` and return its trimmed stdout.
 *
 * Stderr passes through to the terminal; a non-zero exit throws.
 */
function git(root: string, args: ReadonlyArray<string>): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
}
