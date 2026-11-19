/**
 * The desktop app's installers. Each release of the "Desktop release" workflow also publishes them under these fixed names,
 * so these links always download the newest version, straight away (GitHub sends the file itself; no page in between).
 */
const LATEST = 'https://github.com/minh44j/Pivot-Mail/releases/latest/download'
export const DOWNLOADS = {
  windows: `${LATEST}/PivotMail-Setup.exe`,
  mac: `${LATEST}/PivotMail-mac.dmg`,
} as const

/** Which installer suits the computer this page is open on (null: a phone, a tablet or something else). */
export function thisComputer(): 'windows' | 'mac' | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return null // (iPadOS says "Macintosh")
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac'
  return null
}
