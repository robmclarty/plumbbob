// `plumbbob use <slug>`: re-point the active-build cursor at an existing build
// and resume it, `nvm use`-shaped: switching and resuming are the same one word.
// The cursor is the single-line content of `.plumbbob/STATE`, the untracked
// per-worktree file whose existence means a session is live and whose one line
// names the build that session is on, so pointing it elsewhere IS the switch,
// and one-active-per-worktree holds by construction (one line cannot name two
// builds). It validates the target folder exists, and warns (but allows)
// leaving a build with a step in flight: the in-flight markers live per build,
// so that state survives the switch and resumes the next time you `use` the
// build.

import { existsSync } from 'node:fs'
import { findRepoRoot } from '../lib/git.ts'
import { activeBuild, hasSession, intentPath, listBuilds, setActiveBuild, stepPath } from '../lib/sidecar.ts'
import { advisory, ending, notice, transition } from '../lib/notice.ts'
import { driverPointer } from './handoff.ts'

/**
 * Switch the active-build cursor to the named build.
 *
 * Refuses without a session, without a slug, or when the target folder has no
 * intent.md; notes (but allows) a step left in flight on the build being left.
 */
export function use(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write(notice({ fact: 'no active session', remedy: 'plumbbob start "<title>"' }))
    return 1
  }

  const builds = listBuilds(root)
  const target = args.find((a) => !a.startsWith('--'))
  if (target === undefined || target.length === 0) {
    process.stderr.write(notice({ fact: 'use needs a build slug', detail: builds, remedy: 'plumbbob use <slug>' }))
    return 1
  }

  // Validate by the folder's intent.md, not the dir alone: an empty `builds/<slug>/`
  // is not a resumable build, and the flat `--local` layout has no builds/ at all.
  if (!existsSync(intentPath(root, target))) {
    process.stderr.write(notice({ fact: `no build named "${target}" in .plumbbob/builds/`, detail: builds }))
    return 1
  }

  const leaving = activeBuild(root)
  const left = leaving !== null && leaving !== target && existsSync(stepPath(root, leaving)) ? leaving : null

  setActiveBuild(root, target)

  // The lead line, then the advisory it qualifies, then the pointer into the
  // build just switched to: one fixed order for every ending, so the relay never
  // has to guess which line leads.
  process.stdout.write(
    ending({
      lead: transition({
        label: 'Active build',
        fact: target,
        detail: existsSync(stepPath(root, target)) ? ['a step is in flight'] : [],
      }),
      advisories:
        left === null
          ? []
          : [
              advisory({
                fact: `build "${left}" has a step in flight`,
                detail: ['its in-flight state is preserved'],
                remedy: `plumbbob use ${left} to pick it back up`,
              }),
            ],
      pointer: driverPointer(root, target),
    }),
  )
  return 0
}
