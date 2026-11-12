// The checks a derived plan passes before it is written as `plan.json`: the
// contract's three plan rules, which JSON Schema cannot state (unique ids,
// known dependencies, no cycle), and plumbbob's four plan checks, which belong
// to the planner (every `after:` names a step, every undone seam path exists or
// sits under a part that does, no two steps in one range share a seam unless
// one reaches the other, and no `after:` names a step that builds later).
//
// A gate, unlike the plan card's seam check: a scheduler acting on a plan that
// fails one would run two steps at once that the plan meant to order. Pure: the
// tree is injected the way the seam check injects it, and the Map's paths are
// read from keyframes.md text the caller hands in.

import type { Plan, StepFacts } from './plan.ts'
import type { Tree } from './seamcheck.ts'

/** What the plan checks need beside the plan: its step facts, the tree, and the Map's paths. */
export type PlanCheckInput = {
  readonly plan: Plan
  readonly facts: ReadonlyArray<StepFacts>
  readonly tree: Pick<Tree, 'exists'>
  readonly mapPaths: ReadonlyArray<string>
}

/**
 * Every rule and check a plan fails, each in the words `docs/plan-export.md`
 * gives, the contract's rules first; an empty list means the plan may export.
 *
 * A dependency an `after:` line names past the plan is check 1's to report,
 * so rule 2 reports only what the derivation itself got wrong, and the cycle
 * rule waits until every dependency is known, as runciter's validator does.
 */
export function checkPlan(input: PlanCheckInput): string[] {
  const { plan, facts } = input
  const byId = new Map(plan.steps.map((s) => [s.id, s]))
  const numberOf = (id: string): string => id.replace(/^step-/, '')
  const findings: string[] = []

  // Rule 1: step ids are unique.
  const seen = new Set<string>()
  for (const step of plan.steps) {
    if (seen.has(step.id)) {
      findings.push(`two steps carry the number ${numberOf(step.id)}, so both would export as \`${step.id}\`; renumber one.`)
    }
    seen.add(step.id)
  }

  // Check 1: every `after:` names a step.
  const named = new Set<string>()
  const planned = new Set(facts.map((f) => f.n))
  for (const fact of facts) {
    for (const n of fact.after ?? []) {
      if (!planned.has(n)) {
        findings.push(`step ${fact.n}'s \`after:\` names step ${n}, which the plan lacks.`)
        named.add(`step-${fact.n}>step-${n}`)
      }
    }
  }

  // Rule 2: every dependency is a step of the plan.
  let known = true
  for (const step of plan.steps) {
    for (const dep of step.depends_on) {
      if (!byId.has(dep)) {
        known = false
        if (!named.has(`${step.id}>${dep}`)) {
          findings.push(`${step.id} depends on \`${dep}\`, which is not a step of the plan.`)
        }
      }
    }
  }

  // Rule 3: no cycle, a step that waits on itself included.
  const cycle = known ? findCycle(plan) : null
  if (cycle !== null) {
    const loop = cycle.map((id) => `step ${numberOf(id)}`).join(' → ')
    findings.push(`steps wait on each other in a loop: ${loop}; one of their \`after:\` lines has to go.`)
  }

  // Check 4: no undone step's `after:` names a step that builds after it.
  const position = new Map(facts.map((f) => [f.n, f.position]))
  for (const fact of facts.filter((f) => !f.done)) {
    for (const n of fact.after ?? []) {
      if ((position.get(n) ?? -1) > fact.position) {
        findings.push(
          `step ${fact.n}'s \`after:\` names step ${n}, which builds after it; move step ${n} earlier with \`plumbbob order\`, or drop it from the line.`,
        )
      }
    }
  }

  // Check 2: every undone step's seam path exists, or sits under a part that does.
  const done = new Set(facts.filter((f) => f.done).map((f) => `step-${f.n}`))
  for (const step of plan.steps.filter((s) => !done.has(s.id))) {
    for (const entry of step.seam) {
      const folder = folderOf(entry)
      if (!pathExists(entry, input.tree) && !pathExists(folder, input.tree) && !underAPart(entry, input)) {
        findings.push(
          `step ${numberOf(step.id)}'s seam path \`${entry}\` does not exist, nor does its folder \`${folder}\`, and no part of keyframes.md's Map holds it.`,
        )
      }
    }
  }

  // Check 3: no two steps in one range share a seam unless one reaches the other.
  const ranged = plan.steps.filter((s) => s.range !== null)
  ranged.forEach((a, i) => {
    for (const b of ranged.slice(i + 1)) {
      const at = a.range === b.range ? overlapAt(a.seam, b.seam) : null
      if (at !== null && !reaches(plan, a.id, b.id) && !reaches(plan, b.id, a.id)) {
        const where = at[0] === at[1] ? `\`${at[0]}\`` : `\`${at[0]}\` and \`${at[1]}\``
        findings.push(
          `steps ${numberOf(a.id)} and ${numberOf(b.id)}, both in range ${a.range}, overlap at ${where}, and neither waits on the other; give one an \`after:\` line that reaches the other, or move one to another range.`,
        )
      }
    }
  })

  return findings
}

