// A build's plan as a file: the reads and writes around the pure derivation
// (src/lib/plan.ts) and its checks (src/lib/plancheck.ts). It reads intent.md,
// hashes its bytes, hands the tree and the root keyframes.md's Map in, and
// says what a fresh `plan.json` would hold. Three callers share it: `export`
// writes the file, the verbs that write intent.md keep an exported one current,
// and the check fails when one has fallen behind. A build without `plan.json`
// is never touched: the first `plumbbob export` is what opts it in.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { advisory } from './notice.ts'
import { derivePlan, serializePlan } from './plan.ts'
import { checkPlan, parseMapPaths } from './plancheck.ts'
import { activeBuild, buildDir, listBuilds } from './sidecar.ts'

/** A fresh derivation: the bytes `plan.json` should hold, or every finding that refuses them. */
export type FreshPlan =
  | { readonly ok: true; readonly text: string; readonly steps: number }
  | { readonly ok: false; readonly findings: ReadonlyArray<string> }

/** Where a build's `plan.json` lives: beside its intent.md. */
export function planJsonPath(root: string, slug: string): string {
  return join(buildDir(root, slug), 'plan.json')
}

/** A path from the repo root, with forward slashes whatever the platform. */
function repoPath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

/**
 * Derive and check the named build's plan from its intent.md as it is on
 * disk, and serialize it the one way `plan.json` is written.
 *
 * The findings are the derivation's own (a malformed step line) or, once it
 * derives, the contract's rules and plumbbob's checks, in the words
 * docs/plan-export.md gives.
 */
export function freshPlan(root: string, slug: string): FreshPlan {
  const intentFile = join(buildDir(root, slug), 'intent.md')
  const bytes = readFileSync(intentFile)
  const derived = derivePlan({
    intent: bytes.toString('utf8'),
    slug,
    path: repoPath(root, intentFile),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
  if (!derived.ok) {
    return { ok: false, findings: derived.findings }
  }
  const keyframes = join(root, 'keyframes.md')
  const findings = checkPlan({
    plan: derived.plan,
    facts: derived.facts,
    tree: { exists: (p) => existsSync(join(root, p)) },
    mapPaths: existsSync(keyframes) ? parseMapPaths(readFileSync(keyframes, 'utf8')) : [],
  })
  return findings.length > 0
    ? { ok: false, findings }
    : { ok: true, text: serializePlan(derived.plan), steps: derived.plan.steps.length }
}

/**
 * Bring an exported build's `plan.json` up to its intent.md, after a verb has
 * written intent.md: the CLI keeping up with its own writes.
 *
 * Returns null when the build has no `plan.json`, which is the build that never
 * opted in, left exactly as it was; the empty list when the file is current,
 * written afresh or already so; and the findings when the plan now fails a rule
 * or a check, in which case nothing is written and the check will say so.
 */
export function refreshPlan(root: string, slug: string | null): ReadonlyArray<string> | null {
  if (slug === null || !existsSync(planJsonPath(root, slug))) {
    return null
  }
  try {
    const fresh = freshPlan(root, slug)
    if (!fresh.ok) {
      return fresh.findings
    }
    if (readFileSync(planJsonPath(root, slug), 'utf8') !== fresh.text) {
      writeFileSync(planJsonPath(root, slug), fresh.text)
    }
    return []
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return [`plan.json could not be refreshed (${message}).`]
  }
}

/**
 * Every exported build whose `plan.json` is not what a fresh derivation would
 * write, one line per problem.
 *
 * The active build reads in the words docs/plan-export.md gives; another build
 * folder is named by its slug, since its remedy names it too. A plan that now
 * fails a rule or a check lists those findings instead of the drift line, and
 * closes on the export that brings it current once they are fixed. Empty when
 * every exported build is current, and always empty in a repo with no
 * `plan.json` at all.
 */
export function planDrift(root: string): ReadonlyArray<string> {
  const active = activeBuild(root)
  return listBuilds(root)
    .filter((slug) => existsSync(planJsonPath(root, slug)))
    .flatMap((slug) => {
      const own = slug === active
      const named = (line: string): string => (own ? line : `${slug}: ${line}`)
      let fresh: FreshPlan
      try {
        fresh = freshPlan(root, slug)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return [named(`plan.json could not be derived afresh (${message}).`)]
      }
      const remedy = own ? '`plumbbob export`' : `\`plumbbob export ${slug}\``
      if (!fresh.ok) {
        return [...fresh.findings.map(named), named(`fix the plan, then run ${remedy} to bring plan.json current.`)]
      }
      if (readFileSync(planJsonPath(root, slug), 'utf8') === fresh.text) {
        return []
      }
      return [
        own
          ? 'plan.json is behind intent.md; run `plumbbob export` to bring it current.'
          : `${repoPath(root, planJsonPath(root, slug))} is behind its intent.md; run ${remedy} to bring it current.`,
      ]
    })
}

/**
 * The advisory a verb's ending carries when its write left an exported
 * `plan.json` unrefreshed, because the plan now fails a rule or a check; ''
 * when the refresh had nothing to say.
 *
 * The findings themselves are `export`'s to print, whole and in the spec's
 * words, so the advisory counts them and names the verb that reads them out.
 */
export function refreshAdvisory(findings: ReadonlyArray<string> | null): string {
  if (findings === null || findings.length === 0) {
    return ''
  }
  return advisory({
    fact: 'plan.json was left as it was',
    detail: [findings.length === 1 ? '1 plan finding' : `${findings.length} plan findings`],
    remedy: 'plumbbob export names them; fix the plan, then run it again',
  })
}
