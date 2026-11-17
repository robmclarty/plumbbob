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
  checkDrift,
  outputTail,
  proofOf,
  quoteLine,
  startBlocked,
  withAppLine,
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
  snapshotOf,
  splitTabs,
  suppliedByAddress,
  walkEnvelope,
  withoutCredentials,
  withoutFrames,
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

test('walkEnvelope: anything short of a clean match is a concern under done', () => {
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
    start: undefined,
    readySeconds: 30,
    maxTurns: 30,
    timeoutSeconds: 240,
  })
  assert.equal(readConfig({ settings: { agentTimeout: 100, agent: {} } }).timeoutSeconds, 80)
  assert.equal(readConfig({ settings: { agent: { maxTurns: 12, timeoutSeconds: 60 } } }).maxTurns, 12)
  assert.equal(readConfig({ settings: { agent: { maxTurns: -1, timeoutSeconds: 'soon' } } }).timeoutSeconds, 240)
  assert.equal(readConfig({}).url, undefined)
  const started = readConfig({ settings: { agent: { start: ' npm run dev ', readySeconds: 5 } } })
  assert.equal(started.start, 'npm run dev')
  assert.equal(started.readySeconds, 5)
  assert.equal(readConfig({ settings: { agent: { start: '  ', readySeconds: 0 } } }).start, undefined)
  assert.equal(readConfig({ settings: { agent: { readySeconds: 0 } } }).readySeconds, 30)
})

const proof = 'typing a name and pressing Continue lands on a page headed "Welcome, Ada" that says you are signed in'
const seen = ['### Page\n- Page URL: http://127.0.0.1:4173/welcome\n```yaml\n- heading "Welcome, stranger" [level=1] [ref=e2]\n- paragraph [ref=e3]: You are signed in.\n```']

test('parseVerdict reads a drift and the two quotes under it', () => {
  assert.deepEqual(
    parseVerdict('VERDICT: DRIFT\nPROOF: lands on a page headed "Welcome, Ada"\nPAGE: heading "Welcome, stranger"\nIt greets a stranger.\nMore.'),
    {
      verdict: 'drift',
      prose: 'It greets a stranger.\nMore.',
      claim: { proof: 'lands on a page headed "Welcome, Ada"', page: 'heading "Welcome, stranger"' },
    }
  )
  assert.deepEqual(parseVerdict('verdict: drift\nIt is different.').claim, { proof: undefined, page: undefined })
  assert.deepEqual(parseVerdict('VERDICT: DRIFT\nPROOF:\npage:   x  y ').claim, { proof: undefined, page: 'x y' })
  // A match or a concern carries no claim, whatever lines follow it.
  assert.equal('claim' in parseVerdict('VERDICT: CONCERN\nPROOF: a\nPAGE: b'), false)
})

test('checkDrift accepts a claim only when both quotes are real', () => {
  assert.deepEqual(checkDrift({ proof: 'lands on a page headed "Welcome, Ada"', page: 'heading "Welcome, stranger"' }, proof, seen), {
    ok: true,
    proof: 'lands on a page headed "Welcome, Ada"',
    page: 'heading "Welcome, stranger"',
  })
  // Whitespace is the only slack, and one pair of wrapping quote marks comes off.
  assert.equal(checkDrift({ proof: '"lands  on a page\theaded "Welcome, Ada""', page: '`heading  "Welcome, stranger"  [level=1]`' }, proof, seen).ok, true)
  // A quote may run across a line break of the snapshot.
  assert.equal(checkDrift({ proof, page: '[ref=e2] - paragraph [ref=e3]: You are signed in.' }, proof, seen).ok, true)
})