/**
 * The repo-relative paths the `## Map` of a root keyframes.md names on its
 * parts' `- paths:` lines, wrapped lines joined; [] when there is no Map.
 */
export function parseMapPaths(keyframes: string): string[] {
  const lines = keyframes.split('\n')
  const start = lines.findIndex((l) => l.trim() === '## Map')
  if (start === -1) return []
  const paths: string[] = []
  let reading = false
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break
    const m = /^\s+-\s+paths:\s*(.*)$/.exec(line)
    if (m !== null) {
      reading = true
      paths.push(...splitPaths(m[1] ?? ''))
    } else if (reading && /^\s{4,}\S/.test(line) && !/^\s*-\s/.test(line)) {
      paths.push(...splitPaths(line))
    } else {
      reading = false
    }
  }
  return paths
}

/** One `paths:` line's entries: comma-separated, backticks optional. */
function splitPaths(text: string): string[] {
  return text
    .split(',')
    .map((p) => p.trim().replace(/^`|`$/g, ''))
    .filter((p) => p !== '')
}

/** The folder a seam entry sits in, as a `dir/` grant (`src/plan/` for `src/plan/export.ts` or `src/plan/x/`); '' at the root. */
function folderOf(entry: string): string {
  const body = entry.endsWith('/') ? entry.slice(0, -1) : entry
  const cut = body.lastIndexOf('/')
  return cut === -1 ? '' : `${body.slice(0, cut)}/`
}

/** Whether a seam entry or folder exists in the tree; the root always does. */
function pathExists(entry: string, tree: Pick<Tree, 'exists'>): boolean {
  const body = entry.endsWith('/') ? entry.slice(0, -1) : entry
  return body === '' || tree.exists(body)
}

/** Whether a seam entry sits under an existing folder a Map part names. */
function underAPart(entry: string, input: PlanCheckInput): boolean {
  return input.mapPaths.some((part) => part.endsWith('/') && entry.startsWith(part) && pathExists(part, input.tree))
}

/** Whether `grant` is a `dir/` grant covering `entry`. */
function covers(grant: string, entry: string): boolean {
  return grant.endsWith('/') && entry.startsWith(grant)
}

/**
 * The first pair of entries at which two seams overlap, by runciter's
 * `seams_overlap`: equal entries, or a `dir/` grant in either covering an entry
 * of the other, a grant and its own bare form included. Null when they don't.
 */
function overlapAt(a: ReadonlyArray<string>, b: ReadonlyArray<string>): readonly [string, string] | null {
  for (const x of a) {
    for (const y of b) {
      if (x === y || covers(x, y) || covers(y, x) || covers(x, `${y}/`) || covers(y, `${x}/`)) {
        return [x, y]
      }
    }
  }
  return null
}

/** Whether step `from` reaches step `to` through `depends_on`, directly or through steps between. */
function reaches(plan: Plan, from: string, to: string): boolean {
  const deps = new Map(plan.steps.map((s) => [s.id, s.depends_on]))
  const visited = new Set<string>()
  const stack = [...(deps.get(from) ?? [])]
  while (stack.length > 0) {
    const id = stack.pop() ?? ''
    if (id === to) return true
    if (visited.has(id)) continue
    visited.add(id)
    stack.push(...(deps.get(id) ?? []))
  }
  return false
}

/**
 * The first cycle in `depends_on`, as ids in order with the first repeated at
 * the end (`step-3`, `step-5`, `step-3`), or null; runciter's `find_cycle`.
 */
function findCycle(plan: Plan): string[] | null {
  const deps = new Map(plan.steps.map((s) => [s.id, s.depends_on]))
  const state = new Map<string, 'visiting' | 'done'>()
  const trail: string[] = []
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null
    if (state.get(id) === 'visiting') return [...trail.slice(trail.indexOf(id)), id]
    state.set(id, 'visiting')
    trail.push(id)
    for (const dep of deps.get(id) ?? []) {
      const cycle = visit(dep)
      if (cycle !== null) return cycle
    }
    trail.pop()
    state.set(id, 'done')
    return null
  }
  for (const step of plan.steps) {
    const cycle = visit(step.id)
    if (cycle !== null) return cycle
  }
  return null
}
