/**
 * Pivot Mail for Windows and Mac.
 *
 * On a Mac the same app follows Mac habits: a menu bar with Pivot Mail / Edit / Window menus (⌘C, ⌘V, ⌘Q, ⌘W work), the dock
 * icon reopens the window and carries the unread number, a symbol in the menu bar replaces the Windows tray icon, alerts are
 * the Mac's own, copied attachments paste in Finder, and links arrive through the Mac's "open-url" (see the isMac parts).
 *
 * The app window shows the same Pivot Mail as the website (so every screen, fix and feature is shared), and adds what a browser tab
 * cannot do well: a tray icon that keeps mail checking while the window is closed, real Windows alerts with the Pivot icon, the unread
 * number on the taskbar icon, dragging attachments out to the desktop or a folder, and a local mail database for instant search (store.ts).
 *
 * Start: signed in, the full Pivot Mail window opens; not signed in, a small sign-in window (like Outlook's) with the two Google buttons.
 * Sign-in: Google does not allow its sign-in page inside an app's own window, so sign-in happens in the person's normal browser and is
 * handed back to the app (see beginSignIn / handleLink, and web/api/_lib/auth/desktop.ts on the server).
 */
import { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, net, session, shell } from 'electron'
import type { Event as ElectronEvent, WebContents } from 'electron'
import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { safeFileName, uniqueName } from './files'
import { cleanToast, macAlert, toastXml } from './toast'
import type { MailToast } from './toast'
import { macUpdateVersion, restartToUpdate, startMacUpdateCheck, startUpdates, updateReadyVersion } from './updater'

type Company = 'scl' | 'tmc'
const HOSTS: Record<Company, string> = { scl: 'https://mail.pivotscl.com', tmc: 'https://mail.pivottmc.com' }
/** Development and automated tests only: point the app at another address (never set on staff computers). */
const DEV_URL = process.env.PIVOT_MAIL_URL?.replace(/\/+$/, '') || null
const APP_ID = 'com.pivot.mail'
const SCHEME = 'pivotmail'
const isMac = process.platform === 'darwin'
/** Where a Mac downloads a newer version (a Mac app without Apple's paid certificate cannot replace itself). */
const MAC_DOWNLOAD_PAGE = 'https://github.com/minh44j/Pivot-Mail/releases/latest'

interface Settings {
  company?: Company
  bounds?: { x: number; y: number; width: number; height: number; maximized?: boolean }
  startWithWindows?: boolean
  trayHintShown?: boolean
  /** An update installed itself while Pivot Mail sat in the tray: reopen in the tray too (read once, at the next start). */
  resumeHidden?: boolean
  /** ...or it was minimised: reopen minimised (on the taskbar, without jumping in front of what the person is doing). */
  resumeMinimized?: boolean
  /** The person chose dark mode in Pivot Mail: the window opens dark too (no white flash). */
  dark?: boolean
  /** Secret carried by the links in new-mail alerts, so only alerts from this app can open or mark mail (not a website). */
  toastKey?: string
}

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')
function readSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as Settings
  } catch {
    return {}
  }
}
let settings: Settings = {}
function saveSettings(): void {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2))
  } catch {
    /* the app still works; it just forgets window size or the company */
  }
}

const baseUrl = (): string | null => DEV_URL ?? (settings.company ? HOSTS[settings.company] : null)
const asset = (...p: string[]) => path.join(app.getAppPath(), ...p)

let win: BrowserWindow | null = null
/** The small sign-in window, while nobody is signed in (static/signin.html). */
let signin: BrowserWindow | null = null
/** The sign-in page has loaded and can switch steps itself. */
let signinReady = false
let tray: Tray | null = null
let quitting = false
/** Reopened by an update that installed while Pivot Mail was minimised. */
let startMinimized = false
/** The mail database's own thread (store-worker.ts); null if it could not start (the page then keeps its smaller browser copy). */
let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, { resolve: (v: unknown) => void; fallback: unknown }>()
/** The secret of a sign-in in progress (its hash went to the browser; the secret itself never leaves this app). */
let pending: { verifier: string; at: number } | null = null
/** The browser address of the sign-in in progress ("Open the browser again"). */
let pendingStart: string | null = null

/* ------------------------------------------------------------------ single instance and the pivotmail:// link */

/** False in a second copy started while Pivot Mail already runs: it hands its link over and ends without opening anything. */
const primary = app.requestSingleInstanceLock()
if (!primary) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const link = argv.find((a) => a.startsWith(`${SCHEME}://`))
    if (link) void handleLink(link)
    // "Mark as read" on an alert works quietly: the window stays where it is (in the tray, too). Everything else shows it.
    if (!link || !link.startsWith(`${SCHEME}://read`)) showWindow()
  })
}

function registerScheme(): void {
  // During development Electron runs from a folder, so Windows must be told how to start it.
  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])])
  else app.setAsDefaultProtocolClient(SCHEME)
}

/* ------------------------------------------------------------------ sign-in handoff */

const b64url = (b: Buffer) => b.toString('base64url')

