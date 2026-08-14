#!/usr/bin/env node
// scripts/check-refs.ts: the citation scanner. Reads docs/decisions.md for the
// canonical D#/C# -> slug map, then scans every markdown file and every src/ and
// scripts/ TypeScript file for citations of those tags, flagging one that is bare,
// mislinked, or unglossed. Wired into checkride.config.json as the `refs` slot, so it
// runs in the full gate and in the per-turn profile alike; `node scripts/check-refs.ts`
// still runs it standalone. The rule it enforces is D74 (glossed-citations).

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { collectMaskSpans, isWithin } from './prose-mask.ts'

export type Surface = 'markdown' | 'src'

export type ViolationKind = 'unlinked' | 'bad-anchor' | 'missing-slug' | 'wrong-slug' | 'link-forbidden'

export type Violation = {
  readonly file: string
  readonly line: number
  readonly tag: string
  readonly kind: ViolationKind
  readonly message: string
}

export type RawCitation = {
  readonly tag: string
  readonly index: number
  readonly linked: boolean
  readonly slug: string | null
  readonly url: string | null
}

export type ScanResult = {
  readonly violations: ReadonlyArray<Violation>
  readonly filesScanned: number
}

const DEFINITION_RE = /<a id="[dc]\d+"><\/a>\*\*([DC]\d+) \(([a-z0-9-]+)\)/g
const CITATION_LINK_RE = /\[\*{0,2}([DC]\d+)(?:\s*\(([a-z0-9-]*)\))?\*{0,2}\]\(([^)]*)\)/g
const TAG_RE = /\b([DC]\d+)\b/g

// Anything not in the surface globs (every *.md, every src/**/*.ts) never reaches the
// walker at all; these are the exceptions carved out of those two globs, and they are
// the carve-outs D74 (glossed-citations) names: a finished build folder is the record
// of what shipped, and a tag in a test title is a grep anchor read in failure output,
// not prose browsed cold. `examples/` carries its own self-contained demo
// intent.md/spec.md content with fictional, build-local D#/C# numbering (the same
// category `.plumbbob/builds/*/` is exempt for), and not one of the surfaces the rule
// covers.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'research', 'test', '__tests__', 'examples'])

/**
 * The repo's canonical D#/C# -> slug map, parsed from docs/decisions.md's
 * `<a id="dN"></a>**DN (slug)**` definition lines.
 */
export function parseDefinitions(decisionsText: string): Map<string, string> {
  const definitions = new Map<string, string>()
  for (const match of decisionsText.matchAll(DEFINITION_RE)) {
    const tag = match[1] ?? ''
    const slug = match[2] ?? ''
    if (tag.length > 0 && slug.length > 0) {
      definitions.set(tag, slug)
    }
  }
  return definitions
}

/**
 * The shared fenced/inline/indented mask, plus a definition-line exclusion this
 * scanner alone needs: a `decisions.md` `<a id="dN"></a>**DN (slug)**`
 * header cites its own tag without citing itself.
 */
function collectExclusionSpans(text: string): ReadonlyArray<readonly [number, number]> {
  const spans = collectMaskSpans(text) as Array<readonly [number, number]>
  for (const match of text.matchAll(DEFINITION_RE)) {
    const start = match.index ?? 0
    spans.push([start, start + match[0].length])
  }
  return spans
}

/**
 * Every D#/C# citation in a chunk of text, outside a code span/fence and outside a
 * decisions.md definition line: a tag inside a code span is a mention, never a
 * citation, which is D74 (glossed-citations)'s own escape hatch. `surface: 'markdown'`
 * applies the code-span/definition exclusions; `surface: 'src'` scans raw, since a
 * TypeScript template-literal backtick is not a markdown code span.
 */
export function findCitations(text: string, surface: Surface): ReadonlyArray<RawCitation> {
  const exclusions = surface === 'markdown' ? collectExclusionSpans(text) : []
  const linkSpans = [...text.matchAll(CITATION_LINK_RE)].map((match) => {
    const start = match.index ?? 0
    return {
      start,
      end: start + match[0].length,
      slug: match[2] ?? null,
      url: match[3] ?? '',
    }
  })
  const citations: RawCitation[] = []
  for (const match of text.matchAll(TAG_RE)) {
    const index = match.index ?? 0
    if (isWithin(index, exclusions)) continue
    const tag = match[1] ?? ''
    const link = linkSpans.find((span) => index >= span.start && index < span.end)
    if (link !== undefined) {
      citations.push({ tag, index, linked: true, slug: link.slug, url: link.url })
      continue
    }
    const bareSlug = /^\s*\(([a-z0-9-]+)\)/.exec(text.slice(index + tag.length))
    citations.push({ tag, index, linked: false, slug: bareSlug?.[1] ?? null, url: null })
  }
  return citations
}

