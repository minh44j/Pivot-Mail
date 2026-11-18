/**
 * The only door between the Pivot Mail web app and Windows. Sandboxed, context-isolated, and deliberately tiny:
 * the page can ask for a taskbar number, start a file drag, use the local mail database, and (on the small sign-in window) start
 * a sign-in. Nothing else. The main process checks every call again (who is asking, and what).
 */
import { contextBridge, ipcRenderer } from 'electron'

/** The unread number drawn as a small red disc for the taskbar icon. */
function badgePng(n: number): string | null {
  if (n <= 0) return null
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const x = c.getContext('2d')
  if (!x) return null
  x.fillStyle = '#d92d20'
  x.beginPath()
  x.arc(16, 16, 15, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = '#ffffff'
  x.font = `bold ${n > 99 ? 13 : n > 9 ? 16 : 19}px Segoe UI, Arial, sans-serif`
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText(n > 99 ? '99+' : String(n), 16, 17)
  return c.toDataURL('image/png')
}

/** The sender's initials in a coloured circle, for the new-mail alert (Windows shows it beside the text). */
function avatarPng(name: string, email: string): string | null {
  const c = document.createElement('canvas')
  c.width = 96
  c.height = 96
  const x = c.getContext('2d')
  if (!x) return null
  const palette = ['#0072c6', '#0f8f7e', '#8a4fd8', '#c2410c', '#be185d', '#047857', '#4f46e5', '#b45309']
  let h = 0
  for (const ch of (email || name).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  x.fillStyle = palette[h % palette.length] as string
  x.beginPath()
  x.arc(48, 48, 48, 0, Math.PI * 2)
  x.fill()
  const words = (name || email).replace(/[<>"]/g, '').split(/[\s@._-]+/).filter(Boolean)
  const initials = ((words[0]?.[0] ?? '?') + (words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '')).toUpperCase()
  x.fillStyle = '#ffffff'
  x.font = `600 ${initials.length > 1 ? 38 : 44}px Segoe UI, Arial, sans-serif`
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText(initials, 48, 51)
  return c.toDataURL('image/png')
}

const call = (op: string, a?: unknown, b?: unknown): Promise<unknown> => ipcRenderer.invoke('pm:store', op, a, b)

contextBridge.exposeInMainWorld('pivotDesktop', {
  version: '0.9.0',
  store: {
    load: (accountId: string) => call('load', accountId),
    save: (msgs: unknown[]) => call('save', msgs),
    remove: (ids: string[]) => call('remove', ids),
    search: (accountIds: string[], query: string) => call('search', accountIds, query),
    thread: (accountId: string, threadId: string) => call('thread', accountId, threadId),
    getMeta: (key: string) => call('getMeta', key),
    setMeta: (key: string, value: string) => call('setMeta', key, value),
    clearAccount: (accountId: string) => call('clearAccount', accountId),
    clearAll: () => call('clearAll'),
  },
  setBadge(count: number) {
    const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    ipcRenderer.send('pm:badge', n, badgePng(n))
  },
  startDrag(files: { name: string; mime: string; bytes: Uint8Array }[]) {
    if (!Array.isArray(files)) return
    ipcRenderer.send(
      'pm:drag',
      files.map((f) => ({ name: String(f.name), bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(0) })),
    )
  },
  /** Put the files on the Windows clipboard (paste with Ctrl+V anywhere); resolves to how many were copied. */
  copyFiles(files: { name: string; mime: string; bytes: Uint8Array }[]): Promise<number> {
    if (!Array.isArray(files)) return Promise.resolve(0)
    return ipcRenderer.invoke(
      'pm:copy-files',
      files.map((f) => ({ name: String(f.name), bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(0) })),
    ) as Promise<number>
  },
  setTheme(theme: 'light' | 'dark') {
    ipcRenderer.send('pm:theme', theme === 'dark' ? 'dark' : 'light')
  },
  retry() {
    ipcRenderer.send('pm:retry')
  },
  /** A new-mail alert drawn by Windows; resolves to false when not available (the page then uses its own). */
  notifyMail(payload: Record<string, unknown>, who?: { name?: string; email?: string }): Promise<boolean> {
    const pic = who ? avatarPng(String(who.name ?? ''), String(who.email ?? '')) : null
    return ipcRenderer.invoke('pm:notify', payload, pic) as Promise<boolean>
  },
  /** Clicks on alerts and their buttons (open / read / inbox). */
  onMailAction(cb: (a: { action: string; accountId: string; messageId: string }) => void) {
    if (typeof cb !== 'function') return
    ipcRenderer.removeAllListeners('pm:mail-action')
    ipcRenderer.on('pm:mail-action', (_e, a: unknown) => {
      const x = (a ?? {}) as { action?: unknown; accountId?: unknown; messageId?: unknown }
      cb({ action: String(x.action ?? ''), accountId: String(x.accountId ?? ''), messageId: String(x.messageId ?? '') })
    })
    ipcRenderer.send('pm:actions-ready')
  },
  show() {
    ipcRenderer.send('pm:show')
  },
  // The small sign-in window (static/signin.html)
  signIn(company: 'scl' | 'tmc') {
    ipcRenderer.send('pm:signin', company)
  },
  signInReopen() {
    ipcRenderer.send('pm:signin-reopen')
  },
  signInBack() {
    ipcRenderer.send('pm:signin-back')
  },
  /** The sign-in window's page hears about the next step (waiting, finishing, an error) without reloading. */
  onSignInState(cb: (state: Record<string, string>) => void) {
    if (typeof cb !== 'function') return
    ipcRenderer.removeAllListeners('pm:signin-state')
    ipcRenderer.on('pm:signin-state', (_e, state: unknown) => cb(state && typeof state === 'object' ? { ...(state as Record<string, string>) } : {}))
  },
  // The Pivot Mail page found nobody signed in: the app switches to the small sign-in window.
  signedOut() {
    ipcRenderer.send('pm:signed-out')
  },
})
