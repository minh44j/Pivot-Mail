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

/** GET with the mailbox's key. One refresh on 401, and a few polite retries when Gmail asks us to slow down (429) or is busy (5xx). */
async function gget<T>(accountId: string, path: string, params: [string, string][] = []): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of params) url.searchParams.append(k, v)
  let refreshed = false
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken(accountId, false)
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    if (res.ok) return (await res.json()) as T
    if (res.status === 401 && !refreshed) {
      refreshed = true
      await accessToken(accountId, true)
      continue
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const ra = Number(res.headers.get('retry-after'))
      await wait(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 500 * 2 ** attempt)
      continue
    }
    throw new GmailError(res.status, `Gmail request failed (${res.status})`)
  }
}

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

const META: [string, string][] = [['format', 'metadata'], ...['From', 'To', 'Cc', 'Subject', 'Date'].map((h): [string, string] => ['metadataHeaders', h])]

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
