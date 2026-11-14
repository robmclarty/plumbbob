/**
 * The pure parts, with no browser and no model: the origin guard, filename
 * choice, evidence building and verdict mapping.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  blockedEnvelope,
  browserInstallLine,
  buildEvidence,
  capSnapshot,
  guardNavigate,
  hasCredentials,
  isAuthFailure,
  isBrowserMissing,
  nextShotIndex,
  onOrigin,
  oneLine,
  pageUrlOf,
  parseStartUrl,
  parseVerdict,
  readConfig,
  safeEvidenceDir,
  scrub,
  shotName,
  slugOf,
  splitTabs,
  walkEnvelope,
  withoutCredentials,
} from '../lib.mjs'

const start = parseStartUrl('http://127.0.0.1:4173/app')
const caps = { maxTurns: 30, timeoutSeconds: 240 }

test('parseStartUrl takes http and https and nothing else', () => {
  assert.deepEqual(start, { url: 'http://127.0.0.1:4173/app', origin: 'http://127.0.0.1:4173' })
  assert.equal(parseStartUrl('https://example.test/x')?.origin, 'https://example.test')
  assert.equal(parseStartUrl('file:///etc/passwd'), null)
  assert.equal(parseStartUrl('javascript:alert(1)'), null)
  assert.equal(parseStartUrl('not a url'), null)
  assert.equal(parseStartUrl(undefined), null)
})

test('a start url with a username or password is refused, and printed without them', () => {
  for (const url of ['http://user:pass@127.0.0.1:4173/', 'https://user@example.test/x', 'http://:pass@example.test/']) {
    assert.equal(parseStartUrl(url), null, url)
    assert.equal(hasCredentials(url), true, url)
    assert.doesNotMatch(withoutCredentials(url), /user|pass|@/, url)
  }
  assert.equal(hasCredentials('http://127.0.0.1:4173/a@b'), false)
  assert.equal(hasCredentials('not a url'), false)
  assert.equal(withoutCredentials('http://user:pass@127.0.0.1:4173/app?x=1'), 'http://127.0.0.1:4173/app?x=1')
  assert.equal(withoutCredentials('http://127.0.0.1:4173/app'), 'http://127.0.0.1:4173/app')
  assert.equal(withoutCredentials('//user:pass@host/x'), '//host/x')
  assert.equal(withoutCredentials('not a url'), 'not a url')
})

test('guardNavigate allows the configured origin, relative or absolute', () => {
  assert.deepEqual(guardNavigate('/settings', start), { ok: true, url: 'http://127.0.0.1:4173/settings' })
  assert.deepEqual(guardNavigate('http://127.0.0.1:4173/a?b=1', start), {
    ok: true,
    url: 'http://127.0.0.1:4173/a?b=1',
  })
})

test('guardNavigate refuses every other origin and scheme', () => {
  for (const url of [
    'https://example.com/',
    'http://localhost:4173/',
    'http://127.0.0.1:4174/',
    'https://127.0.0.1:4173/',
    '//example.com/x',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,hi',
    'http://127.0.0.1:4173@example.com/',
  ]) {
    const result = guardNavigate(url, start)
    assert.equal(result.ok, false, url)
    assert.match(result.reason, /outside http:\/\/127\.0\.0\.1:4173/, url)
  }
  assert.equal(guardNavigate('', start).ok, false)
  assert.equal(guardNavigate(undefined, start).ok, false)
})

test('guardNavigate refuses credentials and a blob address on the configured origin', () => {
  for (const url of ['http://u:p@127.0.0.1:4173/', 'http://u@127.0.0.1:4173/settings', 'http://:p@127.0.0.1:4173/']) {
    const result = guardNavigate(url, start)
    assert.equal(result.ok, false, url)
    assert.match(result.reason, /was asked for with a username or password; this walk sends none$/, url)
    assert.doesNotMatch(result.reason, /u:p|u@|:p@/, url)
  }
  const blob = guardNavigate('blob:http://127.0.0.1:4173/abc', start)
  assert.equal(blob.ok, false)
  assert.match(blob.reason, /^blob:http:\/\/127\.0\.0\.1:4173\/abc is not an http or https address/)
  // Another origin is refused as before, and its credentials are not echoed.
  const elsewhere = guardNavigate('http://u:p@example.com/', start)
  assert.equal(elsewhere.reason, 'http://example.com/ is outside http://127.0.0.1:4173; this walk stays on that origin')
})

test('splitTabs takes the tab list out and names every tab outside the origin', () => {
  const pageText = '### Page\n- Page URL: http://127.0.0.1:4173/app\n### Snapshot\n```yaml\n- heading "home"\n```'
  assert.deepEqual(splitTabs(pageText, start), { page: pageText, offOrigin: [] })

  const tabs = [
    '### Open tabs',
    '- 0: (current) [home](http://127.0.0.1:4173/app)',
    '- 1: [OFF](http://localhost:4173/secret)',
    '- 2: [same origin](http://127.0.0.1:4173/help)',
  ].join('\n')
  const split = splitTabs(`${tabs}\n${pageText}`, start)
  assert.equal(split.page, pageText)
  assert.deepEqual(split.offOrigin, ['http://localhost:4173/secret'])
  assert.equal(pageUrlOf(split.page), 'http://127.0.0.1:4173/app')

  // A title and an address may both hold "](": no way of splitting the line hides the tab.
  const forged = '### Open tabs\n- 1: [a](http://127.0.0.1:4173/x](http://evil.test/y](http://127.0.0.1:4173/z)\n### Page'
  assert.deepEqual(splitTabs(forged, start), { page: '### Page', offOrigin: ['http://evil.test/y](http://127.0.0.1:4173/z'] })
  // A tab line with no address counts as outside.
  assert.equal(splitTabs('### Open tabs\n- 1: about:blank\n### Page', start).offOrigin.length, 1)
})

test('scrub cuts a key out of any text, and leaves a short placeholder alone', () => {
  assert.equal(scrub('sent Bearer sk-SECRET-123 and sk-SECRET-123', ['sk-SECRET-123']), 'sent Bearer (key) and (key)')
  assert.equal(scrub('none of this changes', ['none', undefined, '']), 'none of this changes')
  assert.equal(scrub('nothing to cut'), 'nothing to cut')
})

test('isAuthFailure knows a refused key from any other provider error', () => {
  assert.equal(isAuthFailure(Object.assign(new Error('x'), { kind: 'provider_auth_error' })), true)
  assert.equal(isAuthFailure(Object.assign(new Error('x'), { status: 403 })), true)
  assert.equal(isAuthFailure(new Error('openai authentication failed (401): bad key')), true)
  assert.equal(isAuthFailure(new Error('anthropic API error 403: no access')), true)
  assert.equal(isAuthFailure(new Error('openai API error 404: no such model')), false)
  assert.equal(isAuthFailure(new Error('fetch failed')), false)
})

test('pageUrlOf and onOrigin read where the browser is', () => {
  const snapshot = '### Page\n- Page URL: http://127.0.0.1:4173/welcome?name=Ada\n### Snapshot\n```yaml\n```'
  assert.equal(pageUrlOf(snapshot), 'http://127.0.0.1:4173/welcome?name=Ada')
  assert.equal(onOrigin(pageUrlOf(snapshot), start), true)
  assert.equal(onOrigin('http://localhost:4173/', start), false)
  assert.equal(onOrigin('chrome-error://chromewebdata/', start), false)
  assert.equal(onOrigin(pageUrlOf('no address here'), start), false)
})

test('slugOf and shotName keep a filename to letters, digits and hyphens', () => {
  assert.equal(slugOf('click "Continue" button'), 'click-continue-button')
  assert.equal(slugOf('../../etc/passwd'), 'etc-passwd')
  assert.equal(slugOf('  '), 'page')
  assert.equal(slugOf('a'.repeat(80)).length, 40)
  assert.equal(shotName(1, 'start'), '01-start.png')
  assert.equal(shotName(12, 'navigate /a/b'), '12-navigate-a-b.png')
  assert.match(shotName(3, 'x/../../y\u0000`<z>'), /^03-[a-z0-9-]+\.png$/)
})

test('nextShotIndex starts after what the folder already holds', () => {
  assert.equal(nextShotIndex([]), 1)
  assert.equal(nextShotIndex(['01-start.png', '04-click-continue.png', 'notes.txt']), 5)
})

test('safeEvidenceDir takes a plain path from the repo root only', () => {
  assert.equal(safeEvidenceDir('.plumbbob/builds/b/evidence/3'), '.plumbbob/builds/b/evidence/3')
  assert.equal(safeEvidenceDir('.plumbbob/builds/b/evidence/3/'), '.plumbbob/builds/b/evidence/3')
  assert.equal(safeEvidenceDir('/tmp/evidence'), null)
  assert.equal(safeEvidenceDir('a/../../b'), null)
  assert.equal(safeEvidenceDir(''), null)
  assert.equal(safeEvidenceDir(undefined), null)
})

test('buildEvidence names only the files that are on disk', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'walkthrough-lib-'))
  mkdirSync(join(cwd, 'ev/2'), { recursive: true })
  writeFileSync(join(cwd, 'ev/2/01-start.png'), 'png')
  writeFileSync(join(cwd, 'ev/2/03-empty.png'), '')
  const shots = [
    { name: '01-start.png', caption: 'the page the walk opened on' },
    { name: '02-never-written.png', caption: 'gone' },
    { name: '03-empty.png', caption: 'empty' },
  ]
  assert.deepEqual(buildEvidence(cwd, 'ev/2', shots), [
    { path: 'ev/2/01-start.png', caption: 'the page the walk opened on' },
  ])
  assert.deepEqual(buildEvidence(cwd, null, shots), [])
})

test('oneLine flattens untrusted text for a caption', () => {
  assert.equal(oneLine('after clicking `Save`\n<b>[now]</b>'), 'after clicking Save bnow/b')
  assert.equal(oneLine('x'.repeat(200)).length, 80)
})

test('capSnapshot cuts a long page and says so', () => {
  assert.equal(capSnapshot('short'), 'short')
  assert.match(capSnapshot('x'.repeat(30_000)), /the snapshot was cut at 20000 characters\)$/)
})

test('parseVerdict reads the verdict line wherever it sits', () => {
  assert.deepEqual(parseVerdict('VERDICT: MATCH\nThe page greets Ada.'), {
    verdict: 'match',
    prose: 'The page greets Ada.',
  })
  assert.equal(parseVerdict('Some thinking.\nverdict: concern\nNo heading.').verdict, 'concern')
  assert.deepEqual(parseVerdict('It all looked fine to me.'), { verdict: 'none', prose: 'It all looked fine to me.' })
  assert.equal(parseVerdict(undefined).verdict, 'none')
})

test('walkEnvelope: a clean match is done, with the evidence', () => {
  const evidence = [{ path: 'ev/2/01-start.png', caption: 'the page the walk opened on' }]
  const envelope = walkEnvelope(
    { finalText: 'VERDICT: MATCH\nThe page greets Ada.', ending: 'stop', actions: 2, refusals: [] },
    evidence,
    caps
  )
  assert.equal(envelope.status, 'done')
  assert.equal(envelope.summary, 'match: The page greets Ada.')
  assert.deepEqual(envelope.evidence, evidence)
  assert.match(envelope.body, /2 actions taken, 1 screenshot saved\./)
})

test('walkEnvelope: anything short of a clean match is a concern under done, never drift', () => {
  const cases = [
    [{ finalText: 'VERDICT: CONCERN\nNo welcome heading.', ending: 'stop', actions: 1, refusals: [] }, /^concerns: No welcome heading\./],
    [{ finalText: 'Looks fine.', ending: 'stop', actions: 1, refusals: [] }, /^concerns: The model ended the walk without a VERDICT line\./],
    [{ finalText: '', ending: 'turns', actions: 9, refusals: [] }, /^concerns: The walk stopped at its cap of 30 turns/],
    [{ finalText: '', ending: 'time', actions: 4, refusals: [] }, /^concerns: The walk stopped at its cap of 240 seconds/],
    [
      { finalText: 'VERDICT: MATCH\nAll good.', ending: 'stop', actions: 1, refusals: ['https://example.com/ is outside http://127.0.0.1:4173'] },
      /^concerns: Refused: https:\/\/example\.com\//,
    ],
  ]
  for (const [walk, summary] of cases) {
    const envelope = walkEnvelope(walk, [], caps)
    assert.equal(envelope.status, 'done')
    assert.match(envelope.summary, summary)
    assert.equal('evidence' in envelope, false)
    assert.equal('parked' in envelope, false)
  }
})

test('blockedEnvelope carries the fix in notes', () => {
  assert.deepEqual(blockedEnvelope('no walk', 'start the app'), {
    contract: 1,
    status: 'blocked',
    summary: 'no walk',
    notes: 'start the app',
  })
})

test('a missing browser is told apart from a page that would not load', () => {
  const missing =
    'Error: Browser "firefox" is not installed; expected executable at /x. Run `npx @playwright/mcp install-browser firefox` to install'
  assert.equal(isBrowserMissing(missing), true)
  assert.equal(isBrowserMissing("Failed to launch chromium because executable doesn't exist at /x"), true)
  // The default: Playwright's `chrome` channel, when the system has no Chrome.
  const noChrome =
    "async initializeServer: Chromium distribution 'chrome' is not found at /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\nRun \"npx playwright install chrome\""
  const noEdge = "Chromium distribution 'msedge' is not found at /Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  assert.equal(isBrowserMissing(noChrome), true)
  assert.equal(isBrowserMissing(noEdge), true)
  assert.match(browserInstallLine(noChrome, '/a'), /install-browser chrome$/)
  assert.match(browserInstallLine(noEdge, '/a'), /install-browser msedge$/)
  assert.equal(isBrowserMissing('net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1/'), false)
  assert.equal(browserInstallLine(missing, '/agents/walkthrough'), 'cd "/agents/walkthrough" && npx @playwright/mcp install-browser firefox')
  assert.match(browserInstallLine('no name', '/a'), /install-browser chrome$/)
})

test('readConfig resolves the caps, and stays under an armed agentTimeout', () => {
  const base = { settings: { agentTimeout: 0, agent: { url: ' http://localhost:3000 ', provider: 'ollama', model: 'm' } } }
  assert.deepEqual(readConfig(base), {
    url: 'http://localhost:3000',
    provider: 'ollama',
    model: 'm',
    baseUrl: undefined,
    browser: undefined,
    maxTurns: 30,
    timeoutSeconds: 240,
  })
  assert.equal(readConfig({ settings: { agentTimeout: 100, agent: {} } }).timeoutSeconds, 80)
  assert.equal(readConfig({ settings: { agent: { maxTurns: 12, timeoutSeconds: 60 } } }).maxTurns, 12)
  assert.equal(readConfig({ settings: { agent: { maxTurns: -1, timeoutSeconds: 'soon' } } }).timeoutSeconds, 240)
  assert.equal(readConfig({}).url, undefined)
})
