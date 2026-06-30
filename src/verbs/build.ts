// `plumbbob build <n>` — read step n's seam from intent.md, write the normalized
// SEAM + STEP. The STEP file is the in-flight signal (the dashboard derives the
// BUILD phase from it); it never checkpoints (only `checkpoint` commits).

import { readFileSync, writeFileSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { hasSession, intentPath, seamPath, stepPath } from '../lib/sidecar.ts'
import { parseStepSeam } from '../lib/intent.ts'

export function build(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const raw = args.find((a) => !a.startsWith('--'))
  if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < 1) {
    process.stderr.write('plumbbob: build needs a step number. Try: plumbbob build 2.\n')
    return 1
  }
  const step = Number(raw)

  const parsed = parseStepSeam(readFileSync(intentPath(root), 'utf8'), step)
  if (!parsed.ok) {
    process.stderr.write(`plumbbob: ${parsed.error} Fix the step's seam in intent.md, then \`build ${step}\` again.\n`)
    return 1
  }

  writeFileSync(seamPath(root), `${parsed.seam.join('\n')}\n`)
  writeFileSync(stepPath(root), `${step}\n`)

  process.stdout.write(
    `plumbbob: building step ${step}. Seam (for orientation; not a lock):\n${parsed.seam.map((p) => `  ${p}`).join('\n')}\n`,
  )
  return 0
}
