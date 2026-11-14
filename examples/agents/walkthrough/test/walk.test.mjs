/**
 * The walk, offline: the real Playwright MCP server and a real browser against
 * the fixture app, with a scripted engine standing in for the model. fascicle's
 * `make_loop_engine` keeps the real tool loop and plays the turns written
 * here, so the five tools run exactly as they would under a model.
 *
 * With no browser installed each case skips and says how to install one.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'

import { define_tool } from 'fascicle'
import { mcp_client } from 'fascicle/mcp'
import { make_loop_engine } from 'fascicle/testing'
import { z } from 'zod'

import { startFixture } from '../fixture/app.mjs'
import { parseStartUrl, readConfig } from '../lib.mjs'
import { MCP_TOOLS, mcpArgs, walk } from '../walk.mjs'

const AGENT_DIR = dirname(import.meta.dirname)
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

let fixture
before(async () => {
  fixture = await startFixture()
})
after(async () => {
  await fixture.close()
})

/**
 * Runs one scripted walk against the fixture in a fresh working directory and
 * returns the envelope, the directory, and what the model was sent.
 */
async function scripted(turns, { evidenceDir = 'evidence/2', agent = {}, beforeTool = {}, afterGenerate } = {}) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'walkthrough-')))
  const { engine, requests } = make_loop_engine(turns)
  // `beforeTool` holds one tool back until the test says go, and
  // `afterGenerate` holds the walk's last step back the same way. Neither
  // changes what the tool or the model does.
  const held = (spec) =>
    define_tool(
      beforeTool[spec.name]
        ? { ...spec, execute: async (...args) => (await beforeTool[spec.name](), spec.execute(...args)) }
        : spec
    )
  const model = afterGenerate
    ? { generate: async (opts) => { const result = await engine.generate(opts); await afterGenerate(); return result } }
    : engine
  const ctx = {
    contract: 1,
    step: {
      n: 2,
      title: 'Greet the person by name',
      proof: { command: null, text: 'signing in as Ada lands on a page headed "Welcome, Ada"' },
      ...(evidenceDir ? { evidenceDir } : {}),
    },
    settings: { agent: { url: fixture.url, provider: 'loop', model: 'loop', ...agent } },
  }
  const config = readConfig(ctx)
  const lines = []
  try {
    const envelope = await walk(
      { engine: model, call: { provider: 'loop', model: 'loop' }, mcp_client, define_tool: held, z },
      { ctx, config, start: parseStartUrl(config.url), cwd, agentDir: AGENT_DIR, log: (line) => lines.push(line) }
    )
    return { envelope, cwd, requests, lines }
  } finally {
    await engine.dispose()
  }
}

/**
 * Skips the test when the envelope says there is no browser to drive.
 */
function skipWithoutBrowser(t, envelope) {
  if (envelope.status !== 'blocked' || !/no browser to drive/.test(envelope.summary)) return false
  t.skip(`no browser installed for Playwright MCP. ${envelope.notes}`)
  return true
}

/**
 * Waits until the fixture has answered `/elsewhere` under its other loopback
 * name once more than it had when this was built: the page left the origin.
 */
function leftTheOrigin() {
  const seen = () => fixture.requests.filter((line) => line.startsWith('localhost') && line.endsWith(' /elsewhere')).length
  const before = seen()
  return async () => {
    for (let tries = 0; tries < 300 && seen() === before; tries += 1) await new Promise((r) => setTimeout(r, 50))
    assert.ok(seen() > before, 'the page never left for the other origin')
    // The request was answered; give the browser a moment to commit the page.
    await new Promise((r) => setTimeout(r, 250))
  }
}

/**
 * The text of every tool result the model was sent, in order.
 */
function toolResults(requests) {
  const last = requests.at(-1)?.messages ?? []
  return last.filter((m) => m.role === 'tool').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
}

test('the agent connects five Playwright tools and runs the server headless and isolated', () => {
  assert.deepEqual(MCP_TOOLS, [
    'browser_navigate',
    'browser_snapshot',
    'browser_click',
    'browser_type',
    'browser_take_screenshot',
  ])
  assert.deepEqual(mcpArgs({}, '/tmp/scratch'), [
    '--headless',
    '--isolated',
    '--image-responses',
    'omit',
    '--snapshot-mode',
    'none',
    '--output-dir',
    '/tmp/scratch',
  ])
  assert.deepEqual(mcpArgs({ browser: 'firefox' }, '/tmp/scratch').slice(-2), ['--browser', 'firefox'])
})

