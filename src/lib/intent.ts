// The intent.md parser. intent.md is a build's plan document: title, the
// numbered increments under `## Steps`, decisions, constraints, open questions.
// This module reads it in two registers. The seam parse is strict by design: a
// seam is a step's edit grant (the backtick-wrapped, repo-relative paths on
// its single `seam:` sub-line) and it gates git behavior, so the parse refuses
// precisely on globs, backslashes, empty or dot segments, absolute paths, a
// missing step, a missing seam, or more than one seam line, rather than
// guessing. The best-effort scrapers below
// (title, decisions, constraints) feed an agent's context, not a
// gate, so they never refuse; they return what they can and report the lines
// they skipped. The step-field parse (a step's after, stop, effort and note
// lines) is strict too, since those lines steer a scheduler. A step's proof
// (its `proof:` sub-line, or the older `**done when:**` clause on its opener)
// reads both ways: strictly for the checkpoint that runs its command, loosely
// for the dashboard and the agent's context. A step's like (the exemplar paths
// on its `like:` sub-line) is read loosely only: it is advice, so nothing
// about it is ever a finding.

import { parseStepList, type StepList } from './steplist.ts'

const GLOB_CHARS = /[*?[\]{}!]/

/** A parsed seam, or the refusal message saying exactly why it didn't parse. */
export type SeamParse =
  | { readonly ok: true; readonly seam: ReadonlyArray<string> }
  | { readonly ok: false; readonly error: string }

/** A step's lines, or one of two distinct error strings ("no Steps section" vs "no such step"). */
type StepSlice =
  | { readonly ok: true; readonly itemLines: ReadonlyArray<string> }
  | { readonly ok: false; readonly error: string }

/**
 * The lines belonging to step `n` under `## Steps`: from its `N. ` opener to
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
 * Parse step `n`'s seam: the backtick-wrapped paths on its single `seam:` sub-line.
 *
 * Strict: the seam is the step's edit grant and gates git behavior, so this
 * refuses on a missing step, a missing or duplicated seam line, an empty token,
 * a glob, a backslash, an empty, `.` or `..` segment, or an absolute path
 * rather than guessing: the tokens runciter's plan contract refuses, so one
 * grammar holds in both repos. Tokens are exact repo-relative paths or `dir/`
 * prefix grants: never globs.
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
      return fail(`step ${step}'s seam token \`${raw}\` is a glob; seams are exact paths or \`dir/\` grants, per D23 (no-glob-seams).`)
    }
    if (token.includes('\\')) {
      return fail(`step ${step}'s seam token \`${raw}\` holds a backslash; seams are POSIX paths, per D23 (no-glob-seams).`)
    }
    if (token.startsWith('/')) {
      return fail(`step ${step}'s seam token \`${raw}\` is absolute; seams are repo-relative.`)
    }
    if (hasBadSegment(token)) {
      return fail(
        `step ${step}'s seam token \`${raw}\` has an empty, \`.\` or \`..\` segment; seams are plain repo-relative paths, per D23 (no-glob-seams).`,
      )
    }
    seam.push(token)
  }
  return { ok: true, seam }
}

/**
 * Whether a seam token has an empty, `.` or `..` segment, once a `dir/` grant's
 * trailing slash is set aside: runciter's `seam_entry_issue` reads it the same way.
 */
function hasBadSegment(token: string): boolean {
  const body = token.endsWith('/') ? token.slice(0, -1) : token
  return body.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
}

/** Where a step stops for a person, as its `- stop:` line names it. */
export type StepStop = 'planned' | 'structural'

/** The rung a step's builder starts on, as its `- effort:` line names it. */
export type StepEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * A step's scheduling lines: `after` is the list its `- after:` line names,
 * `'none'` for a step that waits on nothing, or null when the line is absent;
 * `stop` and `effort` are null when absent; `notes` are its `- note:` lines in order.
 */
export type StepFields = {
  readonly after: StepList | 'none' | null
  readonly stop: StepStop | null
  readonly effort: StepEffort | null
  readonly notes: ReadonlyArray<string>
}

/** A step's fields, or every finding that kept them from reading, each naming the step. */
export type StepFieldsParse =
  | { readonly ok: true; readonly fields: StepFields }
  | { readonly ok: false; readonly findings: ReadonlyArray<string> }

