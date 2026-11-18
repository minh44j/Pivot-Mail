/**
 * Pivot Mail for Windows.
 *
 * The app window shows the same Pivot Mail as the website (so every screen, fix and feature is shared), and adds what a browser tab
 * cannot do well: a tray icon that keeps mail checking while the window is closed, real Windows alerts with the Pivot icon, the unread
 * number on the taskbar icon, dragging attachments out to the desktop or a folder, and a local mail database for instant search (store.ts).
 *
 * Sign-in: Google does not allow its sign-in page inside an app's own window, so sign-in happens in the person's normal browser and is
 * handed back to the app (see beginSignIn / redeem, and web/api/_lib/auth/desktop.ts on the server).
 */
import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, session, shell } from 'electron'
import type { Event as ElectronEvent, WebContents } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { safeFileName, uniqueName } from './files'

type Company = 'scl' | 'tmc'
const HOSTS: Record<Company, string> = { scl: 'https://mail.pivotscl.com', tmc: 'https://mail.pivottmc.com' }
/** Development and automated tests only: point the app at another address (never set on staff computers). */
const DEV_URL = process.env.PIVOT_MAIL_URL?.replace(/\/+$/, '') || null
const APP_ID = 'com.pivot.mail'
const SCHEME = 'pivotmail'

interface Settings {
  company?: Company
  bounds?: { x: number; y: number; width: number; height: number; maximized?: boolean }
  startWithWindows?: boolean
  trayHintShown?: boolean
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
let tray: Tray | null = null
let quitting = false
/** The mail database's own thread (store-worker.ts); null if it could not start (the page then keeps its smaller browser copy). */
let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, { resolve: (v: unknown) => void; fallback: unknown }>()
/** The secret of a sign-in in progress (its hash went to the browser; the secret itself never leaves this app). */
let pending: { verifier: string; at: number } | null = null

/* ------------------------------------------------------------------ single instance and the pivotmail:// link */

/** False in a second copy started while Pivot Mail already runs: it hands its link over and ends without opening anything. */
const primary = app.requestSingleInstanceLock()
if (!primary) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const link = argv.find((a) => a.startsWith(`${SCHEME}://`))
    if (link) void handleLink(link)
    showWindow()
  })
}

function registerScheme(): void {
  // During development Electron runs from a folder, so Windows must be told how to start it.
  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])])
  else app.setAsDefaultProtocolClient(SCHEME)
}

/* ------------------------------------------------------------------ sign-in handoff */

const b64url = (b: Buffer) => b.toString('base64url')

/** The web app asked to sign in: open the person's browser with the hash of a fresh secret. */
function beginSignIn(from: URL): void {
  const base = baseUrl()
  if (!base) return
  const verifier = b64url(randomBytes(32))
  pending = { verifier, at: Date.now() }
  const url = new URL('/api/auth/start', base)
  const company = from.searchParams.get('company')
  if (company === 'scl' || company === 'tmc') url.searchParams.set('company', company)
  url.searchParams.set('desktop', b64url(createHash('sha256').update(verifier).digest()))
  void shell.openExternal(url.href)
}

