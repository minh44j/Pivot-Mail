/**
 * The only door between the Pivot Mail web app and Windows. Sandboxed, context-isolated, and deliberately tiny:
 * the page can ask for a taskbar number, start a file drag, use the local mail database, and (on the first-run screen) pick the
 * company. Nothing else. The main process checks every call again (who is asking, and what).
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

const call = (op: string, a?: unknown, b?: unknown): Promise<unknown> => ipcRenderer.invoke('pm:store', op, a, b)

contextBridge.exposeInMainWorld('pivotDesktop', {
  version: '0.4.0',
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
  show() {
    ipcRenderer.send('pm:show')
  },
  chooseCompany(company: 'scl' | 'tmc') {
    ipcRenderer.send('pm:choose-company', company)
  },
})
