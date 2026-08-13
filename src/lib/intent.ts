// The intent.md parser. intent.md is a build's plan document — title, the
// numbered increments under `## Steps`, decisions, constraints, open questions.
// This module reads it in two registers. The seam parse is strict by design: a
// seam is a step's edit grant — the backtick-wrapped, repo-relative paths on
// its single `seam:` sub-line — and it gates git behavior, so the parse refuses
// precisely on globs, absolute paths, a missing step, a missing seam, or more
// than one seam line, rather than guessing. The best-effort scrapers below
// (title, done-when, decisions, constraints) feed an agent's context, not a
// gate, so they never refuse — they return what they can and report the lines
// they skipped.

const GLOB_CHARS = /[*?[\]{}]/

/** A parsed seam, or the refusal message saying exactly why it didn't parse. */
export type SeamParse =
  | { readonly ok: true; readonly seam: ReadonlyArray<string> }
  | { readonly ok: false; readonly error: string }

/** A step's lines, or one of two distinct error strings ("no Steps section" vs "no such step"). */
type StepSlice =
  | { readonly ok: true; readonly itemLines: ReadonlyArray<string> }
  | { readonly ok: false; readonly error: string }

/**
 * The lines belonging to step `n` under `## Steps` — from its `N. ` opener to
 * the next opener or the section end.
 *
 * Shared by the strict seam parse and the best-effort meta scrape; it keeps the
 * "no Steps section" and "no such step" error strings distinct so both callers
 * can tell them apart.
 */
function sliceStep(content: string, step: number): StepSlice {
  const lines = content.split('\n')

  const stepsIdx = lines.findIndex((l) => l.trim() === '## Steps')
  if (stepsIdx === -1) {
    return { ok: false, error: 'intent.md has no "## Steps" section.' }
  }
  let sectionEnd = lines.findIndex((l, i) => i > stepsIdx && l.startsWith('## '))
  if (sectionEnd === -1) {
    sectionEnd = lines.length
  }

  const itemStarts: Array<{ readonly n: number; readonly idx: number }> = []
  for (let i = stepsIdx + 1; i < sectionEnd; i++) {
    const m = /^(\d+)\.\s/.exec(lines[i] ?? '')
    if (m) {
      itemStarts.push({ n: Number(m[1]), idx: i })
    }
  }

  const pos = itemStarts.findIndex((s) => s.n === step)
  if (pos === -1) {
    return { ok: false, error: `intent.md has no step ${step} under "## Steps".` }
  }
  const itemStart = itemStarts[pos]?.idx ?? stepsIdx
  const nextStart = itemStarts[pos + 1]?.idx
  const itemEnd = nextStart === undefined ? sectionEnd : nextStart
  return { ok: true, itemLines: lines.slice(itemStart, itemEnd) }
}

/**
 * Parse step `n`'s seam — the backtick-wrapped paths on its single `seam:` sub-line.
 *
 * Strict: the seam is the step's edit grant and gates git behavior, so this
 * refuses on a missing step, a missing or duplicated seam line, an empty token,
 * a glob, or an absolute path rather than guessing. Tokens are exact
 * repo-relative paths or `dir/` prefix grants — never globs.
 */
