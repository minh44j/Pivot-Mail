/**
 * Pivot Mail for Windows.
 *
 * The app window shows the same Pivot Mail as the website (so every screen, fix and feature is shared), and adds what a browser tab
 * cannot do well: a tray icon that keeps mail checking while the window is closed, real Windows alerts with the Pivot icon, the unread
 * number on the taskbar icon, dragging attachments out to the desktop or a folder, and (later) a local mail database for instant search.
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
/** The secret of a sign-in in progress (its hash went to the browser; the secret itself never leaves this app). */
let pending: { verifier: string; at: number } | null = null

/* ------------------------------------------------------------------ single instance and the pivotmail:// link */

if (!app.requestSingleInstanceLock()) {
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
  pending = null
  showWindow()
  await win?.loadURL(`${base}/api/auth/desktop`, {
    postData: [{ type: 'rawData', bytes: Buffer.from(body) }],
    extraHeaders: 'Content-Type: application/x-www-form-urlencoded',
  })
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
    // A redirect to Google's sign-in inside the window would be refused by Google: send it to the browser instead.
    if (/^https:\/\/accounts\.google\.com\//.test(target)) {
      e.preventDefault()
      void shell.openExternal(target)
    }
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

function bridge(): void {
  ipcMain.on('pm:choose-company', (e, company: unknown) => {
    if (e.sender !== win?.webContents || (company !== 'scl' && company !== 'tmc')) return
    settings.company = company
    saveSettings()
    void win.loadURL(HOSTS[company])
  })

  ipcMain.on('pm:badge', (e, count: unknown, png: unknown) => {
    if (e.sender !== win?.webContents || !win) return
    const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    tray?.setToolTip(n > 0 ? `Pivot Mail · ${n} unread` : 'Pivot Mail')
    if (n > 0 && typeof png === 'string' && png.startsWith('data:image/png;base64,')) win.setOverlayIcon(nativeImage.createFromDataURL(png), `${n} unread`)
    else win.setOverlayIcon(null, '')
  })

  ipcMain.on('pm:drag', (e, files: unknown) => {
    if (e.sender !== win?.webContents || !Array.isArray(files) || files.length === 0) return
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pivot-mail-'))
    const paths: string[] = []
    for (const f of files.slice(0, 50) as { name?: unknown; bytes?: unknown }[]) {
      if (typeof f.name !== 'string' || !(f.bytes instanceof Uint8Array)) continue
      // A file name from an email is untrusted: keep only the name itself, never a path, and nothing Windows refuses.
      const name = (f.name.split(/[\\/]/).pop() ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 180) || 'attachment'
      const full = path.join(dir, name)
      fs.writeFileSync(full, f.bytes)
      paths.push(full)
    }
    if (paths.length === 0) return
    const icon = nativeImage.createFromPath(asset('build', 'tray.png'))
    if (paths.length === 1) e.sender.startDrag({ file: paths[0] as string, icon })
    else e.sender.startDrag({ file: paths[0] as string, files: paths, icon })
  })
}

/* ------------------------------------------------------------------ start */

// Automated tests only: a separate settings folder per run.
if (process.env.PIVOT_MAIL_USER_DATA) app.setPath('userData', process.env.PIVOT_MAIL_USER_DATA)
app.setAppUserModelId(APP_ID) // Windows alerts carry the Pivot Mail name and icon
Menu.setApplicationMenu(null) // no hidden menu shortcuts (Ctrl+R must reach the app as "Reply", not reload the page)

app.whenReady().then(() => {
  settings = readSettings()
  registerScheme()
  // Only what the app needs: alerts and the clipboard. Camera, microphone, location and the rest are refused.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(['notifications', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission)))
  bridge()
  buildTray()
  const hidden = process.argv.includes('--hidden')
  createWindow(hidden)
  const link = process.argv.find((a) => a.startsWith(`${SCHEME}://`))
  if (link) void handleLink(link)
})

app.on('before-quit', () => {
  quitting = true
})
app.on('window-all-closed', () => {
  /* stay in the tray */
})
// Every window (the main one and any print or preview window) follows the same navigation rules.
app.on('web-contents-created', (_e, contents) => guard(contents))
