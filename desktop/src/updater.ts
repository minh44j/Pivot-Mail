/**
 * Automatic updates of the Windows app itself (the mail screens come from the website and update on every deploy without this).
 * Pivot Mail checks GitHub Releases 30 seconds after starting and then every 4 hours, downloads a newer version in the
 * background (checked against the release's SHA-512 checksum), says "update ready", and installs it silently on restart
 * or when Pivot Mail is next closed. Only releases published from this repository's "Desktop release" workflow are used.
 */
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

export interface UpdateEvents {
  /** A newer version has been downloaded and checked: it installs on restart. */
  onReady(version: string): void
}

let readyVersion: string | null = null
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
}

/** "Restart now": install the downloaded version silently and open Pivot Mail again. */
export function restartToUpdate(): void {
  if (readyVersion) autoUpdater.quitAndInstall(true, true)
}
