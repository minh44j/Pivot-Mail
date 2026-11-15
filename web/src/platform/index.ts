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

/** Create a downloadable blob URL for a mock/real attachment. */
function fileUrl(name: string, content: string, mime: string): string {
  void name
  return URL.createObjectURL(new Blob([content], { type: mime }))
}

export const platform = { storage, copyText, setBadge, notificationState, requestNotifications, notify, fileUrl }
