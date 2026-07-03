// The strict intent parser. `build <n>` reads the nth step under `## Steps` and
// extracts its seam — the backtick-wrapped paths on the single `seam:` sub-line.
// Strict by design: it refuses precisely on globs, absolute paths, a missing
// step, a missing seam, or more than one seam line, rather than guessing.

const GLOB_CHARS = /[*?[\]{}]/

export type SeamParse =
  | { readonly ok: true; readonly seam: ReadonlyArray<string> }
  | { readonly ok: false; readonly error: string }

export function parseStepSeam(content: string, step: number): SeamParse {
  const lines = content.split('\n')

  const stepsIdx = lines.findIndex((l) => l.trim() === '## Steps')
  if (stepsIdx === -1) {
    return fail('intent.md has no "## Steps" section.')
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
    return fail(`intent.md has no step ${step} under "## Steps".`)
  }
  const itemStart = itemStarts[pos]?.idx ?? stepsIdx
  const nextStart = itemStarts[pos + 1]?.idx
  const itemEnd = nextStart === undefined ? sectionEnd : nextStart
  const itemLines = lines.slice(itemStart, itemEnd)

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
  // continuation ends at the first line whose pre-comment text has no backtick.
  const seamStart = seamLines[0] ?? 0
  const decl: string[] = []
  for (let i = seamStart; i < itemLines.length; i++) {
    const beforeComment = (itemLines[i] ?? '').split('<!--')[0] ?? ''
    if (i > seamStart && !beforeComment.includes('`')) {
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
      return fail(`step ${step}'s seam token \`${raw}\` is a glob; seams are exact paths or \`dir/\` grants (D23).`)
    }
    if (token.startsWith('/')) {
      return fail(`step ${step}'s seam token \`${raw}\` is absolute; seams are repo-relative.`)
    }
    seam.push(token)
  }
  return { ok: true, seam }
}

// Seam membership (D23): a repo-relative path is in-seam if it equals an exact
// token, or is prefixed by a `dir/` grant. Shared by `checkpoint` (scope-drift
// warn) and `revert` (untracked cleanup).
export function matchesSeam(relPath: string, tokens: ReadonlyArray<string>): boolean {
  return tokens.some((token) => (token.endsWith('/') ? relPath.startsWith(token) : relPath === token))
}

// Plumbbob's own artifact plane (D17): everything under `.plumbbob/` is plumbbob's
// bookkeeping — the tracked intent/build-log/checkpoints that ride the branch, and
// the excluded control markers. It is never the user's code, so it never counts as
// scope drift, and `revert`'s untracked cleanup must never delete it. checkpoint
// stages this plane itself on every tick (the `[x]` flip, the build-log line), so
// without this whitelist every checkpoint would cry wolf about its own writes.
export function isArtifactPath(relPath: string): boolean {
  return relPath === '.plumbbob' || relPath.startsWith('.plumbbob/')
}

// The staged paths that fall outside the step's seam AND outside the artifact
// plane — the scope-drift set `checkpoint` warns about (guidance, not a gate: the
// checkpoint still commits them). An empty seam yields no drift, so callers that
// cannot resolve a seam simply skip the warning rather than flagging everything.
export function scopeDrift(paths: ReadonlyArray<string>, seam: ReadonlyArray<string>): ReadonlyArray<string> {
  if (seam.length === 0) {
    return []
  }
  return paths.filter((p) => !matchesSeam(p, seam) && !isArtifactPath(p))
}

function fail(error: string): SeamParse {
  return { ok: false, error }
}