/** A Google button was pressed: open the person's browser with the hash of a fresh secret; the small window waits. */
function beginSignIn(company: Company): void {
  settings.company = company
  saveSettings()
  const base = baseUrl()
  if (!base) return
  const verifier = b64url(randomBytes(32))
  pending = { verifier, at: Date.now() }
  const url = new URL('/api/auth/start', base)
  url.searchParams.set('company', company)
  url.searchParams.set('desktop', b64url(createHash('sha256').update(verifier).digest()))
  pendingStart = url.href
  void shell.openExternal(url.href)
  openSignIn({ state: 'waiting', co: company })
}

/** The full window asked to sign in again (an old page, an ended session): back to the small window, sign-in started. */
function toSignIn(company: string | null): void {
  closeMain()
  const co: Company = company === 'tmc' || company === 'scl' ? company : (settings.company ?? 'scl')
  beginSignIn(co)
}

/** The browser handed the sign-in back (pivotmail://auth?t=…): trade the ticket and our secret for this window's session. */
async function handleLink(link: string): Promise<void> {
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return
  }
  const verb = u.host || u.pathname.replace(/^\/+/, '')
  if (verb === 'open' || verb === 'read' || verb === 'inbox') {
    mailAction(verb, u)
    return
  }
  if (verb !== 'auth') return
  const t = u.searchParams.get('t')
  const base = baseUrl()
  // Only a sign-in this app started (in the last 10 minutes) is accepted: a link arriving out of the blue is ignored.
  if (!t || !base || !pending || Date.now() - pending.at > 10 * 60_000) {
    if (t && signin) openSignIn({ error: 'expired' })
    else {
      showWindow()
      if (win && t) void dialog.showMessageBox(win, { type: 'info', message: 'Please sign in again', detail: 'That sign-in was not started from this app, or took too long.' })
    }
    return
  }
  const body = new URLSearchParams({ t, v: pending.verifier }).toString()
  // The full window is prepared out of sight and signs in; the small window says so and stays until that has worked.
  const co = settings.company ?? 'scl'
  if (signin) openSignIn({ state: 'finishing', co })
  if (!win) createWindow(true, false)
  const w = win as BrowserWindow | null
  if (!w) return
  try {
    await w.loadURL(`${base}/api/auth/desktop`, {
      postData: [{ type: 'rawData', bytes: Buffer.from(body) }],
      extraHeaders: 'Content-Type: application/x-www-form-urlencoded',
    })
  } catch {
    /* judged by where the window ended up, below */
  }
  let landed: URL | null = null
  try {
    landed = new URL(w.webContents.getURL())
  } catch {
    landed = null
  }
  const problem = !landed || !isSameSite(landed) ? 'unavailable' : landed.searchParams.get('auth_error')
  if (problem) {
    // The secret is used up only by a sign-in that worked: a bogus pivotmail:// link (any website can open one) must not spoil
    // the real sign-in still in progress in the browser, so "expired" leaves the small window waiting as it was.
    if (signin) {
      closeMain()
      if (problem === 'state') openSignIn({ state: 'waiting', co })
      else openSignIn({ error: /^[a-z_]{1,20}$/.test(problem) ? problem : 'unavailable' })
    }
    return
  }
  pending = null
  pendingStart = null
  reveal(w)
  signin?.close()
}

/* ------------------------------------------------------------------ new-mail alerts (toast.ts) */

/** Alerts stay referenced while shown (Windows drops the click handler of an alert that was garbage-collected). */
const shownToasts: Notification[] = []
/** Alert clicks that arrived before the page was ready to handle them (for example the click that started the app). */
let queuedActions: { action: string; accountId: string; messageId: string }[] = []
let actionsReady = false
/** An update became ready before the page could show it. */
let pendingUpdateNote: string | null = null

function toastKey(): string {
  if (!settings.toastKey) {
    settings.toastKey = b64url(randomBytes(18))
    saveSettings()
  }
  return settings.toastKey
}

function mailLink(action: 'open' | 'read' | 'inbox', accountId: string, messageId?: string): string {
  const q = new URLSearchParams({ a: accountId, k: toastKey() })
  if (messageId) q.set('m', messageId)
  return `${SCHEME}://${action}?${q.toString()}`
}

/** A click on an alert or one of its buttons: only with this computer's key; opens the window and tells the page what to do. */
function mailAction(action: string, u: URL): void {
  if (!settings.toastKey || u.searchParams.get('k') !== settings.toastKey) return
  const accountId = u.searchParams.get('a') ?? ''
  const messageId = u.searchParams.get('m') ?? ''
  if (!/^[A-Za-z0-9:_-]{1,200}$/.test(accountId) || (messageId && !/^[A-Za-z0-9:_-]{1,200}$/.test(messageId))) return
  if (action !== 'read') showWindow()
  const item = { action, accountId, messageId }
  if (win && actionsReady) win.webContents.send('pm:mail-action', item)
  else queuedActions.push(item)
}

