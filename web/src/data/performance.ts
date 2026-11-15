/**
 * SAMPLE performance data (fictional staff, generated deterministically in the browser).
 * Real figures come from Gmail metadata (sent/received), the case database (cases opened)
 * and activity events (use time, first open, last activity). None of that exists yet.
 */

export interface StaffMember {
  id: string
  name: string
  role: string
  /** volume multiplier, typical first open and last activity (minutes after midnight), typical active minutes */
  vol: number
  start: number
  end: number
  active: number
}

export interface DayStat {
  date: string // YYYY-MM-DD, local
  sent: number
  received: number
  cases: number
  activeMin: number
  firstOpen: number | null // minutes after midnight
  lastActive: number | null
}

export const STAFF: StaffMember[] = [
  { id: 's1', name: 'Amir Khan', role: 'Sales · Shipping', vol: 1.4, start: 8 * 60 + 20, end: 17 * 60 + 50, active: 6.2 * 60 },
  { id: 's2', name: 'Bina Rao', role: 'Operations · Shipping', vol: 1.2, start: 7 * 60 + 50, end: 17 * 60 + 20, active: 6.8 * 60 },
  { id: 's3', name: 'Carlos Mendes', role: 'Documentation · Shipping', vol: 0.9, start: 8 * 60 + 40, end: 17 * 60 + 40, active: 5.9 * 60 },
  { id: 's4', name: 'Dana Wu', role: 'Ticketing · Travel', vol: 1.6, start: 8 * 60 + 5, end: 18 * 60 + 10, active: 7.1 * 60 },
  { id: 's5', name: 'Elif Demir', role: 'Ticketing · Travel', vol: 1.3, start: 8 * 60 + 30, end: 17 * 60 + 30, active: 6.4 * 60 },
  { id: 's6', name: 'Farid Nasser', role: 'Sales · Shipping', vol: 1.0, start: 9 * 60 + 10, end: 18 * 60 + 25, active: 5.3 * 60 },
  { id: 's7', name: 'Gita Menon', role: 'Accounts · Shared', vol: 0.7, start: 8 * 60 + 45, end: 17 * 60 + 5, active: 5.6 * 60 },
  { id: 's8', name: 'Hugo Lang', role: 'Customer service · Travel', vol: 1.1, start: 7 * 60 + 40, end: 16 * 60 + 55, active: 6.6 * 60 },
  { id: 's9', name: 'Imani Ochieng', role: 'Operations · Shipping', vol: 0.8, start: 9 * 60 + 25, end: 17 * 60 + 15, active: 4.9 * 60 },
  { id: 's10', name: 'Jonas Berg', role: 'Sales · Travel', vol: 1.05, start: 8 * 60 + 15, end: 18 * 60 + 40, active: 6.0 * 60 },
]

function hash(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Last `n` calendar days ending today, oldest first. */
export function buildDays(staff: StaffMember, n: number, now: Date = new Date()): DayStat[] {
  const out: DayStat[] = []
  const nowMin = now.getHours() * 60 + now.getMinutes()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const r = rng(hash(`${staff.id}:${iso(d)}`))
    const weekend = d.getDay() === 0 || d.getDay() === 6 // ⚠️ weekend days to be confirmed
    const worked = weekend ? r() < 0.08 : r() < 0.95
    if (!worked) {
      out.push({ date: iso(d), sent: 0, received: 0, cases: 0, activeMin: 0, firstOpen: null, lastActive: null })
      continue
    }
    const isToday = i === 0
    const scale = isToday ? 0.55 : 1
    const first = Math.round(staff.start + (r() - 0.5) * 50)
    let last: number | null = Math.round(staff.end + (r() - 0.5) * 70)
    let firstOpen: number | null = first
    if (isToday) {
      if (nowMin < first) {
        firstOpen = null
        last = null
      } else last = Math.min(last, nowMin)
    }
    if (firstOpen === null || last === null) {
      out.push({ date: iso(d), sent: 0, received: 0, cases: 0, activeMin: 0, firstOpen: null, lastActive: null })
      continue
    }
    const span = Math.max(0, last - firstOpen)
    const activeMin = Math.min(span, Math.round((staff.active + (r() - 0.5) * 90) * scale))
    out.push({
      date: iso(d),
      sent: Math.round((14 + r() * 22) * staff.vol * scale),
      received: Math.round((38 + r() * 46) * staff.vol * scale),
      cases: Math.round(r() * 4 * staff.vol * scale),
      activeMin,
      firstOpen,
      lastActive: last,
    })
  }
  return out
}

export interface Aggregate {
  sent: number
  received: number
  cases: number
  activeDays: number
  avgActiveMin: number
  avgFirst: number | null
  avgLast: number | null
}

const avg = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

export function aggregate(days: DayStat[]): Aggregate {
  const active = days.filter((d) => d.firstOpen !== null)
  return {
    sent: days.reduce((a, d) => a + d.sent, 0),
    received: days.reduce((a, d) => a + d.received, 0),
    cases: days.reduce((a, d) => a + d.cases, 0),
    activeDays: active.length,
    avgActiveMin: avg(active.map((d) => d.activeMin)) ?? 0,
    avgFirst: avg(active.map((d) => d.firstOpen as number)),
    avgLast: avg(active.map((d) => d.lastActive as number)),
  }
}

export function fmtDuration(min: number): string {
  if (min <= 0) return '–'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

export function fmtClock(min: number | null): string {
  if (min === null) return '–'
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** CSV cell: quote, and defuse spreadsheet formulas. */
export function csvCell(v: string | number): string {
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
