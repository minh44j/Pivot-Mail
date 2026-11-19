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
  // Mac: photographs of the real screens for Minhaj (the mac workflow sets PIVOT_MAIL_SHOTS)
  const macShot = (name) => { if (process.platform === 'darwin' && process.env.PIVOT_MAIL_SHOTS) try { require('node:child_process').execFileSync('/usr/sbin/screencapture', ['-x', path.join(process.env.PIVOT_MAIL_SHOTS, name)]) } catch (e) { console.log('   (screenshot failed: ' + e.message + ')') } }
  const launch = (env) => _electron.launch({ executablePath: EXE ?? require(path.join(D, 'node_modules', 'electron')), args: EXE ? flags : [...flags, D], cwd: D, env: { ...process.env, PIVOT_MAIL_NO_UPDATES: '1', ...env } }) // tests never update the app on the test computer, except D54
  console.log(`   running ${EXE ? 'the packaged app ' + EXE : 'from source'} on ${process.platform}`)
  const app = await launch({ PIVOT_MAIL_URL: BASE, PIVOT_MAIL_USER_DATA: userData })
  await app.evaluate(({ shell, dialog, BrowserWindow }) => {
    global.__opened = []; global.__dialogs = []; global.__overlay = []; global.__drags = []
    shell.openExternal = async (u) => { global.__opened.push(u) }
    dialog.showMessageBox = async (_w, o) => { global.__dialogs.push(o && o.message); return { response: 0 } }
  })
  const opened = () => app.evaluate(() => global.__opened)
  // ---- not signed in: a small sign-in window, like Outlook's
  const si = await app.firstWindow()
  await si.waitForSelector('button[data-co]', { timeout: 20000 })
  const box0 = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; const [cw, ch] = w.getContentSize(); return { n: BrowserWindow.getAllWindows().length, cw, ch, resizable: w.isResizable(), maximizable: w.isMaximizable() } })
  console.log('   sign-in window:', JSON.stringify(box0))
  ok('D40 not signed in: only a small sign-in window opens (440 x 600, fixed size), not the big one', box0.n === 1 && box0.cw === 440 && box0.ch === 600 && !box0.resizable && (process.platform === 'linux' || !box0.maximizable) && si.url().startsWith('file:'))
  await si.waitForTimeout(1000) // let the entrance animation finish before measuring
  const fit = await si.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, buttons: [...document.querySelectorAll('button[data-co]')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()) }))
  console.log('   buttons:', JSON.stringify(fit.buttons))
  ok('D41 ...the logo and the two company buttons (each "Continue with Google"), all of it fits (no scrolling)', fit.sw <= fit.iw && fit.sh <= fit.ih && fit.buttons.join('|') === 'Pivot Shipping Continue with Google · @pivotscl.com|Pivot Travel Management Continue with Google · @pivottmc.com', JSON.stringify(fit))
  await si.screenshot({ path: path.join(os.tmpdir(), 'pm-signin.png') })
  macShot('1-mac-sign-in.png')

  // ---- the page itself is locked down
  ok('D1 the page gets only the small bridge: no Node, no require, no process', await si.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined' && JSON.stringify(Object.keys(window.pivotDesktop).sort()) === JSON.stringify(['copyFiles', 'notifyMail', 'onMailAction', 'onSignInState', 'onUpdateReady', 'restartToUpdate', 'retry', 'setBadge', 'setTheme', 'show', 'signIn', 'signInBack', 'signInReopen', 'signedOut', 'startDrag', 'store', 'version'])))

  // ---- sign-in goes to the browser, not into the window
  await si.locator('button[data-co="scl"]').click(); await si.waitForTimeout(800)
  const startUrl = (await opened()).find((u) => u.includes('/api/auth/start')) || ''
  ok('D2 a Google button opens the normal browser (Google refuses sign-in inside app windows); the small window waits', !!startUrl && (await si.locator('#waiting').isVisible()) && (await si.locator('#domain').innerText()) === '@pivotscl.com')
  ok('D3 ...carrying only the hash of the app\'s secret, and the company', /[?&]desktop=[A-Za-z0-9_-]{43}(&|$)/.test(startUrl) && /[?&]company=scl/.test(startUrl))
  await si.screenshot({ path: path.join(os.tmpdir(), 'pm-signin-waiting.png') })
  macShot('2-mac-sign-in-waiting.png')
  const n0 = (await opened()).length
  await si.locator('#reopen').click(); await si.waitForTimeout(300)
  ok('D42 "Open the browser again" opens the same sign-in once more', (await opened()).length === n0 + 1 && (await opened()).pop() === startUrl)

  // a forged ticket is refused: nothing signed in, the small window keeps waiting
  const bad = 'pivotmail://auth?t=' + encodeURIComponent('eyJmYWtlIjoxfQ.bad')
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), bad); await si.waitForTimeout(1500)
  const sess = () => app.evaluate(async ({ session }, base) => (await session.defaultSession.fetch(base + '/api/auth/session', { credentials: 'include' })).status, BASE)
  ok('D4 a forged ticket does not sign the app in (and no big window appears)', (await sess()) === 401 && (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1 && (await si.locator('#waiting').isVisible()))

  // Back, then the real thing
  await si.locator('#back').click(); await si.waitForTimeout(400)
  ok('D43 "Back" returns to the two buttons', await si.locator('#choose').isVisible())
  await si.locator('button[data-co="scl"]').click(); await si.waitForTimeout(600)
  const start2 = (await opened()).filter((u) => u.includes('/api/auth/start')).pop()
  // Any website can open a pivotmail:// link: a bogus one arriving now must not spoil the real sign-in under way.
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), 'pivotmail://auth?t=bogus.ticket'); await si.waitForTimeout(1200)
  const { location, ticket } = await browserSignIn(start2)
  ok('D5 the browser finishes on the hand-back page with a ticket', location.startsWith('/desktop-signed-in.html#t=') && ticket.length > 20)
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), 'pivotmail://auth?t=' + encodeURIComponent(ticket))
  let win = null
  for (let i = 0; i < 50 && !win; i++) { await new Promise((r) => setTimeout(r, 200)); win = app.windows().find((w) => w.url().startsWith(BASE)) || null }
  await win.waitForSelector('h1, h2', { timeout: 15000 }).catch(() => {}); await win.waitForTimeout(800)
  const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({ visible: w.isVisible(), url: w.webContents.getURL().slice(0, 30), size: w.getContentSize() })))
  console.log('   after sign-in:', JSON.stringify(after))
  const s = await win.evaluate(async () => { const r = await fetch('/api/auth/session'); return { status: r.status, body: await r.json() } })
  ok('D6 signed in as that person (even after a bogus link arrived mid-way)', s.status === 200 && s.body.user && s.body.user.email === 'ann@pivotscl.com')
  ok('D44 the small window closes and the full Pivot Mail window opens', after.length === 1 && after[0].visible && after[0].url.startsWith(BASE) && after[0].size[0] >= 900)
  ok('D7 ...showing Pivot Mail (the welcome screen for a person with no mailbox yet)', (await win.getByRole('heading', { name: /Welcome, Ann/ }).count()) === 1)
  macShot('3-mac-main-window.png')
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setOverlayIcon = (img, desc) => global.__overlay.push(img ? desc : null)
    w.webContents.startDrag = (item) => global.__drags.push(item)
  })

  // the same link again, after it was used: refused politely, nothing changes
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), 'pivotmail://auth?t=' + encodeURIComponent(ticket)); await win.waitForTimeout(800)
  ok('D8 a hand-back link the app did not ask for (or used twice) is ignored, with a short note', (await app.evaluate(() => global.__dialogs)).includes('Please sign in again'))

  // ---- links to other sites open in the browser
  await win.evaluate(() => { location.href = 'https://example.com/some-page' }); await win.waitForTimeout(600)
  ok('D9 a link to another website opens in the normal browser; the app stays put', (await opened()).includes('https://example.com/some-page') && win.url().startsWith(BASE))
  await win.evaluate(() => { location.href = '/api/accounts/connect?company=scl&kind=personal' }); await win.waitForTimeout(600)
  ok('D10 "Add account" (Google permission) also opens in the browser', (await opened()).some((u) => u.includes('/api/accounts/connect?company=scl')) && win.url().startsWith(BASE))
  // The Welcome screen's "Connect" button inside the app: the browser gets the address with the app's two-minute pass, so it
  // does not have to be signed in (regression 2026-11-19: Travel Management showed a pivotscl.com Google page).
  const nOpened = (await opened()).length
  await win.goto(BASE + '/'); await win.waitForSelector('.wl-go', { timeout: 15000 })
  await win.locator('.wl-go').click(); await win.waitForTimeout(1500)
  const viaButton = (await opened()).slice(nOpened).find((u) => u.includes('/api/accounts/connect?')) || ''
  ok('D71 "Connect" in the app opens the browser with a pass for that company (no separate browser sign-in needed)', /\/api\/accounts\/connect\?company=scl&kind=personal&t=[^&]{40,}/.test(viaButton), viaButton.slice(0, 120))

  // ---- taskbar number
  await win.evaluate(() => window.pivotDesktop.setBadge(7)); await win.waitForTimeout(200)
  await win.evaluate(() => window.pivotDesktop.setBadge(0)); await win.waitForTimeout(200)
  const ov = await app.evaluate(() => global.__overlay)
  console.log('   overlay calls:', JSON.stringify(ov))
  if (process.platform !== 'darwin') ok('D11 the unread number goes on the taskbar icon, and clears at 0', ov.includes('7 unread') && ov[ov.length - 1] === null && ov.indexOf('7 unread') < ov.length - 1)

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

  // ---- rich new-mail alerts (Windows toasts)
  const one = { kind: 'one', accountId: 'acc-1', messageId: 'acc-1:m1', sender: 'Maersk Line <script>&', subject: 'Arrival notice — MSKU 765432-1 at "Jeddah"', preview: 'Your container has arrived at Jeddah Islamic Port. Please arrange customs clearance and delivery.', mailbox: 'ops@pivotscl.com' }
  const shownWin = await win.evaluate((o) => window.pivotDesktop.notifyMail(o, { name: 'Maersk Line', email: 'notify@maersk.com' }), one)
  const xml = await app.evaluate(() => global.__pmLastToast || '')
  const key = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')).toastKey || ''
  ok('D48 a new mail alert carries the sender, subject, first line and mailbox, with Open and Mark as read', /Maersk Line &lt;script&gt;&amp;/.test(xml) && xml.includes('Arrival notice — MSKU 765432-1 at &quot;Jeddah&quot;') && xml.includes('Your container has arrived') && xml.includes('placement="attribution">ops@pivotscl.com') && xml.includes('content="Open"') && xml.includes('content="Mark as read"') && xml.includes('Notification.Mail') && (process.platform === 'darwin' || xml.includes('appLogoOverride')), xml.slice(0, 300))
  ok('D49 ...its buttons carry this computer\'s secret key (a website cannot fake them)', key.length >= 20 && xml.includes(`k=${key}`))
  const many = { kind: 'many', accountId: 'acc-1', count: 5, mailbox: 'ops@pivotscl.com', lines: [{ sender: 'Maersk Line', subject: 'Arrival notice' }, { sender: 'Hapag-Lloyd', subject: 'Booking confirmed' }, { sender: 'Customs', subject: 'Clearance done' }] }
  await win.evaluate((o) => window.pivotDesktop.notifyMail(o, { name: 'ops', email: 'ops@pivotscl.com' }), many)
  const xml2 = await app.evaluate(() => global.__pmLastToast || '')
  ok('D50 several at once: one tidy alert "5 new messages" with three senders and "+ 2 more"', xml2.includes('5 new messages') && xml2.includes('Hapag-Lloyd — Booking confirmed') && xml2.includes('+ 2 more'))
  // clicks on the alert's buttons arrive in the page; a link with the wrong key is ignored
  await win.evaluate(() => { window.__acts = []; window.pivotDesktop.onMailAction((a) => window.__acts.push(a)) }); await win.waitForTimeout(200)
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), `pivotmail://read?a=acc-1&k=wrong&m=acc-1%3Am1`); await win.waitForTimeout(300)
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), `pivotmail://read?a=acc-1&k=${key}&m=acc-1%3Am1`); await win.waitForTimeout(400)
  const acts = await win.evaluate(() => window.__acts)
  ok('D51 "Mark as read" on an alert reaches Pivot Mail; a faked link (wrong key) does nothing', acts.length === 1 && acts[0].action === 'read' && acts[0].messageId === 'acc-1:m1', JSON.stringify(acts))
  // "Mark as read" from the tray: the window stays hidden
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide()); await win.waitForTimeout(200)
  await app.evaluate(({ app }, link) => app.emit('second-instance', {}, ['pm', link], ''), `pivotmail://read?a=acc-1&k=${key}&m=acc-1%3Am1`); await win.waitForTimeout(400)
  ok('D56 "Mark as read" on an alert works quietly: the window stays in the tray', !(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())))
  await win.evaluate(() => window.pivotDesktop.show()); await win.waitForTimeout(300)
  // an emoji right at the length limit, and characters XML forbids, never break the alert
  const oddMail = { ...one, sender: 'A'.repeat(79) + '\u{1F6A2}tail', subject: 'Ship \uFFFF\uD800 ok', preview: '' }
  await win.evaluate((o) => window.pivotDesktop.notifyMail(o), oddMail)
  const xml3 = await app.evaluate(() => global.__pmLastToast || '')
  ok('D57 an emoji cut at the limit or a forbidden character does not break the alert', !/[\uD800-\uDFFF\uFFFE\uFFFF]/.test(xml3.replace(/\uD83D\uDEA2/g, '')) && xml3.includes('Ship ok') && xml3.includes('A'.repeat(79) + '\u{1F6A2}<'), xml3.slice(0, 260))
  if (process.platform === 'darwin') {
    const mac = await app.evaluate(() => global.__pmLastMacAlert || null)
    ok('D60 Mac: the alert is the Mac\'s own, with the sender, subject and first line', shownWin === true || (mac && typeof mac.title === 'string'), JSON.stringify(mac))
    await win.evaluate((o) => window.pivotDesktop.notifyMail(o), one); await win.waitForTimeout(1500)
    const m1 = await app.evaluate(() => global.__pmLastMacAlert || {})
    ok('D61 Mac alert content: "Maersk Line <script>&" / "Arrival notice — MSKU 765432-1 at \"Jeddah\"" / first line + mailbox', m1.title === 'Maersk Line <script>&' && m1.subtitle === 'Arrival notice — MSKU 765432-1 at "Jeddah"' && m1.body.startsWith('Your container has arrived') && m1.body.endsWith('ops@pivotscl.com'), JSON.stringify(m1))
    const err = await app.evaluate(() => global.__pmToastError || null)
    ok('D62 ...and the Mac accepted it (no error)', err === null, err)
    macShot('5-mac-alert.png')
    const menu = await app.evaluate(({ Menu }) => (Menu.getApplicationMenu()?.items ?? []).map((i) => i.label))
    ok('D63 Mac menu bar: Pivot Mail, Edit and Window menus (so ⌘C, ⌘V, ⌘Q, ⌘W work); no View menu (⌘R is Reply)', JSON.stringify(menu) === JSON.stringify(['Pivot Mail', 'Edit', 'Window']), JSON.stringify(menu))
    await win.evaluate(() => window.pivotDesktop.setBadge(7)); await win.waitForTimeout(300)
    ok('D64 the unread number shows on the dock icon', (await app.evaluate(({ app }) => app.dock?.getBadge() ?? '')) === '7')
    await win.evaluate(() => window.pivotDesktop.setBadge(0))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()); await win.waitForTimeout(500)
    const hiddenAfterClose = !(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()))
    await app.evaluate(({ app }) => app.emit('activate')); await win.waitForTimeout(600)
    ok('D65 closing the window keeps Pivot Mail running; clicking the dock icon brings it back', hiddenAfterClose && (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())))
  }
  if (process.platform === 'win32') {
    ok('D52 on Windows the alert is drawn by Windows itself', shownWin === true)
    await win.waitForTimeout(1500)
    const err = await app.evaluate(() => global.__pmToastError || null)
    ok('D53 ...and Windows accepted it (no error)', err === null, err)
    if (process.env.PIVOT_MAIL_SHOTS) {
      // Photograph the real alerts on screen (the installer-preview job runs this against the installed app).
      const shot = (name) => require('node:child_process').execFileSync('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $p=New-Object Drawing.Bitmap $b.Width,$b.Height; $g=[Drawing.Graphics]::FromImage($p); $g.CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size); $p.Save('${path.join(process.env.PIVOT_MAIL_SHOTS, name).replace(/'/g, "''")}')`])
      await win.evaluate((o) => window.pivotDesktop.notifyMail({ ...o, sender: 'Maersk Line' }, { name: 'Maersk Line', email: 'notify@maersk.com' }), one); await win.waitForTimeout(2500); shot('5-alert-one-mail.png')
      await win.waitForTimeout(6000)
      await win.evaluate((o) => window.pivotDesktop.notifyMail(o, { name: 'ops', email: 'ops@pivotscl.com' }), many); await win.waitForTimeout(2500); shot('6-alert-several.png')
      // Did Windows keep them in its notification list (proof they were delivered even if "Do not disturb" hid the banner)?
      const ps = (cmd) => { try { return require('node:child_process').execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim() } catch (e) { return 'error: ' + String(e.message).slice(0, 200) } }
      const kept = ps("[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]; ([Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('com.pivot.mail')).Count")
      console.log('   Windows notification list holds ' + kept + ' Pivot Mail alert(s)')
      console.log('   settings: ' + ps("$a=Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/PushNotifications' -ErrorAction SilentlyContinue; $b=Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Notifications/Settings' -ErrorAction SilentlyContinue; $c=Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Notifications/Settings/com.pivot.mail' -ErrorAction SilentlyContinue; 'ToastEnabled=' + $a.ToastEnabled + ' NOC_GLOBAL_SETTING_TOASTS_ENABLED=' + $b.NOC_GLOBAL_SETTING_TOASTS_ENABLED + ' app=' + ($c | Out-String).Trim().Replace([Environment]::NewLine, ' ')"))
      // (PowerShell may print more than the number, e.g. a blank line or a notice: read the first number in its answer)
      ok('D58 Windows delivered the alerts to its notification list', Number((/\d+/.exec(kept) || ['0'])[0]) >= 1, JSON.stringify(kept))
      // The notification panel, opened the way a person would (Windows key + N), photographed with the alerts in it.
      ps("Start-Process 'ms-actioncenter:'"); await win.waitForTimeout(2500); shot('8-notification-panel.png')
      ps("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ESC}')")
    }
  }

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
  // While a big save runs, the app's main process (window, tray, alerts) must keep answering at once.
  const pinger = (async () => { const lat = []; await new Promise((r) => setTimeout(r, 100)); for (let i = 0; i < 15; i++) { const t = Date.now(); await app.evaluate(() => 1); lat.push(Date.now() - t); await new Promise((r) => setTimeout(r, 40)) } return lat })()
  const big = await win.evaluate(async () => {
    const s = window.pivotDesktop.store
    const words = ['invoice', 'container', 'booking', 'customs', 'clearance', 'freight', 'Dammam', 'Riyadh', 'quotation', 'manifest']
    const msgs = Array.from({ length: 5000 }, (_, i) => ({ id: 'b' + i, threadId: 'b' + i, accountId: 'acc3', folder: 'inbox', labels: [], from: { name: 'Sender ' + i, email: `s${i}@example.com` }, to: [], subject: `${words[i % 10]} ${i}`, body: `${words[(i * 7) % 10]} reference PSC-${100000 + i} ${'lorem ipsum '.repeat(40)}`, date: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString(), unread: false, flagged: false, attachments: [], loaded: true }))
    const t0 = performance.now(); const saving = s.save(msgs); window.__saving = true; await saving; window.__saving = false; const saveMs = performance.now() - t0
    const t1 = performance.now(); const hits = await s.search(['acc3'], 'PSC-104321'); const searchMs = performance.now() - t1
    const t2 = performance.now(); const many = await s.search(['acc3'], 'customs'); const manyMs = performance.now() - t2
    return { saveMs, searchMs, manyMs, hits: hits.map((m) => m.id), many: many.length }
  })
  const lat = await pinger
  console.log('   5,000 messages: save %d ms, exact search %d ms, broad search %d ms; window response during the save: worst %d ms', Math.round(big.saveMs), Math.round(big.searchMs), Math.round(big.manyMs), Math.max(...lat))
  ok('D33 while 5,000 messages are being saved, the window stays responsive (database on its own thread)', Math.max(...lat) < 150, JSON.stringify(lat))
  ok('D22 5,000 messages: a reference number is found instantly (well under a quarter second)', JSON.stringify(big.hits) === '["b4321"]' && big.searchMs < 250 && big.many === 300 && big.manyMs < 500)
  await win.evaluate(async () => { await window.pivotDesktop.store.clearAccount('acc3'); await window.pivotDesktop.store.setMeta('hist:acc1', '999') })

  // ---- SPEED REPORT: a busy freight mailbox (25,000 messages) through the real app (page -> bridge -> database thread)
  const sp = await win.evaluate(async () => {
    const s = window.pivotDesktop.store
    const lines = ['Maersk Line', 'Hapag-Lloyd', 'MSC', 'CMA CGM', 'ONE', 'Evergreen', 'COSCO', 'Saudi Customs (ZATCA)', 'Bahri', 'DHL Global Forwarding']
    const words = ['arrival notice', 'booking confirmation', 'customs clearance', 'invoice', 'delivery order', 'freight quotation', 'manifest', 'vessel schedule', 'demurrage', 'packing list']
    const ports = ['Jeddah Islamic Port', 'King Abdulaziz Port Dammam', 'Riyadh Dry Port', 'Jebel Ali', 'Shanghai', 'Rotterdam']
    const N = 25000
    const msgs = Array.from({ length: N }, (_, i) => {
      const line = lines[i % 10], w = words[(i * 3) % 10], port = ports[i % 6]
      const box = `MSKU${String(1000000 + i).slice(-7)}`
      return { id: 'z' + i, threadId: 'zt' + Math.floor(i / 3), accountId: 'acc9', folder: i % 9 === 0 ? 'archive' : 'inbox', labels: [], from: { name: line, email: `ops${i % 50}@${line.toLowerCase().replace(/[^a-z]/g, '')}.com` }, to: [{ name: 'Pivot Shipping', email: 'ops@pivotscl.com' }], subject: `${w} — ${box} / BL ${'MEDU' + (5000000 + i)} — ${port}`, body: `Dear team, please find the ${w} for container ${box}, booking ${'BKG' + (800000 + i)}, invoice INV-2026-${String(i).padStart(5, '0')}, HS 8471.30.00. ETA ${port}. ${'Regards, operations desk. '.repeat(30)}`, date: new Date(Date.UTC(2025, 0, 1) + i * 1_200_000).toISOString(), unread: i % 4 === 0, flagged: false, attachments: [] }
    })
    // saved the way a sync saves them: in batches as they arrive
    const t0 = performance.now()
    for (let i = 0; i < N; i += 250) await s.save(msgs.slice(i, i + 250))
    const saveMs = performance.now() - t0
    const time = async (f) => { await f(); const t = performance.now(); const r = await f(); return [performance.now() - t, r] }
    const [loadMs, loaded] = await time(() => s.load('acc9'))
    const q = {}
    for (const [k, v] of Object.entries({ container: 'MSKU1012345', containerSpaced: 'MSKU 101234-5', bl: 'MEDU5012345', booking: 'BKG812345', invoice: 'INV-2026-12345', sender: 'Hapag-Lloyd', word: 'demurrage', twoWords: 'customs clearance Jeddah', partial: 'demur' })) {
      const [ms, r] = await time(() => s.search(['acc9'], v)); q[k] = { ms, n: r.length, first: r[0]?.id }
    }
    const [threadMs, th] = await time(() => s.thread('acc9', 'zt4115'))
    return { N, saveMs, loadMs, loaded: loaded.length, q, threadMs, thread: th.length }
  })
  const f = (x) => `${Math.round(x)} ms`
  console.log('\n   ===== SPEED REPORT (%s, 25,000 messages, measured inside the app) =====', process.platform)
  console.log('   store 25,000 messages (as a sync does, 250 at a time): %s (%s per 1,000)', f(sp.saveMs), f(sp.saveMs / 25))
  console.log('   open the mailbox (newest %d, ready to show): %s', sp.loaded, f(sp.loadMs))
  for (const [k, v] of Object.entries(sp.q)) console.log('   search %s: %s, %d found', k.padEnd(16), f(v.ms).padStart(6), v.n)
  console.log('   open a conversation (%d messages, full text): %s', sp.thread, f(sp.threadMs))
  console.log('   ======================================================================\n')
  const exact = ['container', 'containerSpaced', 'bl', 'booking', 'invoice'].every((k) => sp.q[k].n === 1 && sp.q[k].first === 'z12345')
  ok('D66 25,000 messages: container, BL, booking and invoice numbers find exactly the right mail (with or without spaces/dashes)', exact, JSON.stringify(sp.q))
  ok('D67 ...every search answers in under 150 ms (instant to the eye), sender/word/partial-word searches list the newest 300', Object.values(sp.q).every((v) => v.ms < 150) && sp.q.sender.n === 300 && sp.q.word.n === 300 && sp.q.partial.n === 300, JSON.stringify(sp.q))
  ok('D68 ...the mailbox opens (5,000 newest ready) in under 500 ms and a conversation in under 50 ms', sp.loadMs < 500 && sp.loaded === 5000 && sp.threadMs < 50 && sp.thread === 3, `${sp.loadMs} ${sp.threadMs}`)
  // Gmail hands over roughly 100 messages a second at best (measured: 400 in 3.4 s); storing at 500+ a second means the database never holds a sync up.
  ok('D69 ...messages are stored at over 500 a second (Gmail delivers about 100 a second: the database never holds a sync up)', 25000 / (sp.saveMs / 1000) > 500, `${Math.round(25000 / (sp.saveMs / 1000))} per second`)
  await win.evaluate(() => window.pivotDesktop.store.clearAccount('acc9'))

  // ---- two attachments with the same name, and names Windows reserves
  await win.evaluate(() => window.pivotDesktop.startDrag([{ name: 'invoice.pdf', mime: 'application/pdf', bytes: new Uint8Array([49]) }, { name: 'invoice.pdf', mime: 'application/pdf', bytes: new Uint8Array([50]) }, { name: 'CON.txt', mime: 'text/plain', bytes: new Uint8Array([51]) }, { name: 'image001.png. ', mime: 'image/png', bytes: new Uint8Array([52]) }]))
  await win.waitForTimeout(400)
  const d2 = (await app.evaluate(() => global.__drags)).pop()
  const f2 = d2 ? d2.files || [d2.file] : []
  const names2 = f2.map((f) => path.basename(f))
  console.log('   dragged names:', JSON.stringify(names2))
  ok('D30 two attachments with the same name both arrive ("invoice (2).pdf"); Windows-reserved names are made safe', f2.length === 4 && names2[0] === 'invoice.pdf' && names2[1] === 'invoice (2).pdf' && fs.readFileSync(f2[1], 'utf8') === '2' && names2[2] === '_CON.txt' && names2[3] === 'image001.png')

  // ---- Copy (right-click > Copy, or Ctrl+C): the files themselves on the Windows clipboard, ready to paste anywhere
  const copied = await win.evaluate(() => window.pivotDesktop.copyFiles([{ name: 'B-L MEDU1234567.pdf', mime: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) }, { name: 'packing list.xlsx', mime: 'application/vnd.ms-excel', bytes: new Uint8Array([80, 75]) }, { name: 'packing list.xlsx', mime: 'application/vnd.ms-excel', bytes: new Uint8Array([80, 76]) }]))
  let onClipboard = []
  if (process.platform === 'win32') {
    // Ask Windows itself what is on the clipboard now: the same list Explorer pastes.
    const out = require('node:child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }'], { encoding: 'utf8' })
    onClipboard = out.split(/\r?\n/).filter(Boolean)
  } else if (process.platform === 'darwin') {
    // Ask the Mac itself what is on the clipboard now: the same file list Finder pastes.
    const out = require('node:child_process').execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', 'ObjC.import("AppKit"); const a = $.NSPasteboard.generalPasteboard.readObjectsForClassesOptions($([$.NSURL]), $({})); const r = []; for (let i = 0; i < a.count; i++) r.push(ObjC.unwrap(a.objectAtIndex(i).path)); r.join("\\n")'], { encoding: 'utf8' })
    onClipboard = out.split(/\r?\n/).filter(Boolean)
    const items = require('node:child_process').execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', 'ObjC.import("AppKit"); const pb = $.NSPasteboard.generalPasteboard; const t = []; for (let i = 0; i < pb.pasteboardItems.count; i++) t.push(ObjC.deepUnwrap(pb.pasteboardItems.objectAtIndex(i).types).join(",")); pb.pasteboardItems.count + " items: " + t.join(" | ")'], { encoding: 'utf8' })
    console.log('   Mac clipboard (write said %s): %s', await app.evaluate(() => global.__pmClipboardNote || ''), items.trim())
  } else onClipboard = await app.evaluate(() => global.__pmClipboardFiles || [])
  console.log('   on the clipboard:', JSON.stringify(onClipboard.map((f) => path.basename(f))))
  ok('D34 Copy puts the real files on the Windows clipboard (3 files, same-name files kept apart, right content)', copied === 3 && onClipboard.length === 3 && JSON.stringify(onClipboard.map((f) => path.basename(f))) === JSON.stringify(['B-L MEDU1234567.pdf', 'packing list.xlsx', 'packing list (2).xlsx']) && fs.readFileSync(onClipboard[0]).subarray(0, 4).toString() === '%PDF' && fs.readFileSync(onClipboard[2], 'utf8') === 'PL')

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
  const tStart = Date.now()
  const app3 = await launch({ PIVOT_MAIL_URL: BASE, PIVOT_MAIL_USER_DATA: userData })
  const w3 = await app3.firstWindow()
  await w3.waitForLoadState('domcontentloaded')
  await w3.waitForSelector('h1, h2, .row', { timeout: 15000 }).catch(() => {})
  const startMs = Date.now() - tStart
  console.log('   SPEED start (already signed in): Pivot Mail on screen in %d ms', startMs)
  ok('D70 already signed in: from double-click to Pivot Mail on screen in under 4 s', startMs < 4000, startMs)
  await w3.waitForTimeout(1500)
  ok('D45 already signed in: the full Pivot Mail window opens straight away (no sign-in window)', w3.url().startsWith(BASE) && (await app3.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1)
  const kept = await w3.evaluate(async () => { const s = window.pivotDesktop.store; return { ids: (await s.load('acc1')).map((m) => m.id), meta: await s.getMeta('hist:acc1'), gone: (await s.load('acc3')).length } })
  ok('D23 stored mail and sync position are still there after quitting and reopening', JSON.stringify(kept.ids) === '["m2","m1"]' && kept.meta === '999' && kept.gone === 0)
  const wiped = await w3.evaluate(async () => { const s = window.pivotDesktop.store; await s.clearAll(); return [(await s.load('acc1')).length, (await s.load('acc2')).length, await s.getMeta('hist:acc1'), (await s.search(['acc1', 'acc2'], 'jeddah')).length] })
  ok('D24 "forget this device" (sign-out, another person) empties the whole database', JSON.stringify(wiped) === '[0,0,null,0]')
  // sign out: the full window goes, the small sign-in window comes back
  await w3.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); location.replace('/') })
  let back = null
  for (let i = 0; i < 40 && !back; i++) { await new Promise((r) => setTimeout(r, 200)); back = app3.windows().find((w) => w.url().includes('signin.html')) || null }
  const wins3 = await app3.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents.getURL().slice(-40)))
  ok('D46 after signing out, the big window closes and the small sign-in window returns', !!back && wins3.length === 1 && wins3[0].includes('signin.html'), JSON.stringify(wins3))
  // closing the small window without signing in ends the app (nothing to check yet), like Outlook
  const exited = new Promise((r) => app3.process().once('exit', () => r(true)))
  await app3.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  ok('D47 closing the sign-in window quits Pivot Mail', await Promise.race([exited, new Promise((r) => setTimeout(() => r(false), 8000))]))
  await app3.close().catch(() => {})

  // ---- starting without internet (or with the server down): explained, and Pivot Mail opens by itself when it can connect
  {
    const PORT = 4377, URL1 = `http://localhost:${PORT}`
    let mode = 'down' // down: nothing listens; 503: server error; up: answers
    let srv = null
    const listen = () => new Promise((r) => { srv = http.createServer((q, res) => { if (mode === '503') { res.statusCode = 503; return res.end('busy') } res.setHeader('content-type', q.url.startsWith('/api/') ? 'application/json' : 'text/html'); res.end(q.url.startsWith('/api/') ? '{}' : '<!doctype html><title>Pivot Mail</title><h1 id="pm-up">Pivot Mail is here</h1>') }); srv.listen(PORT, r) })
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'))
    fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ dark: true }))
    const a = await launch({ PIVOT_MAIL_URL: URL1, PIVOT_MAIL_USER_DATA: ud })
    const w = await a.firstWindow(); await w.waitForTimeout(1500)
    const page1 = await w.evaluate(() => ({ url: location.protocol, h1: document.querySelector('h1')?.textContent, code: document.getElementById('code')?.textContent, dark: document.body.classList.contains('dark'), sh: document.documentElement.scrollHeight, ih: innerHeight }))
    console.log('   offline screen:', JSON.stringify(page1))
    ok('D35 no internet at start: a clear built-in screen (not a blank window), with the reason for IT', page1.url === 'file:' && page1.h1 === 'No internet connection' && /\(-\d+\)/.test(page1.code || '') && page1.sh <= page1.ih)
    ok('D36 a person who chose dark mode gets a dark window and a dark screen from the first moment', page1.dark && (await a.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor().toLowerCase())) === '#141416')
    macShot('4-mac-no-internet.png')
    await w.screenshot({ path: path.join(os.tmpdir(), 'pm-offline-dark.png') })
    // the connection comes back: it opens by itself (checked every 5 s)
    await listen(); mode = 'up'
    const t0 = Date.now()
    await w.waitForSelector('#pm-up', { timeout: 12000 }).catch(() => {})
    const took = Date.now() - t0
    ok('D37 when the connection is back, Pivot Mail opens by itself (no clicking needed)', w.url().startsWith(URL1) && (await w.locator('#pm-up').count()) === 1, `${took} ms`)
    console.log('   reopened by itself after %d ms', took)
    // the server answers with an error: explained differently; "Try again now" opens at once when it is back
    mode = '503'
    await w.evaluate(() => location.reload()); await w.waitForTimeout(1200)
    const h2 = await w.evaluate(() => document.querySelector('h1')?.textContent)
    ok('D38 server error (503): "Pivot Mail is not answering" (the internet itself is fine)', h2 === 'Pivot Mail is not answering', h2)
    mode = 'up'
    const t1 = Date.now(); await w.locator('#retry').click(); await w.waitForSelector('#pm-up', { timeout: 6000 }).catch(() => {})
    ok('D39 "Try again now" opens Pivot Mail straight away once it answers', (await w.locator('#pm-up').count()) === 1 && Date.now() - t1 < 4000, `${Date.now() - t1} ms`)
    await a.evaluate(({ app }) => { app.emit('before-quit'); app.quit() }).catch(() => {}); await a.close().catch(() => {})
    srv.close()
  }

  // ---- first run without a company: the chooser
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-'))
  const app2 = await launch({ PIVOT_MAIL_URL: '', PIVOT_MAIL_USER_DATA: fresh })
  await app2.evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async (u) => { global.__opened.push(u) } })
  const w2 = await app2.firstWindow()
  await w2.waitForSelector('button[data-co]', { timeout: 15000 })
  ok('D15 very first start: the small sign-in window with both companies (no separate company screen)', (await w2.locator('button[data-co]').count()) === 2 && (await w2.locator('h1').first().innerText()) === 'Welcome to Pivot Mail')
  const fromSignin = await w2.evaluate(async () => [await window.pivotDesktop.store.load('acc1'), await window.pivotDesktop.store.search(['acc1'], 'jeddah')])
  ok('D25 a page that is not Pivot Mail itself (here the sign-in window) gets nothing from the database', JSON.stringify(fromSignin) === '[null,null]')
  await w2.locator('button[data-co="tmc"]').click(); await w2.waitForTimeout(500)
  const tmc = (await app2.evaluate(() => global.__opened)).pop() || ''
  ok('D16 Pivot Travel Management signs in at mail.pivottmc.com, and the choice is remembered', tmc.startsWith('https://mail.pivottmc.com/api/auth/start?') && /company=tmc/.test(tmc) && JSON.parse(fs.readFileSync(path.join(fresh, 'settings.json'), 'utf8')).company === 'tmc' && (await w2.locator('#domain').innerText()) === '@pivottmc.com')
  await app2.evaluate(({ app }) => { app.emit('before-quit'); app.quit() }).catch(() => {})
  await app2.close().catch(() => {})

  // ---- automatic updates (Windows, packaged app): a newer version on a local feed is found, downloaded and checked
  if (process.platform === 'win32' && EXE && /win-unpacked/.test(EXE)) {
    const rel = path.dirname(path.dirname(EXE)) // release/
    // Without these two files installed copies can never find an update (the release would also fail to publish).
    const feedCfg = path.join(path.dirname(EXE), 'resources', 'app-update.yml')
    const cfg = fs.existsSync(feedCfg) ? fs.readFileSync(feedCfg, 'utf8') : ''
    ok('D55 the build carries its update address (GitHub minh44j/Pivot-Mail) and the update description latest.yml', fs.existsSync(path.join(rel, 'latest.yml')) && /provider: github/.test(cfg) && /owner: minh44j/.test(cfg) && /repo: Pivot-Mail/.test(cfg), cfg || 'app-update.yml missing')
  }
  if (process.platform === 'win32' && EXE && fs.existsSync(path.join(path.dirname(path.dirname(EXE)), 'latest.yml'))) {
    const rel = path.dirname(path.dirname(EXE)) // release/
    const yml = fs.readFileSync(path.join(rel, 'latest.yml'), 'utf8')
    const feedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-feed-'))
    const pkg = (/path: (.+)/.exec(yml) || [])[1].trim()
    fs.copyFileSync(path.join(rel, pkg), path.join(feedDir, pkg))
    fs.writeFileSync(path.join(feedDir, 'latest.yml'), yml.replace(/^version: .+$/m, 'version: 99.0.0'))
    const feed = http.createServer((q, res) => { const f = path.join(feedDir, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '')); if (!f.startsWith(feedDir) || !fs.existsSync(f)) { res.statusCode = 404; return res.end() } res.setHeader('content-length', fs.statSync(f).size); fs.createReadStream(f).pipe(res) })
    await new Promise((r) => feed.listen(4400, r))
    const a5 = await launch({ PIVOT_MAIL_URL: BASE, PIVOT_MAIL_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'pm-e2e-')), PIVOT_MAIL_UPDATE_URL: 'http://localhost:4400/', PIVOT_MAIL_UPDATE_DELAY: '1500', PIVOT_MAIL_NO_UPDATES: '' })
    await a5.firstWindow()
    let got = null, err = null
    for (let i = 0; i < 90 && !got && !err; i++) { await new Promise((r) => setTimeout(r, 1000)); [got, err] = await a5.evaluate(() => [global.__pmUpdate || null, global.__pmUpdateError || null]) }
    ok('D54 automatic update: a newer version is found, downloaded and its checksum verified, ready to install on restart', got === '99.0.0', err || 'timed out')
    // Leave without installing the test "update": an exit code other than 0 tells the updater not to install on quit.
    const pid5 = a5.process().pid
    await a5.evaluate(({ app }) => setTimeout(() => app.exit(1), 50)).catch(() => {})
    await new Promise((r) => setTimeout(r, 3000))
    try { require('node:child_process').execFileSync('taskkill', ['/PID', String(pid5), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already gone */ }
    const left = require('node:child_process').execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' }).split(/\r?\n/).filter((l) => /PivotMail-Package/i.test(l))
    ok('D59 ...and nothing installs it behind the test\'s back (no update installer left running)', left.length === 0, left.join(' | '))
    feed.close()
  }

  console.log(`${pass} pass, ${fail} fail`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
