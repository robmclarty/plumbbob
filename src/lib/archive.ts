// The finish-phase archive helper (D20: archive is local-only markdown in v1).
// `finish` copies the three active files into .plumbline/archive/<date>-<slug>/
// before clearing the actives — "archive-then-clear, never destroy" (C4).
// Functional/procedural, node builtins only (C1/C2).

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sidecarDir, intentPath, buildLogPath } from './sidecar.ts'

// report.md lives beside intent.md / build-log.md in the sidecar. It is written by
// /plumbline-report and is the gate `finish` refuses without (D19). Derived from
// the exported sidecarDir so this module needs nothing new from sidecar.ts.
export function reportPath(root: string): string {
  return join(sidecarDir(root), 'report.md')
}

function archiveRoot(root: string): string {
  return join(sidecarDir(root), 'archive')
}

// A filesystem-safe slug from arbitrary title text: lowercased, runs of
// non-alphanumerics collapsed to a single hyphen, ends trimmed. Empty → `session`.
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length === 0 ? 'session' : slug
}

// The session title is intent.md's first `# ` heading (start stamps `# <title>`).
function sessionTitle(root: string): string {
  let content = ''
  try {
    content = readFileSync(intentPath(root), 'utf8')
  } catch {
    return 'session'
  }
  for (const line of content.split('\n')) {
    const m = /^#\s+(.+)$/.exec(line)
    if (m) {
      return (m[1] ?? '').trim()
    }
  }
  return 'session'
}

// Today as YYYY-MM-DD (UTC); the archive directory is <date>-<slug>.
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// Choose <date>-<slug>, disambiguating with -2, -3, … if a same-day, same-slug
// session was already archived — so a second session lands ALONGSIDE the first,
// never on top of it.
function uniqueArchiveDir(root: string, base: string): string {
  let candidate = join(archiveRoot(root), base)
  let n = 2
  while (existsSync(candidate)) {
    candidate = join(archiveRoot(root), `${base}-${n}`)
    n += 1
  }
  return candidate
}

// Copy intent + build-log + report into archive/<date>-<slug>/ and return the
// directory created. The report must already exist (finish guards that); intent
// and build-log always exist in an active session.
export function archiveSession(root: string): string {
  const dir = uniqueArchiveDir(root, `${today()}-${slugify(sessionTitle(root))}`)
  mkdirSync(dir, { recursive: true })
  copyFileSync(intentPath(root), join(dir, 'intent.md'))
  copyFileSync(buildLogPath(root), join(dir, 'build-log.md'))
  copyFileSync(reportPath(root), join(dir, 'report.md'))
  return dir
}
