/**
 * The Pivot Mail desktop app (Windows) runs this same web app in its own window and adds a few native abilities through a small,
 * fixed bridge (desktop/src/preload.ts). In a normal browser the bridge is absent and every caller falls back to the web behaviour.
 */
export interface DesktopFile {
  name: string
  mime: string
  bytes: Uint8Array
}

export interface DesktopBridge {
  version: string
  /** The unread number on the taskbar icon (0 clears it). */
  setBadge(count: number): void
  /** Drag files out of the app onto the desktop or into a folder (call from dragstart, after preventDefault). */
  startDrag(files: DesktopFile[]): void
}

export function desktop(): DesktopBridge | null {
  const w = window as unknown as { pivotDesktop?: DesktopBridge }
  return w.pivotDesktop && typeof w.pivotDesktop.startDrag === 'function' ? w.pivotDesktop : null
}
