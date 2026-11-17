/**
 * The walk, offline: the real Playwright MCP server and a real browser against
 * the fixture app, with a scripted engine standing in for the model. fascicle's
 * `make_loop_engine` keeps the real tool loop and plays the turns written
 * here, so the five tools run exactly as they would under a model.
 *
 * With no browser installed each case skips and says how to install one.
 */

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs'
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
async function scripted(turns, { evidenceDir = 'evidence/2', agent = {}, beforeTool = {}, afterGenerate, beforeShot } = {}) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'walkthrough-')))
  // `beforeShot` holds the browser's own screenshot back, after the walk has
  // read the page and before the picture is taken: the gap a page can leave in.
  const client = beforeShot
    ? async (...args) => {
        const server = await mcp_client(...args)
        const tools = server.tools.map((tool) =>
          tool.name === 'browser_take_screenshot'
            ? {
                ...tool,
                execute: async (input, ...rest) => {
                  await beforeShot(input, cwd)
                  const out = await tool.execute(input, ...rest)
                  await beforeShot.after?.(input, cwd)
                  return out
                },
              }
            : tool
        )
        return { tools, close: () => server.close() }
      }
    : mcp_client
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
      { engine: model, call: { provider: 'loop', model: 'loop' }, mcp_client: client, define_tool: held, z },
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
      // Long enough that the navigate is read back and photographed first.
      [{ name: 'navigate', input: { url: '/delayed?ms=4000' } }],
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

test('a page that leaves between the read and the screenshot: that one picture is deleted', async (t) => {
  // The walk reads /delayed on the origin, then the browser's screenshot is
  // held until the page has left, so the picture taken is of the other site.
  const left = leftTheOrigin()
  const written = []
  const beforeShot = async (input) => {
    if (/delayed/.test(input.filename)) await left()
  }
  beforeShot.after = (input, cwd) => {
    if (/delayed/.test(input.filename)) written.push(existsSync(join(cwd, input.filename)))
  }
  const { envelope, cwd, requests, lines } = await scripted(
    [[{ name: 'navigate', input: { url: '/delayed?ms=1500' } }], 'VERDICT: MATCH\nThe page is there.'],
    { beforeShot }
  )
  if (skipWithoutBrowser(t, envelope)) return

  // The picture was really taken and really on disk for a moment.
  assert.deepEqual(written, [true])
  // It is gone, it is not evidence, and nothing else in the folder was touched.
  assert.deepEqual(readdirSync(join(cwd, 'evidence/2')), ['01-start.png'])
  assert.deepEqual(
    envelope.evidence.map((e) => e.path),
    ['evidence/2/01-start.png']
  )
  assert.ok(lines.some((line) => /^deleted 02-navigate-delayed\.png: the page left/.test(line)))
  // The model is told, and is shown the start page, never the other one.
  const results = toolResults(requests)
  assert.match(results[0], /^Refused: that took the browser outside http:\/\/127\.0\.0\.1:\d+\. It is back on /)
  assert.match(results[0], /heading "Sign in"/)
  assert.doesNotMatch(results.join('\n'), /Elsewhere/)
  assert.equal(envelope.status, 'done')
  assert.match(envelope.summary, /^concerns: Refused: the page went to http:\/\/localhost:\d+\/elsewhere, outside/)
  assert.match(
    envelope.body,
    /- Refused: the screenshot 02-navigate-delayed\.png was taken as the page left http:\/\/127\.0\.0\.1:\d+, so it was deleted\./
  )
})

test('a screenshot the model asks for is deleted the same way, and an earlier file is left alone', async (t) => {
  const left = leftTheOrigin()
  const beforeShot = async (input) => {
    if (/shot-the-delayed-page/.test(input.filename)) await left()
  }
  const { envelope, cwd, requests } = await scripted(
    [
      [{ name: 'navigate', input: { url: '/delayed?ms=4000' } }],
      [{ name: 'take_screenshot', input: { caption: 'the delayed page' } }],
      'VERDICT: MATCH\nThe page is there.',
    ],
    { beforeShot }
  )
  if (skipWithoutBrowser(t, envelope)) return

  assert.deepEqual(readdirSync(join(cwd, 'evidence/2')).sort(), ['01-start.png', '02-navigate-delayed.png'])
  assert.deepEqual(
    envelope.evidence.map((e) => e.path),
    ['evidence/2/01-start.png', 'evidence/2/02-navigate-delayed.png']
  )
  assert.match(toolResults(requests)[1], /^Refused: that took the browser outside/)
  assert.match(envelope.body, /the screenshot 03-shot-the-delayed-page\.png was taken as the page left/)
})

