// The one renderer for every line plumbbob says out loud and a skill relays:
// the transitions, the captures, the advisories, and the refusals. One shape,
// so moving it is one edit rather than a sweep: `plumbbob: <subject> <state>
// (<detail>)`, the single colon spent on the prefix, the detail a trailing
// parenthetical that degrades by count instead of running off the edge, an
// optional warning glyph, and an optional indented arrow line carrying what to
// do next. The pointer at the next step is not a notice's job: `handoff`
// renders one after every ending. Pure string assembly, no fs, no gate.

/** The column budget a notice line aims to fit, matching the readout fence. */
const WIDTH = 80

/** The fewest detail items a degraded parenthetical still names, so the count has a universe to size. */
const FLOOR = 2

/** One relayed line: the fact it states, the detail qualifying it, and whether it warns. */
export type Notice = {
  // The subject and its state, as one clause and no terminal period.
  readonly fact: string
  // The trailing parenthetical's items, in the order they matter: a long list
  // degrades from the tail, so put what must survive first.
  readonly detail?: ReadonlyArray<string>
  // Renders the `⚠` glyph after the fact. An advisory prints after the primary
  // line it qualifies, one per line.
  readonly advisory?: boolean
  // What to do next, on its own indented `→` line beneath.
  readonly remedy?: string
  // The speaker. `plumbbob` for everything except a capture, which spends its
  // one colon on `parked`.
  readonly prefix?: string
}

/**
 * Render one notice, newline included.
 *
 * `plumbbob: no build named "auth" in .plumbbob/builds/ (rate-limit, logging)`,
 * or with a warning and a remedy:
 *
 * ```text
 * plumbbob: this repo gitignores .plumbbob/ ⚠ (plan commits will be record-only)
 *   → unignore .plumbbob/builds/ before the first checkpoint
 * ```
 */
export function notice(n: Notice): string {
  const head = `${n.prefix ?? 'plumbbob'}: ${trimFact(n.fact)}${n.advisory === true ? ' ⚠' : ''}`
  const detail = fit(head, (n.detail ?? []).map((d) => d.trim()).filter((d) => d.length > 0))
  const line = detail.length === 0 ? head : `${head} (${detail.join(', ')})`
  return n.remedy === undefined ? `${line}\n` : `${line}\n  → ${n.remedy}\n`
}

/**
 * The fact as a bare clause: whitespace trimmed and one terminal period
 * dropped.
 *
 * The formatter owns the line's punctuation, so a message composed elsewhere
 * (a parse error, a park line a human wrote) still reads as one clause with a
 * parenthetical after it rather than `… . (detail)`.
 */
function trimFact(fact: string): string {
  const text = fact.trim()
  return text.endsWith('.') && !text.endsWith('..') ? text.slice(0, -1) : text
}

/**
 * The detail items that fit the width budget, with the overrun collapsed to a
 * count.
 *
 * Two items or fewer are the fact's own qualifiers rather than a list, so they
 * always render whole even when the line runs long: a notice wraps where a
 * fence row cannot. A real list drops from the tail until the line fits,
 * naming at least `FLOOR` of them, because a count with nothing beside it
 * sizes a universe the reader cannot see.
 */
function fit(head: string, items: ReadonlyArray<string>): ReadonlyArray<string> {
  if (items.length <= FLOOR) return items
  for (let keep = items.length; keep > FLOOR; keep -= 1) {
    const shown = keep === items.length ? items : [...items.slice(0, keep), others(items.length - keep)]
    if (columns(head) + columns(` (${shown.join(', ')})`) <= WIDTH) return shown
  }
  return [...items.slice(0, FLOOR), others(items.length - FLOOR)]
}

/** The collapsed tail naming how many items the line left out. */
function others(count: number): string {
  return `and ${count} other${count === 1 ? '' : 's'}`
}

/** A string's printed width, counted in code points so the glyphs measure as one column each. */
function columns(text: string): number {
  return [...text].length
}