test('a walk that matches: done, with a screenshot after each action', async (t) => {
  const { envelope, cwd, requests } = await scripted([
    [{ name: 'type', input: { element: 'Name field', ref: '#name', text: 'Ada' } }],
    [{ name: 'click', input: { element: 'Continue button', ref: '#continue' } }],
    [{ name: 'take_screenshot', input: { caption: 'the welcome page' } }],
    'VERDICT: MATCH\nSigning in as Ada lands on a page headed "Welcome, Ada".',
  ])
  if (skipWithoutBrowser(t, envelope)) return

  assert.equal(envelope.status, 'done')
  assert.equal(envelope.summary, 'match: Signing in as Ada lands on a page headed "Welcome, Ada".')
  assert.deepEqual(
    envelope.evidence.map((e) => e.path),
    [
      'evidence/2/01-start.png',
      'evidence/2/02-type-name-field.png',
      'evidence/2/03-click-continue-button.png',
      'evidence/2/04-shot-the-welcome-page.png',
    ]
  )
  assert.deepEqual(
    envelope.evidence.map((e) => e.caption),
    ['the page the walk opened on', 'after typing into Name field', 'after clicking Continue button', 'the welcome page']
  )
  for (const { path } of envelope.evidence) {
    assert.deepEqual(readFileSync(join(cwd, path)).subarray(0, 4), PNG_MAGIC, path)
  }
  // Nothing but the evidence folder is written under the working directory.
  assert.deepEqual(readdirSync(cwd), ['evidence'])

  // The model's first sight of the app is the text snapshot, inline.
  const prompt = JSON.stringify(requests[0].messages)
  assert.match(prompt, /heading \\"Sign in\\"/)
  assert.match(prompt, /--- page \(untrusted\) ---/)
  // It is offered five tools, and none of them runs code.
  assert.deepEqual(
    requests[0].tools.map((tool) => tool.name),
    ['navigate', 'snapshot', 'click', 'type', 'take_screenshot']
  )
  // The click's result is the next page, as text.
  assert.match(toolResults(requests)[1], /heading "Welcome, Ada"/)
})