test('a walk that ends off its origin is a concern, whatever the model said', async (t) => {
  const { envelope } = await scripted(
    [[{ name: 'navigate', input: { url: '/delayed?ms=4000' } }], 'VERDICT: MATCH\nThe page is there.'],
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

test('a drift the model can back with both quotes is drift, with the quotes side by side', async (t) => {
  const { envelope } = await scripted([
    [{ name: 'navigate', input: { url: '/welcome' } }],
    [
      'VERDICT: DRIFT',
      'PROOF: lands on a page headed "Welcome, Ada"',
      'PAGE: heading "Welcome, stranger"',
      'The welcome page greets a stranger, not Ada.',
    ].join('\n'),
  ])
  if (skipWithoutBrowser(t, envelope)) return

  assert.equal(envelope.status, 'drift')
  assert.equal(envelope.summary, 'drift: The welcome page greets a stranger, not Ada.')
  assert.match(
    envelope.body,
    /^The proof says:\n\n {4}lands on a page headed "Welcome, Ada"\n\nA page showed:\n\n {4}heading "Welcome, stranger"\n\n/
  )
  assert.match(envelope.body, /The fix is a refine of the plan \(\/plumbbob:refine\), never a patch\./)
  assert.match(envelope.body, /1 action taken, 2 screenshots saved\.$/)
  assert.equal(envelope.evidence.length, 2)
})

test('a model cannot produce drift from a page it never saw', async (t) => {
  // "Welcome, stranger" is what /welcome says, and this walk never opens it.
  const unseen = await scripted([
    ['VERDICT: DRIFT', 'PROOF: lands on a page headed "Welcome, Ada"', 'PAGE: heading "Welcome, stranger"', 'It greets a stranger.'].join('\n'),
  ])
  if (skipWithoutBrowser(t, unseen.envelope)) return
  assert.equal(unseen.envelope.status, 'done')
  assert.equal(unseen.envelope.summary, 'concerns: It greets a stranger.')
  assert.match(
    unseen.envelope.body,
    /- The model claimed drift and the claim was not accepted: its PAGE quote is in no page this walk showed it\. It is reported as a concern\./
  )
  assert.match(unseen.envelope.body, /What it quoted as a page:\n\n {4}heading "Welcome, stranger"/)

  // Nor from a page the walk kept from it: the other origin's tab is open in
  // the browser and its title is never shown, so quoting it does not stand.
  const hidden = await scripted([
    [{ name: 'navigate', input: { url: '/opens-tab' } }],
    [{ name: 'click', input: { element: 'Open the other site', ref: '#tab' } }],
    ['VERDICT: DRIFT', 'PROOF: lands on a page headed "Welcome, Ada"', 'PAGE: Elsewhere title', 'Another site opened.'].join('\n'),
  ])
  assert.equal(hidden.envelope.status, 'done')
  assert.match(hidden.envelope.body, /its PAGE quote is in no page this walk showed it/)
})

test('a drift cannot rest on words the model put there itself', async (t) => {
  const claim = (page) =>
    ['VERDICT: DRIFT', 'PROOF: lands on a page headed "Welcome, Ada"', `PAGE: ${page}`, 'It greets Mallory.'].join('\n')
  const own = /not accepted: its PAGE quote holds text the model itself typed or put in an address, which is not the page's own\./
  const nowhere = /not accepted: its PAGE quote is in no page this walk showed it\./

  // Typed into the field and never sent: the snapshot echoes the field.
  const typed = await scripted([
    [{ name: 'type', input: { element: 'Name field', ref: '#name', text: 'the page is headed Welcome, Mallory' } }],
    claim('the page is headed Welcome, Mallory'),
  ])
  if (skipWithoutBrowser(t, typed.envelope)) return
  assert.match(toolResults(typed.requests)[0], /the page is headed Welcome, Mallory/, 'the field does echo it')
  assert.equal(typed.envelope.status, 'done')
  assert.match(typed.envelope.body, own)

  // Put in an address the app ignores: it is on the address line and nowhere on the page.
  const query = await scripted([[{ name: 'navigate', input: { url: '/?headed=Welcome,Mallory' } }], claim('headed=Welcome,Mallory')])
  assert.match(toolResults(query.requests)[0], /Page URL: \S*headed=Welcome,Mallory/, 'the address line does carry it')
  assert.equal(query.envelope.status, 'done')
  assert.match(query.envelope.body, nowhere)

  // Put in an address the app prints back.
  const printed = await scripted([
    [{ name: 'navigate', input: { url: '/welcome?name=nobody+at+all+signed+in' } }],
    claim('nobody at all signed in'),
  ])
  assert.match(toolResults(printed.requests)[0], /heading "Welcome, nobody at all signed in"/)
  assert.equal(printed.envelope.status, 'done')
  assert.match(printed.envelope.body, own)

  // What the server writes above every page is not a page's text.
  for (const line of ['- Page URL:', '- Page Title: Sign in']) {
    const boilerplate = await scripted([claim(line)])
    assert.equal(boilerplate.envelope.status, 'done', line)
    assert.match(boilerplate.envelope.body, nowhere)
  }
})

test('what is inside a frame is never shown to the model, and cannot be quoted', async (t) => {
  const { envelope, requests, lines } = await scripted([
    [{ name: 'navigate', input: { url: '/framed' } }],
    [{ name: 'snapshot', input: {} }],
    ['VERDICT: DRIFT', 'PROOF: lands on a page headed "Welcome, Ada"', 'PAGE: heading "Elsewhere heading"', 'Another site is on the page.'].join('\n'),
  ])
  if (skipWithoutBrowser(t, envelope)) return

  const results = toolResults(requests)
  // The page around the frame is read, and the frame is there as a line.
  assert.match(results[1], /heading "Framed"/)
  assert.match(results[1], /- iframe \[ref=\w+\]\n/)
  assert.match(results[1], /Below the frame\./)
  assert.doesNotMatch(JSON.stringify(requests.at(-1).messages), /Elsewhere/)
  assert.equal(envelope.status, 'done')
  assert.match(envelope.body, /not accepted: its PAGE quote is in no page this walk showed it\./)
  assert.equal(lines.filter((line) => /what is inside a frame is not shown to the model/.test(line)).length, 1)
})

test('a screenshot whose call fails after the file was written is deleted', async (t) => {
  // The browser writes the picture, then the call is cut off: what a stop or
  // the wall-clock cap does to a screenshot already on its way.
  const written = []
  const beforeShot = async () => {}
  beforeShot.after = (input, cwd) => {
    if (!/navigate-welcome/.test(input.filename)) return
    written.push(existsSync(join(cwd, input.filename)))
    throw new Error('the call was stopped')
  }
  const { envelope, cwd, lines } = await scripted(
    [[{ name: 'navigate', input: { url: '/welcome' } }], 'VERDICT: MATCH\nThe page is there.'],
    { beforeShot }
  )
  if (skipWithoutBrowser(t, envelope)) return

  assert.deepEqual(written, [true])
  assert.deepEqual(readdirSync(join(cwd, 'evidence/2')), ['01-start.png'])
  assert.deepEqual(
    envelope.evidence.map((e) => e.path),
    ['evidence/2/01-start.png']
  )
  assert.ok(lines.some((line) => /^could not save 02-navigate-welcome\.png \(the call was stopped\)/.test(line)), lines.join('\n'))
})

test('a drift whose proof quote is not in the proof is a concern', async (t) => {
  const { envelope } = await scripted([
    [{ name: 'navigate', input: { url: '/welcome' } }],
    ['VERDICT: DRIFT', 'PROOF: the page must greet Ada by her full name', 'PAGE: heading "Welcome, stranger"', 'It greets a stranger.'].join('\n'),
  ])
  if (skipWithoutBrowser(t, envelope)) return
  assert.equal(envelope.status, 'done')
  assert.match(envelope.summary, /^concerns: It greets a stranger\./)
  assert.match(envelope.body, /not accepted: its PROOF quote is not in the step's proof\./)
})
