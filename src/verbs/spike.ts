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

const DEFAULT_OPTIONS: ReadonlyArray<string> = ['a', 'b']

// The verbatim Verdict placeholder from templates/spike-report.md — its presence means
// the spike's call was never recorded, which `spike done` nudges on (D70).
const VERDICT_PLACEHOLDER = '*(viable | not viable | partial'

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
  if (positionals[0] === 'report') {
    return spikeReport(root, buildSlug, positionals.slice(1))
  }
  return spikeStart(root, buildSlug, positionals)
}

// `spike report "<slug>"` (D70) — scaffold a spike report WITHOUT worktrees, for the
// spike-as-step case (a planned step titled `spike: …`, where the increment itself is
// the experiment). No boundary requirement and no SPIKE marker: a step in flight is
// exactly when this runs. Provenance is `step <n>` when a STEP is in flight, else
// `/pb-spike`.
function spikeReport(root: string, buildSlug: string | null, positionals: ReadonlyArray<string>): number {
  const slug = sanitize(positionals[0] ?? '')
  if (slug.length === 0) {
    process.stderr.write('plumbbob: spike report needs a slug. Try: plumbbob spike report "auth-store".\n')
    return 1
  }
  const inFlight = readInFlightStep(root, buildSlug)
  const via = inFlight !== null ? `step ${inFlight}` : '/pb-spike'
  const path = scaffoldSpikeReport(root, buildSlug, slug, via)
  process.stdout.write(
    `plumbbob: spike report scaffolded — ${relative(root, path)}. Fill Findings and the Verdict as you go; ` +
      `a recorded Verdict is what closes a spike step.\n`,
  )
  return 0
}

// Write a fresh spike report from the template at the next free `spike-NN-<slug>.md`
// in the build folder, and return its path. Shared by the explicit `/pb-spike` open
// and the spike-as-step `spike report` — one artifact, two entry points (D70).
function scaffoldSpikeReport(root: string, buildSlug: string | null, spikeSlug: string, via: string): string {
  const path = nextSpikeReportPath(root, buildSlug, spikeSlug)
  const date = new Date().toISOString().slice(0, 10)
  writeFileSync(path, stampTemplate(readTemplate('spike-report.md'), { TITLE: spikeSlug, VIA: via, DATE: date }))
  return path
}

// The in-flight STEP number for the build, or null — reads the STEP marker `build`
// writes. Used to stamp a spike-as-step report's provenance.
function readInFlightStep(root: string, buildSlug: string | null): number | null {
  try {
    const raw = readFileSync(stepPath(root, buildSlug), 'utf8').trim()
    return /^\d+$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
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
  // Scaffold the report NOW, while the worktrees live (D70): findings accrue during the
  // experiment, not from memory after the teardown. Provenance names the worktrees.
  const report = scaffoldSpikeReport(root, buildSlug, slug, `/pb-spike — worktrees (${options.join(', ')})`)
  process.stdout.write(
    `plumbbob: spiking — the main tree stays put. Experiment in the throwaway worktrees:\n${created
      .map((p) => `  ${p}`)
      .join(
        '\n',
      )}\nRecord findings and the Verdict in ${relative(root, report)} as you go, then run \`plumbbob spike done\`.\n`,
  )
  return 0
}

function spikeDone(root: string, buildSlug: string | null): number {
  if (!inSpike(root, buildSlug)) {
    process.stderr.write('plumbbob: no active spike to close.\n')
    return 1
  }
  // Check for an unrecorded verdict BEFORE teardown (D70). The reports live in the
  // build folder, not the spike worktrees, so they survive the removal — but the
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

  // Guidance, not a gate (the enforce→guide pivot): a missing verdict is a nudge, and
  // the spike still closes. Name the reports so the human knows where to write it.
  if (unfilled.length > 0) {
    process.stderr.write(
      `plumbbob: heads-up — no verdict recorded in ${unfilled.join(', ')}. ` +
        `The worktrees are gone; capture the call there before it fades.\n`,
    )
  }
  const reports = listSpikeReports(root, buildSlug)
  const where = reports.length > 0 ? `the spike report${reports.length === 1 ? '' : 's'} (${reports.join(', ')})` : 'intent.md'
  process.stdout.write(
    `plumbbob: spike closed — worktrees and branches removed, back at the boundary. ` +
      `Record the verdict (which option won, and why) in ${where} before you \`build\`.\n`,
  )
  return 0
}

// The spike-report filenames in the build folder whose Verdict is still the template
// placeholder — the ones `spike done` nudges on. Best-effort per file: an unreadable
// report is skipped rather than blocking the close.
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
