import { parseAddresses } from './mime'
import type { Addr } from './mime'

/**
 * Builds the raw email (RFC 5322 / MIME) that Gmail sends. Pure functions so every rule can be tested.
 * Everything that ends up in a header is cleaned of line breaks (no header injection), non-ASCII text is encoded
 * as RFC 2047 words, and bodies and files are base64 so the message stays plain ASCII with CRLF line ends.
 */

export interface OutAttachment {
  name: string
  mime: string
  bytes: Uint8Array
}

export interface OutInline {
  /** Content-ID without brackets, used in the HTML as cid:<cid> */
  cid: string
  mime: string
  bytes: Uint8Array
}

export interface OutMessage {
  from: Addr
  to: Addr[]
  cc: Addr[]
  bcc: Addr[]
  subject: string
  html: string
  text: string
  attachments: OutAttachment[]
  /** Images shown inside the body (the HTML refers to them as cid:...) */
  inline?: OutInline[]
  inReplyTo?: string
  references?: string
  date?: Date
  /** Our own Message-ID (without brackets), so a send that seemed to fail can be looked up before it is repeated */
  messageId?: string
  /** Marked High or Low importance (Outlook shows a red ! or a blue arrow; Gmail keeps the header) */
  importance?: 'high' | 'low'
}

const CRLF = '\r\n'

