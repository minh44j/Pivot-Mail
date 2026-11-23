/** Turning Gmail API payloads into what the app shows. Pure functions, no network. */
import { looksUtf8 } from '../mojibake'

export interface GPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GPart[]
}

export interface GMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  sizeEstimate?: number
  payload?: GPart
}

export function b64urlToBytes(data: string): Uint8Array {
  const s = data.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Labels that mean "the old Western table": some senders put them on text that is really UTF-8. */
const WESTERN = /^(us-ascii|ascii|iso-8859-1|iso8859-1|latin1|l1|iso-8859-15|windows-1252|cp1252)$/

function decodeBytes(bytes: Uint8Array, charset?: string): string {
  const label = (charset ?? 'utf-8').toLowerCase().replace(/^"|"$/g, '')
  // Labelled Western but in fact UTF-8 (valid, with multi-byte characters): read as UTF-8. Read as labelled it showed
  // "youâ€™re" for "you’re" (2026-11-23). Real Western text with accents is almost never valid UTF-8, so this does not misfire.
  if (WESTERN.test(label) && looksUtf8(bytes)) return new TextDecoder('utf-8').decode(bytes)
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** RFC 2047 encoded words ("=?UTF-8?B?…?="), as found in Subject and display names. Text without them is returned unchanged. */
export function decodeWords(s: string): string {
  return s
    .replace(/(\?=)\s+(=\?)/g, '$1$2') // whitespace between two encoded words is dropped
    .replace(/=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset: string, enc: string, text: string) => {
      try {
        if (enc.toLowerCase() === 'b') return decodeBytes(b64urlToBytes(text.replace(/\+/g, '-').replace(/\//g, '_')), charset)
        const bytes: number[] = []
        const q = text.replace(/_/g, ' ')
        for (let i = 0; i < q.length; i++) {
          if (q[i] === '=' && /^[0-9a-fA-F]{2}$/.test(q.slice(i + 1, i + 3))) {
            bytes.push(parseInt(q.slice(i + 1, i + 3), 16))
            i += 2
          } else bytes.push(q.charCodeAt(i))
        }
        return decodeBytes(new Uint8Array(bytes), charset)
      } catch {
        return text
      }
    })
}

export interface Addr {
  name: string
  email: string
}

/** "Name <a@b.c>, other@d.e" to a list. Handles quoted names containing commas. */
export function parseAddresses(value: string | undefined): Addr[] {
  if (!value) return []
  const parts: string[] = []
  let cur = ''
  let quoted = false
  let angle = false
  for (const ch of value) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '<') angle = true
    else if (!quoted && ch === '>') angle = false
    if (ch === ',' && !quoted && !angle) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) parts.push(cur)
  const out: Addr[] = []
  for (const p of parts) {
    const t = p.trim()
    if (!t) continue
    const m = t.match(/^(.*?)<([^>]+)>\s*$/)
    if (m) {
      const email = (m[2] ?? '').trim().toLowerCase()
      const name = decodeWords((m[1] ?? '').trim().replace(/^"|"$/g, '').replace(/\\"/g, '"')).trim()
      out.push({ name: name || email, email })
    } else if (/^[^\s@]+@[^\s@]+$/.test(t)) out.push({ name: t.toLowerCase(), email: t.toLowerCase() })
  }
  return out
}

export const header = (p: GPart | undefined, name: string): string | undefined => p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value

function charsetOf(part: GPart): string | undefined {
  return header(part, 'content-type')?.match(/charset="?([^";\s]+)"?/i)?.[1]
}

export interface RealAttachment {
  attachmentId: string
  name: string
  mime: string
  size: number
}

/** An image placed inside the message body (referenced as cid:... in the HTML). */
export interface InlineImage {
  mime: string
  /** Small images arrive with the message; larger ones are fetched by attachment id */
  data?: string
  attachmentId?: string
}

export interface Bodies {
  text: string
  html: string
  attachments: RealAttachment[]
  inline: Record<string, InlineImage>
}

/** Walks the MIME tree: the readable bodies and the real attachments (not inline body parts). Depth-limited. */
export function extractBodies(payload: GPart | undefined): Bodies {
  const out: Bodies = { text: '', html: '', attachments: [], inline: {} }
  const all: { cid: string; att: RealAttachment }[] = []
  const walk = (p: GPart, depth: number): void => {
    if (depth > 12) return
    const mime = (p.mimeType ?? '').toLowerCase()
    const cid = (p.headers ?? []).find((h) => h.name.toLowerCase() === 'content-id')?.value.replace(/^\s*<|>\s*$/g, '').trim()
    if (cid && mime.startsWith('image/') && (p.body?.attachmentId || p.body?.data)) {
      out.inline[cid.toLowerCase()] = { mime, data: p.body.data, attachmentId: p.body.attachmentId }
      if (p.filename && p.body.attachmentId) all.push({ cid: cid.toLowerCase(), att: { attachmentId: p.body.attachmentId, name: decodeWords(p.filename), mime, size: p.body.size ?? 0 } })
      return
    }
    if (p.filename && p.body?.attachmentId) {
      out.attachments.push({ attachmentId: p.body.attachmentId, name: decodeWords(p.filename), mime: mime || 'application/octet-stream', size: p.body.size ?? 0 })
      return
    }
    if (p.parts) {
      // multipart/alternative: prefer the last readable alternative, which is the richest one
      for (const c of p.parts) walk(c, depth + 1)
      return
    }
    if (p.body?.data && (mime === 'text/plain' || mime === 'text/html')) {
      const s = decodeBytes(b64urlToBytes(p.body.data), charsetOf(p))
      if (mime === 'text/html') out.html += out.html ? `\n${s}` : s
      else out.text += out.text ? `\n${s}` : s
    }
  }
  if (payload) walk(payload, 0)
  // An image the message does not show in its body is still a file the person may want: keep it as an attachment.
  const shown = new Set([...out.html.matchAll(/cid:([^"'\s)>]+)/gi)].map((x) => (x[1] ?? '').toLowerCase()))
  for (const { cid, att } of all) if (!shown.has(cid)) out.attachments.push(att)
  for (const cid of Object.keys(out.inline)) if (!shown.has(cid)) delete out.inline[cid]
  return out
}

export type FolderKey = 'inbox' | 'sent' | 'drafts' | 'deleted' | 'archive' | 'spam'

/** Gmail has labels, the app has folders: INBOX wins, then draft, sent, trash; everything else is Archive. */
export function folderOf(labelIds: string[] | undefined): FolderKey {
  const l = labelIds ?? []
  if (l.includes('TRASH')) return 'deleted'
  if (l.includes('SPAM')) return 'spam'
  if (l.includes('DRAFT')) return 'drafts'
  if (l.includes('INBOX')) return 'inbox'
  if (l.includes('SENT')) return 'sent'
  return 'archive'
}

const SYSTEM_LABELS = new Set(['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM', 'UNREAD', 'STARRED', 'IMPORTANT', 'CHAT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'])
export const isUserLabel = (id: string): boolean => !SYSTEM_LABELS.has(id)