export function parseStepSeam(content: string, step: number): SeamParse {
  const slice = sliceStep(content, step)
  if (!slice.ok) {
    return fail(slice.error)
  }
  const itemLines = slice.itemLines

  const seamLines = itemLines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /^\s*-\s*seam:/.test(l))
    .map(({ i }) => i)
  if (seamLines.length === 0) {
    return fail(`step ${step} has no \`seam:\` line.`)
  }
  if (seamLines.length > 1) {
    return fail(`step ${step} has more than one \`seam:\` line.`)
  }

  // The seam declaration is the seam line plus any wrapped continuation lines.
  // Truncate each at an HTML-comment opener so a trailing `<!-- ... -->` note
  // (which may carry its own backticks) is never read as a seam token; a
  // continuation ends at the first line whose pre-comment text has no backtick
  // or that opens a new sub-bullet (a `- model:` note may carry backticks too).
  const seamStart = seamLines[0] ?? 0
  const decl: string[] = []
  for (let i = seamStart; i < itemLines.length; i++) {
    const beforeComment = (itemLines[i] ?? '').split('<!--')[0] ?? ''
    if (i > seamStart && (!beforeComment.includes('`') || /^\s*-\s/.test(beforeComment))) {
      break
    }
    decl.push(beforeComment)
  }

  const tokens: string[] = []
  const re = /`([^`]+)`/g
  for (const line of decl) {
    for (let m = re.exec(line); m !== null; m = re.exec(line)) {
      tokens.push(m[1] ?? '')
    }
  }
  if (tokens.length === 0) {
    return fail(`step ${step}'s seam lists no files.`)
  }

  const seam: string[] = []
  for (const raw of tokens) {
    const token = raw.trim().replace(/^\.\//, '')
    if (token === '') {
      return fail(`step ${step}'s seam has an empty token.`)
    }
    if (GLOB_CHARS.test(token)) {
      return fail(`step ${step}'s seam token \`${raw}\` is a glob; seams are exact paths or \`dir/\` grants — D23 (no-glob-seams).`)
    }
    if (token.startsWith('/')) {
      return fail(`step ${step}'s seam token \`${raw}\` is absolute; seams are repo-relative.`)
    }
    seam.push(token)
  }
  return { ok: true, seam }
}

/**
 * Seam membership: a repo-relative path is in-seam if it equals an exact token,
 * or is prefixed by a `dir/` grant.
 *
 * Shared by `checkpoint` (the scope-drift warning) and `revert` (untracked
 * cleanup).
 */
export function matchesSeam(relPath: string, tokens: ReadonlyArray<string>): boolean {
  return tokens.some((token) => (token.endsWith('/') ? relPath.startsWith(token) : relPath === token))
}

/**
 * Whether a repo-relative path is plumbbob's own bookkeeping under `.plumbbob/`.
 *
 * That plane holds the tracked intent/build-log/checkpoints that ride the
 * branch, plus the git-excluded control markers. It is never the user's code,
 * so it never counts as scope drift, and `revert`'s untracked cleanup must
 * never delete it. `checkpoint` stages this plane itself on every tick (the
 * `[x]` flip, the build-log line), so without this whitelist every checkpoint
 * would cry wolf about its own writes.
 */
export function isArtifactPath(relPath: string): boolean {
  return relPath === '.plumbbob' || relPath.startsWith('.plumbbob/')
}

/**
 * The staged paths that fall outside the step's seam AND outside the artifact
 * plane — the scope-drift set `checkpoint` warns about.
 *
 * Guidance, not a gate: the checkpoint still commits them. An empty seam yields
 * no drift, so callers that cannot resolve a seam simply skip the warning
 * rather than flagging everything.
 */
export function scopeDrift(paths: ReadonlyArray<string>, seam: ReadonlyArray<string>): ReadonlyArray<string> {
  if (seam.length === 0) {
    return []
  }
  return paths.filter((p) => !matchesSeam(p, seam) && !isArtifactPath(p))
}

// --- best-effort scrapes ---
//
// These feed an agent's StepContext, not a gate, so they never refuse: a
// formatting quirk in a hand-edited intent must not wedge the loop. They return
// what they can parse and, for the bullet scrape, the lines they had to skip so
// the caller can warn on stderr.

/** A step's title and done-when criterion; absent pieces come back as empty strings. */
export type StepMeta = { readonly title: string; readonly doneWhen: string }

const DONE_WHEN = /\*\*done when:\*\*/i

/**
 * Scrape step `n`'s title and done-when, best-effort.
 *
 * `title` is the text between the `N. [ ]` opener and the `**done when:**`
 * marker; `doneWhen` is everything after it, with wrapped continuation lines
 * joined until the first sub-bullet (the seam line). A missing section or step
 * yields empty strings, never a refusal.
 */
