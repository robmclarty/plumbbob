// The turn-anatomy reader: a mechanical parse of a turn's assistant text
// against the shapes docs/presentation.md specifies. Nothing here imports src/,
// the same rule assert.ts states and for the same reason — a renderer bug has
// to surface as a failed probe, never hide inside a parser it shares with the
// product.
//
// It matches a SHAPE rather than a string: which labels are present, the order
// they stand in, the rows inside the readout fence, and what sits outside the
// block. The anatomy is expected to move again once it has been lived with, and
// a reader pinned to literals is a sweep every time it does.
//
// What the driver hands it is the whole turn's assistant prose, not the final
// message: fascicle accumulates every text part of every step into one string,
// so a tool-call preamble ("I'll check the state first") arrives glued to
// whatever the model said next. That is a driver fact, not a defect in the
// turn, so the ending is read from the TAIL — the run of labeled parts after
// the last line that belongs to no part. Which is the positional rule stated
// exactly: the model's last authored line, then the relay, then nothing.
//
// Everything here feeds `info` probes — a string probe is reported, never
// gating. What the tier earns from them is a rate: how often the shipped
// anatomy actually lands in a real turn.

import { info, type Check } from './assert.ts'

// A labeled line: one bold token, a colon, then text that wraps. Every part of
// an ending outside the readout fence is one of these.
const LABEL = /^\*\*([^*]+)\*\*:/
// A fence delimiter and its info string (```text, ```diff, or a bare ```).
const FENCE = /^(`{3,})(.*)$/
// A readout row: the name in the label column, two or more spaces, the value.
const ROW = /^([a-z][a-z-]*)\s{2,}(\S.*)$/
// A list item — a Your Call move (`- `) or a numbered highlight (`1. `).
const ITEM = /^(?:-\s|\d+\.\s)/
// The one rule in the anatomy: the plan pause's seam, under the framed plan.
const RULE = /^-{3,}$/
// The advisory glyph. An advisory and its indented remedy line are the two
// lines an ending carries that wear no label of their own.
const WARN = '⚠'

export type Anatomy = {
  readonly labels: ReadonlyArray<string> // every bold label, in order
  readonly trailingLabels: ReadonlyArray<string> // the labels after the last stray: the ending itself
  readonly rows: ReadonlyMap<string, string> // the readout fence's rows
  readonly moves: ReadonlyArray<string> // the Your Call list items
  readonly highlights: ReadonlyArray<string> // the numbered items under the Summary
  readonly advisories: ReadonlyArray<string> // unlabeled `⚠` lines inside the ending
  readonly endsOn: string | null // the label owning the last non-blank line
  readonly nestedFence: boolean // a labeled line found inside a fence
  readonly strays: ReadonlyArray<string> // non-blank lines outside every part
}

// The tiers of docs/presentation.md, as the parts each one renders. The spec
// names three — decision, orientation, driver — and two of them render two
// endings apiece, so each one gets its own name here: `plan` is the decision
// tier's plan pause, which judges a plan rather than a diff, and `boundary` is
// the orientation tier's landed step.
export type Tier = 'decision' | 'plan' | 'boundary' | 'driver'

const TIER_PARTS: Readonly<Record<Tier, ReadonlyArray<string>>> = {
  decision: ['Summary', 'Readout', 'Verdict', 'Next Up', 'Your Call', 'Recommendation'],
  plan: ['Next Up', 'Your Call', 'Recommendation'],
  boundary: ['Verdict', 'Next Up'],
  driver: ['Next Up'],
}

// What each tier must NOT render. The Your Call block belongs only where a
// decision is pending; a Verdict only where something was measured.
const TIER_FORBIDS: Readonly<Record<Tier, ReadonlyArray<string>>> = {
  decision: [],
  plan: ['Summary', 'Readout', 'Verdict'],
  boundary: ['Your Call', 'Readout', 'Recommendation'],
  driver: ['Your Call', 'Verdict', 'Readout', 'Recommendation'],
}

// The row the spec makes load-bearing: the gate verdict's one home, which
// handoff re-emits from its own measurement. Every other row is conditional by
// design and so cannot be probed for — `decisions` and `constraints` render
// from what the plan declared (a fixture plan declares neither), `spent`
// vanishes with nothing to count, and `seam` and `diff` both read the
// work-plane diff, which is empty when a step's whole product is a new
// untracked file, exactly what a fixture step builds.
const CHECK_ROW = 'check'

export function tierParts(tier: Tier): ReadonlyArray<string> {
  return TIER_PARTS[tier]
}

// Read a turn's text as an ending. Lines are classified, never matched
// whole: a labeled line opens a part and owns everything beneath it until the
// next label, a fence's contents belong to the label above it, and anything
// left over is a stray — which is exactly the measurement, since the turn is
// the anatomy and nothing else.
export function readAnatomy(text: string): Anatomy {
  const labels: string[] = []
  const rows = new Map<string, string>()
  const moves: string[] = []
  const highlights: string[] = []
  const advisories: string[] = []
  const strays: string[] = []
  let current: string | null = null
  let endsOn: string | null = null
  // How many labels had already been seen when the last stray landed: every
  // label after that one belongs to the ending, and nothing before it does.
  let lastStray = 0
  let nestedFence = false
  let fence: { readonly info: string; readonly ticks: string; readonly owner: string | null } | null = null

  for (const raw of splitMidLineLabels(text.split('\n'))) {
    const line = raw.replace(/\s+$/, '')
    if (line.trim().length === 0) continue

    if (fence !== null) {
      const close = FENCE.exec(line)
      if (close !== null && close[1] !== undefined && close[1].length >= fence.ticks.length && close[2] === '') {
        fence = null
        continue
      }
      // A fence of the model's own wrapped around the block: the one nesting
      // docs/presentation.md forbids, and the one that breaks the renderers it
      // exists to survive.
      if (LABEL.test(line)) nestedFence = true
      const row = ROW.exec(line)
      if (row !== null && fence.info === 'text' && fence.owner === 'Readout' && row[1] !== undefined) {
        rows.set(row[1], (row[2] ?? '').trim())
      }
      endsOn = current
      continue
    }

    const open = FENCE.exec(line)
    if (open !== null && open[1] !== undefined) {
      fence = { info: (open[2] ?? '').trim(), ticks: open[1], owner: current }
      endsOn = current
      continue
    }

    const label = LABEL.exec(line)
    if (label !== null && label[1] !== undefined) {
      current = label[1]
      labels.push(current)
      endsOn = current
      continue
    }

    if (RULE.test(line.trim())) continue

    if (ITEM.test(line)) {
      if (current === 'Your Call') moves.push(line.trim())
      else if (current === 'Summary') highlights.push(line.trim())
      endsOn = current
      continue
    }

    // An advisory rides the ending unlabeled, with its remedy on an indented
    // arrow line beneath it; a wrapped item or lead continues the part above.
    if (line.includes(WARN)) {
      advisories.push(line.trim())
      endsOn = current
      continue
    }
    if (/^\s/.test(line)) {
      endsOn = current
      continue
    }

    strays.push(line.trim())
    lastStray = labels.length
    endsOn = null
  }

  return {
    labels,
    trailingLabels: labels.slice(lastStray),
    rows,
    moves,
    highlights,
    advisories,
    endsOn,
    nestedFence,
    strays,
  }
}

// A label the driver glued to the text before it (`…state.**Summary**: …`)
// reads as one line to markdown but as two parts to the anatomy, so the label
// gets its own line and the preamble stays the stray it is. Splitting here
// rather than in the classifier keeps both findings separate: the ending is
// whole, and something preceded it.
function splitMidLineLabels(lines: ReadonlyArray<string>): ReadonlyArray<string> {
  const out: string[] = []
  for (const line of lines) {
    const at = line.search(/\*\*[^*]+\*\*:/)
    if (at > 0) {
      out.push(line.slice(0, at))
      out.push(line.slice(at))
      continue
    }
    out.push(line)
  }
  return out
}

// The tier's parts that never showed up, in the tier's own order.
export function missingParts(a: Anatomy, tier: Tier): ReadonlyArray<string> {
  return TIER_PARTS[tier].filter((part) => !a.trailingLabels.includes(part))
}

// The parts this tier forbids that showed up anyway.
export function forbiddenParts(a: Anatomy, tier: Tier): ReadonlyArray<string> {
  return TIER_FORBIDS[tier].filter((part) => a.trailingLabels.includes(part))
}

// Whether the tier's parts stand in the order the spec stacks them. Parts the
// ending never rendered are missingParts' finding, not this one's, so only what
// is present is ordered — otherwise one absence would report as two defects.
export function partsInOrder(a: Anatomy, tier: Tier): boolean {
  const expected = TIER_PARTS[tier].filter((part) => a.trailingLabels.includes(part))
  const found = a.trailingLabels.filter((label) => expected.includes(label))
  return found.join(' > ') === expected.join(' > ')
}

// Whether the gate verdict landed where the anatomy puts it. A Verdict folded
// without one is a state word standing on nothing measured.
export function hasCheckRow(a: Anatomy): boolean {
  return a.rows.has(CHECK_ROW)
}

// The lead line's label, when the ending opens on a transition rather than on
// one of the anatomy's own parts (`Checkpoint`, `Parked`, `Plan`). Null when the
// first label is a part, which is what a pause opens on.
export function transitionLabel(a: Anatomy): string | null {
  const first = a.trailingLabels[0]
  if (first === undefined) return null
  return TIER_PARTS.decision.includes(first) ? null : first
}

// The text after the plan pause's seam rule — the one tier where the model
// presents its own prose above the relay, so the block to read is the tail.
// Returns the whole text when no rule was drawn, which is itself the finding.
export function tailAfterRule(text: string): string {
  const lines = text.split('\n')
  let cut = -1
  let fenced = false
  for (const [i, raw] of lines.entries()) {
    if (FENCE.test(raw)) fenced = !fenced
    if (!fenced && RULE.test(raw.trim())) cut = i
  }
  return cut < 0 ? text : lines.slice(cut + 1).join('\n')
}

// One line naming what an ending got wrong, for a probe's `detail`. Empty when
// the shape held, so a passing probe carries no noise.
export function shapeDetail(a: Anatomy, tier: Tier): string {
  const parts: string[] = []
  const missing = missingParts(a, tier)
  const forbidden = forbiddenParts(a, tier)
  if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`)
  if (forbidden.length > 0) parts.push(`unexpected: ${forbidden.join(', ')}`)
  if (missing.length === 0 && !partsInOrder(a, tier)) parts.push(`out of order: ${a.trailingLabels.join(' > ')}`)
  return parts.join('; ')
}

