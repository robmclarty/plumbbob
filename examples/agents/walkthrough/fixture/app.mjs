/**
 * A two-page app for the walkthrough agent to walk: a sign-in form, and the
 * welcome page it leads to. Node's http server and nothing else.
 *
 * Run it by hand with `node fixture/app.mjs [port]`, or import `startFixture`
 * from a test. The welcome page carries a link to the same server under its
 * other loopback name, which is a different origin, so the origin guard has
 * something to refuse with no network at all.
 *
 * Three more pages exist for the tests and are linked from nowhere: `/delayed`
 * leaves for the other origin on a timer, `/opens-tab` holds a link that
 * opens the other origin's `/elsewhere` in a new tab, and `/framed` holds the
 * other origin's `/elsewhere` in a frame.
 */

import { createServer } from 'node:http'

/**
 * Escapes text for an HTML page.
 */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/**
 * Wraps a page body in the shared shell.
 */
function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font: 16px/1.5 system-ui; max-width: 32rem; margin: 3rem auto">
${body}
</body>
</html>
`
}

/**
 * The same server under its other loopback name: `localhost` for `127.0.0.1`
 * and the reverse.
 */
function otherOrigin(host) {
  const [name, port] = String(host ?? '127.0.0.1').split(':')
  return `http://${name === 'localhost' ? '127.0.0.1' : 'localhost'}${port ? `:${port}` : ''}/`
}

/**
 * Answers one request: `/` is the form, `/welcome` greets the name it was
 * given, `/delayed`, `/opens-tab`, `/framed` and `/elsewhere` are the test pages, and
 * anything else is a 404.
 */
function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://fixture.invalid')
  res.setHeader('content-type', 'text/html; charset=utf-8')
  if (url.pathname === '/delayed') {
    const ms = Number(url.searchParams.get('ms')) || 300
    const away = `${otherOrigin(req.headers.host)}elsewhere`
    res.end(
      page(
        'Delayed',
        `<h1>Delayed</h1>
<p>This page leaves in a moment.</p>
<script>setTimeout(() => { location.href = ${JSON.stringify(away)} }, ${ms})</script>`
      )
    )
    return
  }
  if (url.pathname === '/opens-tab') {
    res.end(
      page(
        'Opens a tab',
        `<h1>Opens a tab</h1>
<p><a id="tab" target="_blank" href="${escapeHtml(otherOrigin(req.headers.host))}elsewhere">Open the other site</a></p>`
      )
    )
    return
  }
  if (url.pathname === '/framed') {
    res.end(
      page(
        'Framed',
        `<h1>Framed</h1>
<iframe id="frame" title="The other site" src="${escapeHtml(otherOrigin(req.headers.host))}elsewhere"></iframe>
<p id="below">Below the frame.</p>`
      )
    )
    return
  }
  if (url.pathname === '/elsewhere') {
    res.end(page('Elsewhere title', '<h1>Elsewhere heading</h1>'))
    return
  }
  if (url.pathname === '/') {
    res.end(
      page(
        'Sign in',
        `<h1>Sign in</h1>
<form action="/welcome" method="get">
  <label for="name">Name</label>
  <input id="name" name="name" autocomplete="off">
  <button id="continue" type="submit">Continue</button>
</form>`
      )
    )
    return
  }
  if (url.pathname === '/welcome') {
    const name = url.searchParams.get('name')?.trim() || 'stranger'
    res.end(
      page(
        'Welcome',
        `<h1>Welcome, ${escapeHtml(name)}</h1>
<p id="status">You are signed in.</p>
<p><a id="back" href="/">Sign out</a></p>
<p><a id="leave" href="${escapeHtml(otherOrigin(req.headers.host))}">Leave this site</a></p>`
      )
    )
    return
  }
  res.statusCode = 404
  res.end(page('Not found', '<h1>Not found</h1>'))
}

/**
 * Starts the fixture on a loopback port (a free one when `port` is 0) and
 * resolves to `{ url, requests, close }`, where `requests` grows by one
 * `<host> <path>` line for every request the server answers.
 */
export function startFixture(port = 0) {
  const requests = []
  const server = createServer((req, res) => {
    requests.push(`${req.headers.host} ${req.url}`)
    handle(req, res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        requests,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections()
            server.close(() => done())
          }),
      })
    })
  })
}

if (import.meta.main) {
  const { url } = await startFixture(Number(process.argv[2] ?? 4173))
  process.stderr.write(`fixture: listening at ${url}\n`)
}
