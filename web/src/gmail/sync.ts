import type { Message } from '../types'
import { listMessageIds, getMetadataMany, GmailError, SESSION_ENDED } from './client'
import type { GLabel } from './client'
import { toMessage } from './map'

export interface ListQuery {
  labelIds?: string[]
  q?: string
  includeSpamTrash?: boolean
}

export type Target = { kind: 'folder'; id: string } | { kind: 'label'; id: string } | { kind: 'case'; id: string }

/** What to ask Gmail for each folder. Mail older than the window is reached by search, not by folder. */
export function queryFor(t: Target, windowDays: number, labels: GLabel[]): ListQuery | null {
  const win = `newer_than:${windowDays}d`
  if (t.kind === 'case') return { q: t.id, includeSpamTrash: false }
  if (t.kind === 'label') {
    const l = labels.find((x) => x.name === t.id)
    return l ? { labelIds: [l.id], q: win } : null
  }
  switch (t.id) {
    case 'inbox':
      return { labelIds: ['INBOX'], q: win }
    case 'sent':
      return { labelIds: ['SENT'], q: win }
    case 'drafts':
      return { labelIds: ['DRAFT'] }
    case 'deleted':
      return { labelIds: ['TRASH'], q: win, includeSpamTrash: true }
    case 'archive':
      return { q: `-in:inbox -in:sent -in:drafts -in:trash -in:spam ${win}` }
    default:
      return null // scheduled and snoozed do not exist in Gmail yet
  }
}

async function pageIds(accountId: string, query: ListQuery, cap: number, now = false): Promise<{ id: string; threadId: string }[]> {
  const out: { id: string; threadId: string }[] = []
  let token: string | undefined
  do {
    const page = await listMessageIds(accountId, { ...query, pageToken: token, max: Math.min(100, cap - out.length), now })
    out.push(...page.ids)
    token = page.next
  } while (token && out.length < cap)
  return out
}

/**
 * Brings one folder (or search) up to date. The list of ids is cheap; message headers are fetched only for ids not seen before,
 * plus the newest 100 so recent changes (read, starred, moved) show. Batches are reported as they arrive so the list fills in at once.
 * Interim approach: exact change tracking (Gmail history) replaces this later.
 */
export async function syncQuery(p: {
  accountId: string
  query: ListQuery
  known: Map<string, Message>
  labelNames: Record<string, string>
  cap?: number
  refreshNewest?: number
  isCancelled?: () => boolean
  onBatch: (msgs: Message[]) => void
  /**
   * Folder views only. Mail this device still lists in the folder but Gmail no longer does (deleted, archived or moved on
   * another device, or by an older version of the app) is looked up again, so it moves to where it really is or is dropped.
   * Skipped when the folder has more mail than the list can hold, because then absence proves nothing.
   */
  reconcile?: { folder: Message['folder']; windowDays: number }
  /** Messages that no longer exist (or are spam, which is never shown): remove them from the list and the local copy */
  onGone?: (ids: string[]) => void
  /** Every message the query matched (as "account:id"), including ones already known and therefore not fetched again */
  onIds?: (ids: string[]) => void
  /** Someone is waiting for this (a search): ahead of the background sync (client.ts spend) */
  now?: boolean
}): Promise<number> {
  const cap = p.cap ?? 500
  // The list and the "with attachments" list are asked for together (one wait instead of two).
  // (asked together; mail already on this computer is shown as soon as the main list answers, without waiting for the second)
  const attP = pageIds(p.accountId, { ...p.query, q: `${p.query.q ?? ''} has:attachment`.trim() }, cap, p.now)
  attP.catch(() => undefined)
  const ids = await pageIds(p.accountId, p.query, cap, p.now)
  if (p.isCancelled?.()) return 0
  p.onIds?.(ids.map((x) => `${p.accountId}:${x.id}`))
  const att = await attP
  if (p.isCancelled?.()) return 0
  const withAtt = new Set(att.map((x) => x.id))
  const refresh = p.refreshNewest ?? 100
  const need = ids.filter((x, i) => i < refresh || !p.known.has(`${p.accountId}:${x.id}`))
  // Headers arrive 40 at a time (two batched requests of 20): the list fills in batch by batch.
  for (let i = 0; i < need.length; i += 40) {
    if (p.isCancelled?.()) return i
    const chunk = need.slice(i, i + 40)
    const got = await getMetadataMany(p.accountId, chunk.map((x) => x.id), p.now)
    const msgs = got.map((g) => toMessage(p.accountId, g, p.labelNames)).filter((m): m is Message => m !== null)
    for (const m of msgs) m.hasAttachments = withAtt.has(m.id.split(':')[1] ?? '')
    p.onBatch(msgs)
  }

  if (p.reconcile && ids.length < cap && !p.isCancelled?.()) {
    const live = new Set(ids.map((x) => `${p.accountId}:${x.id}`))
    const since = p.reconcile.windowDays > 0 ? Date.now() - p.reconcile.windowDays * 86_400_000 : 0
    const stale = [...p.known.values()].filter((m) => m.accountId === p.accountId && m.folder === p.reconcile?.folder && !live.has(m.id) && Date.parse(m.date) >= since).slice(0, 60)
    const gone: string[] = []
    const fresh: Message[] = []
    let got: Awaited<ReturnType<typeof getMetadataMany>>
    try {
      got = await getMetadataMany(p.accountId, stale.map((m) => m.id.split(':')[1] ?? ''))
    } catch (e) {
      // A mailbox that must be reconnected, or a sign-in that ended, is reported now as usual.
      if (e instanceof GmailError && (e.status === 401 || e.status === SESSION_ENDED)) throw e
      // Otherwise the tidy-up check is optional: when Gmail is busy it waits for the next sync instead of failing this one
      // (nothing is removed).
      return ids.length
    }
    const back = new Map(got.map((g) => [`${p.accountId}:${g.id}`, g]))
    for (const m of stale) {
      const g = back.get(m.id)
      const next = g ? toMessage(p.accountId, g, p.labelNames) : null
      if (next) fresh.push(next)
      else gone.push(m.id) // deleted (not returned) or spam (never shown)
    }
    if (fresh.length > 0) p.onBatch(fresh)
    if (gone.length > 0) p.onGone?.(gone)
  }
  return ids.length
}

/** Combine fetched messages into what is already known, never replacing a fully loaded message with a header-only one. */
export function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return prev
  const byId = new Map(prev.map((m) => [m.id, m]))
  for (const m of incoming) {
    const old = byId.get(m.id)
    if (old?.loaded && !m.loaded) byId.set(m.id, { ...old, folder: m.folder, labels: m.labels, unread: m.unread, flagged: m.flagged, important: m.important, hasAttachments: m.hasAttachments ?? old.hasAttachments })
    else byId.set(m.id, m)
  }
  return [...byId.values()]
}