/** Writes the sender's initials picture (a small PNG drawn by the page) where Windows can read it for the alert. */
function avatarFile(dataUrl: unknown): string | undefined {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 200_000) return undefined
  try {
    const bytes = Buffer.from(dataUrl.slice(22), 'base64')
    const dir = path.join(app.getPath('userData'), 'alert-pictures')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}.png`)
    if (!fs.existsSync(file)) fs.writeFileSync(file, bytes)
    return file
  } catch {
    return undefined
  }
}

/** A new-mail alert on a Mac: the Mac's own alert (sender, subject, first line); a click opens the mail, "Mark as read" too. */
function showMacAlert(payload: unknown): boolean {
  const t = cleanToast(payload)
  if (!t || !Notification.isSupported()) return false
  const c = macAlert(t)
  ;(global as unknown as { __pmLastMacAlert?: unknown }).__pmLastMacAlert = c // read by the Mac test
  try {
    const n = new Notification({ ...c, silent: false, actions: t.kind === 'one' ? [{ type: 'button', text: 'Mark as read' }] : [] })
    const act = (action: 'open' | 'read' | 'inbox') => {
      const item = { action, accountId: t.accountId, messageId: t.kind === 'one' ? t.messageId : '' }
      if (action !== 'read') showWindow()
      if (win && actionsReady) win.webContents.send('pm:mail-action', item)
      else queuedActions.push(item)
    }
    n.on('click', () => act(t.kind === 'one' ? 'open' : 'inbox'))
    n.on('action', () => act('read'))
    n.on('failed', (_e, err) => {
      ;(global as unknown as { __pmToastError?: string }).__pmToastError = String(err)
    })
    keep(n)
    n.show()
    return true
  } catch {
    return false
  }
}

function showMailToast(payload: unknown, avatar: unknown): boolean {
  const t = cleanToast(payload)
  if (!t || process.platform !== 'win32' || !Notification.isSupported()) return false
  const pic = avatarFile(avatar)
  const xml = toastXml(t, (action, messageId) => mailLink(action, t.accountId, messageId), pic ? pathToFileURL(pic).href : undefined)
  try {
    const n = new Notification({ toastXml: xml })
    n.on('failed', (_e, err) => {
      ;(global as unknown as { __pmToastError?: string }).__pmToastError = String(err) // read by the Windows test
      plainToast(t) // Windows refused the rich alert: a plain one, so the mail is still announced
    })
    keep(n)
    n.show()
    ;(global as unknown as { __pmLastToast?: string }).__pmLastToast = xml
    return true
  } catch {
    return plainToast(t)
  }
}

function keep(n: Notification): void {
  shownToasts.push(n)
  if (shownToasts.length > 20) shownToasts.shift()
}

/** The simple alert (title and one line, no picture or buttons); a click opens the mail like the rich one. */
function plainToast(t: MailToast): boolean {
  try {
    const title = t.kind === 'one' ? t.sender : `${t.count} new messages`
    const body = t.kind === 'one' ? t.subject : t.lines.map((l) => `${l.sender}: ${l.subject}`).join('\n')
    const n = new Notification({ title, body, silent: false })
    n.on('click', () => {
      showWindow()
      const item = { action: t.kind === 'one' ? 'open' : 'inbox', accountId: t.accountId, messageId: t.kind === 'one' ? t.messageId : '' }
      if (win && actionsReady) win.webContents.send('pm:mail-action', item)
      else queuedActions.push(item)
    })
    keep(n)
    n.show()
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ navigation rules */

function isSameSite(url: URL): boolean {
  const base = baseUrl()
  return !!base && url.origin === new URL(base).origin
}

function guard(contents: WebContents): void {
  const onNavigate = (e: ElectronEvent, target: string) => {
    let u: URL
    try {
      u = new URL(target)
    } catch {
      e.preventDefault()
      return
    }
    if (u.protocol === 'file:' && /\/static\/(signin|offline)\.html$/.test(u.pathname)) return
    if (isSameSite(u)) {
      if (u.pathname === '/api/auth/start') {
        e.preventDefault()
        toSignIn(u.searchParams.get('company'))
      } else if (u.pathname.startsWith('/api/accounts/connect')) {
        // "Add account" asks Google for mailbox permission: that happens in the browser too; the new mailbox shows here afterwards.
        e.preventDefault()
        void shell.openExternal(u.href)
      }
      return
    }
    e.preventDefault()
    if (['https:', 'http:', 'mailto:'].includes(u.protocol)) void shell.openExternal(u.href)
  }
  contents.on('will-navigate', onNavigate)
  contents.on('will-redirect', (e, target) => {
    // Pivot Mail's window shows Pivot Mail only: a redirect elsewhere (Google's sign-in, which Google refuses inside app windows,
    // or any other site) opens in the normal browser, so no other site ever gets this window and its bridge.
    let u: URL
    try {
      u = new URL(target)
    } catch {
      e.preventDefault()
      return
    }
    if (isSameSite(u)) return
    e.preventDefault()
    if (u.protocol === 'https:' || u.protocol === 'http:') void shell.openExternal(u.href)
  })
  contents.setWindowOpenHandler(({ url }) => {
    // Print and file previews open as blob: windows of this app; everything else goes to the normal browser.
    if (url.startsWith('blob:') || url === 'about:blank') {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } } }
    }
    try {
      const u = new URL(url)
      if (['https:', 'http:', 'mailto:'].includes(u.protocol)) void shell.openExternal(u.href)
    } catch {
      /* ignored */
    }
    return { action: 'deny' }
  })
}

/* ------------------------------------------------------------------ the window */

function showWindow(): void {
  const w = win ?? signin
  if (!w) {
    void start(false)
    return
  }
  reveal(w)
}

/** Shows a window (maximised again if it was last time; Windows shows a hidden window the moment it is maximised, so only now). */
function reveal(w: BrowserWindow): void {
  if (w === win && !w.isVisible() && settings.bounds?.maximized) w.maximize()
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

/** Signed in: the full window. Not signed in: the small sign-in window. No connection: the full window explains and retries. */
async function start(hidden: boolean): Promise<void> {
  const base = baseUrl()
  const state = base ? await sessionState(base) : 'out'
  if (state === 'out') openSignIn()
  else createWindow(hidden)
}

/** Asks Pivot Mail whether this computer's session is still valid (with the app's own cookies). */
async function sessionState(base: string): Promise<'in' | 'out' | 'unknown'> {
  try {
    const r = await session.defaultSession.fetch(new URL('/api/auth/session', base).href, { cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(6000) })
    if (r.status === 200) return 'in'
    if (r.status === 401) return 'out'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/** The small sign-in window (about 440 x 600, fixed size, centred), like Outlook's. */
function openSignIn(query: Record<string, string> = {}): void {
  const q = { ...query, dark: settings.dark ? '1' : '0', v: app.getVersion(), first: settings.company ? '0' : '1' }
  if (!signin) {
    signin = new BrowserWindow({
      width: 440,
      height: 600,
      useContentSize: true,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      center: true,
      show: false,
      title: 'Pivot Mail',
      icon: nativeImage.createFromPath(asset('build', 'icon.png')),
      backgroundColor: settings.dark ? '#0b1626' : '#eaf3fc',
      autoHideMenuBar: true,
      webPreferences: { preload: asset('dist', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    })
    signin.once('ready-to-show', () => signin?.show())
    signin.on('closed', () => {
      signin = null
      signinReady = false
      // Closing the sign-in window without signing in ends the app (there is no mail to check yet), like Outlook.
      if (!win) {
        pending = null
        quitting = true
        app.quit()
      }
    })
  } else if (signinReady) {
    // Already showing: move to the next step in place (no reload, so the logo and panel do not flash).
    signin.webContents.send('pm:signin-state', q)
    showWindow()
    return
  } else showWindow()
  signinReady = false
  const w = signin
  w.webContents.once('did-finish-load', () => {
    if (signin === w) signinReady = true
  })
  void w.loadFile(asset('static', 'signin.html'), { query: q }).catch(() => {})
}

/** Removes the full window for good (sign-out, or before signing in again); its size and place are remembered. */
function closeMain(): void {
  if (!win) return
  if (win.isVisible()) rememberBounds()
  const w = win
  win = null
  w.destroy()
}

function createWindow(hidden = false, load = true): void {
  const b = settings.bounds
  win = new BrowserWindow({
    width: b?.width ?? 1360,
    height: b?.height ?? 860,
    x: b?.x,
    y: b?.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Pivot Mail',
    icon: nativeImage.createFromPath(asset('build', 'icon.png')),
    backgroundColor: settings.dark ? '#141416' : '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: asset('dist', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      // Keep checking mail while the window is hidden in the tray.
      backgroundThrottling: false,
    },
  })
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} PivotMailDesktop/${app.getVersion()}`)
  // (An update reopens Pivot Mail on screen only after "Restart now" or behind a locked screen, so taking focus is fine there.)
  win.once('ready-to-show', () => {
    if (hidden || !win) return
    if (startMinimized) {
      startMinimized = false
      win.minimize() // back on the taskbar as it was, without taking focus
    } else reveal(win)
  })
  win.on('close', (e) => {
    rememberBounds()
    if (quitting) return
    // Closing the window keeps Pivot Mail running in the tray, so new mail still arrives.
    e.preventDefault()
    if (isMac && win?.isFullScreen()) {
      // A full-screen window hidden directly leaves a black space on its own desktop: leave full screen first.
      win.once('leave-full-screen', () => win?.hide())
      win.setFullScreen(false)
    } else win?.hide()
    if (!isMac && !settings.trayHintShown && tray) {
      settings.trayHintShown = true
      saveSettings()
      tray.displayBalloon?.({ title: 'Pivot Mail is still running', content: 'New mail alerts keep coming. Right-click the tray icon to quit.', iconType: 'info' })
    }
  })
  win.on('closed', () => {
    win = null
    actionsReady = false
  })
  win.webContents.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) actionsReady = false
  })
  // Cannot reach Pivot Mail (no internet, network not up yet after Windows starts, server down): show the built-in explanation
  // and keep trying, instead of a blank window. Navigations the app itself stops (other sites, sign-in) report "aborted": ignored.
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return
    }
    if (isSameSite(u)) showOffline('offline', `${desc || 'ERR'} (${code})`, u)
  })
  win.webContents.on('did-navigate', (_e, url, status) => {
    if (status < 500) return
    try {
      const u = new URL(url)
      if (isSameSite(u)) showOffline('server', `HTTP ${status}`, u)
    } catch {
      /* ignored */
    }
  })
  const base = baseUrl()
  if (base && load) openApp(base)
}