function anchorFragment(url: string): string {
  const at = url.lastIndexOf('#')
  return at === -1 ? '' : url.slice(at + 1)
}

function wrongSlugMessage(citation: RawCitation, canonicalSlug: string | null): string {
  return canonicalSlug === null
    ? `${citation.tag} has no matching entry in docs/decisions.md`
    : `${citation.tag} is glossed "${citation.slug ?? ''}", not the canonical "${canonicalSlug}"`
}

/**
 * The four markdown rules (linked, anchor matches the cited number, slug present,
 * slug matches the definition verbatim) or the src variant, where a slug is required
 * and a link is forbidden because markdown in a terminal is noise
 * (D74 (glossed-citations)), whichever the citation's surface is. Returns the first
 * rule that fails, or null for a clean citation.
 */
export function checkCitation(
  citation: RawCitation,
  definitions: ReadonlyMap<string, string>,
  surface: Surface,
): Omit<Violation, 'file' | 'line'> | null {
  const canonicalSlug = definitions.get(citation.tag) ?? null

  if (surface === 'src') {
    if (citation.linked) {
      return {
        tag: citation.tag,
        kind: 'link-forbidden',
        message: `${citation.tag} is wrapped in a markdown link; printed strings carry a gloss only (D74 (glossed-citations))`,
      }
    }
    if (citation.slug === null) {
      return { tag: citation.tag, kind: 'missing-slug', message: `${citation.tag} is printed without its gloss` }
    }
    if (canonicalSlug === null || citation.slug !== canonicalSlug) {
      return { tag: citation.tag, kind: 'wrong-slug', message: wrongSlugMessage(citation, canonicalSlug) }
    }
    return null
  }

  if (!citation.linked) {
    return { tag: citation.tag, kind: 'unlinked', message: `${citation.tag} is cited without a link` }
  }
  const fragment = anchorFragment(citation.url ?? '')
  if (fragment.toLowerCase() !== citation.tag.toLowerCase()) {
    const shown = fragment.length > 0 ? `#${fragment}` : '(no anchor)'
    return { tag: citation.tag, kind: 'bad-anchor', message: `${citation.tag} links to ${shown}, not #${citation.tag.toLowerCase()}` }
  }
  if (citation.slug === null) {
    return { tag: citation.tag, kind: 'missing-slug', message: `${citation.tag} is linked but carries no slug` }
  }
  if (canonicalSlug === null || citation.slug !== canonicalSlug) {
    return { tag: citation.tag, kind: 'wrong-slug', message: wrongSlugMessage(citation, canonicalSlug) }
  }
  return null
}

function lineOf(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

function isSkippedDir(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name)
}

function* walkFiles(root: string, dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (isSkippedDir(entry.name)) continue
      yield* walkFiles(root, full)
      continue
    }
    if (!entry.isFile()) continue
    if (entry.name === 'CHANGELOG.md') continue
    if (entry.name.endsWith('.test.ts')) continue
    const rel = relative(root, full)
    if (rel.endsWith('.md')) {
      yield full
    } else if (rel.endsWith('.ts') && (rel.startsWith(`src${sep}`) || rel.startsWith(`scripts${sep}`))) {
      yield full
    }
  }
}

/**
 * Walks `root` for every markdown file and every src/ and scripts/ TypeScript file,
 * checking each D#/C# citation against docs/decisions.md's canonical map. `.plumbbob/`,
 * `research/`, `CHANGELOG.md`, and every test file are out of scope: the carve-outs
 * D74 (glossed-citations) names.
 */
export function scanRepo(root: string): ScanResult {
  const decisionsPath = join(root, 'docs', 'decisions.md')
  const definitions = existsSync(decisionsPath)
    ? parseDefinitions(readFileSync(decisionsPath, 'utf8'))
    : new Map<string, string>()
  const violations: Violation[] = []
  let filesScanned = 0
  for (const file of walkFiles(root, root)) {
    filesScanned++
    const text = readFileSync(file, 'utf8')
    const surface: Surface = file.endsWith('.md') ? 'markdown' : 'src'
    for (const citation of findCitations(text, surface)) {
      const violation = checkCitation(citation, definitions, surface)
      if (violation !== null) {
        violations.push({ ...violation, file: relative(root, file), line: lineOf(text, citation.index) })
      }
    }
  }
  return { violations, filesScanned }
}

function formatViolation(violation: Violation): string {
  return `${violation.file}:${violation.line}  ${violation.tag}  ${violation.message}`
}

function main(): void {
  const { violations, filesScanned } = scanRepo(process.cwd())
  for (const violation of violations) {
    process.stdout.write(`${formatViolation(violation)}\n`)
  }
  const count = violations.length
  process.stdout.write(`\n${count} violation${count === 1 ? '' : 's'} across ${filesScanned} file${filesScanned === 1 ? '' : 's'} scanned.\n`)
  process.exitCode = count > 0 ? 1 : 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
