/**
 * The Pivot Mail desktop app (Windows) runs this same web app in its own window and adds a few native abilities through a small,
 * fixed bridge (desktop/src/preload.ts). In a normal browser the bridge is absent and every caller falls back to the web behaviour.
 */
export interface DesktopFile {
  name: string
  mime: string
  bytes: Uint8Array
}

/** The desktop app's local mail database (SQLite on this computer): far larger than the browser copy, with instant word search. */
export interface DesktopStore {
  load(accountId: string): Promise<unknown>
  save(msgs: unknown[]): Promise<unknown>
  remove(ids: string[]): Promise<unknown>
  /** Messages of these mailboxes whose subject, people, preview, attachment names or body contain every word (as word beginnings). */
  search(accountIds: string[], query: string): Promise<unknown>
  /** Every stored message of one conversation, complete. */
  thread?(accountId: string, threadId: string): Promise<unknown>
  getMeta(key: string): Promise<unknown>
  setMeta(key: string, value: string): Promise<unknown>
  clearAccount(accountId: string): Promise<unknown>
  clearAll(): Promise<unknown>
}

export interface DesktopBridge {
  version: string
  /** Present from desktop version 0.2.0. */
  store?: DesktopStore
  /** The unread number on the taskbar icon (0 clears it). */
  setBadge(count: number): void
  /** Drag files out of the app onto the desktop or into a folder (call from dragstart, after preventDefault). */
  startDrag(files: DesktopFile[]): void
  /** Put real files on the Windows clipboard (Ctrl+V pastes them anywhere); resolves to how many were copied. From 0.4.0. */
  copyFiles?(files: DesktopFile[]): Promise<number>
  /** Bring the window to the front, also when it is hidden in the tray (present from desktop version 0.2.0). */
  show?(): void
}

export function desktop(): DesktopBridge | null {
  const w = window as unknown as { pivotDesktop?: DesktopBridge }
  return w.pivotDesktop && typeof w.pivotDesktop.startDrag === 'function' ? w.pivotDesktop : null
}

/** The local mail database, when running in a desktop app that has one. */
export function desktopStore(): DesktopStore | null {
  const s = desktop()?.store
  return s && typeof s.search === 'function' ? s : null
}