/* ------------------------------------------------------------------ cannot connect: explain, keep trying, open by itself */

let reconnect: NodeJS.Timeout | null = null
let resumeAt: string | null = null

function openApp(url: string): void {
  win?.loadURL(url).catch(() => {
    /* did-fail-load shows the explanation */
  })
}

function showOffline(reason: 'offline' | 'server', code: string, failed: URL): void {
  if (!win) return
  // Come back to the same page afterwards, except a sign-in step (it is single-use: start from the inbox instead).
  resumeAt = failed.pathname.startsWith('/api/') ? null : failed.href
  void win.loadFile(asset('static', 'offline.html'), { query: { reason, code, dark: settings.dark ? '1' : '0' } }).catch(() => {})
  if (!reconnect) reconnect = setInterval(() => void tryReconnect(), 5000)
}

/** Opens Pivot Mail again as soon as its server answers (every 5 s, at once on "Try again now" or when Windows is back online). */
async function tryReconnect(): Promise<void> {
  const base = baseUrl()
  if (!base || !win) return
  try {
    const r = await net.fetch(new URL('/api/auth/config', base).href, { cache: 'no-store', signal: AbortSignal.timeout(4000) })
    if (r.status >= 500) return
  } catch {
    return
  }
  if (reconnect) clearInterval(reconnect)
  reconnect = null
  openApp(resumeAt ?? base)
}

