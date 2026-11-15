import type { Message } from './types'

/**
 * Smart categories: optional one-click filters that cut across folders' content.
 * They are views over the current folder, not folders: nothing is moved or labelled.
 */
export type SmartKey = 'unread' | 'important' | 'followup' | 'attachments' | 'today'

export interface SmartDef {
  id: SmartKey
  label: string
  /** CSS custom property for the dot, from the icon tone palette */
  dot: string
  test: (m: Message, now: Date) => boolean
}

const sameDay = (iso: string, now: Date): boolean => {
  const d = new Date(iso)
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

export const SMART: SmartDef[] = [
  { id: 'unread', label: 'Unread', dot: '--ic-green', test: (m) => m.unread },
  { id: 'important', label: 'Important', dot: '--ic-red', test: (m) => Boolean(m.important) },
  { id: 'followup', label: 'Follow up', dot: '--ic-orange', test: (m) => m.flagged },
  { id: 'attachments', label: 'Attachments', dot: '--ic-purple', test: (m) => m.attachments.length > 0 },
  { id: 'today', label: 'Today', dot: '--ic-blue', test: (m, now) => sameDay(m.date, now) },
]

export function smartMatches(m: Message, active: ReadonlySet<SmartKey>, now: Date): boolean {
  for (const def of SMART) if (active.has(def.id) && !def.test(m, now)) return false
  return true
}
