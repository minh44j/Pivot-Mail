/**
 * Keeps every open Pivot Mail on the newest version of the website, with nobody having to quit or refresh.
 *
 * The desktop apps and browser tabs load the website once and can then run for days (closing the window only hides the
 * Windows app in the tray), so a fix deployed today did not reach them until they were quit. The page now asks every
 * 5 minutes, and whenever the person comes back to it, which version the website is serving (the name of its main script,
 * which changes with every deploy). When it is newer:
 *  - nobody is using Pivot Mail (hidden in the tray, a background tab, or no keyboard/mouse for 3 minutes) and nothing is
 *    being written: it reloads itself quietly;
 *  - otherwise a small note says "Pivot Mail was updated" with Refresh, and it reloads by itself once it is idle.
 * No reload loop: a reload remembers which version it was for; if the page that comes back is still not that version (a
 * deploy that has not reached every server yet), that version is only offered with Refresh, never reloaded to again; and
 * no two automatic reloads happen within 10 minutes.
 */

/** The main script this page runs (null while developing, where there is no build to compare). */
export function currentBuild(doc: Document = document): string | null {
  const s = doc.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/"]')
  return s ? new URL(s.src, location.href).pathname : null
}

/** The main script named in a page's HTML. */
export function buildIn(html: string): string | null {
  for (const m of html.matchAll(/<script\b[^>]*>/g)) {
    const tag = m[0]
    if (!/type="module"/.test(tag)) continue
    const src = /\bsrc="([^"]*assets\/[^"]+\.js)"/.exec(tag)?.[1]
    if (src) return new URL(src, location.href).pathname
  }
  return null
}

/** Which version the website is serving right now (null: offline or unknown). */
export async function latestBuild(): Promise<string | null> {
  try {
    const r = await fetch('/', { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'text/html' } })
    return r.ok ? buildIn(await r.text()) : null
  } catch {
    return null
  }
}

const RELOADED_AT = 'pm.updateReloadAt'
const RELOAD_TARGET = 'pm.updateTarget'
export const CHECK_EVERY_MS = 5 * 60_000
export const IDLE_MS = 3 * 60_000

export interface UpdateWatch {
  stop(): void
}

/**
 * Starts watching. `busy` says whether something is being written (then never an automatic reload); `tell` shows the note
 * with its Refresh button (called once per new version).
 */
export function watchForUpdates(o: { busy: () => boolean; tell: (refresh: () => void) => void; reload?: () => void }): UpdateWatch {
  const mine = currentBuild()
  if (!mine) return { stop() {} }
  const reload = o.reload ?? (() => window.location.reload())
  // The last automatic reload was for a version this page still is not: never reload to that one again by itself.
  let failedTarget: string | null = null
  try {
    const t = sessionStorage.getItem(RELOAD_TARGET)
    if (t && t !== mine) failedTarget = t
  } catch {
    /* no storage */
  }
  let newer: string | null = null
  const doReload = () => {
    try {
      sessionStorage.setItem(RELOADED_AT, String(Date.now()))
      if (newer) sessionStorage.setItem(RELOAD_TARGET, newer)
    } catch {
      /* private mode: still reload */
    }
    reload()
  }
  const reloadedRecently = () => {
    try {
      return Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < 10 * 60_000
    } catch {
      return false
    }
  }
  let told: string | null = null
  let lastInput = Date.now()
  let lastCheck = 0
  const settle = () => {
    if (!newer) return
    const idle = document.visibilityState === 'hidden' || Date.now() - lastInput >= IDLE_MS
    if (idle && !o.busy() && !reloadedRecently() && newer !== failedTarget) {
      doReload()
      return
    }
    if (told !== newer && document.visibilityState !== 'hidden') {
      told = newer
      o.tell(doReload)
    }
  }
  const check = async (force = false) => {
    if (!force && Date.now() - lastCheck < 60_000) {
      settle()
      return
    }
    lastCheck = Date.now()
    const latest = await latestBuild()
    if (latest && latest !== mine) newer = latest
    settle()
  }
  const onInput = () => {
    lastInput = Date.now()
  }
  const onBack = () => void check()
  const every = window.setInterval(() => void check(true), CHECK_EVERY_MS)
  const idleTick = window.setInterval(settle, 30_000)
  window.addEventListener('focus', onBack)
  document.addEventListener('visibilitychange', onBack)
  for (const ev of ['keydown', 'pointerdown', 'wheel'] as const) window.addEventListener(ev, onInput, { passive: true, capture: true })
  return {
    stop() {
      window.clearInterval(every)
      window.clearInterval(idleTick)
      window.removeEventListener('focus', onBack)
      document.removeEventListener('visibilitychange', onBack)
      for (const ev of ['keydown', 'pointerdown', 'wheel'] as const) window.removeEventListener(ev, onInput, { capture: true })
    },
  }
}