function rememberBounds(): void {
  if (!win) return
  const maximized = win.isMaximized()
  const r = win.getNormalBounds()
  settings.bounds = { x: r.x, y: r.y, width: r.width, height: r.height, maximized }
  saveSettings()
}

/* ------------------------------------------------------------------ tray */

/** "Restart now" / "Restart to update", pressed by the person: Pivot Mail comes back on screen afterwards. */
function manualRestartToUpdate(): void {
  if (settings.resumeHidden || settings.resumeMinimized) {
    settings.resumeHidden = false
    settings.resumeMinimized = false
    saveSettings()
  }
  restartToUpdate()
}

/** Start Pivot Mail when the person signs in to the computer: quietly in the tray (Windows) or with its window hidden (Mac). */
function setStartAtLogin(on: boolean): void {
  try {
    if (isMac) app.setLoginItemSettings({ openAtLogin: on })
    else app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] })
  } catch {
    /* ignored */
  }
}

/** Rebuilds the tray / menu bar menu (it shows the update and start-at-login state). */
let refreshTray: () => void = () => {}

function buildTray(): void {
  // Mac: a black-and-clear "template" symbol that macOS tints for light and dark menu bars (trayTemplate@2x.png is picked up too).
  tray = new Tray(nativeImage.createFromPath(asset('build', isMac ? 'trayTemplate.png' : 'tray.png')))
  tray.setToolTip('Pivot Mail')
  if (!isMac) tray.on('click', showWindow) // (on a Mac a click opens the menu, as with every menu bar symbol)
  const menu = () =>
    Menu.buildFromTemplate([
      { label: 'Open Pivot Mail', click: showWindow },
      ...(updateReadyVersion() ? [{ label: `Restart to update (version ${updateReadyVersion()})`, click: () => manualRestartToUpdate() }] : []),
      ...(macUpdateVersion() ? [{ label: `Download Pivot Mail ${macUpdateVersion()}…`, click: () => void shell.openExternal(MAC_DOWNLOAD_PAGE) }] : []),
      { type: 'separator' },
      {
        label: isMac ? 'Open at Login' : 'Start with Windows',
        type: 'checkbox',
        checked: !!settings.startWithWindows,
        click: (item) => {
          settings.startWithWindows = item.checked
          saveSettings()
          setStartAtLogin(item.checked)
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Pivot Mail',
        accelerator: isMac ? 'Command+Q' : undefined,
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ])
  refreshTray = () => tray?.setContextMenu(menu())
  refreshTray()
  tray.on('right-click', refreshTray)
}

/**
 * The Mac's menu bar (Pivot Mail, Edit, Window). Without it ⌘C, ⌘V, ⌘A, ⌘Z, ⌘Q and ⌘W would not work at all on a Mac.
 * Deliberately no View menu: ⌘R must reach Pivot Mail as "Reply", not reload the page. Windows keeps no menu (Ctrl+R = Reply).
 */
function macMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Pivot Mail',
      submenu: [
        { role: 'about', label: 'About Pivot Mail' },
        { type: 'separator' },
        {
          label: 'Open at Login',
          type: 'checkbox',
          checked: !!settings.startWithWindows,
          click: (item) => {
            settings.startWithWindows = item.checked
            saveSettings()
            setStartAtLogin(item.checked)
            refreshTray()
          },
        },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Pivot Mail' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Pivot Mail' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'togglefullscreen' }, { type: 'separator' }, { label: 'Pivot Mail', accelerator: 'Command+0', click: showWindow }, { role: 'close' }, { type: 'separator' }, { role: 'front' }],
    },
  ])
}

/* ------------------------------------------------------------------ the bridge (see preload.ts) */

/** Folders holding copies of dragged attachments; removed when the app quits, and any left from a crash at the next start. */
const dragDirs: string[] = []
/** Writes attachments handed over by the page to a fresh temporary folder (safe, unique names) and returns their paths. */
function writeTempFiles(files: unknown): string[] {
  if (!Array.isArray(files) || files.length === 0) return []
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-mail-'))
  dragDirs.push(dir)
  const used = new Set<string>()
  const paths: string[] = []
  for (const f of files.slice(0, 50) as { name?: unknown; bytes?: unknown }[]) {
    if (typeof f.name !== 'string' || !(f.bytes instanceof Uint8Array)) continue
    const full = path.join(dir, uniqueName(safeFileName(f.name), used))
    fs.writeFileSync(full, f.bytes)
    paths.push(full)
  }
  return paths
}

