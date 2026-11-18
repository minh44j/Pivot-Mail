// End-to-end test of the desktop app: real Electron, real web app, real sign-in code (test/server.mts), pretend Google.
// Run: (cd ../web && npx tsx ../desktop/test/server.mts &) ; xvfb-run -a node test/e2e.cjs
const { _electron } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const http = require('node:http')

const D = path.resolve(__dirname, '..')
const BASE = 'http://localhost:4310'
let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n) }
const raw = (url, o = {}) => new Promise((res, rej) => {
  const u = new URL(url)
  const r = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: o.method || 'GET', headers: o.headers || {} }, (resp) => { let b = ''; resp.on('data', (c) => (b += c)); resp.on('end', () => res({ status: resp.statusCode, headers: resp.headers, body: b })) })
  r.on('error', rej); if (o.body) r.write(o.body); r.end()
})
/** Plays the person's normal browser: start → Google (pretend) → callback → the hand-back page. Returns the ticket. */
async function browserSignIn(startUrl, email = 'ann@pivotscl.com') {
  const s = await raw(startUrl)
  const g = new URL(s.headers.location)
  const oauth = (s.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('pm_oauth='))
  await raw(BASE + '/__test/claims', { method: 'POST', body: JSON.stringify({ iss: 'https://accounts.google.com', aud: g.searchParams.get('client_id'), exp: Math.floor(Date.now() / 1000) + 600, nonce: g.searchParams.get('nonce'), email, email_verified: true, hd: 'pivotscl.com', name: 'Ann Lee' }) })
  const cb = await raw(`${BASE}/api/auth/google/callback?code=x&state=${g.searchParams.get('state')}`, { headers: { cookie: oauth } })
  return { location: cb.headers.location || '', ticket: decodeURIComponent((/#t=([^&]+)/.exec(cb.headers.location || '') || [])[1] || '') }
}

;(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'))
  const launch = (env) => _electron.launch({ executablePath: require(path.join(D, 'node_modules', 'electron')), args: ['--no-sandbox', D], cwd: D, env: { ...process.env, ...env } })
  const app = await launch({ PIVOT_MAIL_URL: BASE, PIVOT_MAIL_USER_DATA: userData })
  await app.evaluate(({ shell, dialog, BrowserWindow }) => {
    global.__opened = []; global.__dialogs = []; global.__overlay = []; global.__drags = []
    shell.openExternal = async (u) => { global.__opened.push(u) }
    dialog.showMessageBox = async (_w, o) => { global.__dialogs.push(o && o.message); return { response: 0 } }
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.si', { timeout: 20000 })
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setOverlayIcon = (img, desc) => global.__overlay.push(img ? desc : null)
    w.webContents.startDrag = (item) => global.__drags.push(item)
  })
  const opened = () => app.evaluate(() => global.__opened)

  // ---- the page itself is locked down
  ok('D1 the web page gets only the small bridge: no Node, no require, no process', await win.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined' && JSON.stringify(Object.keys(window.pivotDesktop).sort()) === JSON.stringify(['chooseCompany', 'setBadge', 'startDrag', 'version'])))

  // ---- sign-in goes to the browser, not into the window
  await win.getByRole('link', { name: /Pivot Shipping/ }).click({ noWaitAfter: true }); await win.waitForTimeout(800)
  const startUrl = (await opened()).find((u) => u.includes('/api/auth/start')) || ''
  ok('D2 "Continue with Google" opens the normal browser (Google refuses sign-in inside app windows)', !!startUrl && win.url().startsWith(BASE))
  ok('D3 ...carrying only the hash of the app\'s secret, and the company', /[?&]desktop=[A-Za-z0-9_-]{43}(&|$)/.test(startUrl) && /[?&]company=scl/.test(startUrl))

  // a forged ticket is refused, and the window stays signed out
  const bad = 'pivotmail://auth?t=' + encodeURIComponent('eyJmYWtlIjoxfQ.bad')
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), bad); await win.waitForTimeout(1500)
  ok('D4 a forged ticket does not sign the app in', (await win.evaluate(async () => (await fetch('/api/auth/session')).status)) === 401)

  // the real thing
  await win.getByRole('link', { name: /Pivot Shipping/ }).click({ noWaitAfter: true }); await win.waitForTimeout(800)
  const start2 = (await opened()).filter((u) => u.includes('/api/auth/start')).pop()
  const { location, ticket } = await browserSignIn(start2)
  ok('D5 the browser finishes on the hand-back page with a ticket', location.startsWith('/desktop-signed-in.html#t=') && ticket.length > 20)
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), 'pivotmail://auth?t=' + encodeURIComponent(ticket))
  await win.waitForTimeout(2500)
  const s = await win.evaluate(async () => { const r = await fetch('/api/auth/session'); return { status: r.status, body: await r.json() } })
  ok('D6 the app window is signed in as that person', s.status === 200 && s.body.user && s.body.user.email === 'ann@pivotscl.com')
  ok('D7 ...and shows Pivot Mail (the welcome screen for a person with no mailbox yet)', (await win.getByRole('heading', { name: /Welcome, Ann/ }).count()) === 1)

  // the same link again, after it was used: refused politely, nothing changes
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), 'pivotmail://auth?t=' + encodeURIComponent(ticket)); await win.waitForTimeout(800)
  ok('D8 a hand-back link the app did not ask for (or used twice) is ignored, with a short note', (await app.evaluate(() => global.__dialogs)).includes('Please sign in again'))

  // ---- links to other sites open in the browser
  await win.evaluate(() => { location.href = 'https://example.com/some-page' }); await win.waitForTimeout(600)
  ok('D9 a link to another website opens in the normal browser; the app stays put', (await opened()).includes('https://example.com/some-page') && win.url().startsWith(BASE))
  await win.evaluate(() => { location.href = '/api/accounts/connect?company=scl&kind=personal' }); await win.waitForTimeout(600)
  ok('D10 "Add account" (Google permission) also opens in the browser', (await opened()).some((u) => u.includes('/api/accounts/connect?company=scl')) && win.url().startsWith(BASE))

  // ---- taskbar number
  await win.evaluate(() => window.pivotDesktop.setBadge(7)); await win.waitForTimeout(200)
  await win.evaluate(() => window.pivotDesktop.setBadge(0)); await win.waitForTimeout(200)
  const ov = await app.evaluate(() => global.__overlay)
  console.log('   overlay calls:', JSON.stringify(ov))
  ok('D11 the unread number goes on the taskbar icon, and clears at 0', ov.includes('7 unread') && ov[ov.length - 1] === null && ov.indexOf('7 unread') < ov.length - 1)

  // ---- dragging attachments out
  await win.evaluate(() => window.pivotDesktop.startDrag([{ name: '..\\..\\Windows\\evil.exe', mime: 'application/octet-stream', bytes: new Uint8Array([104, 105]) }, { name: 'rates Q4.pdf', mime: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) }]))
  await win.waitForTimeout(400)
  const drag = (await app.evaluate(() => global.__drags))[0]
  const files = drag ? drag.files || [drag.file] : []
  ok('D12 dragging hands Windows real files with the right content', files.length === 2 && fs.readFileSync(files[0], 'utf8') === 'hi' && fs.readFileSync(files[1]).subarray(0, 4).toString() === '%PDF')
  ok('D13 ...a hostile file name cannot escape the temporary folder', path.dirname(files[0]) === path.dirname(files[1]) && !files[0].includes('..') && path.basename(files[0]).includes('evil.exe') && files[0].startsWith(os.tmpdir()))

  // ---- closing keeps it in the tray
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()); await new Promise((r) => setTimeout(r, 500))
  const st = await app.evaluate(({ BrowserWindow }) => ({ n: BrowserWindow.getAllWindows().length, visible: BrowserWindow.getAllWindows()[0] && BrowserWindow.getAllWindows()[0].isVisible() }))
  ok('D14 closing the window keeps Pivot Mail running (hidden, still checking mail)', st.n === 1 && st.visible === false)
  await app.evaluate(({ app }) => { app.emit('before-quit'); app.quit() }).catch(() => {})
  await app.close().catch(() => {})

  // ---- first run without a company: the chooser
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'))
  const app2 = await launch({ PIVOT_MAIL_URL: '', PIVOT_MAIL_USER_DATA: fresh })
  const w2 = await app2.firstWindow()
  await w2.waitForSelector('button[data-co]', { timeout: 15000 })
  ok('D15 first run asks which company (two choices)', (await w2.locator('button[data-co]').count()) === 2 && (await w2.locator('h1').innerText()).includes('Welcome to Pivot Mail'))
  await app2.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.webContents.loadURL = (u) => { global.__loaded = u; return Promise.resolve() } })
  await w2.locator('button[data-co="tmc"]').click(); await w2.waitForTimeout(500)
  ok('D16 choosing Pivot Travel Management opens mail.pivottmc.com and remembers it', (await app2.evaluate(() => global.__loaded)) === 'https://mail.pivottmc.com' && JSON.parse(fs.readFileSync(path.join(fresh, 'settings.json'), 'utf8')).company === 'tmc')
  await app2.evaluate(({ app }) => { app.emit('before-quit'); app.quit() }).catch(() => {})
  await app2.close().catch(() => {})

  console.log(`${pass} pass, ${fail} fail`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
