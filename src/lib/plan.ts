// The plan as data: intent.md derived into runciter's `runciter.plan/1`, the
// shape its scheduler reads as `plan.json`. Runciter owns the shape; this
// module only writes it, from facts plumbbob already parses (the steps, their
// seams and lines, the build order, the ranges, the decisions and constraints).
// Pure: the caller reads the file, hashes its bytes, and writes the result.

import { parseBuildTitle, parseStepFields, parseStepMeta, parseStepSeam, scrapeBullets, type StepEffort } from './intent.ts'
import { orderSteps, parseBuildOrder, parseBuildRanges, parseSteps } from './orient.ts'
import { expandStepList, hasStep } from './steplist.ts'

/** The contract's protocol tag. */
const PLAN_PROTOCOL = 'runciter.plan/1'

/** Where the scheduler stops for a person, after a step lands. */
export type PlanStop = 'none' | 'planned' | 'structural'

/** One step of `runciter.plan/1`, its keys in the contract's order. */
export type PlanStep = {
  readonly id: string
  readonly title: string
  readonly range: string | null
  readonly depends_on: ReadonlyArray<string>
  readonly seam: ReadonlyArray<string>
  readonly stop: PlanStop
  readonly effort: StepEffort | null
  readonly done_when: string
  readonly context: ReadonlyArray<string>
}

/** A whole `runciter.plan/1` object, its keys in the contract's order and every default written out. */
export type Plan = {
  readonly protocol: typeof PLAN_PROTOCOL
  readonly build: { readonly id: string; readonly title: string }
  readonly source: { readonly path: string; readonly sha256: string } | null
  readonly contract_paths: ReadonlyArray<string>
  readonly decisions: ReadonlyArray<string>
  readonly constraints: ReadonlyArray<string>
  readonly steps: ReadonlyArray<PlanStep>
}

/**
 * What plumbbob knows about a step that the contract has no field for, kept
 * beside the plan for the plan checks: whether it landed, where it falls in
 * build order, and the numbers its `after:` line names (null for no line).
 */
export type StepFacts = {
  readonly n: number
  readonly done: boolean
  readonly position: number
  readonly after: ReadonlyArray<number> | null
}

/** A derived plan and its step facts, or every finding that kept a step from reading. */
export type PlanDerivation =
  | { readonly ok: true; readonly plan: Plan; readonly facts: ReadonlyArray<StepFacts> }
  | { readonly ok: false; readonly findings: ReadonlyArray<string> }

/** The step id a plan number exports as: `step-<n>`, as stable as the number. */
export function stepId(n: number): string {
  return `step-${n}`
}

/**
 * Derive `runciter.plan/1` from an intent's text.
 *
 * Every step exports, landed or not, in plan-number order. A step depends on
 * what its `after:` line names, or else on the step before it in build order,
 * so a plan with no `after:` line exports fully serial. The last step of each
 * range in build order stops `planned`, a bare range's one step included, and
 * a `stop:` line overrides any step's. A step whose lines, seam, or done-when
 * will not read is a finding by step, and any finding refuses the whole plan
 * rather than exporting a guess.
 */
export function derivePlan(input: {
  readonly intent: string
  readonly slug: string
  readonly path: string
  readonly sha256: string
}): PlanDerivation {
  const { intent } = input
  const parsed = parseSteps(intent)
  const steps = [...parsed].sort((a, b) => a.n - b.n)
  const ordered = orderSteps(parsed, parseBuildOrder(intent))
  const ranges = parseBuildRanges(intent).ranges
  const planned = new Set(steps.map((s) => s.n))
  const findings: string[] = []

  if (steps.length === 0) {
    findings.push('intent.md has no steps under "## Steps"; the contract needs one.')
  }
  const title = parseBuildTitle(intent)
  if (title === '') {
    findings.push('intent.md has no `# ` title; the contract needs one.')
  }

  const rangeEnds = new Set(
    ranges.flatMap((r) => {
      const last = ordered.filter((s) => hasStep(r.steps, s.n)).at(-1)
      return last === undefined ? [] : [last.n]
    }),
  )

  const planSteps: PlanStep[] = []
  const facts: StepFacts[] = []
  for (const step of steps) {
    const fields = parseStepFields(intent, step.n)
    const seam = parseStepSeam(intent, step.n)
    const meta = parseStepMeta(intent, step.n)
    if (!fields.ok) findings.push(...fields.findings)
    if (!seam.ok) findings.push(seam.error)
    if (meta.doneWhen === '') findings.push(`step ${step.n} has no **done when:** text; the contract needs one.`)
    if (!fields.ok || !seam.ok) continue

    const position = ordered.findIndex((s) => s === step)
    const line = fields.fields.after
    const after = line === null ? null : line === 'none' ? [] : expandStepList(line, (n) => planned.has(n))
    const before = ordered[position - 1]
    const dependsOn = after ?? (before === undefined ? [] : [before.n])
    const range = ranges.find((r) => hasStep(r.steps, step.n))

    planSteps.push({
      id: stepId(step.n),
      title: meta.title,
      range: range === undefined ? null : String(range.item),
      depends_on: dependsOn.map(stepId),
      seam: seam.seam,
      stop: fields.fields.stop ?? (rangeEnds.has(step.n) ? 'planned' : 'none'),
      effort: fields.fields.effort,
      done_when: meta.doneWhen,
      context: fields.fields.notes,
    })
    facts.push({ n: step.n, done: step.done, position, after })
  }

  if (findings.length > 0) {
    return { ok: false, findings }
  }
  return {
    ok: true,
    plan: {
      protocol: PLAN_PROTOCOL,
      build: { id: input.slug, title },
      source: { path: input.path, sha256: input.sha256 },
      contract_paths: [],
      decisions: scrapeBullets(intent, '## Decisions').items,
      constraints: scrapeBullets(intent, '## Constraints').items,
      steps: planSteps,
    },
    facts,
  }
}

/**
 * Write a plan the one way `plan.json` is written: two-space JSON, keys in the
 * contract's order, every default written out, and a trailing newline, so
 * "current" is a byte compare against a fresh derivation.
 *
 * The keys are rebuilt in order here rather than trusted from the caller, so a
 * plan read back from disk serializes the same as one just derived.
 */
export function serializePlan(plan: Plan): string {
  const ordered = {
    protocol: plan.protocol,
    build: { id: plan.build.id, title: plan.build.title },
    source: plan.source === null ? null : { path: plan.source.path, sha256: plan.source.sha256 },
    contract_paths: plan.contract_paths,
    decisions: plan.decisions,
    constraints: plan.constraints,
    steps: plan.steps.map((s) => ({
      id: s.id,
      title: s.title,
      range: s.range,
      depends_on: s.depends_on,
      seam: s.seam,
      stop: s.stop,
      effort: s.effort,
      done_when: s.done_when,
      context: s.context,
    })),
  }
  return `${JSON.stringify(ordered, null, 2)}\n`
}