export function parseStepMeta(content: string, step: number): StepMeta {
  const slice = sliceStep(content, step)
  if (!slice.ok) {
    return { title: '', doneWhen: '' }
  }
  // Gather the opener and its wrapped continuation lines, stopping at the first
  // sub-bullet (`- seam:` and friends), then flatten to one line.
  const collected: string[] = []
  for (let i = 0; i < slice.itemLines.length; i++) {
    const line = slice.itemLines[i] ?? ''
    if (i > 0 && /^\s*-\s/.test(line)) {
      break
    }
    collected.push(line.trim())
  }
  const body = collected.join(' ').replace(/^\d+\.\s*(?:\[[ xX]\]\s*)?/, '').trim()

  const m = DONE_WHEN.exec(body)
  if (m === null) {
    return { title: stripTrailingSeparator(body), doneWhen: '' }
  }
  return {
    title: stripTrailingSeparator(body.slice(0, m.index)),
    doneWhen: body.slice(m.index + m[0].length).trim(),
  }
}

/**
 * The build title — the first `# ` heading. '' when absent.
 */
export function parseBuildTitle(content: string): string {
  for (const line of content.split('\n')) {
    const m = /^#\s+(.+)$/.exec(line)
    if (m) {
      return (m[1] ?? '').trim()
    }
  }
  return ''
}

const SCOPE_HEADER = /^\*\*Scope:\*\*\s*(.*)$/
const SCOPE_PLACEHOLDER = /^<.*>$/

/**
 * The build's default Conventional-Commit scope — the `**Scope:**` header field
 * authored once in intent.md at plan time.
 *
 * The value is read verbatim off the line, with any trailing `<!-- ... -->`
 * guidance note stripped. An unfilled placeholder — an empty value or an
 * angle-bracket placeholder like `<feature>` — parses as absent, so a freshly
 * scaffolded, not-yet-edited build falls through to the next rung of the scope
 * fallback chain (the build slug) rather than landing commits scoped
 * `(<feature>)`. null when the header is missing entirely, so an intent.md
 * without one behaves the same way.
 */
export function parseBuildScope(content: string): string | null {
  for (const line of content.split('\n')) {
    const m = SCOPE_HEADER.exec(line.trim())
    if (m === null) {
      continue
    }
    const value = (m[1] ?? '').split('<!--')[0]?.trim() ?? ''
    return value === '' || SCOPE_PLACEHOLDER.test(value) ? null : value
  }
  return null
}

/** The scraped bullet strings, plus the malformed lines the caller should warn about. */
export type ScrapedBullets = { readonly items: ReadonlyArray<string>; readonly skipped: ReadonlyArray<string> }

/**
 * Scrape the top-level `- ` bullets under a `## Heading`, each verbatim with
 * its wrapped continuation lines joined into one string.
 *
 * Verbatim keeps a bullet's `*because*` rationale intact for the agent that
 * reads it. `skipped` holds any line under the heading that was neither a
 * bullet, a continuation, nor blank — a malformed bullet the caller warns
 * about rather than dropping silently.
 */
export function scrapeBullets(content: string, heading: string): ScrapedBullets {
  const lines = content.split('\n')
  const start = lines.findIndex((l) => l.trim() === heading)
  if (start === -1) {
    return { items: [], skipped: [] }
  }
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  if (end === -1) {
    end = lines.length
  }

  const items: string[] = []
  const skipped: string[] = []
  let current: string[] | null = null
  const flush = (): void => {
    if (current !== null) {
      items.push(current.join(' '))
      current = null
    }
  }
  for (let i = start + 1; i < end; i++) {
    const line = lines[i] ?? ''
    const bullet = /^-\s+(.*)$/.exec(line)
    if (bullet !== null) {
      flush()
      current = [(bullet[1] ?? '').trim()]
    } else if (line.trim() === '') {
      flush()
    } else if (current !== null && /^\s+\S/.test(line)) {
      current.push(line.trim())
    } else {
      skipped.push(line)
    }
  }
  flush()
  return { items, skipped }
}

/**
 * Trim a trailing separator (a comma, or the legacy em dash or hyphen) plus
 * surrounding space, so a title never carries the marker that introduced its
 * done-when.
 */
function stripTrailingSeparator(text: string): string {
  return text.replace(/\s*[—,-]+\s*$/, '').trim()
}

/**
 * Shorthand for a failed SeamParse.
 */
function fail(error: string): SeamParse {
  return { ok: false, error }
}
