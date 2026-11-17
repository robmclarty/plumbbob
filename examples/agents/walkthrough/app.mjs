/**
 * The app's process, when the agent is the one that starts it.
 *
 * `agentConfig.walkthrough.start` is a shell command. `startApp` runs it
 * through `sh` in a process group of its own, waits until the url answers,
 * and returns a `stop` that takes the whole group down. A process the agent
 * owns is a process it must end every way a run can end, and there are two
 * more guards behind `stop`. An exit hook kills the group when this process
 * exits on its own or through `process.exit`. A signal that ends the process
 * outright runs no hook, so the command runs under `supervise.mjs`, which
 * leads the group and ends it when the pipe from this process closes: that
 * covers a SIGKILL of the agent. The one case left open is a command that
 * puts the app in the background and returns, followed by a SIGKILL of the
 * agent: the supervisor left with the command, and no hook runs.
 *
 * Node's builtins and nothing else, so `node --test` covers it with no
 * browser and no model.
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'

import { outputTail } from './lib.mjs'

/** The process that leads the app's group and ends it when this one is gone. */
const SUPERVISOR = join(import.meta.dirname, 'supervise.mjs')

/** How much of the app's output is held, newest last. */
const OUTPUT_CAP = 16_000

/** How long the group gets to end on SIGTERM before SIGKILL. */
const TERM_GRACE_MS = 1000
const KILL_WAIT_MS = 1000
const POLL_MS = 150

/**
 * Asks an address for anything at all, inside a short time limit. Any HTTP
 * answer counts as reachable; only a failed connection returns false.
 */
export async function answers(url, ms = 10_000) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(ms), redirect: 'manual' })
    return true
  } catch {
    return false
  }
}

/**
 * Says whether any process is left in a process group. A group this user may
 * not signal counts as alive.
 */
export function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

/**
 * Sends a signal to every process in a group, and reports nothing: a group
 * that is already gone is the result wanted.
 */
function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal)
  } catch {
    // Already gone.
  }
}

/**
 * Waits `ms`, or less when the signal aborts first.
 */
function pause(ms, abort) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    /** Ends the wait once, from the timer or the signal. */
    function done() {
      clearTimeout(timer)
      abort?.removeEventListener('abort', done)
      resolve()
    }
    abort?.addEventListener('abort', done, { once: true })
  })
}

/**
 * Waits until a process group is empty or `ms` has passed, and says which.
 */
async function groupGone(pgid, ms) {
  const until = Date.now() + ms
  while (groupAlive(pgid) && Date.now() < until) await pause(25)
  return !groupAlive(pgid)
}

/**
 * Starts the app and waits for it to answer.
 *
 * `options` is `{ command, cwd, url, readySeconds, abort, secrets }`: the
 * shell string, the directory it runs in (the repo root), the address to
 * poll, how long it has, the run's abort signal, and the key values to cut
 * out of anything quoted from its output.
 *
 * Resolves to `{ ok: true, pid, stop, killNow }` once the url answers, where
 * `pid` is also the group's id, `stop` ends the group (SIGTERM, a second,
 * then SIGKILL) and resolves to whether it is gone, and `killNow` is the
 * same thing with no wait, for a process that is exiting. When the app does
 * not come up the group is stopped first and this resolves to
 * `{ ok: false, why, tail, exit, detail }`, with `why` one of `never-ready`,
 * `exited` and `spawn`. The command runs under `supervise.mjs`, which exits
 * as the command did, so `exit` is the command's own. An abort stops the group and resolves to
 * `{ ok: false, why: 'aborted' }`.
 */
export async function startApp(options) {
  const { command, cwd, url, readySeconds, abort } = options
  const secrets = options.secrets ?? []
  const held = { output: '', cut: false, exit: null, error: null }
  // The supervisor's stdin is a pipe nothing is ever written to. This process
  // holds the only other end, so the pipe closes when this process is gone.
  const child = spawn(process.execPath, [SUPERVISOR, command], { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  child.on('error', (err) => {
    held.error = err
  })
  child.stdin?.on('error', () => {})
  child.on('exit', (code, signal) => {
    held.exit = { code, signal }
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding('utf8')
    stream?.on('data', (chunk) => {
      held.output += chunk
      if (held.output.length > OUTPUT_CAP) {
        held.output = held.output.slice(-OUTPUT_CAP)
        held.cut = true
      }
    })
    stream?.on('error', () => {})
  }
  const pid = child.pid
  const tail = () => outputTail(held.output, secrets, held.cut)
  if (pid === undefined) {
    await pause(50)
    return { ok: false, why: 'spawn', tail: tail(), exit: null, detail: held.error?.message ?? 'no process was created' }
  }

  // Behind `stop`: if this process exits with the group still up, the group
  // goes with it. A signal that ends the process outright never gets here,
  // and the supervisor covers that.
  const killNow = () => signalGroup(pid, 'SIGKILL')
  process.on('exit', killNow)

  const state = { stopping: null }
  const stop = () => {
    state.stopping ??= (async () => {
      signalGroup(pid, 'SIGTERM')
      if (!(await groupGone(pid, TERM_GRACE_MS))) {
        signalGroup(pid, 'SIGKILL')
        await groupGone(pid, KILL_WAIT_MS)
      }
      child.stdin?.destroy()
      child.stdout?.destroy()
      child.stderr?.destroy()
      child.unref()
      const gone = !groupAlive(pid)
      if (gone) process.off('exit', killNow)
      return gone
    })()
    return state.stopping
  }

  const deadline = Date.now() + readySeconds * 1000
  while (true) {
    if (abort?.aborted) {
      await stop()
      return { ok: false, why: 'aborted', tail: tail(), exit: held.exit, detail: '' }
    }
    if (await answers(url, Math.max(250, Math.min(2000, deadline - Date.now())))) {
      // Something answers. If the group is already empty it is not this app.
      if (groupAlive(pid)) return { ok: true, pid, stop, killNow }
    }
    if (!groupAlive(pid)) {
      await stop()
      return { ok: false, why: 'exited', tail: tail(), exit: held.exit, detail: '' }
    }
    if (Date.now() >= deadline) {
      await stop()
      return { ok: false, why: 'never-ready', tail: tail(), exit: held.exit, detail: '' }
    }
    await pause(POLL_MS, abort)
  }
}
