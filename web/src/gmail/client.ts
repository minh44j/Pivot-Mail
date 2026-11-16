import { fetchGmailAccess } from '../auth'
import { b64urlToBytes } from './mime'
import type { GMessage } from './mime'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

export class GmailError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** One-hour keys from our server, reused until a minute before they expire. */
const keys = new Map<string, { token: string; expiresAt: number }>()
const inflight = new Map<string, Promise<string>>()

async function accessToken(accountId: string, force = false): Promise<string> {
  const k = keys.get(accountId)
  if (!force && k && k.expiresAt > Date.now() + 60_000) return k.token
  const pending = inflight.get(accountId)
  if (pending) return pending
  const p = (async () => {
    const r = await fetchGmailAccess(accountId)
    if ('error' in r) throw new GmailError(r.error === 'reconnect' ? 401 : 503, r.error)
    keys.set(accountId, { token: r.accessToken, expiresAt: r.expiresAt })
    return r.accessToken
  })().finally(() => inflight.delete(accountId))
  inflight.set(accountId, p)
  return p
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Params = [string, string][]

interface Req {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  params?: Params
  /** JSON body */
  body?: unknown
  /** A raw body (message upload) with its content type */
  raw?: { type: string; data: string }
  /** false for sends: never repeat a request that may already have been processed (only 401 and 429 are safe to repeat) */
  idempotent?: boolean
  /** full address instead of the usual API base (media upload) */
  url?: string
}

/** A request with the mailbox's key. One refresh on 401, and a few polite retries when Gmail asks us to slow down (429) or is busy (5xx). */
async function greq<T>(accountId: string, path: string, o: Req = {}): Promise<T> {
  const url = new URL(o.url ?? `${BASE}${path}`)
  for (const [k, v] of o.params ?? []) url.searchParams.append(k, v)
  const idempotent = o.idempotent ?? (o.method ?? 'GET') === 'GET'
  let refreshed = false
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken(accountId, false)
    const headers: Record<string, string> = { authorization: `Bearer ${token}` }
    if (o.body !== undefined) headers['content-type'] = 'application/json'
    if (o.raw) headers['content-type'] = o.raw.type
    const res = await fetch(url, { method: o.method ?? 'GET', headers, body: o.raw ? o.raw.data : o.body !== undefined ? JSON.stringify(o.body) : undefined })
    if (res.ok) {
      const text = await res.text()
      return (text ? JSON.parse(text) : {}) as T
    }
    if (res.status === 401 && !refreshed) {
      refreshed = true
      await accessToken(accountId, true)
      continue
    }
    const retryable = res.status === 429 || (idempotent && res.status >= 500)
    if (retryable && attempt < 4) {
      const ra = Number(res.headers.get('retry-after'))
      await wait(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 500 * 2 ** attempt)
      continue
    }
    throw new GmailError(res.status, `Gmail request failed (${res.status})`)
  }
}

const gget = <T>(accountId: string, path: string, params: Params = []): Promise<T> => greq<T>(accountId, path, { params })

export interface GLabel {
  id: string
  name: string
  type?: string
}

export const listLabels = async (accountId: string): Promise<GLabel[]> => (await gget<{ labels?: GLabel[] }>(accountId, '/labels')).labels ?? []

export interface IdPage {
  ids: { id: string; threadId: string }[]
  next?: string
}

export async function listMessageIds(accountId: string, o: { labelIds?: string[]; q?: string; pageToken?: string; max?: number; includeSpamTrash?: boolean }): Promise<IdPage> {
  const params: [string, string][] = [['maxResults', String(o.max ?? 100)]]
  for (const l of o.labelIds ?? []) params.push(['labelIds', l])
  if (o.q) params.push(['q', o.q])
  if (o.pageToken) params.push(['pageToken', o.pageToken])
  if (o.includeSpamTrash) params.push(['includeSpamTrash', 'true'])
  const r = await gget<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(accountId, '/messages', params)
  return { ids: r.messages ?? [], next: r.nextPageToken }
}

const META: Params = [['format', 'metadata'], ...['From', 'To', 'Cc', 'Subject', 'Date'].map((h): [string, string] => ['metadataHeaders', h])]

export const getMetadata = (accountId: string, id: string): Promise<GMessage> => gget<GMessage>(accountId, `/messages/${encodeURIComponent(id)}`, META)