test('a walk held to its origin: a navigate elsewhere and a link out are both refused', async (t) => {
  const { envelope, requests } = await scripted([
    [{ name: 'navigate', input: { url: 'https://example.com/' } }],
    [{ name: 'navigate', input: { url: '/welcome?name=Ada' } }],
    [{ name: 'click', input: { element: 'Leave this site', ref: '#leave' } }],
    [{ name: 'snapshot', input: {} }],
    'VERDICT: MATCH\nThe page greets Ada.',
  ])
  if (skipWithoutBrowser(t, envelope)) return

  const results = toolResults(requests)
  assert.match(results[0], /^Refused: https:\/\/example\.com\/ is outside http:\/\/127\.0\.0\.1:\d+/)
  assert.match(results[1], /heading "Welcome, Ada"/)
  // The click left the origin: the model is told, and is shown the start page, never the other one.
  assert.match(results[2], /^Refused: that took the browser outside http:\/\/127\.0\.0\.1:\d+\. It is back on /)
  assert.match(results[2], /heading "Sign in"/)
  assert.match(results[3], /heading "Sign in"/)

  // A refusal keeps a MATCH from reading as clean.
  assert.equal(envelope.status, 'done')
  assert.match(envelope.summary, /^concerns: Refused: https:\/\/example\.com\/ is outside/)
  assert.match(envelope.body, /- Refused: the page went to .* so the walk went back to http:\/\/127\.0\.0\.1:\d+\//)
  assert.match(envelope.body, /What the model said:\n\nThe page greets Ada\./)
})

test('a page that leaves on a timer is never photographed, and the walk is a concern', async (t) => {
  const { envelope, requests } = await scripted(
    [
      [{ name: 'navigate', input: { url: '/delayed' } }],
      [{ name: 'take_screenshot', input: { caption: 'the delayed page' } }],
      'VERDICT: MATCH\nThe page is there.',
    ],
    { beforeTool: { take_screenshot: leftTheOrigin() } }
  )
  if (skipWithoutBrowser(t, envelope)) return

  const results = toolResults(requests)
  // The navigate was read back while the page was still on the origin.
  assert.match(results[0], /heading "Delayed"/)
  // By the screenshot it had left: no picture, the refusal, and the start page.
  assert.match(results[1], /^Refused: that took the browser outside http:\/\/127\.0\.0\.1:\d+\. It is back on /)
  assert.match(results[1], /heading "Sign in"/)
  assert.doesNotMatch(results.join('\n'), /Elsewhere/)
  assert.deepEqual(
    envelope.evidence.map((e) => e.path),
    ['evidence/2/01-start.png', 'evidence/2/02-navigate-delayed.png']
  )
  assert.equal(envelope.status, 'done')
  assert.match(envelope.summary, /^concerns: Refused: the page went to http:\/\/localhost:\d+\/elsewhere, outside/)
})

test('a walk that ends off its origin is a concern, whatever the model said', async (t) => {
  const { envelope } = await scripted(
    [[{ name: 'navigate', input: { url: '/delayed' } }], 'VERDICT: MATCH\nThe page is there.'],
    { afterGenerate: leftTheOrigin() }
  )
  if (skipWithoutBrowser(t, envelope)) return

  assert.equal(envelope.status, 'done')
  assert.match(envelope.summary, /^concerns: Refused: the page went to http:\/\/localhost:\d+\/elsewhere, outside/)
  assert.match(envelope.body, /What the model said:\n\nThe page is there\./)
})

test('a tab opened on another origin is kept from the model and recorded', async (t) => {
  const { envelope, requests } = await scripted([
    [{ name: 'navigate', input: { url: '/opens-tab' } }],
    [{ name: 'click', input: { element: 'Open the other site', ref: '#tab' } }],
    [{ name: 'snapshot', input: {} }],
    [{ name: 'navigate', input: { url: '/welcome?name=Ada' } }],
    'VERDICT: MATCH\nThe page greets Ada.',
  ])
  if (skipWithoutBrowser(t, envelope)) return

  const results = toolResults(requests)
  assert.equal(results.length, 4)
  assert.match(results[3], /heading "Welcome, Ada"/)
  // The tab list and the other page's title never reach the model. (Its
  // address does, as the link's own target on the page that holds it.)
  assert.doesNotMatch(results.join('\n'), /Open tabs|Elsewhere/)
  assert.equal(envelope.status, 'done')
  assert.match(envelope.summary, /^concerns: Refused: a page opened http:\/\/localhost:\d+\/elsewhere in another tab, outside/)
  // The tab is recorded once, however many results listed it.
  assert.equal(envelope.body.match(/in another tab/g).length, 1)
})

test('a key in a provider error never reaches the envelope or the log', async (t) => {
  const key = 'sk-SECRET-OPENAI-123'
  const run = async (error, keyEnv) => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'walkthrough-')))
    const ctx = { contract: 1, step: { n: 1, title: 't' }, settings: { agent: { url: fixture.url } } }
    const config = readConfig(ctx)
    const lines = []
    const engine = { generate: async () => { throw error } }
    const envelope = await walk(
      { engine, call: { provider: 'openai', model: 'm' }, mcp_client, define_tool, z },
      { ctx, config, start: parseStartUrl(config.url), cwd, agentDir: AGENT_DIR, log: (line) => lines.push(line), secrets: [key], keyEnv }
    )
    return { envelope, lines }
  }

  const other = await run(new Error(`openai API error 500: upstream said Bearer ${key} twice, ${key}`), 'OPENAI_API_KEY')
  if (skipWithoutBrowser(t, other.envelope)) return
  assert.equal(other.envelope.status, 'blocked')
  assert.match(other.envelope.notes, /upstream said Bearer \(key\) twice, \(key\)\. Check the provider/)
  assert.doesNotMatch(JSON.stringify(other), /SECRET/)

  // A refused key: the provider's own words are dropped for the variable's name.
  const refused = Object.assign(new Error(`openai authentication failed (401): bad key, you sent Bearer ${key}: check providers.openai.api_key`), {
    kind: 'provider_auth_error',
  })
  const auth = await run(refused, 'OPENAI_API_KEY')
  assert.equal(auth.envelope.notes, 'The provider refused the key. Check OPENAI_API_KEY, then run the agent again.')
  assert.doesNotMatch(JSON.stringify(auth), /SECRET|providers\.openai/)

  const forbidden = await run(new Error(`anthropic API error 403: no access for ${key}`), undefined)
  assert.equal(
    forbidden.envelope.notes,
    'The provider refused the key. Check the key this provider reads from the environment, then run the agent again.'
  )
})

