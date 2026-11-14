// A build's `research.md`: the reads around the pure half in
// src/lib/research.ts. The file sits beside intent.md and is tracked with it.
// Its first line is the stamp `plumbbob research --stamp` writes; everything
// beneath is the person's and the model's findings, which nothing here edits.
//
// Staleness is advice. A build with no research.md, or one whose first line is
// not a stamp, reads exactly as it did before this file existed, and nothing
// here refuses anything.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { blobHash } from './git.ts'
import { LOCKFILES, movedSince, npmName, readStamp, staleness, stalenessClause, type Current, type Stamp, type Staleness } from './research.ts'
import { buildFolder } from './sidecar.ts'

/** Where a build's `research.md` lives: in its artifact folder, beside intent.md. */
export function researchPath(root: string, slug?: string | null): string {
  return join(buildFolder(root, slug), 'research.md')
}

/** The build's research file as text, or null when there is none. */
export function readResearch(root: string, slug?: string | null): string | null {
  try {
    return readFileSync(researchPath(root, slug), 'utf8')
  } catch {
    return null
  }
}

/**
 * The version of a dependency installed under the repo's `node_modules`, or
 * null when it cannot be read: a name that is no npm package's, a package not
 * installed, or a manifest with no version.
 */
function installedVersion(root: string, name: string): string | null {
  if (!npmName(name)) {
    return null
  }
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')) as { version?: unknown }
    return typeof manifest.version === 'string' && /^\S+$/.test(manifest.version) ? manifest.version : null
  } catch {
    return null
  }
}

/**
 * The tree as it stands: the blob hash of each named lockfile present at the
 * repo root, and the installed version of each named dependency, null for
 * whatever is absent or unreadable.
 */
function currentFor(root: string, locks: ReadonlyArray<string>, deps: ReadonlyArray<string>): Current {
  return {
    locks: Object.fromEntries(locks.map((name) => [name, existsSync(join(root, name)) ? blobHash(root, name) : null])),
    versions: Object.fromEntries(deps.map((name) => [name, installedVersion(root, name)])),
  }
}

/**
 * A fresh stamp for today: every lockfile at the repo root with its hash, and
 * each named dependency with the version installed, or with none where it
 * cannot be read.
 */
export function freshStamp(root: string, date: string, deps: ReadonlyArray<string>): Stamp {
  const current = currentFor(root, LOCKFILES, deps)
  return {
    date,
    locks: LOCKFILES.flatMap((name) => {
      const hash = current.locks[name] ?? null
      return hash === null ? [] : [{ name, hash }]
    }),
    deps: deps.map((name) => ({ name, version: current.versions[name] ?? null })),
  }
}

/** What has moved since a stamp was written, in words, or null when nothing has. */
export function staleSince(root: string, stamp: Stamp): Staleness | null {
  const current = currentFor(
    root,
    stamp.locks.map((l) => l.name),
    stamp.deps.map((d) => d.name),
  )
  return staleness(movedSince(stamp, current))
}

/**
 * The clause the plan card and the dashboard carry when the build's research
 * has gone out of date (`predates a lockfile change: fascicle 0.18.0 →
 * 0.19.2`), or null when there is nothing to say: no research.md, no stamp on
 * its first line, or nothing moved since.
 *
 * Information, never a gate: best-effort and never throws.
 */
export function researchStale(root: string, slug?: string | null): string | null {
  try {
    const text = readResearch(root, slug)
    const stamp = text === null ? null : readStamp(text)
    if (stamp === null) {
      return null
    }
    const stale = staleSince(root, stamp)
    return stale === null ? null : stalenessClause(stale)
  } catch {
    return null
  }
}