const STOPS: ReadonlyArray<StepStop> = ['planned', 'structural']
const EFFORTS: ReadonlyArray<StepEffort> = ['low', 'medium', 'high', 'xhigh', 'max']

const AFTER_TAKES = 'it takes step numbers and spans, such as `2, 4-5`, or `none`.'
const STOP_TAKES = 'it takes `planned` or `structural`.'
const EFFORT_TAKES = 'it takes `low`, `medium`, `high`, `xhigh` or `max`.'

/**
 * Parse step `n`'s `- after:`, `- stop:`, `- effort:` and `- note:` lines.
 *
 * Strict, as the seam parse is: each of the first three may appear once, and a
 * value outside its grammar, an empty one, or a second line of a kind is a
 * finding that names the step, never a guess. `after` reads through the same
 * grammar a typed range does, with spaces after the commas allowed, and `none`
 * stands alone. A note keeps its text verbatim, wrapped continuation lines
 * joined with one space; a trailing HTML comment is no part of any value.
 */
export function parseStepFields(content: string, step: number): StepFieldsParse {
  const slice = sliceStep(content, step)
  if (!slice.ok) {
    return { ok: false, findings: [slice.error] }
  }
  const lines = slice.itemLines.slice(1)
  const values = { after: [] as string[], stop: [] as string[], effort: [] as string[] }
  const notes: string[] = []
  let inNote = false
  for (const raw of lines) {
    const line = (raw.split('<!--')[0] ?? '').trimEnd()
    const sub = /^\s*-\s+([a-z-]+):(.*)$/.exec(line)
    if (sub !== null) {
      const key = sub[1] ?? ''
      const value = (sub[2] ?? '').trim()
      inNote = key === 'note'
      if (inNote) {
        notes.push(value)
      } else if (key === 'after' || key === 'stop' || key === 'effort') {
        values[key].push(value)
      }
      continue
    }
    if (/^\s*-\s/.test(line) || line.trim() === '') {
      inNote = false
      continue
    }
    if (inNote && notes.length > 0) {
      notes[notes.length - 1] = `${notes.at(-1) ?? ''} ${line.trim()}`.trim()
    }
  }

  const findings: string[] = []
  const one = (key: 'after' | 'stop' | 'effort', takes: string): string | null => {
    const found = values[key]
    if (found.length > 1) {
      findings.push(`step ${step} has more than one \`${key}:\` line.`)
      return null
    }
    const value = found[0]
    if (value === undefined) return null
    if (value === '') {
      findings.push(`step ${step}'s \`${key}:\` line is empty; ${takes}`)
      return null
    }
    return value
  }
  const malformed = (key: string, value: string, takes: string): void => {
    findings.push(`step ${step}'s \`${key}:\` line reads \`${value}\`; ${takes}`)
  }

  const afterText = one('after', AFTER_TAKES)
  let after: StepList | 'none' | null = null
  if (afterText === 'none') {
    after = 'none'
  } else if (afterText !== null) {
    after = parseStepList(afterText.split(',').map((item) => item.trim()).join(','))
    if (after === null) malformed('after', afterText, AFTER_TAKES)
  }

  const stopText = one('stop', STOP_TAKES)
  const stop = STOPS.find((s) => s === stopText) ?? null
  if (stopText !== null && stop === null) malformed('stop', stopText, STOP_TAKES)

  const effortText = one('effort', EFFORT_TAKES)
  const effort = EFFORTS.find((e) => e === effortText) ?? null
  if (effortText !== null && effort === null) malformed('effort', effortText, EFFORT_TAKES)

  if (findings.length > 0) {
    return { ok: false, findings }
  }
  return { ok: true, fields: { after, stop, effort, notes } }
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
 * plane: the scope-drift set `checkpoint` warns about.
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

/**
 * A step's proof: what shows the step is done. `text` is the whole line as
 * written, backticks kept; `command` is the contents of the code span that
 * opens the line, or null for a proof that opens on words (a manual proof).
 */
export type StepProof = { readonly command: string | null; readonly text: string }

/** A step's title and its proof; absent pieces come back as empty strings. `doneWhen` is the proof's text, under its older name. */
export type StepMeta = { readonly title: string; readonly doneWhen: string; readonly proof: StepProof }

/** What one step's lines say about its proof: the proof read, how many `proof:` lines there were, and whether the one read was empty. */
export type ProofRead = { readonly proof: StepProof | null; readonly lines: number; readonly empty: boolean }

// The older clause, in every spelling the dashboard once read as planned:
// `**done when:**`, `**done when**:`, or the bare words.
const DONE_WHEN = /\*{0,2}done when(?::\*{0,2}|\*{0,2}:)/i
const PROOF_LINE = /^\s*-\s*proof:(.*)$/
const LEGACY_LINE = /^\s*-\s*\*{0,2}done when(?::\*{0,2}|\*{0,2}:)(.*)$/i
const NO_PROOF: StepProof = { command: null, text: '' }

/**
 * Read a step's proof from its lines, opener first.
 *
 * The `- proof:` sub-line wins: its text is kept verbatim, wrapped
 * continuation lines joined with one space up to the next sub-bullet or blank
 * line, a trailing HTML comment left out. The command is the code span that
 * opens that text, and only that one; a span further along is prose. Only the
 * step's own sub-bullets count: a bullet nested under another, a line inside a
 * fenced block, and anything past the blank line that ends the item are prose,
 * so an example never runs. With no `proof:` line, or an empty one, the older
 * `**done when:**` clause, on the opener or on a sub-bullet of its own, reads as
 * a proof with no command, so every recorded plan still reads. On a doubled
 * line the first is read and `lines` says how many there were.
 */
export function readProof(itemLines: ReadonlyArray<string>): ProofRead {
  const item = ownLines(itemLines)
  const subs = ownSubBullets(item)
  const starts = subs.filter((i) => PROOF_LINE.test(uncommented(item[i] ?? '')))
  const first = starts[0]
  if (first !== undefined) {
    const text = bulletText(item, first, PROOF_LINE)
    if (text !== '') {
      return { proof: { command: /^`([^`]+)`/.exec(text)?.[1] ?? null, text }, lines: starts.length, empty: false }
    }
  }
  const legacy = splitOpener(item).doneWhen ?? legacySubLine(item, subs)
  return { proof: legacy === null ? null : { command: null, text: legacy }, lines: starts.length, empty: first !== undefined }
}

/**
 * A step's lines cut down to the item itself: it ends at the first blank line
 * that an unindented line follows (or nothing does), since indented text after
 * a blank line still belongs to the item and unindented text does not. Lines
 * inside a fenced block are blanked in place, so an example in a fence is
 * never read as one of the step's lines. So are the lines of an HTML comment
 * that runs past the line it opens on, up to and including the one holding
 * its `-->`, so a sub-line commented out is not read as live.
 */
function ownLines(itemLines: ReadonlyArray<string>): ReadonlyArray<string> {
  const own: string[] = []
  let fence: string | null = null
  let comment = false
  for (let i = 0; i < itemLines.length; i++) {
    const line = itemLines[i] ?? ''
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] ?? null
    if (fence !== null) {
      if (mark !== null && mark.startsWith(fence)) fence = null
      own.push('')
      continue
    }
    if (mark !== null) {
      fence = mark
      own.push('')
      continue
    }
    if (i > 0 && line.trim() === '') {
      const next = itemLines.slice(i + 1).find((l) => l.trim() !== '')
      if (next === undefined || /^\S/.test(next)) break
    }
    if (comment) {
      if (line.includes('-->')) comment = false
      own.push('')
      continue
    }
    const open = commentStart(line)
    comment = open !== -1 && !line.includes('-->', open + 4)
    own.push(line)
  }
  return own
}

/**
 * The indexes of the step's own sub-bullets: the bullets at the depth of its
 * `- seam:` line, or of its first bullet where it has no seam. A bullet
 * indented far enough to sit inside another's text is nested, and one back at
 * the margin under indented siblings starts a list of its own; neither counts.
 */
function ownSubBullets(item: ReadonlyArray<string>): ReadonlyArray<number> {
  const bullets = item.flatMap((l, i) => (i > 0 && /^\s*-\s/.test(l) ? [i] : []))
  const anchor = bullets.find((i) => /^\s*-\s*seam:/.test(item[i] ?? '')) ?? bullets[0]
  if (anchor === undefined) return []
  const depth = indentOf(item[anchor] ?? '')
  return bullets.filter((i) => {
    const indent = indentOf(item[i] ?? '')
    return indent < depth + 2 && (depth === 0 || indent > 0)
  })
}

/** How many columns of white space open a line. */
function indentOf(line: string): number {
  return /^\s*/.exec(line)?.[0].length ?? 0
}

/** The text of the bullet at `start` after its `label`: wrapped continuation lines joined with one space, up to the next bullet or blank line. */
function bulletText(item: ReadonlyArray<string>, start: number, label: RegExp): string {
  const parts = [(label.exec(uncommented(item[start] ?? ''))?.[1] ?? '').trim()]
  for (let i = start + 1; i < item.length; i++) {
    const line = uncommented(item[i] ?? '')
    if (line.trim() === '' || /^\s*-\s/.test(line) || /^\d+\.\s/.test(line)) {
      break
    }
    parts.push(line.trim())
  }
  return parts.join(' ').trim()
}

/** The older clause written as a sub-bullet of the step (`- **done when:** ...`): its text, or null where no sub-bullet carries one. */
function legacySubLine(item: ReadonlyArray<string>, subs: ReadonlyArray<number>): string | null {
  const at = subs.find((i) => LEGACY_LINE.test(uncommented(item[i] ?? '')))
  return at === undefined ? null : bulletText(item, at, LEGACY_LINE)
}

/**
 * A line with its trailing `<!-- ... -->` note cut away. A `<!--` inside a code
 * span is part of the span, a command's own text, and stays.
 */
function uncommented(line: string): string {
  const open = commentStart(line)
  return (open === -1 ? line : line.slice(0, open)).trimEnd()
}

/** Where a line's first `<!--` outside a code span starts, or -1 when it holds none. */
function commentStart(line: string): number {
  let i = 0
  while (i < line.length) {
    if (line.startsWith('<!--', i)) {
      return i
    }
    if (line[i] !== '`') {
      i += 1
      continue
    }
    let run = 1
    while (line[i + run] === '`') run += 1
    const close = closingRun(line, i + run, run)
    i = close === -1 ? i + run : close + run
  }
  return -1
}

/** Where the backtick run of exactly `length` that closes a code span starts, at or after `from`; -1 when the span never closes. */
function closingRun(line: string, from: number, length: number): number {
  let i = from
  while (i < line.length) {
    if (line[i] !== '`') {
      i += 1
      continue
    }
    let run = 1
    while (line[i + run] === '`') run += 1
    if (run === length) return i
    i += run
  }
  return -1
}

/**
 * Split a step's opener, with its wrapped continuation lines up to the first
 * sub-bullet, at the older `**done when:**` marker: the title before it, the
 * clause after it, or null where the opener carries no marker.
 */
function splitOpener(itemLines: ReadonlyArray<string>): { readonly title: string; readonly doneWhen: string | null } {
  const collected: string[] = []
  for (let i = 0; i < itemLines.length; i++) {
    const line = itemLines[i] ?? ''
    if (i > 0 && (/^\s*-\s/.test(line) || line.trim() === '')) {
      break
    }
    collected.push(line.trim())
  }
  const body = collected.join(' ').replace(/^\d+\.\s*(?:\[[ xX]\]\s*)?/, '').trim()
  const m = DONE_WHEN.exec(body)
  if (m === null) {
    return { title: stripTrailingSeparator(body), doneWhen: null }
  }
  return { title: stripTrailingSeparator(body.slice(0, m.index)), doneWhen: body.slice(m.index + m[0].length).trim() }
}

/** A step's proof (null when it has none), or every finding that kept it from reading, each naming the step. */
export type StepProofParse =
  | { readonly ok: true; readonly proof: StepProof | null }
  | { readonly ok: false; readonly findings: ReadonlyArray<string> }

/**
 * Parse step `n`'s proof, strictly: a second `proof:` line or an empty one is
 * a finding that names the step, never a guess, since the checkpoint runs the
 * command this returns. A step with neither a `proof:` line nor the older
 * clause reads as null, which is no finding here.
 */
export function parseStepProof(content: string, step: number): StepProofParse {
  const slice = sliceStep(content, step)
  if (!slice.ok) {
    return { ok: false, findings: [slice.error] }
  }
  const read = readProof(slice.itemLines)
  if (read.lines > 1) {
    return { ok: false, findings: [`step ${step} has more than one \`proof:\` line.`] }
  }
  if (read.empty) {
    return {
      ok: false,
      findings: [`step ${step}'s \`proof:\` line is empty; it takes what shows the step is done, opening on the command in backticks when there is one.`],
    }
  }
  return { ok: true, proof: read.proof !== null && read.proof.text === '' ? null : read.proof }
}

const LIKE_LINE = /^\s*-\s*like:(.*)$/

/**
 * Read a step's like from its lines: the files it names to copy the pattern
 * from, in the order written.
 *
 * Each backticked token on a `- like:` sub-line is one path, a wrapped
 * continuation line included and a trailing HTML comment left out. The line
 * is advice and never a gate, so nothing here is a finding: a token that is
 * not a plain repo-relative path (a glob, a backslash, an absolute path, a
 * home-relative `~` path, a drive letter, an empty, `.` or `..` segment) is
 * dropped, a second `like:` line adds its
 * paths after the first, and a path named twice is kept once. Only the
 * step's own sub-bullets count, on the proof reader's terms: a nested bullet,
 * a line inside a fenced block, and anything past the blank line that ends
 * the item are prose. Whether a path exists is not asked here.
 */
function readLike(itemLines: ReadonlyArray<string>): ReadonlyArray<string> {
  const item = ownLines(itemLines)
  const paths = ownSubBullets(item)
    .filter((i) => LIKE_LINE.test(uncommented(item[i] ?? '')))
    .flatMap((i) => [...bulletText(item, i, LIKE_LINE).matchAll(/`([^`]+)`/g)])
    .map((m) => (m[1] ?? '').trim().replace(/^\.\//, ''))
    .filter((token) => token !== '' && !GLOB_CHARS.test(token) && !token.includes('\\') && !leavesRepo(token) && !hasBadSegment(token))
  return [...new Set(paths)]
}

/**
 * Whether a like token starts somewhere other than the repo root: an absolute
 * path, a home-relative one a shell would expand (`~/x`, `~user/x`), or a
 * Windows drive letter (`C:/x`).
 */
function leavesRepo(token: string): boolean {
  return token.startsWith('/') || token.startsWith('~') || /^[a-z]:/i.test(token)
}

/**
 * Step `n`'s like paths, best-effort: an empty list for a step with no
 * `like:` line, and for a missing section or step, never a refusal.
 */
export function parseStepLike(content: string, step: number): ReadonlyArray<string> {
  const slice = sliceStep(content, step)
  return slice.ok ? readLike(slice.itemLines) : []
}

/**
 * Scrape step `n`'s title and proof, best-effort.
 *
 * `title` is the opener's text, cut at the older `**done when:**` marker where
 * the opener still carries one; the proof is read loosely (the first `proof:`
 * line on a doubled one, the older clause where there is none). A missing
 * section or step yields empty strings, never a refusal.
 */
export function parseStepMeta(content: string, step: number): StepMeta {
  const slice = sliceStep(content, step)
  if (!slice.ok) {
    return { title: '', doneWhen: '', proof: NO_PROOF }
  }
  const proof = readProof(slice.itemLines).proof ?? NO_PROOF
  return { title: splitOpener(slice.itemLines).title, doneWhen: proof.text, proof }
}

/**
 * The build title: the first `# ` heading. '' when absent.
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
 * The build's default Conventional-Commit scope: the `**Scope:**` header field
 * authored once in intent.md at plan time.
 *
 * The value is read verbatim off the line, with any trailing `<!-- ... -->`
 * guidance note stripped. An unfilled placeholder (an empty value or an
 * angle-bracket placeholder like `<feature>`) parses as absent, so a freshly
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
 * bullet, a continuation, nor blank: a malformed bullet the caller warns
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
 * older done-when clause.
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