test('with no evidence folder the walk saves nothing and returns no evidence', async (t) => {
  const { envelope, cwd, requests } = await scripted(
    [
      [{ name: 'take_screenshot', input: { caption: 'the form' } }],
      'VERDICT: CONCERN\nThe form has no password field.',
    ],
    { evidenceDir: null }
  )
  if (skipWithoutBrowser(t, envelope)) return

  assert.equal(envelope.status, 'done')
  assert.equal(envelope.summary, 'concerns: The form has no password field.')
  assert.equal('evidence' in envelope, false)
  assert.deepEqual(readdirSync(cwd), [])
  assert.equal(toolResults(requests)[0], 'This step has no evidence folder, so nothing was saved.')
})

test('a second walk numbers on from the first and leaves its files alone', async (t) => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'walkthrough-')))
  mkdirSync(join(cwd, 'evidence/2'), { recursive: true })
  writeFileSync(join(cwd, 'evidence/2/03-earlier.png'), 'kept')
  const { engine } = make_loop_engine(['VERDICT: MATCH\nThe form is there.'])
  const ctx = { contract: 1, step: { n: 2, title: 't', evidenceDir: 'evidence/2' }, settings: { agent: { url: fixture.url } } }
  const config = readConfig(ctx)
  const envelope = await walk(
    { engine, call: { provider: 'loop', model: 'loop' }, mcp_client, define_tool, z },
    { ctx, config, start: parseStartUrl(config.url), cwd, agentDir: AGENT_DIR, log: () => {} }
  )
  await engine.dispose()
  if (skipWithoutBrowser(t, envelope)) return

  assert.deepEqual(envelope.evidence, [{ path: 'evidence/2/04-start.png', caption: 'the page the walk opened on' }])
  assert.equal(readFileSync(join(cwd, 'evidence/2/03-earlier.png'), 'utf8'), 'kept')
})

test('the turn cap ends the walk as a concern under done', async (t) => {
  const { envelope } = await scripted(
    [
      [{ name: 'navigate', input: { url: '/welcome?name=Ada' } }],
      [{ name: 'navigate', input: { url: '/' } }],
      'VERDICT: MATCH\nnever reached',
    ],
    { agent: { maxTurns: 2 } }
  )
  if (skipWithoutBrowser(t, envelope)) return

  assert.equal(envelope.status, 'done')
  assert.match(envelope.summary, /^concerns: The walk stopped at its cap of 2 turns/)
  // Two turns: the first navigate ran, the second was asked for and never run.
  assert.deepEqual(
    envelope.evidence.map((e) => e.path),
    ['evidence/2/01-start.png', 'evidence/2/02-navigate-welcome.png']
  )
})

test('an app that does not answer is blocked, and the browser is closed', async () => {
  const dead = await startFixture()
  await dead.close()
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'walkthrough-')))
  const { engine, requests } = make_loop_engine(['VERDICT: MATCH\nnever reached'])
  const ctx = { contract: 1, step: { n: 1, title: 't' }, settings: { agent: { url: dead.url } } }
  const config = readConfig(ctx)
  const envelope = await walk(
    { engine, call: { provider: 'loop', model: 'loop' }, mcp_client, define_tool, z },
    { ctx, config, start: parseStartUrl(config.url), cwd, agentDir: AGENT_DIR, log: () => {} }
  )
  await engine.dispose()

  assert.equal(envelope.status, 'blocked')
  assert.equal(requests.length, 0)
  assert.ok(envelope.notes.length > 0)
})
