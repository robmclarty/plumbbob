// The one renderer for every line plumbbob says out loud and a skill relays,
// and the assembly that stacks those lines into an ending. It has three heads,
// and the ending picks which: a transition's lead line goes to stdout wearing a
// bold label, like every other part of the ending
// (`**Checkpoint**: Step 15 complete (2d917cde7)`); an advisory riding that
// ending goes to stdout too, as a bare sentence, since a block with one speaker
// needs no one named; and a refusal goes to stderr keeping the `plumbbob:`
// prefix, which earns its colon where checkride's output and git's share one
// result. Under every head the shape is the same: the fact as one clause, the
// detail a trailing parenthetical that degrades by count instead of running off
// the edge, and an optional indented arrow line carrying what to do next. One
// shape, so moving it is one edit rather than a sweep. The pointer at the next
// step is not a line's job: `handoff` renders one, and the verb prints it as
// the ending's last part. Pure string assembly, no fs, no gate.

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
  // Renders the `⚠` glyph after the fact, for a warning that joins no ending
  // and so keeps the prefix; an advisory inside one uses `advisory()`.
  readonly advisory?: boolean
  // What to do next, on its own indented `→` line beneath.
  readonly remedy?: string
  // The speaker, for a prefixed line. `plumbbob` for everything except a
  // capture an agent reports, which spends its one colon on `parked`.
  readonly prefix?: string
}

/** One transition: the label naming it, the fact it states, and the detail qualifying it. */
export type Transition = {
  // The transition's name, rendered bold before the colon: the artifact that
  // landed (`Checkpoint`, `Plan`, `Spike report`) or the subject that moved
  // (`Parked`, `Reverted`, `Session`). Written as it prints, capitalized.
  readonly label: string
  // What the transition did, as one clause and no terminal period. It reads on
  // from the label rather than repeating it.
  readonly fact: string
  // The trailing parenthetical's items, in the order they matter: a long list
  // degrades from the tail, so put what must survive first.
  readonly detail?: ReadonlyArray<string>
  // What to do next, on its own indented `→` line beneath.
  readonly remedy?: string
}

/** One advisory riding an ending: the fact it qualifies, the detail behind it, and what to do about it. */
export type Advisory = {
  // What the ending is being warned about, as one clause and no terminal
  // period. It renders capitalized: an advisory is a sentence, not a label.
  readonly fact: string
  // The trailing parenthetical's items, in the order they matter: a long list
  // degrades from the tail, so put what must survive first.
  readonly detail?: ReadonlyArray<string>
  // What to do next, on its own indented `→` line beneath.
  readonly remedy?: string
}

/** The parts of an ending, in the fixed order a transition prints them. */
export type Ending = {
  // The labeled lead line: the transition that just happened. Several, where a
  // verb lands two artifacts at once.
  readonly lead: string
  // The Verdict, where one is measured. Only the checkpoint boundary measures
  // anything; every other transition leaves it out.
  readonly verdict?: string | null
  // The advisories qualifying the lead, one rendered entry each, in the order
  // they were found.
  readonly advisories?: ReadonlyArray<string>
  // The Next Up pointer `handoff` rendered. Absent only where no step is left
  // to point at.
  readonly pointer?: string | null
}

/**
 * Render one prefixed notice, newline included.
 *
 * The refusal head, and the head for a warning that joins no ending (an
 * ambient agent that could not resolve, say):
 *
 * ```text
 * plumbbob: no build named "auth" in .plumbbob/builds/ (rate-limit, logging)
 *   → plumbbob use <slug>
 * ```
 */
export function notice(n: Notice): string {
  return line(`${n.prefix ?? 'plumbbob'}: ${trimFact(n.fact)}${n.advisory === true ? ' ⚠' : ''}`, n)
}

/**
 * Render one transition, newline included.
 *
 * The lead line of an ending, wearing a bold label so it reads as a part of the
 * ending rather than as a second grammar beside it:
 *
 * ```text
 * **Checkpoint**: Step 15 complete (2d917cde7)
 * **Parked**: should /password-reset get the same throttle? (tangent)
 * ```
 *
 * A transition never warns: an advisory qualifies the line and prints beneath
 * it, on the same stream, as its own part of the ending.
 */
export function transition(t: Transition): string {
  return line(`**${t.label}**: ${trimFact(t.fact)}`, t)
}

/**
 * Render one advisory of an ending, newline included.
 *
 * No prefix and no label: it rides stdout inside a block that has one speaker
 * already, so it reads as the sentence it is, the warning glyph trailing the
 * fact and the remedy on the line beneath.
 *
 * ```text
 * Staged paths reach outside Step 16's seam ⚠ (test/integration/spike.test.ts)
 *   → the checkpoint captures them, so revise the plan with /plumbbob:step
 * ```
 */
export function advisory(a: Advisory): string {
  return line(`${capitalize(trimFact(a.fact))} ⚠`, a)
}

/**
 * Assemble a transition's whole ending: the labeled lead line, the Verdict
 * where one was measured, the advisories, and the pointer.
 *
 * The order is the type's field order, so a verb composes parts and never a
 * sequence. A part with nothing in it vanishes rather than leaving a gap.
 */
export function ending(e: Ending): string {
  return blocks([e.lead, e.verdict ?? null, ...(e.advisories ?? []), e.pointer ?? null])
}

/**
 * Stack a turn's parts: one blank line between each, one beneath the last.
 *
 * The trailing blank is the ending's own: the block is the turn's last text,
 * and one flush against what follows cannot read as an ending. Empty parts drop
 * out, so a caller can pass a part it may not have.
 */
export function blocks(parts: ReadonlyArray<string | null>): string {
  const kept = parts.filter((p): p is string => p !== null && p.trim().length > 0)
  return `${kept.map((p) => p.replace(/\n+$/, '')).join('\n\n')}\n\n`
}

/**
 * The head, its trailing parenthetical, and the remedy line beneath, assembled.
 *
 * The one place the parts meet, so a prefixed line and a labeled one can never
 * drift in anything but their heads.
 */
function line(head: string, n: Notice | Transition | Advisory): string {
  const detail = fit(head, (n.detail ?? []).map((d) => d.trim()).filter((d) => d.length > 0))
  const text = detail.length === 0 ? head : `${head} (${detail.join(', ')})`
  return n.remedy === undefined ? `${text}\n` : `${text}\n  → ${n.remedy}\n`
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

/** A fact's first letter raised, so an unprefixed advisory opens as a sentence. */
function capitalize(fact: string): string {
  return fact.length === 0 ? fact : `${fact[0]?.toUpperCase()}${fact.slice(1)}`
}

/** The collapsed tail naming how many items the line left out. */
function others(count: number): string {
  return `and ${count} other${count === 1 ? '' : 's'}`
}

/** A string's printed width, counted in code points so the glyphs measure as one column each. */
function columns(text: string): number {
  return [...text].length
}
