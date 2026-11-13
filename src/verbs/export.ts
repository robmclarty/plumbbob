// `plumbbob export [<slug>]`: write a build's plan as data, `plan.json` beside
// its intent.md, in the shape runciter's scheduler reads (`runciter.plan/1`).
// The derivation and its checks run through src/lib/planfile.ts, which reads
// intent.md and the tree; this verb writes the result only when nothing fails,
// since a scheduler acting on a plan that fails a check would run two steps at
// once that the plan meant to order. The first export opts a build in; the
// file is never written by hand.

import { existsSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { findRepoRoot } from '../lib/git.ts'
import { notice, transition } from '../lib/notice.ts'
import { freshPlan, planJsonPath } from '../lib/planfile.ts'
import { activeBuild, buildDir } from '../lib/sidecar.ts'

/**
 * Derive, check, and write `.plumbbob/builds/<slug>/plan.json` for the named
 * build, or the active one with no slug.
 *
 * On a finding it prints each on its own line and the tally, writes nothing,
 * and exits 1. Refuses (exit 1) outside a repo, with no build to name, or a
 * build folder with no intent.md.
 */
export function exportPlan(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null) {
    process.stderr.write(notice({ fact: 'not inside a git repository', remedy: 'run plumbbob from inside the repo' }))
    return 1
  }
  const named = args.find((a) => !a.startsWith('--'))
  const slug = named ?? activeBuild(root)
  if (slug === null) {
    process.stderr.write(
      notice({ fact: 'no build to export', detail: ['no active build, and none named'], remedy: 'plumbbob export <slug>' }),
    )
    return 1
  }
  const intentFile = join(buildDir(root, slug), 'intent.md')
  if (!/^[A-Za-z0-9][\w.-]*$/.test(slug) || !existsSync(intentFile)) {
    process.stderr.write(
      notice({ fact: `no build named "${slug}" in .plumbbob/builds/`, remedy: 'plumbbob export <slug>, by its folder name' }),
    )
    return 1
  }

  const fresh = freshPlan(root, slug)
  if (!fresh.ok) {
    // Each finding is printed whole, its period kept, in the words the spec gives
    // (docs/plan-export.md), which a notice's own punctuation would trim.
    const tally = fresh.findings.length === 1 ? '1 finding' : `${fresh.findings.length} findings`
    process.stderr.write(
      [...fresh.findings, `export refused, ${tally}; plan.json not written.`].map((f) => `plumbbob: ${f}\n`).join(''),
    )
    return 1
  }

  const out = planJsonPath(root, slug)
  writeFileSync(out, fresh.text)
  const steps = fresh.steps
  process.stdout.write(
    transition({
      label: 'Exported',
      fact: `${relative(root, out).split(sep).join('/')} (${steps} ${steps === 1 ? 'step' : 'steps'}, runciter.plan/1)`,
    }),
  )
  return 0
}
