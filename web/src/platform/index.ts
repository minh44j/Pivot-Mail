/**
 * Platform boundary. Everything browser-specific lives here so the desktop
 * wrapper (Tauri/Electron) can swap implementations later. UI code must not
 * touch localStorage, Notification, clipboard or document.title directly.
 */

export interface KeyValueStore {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

const memory = new Map<string, string>()

const storage: KeyValueStore = {
  get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return memory.get(key) ?? null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      memory.set(key, value)
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      memory.delete(key)
    }
  },
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function setBadge(unread: number): void {
  document.title = unread > 0 ? `(${unread}) Pivot Mail` : 'Pivot Mail'
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (unread > 0) void nav.setAppBadge?.(unread)
    else void nav.clearAppBadge?.()
  } catch {
    /* badge API unsupported */
  }
}

function notificationState(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.requestPermission()
}

function notify(title: string, body: string): void {
  if (notificationState() !== 'granted') return
  try {
    new Notification(title, { body })
  } catch {
    /* ignored */
  }
}

/** Copy HTML and plain text together, so rich apps get formatting and plain fields get text. */
async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    const CI = (window as unknown as { ClipboardItem?: new (items: Record<string, Blob>) => ClipboardItem }).ClipboardItem
    if (CI) {
      await navigator.clipboard.write([new CI({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })])
      return true
    }
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyText(text)
  }
}

/** Save a file to the user's downloads. */
function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Put a file on the clipboard. Browsers only allow a few types (PNG images), so most files
 * return 'unsupported' and the caller falls back to copying the name. The desktop wrapper can do real file copy.
 */
async function copyBlob(blob: Blob): Promise<'copied' | 'unsupported' | 'blocked'> {
  const CI = (window as unknown as { ClipboardItem?: { new (items: Record<string, Blob>): ClipboardItem; supports?: (type: string) => boolean } }).ClipboardItem
  if (!CI) return 'unsupported'
  const supported = CI.supports ? CI.supports(blob.type) : blob.type === 'image/png'
  if (!supported) return 'unsupported'
  try {
    await navigator.clipboard.write([new CI({ [blob.type]: blob })])
    return 'copied'
  } catch {
    return 'blocked'
  }
}

/** Print a document (also the way to Save as PDF). The desktop wrapper can use a native print call instead. */
function printHtml(html: string): void {
  const f = document.createElement('iframe')
  f.setAttribute('aria-hidden', 'true')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  f.srcdoc = html
  f.onload = () => {
    f.contentWindow?.focus()
    f.contentWindow?.print()
    window.setTimeout(() => f.remove(), 60_000)
  }
  document.body.appendChild(f)
}

/** Open a read-only document in a separate window. Returns false when the browser blocked the popup. */
function openWindow(html: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const w = window.open(url, '_blank', 'popup=yes,width=900,height=760')
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
  return w !== null
}

import { cache } from './cache'

export const platform = { cache, printHtml, openWindow, storage, copyText, setBadge, notificationState, requestNotifications, notify, saveBlob, copyBlob, copyRich }
