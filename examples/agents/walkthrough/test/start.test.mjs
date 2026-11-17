/**
 * The `start` command: the app's process, started and stopped by the agent.
 *
 * The first half drives `startApp` directly, with no browser and no model.
 * The second half runs `walkthrough.mjs` as the CLI would, as a subprocess
 * with a StepContext on stdin, against a stub that speaks the Chat
 * Completions wire where a model would be. Those cases need a browser and
 * skip without one.
 */

import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import { answers, groupAlive, startApp } from '../app.mjs'
import { startFixture } from '../fixture/app.mjs'
import { startBlocked } from '../lib.mjs'

const AGENT_DIR = dirname(import.meta.dirname)
const FIXTURE = join(AGENT_DIR, 'fixture', 'app.mjs')
const AGENT = join(AGENT_DIR, 'walkthrough.mjs')

/**
 * Finds a loopback port nothing is listening on.
 */
async function freePort() {
  const probe = await startFixture()
  const port = Number(new URL(probe.url).port)
  await probe.close()
  return port
}

/**
 * The shell line that starts the fixture on a port, as a person would write
 * it in settings.
 */
function fixtureCommand(port) {
  return `"${process.execPath}" "${FIXTURE}" ${port}`
}

/**
 * Waits until a condition holds or `ms` has passed, and says which.
 */
async function eventually(condition, ms = 5000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await condition()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return Boolean(await condition())
}

/**
 * A server that speaks enough of the Chat Completions wire to end a walk: it
 * answers every completion with `reply`, or never answers when `reply` is
 * null. `asked` counts the completions it was sent.
 */
function startModel(reply) {
  const state = { asked: 0 }
  const server = createServer((req, res) => {
    if (req.method !== 'POST') {
      res.end('ok')
      return
    }
    req.resume()
    req.on('end', () => {
      state.asked += 1
      if (reply === null) return
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          id: 'stub',
          object: 'chat.completion',
          model: 'stub',
          choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        })
      )
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        state,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections()
            server.close(() => done())
          }),
      })
    })
  })
}

/**
 * Runs the agent as a subprocess with a StepContext on stdin. Returns the
 * child and a promise of `{ code, signal, stdout, stderr, envelope }`.
 */
function runAgent(agent, { agentTimeout = 0 } = {}) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'walkthrough-start-')))
  const ctx = {
    contract: 1,
    mode: 'after',
    step: { n: 2, title: 'Greet the person by name', proof: { command: null, text: 'the first page is headed "Sign in"' } },
    settings: { auto: false, agentTimeout, agent: { provider: 'openai', model: 'stub', ...agent } },
  }
  const child = spawn(process.execPath, [AGENT], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  const out = { stdout: '', stderr: '' }
  child.stdout.setEncoding('utf8').on('data', (chunk) => (out.stdout += chunk))
  child.stderr.setEncoding('utf8').on('data', (chunk) => (out.stderr += chunk))
  child.stdin.end(JSON.stringify(ctx))
  const done = new Promise((resolve) => {
    child.on('close', (code, signal) => {
      const line = out.stdout.trim()
      resolve({ code, signal, ...out, envelope: line.length > 0 ? JSON.parse(line) : null })
    })
  })
  return { child, done, out, cwd }
}

/**
 * Reads the app's process group from the agent's narration.
 */
function groupOf(stderr) {
  const match = /\(process group (\d+)\)/.exec(stderr)
  return match ? Number(match[1]) : null
}

/**
 * Every process under a pid, children and their children, as pids.
 */
function descendants(pid) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((row) => row.trim().split(/\s+/).map(Number))
  const under = (parent) => rows.filter(([, ppid]) => ppid === parent).flatMap(([child]) => [child, ...under(child)])
  return under(pid)
}

/**
 * Says whether a pid still names a running process.
 */
function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Skips the test when the envelope says there is no browser to drive.
 */
function skipWithoutBrowser(t, envelope) {
  if (envelope?.status !== 'blocked' || !/no browser to drive/.test(envelope.summary)) return false
  t.skip(`no browser installed for Playwright MCP. ${envelope.notes}`)
  return true
}

test('startApp starts the command, waits for the url, and stop takes the whole group down', async () => {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  // The server is a child of the shell, not the shell itself: the group is
  // what has to go.
  const app = await startApp({ command: `${fixtureCommand(port)} & wait`, cwd: AGENT_DIR, url, readySeconds: 30 })
  assert.equal(app.ok, true)
  assert.equal(await answers(url, 2000), true)
  assert.equal(groupAlive(app.pid), true)
  const members = [app.pid, ...descendants(app.pid)]
  assert.ok(members.length >= 2, 'the shell and the server it started')

  assert.equal(await app.stop(), true)
  assert.equal(groupAlive(app.pid), false)
  assert.equal(await eventually(() => members.every((pid) => !alive(pid))), true)
  assert.equal(await answers(url, 2000), false)
  // A second stop is the same answer, not a second kill.
  assert.equal(await app.stop(), true)
})

