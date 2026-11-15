import type { Message } from './types'

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function groupLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return 'Earlier this week'
  if (diffDays < 14) return 'Last week'
  return 'Older'
}

export function formatListTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (diffDays <= 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface ParsedQuery {
  terms: string[]
  from?: string
  to?: string
  subject?: string
  label?: string
  hasAttachment?: boolean
  isUnread?: boolean
  isFlagged?: boolean
}

/** Gmail-style operators: from: to: subject: label: has:attachment is:unread is:flagged */
export function parseQuery(q: string): ParsedQuery {
  const parsed: ParsedQuery = { terms: [] }
  for (const token of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    const idx = token.indexOf(':')
    if (idx > 0) {
      const key = token.slice(0, idx)
      const val = token.slice(idx + 1)
      if (key === 'from' && val) parsed.from = val
      else if (key === 'to' && val) parsed.to = val
      else if (key === 'subject' && val) parsed.subject = val
      else if (key === 'label' && val) parsed.label = val
      else if (key === 'has' && val === 'attachment') parsed.hasAttachment = true
      else if (key === 'is' && val === 'unread') parsed.isUnread = true
      else if ((key === 'is' && val === 'flagged') || (key === 'is' && val === 'starred')) parsed.isFlagged = true
      else parsed.terms.push(token)
    } else {
      parsed.terms.push(token)
    }
  }
  return parsed
}

export function matchesQuery(m: Message, p: ParsedQuery): boolean {
  if (p.from && !`${m.from.name} ${m.from.email}`.toLowerCase().includes(p.from)) return false
  if (p.to && !m.to.some((t) => `${t.name} ${t.email}`.toLowerCase().includes(p.to as string))) return false
  if (p.subject && !m.subject.toLowerCase().includes(p.subject)) return false
  if (p.label && !m.labels.some((l) => l.toLowerCase() === p.label)) return false
  if (p.hasAttachment && m.attachments.length === 0) return false
  if (p.isUnread && !m.unread) return false
  if (p.isFlagged && !m.flagged) return false
  if (p.terms.length > 0) {
    const hay = `${m.from.name} ${m.from.email} ${m.subject} ${m.body} ${m.attachments.map((a) => a.name).join(' ')}`.toLowerCase()
    return p.terms.every((t) => hay.includes(t))
  }
  return true
}