/** The whole conversation with bodies and attachment details. */
export async function getThreadFull(accountId: string, threadId: string): Promise<GMessage[]> {
  return (await gget<{ messages?: GMessage[] }>(accountId, `/threads/${encodeURIComponent(threadId)}`, [['format', 'full']])).messages ?? []
}

export async function getAttachmentBytes(accountId: string, messageId: string, attachmentId: string): Promise<Uint8Array> {
  const r = await gget<{ data?: string }>(accountId, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`)
  return b64urlToBytes(r.data ?? '')
}

/** Runs `fn` over `items` with at most `n` in flight (keeps us well inside Gmail's per-user rate limit). */
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const at = i++
        out[at] = await fn(items[at] as T)
      }
    }),
  )
  return out
}

/* ---------- writing ---------- */

const enc = encodeURIComponent

export const modifyThread = (accountId: string, threadId: string, add: string[], remove: string[]) =>
  greq(accountId, `/threads/${enc(threadId)}/modify`, { method: 'POST', body: { addLabelIds: add, removeLabelIds: remove }, idempotent: true })

export const trashThread = (accountId: string, threadId: string) => greq(accountId, `/threads/${enc(threadId)}/trash`, { method: 'POST', idempotent: true })
export const untrashThread = (accountId: string, threadId: string) => greq(accountId, `/threads/${enc(threadId)}/untrash`, { method: 'POST', idempotent: true })

/** Labels on specific messages (up to 1000 per call). */
export async function modifyMessages(accountId: string, ids: string[], add: string[], remove: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 1000) {
    await greq(accountId, '/messages/batchModify', { method: 'POST', body: { ids: ids.slice(i, i + 1000), addLabelIds: add, removeLabelIds: remove }, idempotent: true })
  }
}

export const createLabel = (accountId: string, name: string) =>
  greq<GLabel>(accountId, '/labels', { method: 'POST', body: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }, idempotent: false })
export const renameLabel = (accountId: string, id: string, name: string) => greq<GLabel>(accountId, `/labels/${enc(id)}`, { method: 'PATCH', body: { name }, idempotent: true })
export const deleteLabel = (accountId: string, id: string) => greq(accountId, `/labels/${enc(id)}`, { method: 'DELETE', idempotent: true })

export interface Sent {
  id: string
  threadId: string
  labelIds?: string[]
}

const MAX_JSON_RAW = 4 * 1024 * 1024

/** Sends a finished raw message (URL-safe base64). Larger ones use Gmail's upload endpoint. Never retried after a server error: it might already have gone out. */
export async function sendRaw(accountId: string, raw: string, threadId?: string): Promise<Sent> {
  if (raw.length <= MAX_JSON_RAW) return greq<Sent>(accountId, '/messages/send', { method: 'POST', body: { raw, ...(threadId ? { threadId } : {}) }, idempotent: false })
  const b = `pm${Math.random().toString(36).slice(2)}`
  const bytes = atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
  const data = [`--${b}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(threadId ? { threadId } : {}), `--${b}`, 'Content-Type: message/rfc822', '', bytes, `--${b}--`].join('\r\n')
  return greq<Sent>(accountId, '', { method: 'POST', url: 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart', raw: { type: `multipart/related; boundary=${b}`, data }, idempotent: false })
}

export interface GDraft {
  id: string
  message: { id: string; threadId: string }
}

export const listDrafts = async (accountId: string): Promise<GDraft[]> => (await gget<{ drafts?: GDraft[] }>(accountId, '/drafts', [['maxResults', '100']])).drafts ?? []
export const createDraft = (accountId: string, raw: string, threadId?: string) => greq<GDraft>(accountId, '/drafts', { method: 'POST', body: { message: { raw, ...(threadId ? { threadId } : {}) } }, idempotent: false })
export const updateDraft = (accountId: string, draftId: string, raw: string, threadId?: string) =>
  greq<GDraft>(accountId, `/drafts/${enc(draftId)}`, { method: 'PUT', body: { message: { raw, ...(threadId ? { threadId } : {}) } }, idempotent: true })
export const deleteDraft = (accountId: string, draftId: string) => greq(accountId, `/drafts/${enc(draftId)}`, { method: 'DELETE', idempotent: true })