// oxlint-disable-next-line no-control-regex
const clean = (s: string): string => s.replace(/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').trim()
const isAscii = (s: string): boolean => /^[\x20-\x7e]*$/.test(s)

function b64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

/** Wrap base64 at 76 characters per line. */
const wrap64 = (s: string): string => (s.match(/.{1,76}/g) ?? []).join(CRLF)

/** RFC 2047 encoded words of at most 30 UTF-8 bytes each (short enough to leave room for the header name), split on character boundaries. */
export function encodeWord(s: string): string {
  const words: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of s) {
    const n = utf8(ch).length
    if (bytes + n > 30) {
      words.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  if (cur) words.push(cur)
  return words.map((w) => `=?UTF-8?B?${b64(utf8(w))}?=`).join(`${CRLF} `)
}

/** Header text: ASCII stays as it is (folded at spaces), anything else becomes encoded words. */
export function encodeHeaderText(raw: string): string {
  const s = clean(raw)
  if (!isAscii(s)) return encodeWord(s)
  if (s.length <= 70) return s
  const out: string[] = []
  let line = ''
  for (const w of s.split(' ')) {
    if (line && line.length + 1 + w.length > 70) {
      out.push(line)
      line = w
    } else line = line ? `${line} ${w}` : w
  }
  out.push(line)
  return out.join(`${CRLF} `)
}

export function formatAddress(a: Addr): string {
  const email = clean(a.email).replace(/[<>,;"\s]/g, '')
  const name = clean(a.name)
  if (!name || name === email) return email
  if (!isAscii(name)) return `${encodeWord(name)} <${email}>`
  return /^[A-Za-z0-9 !#$%&'*+\-/=?^_`{|}~]+$/.test(name) ? `${name} <${email}>` : `"${name.replace(/["\\]/g, '\\$&')}" <${email}>`
}

const list = (a: Addr[]): string => a.map(formatAddress).join(`,${CRLF} `)

/** "Name <a@b.c>, d@e.f" as typed or chipped in the composer. */
export const parseRecipients = (s: string): Addr[] => parseAddresses(s.replace(/;/g, ','))

const boundary = (): string => `pm_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`

/** Remove the composer's own markers before the HTML leaves the app. */
export function outgoingHtml(html: string): string {
  const body = html.replace(/\sdata-(?:sig|quote|pm-email)(?:="[^"]*")?/g, '').replace(/\scontenteditable="[^"]*"/g, '')
  return `<!doctype html><html><body>${body}</body></html>`
}

/**
 * Images pasted or quoted into the composer arrive as data: addresses, which Gmail and most mail apps do not
 * show. They are moved out of the HTML into real inline parts, and the HTML points to them as cid:...
 */
export function extractInlineImages(html: string): { html: string; images: OutInline[] } {
  const images: OutInline[] = []
  const out = html.replace(/(<img\b[^>]*?\ssrc\s*=\s*["'])data:image\/(png|jpe?g|gif|webp);base64,([a-z0-9+/=\s]+)(["'])/gi, (_all, pre: string, kind: string, data: string, q: string) => {
    let bin: string
    try {
      bin = atob(data.replace(/\s+/g, ''))
    } catch {
      return `${pre}${q}`
    }
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const cid = `pm-img-${images.length + 1}-${Math.random().toString(36).slice(2, 8)}@pivotmail`
    images.push({ cid, mime: `image/${kind.toLowerCase() === 'jpg' ? 'jpeg' : kind.toLowerCase()}`, bytes })
    return `${pre}cid:${cid}${q}`
  })
  return { html: out, images }
}

function part(type: string, body: string): string {
  return [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrap64(b64(utf8(body)))].join(CRLF)
}

export function buildMime(m: OutMessage): string {
  const headers: string[] = [
    `From: ${formatAddress(m.from)}`,
    ...(m.to.length ? [`To: ${list(m.to)}`] : []),
    ...(m.cc.length ? [`Cc: ${list(m.cc)}`] : []),
    ...(m.bcc.length ? [`Bcc: ${list(m.bcc)}`] : []),
    `Subject: ${encodeHeaderText(m.subject)}`,
    `Date: ${(m.date ?? new Date()).toUTCString().replace('GMT', '+0000')}`,
    'MIME-Version: 1.0',
  ]
  if (m.messageId) headers.push(`Message-ID: <${clean(m.messageId).replace(/[<>\s]/g, '')}>`)
  // Importance as Outlook, Apple Mail and Thunderbird read it (three headers, as Outlook itself writes them).
  if (m.importance === 'high') headers.push('Importance: High', 'X-Priority: 1 (Highest)', 'Priority: urgent')
  if (m.importance === 'low') headers.push('Importance: Low', 'X-Priority: 5 (Lowest)', 'Priority: non-urgent')
  if (m.inReplyTo) headers.push(`In-Reply-To: ${clean(m.inReplyTo)}`)
  if (m.references) headers.push(`References: ${clean(m.references).split(/\s+/).join(`${CRLF} `)}`)

  const altB = boundary()
  const inline = m.inline ?? []
  // With inline images the HTML and its pictures travel together in multipart/related.
  let htmlPart = part('text/html', m.html)
  if (inline.length > 0) {
    const relB = boundary()
    const pics = inline.map((i) =>
      [`--${relB}`, `Content-Type: ${clean(i.mime)}`, 'Content-Transfer-Encoding: base64', `Content-ID: <${clean(i.cid)}>`, 'Content-Disposition: inline', '', wrap64(b64(i.bytes))].join(CRLF),
    )
    htmlPart = [`Content-Type: multipart/related; boundary="${relB}"`, '', `--${relB}`, part('text/html', m.html), ...pics, `--${relB}--`].join(CRLF)
  }
  const alternative = [`--${altB}`, part('text/plain', m.text), `--${altB}`, htmlPart, `--${altB}--`].join(CRLF)

  if (m.attachments.length === 0) return [...headers, `Content-Type: multipart/alternative; boundary="${altB}"`, '', alternative, ''].join(CRLF)

  const mixB = boundary()
  const files = m.attachments.map((a) => {
    const ascii = clean(a.name).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'file'
    const star = encodeURIComponent(clean(a.name)).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    return [
      `--${mixB}`,
      `Content-Type: ${clean(a.mime) || 'application/octet-stream'}; name="${ascii}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${ascii}"; filename*=UTF-8''${star}`,
      '',
      wrap64(b64(a.bytes)),
    ].join(CRLF)
  })
  return [...headers, `Content-Type: multipart/mixed; boundary="${mixB}"`, '', `--${mixB}`, `Content-Type: multipart/alternative; boundary="${altB}"`, '', alternative, '', ...files.flatMap((f) => [f, '']), `--${mixB}--`, ''].join(CRLF)
}

/** The form Gmail's API wants: URL-safe base64 of the whole message. */
export function toRaw(mime: string): string {
  return b64(utf8(mime)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const rawSize = (raw: string): number => Math.ceil((raw.length * 3) / 4)
