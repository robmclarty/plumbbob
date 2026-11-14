// `plumbbob research [--stamp [<dep>...]]`: the stamp on a build's research.md.
// Research is a claim about the world on a date, so its first line says the
// date, the git blob hash of each lockfile at the repo root, and the installed
// version of each dependency the plan leans on. `--stamp` writes or refreshes
// that one line and leaves every finding beneath it alone. Without it the verb
// reports the stamp and what has moved since. The stamp is how the plan card
// and the dashboard notice research going out of date; it never gates.

import { existsSync, writeFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { findRepoRoot } from '../lib/git.ts'
import { notice, transition } from '../lib/notice.ts'
import { formatStamp, readStamp, shortHash, fitsStamp, withStamp, type Staleness } from '../lib/research.ts'
import { freshStamp, readResearch, researchPath, staleSince } from '../lib/researchfile.ts'
import { buildFolder, hasSession, listBuilds, resolveBuild } from '../lib/sidecar.ts'

/**
 * Stamp the resolved build's research.md, or report its stamp.
 *
 * With `--stamp` it writes the first line: today's date, each lockfile present
 * at the repo root with its short blob hash, and each named dependency with
 * the version installed (a dependency it cannot read is listed without one).
 * With no dependency named it keeps the names the stamp already holds. An
 * absent file is created holding the stamp alone; an existing one has its
 * stamp line replaced, or the stamp put above a first line that is not one.
 *
 * Without `--stamp` it prints the stamp and what has moved since, and exits
 * 0 whatever it finds: a report, never a gate. Refuses (exit 1) outside a
 * repo, with no session, with a build that has no folder under
 * `.plumbbob/builds/`, or with a dependency name the stamp's punctuation
 * cannot hold.
 */
export function research(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write(notice({ fact: 'not inside a git repository', remedy: 'run plumbbob from inside the repo' }))
    return 1
  }
  if (!hasSession(root)) {
    process.stderr.write(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' }))
    return 1
  }
  const { build: slug, rest } = resolveBuild(root, args)
  // A slug is one folder name under builds/. A typed one that is anything else
  // (a separator, a `..`), or that names no folder there, would have the stamp
  // written wherever it points, so it is refused before anything is read.
  if (slug !== null && (!/^[^/\\]+$/.test(slug) || slug === '.' || slug === '..' || !existsSync(buildFolder(root, slug)))) {
    process.stderr.write(
      notice({ fact: `no build named ${JSON.stringify(slug)} in .plumbbob/builds/`, detail: listBuilds(root) }),
    )
    return 1
  }
  const path = researchPath(root, slug)
  const where = relative(root, path).split(sep).join('/')
  const text = readResearch(root, slug)
  const stored = text === null ? null : readStamp(text)

  if (!rest.includes('--stamp')) {
    return report(where, text, stored === null ? null : { line: formatStamp(stored), stale: staleSince(root, stored) })
  }

  const named = rest.filter((a) => !a.startsWith('--'))
  const bad = named.filter((name) => !fitsStamp(name))
  if (bad.length > 0) {
    process.stderr.write(
      notice({
        fact: 'a dependency name cannot hold a space, a comma, or a middle dot',
        detail: bad.map((name) => `"${name}"`),
        remedy: 'plumbbob research --stamp <dep>...',
      }),
    )
    return 1
  }
  const deps = named.length > 0 ? [...new Set(named)] : (stored?.deps.map((d) => d.name) ?? [])
  const stamp = freshStamp(root, today(), deps)
  writeFileSync(path, withStamp(text, stamp))
  const said = [...stamp.locks.map((l) => `${l.name} ${shortHash(l.hash)}`), ...stamp.deps.map((d) => (d.version === null ? d.name : `${d.name} ${d.version}`))]
  process.stdout.write(
    transition({
      label: 'Researched',
      fact: where,
      detail: said.length > 0 ? said : ['no lockfile at the repo root'],
    }),
  )
  return 0
}

/**
 * Today as `YYYY-MM-DD` on the local calendar, the day the person doing the
 * research would call it, and the one a build folder's dated slug carries.
 */
function today(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Print the state of the stamp: that there is no research.md, that it has no
 * stamp, that the stamp is current, or what has moved since it was written.
 */
function report(where: string, text: string | null, stamp: { readonly line: string; readonly stale: Staleness | null } | null): number {
  if (text === null) {
    process.stdout.write(notice({ fact: 'no research.md in this build', remedy: 'plumbbob research --stamp <dep>...' }))
    return 0
  }
  if (stamp === null) {
    process.stdout.write(notice({ fact: `${where} has no stamp on its first line`, remedy: 'plumbbob research --stamp <dep>...' }))
    return 0
  }
  process.stdout.write(`${stamp.line}\n`)
  if (stamp.stale === null) {
    process.stdout.write(notice({ fact: 'research is current, nothing stamped has moved' }))
    return 0
  }
  process.stdout.write(
    notice({ fact: `research ${stamp.stale.fact}`, detail: stamp.stale.items, remedy: 'run the ecosystem lens again, then plumbbob research --stamp' }),
  )
  return 0
}