/**
 * Puts real files on the Windows clipboard, so Ctrl+V pastes them into a folder, the desktop, an Outlook or Teams message or a
 * chat, exactly like copying files in Explorer. Windows' own Set-Clipboard does it (Electron cannot put several files on the
 * clipboard by itself). The paths travel in an environment variable, never inside the command text.
 */
function filesToClipboard(paths: string[]): Promise<boolean> {
  if (isMac) {
    // The same as copying files in Finder (file addresses on the Mac's clipboard): ⌘V pastes them in Finder, Mail, Teams,
    // WhatsApp and the rest. Done by the Mac's own scripting (osascript); the paths travel in an environment variable, never
    // inside the script text.
    const jxa =
      'ObjC.import("AppKit");' +
      'const list = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey("PM_CLIP_FILES")).split("\\n");' +
      'const urls = $.NSMutableArray.array; for (const p of list) urls.addObject($.NSURL.fileURLWithPath(p));' +
      'const pb = $.NSPasteboard.generalPasteboard; pb.clearContents; pb.writeObjects(urls) ? "ok" : "no"'
    return new Promise((resolve) => {
      execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', jxa], { timeout: 20_000, env: { ...process.env, PM_CLIP_FILES: paths.join('\n') } }, (err, out) => {
        ;(global as unknown as { __pmClipboardFiles?: string[] }).__pmClipboardFiles = paths // read by the Mac test
        resolve(!err && String(out).trim() === 'ok')
      })
    })
  }
  if (process.platform !== 'win32') {
    ;(global as unknown as { __pmClipboardFiles?: string[] }).__pmClipboardFiles = paths // automated tests on other systems
    return Promise.resolve(true)
  }
  const ps = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const cmd = "Set-Clipboard -LiteralPath ($env:PM_CLIP_FILES -split \"`n\")"
  return new Promise((resolve) => {
    execFile(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { windowsHide: true, timeout: 20_000, env: { ...process.env, PM_CLIP_FILES: paths.join('\n') } }, (err) => resolve(!err))
  })
}

function cleanDragFolders(all = false): void {
  const dirs = all ? fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('pivot-mail-')).map((d) => path.join(os.tmpdir(), d)) : dragDirs
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {
      /* in use by Windows Explorer right now; removed next time */
    }
  }
}

/** A bridge call counts only from the Pivot Mail page itself in the main window (not a preview, not another site). */
function fromApp(e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  if (!win || e.sender !== win.webContents) return false
  try {
    return isSameSite(new URL(e.senderFrame?.url ?? e.sender.getURL()))
  } catch {
    return false
  }
}

/** The small sign-in window's own page (a file inside the app). */
function fromSignIn(e: Electron.IpcMainEvent): boolean {
  if (!signin || e.sender !== signin.webContents) return false
  try {
    const u = new URL(e.senderFrame?.url ?? e.sender.getURL())
    return u.protocol === 'file:' && u.pathname.endsWith('/static/signin.html')
  } catch {
    return false
  }
}