/** The browser handed the sign-in back (pivotmail://auth?t=…): trade the ticket and our secret for this window's session. */
async function handleLink(link: string): Promise<void> {
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return
  }
  if (u.host !== 'auth' && u.pathname.replace(/^\/+/, '') !== 'auth') return
  const t = u.searchParams.get('t')
  const base = baseUrl()
  // Only a sign-in this app started (in the last 10 minutes) is accepted: a link arriving out of the blue is ignored.
  if (!t || !base || !pending || Date.now() - pending.at > 10 * 60_000) {
    showWindow()
    if (win && t) void dialog.showMessageBox(win, { type: 'info', message: 'Please sign in again', detail: 'That sign-in was not started from this app, or took too long.' })
    return
  }
  const body = new URLSearchParams({ t, v: pending.verifier }).toString()
  showWindow()
  try {
    await win?.loadURL(`${base}/api/auth/desktop`, {
      postData: [{ type: 'rawData', bytes: Buffer.from(body) }],
      extraHeaders: 'Content-Type: application/x-www-form-urlencoded',
    })
  } catch {
    /* the page shows its own error */
  }
  // The secret is used up only by a sign-in that worked: a bogus pivotmail:// link (any website can open one) must not spoil the
  // real sign-in still in progress in the browser.
  if (win && !win.webContents.getURL().includes('auth_error')) pending = null
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
    if (u.protocol === 'file:' && u.pathname.endsWith('/static/choose.html')) return
    if (isSameSite(u)) {
      if (u.pathname === '/api/auth/start') {
        e.preventDefault()
        beginSignIn(u)
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
  if (!win) createWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow(hidden = false): void {
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
    backgroundColor: '#ffffff',
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
  if (b?.maximized) win.maximize()
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} PivotMailDesktop/${app.getVersion()}`)
  win.once('ready-to-show', () => {
    if (!hidden) win?.show()
  })
  win.on('close', (e) => {
    rememberBounds()
    if (quitting) return
    // Closing the window keeps Pivot Mail running in the tray, so new mail still arrives.
    e.preventDefault()
    win?.hide()
    if (!settings.trayHintShown && tray) {
      settings.trayHintShown = true
      saveSettings()
      tray.displayBalloon?.({ title: 'Pivot Mail is still running', content: 'New mail alerts keep coming. Right-click the tray icon to quit.', iconType: 'info' })
    }
  })
  win.on('closed', () => {
    win = null
  })
  const base = baseUrl()
  if (base) void win.loadURL(base)
  else void win.loadFile(asset('static', 'choose.html'))
}

function rememberBounds(): void {
  if (!win) return
  const maximized = win.isMaximized()
  const r = win.getNormalBounds()
  settings.bounds = { x: r.x, y: r.y, width: r.width, height: r.height, maximized }
  saveSettings()
}

/* ------------------------------------------------------------------ tray */

function buildTray(): void {
  tray = new Tray(nativeImage.createFromPath(asset('build', 'tray.png')))
  tray.setToolTip('Pivot Mail')
  tray.on('click', showWindow)
  const menu = () =>
    Menu.buildFromTemplate([
      { label: 'Open Pivot Mail', click: showWindow },
      { type: 'separator' },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: !!settings.startWithWindows,
        click: (item) => {
          settings.startWithWindows = item.checked
          saveSettings()
          app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] })
        },
      },
      { label: 'Change company…', enabled: !DEV_URL, click: chooseAgain },
      { type: 'separator' },
      {
        label: 'Quit Pivot Mail',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ])
  tray.setContextMenu(menu())
  tray.on('right-click', () => tray?.setContextMenu(menu()))
}

function chooseAgain(): void {
  settings.company = undefined
  saveSettings()
  showWindow()
  void win?.loadFile(asset('static', 'choose.html'))
}

/* ------------------------------------------------------------------ the bridge (see preload.ts) */

/** Folders holding copies of dragged attachments; removed when the app quits, and any left from a crash at the next start. */
const dragDirs: string[] = []
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

/** The first-run company screen (a file inside the app). */
function fromChooser(e: Electron.IpcMainEvent): boolean {
  if (!win || e.sender !== win.webContents) return false
  try {
    const u = new URL(e.senderFrame?.url ?? e.sender.getURL())
    return u.protocol === 'file:' && u.pathname.endsWith('/static/choose.html')
  } catch {
    return false
  }
}

function bridge(): void {
  ipcMain.on('pm:choose-company', (e, company: unknown) => {
    if (!win || !fromChooser(e) || (company !== 'scl' && company !== 'tmc')) return
    settings.company = company
    saveSettings()
    void win.loadURL(HOSTS[company])
  })

  // A clicked new-mail alert brings the window back, also from the tray.
  ipcMain.on('pm:show', (e) => {
    if (fromApp(e)) showWindow()
  })

  ipcMain.on('pm:badge', (e, count: unknown, png: unknown) => {
    if (!win || !fromApp(e)) return
    const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    tray?.setToolTip(n > 0 ? `Pivot Mail · ${n} unread` : 'Pivot Mail')
    if (n > 0 && typeof png === 'string' && png.startsWith('data:image/png;base64,')) win.setOverlayIcon(nativeImage.createFromDataURL(png), `${n} unread`)
    else win.setOverlayIcon(null, '')
  })

  ipcMain.on('pm:drag', (e, files: unknown) => {
    if (!fromApp(e) || !Array.isArray(files) || files.length === 0) return
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-mail-'))
      dragDirs.push(dir)
      const used = new Set<string>()
      const paths: string[] = []
      for (const f of files.slice(0, 50) as { name?: unknown; bytes?: unknown }[]) {
        if (typeof f.name !== 'string' || !(f.bytes instanceof Uint8Array)) continue
        const name = uniqueName(safeFileName(f.name), used)
        const full = path.join(dir, name)
        fs.writeFileSync(full, f.bytes)
        paths.push(full)
      }
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

// Automated tests only: a separate settings folder per run.
if (process.env.PIVOT_MAIL_USER_DATA) app.setPath('userData', process.env.PIVOT_MAIL_USER_DATA)
app.setAppUserModelId(APP_ID) // Windows alerts carry the Pivot Mail name and icon
Menu.setApplicationMenu(null) // no hidden menu shortcuts (Ctrl+R must reach the app as "Reply", not reload the page)

app.whenReady().then(() => {
  if (!primary) return
  settings = readSettings()
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
  const hidden = process.argv.includes('--hidden')
  createWindow(hidden)
  const link = process.argv.find((a) => a.startsWith(`${SCHEME}://`))
  if (link) void handleLink(link)
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
    void storeCall('close', null)
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
