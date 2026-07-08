// `plumbbob build <n>` — read step n's seam from intent.md, write the normalized
// SEAM + STEP. The STEP file is the in-flight signal (the dashboard derives the
// BUILD phase from it); it never checkpoints (only `checkpoint` commits).

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { hasSession, intentPath, resolveBuild, seamPath, stepPath } from '../lib/sidecar.ts'
import { parseStepSeam } from '../lib/intent.ts'

export function build(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const { build: slug, rest } = resolveBuild(root, args)
  const raw = rest.find((a) => !a.startsWith('--'))
  // A step range like `1-3` is a `/pb-build` skill affordance (auto-approve
  // through the range, then pause), not a CLI capability — the CLI records one
  // in-flight step at a time. Name it rather than bounce off the generic usage.
  if (raw !== undefined && /^\d+-\d*$/.test(raw)) {
    process.stderr.write(
      `plumbbob: build takes one step number; \`${raw}\` step ranges are a \`/pb-build\` feature (auto-approve through the range, then pause). Try \`plumbbob build ${raw.split('-')[0]}\`.\n`,
    )
    return 1
  }
  if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < 1) {
    process.stderr.write('plumbbob: build needs a step number. Try: plumbbob build 2.\n')
    return 1
  }
  const step = Number(raw)

  const parsed = parseStepSeam(readFileSync(intentPath(root, slug), 'utf8'), step)
  if (!parsed.ok) {
    process.stderr.write(`plumbbob: ${parsed.error} Fix the step's seam in intent.md, then \`build ${step}\` again.\n`)
    return 1
  }

  writeFileSync(seamPath(root, slug), `${parsed.seam.join('\n')}\n`)
  writeFileSync(stepPath(root, slug), `${step}\n`)

  process.stdout.write(
    `plumbbob: building step ${step}. Seam (for orientation; not a lock):\n${parsed.seam.map((p) => `  ${p}`).join('\n')}\n`,
  )
  return 0
}
