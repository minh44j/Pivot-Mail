import { fetchGmailAccess } from '../auth'
import { b64urlToBytes } from './mime'
import type { GMessage } from './mime'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** Status used when the person's Pivot Mail sign-in has ended (the server said "session"). */
export const SESSION_ENDED = 440

export class GmailError extends Error {
  status: number
  /** Google's own reason word for the refusal (for example "rateLimitExceeded"), when it gave one */
  reason: string
  constructor(status: number, message: string, reason = '') {
    super(message)
    this.status = status
    this.reason = reason
  }
}

/** Google answers a refusal with a small JSON note; the reason word tells a busy-signal from a real "no". */
async function reasonOf(res: Response): Promise<string> {
  try {
    const j = (await res.clone().json()) as { error?: { errors?: { reason?: string }[]; status?: string; message?: string } }
    return j.error?.errors?.[0]?.reason ?? j.error?.status ?? ''
  } catch {
    return ''
  }
}

/** 403 reasons that only mean "too many requests right now": wait and try again, like a 429. */
const BUSY = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'RESOURCE_EXHAUSTED'])
/** 403 reasons that mean the saved permission is not enough (or was taken away): the person has to reconnect the mailbox. */
const NEEDS_RECONNECT = new Set(['insufficientPermissions', 'PERMISSION_DENIED', 'authError'])

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
    // 440: our own sign-in has ended (not Google's doing). 401: the mailbox permission was taken away. Anything else: try again later.
    if ('error' in r) throw new GmailError(r.error === 'reconnect' ? 401 : r.error === 'session' ? SESSION_ENDED : 503, r.error)
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

/* ---------- staying under Gmail's speed limit ---------- */

/**
 * Gmail lets each mailbox spend about 250 "quota units" a second (a moving average that allows short bursts); a message
 * costs 5, a send 100 (Google's published table). Above it Gmail answers "too many requests". Every request here first
 * spends from its mailbox's budget: 150 units a second (room for the desktop app and a browser tab open together) with a
 * burst of 500 (the newest 100 messages), so the first screen of mail still arrives at once and a big first sync then flows steadily under the
 * limit. When Gmail still says "slow down", the whole mailbox pauses (not each request on its own, which made it worse).
 */
export const RATE_UNITS_PER_SECOND = 150
export const BURST_UNITS = 500
const buckets = new Map<string, { tokens: number; at: number; pausedUntil: number }>()

function bucketOf(accountId: string) {
  let b = buckets.get(accountId)
  if (!b) {
    b = { tokens: BURST_UNITS, at: Date.now(), pausedUntil: 0 }
    buckets.set(accountId, b)
  }
  return b
}

/** Waits until this mailbox may spend `units` (a request's cost), then spends them. */
export async function spend(accountId: string, units: number): Promise<void> {
  const need = Math.max(1, Math.min(units, BURST_UNITS))
  for (;;) {
    const b = bucketOf(accountId)
    const now = Date.now()
    b.tokens = Math.min(BURST_UNITS, b.tokens + ((now - b.at) / 1000) * RATE_UNITS_PER_SECOND)
    b.at = now
    if (now < b.pausedUntil) {
      await wait(b.pausedUntil - now)
      continue
    }
    if (b.tokens >= need) {
      b.tokens -= need
      return
    }
    await wait(Math.ceil(((need - b.tokens) / RATE_UNITS_PER_SECOND) * 1000))
  }
}

/** Gmail said "slow down": this mailbox sends nothing for `ms`, and starts again with an empty budget. */
export function slowDown(accountId: string, ms: number): void {
  const b = bucketOf(accountId)
  b.pausedUntil = Math.max(b.pausedUntil, Date.now() + ms)
  b.tokens = 0
  b.at = Date.now()
}

/** Tests only: forget every mailbox's budget. */
export function resetBudgets(): void {
  buckets.clear()
}

