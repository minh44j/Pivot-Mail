import { listMessageIds } from './gmail/client'
import type { DayStat, StaffMember } from './data/performance'
import { platform } from './platform'

/** Browser side of activity tracking (server: web/api/activity.ts). */

async function post(body: unknown): Promise<boolean> {
  try {
    const res = await fetch('/api/activity', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * One "active minute" a minute while the window is visible and the person has used the mouse or keyboard in the last two minutes.
 * An idle tab left open overnight records nothing.
 */
export function startHeartbeat(): () => void {
  let lastInput = Date.now()
  const touch = () => {
    lastInput = Date.now()
  }
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
  for (const e of events) window.addEventListener(e, touch, { passive: true })
  const beat = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastInput < 120_000) void post({ kind: 'heartbeat' })
  }
  beat()
  const t = window.setInterval(beat, 60_000)
  return () => {
    window.clearInterval(t)
    for (const e of events) window.removeEventListener(e, touch)
  }
}

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function countIds(accountId: string, q: string, cap = 1000): Promise<number> {
  let n = 0
  let token: string | undefined
  do {
    const page = await listMessageIds(accountId, { q, pageToken: token, max: 100 })
    n += page.ids.length
    token = page.next
  } while (token && n < cap)
  return Math.min(n, cap)
}

interface Saved {
  sent: number
  received: number
  at: number
}

/**
 * Counts the person's own sent and received mail per day straight from Gmail (today and the previous week) and reports the totals.
 * Finished days are measured once; today is refreshed every 20 minutes. Only counts are sent, never subjects or addresses.
 */
export async function reportMailStats(accountIds: string[]): Promise<void> {
  const now = new Date()
  const store: Record<string, Record<string, Saved>> = (() => {
    try {
      return JSON.parse(platform.storage.get('pm.stats') ?? '{}') as Record<string, Record<string, Saved>>
    } catch {
      return {}
    }
  })()
  const out: { accountId: string; day: string; sent: number; received: number }[] = []
  for (const id of accountIds) {
    for (let back = 0; back <= 7; back++) {
      const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
      const day = iso(d0)
      const saved = store[id]?.[day]
      if (saved && (back > 0 ? saved.at > d0.getTime() + 86_400_000 : Date.now() - saved.at < 20 * 60_000)) continue
      const a = Math.floor(d0.getTime() / 1000)
      const b = a + 86_400
      const sent = await countIds(id, `in:sent after:${a} before:${b}`)
      const received = await countIds(id, `-in:sent -in:drafts -in:trash -in:spam after:${a} before:${b}`)
      ;(store[id] ??= {})[day] = { sent, received, at: Date.now() }
      out.push({ accountId: id, day, sent, received })
    }
  }
  if (out.length === 0) return
  if (await post({ kind: 'stats', stats: out })) platform.storage.set('pm.stats', JSON.stringify(store))
}

interface ReportRow {
  user_id: string
  name: string
  email: string
  company: string
  day: string
  sent: number
  received: number
  cases: number
  active_min: number
  first_seen: string | null
  last_seen: string | null
}

const minutesOfDay = (iso: string | null): number | null => {
  if (!iso) return null
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** The administrator's report for the last 60 days, shaped for the performance page. */
export async function fetchPerformance(): Promise<{ staff: StaffMember[]; days: Map<string, DayStat[]> } | null> {
  const to = new Date()
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 59)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  try {
    const res = await fetch(`/api/activity?from=${iso(from)}&to=${iso(to)}&tz=${encodeURIComponent(tz)}`, { credentials: 'same-origin', headers: { accept: 'application/json' } })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return null
    const { rows } = (await res.json()) as { rows: ReportRow[] }
    const staff = new Map<string, StaffMember>()
    const days = new Map<string, DayStat[]>()
    for (const r of rows) {
      if (!staff.has(r.user_id)) staff.set(r.user_id, { id: r.user_id, name: r.name || r.email, role: r.company === 'tmc' ? 'Pivot Travel Management' : 'Pivot Shipping', vol: 1, start: 0, end: 0, active: 0 })
      const live = r.active_min > 0
      const list = days.get(r.user_id) ?? []
      list.push({ date: r.day, sent: r.sent, received: r.received, cases: r.cases, activeMin: r.active_min, firstOpen: live ? minutesOfDay(r.first_seen) : null, lastActive: live ? minutesOfDay(r.last_seen) : null })
      days.set(r.user_id, list)
    }
    return { staff: [...staff.values()], days }
  } catch {
    return null
  }
}
