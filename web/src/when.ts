export type WhenMode = 'snooze' | 'followup' | 'send'

interface Preset {
  key: string
  label: string
  at: Date
}

export const at = (d: Date, h: number, m = 0): Date => {
  const x = new Date(d)
  x.setHours(h, m, 0, 0)
  return x
}
export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Quick choices from the current time. Weekend and next-week presets skip dates that make no sense today. */
export function whenPresets(now: Date, mode: WhenMode): Preset[] {
  const out: Preset[] = []
  const day = now.getDay() // 0 Sun .. 6 Sat
  if (mode === 'followup') out.push({ key: 'today', label: 'Today', at: at(now, 17) })
  else if (now.getHours() < 15) out.push({ key: 'later', label: 'Later today', at: at(now, 17) })
  out.push({ key: 'tomorrow', label: 'Tomorrow', at: at(addDays(now, 1), 8) })
  if (mode === 'followup' && day >= 1 && day <= 4) out.push({ key: 'week', label: 'This week', at: at(addDays(now, 5 - day), 17) })
  if (mode !== 'followup' && day >= 1 && day <= 4) out.push({ key: 'weekend', label: 'This weekend', at: at(addDays(now, 6 - day), 8) })
  out.push({ key: 'next', label: 'Next week', at: at(addDays(now, ((8 - day) % 7) || 7), 8) })
  return out
}

export const fmtWhen = (iso: string): string => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

