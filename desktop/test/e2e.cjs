// End-to-end test of the desktop app: real Electron, real web app, real sign-in code (test/server.mts), pretend Google.
// Run: (cd ../web && npx tsx ../desktop/test/server.mts &) ; xvfb-run -a node test/e2e.cjs
// On Windows (GitHub Actions) the same test runs against the packaged app: PIVOT_MAIL_EXE="release/win-unpacked/Pivot Mail.exe".
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
  const EXE = process.env.PIVOT_MAIL_EXE ? path.resolve(D, process.env.PIVOT_MAIL_EXE) : null
  // Linux test machines run as root, where Chromium's sandbox cannot start; Windows keeps it on.
  const flags = process.platform === 'linux' ? ['--no-sandbox'] : []
  const launch = (env) => _electron.launch({ executablePath: EXE ?? require(path.join(D, 'node_modules', 'electron')), args: EXE ? flags : [...flags, D], cwd: D, env: { ...process.env, ...env } })
  console.log(`   running ${EXE ? 'the packaged app ' + EXE : 'from source'} on ${process.platform}`)
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
  ok('D1 the web page gets only the small bridge: no Node, no require, no process', await win.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined' && JSON.stringify(Object.keys(window.pivotDesktop).sort()) === JSON.stringify(['chooseCompany', 'setBadge', 'show', 'startDrag', 'store', 'version'])))

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
  // Any website can open a pivotmail:// link: a bogus one arriving now must not spoil the real sign-in under way.
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), 'pivotmail://auth?t=bogus.ticket'); await win.waitForTimeout(1200)
  const { location, ticket } = await browserSignIn(start2)
  ok('D5 the browser finishes on the hand-back page with a ticket', location.startsWith('/desktop-signed-in.html#t=') && ticket.length > 20)
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), 'pivotmail://auth?t=' + encodeURIComponent(ticket))
  await win.waitForTimeout(2500)
  const s = await win.evaluate(async () => { const r = await fetch('/api/auth/session'); return { status: r.status, body: await r.json() } })
  ok('D6 the app window is signed in as that person (even after a bogus link arrived mid-way)', s.status === 200 && s.body.user && s.body.user.email === 'ann@pivotscl.com')
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
  ok('D13 ...a hostile file name cannot escape the temporary folder', path.dirname(files[0]) === path.dirname(files[1]) && !files[0].includes('..') && path.basename(files[0]).includes('evil.exe') && path.basename(path.dirname(files[0])).startsWith('pivot-mail-'))

  // ---- alerts
  ok('D26 Windows alerts are allowed without asking (no "allow notifications" prompt in the app)', (await win.evaluate(() => Notification.permission)) === 'granted')
  const noteErr = await win.evaluate(() => { try { const n = new Notification('Maersk Line', { body: 'Arrival notice MSKU7654321' }); n.close(); return null } catch (e) { return String(e) } })
  ok('D27 an alert can be raised from the mail page', noteErr === null, noteErr)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide()); await win.waitForTimeout(300)
  await win.evaluate(() => window.pivotDesktop.show()); await win.waitForTimeout(500)
  ok('D28 clicking an alert brings the window back out of the tray', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()))

  // ---- the local mail database
  const mk = (id, acc, date, extra = {}) => ({ id, threadId: id, accountId: acc, folder: 'inbox', labels: [], from: { name: 'Maersk Line', email: 'notify@maersk.com' }, to: [{ name: 'Ann', email: 'ann@pivotscl.com' }], subject: 'Hello', body: '', date, unread: true, flagged: false, attachments: [], ...extra })
  const st0 = await win.evaluate(async (msgs) => {
    const s = window.pivotDesktop.store
    await s.save(msgs)
    return { load: (await s.load('acc1')).map((m) => m.id), other: (await s.load('acc2')).map((m) => m.id) }
  }, [
    mk('m1', 'acc1', '2026-11-01T08:00:00Z', { subject: 'Arrival notice', body: 'Container MSKU1234567 arrived at Jeddah Islamic Port.', loaded: true, attachments: [{ name: 'DO-4471.pdf' }] }),
    mk('m2', 'acc1', '2026-11-10T08:00:00Z', { subject: 'Rate request Riyadh', snippet: 'please quote' }),
    mk('m3', 'acc2', '2026-11-12T08:00:00Z', { subject: 'Jeddah booking', body: 'Jeddah' }),
  ])
  ok('D17 mail saved on this computer comes back per mailbox, newest first', JSON.stringify(st0.load) === '["m2","m1"]' && JSON.stringify(st0.other) === '["m3"]')
  const q = (accs, text) => win.evaluate(async ([a, t]) => (await window.pivotDesktop.store.search(a, t)).map((m) => m.id), [accs, text])
  ok('D18 instant search finds words in the body, by their beginning ("jedd" → Jeddah), only in the mailboxes asked', JSON.stringify(await q(['acc1'], 'jedd')) === '["m1"]' && JSON.stringify(await q(['acc1', 'acc2'], 'jeddah')) === '["m3","m1"]')
  ok('D19 ...also container numbers, sender, attachment names; every word must match', JSON.stringify(await q(['acc1'], 'MSKU1234567')) === '["m1"]' && (await q(['acc1'], 'maersk')).length === 2 && JSON.stringify(await q(['acc1'], 'DO-4471')) === '["m1"]' && (await q(['acc1'], 'jeddah riyadh')).length === 0)
  const odd = await win.evaluate(async () => { try { const s = window.pivotDesktop.store; return [await s.search(['acc1'], 'from:maersk'), await s.search(['acc1'], '"* NEAR( ^col: )'), await s.search(['acc1'], '')].map((r) => r.length) } catch (e) { return String(e) } })
  ok('D20 Gmail-style operators and stray symbols never break search (left to Gmail)', JSON.stringify(odd) === '[0,0,0]')
  await win.evaluate(async (m) => window.pivotDesktop.store.save([m]), mk('m1', 'acc1', '2026-11-01T08:00:00Z', { subject: 'Arrival notice', folder: 'archive', unread: false }))
  const m1 = await win.evaluate(async () => (await window.pivotDesktop.store.load('acc1')).find((m) => m.id === 'm1'))
  const light = await win.evaluate(async () => (await window.pivotDesktop.store.load('acc1')).find((m) => m.id === 'm1'))
  const conv = await win.evaluate(async () => window.pivotDesktop.store.thread('acc1', 'm1'))
  ok('D29 the list gets a light copy (preview, no full HTML), opening gets the complete message from this computer', light && light.loaded === false && light.body.length <= 400 && !('html' in light) && conv.length === 1 && conv[0].loaded === true && conv[0].body.includes('MSKU1234567'))
  ok('D21 a quick list refresh updates read/folder but keeps the full message already stored (and still findable)', m1 && m1.folder === 'archive' && m1.unread === false && m1.body.includes('MSKU1234567') && JSON.stringify(await q(['acc1'], 'msku')) === '["m1"]')
  const big = await win.evaluate(async () => {
    const s = window.pivotDesktop.store
    const words = ['invoice', 'container', 'booking', 'customs', 'clearance', 'freight', 'Dammam', 'Riyadh', 'quotation', 'manifest']
    const msgs = Array.from({ length: 5000 }, (_, i) => ({ id: 'b' + i, threadId: 'b' + i, accountId: 'acc3', folder: 'inbox', labels: [], from: { name: 'Sender ' + i, email: `s${i}@example.com` }, to: [], subject: `${words[i % 10]} ${i}`, body: `${words[(i * 7) % 10]} reference PSC-${100000 + i} ${'lorem ipsum '.repeat(40)}`, date: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString(), unread: false, flagged: false, attachments: [], loaded: true }))
    const t0 = performance.now(); await s.save(msgs); const saveMs = performance.now() - t0
    const t1 = performance.now(); const hits = await s.search(['acc3'], 'PSC-104321'); const searchMs = performance.now() - t1
    const t2 = performance.now(); const many = await s.search(['acc3'], 'customs'); const manyMs = performance.now() - t2
    return { saveMs, searchMs, manyMs, hits: hits.map((m) => m.id), many: many.length }
  })
  console.log('   5,000 messages: save %d ms, exact search %d ms, broad search %d ms', Math.round(big.saveMs), Math.round(big.searchMs), Math.round(big.manyMs))
  ok('D22 5,000 messages: a reference number is found instantly (well under a quarter second)', JSON.stringify(big.hits) === '["b4321"]' && big.searchMs < 250 && big.many === 300 && big.manyMs < 500)
  await win.evaluate(async () => { await window.pivotDesktop.store.clearAccount('acc3'); await window.pivotDesktop.store.setMeta('hist:acc1', '999') })

  // ---- two attachments with the same name, and names Windows reserves
  await win.evaluate(() => window.pivotDesktop.startDrag([{ name: 'invoice.pdf', mime: 'application/pdf', bytes: new Uint8Array([49]) }, { name: 'invoice.pdf', mime: 'application/pdf', bytes: new Uint8Array([50]) }, { name: 'CON.txt', mime: 'text/plain', bytes: new Uint8Array([51]) }, { name: 'image001.png. ', mime: 'image/png', bytes: new Uint8Array([52]) }]))
  await win.waitForTimeout(400)
  const d2 = (await app.evaluate(() => global.__drags)).pop()
  const f2 = d2 ? d2.files || [d2.file] : []
  const names2 = f2.map((f) => path.basename(f))
  console.log('   dragged names:', JSON.stringify(names2))
  ok('D30 two attachments with the same name both arrive ("invoice (2).pdf"); Windows-reserved names are made safe', f2.length === 4 && names2[0] === 'invoice.pdf' && names2[1] === 'invoice (2).pdf' && fs.readFileSync(f2[1], 'utf8') === '2' && names2[2] === '_CON.txt' && names2[3] === 'image001.png')

  // ---- a Pivot Mail address that redirects to another site never shows that site in the app window
  await win.evaluate(() => { location.href = '/__test/redirect' }); await win.waitForTimeout(1200)
  ok('D31 a redirect to another website opens in the normal browser; the app window stays on Pivot Mail', (await opened()).includes('https://example.com/landed-elsewhere') && win.url().startsWith(BASE))

  // ---- closing keeps it in the tray
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()); await new Promise((r) => setTimeout(r, 500))
  const st = await app.evaluate(({ BrowserWindow }) => ({ n: BrowserWindow.getAllWindows().length, visible: BrowserWindow.getAllWindows()[0] && BrowserWindow.getAllWindows()[0].isVisible() }))
  ok('D14 closing the window keeps Pivot Mail running (hidden, still checking mail)', st.n === 1 && st.visible === false)
  await app.evaluate(({ app }) => { app.emit('before-quit'); app.quit() }).catch(() => {})
  await app.close().catch(() => {})

  ok('D32 copies of dragged attachments are deleted when the app quits', f2.length > 0 && !fs.existsSync(path.dirname(f2[0])) && !fs.existsSync(path.dirname(files[0])))

  // ---- the database survives a restart, and sign-out wipes it
  const app3 = await launch({ PIVOT_MAIL_URL: BASE, PIVOT_MAIL_USER_DATA: userData })
  const w3 = await app3.firstWindow()
  await w3.waitForLoadState('domcontentloaded'); await w3.waitForTimeout(1500)
  const kept = await w3.evaluate(async () => { const s = window.pivotDesktop.store; return { ids: (await s.load('acc1')).map((m) => m.id), meta: await s.getMeta('hist:acc1'), gone: (await s.load('acc3')).length } })
  ok('D23 stored mail and sync position are still there after quitting and reopening', JSON.stringify(kept.ids) === '["m2","m1"]' && kept.meta === '999' && kept.gone === 0)
  const wiped = await w3.evaluate(async () => { const s = window.pivotDesktop.store; await s.clearAll(); return [(await s.load('acc1')).length, (await s.load('acc2')).length, await s.getMeta('hist:acc1'), (await s.search(['acc1', 'acc2'], 'jeddah')).length] })
  ok('D24 "forget this device" (sign-out, another person) empties the whole database', JSON.stringify(wiped) === '[0,0,null,0]')
  await app3.evaluate(({ app }) => { app.emit('before-quit'); app.quit() }).catch(() => {})
  await app3.close().catch(() => {})

  // ---- first run without a company: the chooser
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'))
  const app2 = await launch({ PIVOT_MAIL_URL: '', PIVOT_MAIL_USER_DATA: fresh })
  const w2 = await app2.firstWindow()
  await w2.waitForSelector('button[data-co]', { timeout: 15000 })
  ok('D15 first run asks which company (two choices)', (await w2.locator('button[data-co]').count()) === 2 && (await w2.locator('h1').innerText()).includes('Welcome to Pivot Mail'))
  const fromChooser = await w2.evaluate(async () => [await window.pivotDesktop.store.load('acc1'), await window.pivotDesktop.store.search(['acc1'], 'jeddah')])
  ok('D25 a page that is not Pivot Mail itself (here the first-run screen) gets nothing from the database', JSON.stringify(fromChooser) === '[null,null]')
  await app2.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.webContents.loadURL = (u) => { global.__loaded = u; return Promise.resolve() } })
  await w2.locator('button[data-co="tmc"]').click(); await w2.waitForTimeout(500)
  ok('D16 choosing Pivot Travel Management opens mail.pivottmc.com and remembers it', (await app2.evaluate(() => global.__loaded)) === 'https://mail.pivottmc.com' && JSON.parse(fs.readFileSync(path.join(fresh, 'settings.json'), 'utf8')).company === 'tmc')
  await app2.evaluate(({ app }) => { app.emit('before-quit'); app.quit() }).catch(() => {})
  await app2.close().catch(() => {})

  console.log(`${pass} pass, ${fail} fail`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
