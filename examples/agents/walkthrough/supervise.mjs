/**
 * The started app's keeper: `node supervise.mjs <command>`.
 *
 * `startApp` runs this as the leader of the app's process group, with a pipe
 * for its stdin that only the agent holds the other end of. It runs the start
 * command through `sh` in that same group and then waits. The pipe reaches
 * its end when the agent is gone, by any road, a SIGKILL included, and no
 * exit hook in the agent can promise that. When it does, this process ends
 * its own group: SIGTERM, a second, then SIGKILL.
 *
 * While the agent lives this stays out of the way. A signal the agent sends
 * the group ends it like any other member, and when the command exits it
 * exits the same way, so the agent reads the command's own exit code. After
 * that nothing is watching: a command that puts the app in the background and
 * returns leaves it to the agent's own stop and its exit hook.
 *
 * Node's builtins and nothing else.
 */

import { spawn } from 'node:child_process'

/** How long the group gets to end on SIGTERM before SIGKILL. */
const TERM_GRACE_MS = 1000

const state = { ending: false }

/**
 * Sends a signal to this process's own group, of which it is the leader.
 */
function signalOwnGroup(signal) {
  try {
    process.kill(-process.pid, signal)
  } catch {
    // Not a group leader, or nothing left to signal.
  }
}

/**
 * Ends the group once: the agent is gone, so nobody else will.
 */
function endGroup() {
  if (state.ending) return
  state.ending = true
  // The SIGTERM below reaches this process too, and it has to outlive it to
  // send the SIGKILL.
  process.on('SIGTERM', () => {})
  signalOwnGroup('SIGTERM')
  setTimeout(() => {
    signalOwnGroup('SIGKILL')
    process.exit(1)
  }, TERM_GRACE_MS)
}

const child = spawn('sh', ['-c', process.argv[2] ?? ''], { stdio: ['ignore', 'inherit', 'inherit'] })

child.on('error', (err) => {
  process.stderr.write(`sh could not be started: ${err.message}\n`)
  process.exit(127)
})

child.on('exit', (code, signal) => {
  // During the teardown the timer above has the last word.
  if (state.ending) return
  if (signal === null) process.exit(code ?? 1)
  // End the way the command ended, so the agent reads the same signal.
  process.kill(process.pid, signal)
  setTimeout(() => process.exit(1), 250)
})

process.stdin.on('end', endGroup)
process.stdin.on('close', endGroup)
process.stdin.on('error', endGroup)
process.stdin.resume()
