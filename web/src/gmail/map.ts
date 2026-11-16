import type { Attachment, Message } from '../types'
import { decodeWords, extractBodies, folderOf, header, isUserLabel, parseAddresses } from './mime'
import type { GMessage } from './mime'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Gmail snippets arrive HTML-escaped. */
export function unescapeSnippet(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Plain text from HTML without a DOM (used when a message has only an HTML part). */
function htmlToText(html: string): string {
  return unescapeSnippet(
    html
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * One Gmail message (metadata or full format) as the app's Message.
 * `labelNames` maps Gmail label ids to names so custom labels can show as folders.
 */
export function toMessage(accountId: string, g: GMessage, labelNames: Record<string, string> = {}): Message | null {
  const folder = folderOf(g.labelIds)
  if (folder === 'spam') return null // Spam is never shown (Gmail keeps it for 30 days)
  const p = g.payload
  const from = parseAddresses(header(p, 'from'))[0] ?? { name: 'Unknown sender', email: '' }
  const labels = (g.labelIds ?? []).filter(isUserLabel).map((id) => labelNames[id]).filter((n): n is string => Boolean(n))
  const full = Boolean(p && (p.parts || p.body?.data))
  const bodies = full ? extractBodies(p) : null
  const attachments: Attachment[] = (bodies?.attachments ?? []).map((a, i) => ({
    id: `${g.id}-${i}`,
    name: a.name,
    size: a.size,
    mime: a.mime,
    source: { accountId, messageId: g.id, attachmentId: a.attachmentId },
  }))
  const plain = bodies ? bodies.text || (bodies.html ? htmlToText(bodies.html) : '') : unescapeSnippet(g.snippet ?? '')
  const ts = Number(g.internalDate)
  return {
    id: `${accountId}:${g.id}`,
    threadId: g.threadId,
    accountId,
    folder,
    labels,
    from,
    to: parseAddresses(header(p, 'to')),
    cc: parseAddresses(header(p, 'cc')),
    subject: decodeWords(header(p, 'subject') ?? '').trim() || '(no subject)',
    body: plain,
    html: bodies?.html || undefined,
    date: new Date(Number.isFinite(ts) ? ts : Date.now()).toISOString(),
    unread: (g.labelIds ?? []).includes('UNREAD'),
    flagged: (g.labelIds ?? []).includes('STARRED'),
    important: (g.labelIds ?? []).includes('IMPORTANT'),
    attachments,
    loaded: full,
  }
}
