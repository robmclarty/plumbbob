// Conventional-Commit subject assembly. Plumbbob's commit subjects read as
// `type(scope): description` — real feat/fix/chore types and a real parenthesised
// scope — so `git log` speaks the same grammar as the rest of the branch. The
// `plumbbob`/`step N` identifiers ride a marker line at the head of the body,
// which `withMarker` prepends — so `git log --grep plumbbob` finds every plumbbob
// commit. Functional and procedural, node builtins only, no gate: these only
// shape a string the CLI is about to commit.

/**
 * The Conventional-Commit type vocabulary plumbbob recognises as a leading
 * prefix on a step title.
 *
 * Anchoring on this closed set keeps a prose title like `Note: rewire the
 * cache` from being misread as a `Note` type — only these words, immediately
 * followed by an optional `(scope)`, an optional `!`, and a colon, count as an
 * author-supplied prefix.
 */
const TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf', 'build', 'ci', 'style', 'revert'] as const

// One anchored pattern for the whole prefix: type, optional (scope), optional
// breaking !, colon, then the description.
const PREFIX = new RegExp(`^(${TYPES.join('|')})(?:\\(([^)]+)\\))?(!)?:\\s+(.+)$`)

/** A step title split into its Conventional parts — null type/scope when the title carried no prefix. */
export type ParsedTitle = {
  readonly type: string | null
  readonly scope: string | null
  readonly breaking: boolean
  readonly description: string
}

/**
 * Split an optional Conventional prefix off a step title.
 *
 * `feat(escape-hatch): add the flag` → { type:'feat', scope:'escape-hatch',
 * breaking:false, description:'add the flag' }. A title with no recognised
 * prefix comes back whole as the description with a null type/scope — the
 * caller then defaults the type and fills the scope from the build.
 */
export function parseConventionalTitle(title: string): ParsedTitle {
  const m = PREFIX.exec(title.trim())
  if (m === null) {
    return { type: null, scope: null, breaking: false, description: title.trim() }
  }
  return { type: m[1] ?? null, scope: m[2] ?? null, breaking: m[3] === '!', description: (m[4] ?? '').trim() }
}

/**
 * Assemble a `type(scope)!: description` subject, omitting the `(scope)`
 * segment when there is no scope (Conventional Commits allow a bare
 * `type: description`) and the `!` when the change is not breaking.
 */
export function conventionalSubject(parts: {
  readonly type: string
  readonly scope: string | null
  readonly breaking?: boolean
  readonly description: string
}): string {
  const scope = parts.scope ? `(${parts.scope})` : ''
  const bang = parts.breaking ? '!' : ''
  return `${parts.type}${scope}${bang}: ${parts.description}`
}

/**
 * A Conventional subject from a step title, filling gaps from the build.
 *
 * An author-written prefix (`fix(parser): …`) is honoured verbatim — its type,
 * scope, breaking marker, and exact wording all win. A bare prose title
 * defaults to `defaultType` and the build `scope`, and gets its sentence-case
 * opener de-capitalised (`Add the flag` → `add the flag`) to match
 * Conventional style — while an all-caps acronym start (`API`, `OAuth`) is
 * left alone.
 */
export function subjectFromTitle(title: string, defaultType: string, scope: string | null): string {
  const parsed = parseConventionalTitle(title)
  if (parsed.type !== null) {
    return conventionalSubject({
      type: parsed.type,
      scope: parsed.scope ?? scope,
      breaking: parsed.breaking,
      description: parsed.description,
    })
  }
  return conventionalSubject({ type: defaultType, scope, description: lowerFirst(parsed.description) })
}

/**
 * Prepend a marker line (`plumbbob step 1`, `plumbbob plan`, `plumbbob
 * finish`) to an optional body, separated by a blank line so git keeps them as
 * distinct paragraphs.
 *
 * Always returns at least the marker, so every plumbbob commit carries the
 * greppable identifier in its body even when the prose is empty.
 */
export function withMarker(marker: string, body?: string): string {
  const rest = body?.trim()
  return rest !== undefined && rest.length > 0 ? `${marker}\n\n${rest}` : marker
}

/**
 * De-capitalise a sentence-case opener but leave an acronym/proper all-caps
 * start (`API`, `OAuth`) intact: lowercase the first character only when it is
 * uppercase and the second character is not (so `Add` → `add`, but `API` stays
 * `API`).
 */
function lowerFirst(text: string): string {
  const a = text[0] ?? ''
  const b = text[1] ?? ''
  if (a >= 'A' && a <= 'Z' && b >= 'A' && b <= 'Z') {
    return text
  }
  return a >= 'A' && a <= 'Z' ? a.toLowerCase() + text.slice(1) : text
}