function bridge(): void {
  ipcMain.on('pm:signin', (e, company: unknown) => {
    if (fromSignIn(e) && (company === 'scl' || company === 'tmc')) beginSignIn(company)
  })
  ipcMain.on('pm:signin-reopen', (e) => {
    if (fromSignIn(e) && pending && pendingStart) void shell.openExternal(pendingStart)
  })
  ipcMain.on('pm:signin-back', (e) => {
    if (!fromSignIn(e)) return
    pending = null
    pendingStart = null
    openSignIn()
  })
  // The page found nobody signed in (signed out here, or the session ended): back to the small sign-in window.
  ipcMain.on('pm:signed-out', (e) => {
    if (!fromApp(e)) return
    closeMain()
    openSignIn()
  })

  ipcMain.on('pm:theme', (e, theme: unknown) => {
    if (!win || !fromApp(e) || (theme !== 'light' && theme !== 'dark')) return
    const dark = theme === 'dark'
    win.setBackgroundColor(dark ? '#141416' : '#ffffff')
    if (!!settings.dark !== dark) {
      settings.dark = dark
      saveSettings()
    }
  })

  ipcMain.on('pm:retry', (e) => {
    if (!win || e.sender !== win.webContents) return
    try {
      const u = new URL(e.senderFrame?.url ?? e.sender.getURL())
      if (u.protocol === 'file:' && u.pathname.endsWith('/static/offline.html')) void tryReconnect()
    } catch {
      /* ignored */
    }
  })

  // New-mail alert drawn by Windows (false: not available here, the page then uses its own simpler alert).
  ipcMain.handle('pm:notify', (e, payload: unknown, avatar: unknown) => {
    if (!fromApp(e)) return false
    if (isMac) {
      // (the tests compare the alert's content with Windows': the same cleaned text, sender, subject and links)
      const t = cleanToast(payload)
      if (t) (global as unknown as { __pmLastToast?: string }).__pmLastToast = toastXml(t, (action, messageId) => mailLink(action, t.accountId, messageId))
      return showMacAlert(payload)
    }
    if (process.platform !== 'win32') {
      // Automated tests on other systems: keep what would have been shown.
      const t = cleanToast(payload)
      if (!t) return false
      ;(global as unknown as { __pmLastToast?: string }).__pmLastToast = toastXml(t, (action, messageId) => mailLink(action, t.accountId, messageId), avatarFile(avatar))
      return false
    }
    return showMailToast(payload, avatar)
  })
  // The page is ready for alert clicks: hand over any that arrived while it was starting.
  ipcMain.on('pm:actions-ready', (e) => {
    if (!win || !fromApp(e)) return
    actionsReady = true
    for (const a of queuedActions) win.webContents.send('pm:mail-action', a)
    queuedActions = []
    const v = pendingUpdateNote ?? updateReadyVersion()
    if (v) win.webContents.send('pm:update-ready', v)
    pendingUpdateNote = null
  })

  // "Restart now" on the update note in the page.
  ipcMain.on('pm:restart-to-update', (e) => {
    if (!fromApp(e)) return
    // quitting is set by before-quit only once the restart really starts; if it cannot, closing the window still hides it.
    manualRestartToUpdate()
  })

  // A clicked new-mail alert brings the window back, also from the tray.
  ipcMain.on('pm:show', (e) => {
    if (fromApp(e)) showWindow()
  })

  ipcMain.on('pm:badge', (e, count: unknown, png: unknown) => {
    if (!win || !fromApp(e)) return
    const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    tray?.setToolTip(n > 0 ? `Pivot Mail · ${n} unread` : 'Pivot Mail')
    if (isMac) {
      app.dock?.setBadge(n > 0 ? (n > 99 ? '99+' : String(n)) : '')
      return
    }
    if (n > 0 && typeof png === 'string' && png.startsWith('data:image/png;base64,')) win.setOverlayIcon(nativeImage.createFromDataURL(png), `${n} unread`)
    else win.setOverlayIcon(null, '')
  })

  // "Copy" on attachments: the files themselves, ready to paste anywhere in Windows.
  ipcMain.handle('pm:copy-files', async (e, files: unknown) => {
    if (!fromApp(e)) return 0
    try {
      const paths = writeTempFiles(files)
      if (paths.length === 0) return 0
      return (await filesToClipboard(paths)) ? paths.length : 0
    } catch {
      return 0
    }
  })

  ipcMain.on('pm:drag', (e, files: unknown) => {
    if (!fromApp(e)) return
    try {
      const paths = writeTempFiles(files)
      if (paths.length === 0) return
      const icon = nativeImage.createFromPath(asset('build', 'tray.png'))
      if (paths.length === 1) e.sender.startDrag({ file: paths[0] as string, icon })
      else e.sender.startDrag({ file: paths[0] as string, files: paths, icon })
    } catch {
      /* a file Windows refused: the drag simply does not start (never an error box) */
    }
  })
}

/* ------------------------------------------------------------------ the local mail database (see store.ts) */

const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 200
const isIdList = (x: unknown): x is string[] => Array.isArray(x) && x.length <= 20_000 && x.every(isId)

function startStore(): void {
  // Inside the installed app the code sits in an archive a worker thread cannot start from, so the worker file is kept unpacked.
  const file = asset('dist', 'store-worker.js').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
  try {
    worker = new Worker(file, { workerData: { file: path.join(app.getPath('userData'), 'mail.db') } })
  } catch {
    worker = null
    return
  }
  worker.on('message', (m: { id: number; ok: boolean; r?: unknown }) => {
    const w = waiting.get(m.id)
    if (!w) return
    waiting.delete(m.id)
    w.resolve(m.ok ? m.r : w.fallback)
  })
  const fail = () => {
    worker = null
    for (const w of waiting.values()) w.resolve(w.fallback)
    waiting.clear()
  }
  worker.on('error', fail)
  worker.on('exit', fail)
}

/** One request to the database thread; answers `fallback` if it is not running or the request fails (never an error). */
function storeCall(op: string, fallback: unknown, a?: unknown, b?: unknown): Promise<unknown> {
  if (!worker) return Promise.resolve(fallback)
  const id = ++seq
  return new Promise((resolve) => {
    waiting.set(id, { resolve, fallback })
    worker?.postMessage({ id, op, a, b })
  })
}

function storeBridge(): void {
  ipcMain.handle('pm:store', (e, op: unknown, a: unknown, b: unknown) => {
    // Only the Pivot Mail page itself may read or change the mail database (never the first-run screen or a preview window).
    if (!worker || !fromApp(e)) return null
    switch (op) {
      case 'load':
        return isId(a) ? storeCall('load', [], a) : []
      case 'save':
        return Array.isArray(a) && a.length <= 20_000 ? storeCall('save', null, a) : null
      case 'remove':
        return isIdList(a) ? storeCall('remove', null, a) : null
      case 'thread':
        return isId(a) && isId(b) ? storeCall('thread', [], a, b) : []
      case 'search':
        return isIdList(a) && typeof b === 'string' && b.length <= 500 ? storeCall('search', [], a, b) : []
      case 'getMeta':
        return isId(a) ? storeCall('getMeta', null, a) : null
      case 'setMeta':
        return isId(a) && typeof b === 'string' && b.length <= 10_000 ? storeCall('setMeta', null, a, b) : null
      case 'clearAccount':
        return isId(a) ? storeCall('clearAccount', null, a) : null
      case 'clearAll':
        return storeCall('clearAll', null)
      default:
        return null
    }
  })
}

