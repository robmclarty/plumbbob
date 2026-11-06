// `plumbbob setup`: get a repo ready for its first build by adding only what is
// missing: the `.plumbbob/` sidecar folder, an empty tracked settings.json, and
// the info/exclude lines that keep the per-worktree control files (STATE, TURN,
// PROMPT, RELAY and the rest) out of git. It opens no session and records no
// baseline; that is `start`, which the plan skill runs next. Every write is
// additive: a folder or a settings file already present is left alone, and the
// exclude lines already present are not written twice, so a second run adds
// nothing and says so.

import { existsSync, mkdirSync } from 'node:fs'
import { findRepoRoot, hasCommit } from '../lib/git.ts'
import { advisory, ending, notice, printEnding, transition } from '../lib/notice.ts'
import { scaffoldSettings } from '../lib/settings.ts'
import { buildFolderIgnored, excludeControl, sidecarDir, sidecarExcluded, unignoredControl } from '../lib/sidecar.ts'
import { inspectLegacy } from './doctor.ts'

/**
 * A build slug that names no real build, for probing whether git would ignore
 * a build folder before any build exists.
 */
const PROBE_SLUG = 'example'

/**
 * Add whatever this repo still lacks for a first build, and report what was
 * added.
 *
 * Refuses outside a git repo (the excludes and the baseline both need one) and
 * over a legacy flat sidecar, whose `config` the migration still has to carry
 * into settings.json; a scaffold written first would make the migration skip
 * it. A clone that keeps the whole sidecar untracked (the blanket `.plumbbob/`
 * line a `start --local` writes) keeps it that way: the narrow control lines
 * would add nothing under it. A repo with no commits yet is set up all the
 * same, with an advisory, since `start` needs a baseline commit to record.
 */
export function setup(cwd: string): number {
  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write(
      notice({
        fact: 'not a git repository',
        detail: ['plumbbob keeps its control files out of git through it'],
        remedy: 'git init, then plumbbob setup',
      }),
    )
    return 1
  }
  if (inspectLegacy(root) !== null) {
    process.stderr.write(
      notice({
        fact: 'a legacy flat sidecar is here',
        detail: ['the pre-builds/ layout'],
        remedy: 'plumbbob doctor --migrate moves it into builds/, then plumbbob setup',
      }),
    )
    return 1
  }

  // What this run added, named short so the lead line fits its 80 columns
  // whole; the first item carries the verb for the rest.
  const added: string[] = []
  if (!existsSync(sidecarDir(root))) {
    mkdirSync(sidecarDir(root), { recursive: true })
    added.push('.plumbbob/')
  }
  if (scaffoldSettings(root)) {
    added.push('settings.json')
  }
  const local = sidecarExcluded(root)
  if (!local) {
    const excluded = excludeControl(root).length
    if (excluded > 0) {
      added.push(`${excluded} control exclude${excluded === 1 ? '' : 's'}`)
    }
  }
  const detail = added.map((item, i) => (i === 0 ? `added ${item}` : item))

  printEnding(root, {
    tier: 'driver',
    render: 'setup',
    text: ending({
      lead: transition({
        label: 'Setup',
        fact: added.length === 0 ? 'already in place, nothing added' : 'ready to plan',
        detail: local ? ['.plumbbob/ kept local in this clone', ...detail] : detail,
        remedy: '/plumbbob:plan frames the first build',
      }),
      advisories: setupAdvisories(root, local),
    }),
  })
  return 0
}

/**
 * What still stands between this repo and a first build once setup has added
 * all it can, in the order a person would meet it.
 *
 * A control file git still does not ignore is one the setup could not cover:
 * it is tracked already, or a negated pattern brings it back. A sidecar git
 * ignores whole by the repo's own rules (not this clone's `--local` line) means
 * build folders cannot ride the branch, which `start` warns about too. A repo
 * with no commits has nothing for `start` to record as its baseline.
 */
function setupAdvisories(root: string, local: boolean): ReadonlyArray<string> {
  const advisories: string[] = []
  const unignored = unignoredControl(root)
  if (unignored.length > 0) {
    advisories.push(
      advisory({
        fact: `git still sees ${unignored.length} control file${unignored.length === 1 ? '' : 's'}`,
        detail: unignored,
        remedy: 'untrack each with git rm --cached, or drop the pattern that re-includes it',
      }),
    )
  }
  if (!local && buildFolderIgnored(root, PROBE_SLUG)) {
    advisories.push(
      advisory({
        fact: 'this repo gitignores .plumbbob/',
        detail: ['build folders cannot ride the branch', 'plan and finish commits will be record-only'],
        remedy: 'unignore .plumbbob/builds/ to keep the record in the tree',
      }),
    )
  }
  if (!hasCommit(root)) {
    advisories.push(
      advisory({
        fact: 'this repository has no commits yet',
        remedy: 'make an initial commit, so start can record a baseline',
      }),
    )
  }
  return advisories
}
