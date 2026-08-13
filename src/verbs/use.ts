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

/**
 * Switch the active-build cursor to the named build.
 *
 * Refuses without a session, without a slug, or when the target folder has no
 * intent.md; notes (but allows) a step left in flight on the build being left.
 */
export function use(cwd: string, args: ReadonlyArray<string>): number {
  const root = findRepoRoot(cwd)
  if (root === null || !hasSession(root)) {
    process.stderr.write('plumbbob: no active session. Run `plumbbob start "<title>"` first.\n')
    return 1
  }

  const builds = listBuilds(root)
  const target = args.find((a) => !a.startsWith('--'))
  if (target === undefined || target.length === 0) {
    process.stderr.write(`plumbbob: use needs a build slug.${buildsHint(builds)}\n`)
    return 1
  }

  // Validate by the folder's intent.md, not the dir alone: an empty `builds/<slug>/`
  // is not a resumable build, and the flat `--local` layout has no builds/ at all.
  if (!existsSync(intentPath(root, target))) {
    process.stderr.write(
      `plumbbob: no build named "${target}" in .plumbbob/builds/.${buildsHint(builds)}\n`,
    )
    return 1
  }

  const leaving = activeBuild(root)
  if (leaving !== null && leaving !== target && existsSync(stepPath(root, leaving))) {
    process.stderr.write(
      `plumbbob: note — build "${leaving}" has a step in flight; its in-flight state is preserved ` +
        `and resumes when you \`use ${leaving}\` again.\n`,
    )
  }

  setActiveBuild(root, target)

  const resuming = existsSync(stepPath(root, target)) ? ' (a step is in flight — `status` shows where)' : ''
  process.stdout.write(`plumbbob: now on build "${target}"${resuming}. \`status\` to orient.\n`)
  return 0
}

/**
 * A trailing " Builds: a, b." hint when any exist, so a bad or missing slug
 * points the user straight at the valid choices.
 */
function buildsHint(builds: ReadonlyArray<string>): string {
  return builds.length > 0 ? ` Builds: ${builds.join(', ')}.` : ''
}