/** What a request costs in Gmail's quota units (Gmail API usage-limits table). */
export function costOf(method: string, path: string): number {
  const p = path.replace(/\?.*$/, '')
  if (/\/messages\/send$/.test(p) || /\/upload\//.test(p) || p === '') return 100
  if (/\/messages\/batchModify$/.test(p)) return 50
  if (/\/threads\/[^/]+(\/modify|\/trash|\/untrash)?$/.test(p)) return 10
  if (/\/drafts/.test(p)) return method === 'PUT' ? 15 : method === 'GET' ? 5 : 10
  if (/\/labels/.test(p)) return method === 'GET' ? 1 : 5
  if (/\/history$/.test(p)) return 2
  if (/\/profile$/.test(p)) return 1
  return 5 // messages.list, messages.get, attachments.get
}

/** A request with the mailbox's key. One refresh on 401, and polite retries when Gmail asks us to slow down (429) or is busy (5xx). */
async function greq<T>(accountId: string, path: string, o: Req = {}): Promise<T> {
  const url = new URL(o.url ?? `${BASE}${path}`)
  for (const [k, v] of o.params ?? []) url.searchParams.append(k, v)
  const idempotent = o.idempotent ?? (o.method ?? 'GET') === 'GET'
  let refreshed = false
  const units = costOf(o.method ?? 'GET', o.url ? '' : path)
  for (let attempt = 0; ; attempt++) {
    await spend(accountId, units)
    const token = await accessToken(accountId, false)
    const headers: Record<string, string> = { authorization: `Bearer ${token}` }
    if (o.body !== undefined) headers['content-type'] = 'application/json'
    if (o.raw) headers['content-type'] = o.raw.type
    const payload = o.raw ? o.raw.data : o.body !== undefined ? JSON.stringify(o.body) : undefined
    // A small change (delete, move, read) must still reach Gmail if the tab is closed a moment later.
    const keepalive = (o.method ?? 'GET') !== 'GET' && typeof payload === 'string' && payload.length < 60_000
    const res = await fetch(url, { method: o.method ?? 'GET', headers, body: payload, keepalive })
    if (res.ok) {
      const text = await res.text()
      return (text ? JSON.parse(text) : {}) as T
    }
    if (res.status === 401 && !refreshed) {
      refreshed = true
      await accessToken(accountId, true)
      continue
    }
    const reason = res.status === 403 ? await reasonOf(res) : ''
    const busy = res.status === 429 || (res.status === 403 && BUSY.has(reason))
    const retryable = busy || (idempotent && res.status >= 500)
    if (retryable && attempt < 4) {
      const ra = Number(res.headers.get('retry-after'))
      if (busy) {
        // "Too many requests": the whole mailbox waits (1, 2, 4, 8 s), not just this request.
        slowDown(accountId, Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 1000 * 2 ** attempt)
      } else {
        // A Gmail server hiccup: quick retries (0.5, 1, 2, 4 s); after about 7 s a change the person made is put back and
        // explained, instead of leaving them waiting.
        await wait(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 500 * 2 ** attempt)
      }
      continue
    }
    // The saved permission is not enough: handled like an ended permission (the app offers "Reconnect").
    if (res.status === 403 && NEEDS_RECONNECT.has(reason)) throw new GmailError(401, `Gmail request failed (403 ${reason})`, reason)
    throw new GmailError(res.status, `Gmail request failed (${res.status}${reason ? ` ${reason}` : ''})`, reason)
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

/* ---------- many message headers in one request (Gmail batch) ---------- */

const BATCH_URL = 'https://gmail.googleapis.com/batch/gmail/v1'
/**
 * Messages per batch. Gmail runs a batch's requests side by side and starts refusing ("rate limit") at around 50 at once for one
 * person, so 20 per batch with two batches in flight stays under that.
 */
const BATCH_SIZE = 20
/** Set when Gmail says batching itself is not accepted here: this session then fetches one by one, as before. */
let batchUnavailable = false
/**
 * Batch requests that failed before reaching Gmail (network, a blocked address). Two in a row pause batching for 10 minutes
 * (one by one meanwhile), so a Wi-Fi change or a laptop waking up does not cost batching for the rest of a days-long session.
 */
let batchNetworkFailures = 0
let batchPausedUntil = 0

/** The body of a batch: one plain GET per message, numbered so the answers can be matched back. */
export function buildBatch(boundary: string, paths: string[]): string {
  return paths.map((p, i) => `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item${i}>\r\n\r\nGET ${p}\r\n\r\n`).join('') + `--${boundary}--\r\n`
}

/** Reads a batch answer: for each request (by its number) the status and the JSON body; null where Gmail gave no answer. */
export function parseBatch(contentType: string, text: string, count: number): ({ status: number; body: unknown } | null)[] {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  const boundary = m?.[1] ?? m?.[2]
  if (!boundary) throw new Error('batch answer without a boundary')
  const out: ({ status: number; body: unknown } | null)[] = new Array(count).fill(null)
  for (const part of text.split(`--${boundary}`)) {
    const id = /Content-ID:\s*<response-item(\d+)>/i.exec(part)
    const at = part.indexOf('HTTP/1.1 ')
    if (!id || at < 0) continue
    const i = Number(id[1])
    const inner = part.slice(at)
    const status = Number(inner.slice(9, 12))
    const sep = inner.search(/\r?\n\r?\n/)
    const raw = sep >= 0 ? inner.slice(sep).trim() : ''
    let body: unknown = null
    try {
      body = raw ? JSON.parse(raw) : null
    } catch {
      body = null
    }
    if (i >= 0 && i < count) out[i] = { status, body }
  }
  return out
}

/** Gmail's "slow down" answers (too many requests, rate limit, a busy server) and missing answers: worth another batch shortly. */
const isBusy = (x: { status: number; body: unknown } | null) => !x || x.status === 429 || x.status === 403 || x.status >= 500

/**
 * One batch request. Messages that are gone (404) are left out; `busy` ones (Gmail asked to slow down) can go in a later batch;
 * anything else that failed (`retry`) is fetched one by one, which also renews an expired sign-in.
 */
async function batchOnce(accountId: string, ids: string[]): Promise<{ ok: GMessage[]; busy: string[]; retry: string[] }> {
  const qs = new URLSearchParams(META).toString()
  const paths = ids.map((id) => `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?${qs}`)
  const boundary = `pm_batch_${Math.random().toString(36).slice(2)}`
  for (let attempt = 0; attempt < 2; attempt++) {
    await spend(accountId, 5 * ids.length)
    const token = await accessToken(accountId, attempt > 0)
    let res: Response
    try {
      res = await fetch(BATCH_URL, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/mixed; boundary=${boundary}` }, body: buildBatch(boundary, paths) })
    } catch (e) {
      // Never reached Gmail. Twice in a row: batching is blocked on this network, so stop paying for it.
      if (++batchNetworkFailures >= 2) {
        batchPausedUntil = Date.now() + 10 * 60_000
        batchNetworkFailures = 0
      }
      throw e
    }
    batchNetworkFailures = 0
    if (res.status === 401 && attempt === 0) continue
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      slowDown(accountId, 2000)
      return { ok: [], busy: ids, retry: [] } // slow down, then again
    }
    if (!res.ok) {
      // 400 / 404 / 405 / 415: Gmail does not accept batches from here; one by one from now on.
      if ([400, 404, 405, 415].includes(res.status)) batchUnavailable = true
      throw new Error(`batch ${res.status}`)
    }
    const parts = parseBatch(res.headers.get('content-type') ?? '', await res.text(), ids.length)
    if (parts.every((x) => x === null)) {
      batchUnavailable = true
      throw new Error('batch answer not understood')
    }
    const ok: GMessage[] = []
    const busy: string[] = []
    const retry: string[] = []
    parts.forEach((x, i) => {
      if (x && x.status === 200 && x.body) ok.push(x.body as GMessage)
      else if (x && x.status === 404) return
      else if (isBusy(x)) busy.push(ids[i] as string)
      else retry.push(ids[i] as string)
    })
    if (busy.length > 0) slowDown(accountId, 1000)
    return { ok, busy, retry }
  }
  throw new Error('batch not authorised')
}

async function metadataOneByOne(accountId: string, ids: string[]): Promise<GMessage[]> {
  const got = await pool(ids, 4, async (id) => {
    try {
      return await getMetadata(accountId, id)
    } catch (e) {
      if (e instanceof GmailError && e.status === 404) return null // deleted meanwhile
      throw e
    }
  })
  return got.filter((g): g is GMessage => g !== null)
}

/** A batch, and again (after 1 s, then 3 s) for any messages Gmail asked to slow down on; what is still left goes one by one. */
async function batchWithBackoff(accountId: string, ids: string[]): Promise<GMessage[]> {
  const ok: GMessage[] = []
  let todo = ids
  for (const pause of [0, 1000, 3000]) {
    if (todo.length === 0) return ok
    if (pause) await wait(pause)
    const r = await batchOnce(accountId, todo)
    ok.push(...r.ok)
    if (r.retry.length) ok.push(...(await metadataOneByOne(accountId, r.retry)))
    todo = r.busy
  }
  if (todo.length) ok.push(...(await metadataOneByOne(accountId, todo)))
  return ok
}

/**
 * Headers of many messages, fast: 20 per request (two requests in flight) instead of one request each. Falls back to one by one
 * if batching is not available. Messages deleted meanwhile are simply left out. Results keep the order of `ids`.
 */
export async function getMetadataMany(accountId: string, ids: string[]): Promise<GMessage[]> {
  if (ids.length === 0) return []
  if (batchUnavailable || Date.now() < batchPausedUntil || ids.length === 1) return metadataOneByOne(accountId, ids)
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += BATCH_SIZE) chunks.push(ids.slice(i, i + BATCH_SIZE))
  const parts = await pool(chunks, 2, async (chunk) => {
    try {
      return await batchWithBackoff(accountId, chunk)
    } catch (e) {
      if (e instanceof GmailError) throw e
      return metadataOneByOne(accountId, chunk)
    }
  })
  const byId = new Map(parts.flat().map((g) => [g.id, g]))
  return ids.map((id) => byId.get(id)).filter((g): g is GMessage => g !== undefined)
}

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

/**
 * Did a send that seemed to fail actually go through? Looks for our own Message-ID in the mailbox
 * (a few tries, because Gmail's search can take a moment to see a new message).
 */
export async function findSentByMessageId(accountId: string, messageId: string): Promise<{ id: string; threadId: string } | null> {
  for (let i = 0; i < 3; i++) {
    if (i > 0) await wait(2000)
    try {
      const r = await listMessageIds(accountId, { q: `rfc822msgid:${messageId}`, max: 1, includeSpamTrash: true })
      if (r.ids[0]) return r.ids[0]
    } catch {
      /* try again, then give up */
    }
  }
  return null
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

/* ---------- change tracking ---------- */

export interface GMsgRef {
  id: string
  threadId: string
  labelIds?: string[]
}

export interface GHistory {
  id: string
  messagesAdded?: { message: GMsgRef }[]
  messagesDeleted?: { message: GMsgRef }[]
  labelsAdded?: { message: GMsgRef; labelIds?: string[] }[]
  labelsRemoved?: { message: GMsgRef; labelIds?: string[] }[]
}

export const getProfile = (accountId: string) => gget<{ emailAddress: string; messagesTotal: number; threadsTotal: number; historyId: string }>(accountId, '/profile')

/** What changed since a history id. A 404 means the id is too old (Gmail keeps about a week) and everything must be re-read. */
export async function listHistory(accountId: string, startHistoryId: string, pageToken?: string): Promise<{ history?: GHistory[]; historyId?: string; nextPageToken?: string }> {
  const params: Params = [['startHistoryId', startHistoryId], ['maxResults', '500'], ...['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'].map((t): [string, string] => ['historyTypes', t])]
  if (pageToken) params.push(['pageToken', pageToken])
  return gget(accountId, '/history', params)
}

export const getLabel = (accountId: string, id: string) => gget<{ messagesUnread?: number; threadsUnread?: number }>(accountId, `/labels/${enc(id)}`)