test('an app that never answers: never-ready, stopped, with its last lines and no key in them', async () => {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  const key = 'sk-SECRET-OPENAI-123'
  const command = `echo booting; echo "sent ${key}" >&2; sleep 60`
  const failure = await startApp({ command, cwd: AGENT_DIR, url, readySeconds: 1, secrets: [key] })
  assert.equal(failure.ok, false)
  assert.equal(failure.why, 'never-ready')
  assert.deepEqual([...failure.tail].sort(), ['booting', 'sent (key)'])

  const envelope = startBlocked(failure, { command, url, readySeconds: 1, secrets: [key] })
  assert.equal(envelope.status, 'blocked')
  assert.equal(envelope.summary, `walkthrough started the app and ${url} never answered, so no walk was run.`)
  assert.match(envelope.notes, /ran for 1 second and nothing answered .* so it was stopped\. If another program already holds that port/)
  assert.doesNotMatch(JSON.stringify(envelope), /SECRET/)
  // The sleep is gone with the shell that ran it.
  assert.equal(execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' }).includes(`sent ${key}`), false)
})

test('a start command that ends before the url answers is reported at once, with its exit code', async () => {
  const port = await freePort()
  const began = Date.now()
  const failure = await startApp({
    command: 'echo "cannot find the app" >&2; exit 3',
    cwd: AGENT_DIR,
    url: `http://127.0.0.1:${port}/`,
    readySeconds: 60,
  })
  assert.equal(failure.why, 'exited')
  assert.deepEqual(failure.exit, { code: 3, signal: null })
  assert.deepEqual(failure.tail, ['cannot find the app'])
  assert.ok(Date.now() - began < 20_000, 'it did not wait out the ready time')
})

test('a port held by something that is not the app shows up as an app that did not come up', async () => {
  // Something that takes the port and speaks no HTTP.
  const squatter = createTcpServer((socket) => socket.destroy())
  await new Promise((resolve) => squatter.listen(0, '127.0.0.1', resolve))
  const port = squatter.address().port
  const url = `http://127.0.0.1:${port}/`
  try {
    assert.equal(await answers(url, 2000), false)
    const command = fixtureCommand(port)
    const failure = await startApp({ command, cwd: AGENT_DIR, url, readySeconds: 30 })
    assert.equal(failure.ok, false)
    assert.equal(failure.why, 'exited')
    assert.match(failure.tail.join('\n'), /EADDRINUSE/)
    const envelope = startBlocked(failure, { command, url, readySeconds: 30 })
    assert.match(envelope.summary, /started the app and it stopped before .* answered/)
    assert.match(envelope.notes, /If another program already holds that port, the app could not bind to it and this is what that looks like/)
    assert.match(envelope.notes, /Its last output:\n(.|\n)*EADDRINUSE/)
  } finally {
    await new Promise((resolve) => squatter.close(resolve))
  }
})

test('an abort while the app is starting stops it', async () => {
  const port = await freePort()
  const abort = new AbortController()
  setTimeout(() => abort.abort(), 400)
  const marker = `walkthrough-abort-${port}`
  const failure = await startApp({
    command: `sleep 60; echo ${marker}`,
    cwd: AGENT_DIR,
    url: `http://127.0.0.1:${port}/`,
    readySeconds: 60,
    abort: abort.signal,
  })
  assert.equal(failure.why, 'aborted')
  assert.equal(execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' }).includes(marker), false)
})

test('the agent blocks on an app that never comes up, and leaves nothing running', async () => {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  const model = await startModel('VERDICT: MATCH\nnever reached')
  try {
    const { done } = runAgent({ url, baseUrl: model.baseUrl, start: 'echo warming up; sleep 60', readySeconds: 1 })
    const { code, envelope, stderr } = await done
    assert.equal(code, 0)
    assert.equal(envelope.status, 'blocked')
    assert.equal(envelope.summary, `walkthrough started the app and ${url} never answered, so no walk was run.`)
    assert.match(envelope.notes, /Its last output:\n {2}warming up$/)
    assert.match(stderr, /starting the app \(echo warming up; sleep 60\); waiting up to 1 seconds/)
    assert.equal(model.state.asked, 0)
  } finally {
    await model.close()
  }
})

test('a walk with start: the app is started, walked and gone when the agent exits', async (t) => {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  const model = await startModel('VERDICT: MATCH\nThe first page is headed "Sign in".')
  try {
    const { done } = runAgent({ url, baseUrl: model.baseUrl, start: `${fixtureCommand(port)} & wait` })
    const { code, envelope, stderr } = await done
    if (skipWithoutBrowser(t, envelope)) return
    assert.equal(code, 0, stderr)
    assert.equal(envelope.status, 'done')
    assert.equal(envelope.summary, 'match: The first page is headed "Sign in".')
    assert.match(envelope.body, /\n\nThe app was started by the start command and stopped when the walk ended\.$/)
    const group = groupOf(stderr)
    assert.ok(group !== null, stderr)
    assert.equal(groupAlive(group), false)
    assert.equal(await answers(url, 2000), false)
  } finally {
    await model.close()
  }
})

test('with the url already answering, start is not run and the running app is left running', async (t) => {
  const running = await startFixture()
  const model = await startModel('VERDICT: MATCH\nThe first page is headed "Sign in".')
  try {
    const run = runAgent({ url: running.url, baseUrl: model.baseUrl, start: 'touch started-by-the-agent; sleep 60' })
    const { code, envelope, stderr } = await run.done
    if (skipWithoutBrowser(t, envelope)) return
    assert.equal(code, 0, stderr)
    assert.equal(envelope.status, 'done')
    assert.match(
      envelope.body,
      new RegExp(`\\n\\nThe app was already answering at ${running.url}, so the walk used it and the start command was not run\\.$`)
    )
    assert.equal(existsSync(join(run.cwd, 'started-by-the-agent')), false)
    assert.equal(groupOf(stderr), null)
    // The app the agent did not start is still there.
    assert.equal(await answers(running.url, 2000), true)
  } finally {
    await model.close()
    await running.close()
  }
})

test('SIGTERM mid-walk: the agent exits within seconds, with the app and the browser gone', async (t) => {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  // A model that never answers, so the walk is in flight when the signal lands.
  const model = await startModel(null)
  try {
    const run = runAgent({ url, baseUrl: model.baseUrl, start: `${fixtureCommand(port)} & wait` })
    const early = await Promise.race([run.done, eventually(() => model.state.asked > 0, 120_000)])
    if (typeof early === 'object') {
      if (skipWithoutBrowser(t, early.envelope)) return
      assert.fail(`the agent ended before the model was asked: ${early.stderr}`)
    }
    assert.equal(early, true, 'the model was never asked')
    const group = groupOf(run.out.stderr)
    assert.ok(group !== null && groupAlive(group), 'the app is up while the walk runs')
    const tree = descendants(run.child.pid)
    assert.ok(tree.length >= 2, 'the Playwright MCP server and its browser are running')

    const sent = Date.now()
    run.child.kill('SIGTERM')
    const { code, stdout } = await run.done
    t.diagnostic(`the agent exited ${Date.now() - sent} ms after SIGTERM`)
    assert.ok(Date.now() - sent < 4500, `the agent took ${Date.now() - sent} ms to exit`)
    // No envelope: a stopped run is a failed run, never a verdict.
    assert.notEqual(code, 0)
    assert.equal(stdout, '')
    assert.equal(groupAlive(group), false)
    assert.equal(await answers(url, 2000), false)
    assert.equal(await eventually(() => tree.every((pid) => !alive(pid)), 5000), true, 'the browser is gone')
  } finally {
    await model.close()
  }
})

test('SIGINT while the app is starting: the agent exits and the app is gone', async () => {
  const port = await freePort()
  const model = await startModel(null)
  const marker = `walkthrough-sigint-${port}`
  try {
    const run = runAgent({ url: `http://127.0.0.1:${port}/`, baseUrl: model.baseUrl, start: `sleep 60; echo ${marker}`, readySeconds: 60 })
    assert.equal(await eventually(() => /starting the app/.test(run.out.stderr), 60_000), true)
    const running = () => execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' }).includes(marker)
    assert.equal(await eventually(running, 5000), true)
    const sent = Date.now()
    run.child.kill('SIGINT')
    const { code, stdout } = await run.done
    assert.ok(Date.now() - sent < 4500, `the agent took ${Date.now() - sent} ms to exit`)
    assert.notEqual(code, 0)
    assert.equal(stdout, '')
    assert.equal(await eventually(() => !running(), 3000), true)
  } finally {
    await model.close()
  }
})

for (const signal of ['SIGHUP', 'SIGQUIT']) {
  test(`${signal} mid-walk: the agent exits 1 with the app's group empty`, async (t) => {
    const port = await freePort()
    const url = `http://127.0.0.1:${port}/`
    const model = await startModel(null)
    try {
      const run = runAgent({ url, baseUrl: model.baseUrl, start: `${fixtureCommand(port)} & wait` })
      const early = await Promise.race([run.done, eventually(() => model.state.asked > 0, 120_000)])
      if (typeof early === 'object') {
        if (skipWithoutBrowser(t, early.envelope)) return
        assert.fail(`the agent ended before the model was asked: ${early.stderr}`)
      }
      assert.equal(early, true, 'the model was never asked')
      const group = groupOf(run.out.stderr)
      assert.ok(group !== null && groupAlive(group), 'the app is up while the walk runs')

      const sent = Date.now()
      run.child.kill(signal)
      const { code, signal: endedBy, stdout } = await run.done
      t.diagnostic(`the agent exited ${Date.now() - sent} ms after ${signal}`)
      // The agent handled the signal: it was not ended by it, and it left no envelope.
      assert.equal(endedBy, null)
      assert.equal(code, 1)
      assert.equal(stdout, '')
      assert.equal(await eventually(() => !groupAlive(group), 3000), true, 'the group is empty')
      assert.equal(await answers(url, 2000), false)
    } finally {
      await model.close()
    }
  })
}

test('SIGHUP while the app is starting: the agent exits and the app is gone', async () => {
  const port = await freePort()
  const model = await startModel(null)
  const marker = `walkthrough-sighup-${port}`
  try {
    const run = runAgent({ url: `http://127.0.0.1:${port}/`, baseUrl: model.baseUrl, start: `sleep 60; echo ${marker}`, readySeconds: 60 })
    assert.equal(await eventually(() => /starting the app/.test(run.out.stderr), 60_000), true)
    const running = () => execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' }).includes(marker)
    assert.equal(await eventually(running, 5000), true)
    run.child.kill('SIGHUP')
    const { code, signal, stdout } = await run.done
    assert.equal(signal, null)
    assert.equal(code, 1)
    assert.equal(stdout, '')
    assert.equal(await eventually(() => !running(), 3000), true)
  } finally {
    await model.close()
  }
})

test('SIGKILL of the agent, mid-walk and while starting: the supervisor ends the app', async (t) => {
  // No handler and no exit hook runs for a SIGKILL. The supervisor sees its
  // pipe from the agent close and ends its own group.
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  const model = await startModel(null)
  try {
    const run = runAgent({ url, baseUrl: model.baseUrl, start: fixtureCommand(port) })
    const early = await Promise.race([run.done, eventually(() => model.state.asked > 0, 120_000)])
    if (typeof early === 'object') {
      if (skipWithoutBrowser(t, early.envelope)) return
      assert.fail(`the agent ended before the model was asked: ${early.stderr}`)
    }
    assert.equal(early, true, 'the model was never asked')
    const group = groupOf(run.out.stderr)
    assert.ok(group !== null && groupAlive(group), 'the app is up while the walk runs')

    const sent = Date.now()
    run.child.kill('SIGKILL')
    assert.equal((await run.done).signal, 'SIGKILL')
    assert.equal(await eventually(() => !groupAlive(group), 5000), true, 'the group is empty')
    t.diagnostic(`the app's group was empty ${Date.now() - sent} ms after SIGKILL`)
    assert.equal(await answers(url, 2000), false)

    // The same while the app is still coming up, with a command that ignores SIGTERM.
    const marker = `walkthrough-sigkill-${port}`
    const starting = runAgent({ url, baseUrl: model.baseUrl, start: `trap '' TERM; sleep 60; echo ${marker}`, readySeconds: 60 })
    const running = () => execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' }).includes(marker)
    assert.equal(await eventually(running, 60_000), true)
    starting.child.kill('SIGKILL')
    await starting.done
    assert.equal(await eventually(() => !running(), 5000), true, 'the starting app is gone')
  } finally {
    await model.close()
  }
})

test('the supervisor exits as the command did, by code or by signal', async () => {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  const coded = await startApp({ command: 'exit 7', cwd: AGENT_DIR, url, readySeconds: 30 })
  assert.equal(coded.why, 'exited')
  assert.deepEqual(coded.exit, { code: 7, signal: null })
  const signalled = await startApp({ command: 'kill -KILL $$', cwd: AGENT_DIR, url, readySeconds: 30 })
  assert.equal(signalled.why, 'exited')
  assert.deepEqual(signalled.exit, { code: null, signal: 'SIGKILL' })
})

test('the wall-clock cap ends the walk with an envelope, and the app is gone', async (t) => {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  const model = await startModel(null)
  try {
    const { done } = runAgent({ url, baseUrl: model.baseUrl, start: fixtureCommand(port), timeoutSeconds: 25 })
    const { code, envelope, stderr } = await done
    if (skipWithoutBrowser(t, envelope)) return
    assert.equal(code, 0, stderr)
    assert.equal(envelope.status, 'done')
    assert.equal(envelope.summary, 'concerns: The walk stopped at its cap of 25 seconds before it reached a verdict.')
    assert.match(envelope.body, /The app was started by the start command and stopped when the walk ended\.$/)
    assert.equal(groupAlive(groupOf(stderr)), false)
    assert.equal(await answers(url, 2000), false)
  } finally {
    await model.close()
  }
})
