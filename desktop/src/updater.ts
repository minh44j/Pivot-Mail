/**
 * Automatic updates of the Windows app itself (the mail screens come from the website and update on every deploy without this).
 * Pivot Mail checks GitHub Releases 30 seconds after starting and then every 4 hours, downloads a newer version in the
 * background (checked against the release's SHA-512 checksum) and says "update ready" once. It installs silently:
 *  - when the person presses "Restart now" (page) or "Restart to update" (tray),
 *  - when Pivot Mail is quit, or
 *  - by itself after 20 minutes without keyboard or mouse, when the screen is locked or Pivot Mail is not on screen (closing the window only hides Pivot Mail in the tray,
 *    so without this most staff would stay on the old version for weeks). Drafts are saved every few seconds, so nothing is lost.
 * Only releases published from this repository's "Desktop release" workflow are used.
 */
import { app, powerMonitor } from 'electron'
import { autoUpdater } from 'electron-updater'

export interface UpdateEvents {
  /** A newer version has been downloaded and checked: it installs on restart. Called once per version. */
  onReady(version: string): void
  /** May the update install now, with nobody at the computer? (`locked`: the screen is locked.) */
  mayInstallWhileIdle(locked: boolean): boolean
  /** About to install while the computer is idle: the app notes how to reopen (hidden in the tray or not). */
  beforeIdleInstall(): void
}

const IDLE_INSTALL_SECONDS = 20 * 60

let readyVersion: string | null = null
/** The version an idle install was already tried for (tried once: if it did not go through, it waits for a quit or a click). */
let idleTried: string | null = null
export const updateReadyVersion = () => readyVersion

export function startUpdates(ev: UpdateEvents): void {
  // Running from source (development, Linux tests) there is nothing to update.
  if (!app.isPackaged || process.env.PIVOT_MAIL_NO_UPDATES === '1') return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  // Automated tests only: a local feed on this computer (never another address).
  const testFeed = process.env.PIVOT_MAIL_UPDATE_URL
  if (testFeed && /^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(testFeed)) autoUpdater.setFeedURL({ provider: 'generic', url: testFeed })
  autoUpdater.on('update-downloaded', (info) => {
    // Every later check finds the same downloaded file again: say "update ready" only for a new version.
    if (info.version === readyVersion) return
    readyVersion = info.version
    ;(global as unknown as { __pmUpdate?: string }).__pmUpdate = info.version // read by the Windows test
    ev.onReady(info.version)
  })
  autoUpdater.on('error', (err) => {
    ;(global as unknown as { __pmUpdateError?: string }).__pmUpdateError = String(err) // read by the Windows test; otherwise silent
  })
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined)
  const first = Number(process.env.PIVOT_MAIL_UPDATE_DELAY) > 0 && testFeed ? Number(process.env.PIVOT_MAIL_UPDATE_DELAY) : 30_000
  setTimeout(check, first)
  setInterval(check, 4 * 60 * 60_000)
  // Nobody at the computer for a while: install now rather than wait for a quit that may never come.
  setInterval(() => {
    if (!readyVersion || idleTried === readyVersion) return
    // "Idle" alone is not enough (someone may be watching a long call or a presentation with Pivot Mail on screen): the screen
    // must be locked, or Pivot Mail must not be on screen at all (in the tray).
    let state: string
    try {
      state = powerMonitor.getSystemIdleState(IDLE_INSTALL_SECONDS)
    } catch {
      return
    }
    if (state !== 'idle' && state !== 'locked') return
    if (!ev.mayInstallWhileIdle(state === 'locked')) return
    idleTried = readyVersion
    ev.beforeIdleInstall()
    restartToUpdate()
  }, 5 * 60_000)
}

/** "Restart now": install the downloaded version silently and open Pivot Mail again. False when nothing is ready. */
export function restartToUpdate(): boolean {
  if (!readyVersion) return false
  try {
    autoUpdater.quitAndInstall(true, true)
    return true
  } catch {
    return false
  }
}
