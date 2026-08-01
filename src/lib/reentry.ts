// The gate's re-entrancy marker: which repos have a check run in flight,
// recorded on the environment so every process in the tree can see it.
//
// The failure it exists to stop is not slowness, it is unbounded recursion. A
// repo whose `check` setting is its own full pipeline (`pnpm check`) has a gate
// that runs its test suite; anything in that suite which gates THAT SAME REPO —
// a test driving `checkpoint` against the process cwd — spawns a second full
// pipeline, whose suite spawns a third. Each generation forks wider than the
// last, and nothing in the loop is aware there is a loop. The only thing that
// ended the first observed occurrence was checkride's 600s per-check cap
// killing one generation from the outside.
//
// It is scoped BY ROOT, and that is the whole design. A flat "a gate is
// running" flag is wrong in the one case that matters most: plumbbob's own
// suite legitimately gates dozens of fixture repos, and when the suite itself
// is running under this repo's gate it inherits the marker — so a flat flag
// refuses every one of them and turns a green suite red. Recursion is a repo
// re-entering ITS OWN gate; a different root is ordinary nested work and must
// pass through untouched.
//
// The marker rides the environment rather than a module-level variable because
// the recursion crosses process boundaries (spawned shells, checkride's tool
// subprocesses, vitest's worker forks), and a variable in one heap is invisible
// to all of them. Node builtins only.

import { resolve } from 'node:path'

/** The environment key. Namespaced so nothing else can set it by accident. */
const MARKER = 'PLUMBBOB_GATE_ROOTS'

/** The separator. A newline cannot appear in a path, unlike `:` on a weird one. */
const SEP = '\n'

/**
 * The roots with a gate in flight, as absolute paths.
 */
function activeRoots(env: NodeJS.ProcessEnv): ReadonlyArray<string> {
  const raw = env[MARKER] ?? ''
  return raw.split(SEP).filter((r) => r.length > 0)
}

/**
 * True when `root` already has a check gate running in this process tree.
 *
 * Compared as resolved absolute paths, so the same repo reached by a relative
 * path, a symlink-free alias, or a trailing slash still counts as itself.
 * `env` is injectable so the guard is testable without mutating the real one.
 */
export function gateIsRunningFor(root: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return activeRoots(env).includes(resolve(root))
}

/**
 * Run `body` with `root` recorded as gated, restoring the prior value after.
 *
 * The marker is set on `process.env` itself, not on a copy handed to one child:
 * the in-process checkride path spawns its own tool subprocesses, and they
 * inherit the parent's environment at spawn time. `finally` restores rather
 * than deletes, so nesting a second root inside the first cannot un-mark the
 * first when the inner call returns.
 */
export async function withGateMarker<T>(root: string, body: () => Promise<T> | T): Promise<T> {
  const prior = process.env[MARKER]
  process.env[MARKER] = [...activeRoots(process.env), resolve(root)].join(SEP)
  try {
    return await body()
  } finally {
    if (prior === undefined) {
      delete process.env[MARKER]
    } else {
      process.env[MARKER] = prior
    }
  }
}