/* ------------------------------------------------------------------ start */

/** Mac: started by "Open at Login" (the window stays hidden; the dock and menu bar icons are there, mail is checked). */
function openedHiddenAtLogin(): boolean {
  if (!isMac) return false
  try {
    const l = app.getLoginItemSettings()
    return !!l.wasOpenedAtLogin
  } catch {
    return false
  }
}

// Automated tests only: a separate settings folder per run.
if (process.env.PIVOT_MAIL_USER_DATA) app.setPath('userData', process.env.PIVOT_MAIL_USER_DATA)
app.setAppUserModelId(APP_ID) // Windows alerts carry the Pivot Mail name and icon
Menu.setApplicationMenu(null) // no hidden menu shortcuts (Ctrl+R must reach the app as "Reply", not reload the page); Mac: macMenu()

// Mac: pivotmail:// links (sign-in hand-back, alert clicks) arrive here, not as a second copy of the app. They can arrive before
// the app is ready (a link that started Pivot Mail): kept until then.
let ready = false
let earlyLink: string | null = null
app.on('open-url', (e, url) => {
  e.preventDefault()
  if (!url.startsWith(`${SCHEME}://`)) return
  if (!ready) {
    earlyLink = url
    return
  }
  void handleLink(url)
  if (!url.startsWith(`${SCHEME}://read`)) showWindow()
})
// Mac: clicking the dock icon brings the window back (it stays in the dock while the window is closed).
app.on('activate', () => {
  if (ready && primary) showWindow()
})

app.whenReady().then(() => {
  if (!primary) return
  settings = readSettings()
  // Mac: no installer asks, so "Open at Login" starts on, like the ticked box in the Windows installer (untick it in the menu).
  if (isMac && typeof settings.startWithWindows !== 'boolean' && !process.env.PIVOT_MAIL_USER_DATA) {
    settings.startWithWindows = true
    saveSettings()
  }
  // "Run at startup" chosen in the installer (or the tray): the system's own start-up list is kept in step with the setting.
  if ((process.platform === 'win32' || isMac) && typeof settings.startWithWindows === 'boolean') setStartAtLogin(settings.startWithWindows)
  if (isMac) Menu.setApplicationMenu(macMenu())
  try {
    cleanDragFolders(true) // copies left behind by a crash or a forced shutdown
  } catch {
    /* ignored */
  }
  registerScheme()
  // Only what the app needs: alerts and the clipboard. Camera, microphone, location and the rest are refused.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(['notifications', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission)))
  startStore()
  bridge()
  storeBridge()
  buildTray()
  // Mac: without Apple's paid certificate the app cannot replace itself, so it only says when a newer version can be downloaded.
  if (isMac)
    startMacUpdateCheck((version) => {
      refreshTray()
      try {
        const n = new Notification({ title: `Pivot Mail ${version} is available`, body: 'Click to download it. Your mail and settings stay as they are.' })
        n.on('click', () => void shell.openExternal(MAC_DOWNLOAD_PAGE))
        keep(n)
        n.show()
      } catch {
        /* ignored */
      }
    })
  else startUpdates({
    onReady(version) {
      tray?.displayBalloon?.({ title: 'Pivot Mail update ready', content: `Version ${version} installs when Pivot Mail restarts.`, iconType: 'info' })
      if (win && actionsReady) win.webContents.send('pm:update-ready', version)
      else pendingUpdateNote = version
    },
    mayInstallWhileIdle(locked) {
      return locked || !win || !win.isVisible() || win.isMinimized()
    },
    beforeIdleInstall() {
      settings.resumeHidden = !win || !win.isVisible()
      settings.resumeMinimized = !!win && win.isVisible() && win.isMinimized() // (Windows counts a minimised window as visible)
      saveSettings()
    },
  })
  // Started by Windows at sign-in (--hidden), or reopened by an update that installed itself while Pivot Mail sat in the tray.
  const hidden = process.argv.includes('--hidden') || (process.argv.includes('--updated') && !!settings.resumeHidden) || openedHiddenAtLogin()
  startMinimized = process.argv.includes('--updated') && !!settings.resumeMinimized
  if (settings.resumeHidden || settings.resumeMinimized) {
    settings.resumeHidden = false
    settings.resumeMinimized = false
    saveSettings()
  }
  ready = true
  void start(hidden).then(() => {
    const link = earlyLink ?? process.argv.find((a) => a.startsWith(`${SCHEME}://`))
    earlyLink = null
    if (link) void handleLink(link)
  })
})

app.on('before-quit', () => {
  quitting = true
})
let closed = false
app.on('will-quit', (e) => {
  cleanDragFolders()
  // Close the database properly before leaving (everything written, nothing half-saved), then quit.
  if (worker && !closed) {
    e.preventDefault()
    closed = true
    // At most 1 s: an update's installer closes Pivot Mail forcibly shortly after asking (the database survives that anyway).
    void Promise.race([storeCall('close', null), new Promise((r) => setTimeout(r, 1000))])
      .then(() => worker?.terminate())
      .finally(() => {
        worker = null
        app.quit()
      })
  }
})
app.on('window-all-closed', () => {
  /* stay in the tray */
})
// Every window (the main one and any print or preview window) follows the same navigation rules.
app.on('web-contents-created', (_e, contents) => guard(contents))