test('checkDrift turns down every claim it cannot find', () => {
  const page = 'heading "Welcome, stranger"'
  const good = 'lands on a page headed "Welcome, Ada"'
  const cases = [
    [{ proof: undefined, page: undefined }, proof, seen, /quoted neither the proof nor a page/],
    [{ proof: undefined, page }, proof, seen, /gave no PROOF line/],
    [{ proof: good, page: undefined }, proof, seen, /gave no PAGE line/],
    [{ proof: 'lands on a page headed "Welcome, Bob"', page }, proof, seen, /PROOF quote is not in the step's proof/],
    [{ proof: 'Lands on a page headed "Welcome, Ada"', page }, proof, seen, /PROOF quote is not in the step's proof/],
    [{ proof: 'a page', page }, proof, seen, /PROOF quote is under 12 characters/],
    [{ proof: good, page: 'heading "Welcome, nobody"' }, proof, seen, /PAGE quote is in no page this walk showed it/],
    [{ proof: good, page: 'heading' }, proof, seen, /PAGE quote is under 8 characters/],
    [{ proof: good, page }, proof, [], /PAGE quote is in no page this walk showed it/],
    [{ proof: good, page }, undefined, seen, /the step names no proof to drift from/],
    [{ proof: good, page }, '   ', seen, /the step names no proof to drift from/],
  ]
  for (const [claim, text, pages, reason] of cases) {
    const result = checkDrift(claim, text, pages)
    assert.equal(result.ok, false, String(reason))
    assert.match(result.reason, reason)
  }
  // A short proof may be quoted whole.
  assert.equal(checkDrift({ proof: 'says hi', page }, 'says hi', seen).ok, true)
})

const RESULT = [
  '### Ran Playwright code',
  '```js',
  "await page.locator('#name').fill('typed by the model');",
  '```',
  '### Page',
  '- Page URL: http://127.0.0.1:4173/?headed=Welcome,Mallory',
  '- Page Title: Sign in to the app',
  '### Snapshot',
  '```yaml',
  '- generic [ref=e1]:',
  '  - heading "Sign in" [level=1] [ref=e2]',
  '  - iframe [ref=e3]:',
  '    - heading "Elsewhere heading" [level=1] [ref=f1e2]',
  '    - generic [ref=f1e3]:',
  '      - paragraph [ref=f1e4]: Deep in the frame.',
  '  - paragraph [ref=e4]: Below the frame.',
  '  - iframe [ref=e5]',
  '```',
  '### Events',
  '- New console entries: console.log#L1',
].join('\n')

test('snapshotOf keeps the accessibility tree and nothing the server wrote around it', () => {
  const tree = snapshotOf(RESULT)
  assert.equal(tree.split('\n')[0], '- generic [ref=e1]:')
  assert.equal(tree.split('\n').at(-1), '  - iframe [ref=e5]')
  assert.doesNotMatch(tree, /Page URL|Page Title|Sign in to the app|headed=|typed by the model|console|```/)
  // A result with no snapshot section is no page text at all.
  assert.equal(snapshotOf('### Page\n- Page URL: http://127.0.0.1:4173/\n- Page Title: Home'), '')
  assert.equal(snapshotOf(undefined), '')
})

test('withoutFrames cuts what is under a frame and keeps the page around it', () => {
  const { page, frames } = withoutFrames(RESULT)
  assert.equal(frames, 1)
  assert.doesNotMatch(page, /Elsewhere|Deep in the frame|f1e/)
  assert.match(page, /\n {2}- iframe \[ref=e3\]\n {2}- paragraph \[ref=e4\]: Below the frame\.\n {2}- iframe \[ref=e5\]\n```\n### Events\n/)
  assert.match(page, /- Page URL: http:\/\/127\.0\.0\.1:4173\//)
  // A page with no frame comes back as it was.
  assert.deepEqual(withoutFrames('- heading "home"\n  - text: hi'), { page: '- heading "home"\n  - text: hi', frames: 0 })
  // A frame that is the last thing in the tree takes everything under it.
  assert.equal(withoutFrames('- iframe [ref=e1]:\n  - text: inside\n    - text: deeper').page, '- iframe [ref=e1]')
})

test('suppliedByAddress lists every part of an address the model chose', () => {
  const parts = suppliedByAddress('/?headed=Welcome,%20Mallory&x=a+b#the%20end', 'http://127.0.0.1:4173/?headed=Welcome,%20Mallory&x=a+b#the%20end')
  for (const part of [
    '/?headed=Welcome,%20Mallory&x=a+b#the%20end',
    'http://127.0.0.1:4173/?headed=Welcome,%20Mallory&x=a+b#the%20end',
    'headed=Welcome,%20Mallory',
    'headed=Welcome, Mallory',
    'Welcome, Mallory',
    'a b',
    'the end',
  ]) {
    assert.ok(parts.includes(part), part)
  }
  assert.deepEqual(suppliedByAddress('/settings', 'http://127.0.0.1:4173/settings'), ['/settings', 'http://127.0.0.1:4173/settings'])
  // A query that does not decode is kept as it was sent.
  assert.ok(suppliedByAddress('/?q=%E0%A4%A', 'http://127.0.0.1:4173/?q=%E0%A4%A').includes('%E0%A4%A'))
})

test('checkDrift sets aside what the model typed or put in an address', () => {
  const good = 'lands on a page headed "Welcome, Ada"'
  const own = /PAGE quote holds text the model itself typed or put in an address/
  // The field echoes what was typed into it.
  const typed = ['- heading "Sign in" [level=1] [ref=e2]\n- textbox "Name" [active] [ref=e4]: the page is headed Welcome, Mallory']
  const said = ['the page is headed Welcome, Mallory']
  assert.equal(checkDrift({ proof: good, page: 'the page is headed Welcome, Mallory' }, proof, typed).ok, true, 'the hole, with nothing set aside')
  for (const page of [
    'the page is headed Welcome, Mallory',
    'headed Welcome, Mallory',
    'textbox "Name" [active] [ref=e4]: the page is headed Welcome, Mallory',
    'the page is headed welcome, mallory'.toUpperCase(),
  ]) {
    const result = checkDrift({ proof: good, page }, proof, typed, said)
    assert.equal(result.ok, false, page)
  }
  assert.match(checkDrift({ proof: good, page: 'headed Welcome, Mallory' }, proof, typed, said).reason, own)
  // The page prints its query back, decoded.
  const printed = ['- heading "Welcome, the page greets Mallory" [level=1] [ref=e2]']
  const address = suppliedByAddress('/welcome?name=the+page+greets+Mallory', 'http://127.0.0.1:4173/welcome?name=the+page+greets+Mallory')
  assert.match(checkDrift({ proof: good, page: 'the page greets Mallory' }, proof, printed, address).reason, own)
  // A snapshot escapes a quote mark, so the pieces either side of one are cut too.
  const escaped = ['- textbox "Name" [ref=e4]: "it says \\"Welcome, Mallory\\" here"']
  assert.match(checkDrift({ proof: good, page: 'Welcome, Mallory' }, proof, escaped, ['it says "Welcome, Mallory" here']).reason, own)
  // The page's own words still stand beside what was typed, and a short
  // string the model typed takes nothing out of the page.
  assert.equal(checkDrift({ proof: good, page: 'heading "Sign in"' }, proof, typed, said).ok, true)
  const greeted = ['- heading "Welcome, Bob" [level=1] [ref=e2]']
  assert.equal(checkDrift({ proof: good, page: 'heading "Welcome, Bob"' }, proof, greeted, ['Bob', '/welcome?name=Bob', 'name=Bob']).ok, true)
  // The same words on a page the model put nothing into are the page's own.
  assert.equal(checkDrift({ proof: good, page: 'heading "Welcome, stranger"' }, proof, [...typed, ...seen], said).ok, true)
})

test('walkEnvelope: a drift quoting the model\'s own typing is a concern', () => {
  const envelope = walkEnvelope(
    {
      finalText: 'VERDICT: DRIFT\nPROOF: lands on a page headed "Welcome, Ada"\nPAGE: the page is headed Welcome, Mallory\nIt greets Mallory.',
      ending: 'stop',
      actions: 1,
      refusals: [],
      proof,
      seen: ['- textbox "Name" [ref=e4]: the page is headed Welcome, Mallory'],
      supplied: ['the page is headed Welcome, Mallory'],
    },
    [],
    caps
  )
  assert.equal(envelope.status, 'done')
  assert.match(envelope.summary, /^concerns: /)
  assert.match(envelope.body, /not accepted: its PAGE quote holds text the model itself typed or put in an address, which is not the page's own\./)
})

test('walkEnvelope: an accepted drift is drift, with both quotes and the refine line', () => {
  const envelope = walkEnvelope(
    {
      finalText: 'VERDICT: DRIFT\nPROOF: lands on a page headed "Welcome, Ada"\nPAGE: heading "Welcome, stranger" [level=1]\nIt greets a stranger.',
      ending: 'stop',
      actions: 2,
      refusals: ['https://example.com/ is outside http://127.0.0.1:4173'],
      proof,
      seen,
    },
    [],
    caps
  )
  assert.equal(envelope.status, 'drift')
  assert.equal(envelope.summary, 'drift: It greets a stranger.')
  assert.equal(
    envelope.body,
    [
      'The proof says:',
      '',
      '    lands on a page headed "Welcome, Ada"',
      '',
      'A page showed:',
      '',
      '    heading "Welcome, stranger" [level=1]',
      '',
      "Both quotes were checked: the first is in the step's proof and the second is in a page this walk read. That they contradict each other is the model's claim, so read them.",
      '',
      'The fix is a refine of the plan (/plumbbob:refine), never a patch. If the app is wrong, the refine adds the step that mends it; if the proof is stale, the refine rewrites it.',
      '',
      '- Refused: https://example.com/ is outside http://127.0.0.1:4173.',
      '',
      '2 actions taken, 0 screenshots saved.',
    ].join('\n')
  )
})

test('walkEnvelope: a drift that fails the rule is done, with the claim as a concern', () => {
  const run = (finalText, over = {}) =>
    walkEnvelope({ finalText, ending: 'stop', actions: 1, refusals: [], proof, seen, ...over }, [], caps)

  const unseen = run('VERDICT: DRIFT\nPROOF: lands on a page headed "Welcome, Ada"\nPAGE: heading "Goodbye"\nIt says goodbye.')
  assert.equal(unseen.status, 'done')
  assert.equal(unseen.summary, 'concerns: It says goodbye.')
  assert.equal(
    unseen.body,
    [
      '- The model claimed drift and the claim was not accepted: its PAGE quote is in no page this walk showed it. It is reported as a concern.',
      '',
      'What it quoted as the proof:',
      '',
      '    lands on a page headed "Welcome, Ada"',
      '',
      'What it quoted as a page:',
      '',
      '    heading "Goodbye"',
      '',
      '1 action taken, 0 screenshots saved.',
    ].join('\n')
  )

  const bare = run('VERDICT: DRIFT')
  assert.equal(bare.status, 'done')
  assert.equal(bare.summary, 'concerns: The model claimed drift and the claim was not accepted: it quoted neither the proof nor a page. It is reported as a concern.')
  assert.doesNotMatch(bare.body, /What it quoted/)

  const noProof = run('VERDICT: DRIFT\nPROOF: anything at all here\nPAGE: heading "Welcome, stranger"\nDifferent.', { proof: undefined })
  assert.equal(noProof.status, 'done')
  assert.match(noProof.body, /the step names no proof to drift from/)

  // A page's text in a quote cannot break out of its block.
  const sly = run('VERDICT: DRIFT\nPROOF: lands on a page\nPAGE: ```\u0007 [x](http://evil.test) heading\nHm.')
  assert.match(sly.body, /\n {4}\[x\]\(http:\/\/evil\.test\) heading\n/)
  assert.equal(sly.body.includes('`') || sly.body.includes(String.fromCharCode(7)), false)
})

test('proofOf reads the proof prose, then doneWhen, then nothing', () => {
  assert.equal(proofOf({ step: { proof: { command: 'x', text: ' a ' }, doneWhen: 'b' } }), 'a')
  assert.equal(proofOf({ step: { proof: { command: 'x', text: '' }, doneWhen: 'b' } }), 'b')
  assert.equal(proofOf({ step: {} }), undefined)
  assert.equal(proofOf(undefined), undefined)
})

test('quoteLine keeps brackets and drops what could end a block', () => {
  assert.equal(quoteLine('heading "x"\n  [level=1] `<b>`\u0000'), 'heading "x" [level=1] <b>')
  assert.equal(quoteLine('y'.repeat(400)).length, 300)
})

test('withAppLine adds to the body of a walk and to the notes of a blocked one', () => {
  assert.equal(withAppLine({ status: 'done', body: '1 action taken.' }, 'The app was stopped.').body, '1 action taken.\n\nThe app was stopped.')
  assert.equal(withAppLine({ status: 'drift' }, 'The app was stopped.').body, 'The app was stopped.')
  assert.equal(withAppLine({ status: 'blocked', notes: 'npm install' }, 'The app was stopped.').notes, 'npm install\n\nThe app was stopped.')
})

test('outputTail keeps the last lines, with keys, colours and control characters out', () => {
  const key = 'sk-SECRET-OPENAI-123'
  const output = ['one', '', `\u001b[31mfailed\u001b[0m with ${key}`, 'bell\u0007 here', 'x'.repeat(300)].join('\n')
  const tail = outputTail(output, [key])
  assert.deepEqual(tail.slice(0, 3), ['one', 'failed with (key)', 'bell  here'])
  assert.equal(tail[3].length, 200)
  assert.deepEqual(outputTail(Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')).length, 12)
  assert.equal(outputTail(Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')).at(-1), 'line 39')
  // A head that was cut is a fragment, and may be half a key.
  assert.deepEqual(outputTail('CRET-123 tail of a key\nwhole line', [], true), ['whole line'])
  assert.deepEqual(outputTail(''), [])
})

test('startBlocked says what the start command did, and that a taken port looks like this', () => {
  const key = 'sk-SECRET-OPENAI-123'
  const about = { command: `KEY=${key} npm run dev`, url: 'http://127.0.0.1:4173/', readySeconds: 30, secrets: [key] }
  const never = startBlocked({ why: 'never-ready', tail: ['booting', 'still booting'], exit: null }, about)
  assert.equal(never.status, 'blocked')
  assert.equal(never.summary, 'walkthrough started the app and http://127.0.0.1:4173/ never answered, so no walk was run.')
  assert.equal(
    never.notes,
    'The start command (KEY=(key) npm run dev) ran for 30 seconds and nothing answered at http://127.0.0.1:4173/, so it was stopped. If another program already holds that port, the app could not bind to it and this is what that looks like: free the port, or fix agentConfig.walkthrough.url. A slow app needs a longer agentConfig.walkthrough.readySeconds. Its last output:\n  booting\n  still booting'
  )
  const exited = startBlocked({ why: 'exited', tail: [], exit: { code: 1, signal: null } }, about)
  assert.equal(exited.summary, 'walkthrough started the app and it stopped before http://127.0.0.1:4173/ answered, so no walk was run.')
  assert.match(exited.notes, /^The start command \(KEY=\(key\) npm run dev\) exited with code 1 before anything answered at /)
  assert.match(exited.notes, /If another program already holds that port.* It printed nothing\.$/)
  assert.match(startBlocked({ why: 'exited', tail: [], exit: { code: null, signal: 'SIGKILL' } }, about).notes, /was ended by SIGKILL before/)
  const spawn = startBlocked({ why: 'spawn', tail: [], exit: null, detail: 'spawn sh ENOENT' }, about)
  assert.equal(spawn.summary, 'walkthrough could not run its start command, so no walk was run.')
  assert.match(spawn.notes, /sh could not be started: spawn sh ENOENT\./)
  assert.doesNotMatch(JSON.stringify([never, exited, spawn]), /SECRET/)
})

test('startBlocked cuts a key out before it cuts the command to length', () => {
  const key = 'sk-SECRETSECRETSECRETSECRET-9999'
  // The key sits across the 200th character of the command.
  const command = `${'x'.repeat(185)} KEY=${key} npm start`
  const about = { command, url: 'http://127.0.0.1:4173/', readySeconds: 30, secrets: [key] }
  const never = startBlocked({ why: 'never-ready', tail: [], exit: null }, about)
  const spawn = startBlocked({ why: 'spawn', tail: [], exit: null, detail: `${'y'.repeat(190)} ${key} was refused` }, about)
  assert.doesNotMatch(JSON.stringify([never, spawn]), /SECRET|sk-S/)
  assert.match(never.notes, /KEY=\(key\)/)
  assert.match(spawn.notes, /y \(key\)/)
  // A key holding what a quoted line squashes is still a whole match.
  const spaced = 'sk-SECRET  WITH `ticks`'
  assert.doesNotMatch(
    startBlocked({ why: 'never-ready', tail: [], exit: null }, { ...about, command: `KEY='${spaced}' npm start`, secrets: [spaced] }).notes,
    /SECRET|ticks/
  )
})
