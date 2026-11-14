// A build's research stamp, the pure half: the first line of `research.md`,
// which says when the research was done and what the dependencies looked like
// that day, and the comparison that says what has moved since.
//
//   Researched 2026-11-11 · pnpm-lock.yaml 3f9a1c2 · fascicle 0.18.0, checkride 0.20.0
//
// The date, then each lockfile at the repo root with its git blob hash, then
// each dependency the plan leans on with the version installed. A segment with
// nothing in it is left out. Research is a claim about the world on a date, so
// the stamp is what lets the CLI notice the claim going out of date: a stamped
// lockfile whose hash has moved earns one row on the plan card and the
// dashboard. No fs and no git here; src/lib/researchfile.ts reads the tree.

/** The lockfiles a stamp records, when present at the repo root, in the order it lists them. */
export const LOCKFILES: ReadonlyArray<string> = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'go.sum', 'Cargo.lock', 'uv.lock']

/** How many characters of a blob hash the stamp keeps. */
const SHORT_HASH = 7

/** The word a stamp line opens on. */
const STAMP_WORD = 'Researched'

/** What sits between a stamp's segments. */
const SEGMENT = ' · '

/** One stamped lockfile: its name at the repo root, and its blob hash, shortened. */
export type StampLock = { readonly name: string; readonly hash: string }

/** One stamped dependency: its name, and the version installed, or null where none could be read. */
export type StampDep = { readonly name: string; readonly version: string | null }

/** A research stamp: the day, the lockfiles, and the dependencies the plan leans on. */
export type Stamp = {
  readonly date: string
  readonly locks: ReadonlyArray<StampLock>
  readonly deps: ReadonlyArray<StampDep>
}

/** The tree as it stands now: each lockfile's full blob hash and each dependency's installed version, null where absent. */
export type Current = {
  readonly locks: Readonly<Record<string, string | null>>
  readonly versions: Readonly<Record<string, string | null>>
}

/** One dependency whose installed version is no longer the stamped one. */
export type MovedDep = { readonly name: string; readonly from: string; readonly to: string }

/** What has moved since the stamp: the lockfiles whose hash changed or that are gone, and the dependencies whose version changed. */
export type Moved = { readonly locks: ReadonlyArray<string>; readonly deps: ReadonlyArray<MovedDep> }

/** A stale stamp in words: the clause that says what kind of change, and the items that moved. */
export type Staleness = { readonly fact: string; readonly items: ReadonlyArray<string> }

/**
 * Whether a dependency name can sit in a stamp: no whitespace, no comma, and
 * no segment mark, since those are the stamp's own punctuation.
 */
export function fitsStamp(name: string): boolean {
  return name.length > 0 && !/[\s,·]/.test(name)
}

/**
 * Whether a name is shaped like an npm package (`fascicle`, `@scope/name`), so
 * its installed version can be read from `node_modules` without the name
 * walking out of that folder.
 */
export function npmName(name: string): boolean {
  return /^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/i.test(name)
}

/** A blob hash as the stamp keeps it. */
export function shortHash(hash: string): string {
  return hash.slice(0, SHORT_HASH)
}

/**
 * A stamp as its one line, no newline: the date, the lockfiles, the
 * dependencies, each segment present only when it holds something.
 */
export function formatStamp(stamp: Stamp): string {
  const locks = stamp.locks.map((l) => `${l.name} ${shortHash(l.hash)}`).join(', ')
  const deps = stamp.deps.map((d) => (d.version === null ? d.name : `${d.name} ${d.version}`)).join(', ')
  return [`${STAMP_WORD} ${stamp.date}`, locks, deps].filter((part) => part.length > 0).join(SEGMENT)
}

/**
 * Read one line as a stamp, or null when it is not one.
 *
 * After the date every entry is told apart by its name: a known lockfile
 * followed by a hash is a lockfile, anything else is a dependency with or
 * without a version. So a stamp with no lockfile, or with no dependency, reads
 * back as it was written.
 */
export function parseStamp(line: string): Stamp | null {
  const [head, ...segments] = line.trim().split(SEGMENT)
  const date = /^Researched (\d{4}-\d{2}-\d{2})$/.exec(head ?? '')?.[1]
  if (date === undefined) {
    return null
  }
  const locks: StampLock[] = []
  const deps: StampDep[] = []
  for (const entry of segments.flatMap((s) => s.split(',')).map((e) => e.trim())) {
    const [name, value, ...extra] = entry.split(/\s+/)
    if (name === undefined || name.length === 0 || extra.length > 0) {
      return null
    }
    if (LOCKFILES.includes(name) && value !== undefined && /^[0-9a-f]{4,64}$/.test(value)) {
      locks.push({ name, hash: value })
    } else {
      deps.push({ name, version: value ?? null })
    }
  }
  return { date, locks, deps }
}

/** The stamp on a research file's first line, or null when the file opens on anything else. */
export function readStamp(text: string): Stamp | null {
  return parseStamp(text.split('\n', 1)[0] ?? '')
}

/**
 * A research file's text with `stamp` as its first line, and everything else
 * as it was.
 *
 * With no file the result is the stamp alone. A first line that reads as a
 * stamp is the CLI's, and is replaced. Any other first line is the person's,
 * a finding that happens to open on the stamp's word and a stamp edited past
 * reading included, so the stamp goes above it with a blank line between, and
 * nothing beneath is touched.
 */
export function withStamp(text: string | null, stamp: Stamp): string {
  const line = formatStamp(stamp)
  if (text === null || text.trim().length === 0) {
    return `${line}\n`
  }
  const end = text.indexOf('\n')
  const first = end === -1 ? text : text.slice(0, end)
  if (parseStamp(first) !== null) {
    return end === -1 ? `${line}\n` : `${line}${text.slice(end)}`
  }
  return `${line}\n\n${text}`
}

/**
 * What has moved since the stamp was written.
 *
 * A stamped lockfile has moved when its hash now differs or the file is gone.
 * A lockfile that appeared since is not the stamp's to judge. A dependency has
 * moved when a version was stamped, one can be read now, and the two differ;
 * one that can no longer be read (a clone with nothing installed) says nothing.
 */
export function movedSince(stamp: Stamp, current: Current): Moved {
  const locks = stamp.locks
    .filter((l) => {
      const now = current.locks[l.name] ?? null
      return now === null || !now.startsWith(l.hash)
    })
    .map((l) => l.name)
  const deps = stamp.deps.flatMap((d) => {
    const now = current.versions[d.name] ?? null
    return d.version !== null && now !== null && now !== d.version ? [{ name: d.name, from: d.version, to: now }] : []
  })
  return { locks, deps }
}

/**
 * A move in words, or null when nothing moved.
 *
 * A moved lockfile is the trigger, and the row names the dependencies whose
 * version changed with it; with none of those named or changed it names the
 * lockfile. A dependency that changed under a stamp holding no moved lockfile
 * (a repo with no lockfile at all) is said as a dependency change.
 */
export function staleness(moved: Moved): Staleness | null {
  const deps = moved.deps.map((d) => `${d.name} ${d.from} → ${d.to}`)
  if (moved.locks.length > 0) {
    return { fact: 'predates a lockfile change', items: deps.length > 0 ? deps : moved.locks }
  }
  return deps.length > 0 ? { fact: 'predates a dependency change', items: deps } : null
}

/** A staleness as the one clause a row carries: `predates a lockfile change: fascicle 0.18.0 → 0.19.2`. */
export function stalenessClause(stale: Staleness): string {
  return `${stale.fact}: ${stale.items.join(', ')}`
}