// The whole shape read in one predicate: every part the tier owes, in order,
// and none it forbids.
export function endingRenders(a: Anatomy, tier: Tier): boolean {
  return missingParts(a, tier).length === 0 && forbiddenParts(a, tier).length === 0 && partsInOrder(a, tier)
}

// The probes a contract folds into its checks for a turn of the given tier.
// Every one is `info`: whether a turn PAUSED is the contract's verdict, and
// whether it paused in the right shape is a separate measurement, so folding
// the second into the first would make one rate answer two questions and break
// comparability with every receipt already written.
export function anatomyChecks(text: string, tier: Tier): ReadonlyArray<Check> {
  const a = readAnatomy(tier === 'plan' ? tailAfterRule(text) : text)
  const checks: Check[] = [
    info(`anatomy: ${tier} ending renders whole`, endingRenders(a, tier), shapeDetail(a, tier)),
  ]
  if (tier === 'decision') {
    checks.push(
      info('anatomy: the gate verdict rides the check row', hasCheckRow(a), [...a.rows.keys()].join(', ')),
    )
  }
  if (tier === 'decision' || tier === 'plan') {
    checks.push(
      info('anatomy: recommendation is the last text', a.endsOn === 'Recommendation', a.endsOn ?? 'nothing labeled'),
    )
  }
  // The stray this names is the one AFTER the relay, so it is reported only on
  // a failure: every turn has prose before the block (the model working), and
  // printing that beside a pass reads as a finding when it is the opposite.
  const clean = a.endsOn !== null && !a.nestedFence
  checks.push(
    info(
      'anatomy: nothing after the relay',
      clean,
      clean ? '' : a.nestedFence ? 'the block was wrapped in a fence' : (a.strays.at(-1) ?? ''),
    ),
  )
  return checks
}
